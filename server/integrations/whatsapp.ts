import crypto from "node:crypto";
import type {
  BaileysAdapter,
  IntegrationHealth,
  InboundMessageEvent,
  OutboundMessageCommand,
  WhatsappAdapter,
  WhatsappProvider,
} from "./contracts";
import { ENV } from "../_core/env";
import { normalizeContactPhone, normalizeWhatsappJid } from "../_core/phone";
import { assertOperationalWhatsappProvider } from "./baileys-policy";

function nowHealth(
  name: "baileys",
  ok: boolean,
  detail: string,
  latencyMs?: number
): IntegrationHealth {
  return { name, ok, detail, latencyMs, checkedAt: new Date() };
}

function normalizePhone(phone: string) {
  return normalizeContactPhone(phone);
}

function outboundRecipient(phone: string, metadata?: Record<string, unknown>) {
  const jid =
    typeof metadata?.jid === "string"
      ? normalizeWhatsappJid(metadata.jid)
      : undefined;
  return jid ?? normalizePhone(phone);
}

function normalizeInboundPhone(phone: string) {
  return normalizeContactPhone(phone).replace(/^(lid|group):/, "");
}

function normalizeBaileysPayload(event: any): InboundMessageEvent {
  const data = event?.data ?? event?.payload ?? event?.body ?? event;
  const message = data?.message ?? data?.messages?.[0] ?? data;
  const key = data?.key ?? message?.key ?? message?.message?.key ?? {};
  const jid = String(
    message?.jid ??
      message?.metadata?.jid ??
      data?.metadata?.jid ??
      data?.jid ??
      message?.remoteJid ??
      data?.remoteJid ??
      message?.key?.remoteJid ??
      key?.remoteJid ??
      ""
  );
  const phone = normalizeInboundPhone(
    String(
      message?.phone ??
        message?.from ??
        message?.sender?.phone ??
        message?.sender?.id ??
        message?.remoteJidAlt ??
        message?.remoteJid ??
        key?.remoteJidAlt ??
        key?.remoteJid ??
        data?.phone ??
        data?.from ??
        ""
    ).replace(/@s\.whatsapp\.net$/, "")
  );
  const rawType = String(
    message?.messageType ??
      message?.type ??
      data?.messageType ??
      data?.type ??
      (message?.imageMessage
        ? "image"
        : message?.audioMessage
          ? "audio"
          : message?.videoMessage
            ? "video"
            : message?.documentMessage
              ? "document"
              : "text")
  );
  const supportedTypes = [
    "text",
    "image",
    "audio",
    "video",
    "document",
    "sticker",
    "location",
    "contact",
    "poll",
    "list",
    "button",
    "react",
  ];
  const messageType = (
    supportedTypes.includes(rawType) ? rawType : "text"
  ) as InboundMessageEvent["messageType"];
  const content =
    message?.content ??
    message?.conversation ??
    message?.extendedTextMessage?.text ??
    message?.text?.body ??
    message?.text ??
    message?.caption ??
    message?.image?.caption ??
    message?.imageMessage?.caption ??
    message?.document?.caption ??
    message?.documentMessage?.caption ??
    data?.content ??
    "[mídia recebida]";
  const eventId = String(
    message?.messageId ??
      message?.id ??
      key?.id ??
      data?.messageId ??
      data?.eventId ??
      event?.eventId ??
      crypto.randomUUID()
  );
  const messageId = String(
    message?.messageId ??
      message?.id ??
      key?.id ??
      data?.messageId ??
      data?.metadata?.messageId ??
      data?.eventId ??
      event?.eventId ??
      eventId
  );
  const instanceId =
    message?.instanceId ??
    data?.instanceId ??
    event?.instanceId ??
    event?._meta?.instanceId;
  const fromMe = Boolean(
    message?.fromMe ?? key?.fromMe ?? data?.fromMe ?? event?.fromMe
  );
  const sourceMetadata = message?.metadata ?? data?.metadata ?? {};
  const historySync =
    message?.historySync === true ||
    data?.historySync === true ||
    event?.historySync === true;
  const isGroup =
    sourceMetadata.isGroup === true ||
    jid.endsWith("@g.us") ||
    String(key?.remoteJid ?? message?.remoteJid ?? "").endsWith("@g.us");
  return {
    eventId,
    phone,
    name: message?.name ?? message?.sender?.name ?? data?.name ?? event?.name,
    content: String(content),
    messageType,
    fromMe,
    metadata: {
      provider: "baileys",
      ...(instanceId ? { instanceId: String(instanceId) } : {}),
      ...(fromMe ? { fromMe: true } : {}),
      ...(isGroup
        ? {
            isGroup: true,
            ...(jid.endsWith("@g.us") ? { groupJid: jid } : {}),
            ...(typeof sourceMetadata.groupSubject === "string"
              ? { groupSubject: sourceMetadata.groupSubject.slice(0, 160) }
              : {}),
            ...(typeof sourceMetadata.authorJid === "string"
              ? { authorJid: sourceMetadata.authorJid }
              : {}),
            ...(typeof sourceMetadata.authorJidAlt === "string"
              ? { authorJidAlt: sourceMetadata.authorJidAlt }
              : {}),
            ...(typeof sourceMetadata.authorName === "string"
              ? { authorName: sourceMetadata.authorName.slice(0, 160) }
              : {}),
          }
        : {}),
      ...(jid ? { jid } : {}),
      ...(typeof sourceMetadata.remoteJidAlt === "string"
        ? { remoteJidAlt: sourceMetadata.remoteJidAlt }
        : {}),
      ...(typeof data?.metadata?.mediaData === "string"
        ? { mediaData: data.metadata.mediaData }
        : {}),
      ...(typeof data?.metadata?.mediaMimeType === "string"
        ? { mediaMimeType: data.metadata.mediaMimeType }
        : {}),
      ...(typeof data?.metadata?.fileName === "string"
        ? { fileName: data.metadata.fileName }
        : {}),
      ...(typeof data?.metadata?.fileLength === "number"
        ? { fileLength: data.metadata.fileLength }
        : {}),
      ...(sourceMetadata.upsertType === "notify" || sourceMetadata.upsertType === "append"
        ? { upsertType: sourceMetadata.upsertType }
        : {}),
      ...(sourceMetadata.isPlaceholder === true ? { isPlaceholder: true } : {}),
      ...(historySync ? { historySync: true } : {}),
      ...(typeof sourceMetadata.requestId === "string"
        ? { requestId: sourceMetadata.requestId }
        : {}),
      rawType,
      messageId,
    },
    receivedAt: message?.timestamp
      ? new Date(Number(message.timestamp) * 1000)
      : new Date(data?.receivedAt ?? event?.receivedAt ?? Date.now()),
  };
}

