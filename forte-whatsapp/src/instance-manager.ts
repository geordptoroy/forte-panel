import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import makeWASocket, {
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type AnyMessageContent,
  type MessageUpsertType,
  type WAMessage,
  type WASocket,
} from "baileys";
import { config } from "./config.js";
import { useEncryptedAuthState } from "./encrypted-auth-state.js";
import { logger } from "./logger.js";
import {
  DEFAULT_BAILEYS_INSTANCE_SETTINGS,
  isGroupJid,
  shouldIgnoreInboundJid,
  shouldRejectIncomingCall,
  type BaileysInstanceSettings,
} from "./instance-settings.js";
import { acquireSessionLock, type SessionLock } from "./session-lock.js";
import {
  clearUnregisteredPairingCredentials,
  getBaileysBrowser,
  getStatusAfterSocketClose,
  requestPairingCodeWhenReady,
  shouldUseRemoteLogout,
} from "./pairing-code.js";
import { reconnectDelayMs } from "./reconnect-policy.js";
import { normalizeBaileysMessageStatus, type DeliveryStatus } from "./delivery-status.js";
import { isAllowedOutboundMediaUrl } from "./media-reference.js";
import { SendLedger, stableFingerprint } from "./send-ledger.js";
import { WebhookOutbox } from "./webhook-outbox.js";
import { buildNativeInteractivePayload } from "./interactive-payload.js";
import {
  normalizeBaileysMessage,
  normalizeBaileysOutgoingMessage,
  PanelMessageEchoTracker,
  shouldForwardLiveUpsert,
} from "./message-normalization.js";

function instanceScopedEventId(instanceId: string, sourceId: string) {
  return `baileys-${crypto
    .createHash("sha256")
    .update(`${instanceId}\0${sourceId}`)
    .digest("hex")}`;
}

function isNativeInteractivePayload(payload: AnyMessageContent) {
  const record = payload as Record<string, unknown>;
  const viewOnce = record.viewOnceMessage;
  if (viewOnce && typeof viewOnce === "object") {
    const message = (viewOnce as Record<string, unknown>).message;
    return Boolean(
      message &&
        typeof message === "object" &&
        "interactiveMessage" in (message as Record<string, unknown>)
    );
  }
  return "interactiveMessage" in record;
}

export type InstanceStatus =
  | "idle"
  | "connecting"
  | "qr"
  | "pairing"
  | "connected"
  | "disconnected"
  | "logged_out"
  | "error";
export type InstanceSnapshot = {
  instanceId: string;
  instanceName: string;
  status: InstanceStatus;
  phone?: string;
  qr?: string;
  lastError?: string;
  settings: BaileysInstanceSettings;
  webhookOutboxPending?: number;
  webhookOutboxDeadLetter?: number;
  webhookLastError?: string;
  updatedAt: string;
};

export type InstanceProfile = {
  phoneNumber: string | null;
  pushName: string | null;
  profilePictureUrl: string | null;
};

export class InstanceManager {
  private socket?: WASocket;
  private snapshot: InstanceSnapshot;
  private starting = false;
  private sessionLock?: SessionLock;
  private suppressReconnectUntil = 0;
  private pairingAwaitingAcceptance = false;
  private pairingAcceptedRestartPending = false;
  private pairingRequestInProgress = false;
  private pairingCleanup?: Promise<void>;
  private credsSaveQueue: Promise<void> = Promise.resolve();
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private reconnectAttempts = 0;
  private readonly webhookOutbox: WebhookOutbox;
  private readonly sendLedger: SendLedger;
  private readonly panelMessageEchoes = new PanelMessageEchoTracker();
  private readonly pendingDeliveryUpdates = new Map<
    string,
    { status: DeliveryStatus; expiresAt: number }
  >();
  private readonly groupSubjectCache = new Map<
    string,
    { subject: string; expiresAt: number }
  >();
  private settings: BaileysInstanceSettings;

