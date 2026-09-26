import crypto from "node:crypto";
import express, { type Express, type Request, type Response } from "express";
import { z } from "zod";
import {
  cancelAgendaAppointment,
  createAgendaAppointment,
  getAgendaSnapshot,
  claimApiIdempotency,
  completeApiIdempotency,
  failApiIdempotency,
  getContactById,
  getActiveWorkspaceById,
  getDefaultWhatsappProvider,
  getDefaultPapiWebhook,
  getPapiWebhookById,
  getPublishedAiPrompt,
  findQueuedBatchMessage,
  ingestInboundWhatsApp,
  leadMemoryOperation,
  listMessagesForContact,
  listWhatsappChannels,
  markWebhookEvent,
  moveContactStage,
  queueOutboundMessage,
  registerWebhookEvent,
  rescheduleAgendaAppointment,
  upsertApiContact,
} from "./db";
import { professionalCanExecuteService } from "./agenda";
import { ScheduleError } from "./schedule";
import { getWhatsappAdapter } from "./integrations/whatsapp";

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
  metadata: z.object({
    instanceId: z.string().max(160).optional(),
    mediaUrl: z.string().max(4000).optional(),
    mediaMimeType: z.string().max(180).optional(),
    fileName: z.string().max(255).optional(),
    fileLength: z.number().nonnegative().optional(),
    buttonId: z.string().max(180).optional(),
    buttonText: z.string().max(500).optional(),
    isGroup: z.boolean().optional(),
  }).optional(),
  receivedAt: z.coerce.date().optional(),
});
const messageSchema = z.object({
  contactId: z.number().int().positive().optional(),
  phone: z.string().min(8).max(32).optional(),
  name: z.string().max(160).optional(),
  content: z.string().min(1).max(10000),
  provider: z.enum(["papi", "meta_cloud_api"]).optional(),
  senderType: z.enum(["ai", "human"]).optional(),
  messageType: z.enum(["text", "audio", "button"]).optional(),
  instanceId: z.string().trim().max(160).optional().transform((value) => value || undefined),
  metadata: z.object({
    buttons: z.array(z.object({ id: z.string().min(1).max(100), displayText: z.string().min(1).max(80) }).passthrough()).min(1).max(3).optional(),
    footer: z.string().max(180).optional(),
    headerType: z.enum(["none", "text", "image", "video"]).optional(),
    ptt: z.boolean().optional(),
  }).optional(),
}).refine((input) => Boolean(input.contactId || input.phone), { message: "contactId ou phone é obrigatório" })
  .refine((input) => input.messageType !== "button" || Boolean(input.metadata?.buttons?.length), { message: "Mensagem de botão exige metadata.buttons" });
