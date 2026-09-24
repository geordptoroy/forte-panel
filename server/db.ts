import { and, desc, eq, gt, lt, ne, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  appointmentsTable,
  apiIdempotency,
  auditLogs,
  availability,
  contacts,
  conversations,
  messages,
  professionals,
  services,
  users,
  webhookEvents,
  whatsappChannels,
  workspaceMembers,
  workspaceSettings,
  workspaces,
  type InsertUser,
} from "../drizzle/schema";
import type { WhatsappProvider } from "./integrations/contracts";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] === undefined) continue;
    values[field] = user[field] ?? null;
    updateSet[field] = user[field] ?? null;
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  values.lastSignedIn ??= new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export const DEMO_WORKSPACE_SLUG = "forte-demo";

export async function ensureDemoWorkspace() {
  const db = await getDb();
  if (!db || process.env.DEMO_MODE === "false") return undefined;
  await db.insert(workspaces).values({
    name: "Forte Serviços Demo",
    slug: DEMO_WORKSPACE_SLUG,
    segment: "servicos",
    plan: "pro",
    timezone: "America/Sao_Paulo",
  }).onDuplicateKeyUpdate({ set: { name: "Forte Serviços Demo", updatedAt: new Date() } });
  const result = await db.select().from(workspaces).where(eq(workspaces.slug, DEMO_WORKSPACE_SLUG)).limit(1);
  return result[0];
}

export async function ensureWorkspaceMember(workspaceId: number, userId: number, role: "owner" | "admin" | "manager" | "agent" = "owner") {
  const db = await getDb();
  if (!db) return undefined;
  const existing = await db.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId))).limit(1);
  if (existing.length > 0) return existing[0];
  await db.insert(workspaceMembers).values({ workspaceId, userId, role });
  const created = await db.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId))).limit(1);
  return created[0];
}

export async function ensureDemoWhatsappChannels() {
  const db = await getDb();
  if (!db || process.env.DEMO_MODE === "false") return [];
  const workspace = await ensureDemoWorkspace();
  if (!workspace) return [];
  const existing = await db.select().from(whatsappChannels).where(eq(whatsappChannels.workspaceId, workspace.id));
  if (existing.length === 0) {
    await db.insert(whatsappChannels).values([
      { workspaceId: workspace.id, provider: "papi", name: "PAPI · WhatsApp conectado", credentialsRef: "PAPI_API_KEY", active: 1 },
      { workspaceId: workspace.id, provider: "meta_cloud_api", name: "WhatsApp Cloud API oficial", credentialsRef: "META_WHATSAPP_ACCESS_TOKEN", active: 1 },
    ]);
  }
  return db.select().from(whatsappChannels).where(eq(whatsappChannels.workspaceId, workspace.id));
}

export async function listWhatsappChannels() {
  const db = await getDb();
  if (!db) return [];
  await ensureDemoWhatsappChannels();
  const workspace = await ensureDemoWorkspace();
  if (!workspace) return [];
  return db.select().from(whatsappChannels).where(and(eq(whatsappChannels.workspaceId, workspace.id), eq(whatsappChannels.active, 1)));
}

export async function getDefaultWhatsappProvider(): Promise<WhatsappProvider> {
  const db = await getDb();
  if (!db) return "papi";
  const workspace = await ensureDemoWorkspace();
  if (!workspace) return "papi";
  const setting = await db.select().from(workspaceSettings).where(and(eq(workspaceSettings.workspaceId, workspace.id), eq(workspaceSettings.key, "default_whatsapp_provider"))).limit(1);
  return setting[0]?.value === "meta_cloud_api" ? "meta_cloud_api" : "papi";
}

export async function setDefaultWhatsappProvider(provider: WhatsappProvider) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const workspace = await ensureDemoWorkspace();
  if (!workspace) throw new Error("Workspace unavailable");
  const existing = await db.select().from(workspaceSettings).where(and(eq(workspaceSettings.workspaceId, workspace.id), eq(workspaceSettings.key, "default_whatsapp_provider"))).limit(1);
  if (existing[0]) {
    await db.update(workspaceSettings).set({ value: provider, updatedAt: new Date() }).where(eq(workspaceSettings.id, existing[0].id));
  } else {
    await db.insert(workspaceSettings).values({ workspaceId: workspace.id, key: "default_whatsapp_provider", value: provider });
  }
  return provider;
}