  constructor(
    private readonly instanceId = config.instanceId,
    private instanceName = instanceId === config.instanceId
      ? config.instanceName
      : `WhatsApp · ${instanceId}`,
    settings: BaileysInstanceSettings = DEFAULT_BAILEYS_INSTANCE_SETTINGS
  ) {
    this.settings = { ...settings };
    this.snapshot = {
      instanceId,
      instanceName,
      status: "idle",
      settings: { ...this.settings },
      updatedAt: new Date().toISOString(),
    };
    this.webhookOutbox = new WebhookOutbox({
      directory:
        instanceId === config.instanceId
          ? config.webhookOutboxDir
          : path.join(config.webhookOutboxDir, instanceId),
      url: config.webhookUrl,
      secret: config.webhookSecret,
      maxAttempts: config.webhookMaxAttempts,
      initialBackoffMs: config.webhookInitialBackoffMs,
      maxBackoffMs: config.webhookMaxBackoffMs,
      logger,
    });
    this.sendLedger = new SendLedger(
      path.join(config.sessionDir, instanceId, "send-ledger")
    );
  }

  getStatus(): InstanceSnapshot {
    const outbox = this.webhookOutbox.getStatus();
    return {
      ...this.snapshot,
      webhookOutboxPending: outbox.pending,
      webhookOutboxDeadLetter: outbox.deadLetter,
      webhookLastError: outbox.lastError,
    };
  }

  rotateWebhookSecret(secret: string) {
    this.webhookOutbox.setSecret(secret);
    return this.getStatus();
  }

  async getProfile(): Promise<InstanceProfile> {
    const user = this.socket?.user;
    const phoneNumber = user?.id?.split(":")[0] ?? this.snapshot.phone ?? null;
    if (!user?.id || !this.socket || this.snapshot.status !== "connected")
      return {
        phoneNumber,
        pushName: user?.name ?? null,
        profilePictureUrl: null,
      };

    let profilePictureUrl: string | null = null;
    try {
      profilePictureUrl =
        (await this.socket.profilePictureUrl(user.id, "image")) ?? null;
    } catch {
      profilePictureUrl = null;
    }
    return {
      phoneNumber,
      pushName: user.name ?? null,
      profilePictureUrl,
    };
  }

  setName(name: string) {
    this.instanceName = name;
    this.set({ instanceName: name });
  }

  setSettings(settings: BaileysInstanceSettings) {
    this.settings = { ...settings };
    this.set({ settings: { ...this.settings } });
  }

  async start(): Promise<void> {
    if (this.snapshot.status === "connected") return;
    if (this.starting) {
      while (this.starting)
        await new Promise<void>(resolve => setTimeout(resolve, 25));
      if (this.socket) return;
    }
    if (this.socket) return;
    this.starting = true;
    this.set({ status: "connecting", qr: undefined, lastError: undefined });
    try {
      await this.credsSaveQueue;
      await this.webhookOutbox.start();
      const sessionPath = path.join(config.sessionDir, this.instanceId);
      await fs.mkdir(sessionPath, { recursive: true });
      this.sessionLock ??= await acquireSessionLock(sessionPath);
      const { state, saveCreds } = config.sessionEncryptionKey
        ? await useEncryptedAuthState(sessionPath, config.sessionEncryptionKey)
        : await useMultiFileAuthState(sessionPath);
      if (clearUnregisteredPairingCredentials(state.creds)) {
        await saveCreds();
        logger.info(
          { instanceId: this.instanceId },
          "cleared incomplete pairing credentials before reconnect"
        );
      }
      const { version } = await fetchLatestBaileysVersion();
      const socket = makeWASocket({
        version,
        auth: state,
        browser: getBaileysBrowser(),
        logger: logger.child({ instanceId: this.instanceId }),
        printQRInTerminal: false,
        markOnlineOnConnect: false,
      });
      this.socket = socket;
      socket.ev.on("creds.update", () => {
        this.credsSaveQueue = this.credsSaveQueue
          .then(saveCreds)
          .catch(error => {
            logger.error(
              {
                instanceId: this.instanceId,
                message: error instanceof Error ? error.message : String(error),
              },
              "failed to persist Baileys credentials"
            );
          });
      });
      socket.ev.on("connection.update", update =>
        this.handleConnection(update, socket)
      );
      socket.ev.on("messages.upsert", ({ messages, type, requestId }) =>
        this.handleMessages(messages, type, requestId)
      );
      socket.ev.on("messages.update", updates => {
        for (const update of updates) this.handleMessageStatusUpdate(update);
      });
      socket.ev.on("messaging-history.set", ({ chats, contacts, messages, syncType, progress, isLatest, chunkOrder }) => {
        logger.info(
          {
            instanceId: this.instanceId,
            chatCount: chats.length,
            contactCount: contacts.length,
            messageCount: messages.length,
            syncType,
            progress,
            isLatest,
            chunkOrder,
          },
          "Baileys history batch observed; forwarding for isolated import"
        );
        void this.handleMessages(messages, "append", undefined, true).catch(error =>
          logger.error(
            { err: error, instanceId: this.instanceId },
            "failed to forward Baileys history batch"
          )
        );
      });
      socket.ev.on("messaging-history.status", status => {
        logger.info(
          { instanceId: this.instanceId, ...status },
          "Baileys history sync status"
        );
      });
      socket.ev.on("call", calls => this.handleCalls(calls));
    } catch (error) {
      this.set({
        status: "error",
        lastError: error instanceof Error ? error.message : "connection failed",
      });
      await this.releaseSessionLock();
      this.scheduleReconnect();
      throw error;
    } finally {
      this.starting = false;
    }
  }