const messageBatchSchema = z.object({
  messages: z.array(messageSchema).min(1).max(50),
  batchId: z.string().trim().min(1).max(180).optional(),
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

async function requireApiWorkspaceId(res: Response): Promise<number | undefined> {
  const workspaceId = Number(process.env.FORTE_API_WORKSPACE_ID);
  if (!Number.isSafeInteger(workspaceId) || workspaceId <= 0) {
    fail(res, 503, "FORTE_API_WORKSPACE_ID não configurado para a API REST", "api_workspace_not_configured");
    return undefined;
  }
  const workspace = await getActiveWorkspaceById(workspaceId);
  if (!workspace) {
    fail(res, 503, "FORTE_API_WORKSPACE_ID não corresponde a um workspace ativo", "api_workspace_not_configured");
    return undefined;
  }
  return workspaceId;
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
  const claim = await claimApiIdempotency({ key, fingerprint: hash });
  if (claim.conflict) return fail(res, 409, "A chave já foi usada com outro payload", "idempotency_conflict");
  if (claim.completed) return res.status(claim.record.statusCode).json(claim.record.responseBody ? JSON.parse(claim.record.responseBody) : { ok: true });
  if (claim.inProgress) {
    res.setHeader("Retry-After", "2");
    return fail(res, 409, "Já existe uma requisição em processamento para esta chave", "idempotency_in_progress");
  }
  if (!claim.claimed) return fail(res, 503, "Não foi possível reservar a chave de idempotência", "idempotency_unavailable");
  try {
    const result = await handler();
    await completeApiIdempotency({ key, statusCode: result.statusCode, responseBody: result.body });
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    await failApiIdempotency(key);
    throw error;
  }
}

api.get("/health", (_req, res) => res.json({ status: "ok", service: "forte-panel-api", version: "v1", timestamp: new Date().toISOString() }));

api.get("/channels", async (req, res) => {
  if (!requireApiKey(req, res)) return;
  const workspaceId = await requireApiWorkspaceId(res);
  if (!workspaceId) return;
  try {
    const channels = await listWhatsappChannels(workspaceId);
    return res.json({ data: channels.map((channel) => ({ id: channel.id, provider: channel.provider, name: channel.name, phoneNumber: channel.phoneNumber, configured: Boolean(channel.phoneNumberId || channel.credentialsRef), active: Boolean(channel.active) })) });
  } catch (error) {
    return fail(res, 500, error instanceof Error ? error.message : "Falha ao consultar canais", "internal_error");
  }
});

api.get("/onboarding/prompt", async (req, res) => {
  if (!requireApiKey(req, res)) return;
  try {
    const prompt = await getPublishedAiPrompt();
    return res.json({ data: prompt });
  } catch (error) {
    return fail(res, 500, error instanceof Error ? error.message : "Falha ao consultar prompt publicado", "internal_error");
  }
});

api.post("/lead-memory", async (req, res) => {
  if (!requireApiKey(req, res)) return;
  const parsed = leadMemorySchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "Payload da memória do lead inválido", "invalid_payload");
  const workspaceId = await requireApiWorkspaceId(res);
  if (!workspaceId) return;
  const responseMessage = parsed.data.action === "buscar_lead" ? "Estado do lead recuperado." : parsed.data.action === "atualizar_lead" ? "Estado do lead atualizado." : parsed.data.action === "criar_lead" ? "Lead criado ou já existente." : "Evento registrado.";
  try {
    const run = async () => {
      const result = await leadMemoryOperation(workspaceId, parsed.data);
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
  const workspaceId = await requireApiWorkspaceId(res);
  if (!workspaceId) return;
  try {
    return idempotent(req, res, async () => {
      const contact = await upsertApiContact(workspaceId, parsed.data);
      return { statusCode: 200, body: { data: { id: contact?.id, phone: contact?.externalPhone, name: contact?.name, stage: contact?.stage }, created: !contact?.createdAt || contact.createdAt.getTime() === contact.updatedAt.getTime() } };
    });
  } catch (error) {
    return fail(res, 500, error instanceof Error ? error.message : "Falha ao atualizar contato", "internal_error");
  }
});

api.get("/contacts/:id/messages", async (req, res) => {
  if (!requireApiKey(req, res)) return;
  const workspaceId = await requireApiWorkspaceId(res);
  if (!workspaceId) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return fail(res, 400, "ID de contato inválido", "invalid_id");
  const limit = req.query.limit ? Number(req.query.limit) : 200;
  const since = req.query.since ? new Date(String(req.query.since)) : undefined;
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) return fail(res, 400, "limit deve estar entre 1 e 500", "invalid_query");
  if (since && Number.isNaN(since.getTime())) return fail(res, 400, "since deve ser uma data ISO válida", "invalid_query");
  try {
    const contact = await getContactById(workspaceId, id);
    if (!contact) return fail(res, 404, "Contato não encontrado", "not_found");
    const messages = await listMessagesForContact(workspaceId, id, { limit, since });
    return res.json({ data: { contactId: id, phone: contact.externalPhone, count: messages.length, messages } });
  } catch (error) {
    return fail(res, 500, error instanceof Error ? error.message : "Falha ao consultar histórico", "internal_error");
  }
});

api.get("/contacts/:id", async (req, res) => {
  if (!requireApiKey(req, res)) return;
  const workspaceId = await requireApiWorkspaceId(res);
  if (!workspaceId) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return fail(res, 400, "ID de contato inválido", "invalid_id");
  try {
    const contact = await getContactById(workspaceId, id);
    if (!contact) return fail(res, 404, "Contato não encontrado", "not_found");
    return res.json({ data: { id: contact.id, phone: contact.externalPhone, name: contact.name, city: contact.city, neighborhood: contact.neighborhood, serviceRequested: contact.serviceRequested, stage: contact.stage, urgency: contact.urgency, aiEnabled: Boolean(contact.aiEnabled), quoteCents: contact.quoteCents, lastMessageAt: contact.lastMessageAt } });
  } catch (error) {
    return fail(res, 500, error instanceof Error ? error.message : "Falha ao consultar contato", "internal_error");
  }
});

api.get("/availability", async (req, res) => {
  if (!requireApiKey(req, res)) return;
  const workspaceId = await requireApiWorkspaceId(res);
  if (!workspaceId) return;
  try {
    const snapshot = await getAgendaSnapshot(workspaceId, undefined, true);
    const requestedServiceId = req.query.serviceId ? Number(req.query.serviceId) : undefined;
    const requestedProfessionalId = req.query.professionalId ? Number(req.query.professionalId) : undefined;
    const serviceId = Number.isInteger(requestedServiceId) && (requestedServiceId ?? 0) > 0 ? requestedServiceId : undefined;
    const professionalId = Number.isInteger(requestedProfessionalId) && (requestedProfessionalId ?? 0) > 0 ? requestedProfessionalId : undefined;

    /** Keeps only professionals able to execute the requested service. */
    const professionalsForService = serviceId
      ? (snapshot.serviceLinks.length > 0
        ? snapshot.serviceLinks.filter((link) => link.serviceId === serviceId && link.active === 1).map((link) => link.professionalId)
        : snapshot.professionals.map((professional) => professional.id))
      : snapshot.professionals.map((professional) => professional.id);

    const professionals = snapshot.professionals
      .filter((professional) => professionalsForService.includes(professional.id))
      .filter((professional) => !professionalId || professional.id === professionalId)
      .map((professional) => ({
        id: professional.id,
        name: professional.name,
        specialty: professional.specialty,
        color: professional.color,
        serviceIds: snapshot.serviceLinks.filter((link) => link.professionalId === professional.id && link.active === 1).map((link) => link.serviceId),
        weeklyAvailability: snapshot.availability
          .filter((window) => window.professionalId === professional.id)
          .map((window) => ({ weekday: window.weekday, startMinute: window.startMinute, endMinute: window.endMinute })),
      }));

    const services = snapshot.services
      .filter((service) => !serviceId || service.id === serviceId)
      .map((service) => ({
        id: service.id,
        name: service.name,
        description: service.description,
        durationMinutes: service.durationMinutes,
        priceCents: service.priceCents,
        professionalIds: snapshot.serviceLinks.filter((link) => link.serviceId === service.id && link.active === 1).map((link) => link.professionalId),
      }));

    const now = Date.now();
    const appointments = snapshot.appointments
      .filter((appointment) => appointment.status !== "cancelled")
      .filter((appointment) => new Date(appointment.endsAt).getTime() >= now)
      .filter((appointment) => !professionalId || appointment.professionalId === professionalId)
      .map((appointment) => ({
        id: appointment.id,
        serviceId: appointment.serviceId,
        professionalId: appointment.professionalId,
        startsAt: appointment.startsAt,
        endsAt: appointment.endsAt,
        status: appointment.status,
        serviceName: appointment.serviceName,
        professionalName: appointment.professionalName,
        contactName: appointment.contactName,
      }));

    return res.json({ timezone: snapshot.timezone, services, professionals, appointments });
  } catch (error) {
    return fail(res, 500, error instanceof Error ? error.message : "Falha ao consultar disponibilidade", "internal_error");
  }
});

api.post("/appointments", async (req, res) => {
  if (!requireApiKey(req, res)) return;
  const workspaceId = await requireApiWorkspaceId(res);
  if (!workspaceId) return;
  const parsed = appointmentSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "Payload de agendamento inválido", "invalid_payload");
  if (parsed.data.endsAt <= parsed.data.startsAt) return fail(res, 400, "O horário final precisa ser maior que o inicial", "invalid_period");
  try {
    return await idempotent(req, res, async () => {
      const allowed = await professionalCanExecuteService(workspaceId, parsed.data.professionalId, parsed.data.serviceId);
      if (!allowed) return { statusCode: 409, body: { error: "service_not_linked", message: "Este profissional não executa o serviço informado" } };
      const appointment = await createAgendaAppointment(workspaceId, parsed.data);
      return { statusCode: 201, body: { data: { id: appointment?.id, status: appointment?.status, startsAt: appointment?.startsAt, endsAt: appointment?.endsAt } } };
    });
  } catch (error) {
    if (error instanceof ScheduleError) {
      return fail(res, error.reason === "invalid_period" ? 400 : 409, error.message, error.reason);
    }
    const message = error instanceof Error ? error.message : "Falha ao criar agendamento";
    return fail(res, message.includes("indisponível") ? 409 : 500, message, message.includes("indisponível") ? "schedule_conflict" : "internal_error");
  }
});

api.post("/messages", async (req, res) => {
  if (!requireApiKey(req, res)) return;
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "Payload de mensagem inválido", "invalid_payload");
  const idempotencyKey = req.header("Idempotency-Key");
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 180) return fail(res, 400, "Idempotency-Key é obrigatório", "idempotency_key_required");
  const workspaceId = await requireApiWorkspaceId(res);
  if (!workspaceId) return;
  try {
    return idempotent(req, res, async () => {
      const contact = parsed.data.contactId
        ? await getContactById(workspaceId, parsed.data.contactId)
        : await upsertApiContact(workspaceId, { phone: String(parsed.data.phone).replace(/[^0-9]/g, ""), name: parsed.data.name });
      if (!contact) return { statusCode: 404, body: { error: "not_found", message: "Contato não encontrado" } };
      const provider = parsed.data.provider ?? await getDefaultWhatsappProvider(workspaceId);
      const senderType = parsed.data.senderType ?? "human";
      const messageType = parsed.data.messageType ?? "text";
      if (provider === "meta_cloud_api" && messageType !== "text") return { statusCode: 422, body: { error: "unsupported_message_type", message: "Este tipo de mensagem ainda não é suportado pela Meta Cloud API neste worker" } };
      const defaultPapiWebhook = provider === "papi" ? await getDefaultPapiWebhook(workspaceId) : undefined;
      if (provider === "papi" && !parsed.data.instanceId && !defaultPapiWebhook?.instanceId) return { statusCode: 422, body: { error: "papi_instance_required", message: "Informe instanceId do PAPI ou associe uma instância em Canais conectados" } };
      const message = await queueOutboundMessage(workspaceId, contact.id, parsed.data.content, provider, senderType, messageType, { ...(parsed.data.metadata ?? {}), ...(parsed.data.instanceId ? { instanceId: parsed.data.instanceId } : {}) });
      return { statusCode: 202, body: { data: { id: message?.id, contactId: contact.id, provider, senderType, messageType, status: "queued" } } };
    });
  } catch (error) {
    return fail(res, 500, error instanceof Error ? error.message : "Falha ao enfileirar mensagem", "internal_error");
  }
});