function normalizeBaileysInbound(event: any): InboundMessageEvent {
  const normalized = normalizeBaileysPayload(event);
  return {
    ...normalized,
    metadata: { ...(normalized.metadata ?? {}), provider: "baileys" },
  };
}

export function createBaileysAdapter(): BaileysAdapter {
  const baseUrl = process.env.BAILEYS_BASE_URL?.trim();
  const apiKey = process.env.BAILEYS_API_KEY?.trim();
  return {
    provider: "baileys",
    async health() {
      if (!baseUrl || !apiKey)
        return nowHealth(
          "baileys",
          false,
          "BAILEYS_BASE_URL ou BAILEYS_API_KEY não configurado"
        );
      const started = Date.now();
      try {
        const response = await fetch(`${baseUrl.replace(/\/$/, "")}/ready`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(
            Math.max(
              1_000,
              Number(process.env.BAILEYS_REQUEST_TIMEOUT_MS ?? 8_000)
            )
          ),
        });
        const payload = (await (typeof response.json === "function"
          ? response.json().catch(() => ({}))
          : {})) as { instance?: { status?: string } };
        const connected = payload.instance?.status === "connected";
        return nowHealth(
          "baileys",
          response.ok && connected,
          response.ok
            ? connected
              ? "Gateway Baileys conectado"
              : `Gateway Baileys online, sessão ${payload.instance?.status ?? "indisponível"}`
            : `Gateway Baileys respondeu ${response.status}`,
          Date.now() - started
        );
      } catch (error) {
        return nowHealth(
          "baileys",
          false,
          error instanceof Error ? error.message : "Falha de conexão",
          Date.now() - started
        );
      }
    },
    async sendMessage(command: OutboundMessageCommand) {
      if (!baseUrl || !apiKey)
        throw new Error("Gateway Baileys não configurado");
      const instanceId = command.instanceId?.trim();
      if (!instanceId)
        throw new Error("instanceId não informado para envio Baileys");
      const response = await fetch(
        `${baseUrl.replace(/\/$/, "")}/api/instances/${encodeURIComponent(instanceId)}/send`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            "Idempotency-Key": command.idempotencyKey,
          },
          signal: AbortSignal.timeout(
            Math.max(
              1_000,
              Number(process.env.BAILEYS_REQUEST_TIMEOUT_MS ?? 8_000)
            )
          ),
          body: JSON.stringify({
            phone:
              typeof command.metadata?.jid === "string"
                ? command.metadata.jid
                : normalizePhone(command.phone),
            messageType: command.messageType ?? "text",
            content: command.content,
            metadata: command.metadata ?? {},
            ...(command.metadata?.payload &&
            typeof command.metadata.payload === "object"
              ? { payload: command.metadata.payload }
              : {}),
          }),
        }
      );
      if (!response.ok)
        throw new Error(`Gateway Baileys respondeu ${response.status}`);
      const data = (await response.json()) as {
        externalId?: string;
        messageId?: string;
      };
      return {
        externalId: String(
          data.externalId ?? data.messageId ?? command.idempotencyKey
        ),
        status: "sent" as const,
      };
    },
    normalizeInbound: normalizeBaileysInbound,
  };
}

export function getWhatsappAdapter(
  provider: WhatsappProvider
): WhatsappAdapter {
  assertOperationalWhatsappProvider(provider);
  return createBaileysAdapter();
}