export async function getWorkspaceBySlug(slug: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(workspaces).where(eq(workspaces.slug, slug)).limit(1);
  return result[0];
}

export async function listWorkspaceMembers(slug = DEMO_WORKSPACE_SLUG) {
  const db = await getDb();
  if (!db) return [];
  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) return [];
  return db.select({
    id: workspaceMembers.id,
    userId: workspaceMembers.userId,
    role: workspaceMembers.role,
    active: workspaceMembers.active,
    name: users.name,
    email: users.email,
  }).from(workspaceMembers).leftJoin(users, eq(users.id, workspaceMembers.userId)).where(eq(workspaceMembers.workspaceId, workspace.id));
}

const seedContacts = [
  { phone: "5511998421104", name: "Juliana Alves", city: "São Paulo", neighborhood: "Vila Mariana", service: "Instalação de chuveiro", urgency: "Alta" as const, stage: "Triagem", aiEnabled: 0, quoteCents: 38000, preview: "Consigo enviar as fotos ainda hoje." },
  { phone: "5511987104522", name: "Marcos Ferreira", city: "São Paulo", neighborhood: "Moema", service: "Quadro elétrico", urgency: "Crítica" as const, stage: "Visita solicitada", aiEnabled: 1, quoteCents: 95000, preview: "A energia caiu novamente no apartamento." },
  { phone: "5511976512088", name: "Renata Costa", city: "São Paulo", neighborhood: "Pinheiros", service: "Tomadas e iluminação", urgency: "Média" as const, stage: "Orçamento enviado", aiEnabled: 1, quoteCents: 62000, preview: "Vou analisar o orçamento com meu marido." },
  { phone: "5511965407721", name: "Paulo Mendes", city: "São Paulo", neighborhood: "Aclimação", service: "Manutenção preventiva", urgency: "Baixa" as const, stage: "Agendado", aiEnabled: 1, quoteCents: 28000, preview: "Perfeito, nos vemos na quinta." },
  { phone: "5511954420190", name: "Camila Souza", city: "São Paulo", neighborhood: "Saúde", service: "Ventilador de teto", urgency: "Média" as const, stage: "Sem retorno", aiEnabled: 0, quoteCents: 43000, preview: "Pode me chamar quando tiver disponibilidade." },
];

const seedMessages = [
  [
    { senderType: "system" as const, direction: "system" as const, content: "Conversa iniciada pelo WhatsApp" },
    { senderType: "lead" as const, direction: "inbound" as const, content: "Oi Gabriel, preciso trocar meu chuveiro. Você atende na Vila Mariana?" },
    { senderType: "ai" as const, direction: "outbound" as const, content: "Olá, Juliana. Atendo sim. Para te orientar melhor, consegue enviar uma foto do ponto de instalação?" },
    { senderType: "lead" as const, direction: "inbound" as const, content: "Consigo enviar as fotos ainda hoje." },
  ],
  [
    { senderType: "lead" as const, direction: "inbound" as const, content: "Bom dia, a energia caiu novamente no apartamento." },
    { senderType: "ai" as const, direction: "outbound" as const, content: "Entendi, Marcos. Vou sinalizar como prioridade. Você está sem energia em todos os cômodos?" },
    { senderType: "lead" as const, direction: "inbound" as const, content: "Sim, e o disjuntor não permanece ligado." },
  ],
  [
    { senderType: "lead" as const, direction: "inbound" as const, content: "Recebi o orçamento, obrigado." },
    { senderType: "human" as const, direction: "outbound" as const, content: "Fico à disposição, Renata. Se quiser, posso explicar cada item por aqui." },
    { senderType: "lead" as const, direction: "inbound" as const, content: "Vou analisar o orçamento com meu marido." },
  ],
  [
    { senderType: "ai" as const, direction: "outbound" as const, content: "Sua manutenção ficou reservada para quinta-feira às 14:00." },
    { senderType: "lead" as const, direction: "inbound" as const, content: "Perfeito, nos vemos na quinta." },
  ],
  [
    { senderType: "lead" as const, direction: "inbound" as const, content: "Pode me chamar quando tiver disponibilidade." },
    { senderType: "system" as const, direction: "system" as const, content: "IA pausada automaticamente após 3 dias sem resposta" },
  ],
];