api.post("/messages/batch", async (req, res) => {
  if (!requireApiKey(req, res)) return;
  const parsed = messageBatchSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "Payload de mensagens em lote inválido", "invalid_payload");
  const idempotencyKey = req.header("Idempotency-Key");
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 180) return fail(res, 400, "Idempotency-Key é obrigatório", "idempotency_key_required");
  const workspaceId = await requireApiWorkspaceId(res);
  if (!workspaceId) return;
  try {
    return idempotent(req, res, async () => {
      const results: Array<Record<string, unknown>> = [];
      for (let index = 0; index < parsed.data.messages.length; index += 1) {
        const item = parsed.data.messages[index];
        const contact = item.contactId
          ? await getContactById(workspaceId, item.contactId)
          : await upsertApiContact(workspaceId, { phone: String(item.phone).replace(/[^0-9]/g, ""), name: item.name });
        if (!contact) return { statusCode: 404, body: { error: "not_found", message: `Contato não encontrado no item ${index + 1}` } };
        const provider = item.provider ?? await getDefaultWhatsappProvider(workspaceId);
        const senderType = item.senderType ?? "ai";
        const messageType = item.messageType ?? "text";
        if (provider === "meta_cloud_api" && messageType !== "text") return { statusCode: 422, body: { error: "unsupported_message_type", message: `Tipo não suportado no item ${index + 1}` } };
        const defaultPapiWebhook = provider === "papi" ? await getDefaultPapiWebhook(workspaceId) : undefined;
        if (provider === "papi" && !item.instanceId && !defaultPapiWebhook?.instanceId) return { statusCode: 422, body: { error: "papi_instance_required", message: `Informe instanceId no item ${index + 1} ou associe uma instância em Canais conectados` } };
        const batchId = parsed.data.batchId ?? req.header("Idempotency-Key") ?? `request-${Date.now()}`;
        const existing = await findQueuedBatchMessage(workspaceId, contact.id, batchId, index);
        const message = existing ?? await queueOutboundMessage(workspaceId, contact.id, item.content, provider, senderType, messageType, { ...(item.metadata ?? {}), batchId, batchIndex: index, ...(item.instanceId ? { instanceId: item.instanceId } : {}) });
        results.push({ id: message?.id, contactId: contact.id, provider, senderType, messageType, status: "queued", index });
      }
      return { statusCode: 202, body: { accepted: true, count: results.length, data: results } };
    });
  } catch (error) {
    return fail(res, 500, error instanceof Error ? error.message : "Falha ao enfileirar lote de mensagens", "internal_error");
  }
});

