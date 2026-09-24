import crypto from "node:crypto";
import express, { type Express, type Request, type Response } from "express";
import { z } from "zod";
import {
  cancelAgendaAppointment,
  createAgendaAppointment,
  getAgendaSnapshot,
  getApiIdempotency,
  getContactById,
  getDefaultWhatsappProvider,
  ingestInboundWhatsApp,
  leadMemoryOperation,
  listWhatsappChannels,
  markWebhookEvent,
  moveContactStage,
  queueOutboundMessage,
  registerWebhookEvent,
  rescheduleAgendaAppointment,
  saveApiIdempotency,
  upsertApiContact,
} from "./db";

const api = express.Router();
const contactSchema = z.object({
  phone: z.string().min(8).max(32),
  name: z.string().max(160).optional(),
  city: z.string().max(100).optional(),
  neighborhood: z.string().max(100).optional(),
  serviceRequested: z.string().max(180).optional(),
});
const appointmentSchema = z.object({
  contactId: z.number().int().positive().optional(),
  serviceId: z.number().int().positive(),
  professionalId: z.number().int().positive(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  notes: z.string().max(500).optional(),
});
const webhookSchema = z.object({
  eventId: z.string().min(3).max(180),
  phone: z.string().min(8).max(32),
  name: z.string().max(160).optional(),
  content: z.string().min(1).max(10000),
  messageType: z.enum(["text", "image", "audio", "video", "document"]).optional(),
  receivedAt: z.coerce.date().optional(),
});
const messageSchema = z.object({
  contactId: z.number().int().positive(),
  content: z.string().min(1).max(10000),
  provider: z.enum(["papi", "meta_cloud_api"]).optional(),
});
const stageSchema = z.object({ stage: z.string().min(1).max(80) });
const rescheduleSchema = z.object({ startsAt: z.coerce.date(), endsAt: z.coerce.date() });
const leadMemorySchema = z.object({
  action: z.enum(["buscar_lead", "criar_lead", "atualizar_lead", "registrar_nota"]),
  phone: z.string().min(8).max(32),
  name: z.string().max(160).optional(),
  city: z.string().max(100).optional(),
  neighborhood: z.string().max(100).optional(),
  serviceRequested: z.string().max(180).optional(),
  fields: z.object({
    name: z.string().max(160).optional(),
    city: z.string().max(100).optional(),
    neighborhood: z.string().max(100).optional(),
    serviceRequested: z.string().max(180).optional(),
    urgency: z.enum(["Baixa", "Média", "Alta", "Crítica"]).optional(),
    stage: z.string().max(80).optional(),
    quoteCents: z.number().int().nonnegative().optional(),
    aiEnabled: z.boolean().optional(),
  }).optional(),
  note: z.string().max(5000).optional(),
});

type ApiResult = { statusCode: number; body: Record<string, unknown> };

function fingerprint(body: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(body ?? null)).digest("hex");
}

function fail(res: Response, statusCode: number, message: string, error = "request_error") {
  return res.status(statusCode).json({ error, message });
}

function requireApiKey(req: Request, res: Response) {
  const expected = process.env.FORTE_API_KEY;
  if (!expected) {
    fail(res, 503, "FORTE_API_KEY não configurada no servidor", "api_not_configured");
    return false;
  }
  const provided = req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!provided || provided.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
    fail(res, 401, "Credencial de API inválida", "unauthorized");
    return false;
  }
  return true;
}