export async function ensureDemoInbox() {
  const db = await getDb();
  if (!db || process.env.DEMO_MODE === "false") return;
  const workspace = await ensureDemoWorkspace();
  if (!workspace) return;
  await db.update(contacts).set({ workspaceId: workspace.id }).where(sql`${contacts.workspaceId} IS NULL`);
  const existing = await db.select({ id: contacts.id }).from(contacts).limit(1);
  if (existing.length > 0) return;

  for (let index = 0; index < seedContacts.length; index += 1) {
    const seed = seedContacts[index];
    await db.insert(contacts).values({
      workspaceId: workspace.id,
      externalPhone: seed.phone,
      name: seed.name,
      city: seed.city,
      neighborhood: seed.neighborhood,
      serviceRequested: seed.service,
      urgency: seed.urgency,
      stage: seed.stage,
      aiEnabled: seed.aiEnabled,
      quoteCents: seed.quoteCents,
      unreadCount: index < 2 ? (index === 0 ? 2 : 1) : 0,
      lastMessagePreview: seed.preview,
      lastMessageAt: new Date(),
    });
    const contact = await db.select().from(contacts).where(eq(contacts.externalPhone, seed.phone)).limit(1);
    const contactId = contact[0]?.id;
    if (!contactId) continue;
    await db.insert(conversations).values({
      contactId,
      humanControlled: seed.aiEnabled ? 0 : 1,
      unreadCount: index < 2 ? (index === 0 ? 2 : 1) : 0,
      lastMessageAt: new Date(),
    });
    const conversation = await db.select().from(conversations).where(eq(conversations.contactId, contactId)).limit(1);
    const conversationId = conversation[0]?.id;
    if (!conversationId) continue;
    for (const item of seedMessages[index]) {
      await db.insert(messages).values({
        conversationId,
        direction: item.direction,
        senderType: item.senderType,
        messageType: "text",
        content: item.content,
        status: item.senderType === "system" ? "received" : "sent",
      });
    }
  }
}

const seedServices = [
  { name: "Avaliação inicial", description: "Conversa de diagnóstico e definição do próximo passo.", durationMinutes: 45, priceCents: 0 },
  { name: "Atendimento padrão", description: "Serviço principal do negócio.", durationMinutes: 60, priceCents: 18000 },
  { name: "Retorno / manutenção", description: "Acompanhamento de cliente existente.", durationMinutes: 30, priceCents: 9000 },
];

