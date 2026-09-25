import crypto from "node:crypto";
import type { IntegrationHealth, InboundMessageEvent, MetaCloudApiAdapter, OutboundMessageCommand, PapiAdapter, WhatsappAdapter, WhatsappProvider } from "./contracts";

function nowHealth(name: "papi" | "meta_cloud_api" | "n8n", ok: boolean, detail: string, latencyMs?: number): IntegrationHealth {
  return { name, ok, detail, latencyMs, checkedAt: new Date() };
}

function normalizePhone(phone: string) {
  return phone.replace(/[^0-9]/g, "");
}

function normalizePapiInbound(event: any): InboundMessageEvent {
  const data = event?.data ?? event?.payload ?? event?.body ?? event;
  const message = data?.message ?? data?.messages?.[0] ?? data;
  const key = data?.key ?? message?.key ?? message?.message?.key ?? {};
  const phone = normalizePhone(String(
    message?.phone ?? message?.from ?? message?.sender?.phone ?? message?.sender?.id ?? message?.remoteJidAlt ?? message?.remoteJid ?? key?.remoteJidAlt ?? key?.remoteJid ?? data?.phone ?? data?.from ?? "",
  ).replace(/@s\.whatsapp\.net$/, ""));
  const rawType = String(message?.messageType ?? message?.type ?? data?.messageType ?? data?.type ?? (message?.imageMessage ? "image" : message?.audioMessage ? "audio" : message?.videoMessage ? "video" : message?.documentMessage ? "document" : "text"));
  const messageType = (["text", "image", "audio", "video", "document"].includes(rawType) ? rawType : "text") as InboundMessageEvent["messageType"];
  const content = message?.content ?? message?.conversation ?? message?.extendedTextMessage?.text ?? message?.text?.body ?? message?.text ?? message?.caption ?? message?.image?.caption ?? message?.imageMessage?.caption ?? message?.document?.caption ?? message?.documentMessage?.caption ?? data?.content ?? "[mídia recebida]";
  const eventId = String(message?.messageId ?? message?.id ?? key?.id ?? data?.messageId ?? data?.eventId ?? event?.eventId ?? crypto.randomUUID());
  const instanceId = message?.instanceId ?? data?.instanceId ?? event?.instanceId ?? event?._meta?.instanceId;
  const fromMe = Boolean(message?.fromMe ?? key?.fromMe ?? data?.fromMe ?? event?.fromMe);
  const isGroup = String(key?.remoteJid ?? message?.remoteJid ?? "").endsWith("@g.us");
  return {
    eventId,
    phone,
    name: message?.name ?? message?.sender?.name ?? data?.name ?? event?.name,
    content: String(content),
    messageType,
    fromMe,
    metadata: { provider: "papi", ...(instanceId ? { instanceId: String(instanceId) } : {}), ...(fromMe ? { fromMe: true } : {}), ...(isGroup ? { isGroup: true } : {}), rawType, messageId: eventId },
    receivedAt: message?.timestamp ? new Date(Number(message.timestamp) * 1000) : new Date(data?.receivedAt ?? event?.receivedAt ?? Date.now()),
  };
}

function normalizeMetaInbound(event: any): InboundMessageEvent {
  const change = event?.entry?.[0]?.changes?.[0]?.value;
  const message = change?.messages?.[0];
  const profile = change?.contacts?.[0]?.profile;
  const content = message?.text?.body ?? message?.image?.caption ?? message?.document?.caption ?? "[mídia recebida]";
  return {
    eventId: String(message?.id ?? event?.eventId ?? crypto.randomUUID()),
    phone: normalizePhone(String(message?.from ?? "")),
    name: profile?.name,
    content,
    messageType: message?.type ?? "text",
    receivedAt: message?.timestamp ? new Date(Number(message.timestamp) * 1000) : new Date(),
  };
}

