import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type AnyMessageContent,
  type WAMessage,
  type WASocket,
} from "baileys";
import pino from "pino";
import { config } from "./config.js";
import { useEncryptedAuthState } from "./encrypted-auth-state.js";
import { acquireSessionLock, type SessionLock } from "./session-lock.js";
import {
  clearUnregisteredPairingCredentials,
  requestPairingCodeWhenReady,
} from "./pairing-code.js";
import { WebhookOutbox } from "./webhook-outbox.js";

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
  webhookOutboxPending?: number;
  webhookLastError?: string;
  updatedAt: string;
};

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });

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
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private readonly webhookOutbox: WebhookOutbox;

  constructor(
    private readonly instanceId = config.instanceId,
    private instanceName =
      instanceId === config.instanceId
        ? config.instanceName
        : `WhatsApp · ${instanceId}`
  ) {
    this.snapshot = {
      instanceId,
      instanceName,
      status: "idle",
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
  }

  getStatus(): InstanceSnapshot {
    const outbox = this.webhookOutbox.getStatus();
    return {
      ...this.snapshot,
      webhookOutboxPending: outbox.pending,
      webhookLastError: outbox.lastError,
    };
  }

  setName(name: string) {
    this.instanceName = name;
    this.set({ instanceName: name });
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
        browser: Browsers.ubuntu("Forte Panel"),
        logger: logger.child({ instanceId: this.instanceId }),
        printQRInTerminal: false,
        markOnlineOnConnect: false,
      });
      this.socket = socket;
      socket.ev.on("creds.update", saveCreds);
      socket.ev.on("connection.update", update =>
        this.handleConnection(update, socket)
      );
      socket.ev.on("messages.upsert", ({ messages }) =>
        this.handleMessages(messages)
      );
      socket.ev.on("call", calls => this.handleCalls(calls));
    } catch (error) {
      this.set({
        status: "error",
        lastError: error instanceof Error ? error.message : "connection failed",
      });
      await this.releaseSessionLock();
      throw error;
    } finally {
      this.starting = false;
    }
  }

  async stop(logout = false): Promise<void> {
    this.suppressReconnectUntil = Date.now() + 5_000;
    this.clearReconnectTimer();
    this.pairingAwaitingAcceptance = false;
    this.pairingAcceptedRestartPending = false;
    if (!this.socket) {
      this.set({ status: logout ? "logged_out" : "disconnected", qr: undefined });
      await this.webhookOutbox.stop();
      await this.releaseSessionLock();
      return;
    }
    if (logout) await this.socket.logout();
    else this.socket.end(undefined);
    this.socket = undefined;
    this.set({ status: logout ? "logged_out" : "disconnected", qr: undefined });
    await this.webhookOutbox.stop();
    await this.releaseSessionLock();
  }

  async deleteSession(): Promise<void> {
    this.suppressReconnectUntil = Date.now() + 5_000;
    this.clearReconnectTimer();
    this.pairingAwaitingAcceptance = false;
    this.pairingAcceptedRestartPending = false;
    const socket = this.socket;
    this.socket = undefined;
    if (socket) {
      try {
        await socket.logout();
      } catch {
        socket.end(undefined);
      }
    }
    this.set({ status: "logged_out", qr: undefined });
    await this.webhookOutbox.stop();
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
    if (!this.socket) throw new Error("Não foi possível iniciar a sessão WhatsApp");
    const socket = this.socket;
    this.pairingRequestInProgress = true;
    try {
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
      return code;
    } catch (error) {
      if (this.socket === socket && this.getStatus().status !== "connected") {
        this.set({
          status: "error",
          lastError:
            error instanceof Error ? error.message : "Falha ao pedir código WhatsApp",
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
        15_000
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
    const cleanup = this.releaseSessionLock()
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
          lastError: "Não foi possível limpar a tentativa de pareamento incompleta.",
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
    metadata: Record<string, unknown> = {}
  ): Promise<string> {
    if (!this.socket || this.snapshot.status !== "connected")
      throw new Error("WhatsApp instance is not connected");
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
      message = {
        text: content,
        buttons,
        footer: typeof metadata.footer === "string" ? metadata.footer : "",
      } as unknown as AnyMessageContent;
    } else {
      throw new Error(`Tipo de mensagem não suportado: ${messageType}`);
    }
    const result = await this.socket.sendMessage(jid, message);
    return result?.key?.id ?? crypto.randomUUID();
  }

  async sendPayload(
    phone: string,
    payload: AnyMessageContent
  ): Promise<string> {
    if (!this.socket || this.snapshot.status !== "connected")
      throw new Error("WhatsApp instance is not connected");
    const jid = phone.includes("@")
      ? phone
      : phone.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
    const result = await this.socket.sendMessage(jid, payload);
    return result?.key?.id ?? crypto.randomUUID();
  }

  private set(next: Partial<InstanceSnapshot>) {
    this.snapshot = {
      ...this.snapshot,
      ...next,
      updatedAt: new Date().toISOString(),
    };
  }

  private handleConnection(update: {
    connection?: string;
    lastDisconnect?: { error?: unknown };
    qr?: string;
    isNewLogin?: boolean;
  }, socket: WASocket) {
    if (this.socket !== socket) return;
    if (update.isNewLogin) {
      this.pairingAwaitingAcceptance = false;
      this.pairingAcceptedRestartPending = true;
    }
    if (update.qr) this.set({ status: "qr", qr: update.qr });
    if (update.connection === "open") {
      this.pairingAwaitingAcceptance = false;
      this.pairingAcceptedRestartPending = false;
      const user = socket.user?.id;
      this.set({
        status: "connected",
        phone: user?.split(":")[0]?.replace(/\D/g, ""),
        qr: undefined,
      });
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
      const message = disconnectError?.message ?? "Conexão encerrada pelo WhatsApp";
      const detail = reason ? `${message} (motivo ${reason})` : message;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      const pairingWasPending = this.pairingAwaitingAcceptance;
      const acceptedRestart = this.pairingAcceptedRestartPending;
      logger.warn(
        { instanceId: this.instanceId, statusCode, reason, message },
        "Baileys connection closed"
      );
      this.set({
        status: loggedOut ? "logged_out" : "disconnected",
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
        this.clearReconnectTimer();
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = undefined;
          void this.start();
        }, 3_000);
      }
    }
  }

  private async handleMessages(messages: WAMessage[]) {
    if (!config.webhookUrl) return;
    for (const message of messages) {
      if (
        message.key?.fromMe ||
        !message.key?.remoteJid ||
        message.key.remoteJid.endsWith("@g.us")
      )
        continue;
      const body = message.message;
      const image = body?.imageMessage;
      const audio = body?.audioMessage;
      const video = body?.videoMessage;
      const document = body?.documentMessage;
      const messageType = image
        ? "image"
        : audio
          ? "audio"
          : video
            ? "video"
            : document
              ? "document"
              : "text";
      const content =
        body?.conversation ??
        body?.extendedTextMessage?.text ??
        image?.caption ??
        video?.caption ??
        document?.caption ??
        (audio ? "[áudio recebido]" : "[mídia recebida]");
      const media = image || audio || video || document;
      const metadata: Record<string, unknown> = {
        provider: "baileys",
        messageId: message.key.id,
        jid: message.key.remoteJid,
      };
      if (media) {
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
        eventId: message.key.id ?? crypto.randomUUID(),
        instanceId: this.instanceId,
        phone: message.key.remoteJid.replace(/@s\.whatsapp\.net$/, ""),
        name: message.pushName,
        content,
        messageType,
        receivedAt: new Date(timestamp * 1000).toISOString(),
        jid: message.key.remoteJid,
        metadata,
      });
    }
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
    if (!config.webhookUrl) return;
    for (const call of calls) {
      if (!call.from || call.chatId?.endsWith("@g.us")) continue;
      await this.webhookOutbox.enqueue({
        eventId: `call-${call.id}-${call.status}`,
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
          jid: call.chatId,
        },
      });
    }
  }
}