api.patch("/contacts/:id/stage", async (req, res) => {
  if (!requireApiKey(req, res)) return;
  const id = Number(req.params.id);
  const parsed = stageSchema.safeParse(req.body);
  if (!Number.isInteger(id) || id <= 0) return fail(res, 400, "ID de contato inválido", "invalid_id");
  if (!parsed.success) return fail(res, 400, "Payload de estágio inválido", "invalid_payload");
  const workspaceId = await requireApiWorkspaceId(res);
  if (!workspaceId) return;
  try {
    return idempotent(req, res, async () => {
      const contact = await getContactById(workspaceId, id);
      if (!contact) return { statusCode: 404, body: { error: "not_found", message: "Contato não encontrado" } };
      await moveContactStage(workspaceId, id, parsed.data.stage);
      return { statusCode: 200, body: { data: { id, stage: parsed.data.stage } } };
    });
  } catch (error) {
    return fail(res, 500, error instanceof Error ? error.message : "Falha ao mover estágio", "internal_error");
  }
});

api.post("/appointments/:id/cancel", async (req, res) => {
  if (!requireApiKey(req, res)) return;
  const workspaceId = await requireApiWorkspaceId(res);
  if (!workspaceId) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return fail(res, 400, "ID de agendamento inválido", "invalid_id");
  try {
    return idempotent(req, res, async () => {
      const appointment = await cancelAgendaAppointment(workspaceId, id);
      if (!appointment) return { statusCode: 404, body: { error: "not_found", message: "Agendamento não encontrado" } };
      return { statusCode: 200, body: { data: { id, status: "cancelled" } } };
    });
  } catch (error) {
    return fail(res, 500, error instanceof Error ? error.message : "Falha ao cancelar agendamento", "internal_error");
  }
});