export async function ensureDemoAgenda() {
  const db = await getDb();
  if (!db || process.env.DEMO_MODE === "false") return;
  const workspace = await ensureDemoWorkspace();
  if (!workspace) return;
  await ensureDemoInbox();
  let workspaceServices = await db.select().from(services).where(eq(services.workspaceId, workspace.id));
  if (workspaceServices.length === 0) {
    for (const service of seedServices) await db.insert(services).values({ workspaceId: workspace.id, ...service });
    workspaceServices = await db.select().from(services).where(eq(services.workspaceId, workspace.id));
  }
  let workspaceProfessionals = await db.select().from(professionals).where(eq(professionals.workspaceId, workspace.id));
  if (workspaceProfessionals.length === 0) {
    await db.insert(professionals).values({ workspaceId: workspace.id, name: "Gabriel Barbosa", specialty: "Atendimento principal", color: "#56d68a" });
    workspaceProfessionals = await db.select().from(professionals).where(eq(professionals.workspaceId, workspace.id));
  }
  const existingAvailability = await db.select({ id: availability.id }).from(availability).where(eq(availability.workspaceId, workspace.id)).limit(1);
  if (existingAvailability.length === 0 && workspaceProfessionals[0]) {
    for (const weekday of [1, 2, 3, 4, 5, 6]) {
      await db.insert(availability).values({ workspaceId: workspace.id, professionalId: workspaceProfessionals[0].id, weekday, startMinute: 9 * 60, endMinute: 18 * 60 });
    }
  }
  const existingAppointments = await db.select({ id: appointmentsTable.id }).from(appointmentsTable).where(eq(appointmentsTable.workspaceId, workspace.id)).limit(1);
  if (existingAppointments.length === 0 && workspaceServices[1] && workspaceProfessionals[0]) {
    const paulo = await db.select({ id: contacts.id }).from(contacts).where(eq(contacts.externalPhone, "5511965407721")).limit(1);
    const marcos = await db.select({ id: contacts.id }).from(contacts).where(eq(contacts.externalPhone, "5511987104522")).limit(1);
    await db.insert(appointmentsTable).values([
      { workspaceId: workspace.id, contactId: paulo[0]?.id, serviceId: workspaceServices[1].id, professionalId: workspaceProfessionals[0].id, startsAt: new Date("2026-09-24T14:00:00-03:00"), endsAt: new Date("2026-09-24T15:00:00-03:00"), status: "confirmed", notes: "Manutenção preventiva." },
      { workspaceId: workspace.id, contactId: marcos[0]?.id, serviceId: workspaceServices[1].id, professionalId: workspaceProfessionals[0].id, startsAt: new Date("2026-09-26T17:30:00-03:00"), endsAt: new Date("2026-09-26T18:30:00-03:00"), status: "requested", notes: "Confirmar disponibilidade pelo WhatsApp." },
    ]);
  }
}

export async function getAgendaSnapshot() {
  const db = await getDb();
  if (!db) return { timezone: "America/Sao_Paulo", services: [], professionals: [], appointments: [] };
  await ensureDemoAgenda();
  const workspace = await ensureDemoWorkspace();
  if (!workspace) return { timezone: "America/Sao_Paulo", services: [], professionals: [], appointments: [] };
  const [workspaceServices, workspaceProfessionals, workspaceAppointments] = await Promise.all([
    db.select().from(services).where(and(eq(services.workspaceId, workspace.id), eq(services.active, 1))),
    db.select().from(professionals).where(and(eq(professionals.workspaceId, workspace.id), eq(professionals.active, 1))),
    db.select({
      id: appointmentsTable.id,
      contactId: appointmentsTable.contactId,
      serviceId: appointmentsTable.serviceId,
      professionalId: appointmentsTable.professionalId,
      startsAt: appointmentsTable.startsAt,
      endsAt: appointmentsTable.endsAt,
      status: appointmentsTable.status,
      notes: appointmentsTable.notes,
      serviceName: services.name,
      professionalName: professionals.name,
      contactName: contacts.name,
    }).from(appointmentsTable)
      .leftJoin(services, eq(services.id, appointmentsTable.serviceId))
      .leftJoin(professionals, eq(professionals.id, appointmentsTable.professionalId))
      .leftJoin(contacts, eq(contacts.id, appointmentsTable.contactId))
      .where(eq(appointmentsTable.workspaceId, workspace.id))
      .orderBy(appointmentsTable.startsAt, appointmentsTable.id),
  ]);
  return { timezone: workspace.timezone, services: workspaceServices, professionals: workspaceProfessionals, appointments: workspaceAppointments };
}

