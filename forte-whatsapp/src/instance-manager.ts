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

export type InstanceStatus =
  | "idle"
  | "connecting"
  | "qr"
  | "connected"
  | "disconnected"
  | "logged_out"
  | "error";
export type InstanceSnapshot = {
  instanceId: string;
  status: InstanceStatus;
  phone?: string;
  qr?: string;
  lastError?: string;
  updatedAt: string;
};

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });

export class InstanceManager {
  private socket?: WASocket;
  private snapshot: InstanceSnapshot = {
    instanceId: config.instanceId,
    status: "idle",
    updatedAt: new Date().toISOString(),
  };
  private starting = false;
  private sessionLock?: SessionLock;
  private suppressReconnectUntil = 0;

  getStatus(): InstanceSnapshot {
    return { ...this.snapshot };
  }

  async start(): Promise<void> {
    if (this.starting || this.snapshot.status === "connected") return;
    this.starting = true;
    this.set({ status: "connecting", qr: undefined, lastError: undefined });
    try {
      const sessionPath = path.join(config.sessionDir, config.instanceId);
      await fs.mkdir(sessionPath, { recursive: true });
      this.sessionLock ??= await acquireSessionLock(sessionPath);
      const { state, saveCreds } = config.sessionEncryptionKey
        ? await useEncryptedAuthState(sessionPath, config.sessionEncryptionKey)
        : await useMultiFileAuthState(sessionPath);
      const { version } = await fetchLatestBaileysVersion();
      this.socket = makeWASocket({
        version,
        auth: state,
        browser: Browsers.ubuntu("Forte Panel"),
        logger: logger.child({ instanceId: config.instanceId }),
        printQRInTerminal: false,
        markOnlineOnConnect: false,
      });
      this.socket.ev.on("creds.update", saveCreds);
      this.socket.ev.on("connection.update", update =>
        this.handleConnection(update)
      );
      this.socket.ev.on("messages.upsert", ({ messages }) =>
        this.handleMessages(messages)
      );
      this.socket.ev.on("call", calls => this.handleCalls(calls));
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
    if (!this.socket) {
      await this.releaseSessionLock();
      return;
    }
    if (logout) await this.socket.logout();
    else this.socket.end(undefined);
    this.socket = undefined;
    this.set({ status: logout ? "logged_out" : "disconnected", qr: undefined });
    await this.releaseSessionLock();
  }

  async reconnect(): Promise<void> {
    await this.stop(false);
    this.suppressReconnectUntil = 0;
    await this.start();
  }

  private async releaseSessionLock() {
    const lock = this.sessionLock;
    this.sessionLock = undefined;
    if (lock) await lock.release();
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
  }) {
    if (update.qr) this.set({ status: "qr", qr: update.qr });
    if (update.connection === "open") {
      const user = this.socket?.user?.id;
      this.set({
        status: "connected",
        phone: user?.split(":")[0]?.replace(/\D/g, ""),
        qr: undefined,
      });
    }
    if (update.connection === "close") {
      const code = (
        update.lastDisconnect?.error as { output?: { statusCode?: number } }
      )?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      this.set({
        status: loggedOut ? "logged_out" : "disconnected",
        qr: undefined,
      });
      if (!loggedOut && Date.now() >= this.suppressReconnectUntil)
        setTimeout(() => void this.start(), 3000);
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
      await postWebhook({
        eventId: message.key.id ?? crypto.randomUUID(),
        instanceId: config.instanceId,
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
      await postWebhook({
        eventId: `call-${call.id}-${call.status}`,
        instanceId: config.instanceId,
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

async function postWebhook(payload: Record<string, unknown>) {
  const body = JSON.stringify(payload);
  const signature = config.webhookSecret
    ? `sha256=${crypto.createHmac("sha256", config.webhookSecret).update(body).digest("hex")}`
    : "";
  const response = await fetch(config.webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(config.webhookSecret
        ? { "x-webhook-secret": config.webhookSecret }
        : {}),
      ...(signature ? { "x-webhook-signature": signature } : {}),
    },
    body,
  });
  if (!response.ok)
    logger.warn({ status: response.status }, "inbound webhook rejected");
}