function hasValidWebhookSignature(req: Request) {
  const secret = process.env.WEBHOOK_SIGNING_SECRET;
  if (!secret) return false;
  const provided = req.header("X-Webhook-Signature") ?? "";
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(JSON.stringify(req.body ?? {})).digest("hex")}`;
  return provided.length === expected.length && crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

async function idempotent(req: Request, res: Response, handler: () => Promise<ApiResult>) {
  const key = req.header("Idempotency-Key");
  if (!key || key.length < 8 || key.length > 180) return fail(res, 400, "Idempotency-Key é obrigatório", "idempotency_key_required");
  const hash = fingerprint(req.body);
  const previous = await getApiIdempotency(key);
  if (previous) {
    if (previous.fingerprint !== hash) return fail(res, 409, "A chave já foi usada com outro payload", "idempotency_conflict");
    return res.status(previous.statusCode).json(previous.responseBody ? JSON.parse(previous.responseBody) : { ok: true });
  }
  const result = await handler();
  await saveApiIdempotency({ key, fingerprint: hash, statusCode: result.statusCode, responseBody: result.body });
  return res.status(result.statusCode).json(result.body);
}

api.get("/health", (_req, res) => res.json({ status: "ok", service: "forte-panel-api", version: "v1", timestamp: new Date().toISOString() }));

api.get("/channels", async (req, res) => {
  if (!requireApiKey(req, res)) return;
  try {
    const channels = await listWhatsappChannels();
    return res.json({ data: channels.map((channel) => ({ id: channel.id, provider: channel.provider, name: channel.name, phoneNumber: channel.phoneNumber, configured: Boolean(channel.phoneNumberId || channel.credentialsRef), active: Boolean(channel.active) })) });
  } catch (error) {
    return fail(res, 500, error instanceof Error ? error.message : "Falha ao consultar canais", "internal_error");
  }
});

api.post("/lead-memory", async (req, res) => {
  if (!requireApiKey(req, res)) return;
  const parsed = leadMemorySchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "Payload da memória do lead inválido", "invalid_payload");
  const responseMessage = parsed.data.action === "buscar_lead" ? "Estado do lead recuperado." : parsed.data.action === "atualizar_lead" ? "Estado do lead atualizado." : parsed.data.action === "criar_lead" ? "Lead criado ou já existente." : "Evento registrado.";
  try {
    const run = async () => {
      const result = await leadMemoryOperation(parsed.data);
      return { statusCode: 200, body: { success: true, acao: parsed.data.action, telefone: parsed.data.phone.replace(/[^0-9]/g, ""), resultado: result, mensagem: responseMessage } };
    };
    if (parsed.data.action === "buscar_lead") return res.json((await run()).body);
    return idempotent(req, res, run);
  } catch (error) {
    return fail(res, 500, error instanceof Error ? error.message : "Falha na memória do lead", "internal_error");
  }
});

api.post("/contacts/upsert", async (req, res) => {
  if (!requireApiKey(req, res)) return;
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "Payload de contato inválido", "invalid_payload");
  try {
    return idempotent(req, res, async () => {
      const contact = await upsertApiContact(parsed.data);
      return { statusCode: 200, body: { data: { id: contact?.id, phone: contact?.externalPhone, name: contact?.name, stage: contact?.stage }, created: !contact?.createdAt || contact.createdAt.getTime() === contact.updatedAt.getTime() } };
    });
  } catch (error) {
    return fail(res, 500, error instanceof Error ? error.message : "Falha ao atualizar contato", "internal_error");
  }
});

api.get("/contacts/:id", async (req, res) => {
  if (!requireApiKey(req, res)) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return fail(res, 400, "ID de contato inválido", "invalid_id");
  try {
    const contact = await getContactById(id);
    if (!contact) return fail(res, 404, "Contato não encontrado", "not_found");
    return res.json({ data: { id: contact.id, phone: contact.externalPhone, name: contact.name, city: contact.city, neighborhood: contact.neighborhood, serviceRequested: contact.serviceRequested, stage: contact.stage, urgency: contact.urgency, aiEnabled: Boolean(contact.aiEnabled), quoteCents: contact.quoteCents, lastMessageAt: contact.lastMessageAt } });
  } catch (error) {
    return fail(res, 500, error instanceof Error ? error.message : "Falha ao consultar contato", "internal_error");
  }
});

api.get("/availability", async (req, res) => {
  if (!requireApiKey(req, res)) return;
  try {
    const snapshot = await getAgendaSnapshot();
    return res.json({ timezone: snapshot.timezone, services: snapshot.services, professionals: snapshot.professionals, appointments: snapshot.appointments });
  } catch (error) {
    return fail(res, 500, error instanceof Error ? error.message : "Falha ao consultar disponibilidade", "internal_error");
  }
});

api.post("/appointments", async (req, res) => {
  if (!requireApiKey(req, res)) return;
  const parsed = appointmentSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "Payload de agendamento inválido", "invalid_payload");
  try {
    return idempotent(req, res, async () => {
      const appointment = await createAgendaAppointment(parsed.data);
      return { statusCode: 201, body: { data: { id: appointment?.id, status: appointment?.status, startsAt: appointment?.startsAt, endsAt: appointment?.endsAt } } };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao criar agendamento";
    return fail(res, message.includes("indisponível") ? 409 : 500, message, message.includes("indisponível") ? "schedule_conflict" : "internal_error");
  }
});

api.post("/messages", async (req, res) => {
  if (!requireApiKey(req, res)) return;
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "Payload de mensagem inválido", "invalid_payload");
  try {
    return idempotent(req, res, async () => {
      const contact = await getContactById(parsed.data.contactId);
      if (!contact) return { statusCode: 404, body: { error: "not_found", message: "Contato não encontrado" } };
      const provider = parsed.data.provider ?? await getDefaultWhatsappProvider();
      const message = await queueOutboundMessage(parsed.data.contactId, parsed.data.content, provider);
      return { statusCode: 202, body: { data: { id: message?.id, contactId: parsed.data.contactId, provider, status: "queued" } } };
    });
  } catch (error) {
    return fail(res, 500, error instanceof Error ? error.message : "Falha ao enfileirar mensagem", "internal_error");
  }
});

api.patch("/contacts/:id/stage", async (req, res) => {
  if (!requireApiKey(req, res)) return;
  const id = Number(req.params.id);
  const parsed = stageSchema.safeParse(req.body);
  if (!Number.isInteger(id) || id <= 0) return fail(res, 400, "ID de contato inválido", "invalid_id");
  if (!parsed.success) return fail(res, 400, "Payload de estágio inválido", "invalid_payload");
  try {
    return idempotent(req, res, async () => {
      const contact = await getContactById(id);
      if (!contact) return { statusCode: 404, body: { error: "not_found", message: "Contato não encontrado" } };
      await moveContactStage(id, parsed.data.stage);
      return { statusCode: 200, body: { data: { id, stage: parsed.data.stage } } };
    });
  } catch (error) {
    return fail(res, 500, error instanceof Error ? error.message : "Falha ao mover estágio", "internal_error");
  }
});

api.post("/appointments/:id/cancel", async (req, res) => {
  if (!requireApiKey(req, res)) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return fail(res, 400, "ID de agendamento inválido", "invalid_id");
  try {
    return idempotent(req, res, async () => {
      const appointment = await cancelAgendaAppointment(id);
      if (!appointment) return { statusCode: 404, body: { error: "not_found", message: "Agendamento não encontrado" } };
      return { statusCode: 200, body: { data: { id, status: "cancelled" } } };
    });
  } catch (error) {
    return fail(res, 500, error instanceof Error ? error.message : "Falha ao cancelar agendamento", "internal_error");
  }
});

api.post("/appointments/:id/reschedule", async (req, res) => {
  if (!requireApiKey(req, res)) return;
  const id = Number(req.params.id);
  const parsed = rescheduleSchema.safeParse(req.body);
  if (!Number.isInteger(id) || id <= 0) return fail(res, 400, "ID de agendamento inválido", "invalid_id");
  if (!parsed.success) return fail(res, 400, "Payload de reagendamento inválido", "invalid_payload");
  try {
    return idempotent(req, res, async () => {
      const appointment = await rescheduleAgendaAppointment(id, parsed.data.startsAt, parsed.data.endsAt);
      if (!appointment) return { statusCode: 404, body: { error: "not_found", message: "Agendamento não encontrado" } };
      return { statusCode: 200, body: { data: { id, status: appointment.status, startsAt: appointment.startsAt, endsAt: appointment.endsAt } } };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao reagendar";
    return fail(res, message.includes("indisponível") ? 409 : 500, message, message.includes("indisponível") ? "schedule_conflict" : "internal_error");
  }
});

api.post("/webhooks/inbound/whatsapp", async (req, res) => {
  if (!hasValidWebhookSignature(req) && !requireApiKey(req, res)) return;
  const parsed = webhookSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "Evento de WhatsApp inválido", "invalid_payload");
  try {
    const registered = await registerWebhookEvent({ eventId: parsed.data.eventId, provider: "whatsapp", payload: parsed.data });
    if (registered.duplicate) return res.status(200).json({ accepted: true, duplicate: true, eventId: parsed.data.eventId });
    const result = await ingestInboundWhatsApp(parsed.data);
    await markWebhookEvent(parsed.data.eventId, "processed");
    return res.status(202).json({ accepted: true, duplicate: false, eventId: parsed.data.eventId, data: result });
  } catch (error) {
    await markWebhookEvent(parsed.data.eventId, "failed");
    return fail(res, 500, error instanceof Error ? error.message : "Falha ao processar webhook", "internal_error");
  }
});

export function registerApiRoutes(app: Express) {
  app.use("/api/v1", api);
}