api.post("/appointments/:id/reschedule", async (req, res) => {
  if (!requireApiKey(req, res)) return;
  const workspaceId = await requireApiWorkspaceId(res);
  const id = Number(req.params.id);
  const parsed = rescheduleSchema.safeParse(req.body);
  if (!Number.isInteger(id) || id <= 0) return fail(res, 400, "ID de agendamento inválido", "invalid_id");
  if (!workspaceId) return;
  if (!parsed.success) return fail(res, 400, "Payload de reagendamento inválido", "invalid_payload");
  try {
    return await idempotent(req, res, async () => {
      const appointment = await rescheduleAgendaAppointment(workspaceId, id, parsed.data.startsAt, parsed.data.endsAt);
      if (!appointment) return { statusCode: 404, body: { error: "not_found", message: "Agendamento não encontrado" } };
      return { statusCode: 200, body: { data: { id, status: appointment.status, startsAt: appointment.startsAt, endsAt: appointment.endsAt } } };
    });
  } catch (error) {
    if (error instanceof ScheduleError) {
      return fail(res, error.reason === "invalid_period" ? 400 : 409, error.message, error.reason);
    }
    const message = error instanceof Error ? error.message : "Falha ao reagendar";
    return fail(res, message.includes("indisponível") ? 409 : 500, message, message.includes("indisponível") ? "schedule_conflict" : "internal_error");
  }
});

