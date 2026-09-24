import crypto from "node:crypto";
import type { IntegrationHealth, InboundMessageEvent, MetaCloudApiAdapter, OutboundMessageCommand, PapiAdapter, WhatsappAdapter, WhatsappProvider } from "./contracts";

function nowHealth(name: "papi" | "meta_cloud_api" | "n8n", ok: boolean, detail: string, latencyMs?: number): IntegrationHealth {
  return { name, ok, detail, latencyMs, checkedAt: new Date() };
}

function normalizePhone(phone: string) {
  return phone.replace(/[^0-9]/g, "");
}

function normalizePapiInbound(event: any): InboundMessageEvent {
  return {
    eventId: String(event.eventId ?? event.id ?? crypto.randomUUID()),
    phone: normalizePhone(String(event.phone ?? event.from ?? event.sender?.phone ?? "")),
    name: event.name ?? event.sender?.name,
    content: String(event.content ?? event.text?.body ?? event.message?.text ?? ""),
    messageType: event.messageType ?? event.type ?? "text",
    receivedAt: event.receivedAt ? new Date(event.receivedAt) : new Date(),
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
  return {
    provider: "papi",
    async health() {
      if (!baseUrl) return nowHealth("papi", false, "PAPI_BASE_URL não configurada");
      const started = Date.now();
      try {
        const response = await fetch(`${baseUrl.replace(/\/$/, "")}/health`, { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined });
        return nowHealth("papi", response.ok, response.ok ? "PAPI disponível" : `PAPI respondeu ${response.status}`, Date.now() - started);
      } catch (error) {
        return nowHealth("papi", false, error instanceof Error ? error.message : "Falha de conexão", Date.now() - started);
      }
    },
    async sendMessage(command: OutboundMessageCommand) {
      if (!baseUrl || !apiKey) throw new Error("PAPI não configurado");
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/messages`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "Idempotency-Key": command.idempotencyKey }, body: JSON.stringify({ to: normalizePhone(command.phone), type: command.messageType ?? "text", text: { body: command.content } }) });
      if (!response.ok) throw new Error(`PAPI respondeu ${response.status}`);
      const data = await response.json() as { id?: string; messageId?: string };
      return { externalId: String(data.id ?? data.messageId ?? command.idempotencyKey), status: "sent" as const };
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