export async function createAgendaAppointment(input: { contactId?: number; serviceId: number; professionalId: number; startsAt: Date; endsAt: Date; notes?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await ensureDemoAgenda();
  const workspace = await ensureDemoWorkspace();
  if (!workspace) throw new Error("Workspace unavailable");
  const conflict = await db.select({ id: appointmentsTable.id }).from(appointmentsTable).where(and(
    eq(appointmentsTable.workspaceId, workspace.id),
    eq(appointmentsTable.professionalId, input.professionalId),
    eq(appointmentsTable.status, "confirmed"),
    lt(appointmentsTable.startsAt, input.endsAt),
    gt(appointmentsTable.endsAt, input.startsAt),
  )).limit(1);
  if (conflict.length > 0) throw new Error("Horário indisponível para este profissional");
  const result = await db.insert(appointmentsTable).values({ workspaceId: workspace.id, ...input, status: "requested", source: "panel" });
  const created = await db.select().from(appointmentsTable).where(eq(appointmentsTable.id, Number(result[0].insertId))).limit(1);
  return created[0];
}

export async function listInboxContacts() {
  const db = await getDb();
  if (!db) return [];
  await ensureDemoInbox();
  const workspace = await ensureDemoWorkspace();
  if (!workspace) return [];
  return db.select().from(contacts).where(eq(contacts.workspaceId, workspace.id)).orderBy(desc(contacts.lastMessageAt), desc(contacts.id));
}

export async function getConversationByContact(contactId: number) {
  const db = await getDb();
  if (!db) return undefined;
  await ensureDemoInbox();
  const result = await db.select().from(conversations).where(eq(conversations.contactId, contactId)).limit(1);
  return result[0];
}

export async function listMessagesForContact(contactId: number) {
  const db = await getDb();
  if (!db) return [];
  const conversation = await getConversationByContact(contactId);
  if (!conversation) return [];
  return db.select().from(messages).where(eq(messages.conversationId, conversation.id)).orderBy(messages.createdAt, messages.id);
}

export async function setContactAi(contactId: number, enabled: boolean, actorUserId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(contacts).set({ aiEnabled: enabled ? 1 : 0, updatedAt: new Date() }).where(eq(contacts.id, contactId));
  const conversation = await getConversationByContact(contactId);
  if (conversation) {
    await db.update(conversations).set({ humanControlled: enabled ? 0 : 1, updatedAt: new Date() }).where(eq(conversations.id, conversation.id));
  }
  await db.insert(auditLogs).values({ actorUserId, contactId, action: enabled ? "ai_enabled" : "ai_paused", summary: enabled ? "IA reativada pelo operador" : "IA pausada pelo operador" });
}

export async function sendManualMessage(contactId: number, content: string, actorUserId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const conversation = await getConversationByContact(contactId);
  if (!conversation) throw new Error("Conversation not found");
  const createdAt = new Date();
  await db.insert(messages).values({ conversationId: conversation.id, direction: "outbound", senderType: "human", messageType: "text", content, status: "sent", createdAt });
  await db.update(contacts).set({ aiEnabled: 0, unreadCount: 0, lastMessagePreview: content.slice(0, 500), lastMessageAt: createdAt, updatedAt: createdAt }).where(eq(contacts.id, contactId));
  await db.update(conversations).set({ humanControlled: 1, unreadCount: 0, lastMessageAt: createdAt, updatedAt: createdAt }).where(eq(conversations.id, conversation.id));
  await db.insert(auditLogs).values({ actorUserId, contactId, action: "manual_message_sent", summary: "Mensagem manual enviada em modo demo" });
  const result = await db.select().from(messages).where(and(eq(messages.conversationId, conversation.id), eq(messages.createdAt, createdAt))).orderBy(desc(messages.id)).limit(1);
  return result[0];
}

export async function moveContactStage(contactId: number, stage: string, actorUserId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(contacts).set({ stage, updatedAt: new Date() }).where(eq(contacts.id, contactId));
  await db.insert(auditLogs).values({ actorUserId, contactId, action: "stage_changed", summary: `Lead movido para ${stage}` });
}

export async function getContactById(contactId: number) {
  const db = await getDb();
  if (!db) return undefined;
  await ensureDemoInbox();
  const workspace = await ensureDemoWorkspace();
  if (!workspace) return undefined;
  const result = await db.select().from(contacts).where(and(eq(contacts.id, contactId), eq(contacts.workspaceId, workspace.id))).limit(1);
  return result[0];
}

export async function getAuditLogForContact(contactId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(auditLogs).where(eq(auditLogs.contactId, contactId)).orderBy(desc(auditLogs.createdAt), desc(auditLogs.id)).limit(20);
}

export async function countContacts() {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ count: sql<number>`count(*)` }).from(contacts);
  return Number(result[0]?.count ?? 0);
}


export async function getApiIdempotency(key: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(apiIdempotency).where(eq(apiIdempotency.key, key)).limit(1);
  return result[0];
}