export function createPapiAdapter(): PapiAdapter {
  const baseUrl = process.env.PAPI_BASE_URL;
  const apiKey = process.env.PAPI_API_KEY;
  const sendPath = process.env.PAPI_SEND_MESSAGE_PATH ?? "/messages";
  return {
    provider: "papi",
    async health() {
      if (!baseUrl) return nowHealth("papi", false, "PAPI_BASE_URL não configurada");
      const started = Date.now();
      try {
        const response = await fetch(`${baseUrl.replace(/\/$/, "")}/health`, { headers: apiKey ? { "x-api-key": apiKey } : undefined });
        return nowHealth("papi", response.ok, response.ok ? "PAPI disponível" : `PAPI respondeu ${response.status}`, Date.now() - started);
      } catch (error) {
        return nowHealth("papi", false, error instanceof Error ? error.message : "Falha de conexão", Date.now() - started);
      }
    },
    async sendMessage(command: OutboundMessageCommand) {
      if (!baseUrl || !apiKey) throw new Error("PAPI não configurado");
      const resolvedInstanceId = command.instanceId ?? process.env.PAPI_INSTANCE_ID;
      if (!resolvedInstanceId) throw new Error("PAPI instanceId não informado (envie instanceId ou configure PAPI_INSTANCE_ID)");
      const instancePath = encodeURIComponent(resolvedInstanceId);
      const metadata = command.metadata ?? {};
      const messageType = command.messageType ?? "text";
      let endpoint: string;
      let payload: Record<string, unknown>;
      if (messageType === "audio") {
        endpoint = `/api/instances/${instancePath}/send-audio`;
        payload = { jid: normalizePhone(command.phone), url: command.content, ptt: metadata.ptt !== false };
      } else if (messageType === "button") {
        const buttons = metadata.buttons;
        if (!Array.isArray(buttons) || buttons.length < 1 || buttons.length > 3) throw new Error("Mensagem de botões PAPI exige de 1 a 3 botões");
        endpoint = `/api/instances/${instancePath}/send-buttons`;
        payload = { jid: normalizePhone(command.phone), text: command.content, footer: typeof metadata.footer === "string" ? metadata.footer : "", buttons, headerType: typeof metadata.headerType === "string" ? metadata.headerType : "none" };
      } else if (messageType === "text") {
        endpoint = `/api/instances/${instancePath}/send-text`;
        payload = { jid: normalizePhone(command.phone), text: command.content };
        // Preserve custom historical installations, but treat the old default /messages as deprecated.
        if (sendPath && sendPath !== "/messages") endpoint = sendPath.startsWith("/") ? sendPath : `/${sendPath}`;
      } else {
        throw new Error(`Tipo de mensagem ${messageType} ainda não é suportado pelo adapter PAPI`);
      }
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": apiKey, "Idempotency-Key": command.idempotencyKey }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error(`PAPI respondeu ${response.status}`);
      const data = await response.json() as { id?: string; messageId?: string; key?: { id?: string }; message?: { key?: { id?: string } } };
      return { externalId: String(data.id ?? data.messageId ?? data.key?.id ?? data.message?.key?.id ?? command.idempotencyKey), status: "sent" as const };
    },
    normalizeInbound: normalizePapiInbound,
  };
}

export function createMetaCloudApiAdapter(): MetaCloudApiAdapter {
  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  const version = process.env.META_GRAPH_API_VERSION ?? "v23.0";
  const baseUrl = `https://graph.facebook.com/${version}`;
  return {
    provider: "meta_cloud_api",
    async health() {
      if (!accessToken || !phoneNumberId) return nowHealth("meta_cloud_api", false, "META_WHATSAPP_ACCESS_TOKEN ou META_WHATSAPP_PHONE_NUMBER_ID não configurado");
      const started = Date.now();
      try {
        const response = await fetch(`${baseUrl}/${phoneNumberId}`, { headers: { Authorization: `Bearer ${accessToken}` } });
        return nowHealth("meta_cloud_api", response.ok, response.ok ? "WhatsApp Cloud API disponível" : `Meta respondeu ${response.status}`, Date.now() - started);
      } catch (error) {
        return nowHealth("meta_cloud_api", false, error instanceof Error ? error.message : "Falha de conexão", Date.now() - started);
      }
    },
    async sendMessage(command: OutboundMessageCommand) {
      if (!accessToken || !phoneNumberId) throw new Error("WhatsApp Cloud API não configurada");
      if (command.messageType && command.messageType !== "text") throw new Error(`WhatsApp Cloud API ainda não suporta o tipo ${command.messageType} neste worker`);
      const response = await fetch(`${baseUrl}/${phoneNumberId}/messages`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: normalizePhone(command.phone), type: "text", text: { body: command.content } }) });
      if (!response.ok) throw new Error(`Meta Cloud API respondeu ${response.status}`);
      const data = await response.json() as { messages?: Array<{ id?: string }> };
      return { externalId: String(data.messages?.[0]?.id ?? command.idempotencyKey), status: "sent" as const };
    },
    normalizeInbound: normalizeMetaInbound,
  };
}

export function getWhatsappAdapter(provider: WhatsappProvider): WhatsappAdapter {
  return provider === "meta_cloud_api" ? createMetaCloudApiAdapter() : createPapiAdapter();
}
