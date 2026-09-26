import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import makeWASocket, { Browsers, DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState, type WAMessage, type WASocket } from "baileys";
import pino from "pino";
import { config } from "./config.js";

export type InstanceStatus = "idle" | "connecting" | "qr" | "connected" | "disconnected" | "logged_out" | "error";
export type InstanceSnapshot = { instanceId: string; status: InstanceStatus; phone?: string; qr?: string; lastError?: string; updatedAt: string };

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });

export class InstanceManager {
  private socket?: WASocket;
  private snapshot: InstanceSnapshot = { instanceId: config.instanceId, status: "idle", updatedAt: new Date().toISOString() };
  private starting = false;

  getStatus(): InstanceSnapshot { return { ...this.snapshot }; }

  async start(): Promise<void> {
    if (this.starting || this.snapshot.status === "connected") return;
    this.starting = true;
    this.set({ status: "connecting", qr: undefined, lastError: undefined });
    try {
      const sessionPath = path.join(config.sessionDir, config.instanceId);
      await fs.mkdir(sessionPath, { recursive: true });
      const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
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
      this.socket.ev.on("connection.update", (update) => this.handleConnection(update));
      this.socket.ev.on("messages.upsert", ({ messages }) => this.handleMessages(messages));
    } catch (error) {
      this.set({ status: "error", lastError: error instanceof Error ? error.message : "connection failed" });
      throw error;
    } finally {
      this.starting = false;
    }
  }

  async stop(logout = false): Promise<void> {
    if (!this.socket) return;
    if (logout) await this.socket.logout();
    else this.socket.end(undefined);
    this.socket = undefined;
    this.set({ status: logout ? "logged_out" : "disconnected", qr: undefined });
  }

  async sendText(phone: string, text: string): Promise<string> {
    if (!this.socket || this.snapshot.status !== "connected") throw new Error("WhatsApp instance is not connected");
    const jid = phone.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
    const result = await this.socket.sendMessage(jid, { text });
    return result?.key?.id ?? crypto.randomUUID();
  }

  private set(next: Partial<InstanceSnapshot>) { this.snapshot = { ...this.snapshot, ...next, updatedAt: new Date().toISOString() }; }

  private handleConnection(update: { connection?: string; lastDisconnect?: { error?: unknown }; qr?: string }) {
    if (update.qr) this.set({ status: "qr", qr: update.qr });
    if (update.connection === "open") {
      const user = this.socket?.user?.id;
      this.set({ status: "connected", phone: user?.split(":")[0]?.replace(/\D/g, ""), qr: undefined });
    }
    if (update.connection === "close") {
      const code = (update.lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      this.set({ status: loggedOut ? "logged_out" : "disconnected", qr: undefined });
      if (!loggedOut) setTimeout(() => void this.start(), 3000);
    }
  }

  private async handleMessages(messages: WAMessage[]) {
    if (!config.webhookUrl) return;
    for (const message of messages) {
      if (message.key?.fromMe || !message.key?.remoteJid || message.key.remoteJid.endsWith("@g.us")) continue;
      const content = message.message?.conversation ?? message.message?.extendedTextMessage?.text;
      if (!content) continue;
      const timestamp = Number(message.messageTimestamp ?? Math.floor(Date.now() / 1000));
      await postWebhook({ eventId: message.key.id ?? crypto.randomUUID(), instanceId: config.instanceId, phone: message.key.remoteJid.replace(/@s\.whatsapp\.net$/, ""), name: message.pushName, content, messageType: "text", receivedAt: new Date(timestamp * 1000).toISOString(), metadata: { provider: "baileys", messageId: message.key.id } });
    }
  }
}

async function postWebhook(payload: Record<string, unknown>) {
  const body = JSON.stringify(payload);
  const signature = config.webhookSecret ? `sha256=${crypto.createHmac("sha256", config.webhookSecret).update(body).digest("hex")}` : "";
  const response = await fetch(config.webhookUrl, { method: "POST", headers: { "content-type": "application/json", ...(signature ? { "x-webhook-signature": signature } : {}) }, body });
  if (!response.ok) logger.warn({ status: response.status }, "inbound webhook rejected");
}