api.post("/webhooks/inbound/whatsapp", async (req, res) => {
  if (!hasValidWebhookSignature(req) && !requireApiKey(req, res)) return;
  const parsed = webhookSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "Evento de WhatsApp inválido", "invalid_payload");
  const idempotencyKey = req.header("Idempotency-Key");
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 180) return fail(res, 400, "Idempotency-Key é obrigatório", "idempotency_key_required");
  if (idempotencyKey !== parsed.data.eventId) return fail(res, 409, "Idempotency-Key deve corresponder ao eventId", "idempotency_conflict");
  const workspaceId = await requireApiWorkspaceId(res);
  if (!workspaceId) return;
  try {
    const registered = await registerWebhookEvent({ eventId: parsed.data.eventId, provider: "whatsapp", payload: parsed.data, workspaceId });
    if (registered.conflict) return fail(res, 409, "O eventId já foi usado com outro payload", "idempotency_conflict");
    if (registered.duplicate) return res.status(200).json({ accepted: true, duplicate: true, eventId: parsed.data.eventId });
    const result = await ingestInboundWhatsApp(workspaceId, parsed.data);
    await markWebhookEvent(parsed.data.eventId, "processed");
    return res.status(202).json({ accepted: true, duplicate: result.duplicate === true, eventId: parsed.data.eventId, data: result });
  } catch (error) {
    await markWebhookEvent(parsed.data.eventId, "failed");
    return fail(res, 500, error instanceof Error ? error.message : "Falha ao processar webhook", "internal_error");
  }
});

async function handlePapiWebhook(req: Request, res: Response, webhookId?: string) {
  const workspaceId = await requireApiWorkspaceId(res);
  if (!workspaceId) return;
  const webhook = webhookId ? await getPapiWebhookById(webhookId, workspaceId) : undefined;
  if (webhookId && !webhook) return fail(res, 404, "Webhook PAPI não encontrado", "papi_webhook_not_found");
  const configuredSecret = webhook?.secret?.trim() || process.env.PAPI_WEBHOOK_SECRET?.trim();
  const providedSecret = req.header("X-PAPI-Webhook-Secret") ?? req.header("X-Webhook-Secret") ?? "";
  const secretAccepted = Boolean(
    configuredSecret &&
    providedSecret &&
    configuredSecret.length === providedSecret.length &&
    crypto.timingSafeEqual(Buffer.from(configuredSecret), Buffer.from(providedSecret)),
  );
  if (!secretAccepted && !hasValidWebhookSignature(req) && !requireApiKey(req, res)) return;
  let eventId = "papi-unknown-event";
  try {
    const normalized = getWhatsappAdapter("papi").normalizeInbound(req.body);
    const instanceId = webhook?.instanceId || (normalized.metadata?.instanceId as string | undefined);
    eventId = normalized.eventId;
    if (normalized.metadata?.isGroup === true) return res.status(202).json({ accepted: true, ignored: true, reason: "group_message", eventId: normalized.eventId });
    if (normalized.phone.length < 8 || !normalized.content.trim()) return fail(res, 400, "Evento PAPI sem telefone ou conteúdo", "invalid_payload");
    const registered = await registerWebhookEvent({ eventId: normalized.eventId, provider: "papi", payload: req.body, workspaceId });
    if (registered.conflict) return fail(res, 409, "O evento PAPI já foi usado com outro payload", "idempotency_conflict");
    if (registered.duplicate) return res.status(200).json({ accepted: true, duplicate: true, eventId: normalized.eventId });
    const result = await ingestInboundWhatsApp(workspaceId, { ...normalized, metadata: { ...(normalized.metadata ?? {}), ...(instanceId ? { instanceId } : {}), fromMe: normalized.fromMe === true } });
    await markWebhookEvent(normalized.eventId, "processed");
    return res.status(202).json({ accepted: true, duplicate: result.duplicate === true, eventId: normalized.eventId, instanceId, data: result });
  } catch (error) {
    await markWebhookEvent(eventId, "failed");
    return fail(res, 500, error instanceof Error ? error.message : "Falha ao processar webhook PAPI", "internal_error");
  }
}

api.post("/webhooks/providers/papi/:webhookId", async (req, res) => handlePapiWebhook(req, res, req.params.webhookId));
api.post("/webhooks/providers/papi", async (req, res) => handlePapiWebhook(req, res));

export function registerApiRoutes(app: Express) {
  app.use("/api/v1", api);
}