export async function saveApiIdempotency(input: { key: string; fingerprint: string; statusCode: number; responseBody: unknown; workspaceId?: number }) {
  const db = await getDb();
  if (!db) return;
  await db.insert(apiIdempotency).values({
    key: input.key,
    fingerprint: input.fingerprint,
    statusCode: input.statusCode,
    responseBody: JSON.stringify(input.responseBody),
    workspaceId: input.workspaceId,
  });
}

export async function registerWebhookEvent(input: { eventId: string; provider: string; payload: unknown; workspaceId?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const existing = await db.select().from(webhookEvents).where(eq(webhookEvents.eventId, input.eventId)).limit(1);
  if (existing[0]) return { duplicate: true, event: existing[0] };
  await db.insert(webhookEvents).values({
    eventId: input.eventId,
    provider: input.provider,
    payload: JSON.stringify(input.payload),
    workspaceId: input.workspaceId,
    status: "received",
  });
  const created = await db.select().from(webhookEvents).where(eq(webhookEvents.eventId, input.eventId)).limit(1);
  return { duplicate: false, event: created[0] };
}

export async function markWebhookEvent(eventId: string, status: "processed" | "failed") {
  const db = await getDb();
  if (!db) return;
  await db.update(webhookEvents).set({ status, processedAt: new Date() }).where(eq(webhookEvents.eventId, eventId));
}

export async function ingestInboundWhatsApp(input: { eventId: string; phone: string; name?: string; content: string; messageType?: "text" | "image" | "audio" | "video" | "document"; receivedAt?: Date }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await ensureDemoInbox();
  const workspace = await ensureDemoWorkspace();
  if (!workspace) throw new Error("Workspace unavailable");
  const receivedAt = input.receivedAt ?? new Date();
  let contact = (await db.select().from(contacts).where(eq(contacts.externalPhone, input.phone)).limit(1))[0];
  if (!contact) {
    await db.insert(contacts).values({
      workspaceId: workspace.id,
      externalPhone: input.phone,
      name: input.name?.trim() || input.phone,
      urgency: "Média",
      stage: "Novo contato",
      aiEnabled: 1,
      quoteCents: 0,
      unreadCount: 1,
      lastMessagePreview: input.content.slice(0, 500),
      lastMessageAt: receivedAt,
    });
    contact = (await db.select().from(contacts).where(eq(contacts.externalPhone, input.phone)).limit(1))[0];
  } else {
    await db.update(contacts).set({
      name: input.name?.trim() || contact.name,
      unreadCount: sql`${contacts.unreadCount} + 1`,
      lastMessagePreview: input.content.slice(0, 500),
      lastMessageAt: receivedAt,
      updatedAt: receivedAt,
    }).where(eq(contacts.id, contact.id));
  }
  if (!contact) throw new Error("Contact could not be created");
  let conversation = (await db.select().from(conversations).where(eq(conversations.contactId, contact.id)).limit(1))[0];
  if (!conversation) {
    await db.insert(conversations).values({ contactId: contact.id, unreadCount: 1, lastMessageAt: receivedAt });
    conversation = (await db.select().from(conversations).where(eq(conversations.contactId, contact.id)).limit(1))[0];
  }
  if (!conversation) throw new Error("Conversation could not be created");
  const result = await db.insert(messages).values({
    conversationId: conversation.id,
    externalId: input.eventId,
    direction: "inbound",
    senderType: "lead",
    messageType: input.messageType ?? "text",
    content: input.content,
    status: "received",
    createdAt: receivedAt,
  });
  await db.update(conversations).set({ unreadCount: sql`${conversations.unreadCount} + 1`, lastMessageAt: receivedAt, updatedAt: receivedAt }).where(eq(conversations.id, conversation.id));
  return { contactId: contact.id, conversationId: conversation.id, messageId: Number(result[0].insertId) };
}


export async function upsertApiContact(input: { phone: string; name?: string; city?: string; neighborhood?: string; serviceRequested?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const workspace = await ensureDemoWorkspace();
  if (!workspace) throw new Error("Workspace unavailable");
  const existing = (await db.select().from(contacts).where(eq(contacts.externalPhone, input.phone)).limit(1))[0];
  if (existing) {
    await db.update(contacts).set({
      name: input.name?.trim() || existing.name,
      city: input.city ?? existing.city,
      neighborhood: input.neighborhood ?? existing.neighborhood,
      serviceRequested: input.serviceRequested ?? existing.serviceRequested,
      updatedAt: new Date(),
    }).where(eq(contacts.id, existing.id));
    return (await db.select().from(contacts).where(eq(contacts.id, existing.id)).limit(1))[0];
  }
  await db.insert(contacts).values({
    workspaceId: workspace.id,
    externalPhone: input.phone,
    name: input.name?.trim() || input.phone,
    city: input.city,
    neighborhood: input.neighborhood,
    serviceRequested: input.serviceRequested,
    urgency: "Média",
    stage: "Novo contato",
    aiEnabled: 1,
    quoteCents: 0,
    unreadCount: 0,
  });
  return (await db.select().from(contacts).where(eq(contacts.externalPhone, input.phone)).limit(1))[0];
}


export async function queueOutboundMessage(contactId: number, content: string, provider?: WhatsappProvider) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const selectedProvider = provider ?? await getDefaultWhatsappProvider();
  const channels = await listWhatsappChannels();
  if (channels.length > 0 && !channels.some((channel) => channel.provider === selectedProvider)) throw new Error("Provedor de WhatsApp não está ativo neste workspace");
  const conversation = await getConversationByContact(contactId);
  if (!conversation) throw new Error("Conversation not found");
  const createdAt = new Date();
  const result = await db.insert(messages).values({ conversationId: conversation.id, direction: "outbound", senderType: "human", messageType: "text", content, status: "queued", provider: selectedProvider, createdAt });
  await db.update(contacts).set({ aiEnabled: 0, unreadCount: 0, lastMessagePreview: content.slice(0, 500), lastMessageAt: createdAt, updatedAt: createdAt }).where(eq(contacts.id, contactId));
  await db.update(conversations).set({ humanControlled: 1, unreadCount: 0, lastMessageAt: createdAt, updatedAt: createdAt }).where(eq(conversations.id, conversation.id));
  await db.insert(auditLogs).values({ contactId, action: "api_message_queued", summary: "Mensagem enfileirada para o worker de WhatsApp" });
  const created = await db.select().from(messages).where(eq(messages.id, Number(result[0].insertId))).limit(1);
  return created[0];
}

export async function cancelAgendaAppointment(appointmentId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const workspace = await ensureDemoWorkspace();
  if (!workspace) throw new Error("Workspace unavailable");
  const appointment = (await db.select().from(appointmentsTable).where(and(eq(appointmentsTable.id, appointmentId), eq(appointmentsTable.workspaceId, workspace.id))).limit(1))[0];
  if (!appointment) return undefined;
  await db.update(appointmentsTable).set({ status: "cancelled", updatedAt: new Date() }).where(eq(appointmentsTable.id, appointmentId));
  return { ...appointment, status: "cancelled" as const };
}

export async function rescheduleAgendaAppointment(appointmentId: number, startsAt: Date, endsAt: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const workspace = await ensureDemoWorkspace();
  if (!workspace) throw new Error("Workspace unavailable");
  const appointment = (await db.select().from(appointmentsTable).where(and(eq(appointmentsTable.id, appointmentId), eq(appointmentsTable.workspaceId, workspace.id))).limit(1))[0];
  if (!appointment) return undefined;
  const conflict = await db.select({ id: appointmentsTable.id }).from(appointmentsTable).where(and(
    eq(appointmentsTable.workspaceId, workspace.id),
    eq(appointmentsTable.professionalId, appointment.professionalId),
    ne(appointmentsTable.id, appointmentId),
    ne(appointmentsTable.status, "cancelled"),
    lt(appointmentsTable.startsAt, endsAt),
    gt(appointmentsTable.endsAt, startsAt),
  )).limit(1);
  if (conflict.length > 0) throw new Error("Horário indisponível para este profissional");
  await db.update(appointmentsTable).set({ startsAt, endsAt, status: "requested", updatedAt: new Date() }).where(eq(appointmentsTable.id, appointmentId));
  const updated = await db.select().from(appointmentsTable).where(eq(appointmentsTable.id, appointmentId)).limit(1);
  return updated[0];
}