  async stop(logout = false): Promise<void> {
    this.suppressReconnectUntil = Date.now() + 5_000;
    this.clearReconnectTimer();
    this.reconnectAttempts = 0;
    const pairingWasPending = this.pairingAwaitingAcceptance;
    this.pairingAwaitingAcceptance = false;
    this.pairingAcceptedRestartPending = false;
    if (!this.socket) {
      this.set({
        status: logout ? "logged_out" : "disconnected",
        qr: undefined,
      });
      await this.webhookOutbox.stop();
      await this.credsSaveQueue;
      await this.releaseSessionLock();
      return;
    }
    if (shouldUseRemoteLogout(logout, pairingWasPending))
      await this.socket.logout();
    else this.socket.end(undefined);
    this.socket = undefined;
    this.set({ status: logout ? "logged_out" : "disconnected", qr: undefined });
    await this.webhookOutbox.stop();
    await this.credsSaveQueue;
    await this.releaseSessionLock();
  }

  async deleteSession(): Promise<void> {
    this.suppressReconnectUntil = Date.now() + 5_000;
    this.clearReconnectTimer();
    this.reconnectAttempts = 0;
    const pairingWasPending = this.pairingAwaitingAcceptance;
    this.pairingAwaitingAcceptance = false;
    this.pairingAcceptedRestartPending = false;
    const socket = this.socket;
    this.socket = undefined;
    if (socket) {
      if (shouldUseRemoteLogout(true, pairingWasPending)) {
        try {
          await socket.logout();
        } catch {
          socket.end(undefined);
        }
      } else {
        socket.end(undefined);
      }
    }
    this.set({ status: "logged_out", qr: undefined });
    await this.webhookOutbox.stop();
    await this.credsSaveQueue;
    await this.releaseSessionLock();
    await fs.rm(path.join(config.sessionDir, this.instanceId), {
      recursive: true,
      force: true,
    });
  }

  async reconnect(): Promise<void> {
    if (this.pairingAwaitingAcceptance) await this.deleteSession();
    else await this.stop(false);
    this.suppressReconnectUntil = 0;
    await this.start();
  }

  async requestPairingCode(phone: string): Promise<string> {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15)
      throw new Error("Informe um número completo com DDI, somente números");
    if (this.snapshot.status === "connected")
      throw new Error("Esta instância já está conectada");
    if (this.pairingRequestInProgress)
      throw new Error("Aguarde a solicitação atual de código terminar");
    if (this.pairingCleanup) await this.pairingCleanup;
    if (this.pairingAwaitingAcceptance) await this.deleteSession();
    if (!this.socket) await this.start();
    if (!this.socket)
      throw new Error("Não foi possível iniciar a sessão WhatsApp");
    const socket = this.socket;
    this.pairingRequestInProgress = true;
    try {
      logger.info(
        { instanceId: this.instanceId },
        "requesting WhatsApp pairing code"
      );
      const code = await requestPairingCodeWhenReady(
        () => this.waitForPairingReady(socket),
        () => {
          if (this.snapshot.status === "connected")
            throw new Error("Esta instância já está conectada");
          this.set({ status: "pairing", qr: undefined, lastError: undefined });
          this.pairingAwaitingAcceptance = true;
          return socket.requestPairingCode(digits);
        }
      );
      if (
        this.socket !== socket ||
        ["disconnected", "logged_out", "error"].includes(this.snapshot.status)
      ) {
        throw new Error(
          this.snapshot.lastError ??
            "O WhatsApp encerrou a conexão antes de confirmar o pedido. Gere um novo código."
        );
      }
      logger.info(
        { instanceId: this.instanceId },
        "Baileys returned a pairing code; phone acceptance is still pending"
      );
      return code;
    } catch (error) {
      if (this.socket === socket && this.getStatus().status !== "connected") {
        this.set({
          status: "error",
          lastError:
            error instanceof Error
              ? error.message
              : "Falha ao pedir código WhatsApp",
        });
      }
      throw error;
    } finally {
      this.pairingRequestInProgress = false;
    }
  }

  private async releaseSessionLock() {
    const lock = this.sessionLock;
    this.sessionLock = undefined;
    if (lock) await lock.release();
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  private scheduleReconnect() {
    if (
      Date.now() < this.suppressReconnectUntil ||
      this.snapshot.status === "logged_out"
    ) return;
    this.clearReconnectTimer();
    const attempt = this.reconnectAttempts + 1;
    const delayMs = reconnectDelayMs(attempt);
    this.reconnectAttempts = attempt;
    logger.warn(
      { instanceId: this.instanceId, attempt, delayMs },
      "scheduling WhatsApp reconnect"
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.start().catch(error =>
        logger.error(
          {
            instanceId: this.instanceId,
            message: error instanceof Error ? error.message : String(error),
          },
          "automatic WhatsApp reconnect failed"
        )
      );
    }, delayMs);
  }

  private waitForPairingReady(socket: WASocket): Promise<void> {
    if (this.socket !== socket)
      return Promise.reject(
        new Error("A sessão WhatsApp foi encerrada; tente novamente")
      );
    if (this.snapshot.status === "connected")
      return Promise.reject(new Error("Esta instância já está conectada"));
    if (this.snapshot.status === "qr") return Promise.resolve();

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        if (timeout) clearTimeout(timeout);
        socket.ev.off("connection.update", onUpdate);
        if (error) reject(error);
        else resolve();
      };
      const onUpdate = (update: { qr?: string; connection?: string }) => {
        if (update.qr) finish();
        else if (update.connection === "open")
          finish(new Error("Esta instância já está conectada"));
        else if (update.connection === "close")
          finish(
            new Error(
              "O WhatsApp encerrou a conexão antes de iniciar o pareamento. Tente novamente."
            )
          );
      };

      socket.ev.on("connection.update", onUpdate);
      timeout = setTimeout(
        () =>
          finish(
            new Error(
              "Tempo esgotado aguardando o WhatsApp iniciar o pareamento. Tente novamente."
            )
          ),
        30_000
      );
      if (this.socket !== socket)
        finish(new Error("A sessão WhatsApp foi encerrada; tente novamente"));
      else if (this.snapshot.status === "qr") finish();
      else if (this.snapshot.status === "connected")
        finish(new Error("Esta instância já está conectada"));
    });
  }

  private clearIncompletePairingSession() {
    this.pairingAwaitingAcceptance = false;
    if (this.pairingCleanup) return;
    const sessionPath = path.join(config.sessionDir, this.instanceId);
    const cleanup = this.credsSaveQueue
      .then(() => this.releaseSessionLock())
      .then(() => fs.rm(sessionPath, { recursive: true, force: true }))
      .catch(error => {
        logger.error(
          {
            instanceId: this.instanceId,
            message: error instanceof Error ? error.message : String(error),
          },
          "failed to clear incomplete pairing session"
        );
        this.set({
          status: "error",
          lastError:
            "Não foi possível limpar a tentativa de pareamento incompleta.",
        });
      });
    this.pairingCleanup = cleanup;
    void cleanup.then(() => {
      if (this.pairingCleanup === cleanup) this.pairingCleanup = undefined;
    });
  }

  async sendMessage(
    phone: string,
    messageType: string,
    content: string,
    metadata: Record<string, unknown> = {},
    idempotencyKey?: string
  ): Promise<string> {
    if (!idempotencyKey?.trim()) throw new Error("idempotency_key_required");
    return this.sendLedger.execute(
      idempotencyKey,
      stableFingerprint({ phone, messageType, content, metadata }),
      () => this.sendMessageOnce(phone, messageType, content, metadata)
    );
  }

  private async sendMessageOnce(
    phone: string,
    messageType: string,
    content: string,
    metadata: Record<string, unknown> = {}
  ): Promise<string> {
    if (!this.socket || this.snapshot.status !== "connected")
      throw new Error("WhatsApp instance is not connected");
    if (
      ["image", "audio", "video", "document"].includes(messageType) &&
      (!isAllowedOutboundMediaUrl(content) || typeof metadata.mediaData === "string")
    )
      throw new Error("Mídia de saída exige uma URL HTTPS privada válida");
    const jid = phone.includes("@")
      ? phone
      : phone.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
    let message: AnyMessageContent;
    if (messageType === "text") {
      message = { text: content };
    } else if (messageType === "audio") {
      message = {
        audio: { url: content },
        mimetype:
          typeof metadata.mimetype === "string"
            ? metadata.mimetype
            : "audio/ogg; codecs=opus",
        ptt: metadata.ptt !== false,
      };
    } else if (messageType === "image") {
      message = {
        image: { url: content },
        caption:
          typeof metadata.caption === "string" ? metadata.caption : undefined,
        mimetype:
          typeof metadata.mimetype === "string" ? metadata.mimetype : undefined,
      };
    } else if (messageType === "video") {
      message = {
        video: { url: content },
        caption:
          typeof metadata.caption === "string" ? metadata.caption : undefined,
        mimetype:
          typeof metadata.mimetype === "string" ? metadata.mimetype : undefined,
        ptv: metadata.ptv === true,
      };
    } else if (messageType === "document") {
      message = {
        document: { url: content },
        mimetype:
          typeof metadata.mimetype === "string"
            ? metadata.mimetype
            : "application/octet-stream",
        fileName:
          typeof metadata.fileName === "string"
            ? metadata.fileName
            : "document",
      };
    } else if (messageType === "button") {
      const buttons = Array.isArray(metadata.buttons) ? metadata.buttons : [];
      if (buttons.length < 1 || buttons.length > 3)
        throw new Error("Mensagem de botões exige de 1 a 3 opções");
      message = buildNativeInteractivePayload("button", content, metadata);
    } else if (messageType === "list") {
      const sections = Array.isArray(metadata.sections) ? metadata.sections : [];
      if (sections.length < 1)
        throw new Error("Mensagem de lista exige ao menos uma seção");
      message = buildNativeInteractivePayload("list", content, metadata);
    } else if (messageType === "poll") {
      const payload =
        metadata.payload && typeof metadata.payload === "object"
          ? (metadata.payload as Record<string, unknown>)
          : {};
      const poll =
        payload.poll && typeof payload.poll === "object"
          ? (payload.poll as Record<string, unknown>)
          : payload;
      const name = typeof poll.name === "string" ? poll.name : content;
      const values = Array.isArray(poll.values)
        ? poll.values.filter((value): value is string => typeof value === "string")
        : [];
      if (!name.trim() || values.length < 2)
        throw new Error("Enquete exige nome e ao menos duas opções");
      message = {
        poll: {
          name,
          values,
          selectableCount:
            typeof poll.selectableCount === "number" ? poll.selectableCount : 1,
        },
      } as unknown as AnyMessageContent;
    } else {
      throw new Error(`Tipo de mensagem não suportado: ${messageType}`);
    }
    const echo = normalizeBaileysOutgoingMessage(message);
    this.panelMessageEchoes.rememberPending(
      jid,
      echo.messageType,
      echo.echoContent
    );
    try {
      const externalId = isNativeInteractivePayload(message)
        ? await this.socket.relayMessage(jid, message as never, { messageId: crypto.randomUUID() })
        : (await this.socket.sendMessage(jid, message))?.key?.id ?? crypto.randomUUID();
      this.panelMessageEchoes.rememberSentMessage(
        externalId,
        jid,
        echo.messageType,
        echo.echoContent
      );
      this.flushPendingDeliveryUpdate(externalId);
      return externalId;
    } catch (error) {
      this.panelMessageEchoes.forgetPending(
        jid,
        echo.messageType,
        echo.echoContent
      );
      throw error;
    }
  }

  async sendPayload(
    phone: string,
    payload: AnyMessageContent,
    idempotencyKey?: string
  ): Promise<string> {
    if (!idempotencyKey?.trim()) throw new Error("idempotency_key_required");
    return this.sendLedger.execute(
      idempotencyKey,
      stableFingerprint({ phone, payload }),
      () => this.sendPayloadOnce(phone, payload)
    );
  }

  private async sendPayloadOnce(
    phone: string,
    payload: AnyMessageContent
  ): Promise<string> {
    if (!this.socket || this.snapshot.status !== "connected")
      throw new Error("WhatsApp instance is not connected");
    const jid = phone.includes("@")
      ? phone
      : phone.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
    const echo = normalizeBaileysOutgoingMessage(payload);
    this.panelMessageEchoes.rememberPending(
      jid,
      echo.messageType,
      echo.echoContent
    );
    try {
      if (isNativeInteractivePayload(payload)) {
        const externalId = await this.socket.relayMessage(
          jid,
          payload as never,
          { messageId: crypto.randomUUID() }
        );
        this.panelMessageEchoes.rememberSentMessage(
          externalId,
          jid,
          echo.messageType,
          echo.echoContent
        );
        this.flushPendingDeliveryUpdate(externalId);
        return externalId;
      }
      const result = await this.socket.sendMessage(jid, payload);
      const externalId = result?.key?.id ?? crypto.randomUUID();
      this.panelMessageEchoes.rememberSentMessage(
        externalId,
        jid,
        echo.messageType,
        echo.echoContent
      );
      this.flushPendingDeliveryUpdate(externalId);
      return externalId;
    } catch (error) {
      this.panelMessageEchoes.forgetPending(
        jid,
        echo.messageType,
        echo.echoContent
      );
      throw error;
    }
  }

  private handleMessageStatusUpdate(update: {
    key?: { id?: string | null; fromMe?: boolean | null };
    update?: { status?: unknown };
  }) {
    const messageId = update.key?.id;
    if (!messageId || update.key?.fromMe !== true) return;
    const status = normalizeBaileysMessageStatus(update.update?.status);
    if (!status) return;
    if (this.panelMessageEchoes.hasSentId(messageId)) {
      this.enqueueDeliveryStatus(messageId, status);
      return;
    }

    const now = Date.now();
    for (const [id, pending] of this.pendingDeliveryUpdates)
      if (pending.expiresAt <= now) this.pendingDeliveryUpdates.delete(id);
    this.pendingDeliveryUpdates.set(messageId, { status, expiresAt: now + 120_000 });
    while (this.pendingDeliveryUpdates.size > 256)
      this.pendingDeliveryUpdates.delete(this.pendingDeliveryUpdates.keys().next().value!);
  }

  private flushPendingDeliveryUpdate(messageId: string) {
    const pending = this.pendingDeliveryUpdates.get(messageId);
    this.pendingDeliveryUpdates.delete(messageId);
    if (!pending || pending.expiresAt <= Date.now()) return;
    this.enqueueDeliveryStatus(messageId, pending.status);
  }

  private enqueueDeliveryStatus(messageId: string, status: DeliveryStatus) {
    const eventId = instanceScopedEventId(
      this.instanceId,
      `message-status:${messageId}:${status}`
    );
    void this.webhookOutbox
      .enqueue({
        eventId,
        eventType: "message_status",
        instanceId: this.instanceId,
        messageId,
        status,
        fromMe: true,
      })
      .catch(error =>
        logger.error(
          {
            instanceId: this.instanceId,
            messageId,
            error: error instanceof Error ? error.message : String(error),
          },
          "failed to persist outbound delivery receipt"
        )
      );
  }

  private set(next: Partial<InstanceSnapshot>) {
    this.snapshot = {
      ...this.snapshot,
      ...next,
      updatedAt: new Date().toISOString(),
    };
  }

  private handleConnection(
    update: {
      connection?: string;
      lastDisconnect?: { error?: unknown };
      qr?: string;
      isNewLogin?: boolean;
    },
    socket: WASocket
  ) {
    if (this.socket !== socket) return;
    if (update.isNewLogin) {
      this.pairingAwaitingAcceptance = false;
      this.pairingAcceptedRestartPending = true;
      logger.info(
        { instanceId: this.instanceId },
        "Baileys received pairing acceptance; restart is expected"
      );
    }
    if (update.qr) this.set({ status: "qr", qr: update.qr });
    if (update.connection === "open") {
      this.pairingAwaitingAcceptance = false;
      this.pairingAcceptedRestartPending = false;
      this.reconnectAttempts = 0;
      const user = socket.user?.id;
      this.set({
        status: "connected",
        phone: user?.split(":")[0]?.replace(/\D/g, ""),
        qr: undefined,
      });
      logger.info({ instanceId: this.instanceId }, "Baileys session is open");
    }
    if (update.connection === "close") {
      const disconnectError = update.lastDisconnect?.error as
        | {
            message?: string;
            output?: { statusCode?: number };
            data?: { reason?: string | number };
          }
        | undefined;
      const statusCode = disconnectError?.output?.statusCode;
      const reason =
        disconnectError?.data?.reason == null
          ? undefined
          : String(disconnectError.data.reason);
      const message =
        disconnectError?.message ?? "Conexão encerrada pelo WhatsApp";
      const detail = reason ? `${message} (motivo ${reason})` : message;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      const pairingWasPending = this.pairingAwaitingAcceptance;
      const acceptedRestart = this.pairingAcceptedRestartPending;
      logger.warn(
        { instanceId: this.instanceId, statusCode, reason, message },
        "Baileys connection closed"
      );
      this.set({
        status: getStatusAfterSocketClose(loggedOut, acceptedRestart),
        qr: undefined,
        lastError: acceptedRestart
          ? undefined
          : pairingWasPending
            ? `Pareamento interrompido pelo WhatsApp (${detail}). Gere um novo código.`
            : detail,
      });
      this.socket = undefined;
      this.pairingAcceptedRestartPending = false;
      if (pairingWasPending) {
        this.clearIncompletePairingSession();
        return;
      }
      if (!loggedOut && Date.now() >= this.suppressReconnectUntil) {
        this.scheduleReconnect();
      }
    }
  }

  private async handleMessages(
    messages: WAMessage[],
    upsertType: MessageUpsertType,
    requestId?: string,
    historical = false
  ) {
    if (!historical && !shouldForwardLiveUpsert(upsertType, requestId)) {
      logger.info(
        {
          instanceId: this.instanceId,
          upsertType,
          requestId,
          messageCount: messages.length,
        },
        "ignoring Baileys history/backfill batch in the live Inbox"
      );
      return;
    }
    if (!config.webhookUrl) return;
    for (const message of messages) {
      const remoteJid = message.key?.remoteJid;
      if (!remoteJid || shouldIgnoreInboundJid(this.settings, remoteJid)) continue;
      const isGroup = isGroupJid(remoteJid);
      const groupSubject = isGroup
        ? await this.getGroupSubject(remoteJid)
        : undefined;
      const normalized = normalizeBaileysMessage(message.message);
      const body = normalized.body;
      const fromMe = message.key.fromMe === true;
      if (
        fromMe &&
        this.panelMessageEchoes.isPanelEcho(
          message.key.id,
          remoteJid,
          normalized.messageType,
          normalized.echoContent
        )
      )
        continue;
      const image = body?.imageMessage;
      const audio = body?.audioMessage;
      const video = body?.videoMessage;
      const document = body?.documentMessage;
      const sticker = body?.stickerMessage;
      const location = body?.locationMessage;
      const contact = body?.contactMessage ?? body?.contactsArrayMessage;
      const poll = body?.pollCreationMessage ?? body?.pollUpdateMessage;
      const list = body?.listMessage;
      const button = body?.buttonsMessage ?? body?.templateButtonReplyMessage;
      const reaction = body?.reactionMessage;
      const { messageType, content } = normalized;
      const media = image || audio || video || document || sticker;
      const keyWithAlternates = message.key as typeof message.key & {
        participantAlt?: string | null;
        remoteJidAlt?: string | null;
      };
      const metadata: Record<string, unknown> = {
        provider: "baileys",
        upsertType,
        ...(normalized.isPlaceholder ? { isPlaceholder: true } : {}),
        messageId: message.key.id,
        jid: remoteJid,
        ...(isGroup
          ? {
              isGroup: true,
              groupJid: remoteJid,
              groupSubject,
              ...(message.key.participant
                ? { authorJid: message.key.participant }
                : {}),
              ...(keyWithAlternates.participantAlt
                ? { authorJidAlt: keyWithAlternates.participantAlt }
                : {}),
              ...(message.pushName ? { authorName: message.pushName } : {}),
            }
          : {}),
        ...(keyWithAlternates.remoteJidAlt
          ? { remoteJidAlt: keyWithAlternates.remoteJidAlt }
          : {}),
        ...([location, contact, poll, list, button, reaction].some(Boolean)
          ? { payload: { location, contact, poll, list, button, reaction } }
          : {}),
      };
      if (media && !historical) {
        try {
          const buffer = await downloadMediaMessage(message, "buffer", {});
          const mimeType =
            media.mimetype ??
            (image
              ? "image/jpeg"
              : audio
                ? "audio/ogg"
                : video
                  ? "video/mp4"
                  : "application/octet-stream");
          metadata.mediaData = `data:${mimeType};base64,${(buffer as Buffer).toString("base64")}`;
          metadata.mediaMimeType = mimeType;
          if (document?.fileName) metadata.fileName = document.fileName;
          metadata.fileLength = (buffer as Buffer).length;
        } catch (error) {
          logger.warn(
            { err: error, messageId: message.key.id },
            "failed to download inbound Baileys media"
          );
          metadata.mediaDownloadError = true;
        }
      }
      const timestamp = Number(
        message.messageTimestamp ?? Math.floor(Date.now() / 1000)
      );
      await this.webhookOutbox.enqueue({
        eventId: message.key.id
          ? instanceScopedEventId(
              this.instanceId,
              `${historical ? "history" : "message"}:${message.key.id}`
            )
          : crypto.randomUUID(),
        instanceId: this.instanceId,
        phone: remoteJid.replace(/@s\.whatsapp\.net$/, ""),
        name: isGroup
          ? groupSubject ?? `Grupo ${remoteJid.split("@")[0]}`
          : message.pushName,
        content,
        messageType,
        receivedAt: new Date(timestamp * 1000).toISOString(),
        jid: remoteJid,
        fromMe,
        metadata,
        ...(historical ? { historySync: true } : {}),
      });
    }
  }

  private async getGroupSubject(groupJid: string) {
    const cached = this.groupSubjectCache.get(groupJid);
    if (cached && cached.expiresAt > Date.now()) return cached.subject;
    try {
      const details = await this.socket?.groupMetadata(groupJid);
      const subject = details?.subject?.trim();
      if (subject) {
        const normalizedSubject = subject.slice(0, 160);
        this.groupSubjectCache.set(groupJid, {
          subject: normalizedSubject,
          expiresAt: Date.now() + 5 * 60_000,
        });
        return normalizedSubject;
      }
    } catch (error) {
      logger.warn(
        { err: error, instanceId: this.instanceId, groupJid },
        "failed to resolve Baileys group subject"
      );
    }
    const fallback = `Grupo ${groupJid.split("@")[0]}`;
    this.groupSubjectCache.set(groupJid, {
      subject: fallback,
      expiresAt: Date.now() + 30_000,
    });
    return fallback;
  }

  private async handleCalls(
    calls: Array<{
      id: string;
      from: string;
      chatId: string;
      status: string;
      isVideo?: boolean;
      date?: Date;
    }>
  ) {
    for (const call of calls) {
      if (!call.from || call.chatId?.endsWith("@g.us")) continue;
      const rejected = shouldRejectIncomingCall(this.settings, call.status);
      if (rejected) {
        try {
          await this.socket?.rejectCall(call.id, call.from);
        } catch (error) {
          logger.warn(
            { err: error, instanceId: this.instanceId, callId: call.id },
            "failed to reject incoming WhatsApp call"
          );
        }
      }
      if (!this.settings.logCalls || !config.webhookUrl) continue;
      await this.webhookOutbox.enqueue({
        eventId: instanceScopedEventId(
          this.instanceId,
          `call:${call.id}:${call.status}`
        ),
        instanceId: this.instanceId,
        phone: call.from.replace(/@s\.whatsapp\.net$/, ""),
        content: `[ligação ${call.isVideo ? "de vídeo" : "de áudio"}: ${call.status}]`,
        messageType: "text",
        receivedAt: (call.date ?? new Date()).toISOString(),
        jid: call.chatId,
        metadata: {
          provider: "baileys",
          callId: call.id,
          callStatus: call.status,
          isVideo: call.isVideo === true,
          autoRejected: rejected,
          jid: call.chatId,
        },
      });
    }
  }
}
