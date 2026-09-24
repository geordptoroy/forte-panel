import crypto from "node:crypto";
import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, lte, ne, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  appointmentsTable,
  apiIdempotency,
  auditLogs,
  availability,
  contactNotes,
  contacts,
  conversations,
  domainEvents,
  messages,
  notifications,
  professionals,
  professionalServices,
  quotes,
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
import { createN8nAdapter } from "./integrations/n8n";
import { getWhatsappAdapter } from "./integrations/whatsapp";
import { ENV } from "./_core/env";
import { assertWithinWorkingHours, getLocalDayBounds, ScheduleError } from "./schedule";
import { dailySummaryEventKey, dailySummaryFor, notificationForEvent, notificationPreferenceForEvent, parseNotificationPreferences, type NotificationEvent } from "./notification-contract";

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: Pool | null = null;

export async function getDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!_db && connectionString && /^postgres(ql)?:\/\//i.test(connectionString)) {
    try {
      _pool = new Pool({ connectionString, max: 10 });
      _db = drizzle(_pool);
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
  const existingUser = (await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.openId, user.openId)).limit(1))[0];
  const anyAdmin = (await db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(1))[0];
  const canBootstrapAdmin = !anyAdmin && !existingUser;
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
  } else if (existingUser?.role === "admin" || (user.openId === ENV.ownerOpenId && canBootstrapAdmin)) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  values.lastSignedIn ??= new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onConflictDoUpdate({ target: users.openId, set: updateSet });
  const persisted = await db.select({ id: users.id }).from(users).where(eq(users.openId, user.openId)).limit(1);
  const workspace = await ensureDemoWorkspace();
  if (persisted[0] && workspace) await ensureWorkspaceMember(workspace.id, persisted[0].id, "owner");
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

function hashLocalPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyLocalPassword(password: string, stored: string | null) {
  if (!stored) return false;
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64).toString("hex");
  return actual.length === expected.length && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1);
  return result[0];
}

export async function getUserById(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return result[0];
}

export async function setLocalPassword(userId: number, password: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(users).set({ passwordHash: hashLocalPassword(password), updatedAt: new Date() }).where(eq(users.id, userId));
}

export async function touchLastSignedIn(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, userId));
}

export async function createLocalWorkspaceMember(input: {
  name: string;
  email: string;
  password: string;
  role: "owner" | "admin" | "manager" | "agent";
  operationalRole: "human_attendant" | "ai_attendant" | "professional";
  professionalId?: number;
}, actorUserId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const workspace = await ensureDemoWorkspace();
  if (!workspace) throw new Error("Workspace unavailable");
  const email = input.email.trim().toLowerCase();
  const existing = await getUserByEmail(email);
  if (existing) throw new Error("Já existe uma conta com este e-mail");
  if (input.operationalRole === "professional" && !input.professionalId) {
    throw new Error("Profissional executor precisa estar vinculado a um profissional cadastrado");
  }
  if (input.professionalId) {
    const professional = (await db.select({ id: professionals.id }).from(professionals).where(and(eq(professionals.id, input.professionalId), eq(professionals.workspaceId, workspace.id))).limit(1))[0];
    if (!professional) throw new Error("Profissional não pertence a este workspace");
  }
  const [user] = await db.insert(users).values({
    openId: `local_${crypto.randomUUID()}`,
    name: input.name.trim(),
    email,
    loginMethod: "local",
    role: input.role === "admin" ? "admin" : "user",
    passwordHash: hashLocalPassword(input.password),
    operationalRole: input.operationalRole,
  }).returning();
  if (!user) throw new Error("Não foi possível criar a conta");
  await db.insert(workspaceMembers).values({
    workspaceId: workspace.id,
    userId: user.id,
    role: input.role,
    professionalId: input.operationalRole === "professional" ? input.professionalId ?? null : null,
  });
  await db.insert(auditLogs).values({
    actorUserId,
    action: "member_created",
    summary: `Conta ${email} criada com papel ${input.role} e perfil ${input.operationalRole}`,
  });
  return user;
}

export async function getWorkspaceMemberForUser(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const workspace = await ensureDemoWorkspace();
  if (!workspace) return undefined;
  const result = await db.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspace.id), eq(workspaceMembers.userId, userId), eq(workspaceMembers.active, 1))).limit(1);
  return result[0];
}

export async function listProfessionals() {
  const db = await getDb();
  const workspace = await ensureDemoWorkspace();
  if (!db || !workspace) return [];
  return db.select().from(professionals).where(and(eq(professionals.workspaceId, workspace.id), eq(professionals.active, 1))).orderBy(asc(professionals.name));
}

export async function createProfessional(input: { name: string; specialty?: string; color?: string }) {
  const db = await getDb();
  const workspace = await ensureDemoWorkspace();
  if (!db || !workspace) throw new Error("Workspace unavailable");
  const [professional] = await db.insert(professionals).values({ workspaceId: workspace.id, name: input.name.trim(), specialty: input.specialty?.trim() || null, color: input.color ?? "#56d68a" }).returning();
  return professional;
}

export async function linkProfessionalService(professionalId: number, serviceId: number) {
  const db = await getDb();
  const workspace = await ensureDemoWorkspace();
  if (!db || !workspace) throw new Error("Workspace unavailable");
  await db.insert(professionalServices).values({ workspaceId: workspace.id, professionalId, serviceId, active: 1 }).onConflictDoUpdate({ target: [professionalServices.workspaceId, professionalServices.professionalId, professionalServices.serviceId], set: { active: 1 } });
}

export const DEMO_WORKSPACE_SLUG = "forte-demo";

export type DomainEventName =
  | "message.received"
  | "message.sent"
  | "contact.created"
  | "stage.changed"
  | "appointment.created"
  | "appointment.confirmed"
  | "appointment.cancelled"
  | "task.due";

export async function enqueueDomainEvent(input: {
  workspaceId: number;
  event: DomainEventName;
  aggregateType: string;
  aggregateId?: number;
  payload: Record<string, unknown>;
  eventKey?: string;
}) {
  const db = await getDb();
  if (!db) return undefined;
  const eventKey = input.eventKey ?? `${input.event}:${input.aggregateType}:${input.aggregateId ?? crypto.randomUUID()}`;
  return db.transaction(async (tx) => {
    const created = await tx.insert(domainEvents).values({
      workspaceId: input.workspaceId,
      eventKey,
      eventType: input.event,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      payload: JSON.stringify(input.payload),
    }).onConflictDoNothing({ target: domainEvents.eventKey }).returning();
    if (!created[0]) {
      const existing = await tx.select().from(domainEvents).where(eq(domainEvents.eventKey, eventKey)).limit(1);
      return existing[0];
    }

    const preferenceKey = notificationPreferenceForEvent(input.event);
    if (!preferenceKey) return created[0];

    const settings = await tx.select({ value: workspaceSettings.value }).from(workspaceSettings).where(and(
      eq(workspaceSettings.workspaceId, input.workspaceId),
      eq(workspaceSettings.key, "notification_preferences"),
    )).orderBy(desc(workspaceSettings.id)).limit(1);
    const preferences = parseNotificationPreferences(settings[0]?.value);
    if (!preferences[preferenceKey]) return created[0];

    const members = await tx.select({
      userId: workspaceMembers.userId,
      role: workspaceMembers.role,
      professionalId: workspaceMembers.professionalId,
      operationalRole: users.operationalRole,
    }).from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(and(eq(workspaceMembers.workspaceId, input.workspaceId), eq(workspaceMembers.active, 1)));
    const allMemberIds = await tx.select({ userId: workspaceMembers.userId }).from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, input.workspaceId));
    const managerRole = (role: string) => role === "owner" || role === "admin" || role === "manager";
    const professionalId = Number(input.payload.professionalId ?? 0);
    const recipients = members.filter((member) => {
      if (input.event === "contact.created") return managerRole(member.role) || (member.role === "agent" && member.operationalRole !== "professional");
      return managerRole(member.role) || (member.operationalRole === "professional" && member.professionalId === professionalId);
    }).map((member) => member.userId);

    // The bootstrap administrator may be authorized without an explicit member row.
    if (!members.some((member) => managerRole(member.role))) {
      const bootstrapAdmins = await tx.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
      const allMemberUserIds = new Set(allMemberIds.map((member) => member.userId));
      for (const user of bootstrapAdmins) if (!allMemberUserIds.has(user.id)) recipients.push(user.id);
    }
    const uniqueRecipients = Array.from(new Set(recipients));
    if (uniqueRecipients.length === 0) return created[0];

    let appointment: { contactName: string | null; serviceName: string | null; professionalName: string | null; startsAt: Date | null } | undefined;
    let timezone = "America/Sao_Paulo";
    if (input.event !== "contact.created") {
      const appointmentId = Number(input.payload.appointmentId ?? input.aggregateId ?? 0);
      appointment = appointmentId ? (await tx.select({
        contactName: contacts.name,
        serviceName: services.name,
        professionalName: professionals.name,
        startsAt: appointmentsTable.startsAt,
      }).from(appointmentsTable)
        .leftJoin(contacts, eq(contacts.id, appointmentsTable.contactId))
        .leftJoin(services, eq(services.id, appointmentsTable.serviceId))
        .leftJoin(professionals, eq(professionals.id, appointmentsTable.professionalId))
        .where(and(eq(appointmentsTable.id, appointmentId), eq(appointmentsTable.workspaceId, input.workspaceId))).limit(1))[0] : undefined;
      const workspace = (await tx.select({ timezone: workspaces.timezone }).from(workspaces).where(eq(workspaces.id, input.workspaceId)).limit(1))[0];
      timezone = workspace?.timezone ?? timezone;
    }
    const copy = notificationForEvent({ event: input.event as NotificationEvent, payload: input.payload, appointment, timezone });

    await tx.insert(notifications).values(uniqueRecipients.map((userId) => ({
      workspaceId: input.workspaceId,
      userId,
      eventKey,
      type: copy.type,
      title: copy.title,
      body: copy.body,
      href: copy.href,
      createdAt: created[0]!.createdAt,
    }))).onConflictDoNothing({ target: [notifications.workspaceId, notifications.userId, notifications.eventKey] });
    return created[0];
  });
}

export async function listInAppNotifications(workspaceId: number, userId: number, limit = 30) {
  const db = await getDb();
  if (!db) return { items: [], unreadCount: 0 };
  const items = await db.select().from(notifications).where(and(
    eq(notifications.workspaceId, workspaceId),
    eq(notifications.userId, userId),
  )).orderBy(desc(notifications.createdAt), desc(notifications.id)).limit(limit);
  const unreadRows = await db.select({ count: sql<number>`count(*)::int` }).from(notifications).where(and(
    eq(notifications.workspaceId, workspaceId),
    eq(notifications.userId, userId),
    isNull(notifications.readAt),
  ));
  return { items, unreadCount: Number(unreadRows[0]?.count ?? 0) };
}

export async function markInAppNotificationRead(workspaceId: number, userId: number, notificationId: number) {
  const db = await getDb();
  if (!db) return false;
  const updated = await db.update(notifications).set({ readAt: new Date() }).where(and(
    eq(notifications.workspaceId, workspaceId),
    eq(notifications.userId, userId),
    eq(notifications.id, notificationId),
    isNull(notifications.readAt),
  )).returning({ id: notifications.id });
  return updated.length > 0;
}

export async function markAllInAppNotificationsRead(workspaceId: number, userId: number) {
  const db = await getDb();
  if (!db) return 0;
  const updated = await db.update(notifications).set({ readAt: new Date() }).where(and(
    eq(notifications.workspaceId, workspaceId),
    eq(notifications.userId, userId),
    isNull(notifications.readAt),
  )).returning({ id: notifications.id });
  return updated.length;
}

export async function processDailySummaryNotificationsOnce(now = new Date(), onlyWorkspaceId?: number) {
  const db = await getDb();
  if (!db) return { processed: 0, skipped: true };
  const activeWorkspaces = await db.select().from(workspaces).where(onlyWorkspaceId
    ? and(eq(workspaces.active, 1), eq(workspaces.id, onlyWorkspaceId))
    : eq(workspaces.active, 1));
  let processed = 0;
  for (const workspace of activeWorkspaces) {
    let bounds: ReturnType<typeof getLocalDayBounds>;
    try {
      bounds = getLocalDayBounds(now, workspace.timezone);
    } catch {
      continue;
    }
    if (bounds.minuteOfDay < 18 * 60) continue;
    const settings = await db.select({ value: workspaceSettings.value }).from(workspaceSettings).where(and(
      eq(workspaceSettings.workspaceId, workspace.id),
      eq(workspaceSettings.key, "notification_preferences"),
    )).orderBy(desc(workspaceSettings.id)).limit(1);
    if (!parseNotificationPreferences(settings[0]?.value).dailySummary) continue;

    const members = await db.select({ userId: workspaceMembers.userId }).from(workspaceMembers)
      .where(and(
        eq(workspaceMembers.workspaceId, workspace.id),
        eq(workspaceMembers.active, 1),
        inArray(workspaceMembers.role, ["owner", "admin", "manager"]),
      ));
    const allMemberIds = await db.select({ userId: workspaceMembers.userId }).from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, workspace.id));
    const recipients = members.map((member) => member.userId);
    const allMemberUserIds = new Set(allMemberIds.map((member) => member.userId));
    if (recipients.length === 0) {
      const bootstrapAdmins = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
      for (const user of bootstrapAdmins) if (!allMemberUserIds.has(user.id)) recipients.push(user.id);
    }
    const uniqueRecipients = Array.from(new Set(recipients));
    if (uniqueRecipients.length === 0) continue;

    const [appointmentRows, leadRows] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(appointmentsTable).where(and(
        eq(appointmentsTable.workspaceId, workspace.id),
        gte(appointmentsTable.startsAt, bounds.start),
        lt(appointmentsTable.startsAt, bounds.end),
        ne(appointmentsTable.status, "cancelled"),
      )),
      db.select({ count: sql<number>`count(*)::int` }).from(contacts).where(and(
        eq(contacts.workspaceId, workspace.id),
        gte(contacts.createdAt, bounds.start),
        lt(contacts.createdAt, bounds.end),
      )),
    ]);
    const copy = dailySummaryFor(bounds.dayKey, Number(appointmentRows[0]?.count ?? 0), Number(leadRows[0]?.count ?? 0));
    const created = await db.insert(notifications).values(uniqueRecipients.map((userId) => ({
      workspaceId: workspace.id,
      userId,
      eventKey: dailySummaryEventKey(workspace.id, bounds.dayKey),
      type: copy.type,
      title: copy.title,
      body: copy.body,
      href: copy.href,
    }))).onConflictDoNothing({ target: [notifications.workspaceId, notifications.userId, notifications.eventKey] }).returning({ id: notifications.id });
    processed += created.length;
  }
  return { processed, skipped: false };
}

export async function ensureDemoWorkspace() {
  const db = await getDb();
  if (!db) return undefined;
  const demoMode = process.env.DEMO_MODE !== "false";
  const slug = demoMode ? DEMO_WORKSPACE_SLUG : (process.env.WORKSPACE_SLUG ?? "forte-workspace");
  const name = demoMode ? "Forte Serviços Demo" : (process.env.WORKSPACE_NAME ?? "Minha empresa");
  await db.insert(workspaces).values({
    name,
    slug,
    segment: process.env.WORKSPACE_SEGMENT ?? "servicos",
    plan: "starter",
    timezone: process.env.WORKSPACE_TIMEZONE ?? "America/Sao_Paulo",
  }).onConflictDoUpdate({ target: workspaces.slug, set: { name, updatedAt: new Date() } });
  const result = await db.select().from(workspaces).where(eq(workspaces.slug, slug)).limit(1);
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

export type OnboardingProfile = {
  businessName: string;
  segment: string;
  description: string;
  services: string;
  serviceArea: string;
  businessHours: string;
  toneOfVoice: string;
  forbiddenWords: string;
  faq: string;
  cancellationPolicy: string;
  humanHandoffRules: string;
  qualificationRules: string;
};

const emptyOnboardingProfile: OnboardingProfile = {
  businessName: "",
  segment: "servicos",
  description: "",
  services: "",
  serviceArea: "",
  businessHours: "",
  toneOfVoice: "profissional, claro e cordial",
  forbiddenWords: "",
  faq: "",
  cancellationPolicy: "",
  humanHandoffRules: "",
  qualificationRules: "",
};

function buildBusinessPrompt(profile: OnboardingProfile, version: number) {
  return `Você atende clientes da empresa ${profile.businessName || "da empresa configurada"}, do segmento ${profile.segment}. Este é o prompt operacional publicado v${version}.\n\nDescrição do negócio:\n${profile.description || "Não informada."}\n\nServiços, duração e preços:\n${profile.services || "Consultar a equipe antes de prometer preço ou prazo."}\n\nÁrea de atendimento:\n${profile.serviceArea || "Não informada."}\n\nHorários:\n${profile.businessHours || "Consultar disponibilidade real na agenda."}\n\nTom de voz:\n${profile.toneOfVoice || emptyOnboardingProfile.toneOfVoice}\n\nPalavras e condutas proibidas:\n${profile.forbiddenWords || "Não inventar informações, preços, horários ou confirmações."}\n\nPerguntas frequentes e respostas aprovadas:\n${profile.faq || "Não cadastradas."}\n\nPolítica de cancelamento, reagendamento e sinal:\n${profile.cancellationPolicy || "Escalar para atendimento humano quando não houver regra publicada."}\n\nSempre transferir para humano quando:\n${profile.humanHandoffRules || "o cliente pedir humano, houver reclamação, risco, dúvida fora do cadastro ou negociação especial."}\n\nCritérios de qualificação e follow-up:\n${profile.qualificationRules || "Identificar serviço, localização, urgência e próximo passo."}`;
}

async function getWorkspaceSetting(workspaceId: number, key: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(workspaceSettings).where(and(eq(workspaceSettings.workspaceId, workspaceId), eq(workspaceSettings.key, key))).orderBy(desc(workspaceSettings.updatedAt), desc(workspaceSettings.id)).limit(1);
  return result[0];
}

async function upsertWorkspaceSetting(workspaceId: number, key: string, value: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const existing = await getWorkspaceSetting(workspaceId, key);
  if (existing) await db.update(workspaceSettings).set({ value, updatedAt: new Date() }).where(eq(workspaceSettings.id, existing.id));
  else await db.insert(workspaceSettings).values({ workspaceId, key, value });
}

export async function getOnboardingProfile() {
  const workspace = await ensureDemoWorkspace();
  if (!workspace) return { profile: emptyOnboardingProfile, version: 0, prompt: "", published: false };
  const profileSetting = await getWorkspaceSetting(workspace.id, "onboarding_profile");
  const promptSetting = await getWorkspaceSetting(workspace.id, "ai_prompt_published");
  const profile = { ...emptyOnboardingProfile, ...(profileSetting?.value ? JSON.parse(profileSetting.value) as Partial<OnboardingProfile> : {}) };
  const published = promptSetting?.value ? JSON.parse(promptSetting.value) as { version: number; prompt: string } : undefined;
  return { profile, version: published?.version ?? 0, prompt: published?.prompt ?? "", published: Boolean(published?.prompt) };
}

export async function saveOnboardingProfile(input: OnboardingProfile, publish: boolean) {
  const workspace = await ensureDemoWorkspace();
  if (!workspace) throw new Error("Workspace unavailable");
  const current = await getOnboardingProfile();
  const nextVersion = current.version + 1;
  await upsertWorkspaceSetting(workspace.id, "onboarding_profile", JSON.stringify(input));
  const prompt = buildBusinessPrompt(input, nextVersion);
  if (publish) await upsertWorkspaceSetting(workspace.id, "ai_prompt_published", JSON.stringify({ version: nextVersion, prompt, publishedAt: new Date().toISOString() }));
  return { profile: input, version: publish ? nextVersion : current.version, prompt: publish ? prompt : current.prompt, published: publish || current.published };
}

export async function getPublishedAiPrompt() {
  const onboarding = await getOnboardingProfile();
  return { version: onboarding.version, prompt: onboarding.prompt, published: onboarding.published };
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
  const existingLinks = await db.select({ id: professionalServices.id }).from(professionalServices).where(eq(professionalServices.workspaceId, workspace.id)).limit(1);
  if (existingLinks.length === 0) {
    for (const professional of workspaceProfessionals) {
      for (const service of workspaceServices) {
        await db.insert(professionalServices).values({ workspaceId: workspace.id, professionalId: professional.id, serviceId: service.id, active: 1 });
      }
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

export type AgendaSnapshot = {
  timezone: string;
  services: { id: number; workspaceId: number; name: string; description: string | null; durationMinutes: number; priceCents: number; active: number; createdAt: Date; updatedAt: Date }[];
  professionals: { id: number; workspaceId: number; name: string; specialty: string | null; color: string; active: number; createdAt: Date; updatedAt: Date }[];
  appointments: {
    id: number;
    contactId: number | null;
    serviceId: number;
    professionalId: number;
    startsAt: Date;
    endsAt: Date;
    status: "requested" | "confirmed" | "in_progress" | "completed" | "cancelled" | "no_show";
    notes: string | null;
    serviceName: string | null;
    professionalName: string | null;
    contactName: string | null;
  }[];
  availability: { id: number; workspaceId: number; professionalId: number; weekday: number; startMinute: number; endMinute: number; active: number }[];
  serviceLinks: { id: number; workspaceId: number; professionalId: number; serviceId: number; active: number; createdAt: Date }[];
};

export async function getAgendaSnapshot(professionalId?: number, includeWorkspaceAvailability = false): Promise<AgendaSnapshot> {
  const db = await getDb();
  const emptySnapshot: AgendaSnapshot = { timezone: "America/Sao_Paulo", services: [], professionals: [], appointments: [], availability: [], serviceLinks: [] };
  if (!db) return emptySnapshot;
  await ensureDemoAgenda();
  const workspace = await ensureDemoWorkspace();
  if (!workspace) return emptySnapshot;
  const professionalFilter = professionalId ? eq(professionals.id, professionalId) : undefined;
  const appointmentFilter = professionalId ? and(eq(appointmentsTable.workspaceId, workspace.id), eq(appointmentsTable.professionalId, professionalId)) : eq(appointmentsTable.workspaceId, workspace.id);
  const links = await db.select().from(professionalServices).where(and(eq(professionalServices.workspaceId, workspace.id), eq(professionalServices.active, 1)));
  const [workspaceServices, workspaceProfessionals, workspaceAppointments] = await Promise.all([
    db.select().from(services).where(and(eq(services.workspaceId, workspace.id), eq(services.active, 1))),
    db.select().from(professionals).where(and(eq(professionals.workspaceId, workspace.id), eq(professionals.active, 1), professionalFilter)),
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
      .where(appointmentFilter)
      .orderBy(appointmentsTable.startsAt, appointmentsTable.id),
  ]);
  const visibleServices = professionalId
    ? workspaceServices.filter((service) => links.length === 0 || links.some((link) => link.serviceId === service.id && link.professionalId === professionalId))
    : workspaceServices;
  const professionalAvailability = professionalId || includeWorkspaceAvailability
    ? await db.select().from(availability).where(and(
      eq(availability.workspaceId, workspace.id),
      eq(availability.active, 1),
      ...(professionalId ? [eq(availability.professionalId, professionalId)] : []),
    )).orderBy(availability.weekday)
    : [];
  return {
    timezone: workspace.timezone,
    services: visibleServices,
    professionals: workspaceProfessionals,
    appointments: workspaceAppointments,
    availability: professionalAvailability,
    serviceLinks: links,
  };
}

export async function createAgendaAppointment(input: { contactId?: number; serviceId: number; professionalId: number; startsAt: Date; endsAt: Date; notes?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await ensureDemoAgenda();
  const workspace = await ensureDemoWorkspace();
  if (!workspace) throw new Error("Workspace unavailable");
  const createdAppointment = await db.transaction(async (tx) => {
    // Serialize slot checks for this professional. A row-level lock means two
    // concurrent requests cannot both pass the overlap query before inserting.
    await tx.execute(sql`SELECT "id" FROM "professionals" WHERE "id" = ${input.professionalId} AND "workspaceId" = ${workspace.id} AND "active" = 1 FOR UPDATE`);
    const professional = (await tx.select({ id: professionals.id }).from(professionals).where(and(
      eq(professionals.id, input.professionalId),
      eq(professionals.workspaceId, workspace.id),
      eq(professionals.active, 1),
    )).limit(1))[0];
    if (!professional) throw new ScheduleError("professional_unavailable", "Este profissional não está ativo neste workspace");
    const windows = await tx.select({ weekday: availability.weekday, startMinute: availability.startMinute, endMinute: availability.endMinute })
      .from(availability)
      .where(and(eq(availability.workspaceId, workspace.id), eq(availability.professionalId, input.professionalId), eq(availability.active, 1)));
    assertWithinWorkingHours(input.startsAt, input.endsAt, workspace.timezone, windows);

    const conflict = await tx.select({ id: appointmentsTable.id }).from(appointmentsTable).where(and(
      eq(appointmentsTable.workspaceId, workspace.id),
      eq(appointmentsTable.professionalId, input.professionalId),
      ne(appointmentsTable.status, "cancelled"),
      lt(appointmentsTable.startsAt, input.endsAt),
      gt(appointmentsTable.endsAt, input.startsAt),
    )).limit(1);
    if (conflict.length > 0) throw new ScheduleError("appointment_conflict", "Horário indisponível: existe outro atendimento deste profissional neste intervalo");
    const created = await tx.insert(appointmentsTable).values({ workspaceId: workspace.id, ...input, status: "requested", source: "panel" }).returning();
    return created[0];
  });
  if (createdAppointment) {
    await enqueueDomainEvent({
      workspaceId: workspace.id,
      event: "appointment.created",
      aggregateType: "appointment",
      aggregateId: createdAppointment.id,
      eventKey: `appointment.created:${createdAppointment.id}`,
      payload: { appointmentId: createdAppointment.id, contactId: createdAppointment.contactId, serviceId: createdAppointment.serviceId, professionalId: createdAppointment.professionalId, startsAt: createdAppointment.startsAt, endsAt: createdAppointment.endsAt, status: createdAppointment.status },
    });
  }
  return createdAppointment;
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
  const provider = await getDefaultWhatsappProvider();
  const createdAt = new Date();
  await db.insert(messages).values({ conversationId: conversation.id, direction: "outbound", senderType: "human", messageType: "text", content, status: "queued", provider, createdAt });
  await db.update(contacts).set({ aiEnabled: 0, unreadCount: 0, lastMessagePreview: content.slice(0, 500), lastMessageAt: createdAt, updatedAt: createdAt }).where(eq(contacts.id, contactId));
  await db.update(conversations).set({ humanControlled: 1, unreadCount: 0, lastMessageAt: createdAt, updatedAt: createdAt }).where(eq(conversations.id, conversation.id));
  await db.insert(auditLogs).values({ actorUserId, contactId, action: "manual_message_queued", summary: `Mensagem manual enfileirada para ${provider}` });
  const result = await db.select().from(messages).where(and(eq(messages.conversationId, conversation.id), eq(messages.createdAt, createdAt))).orderBy(desc(messages.id)).limit(1);
  return result[0];
}

export async function moveContactStage(contactId: number, stage: string, actorUserId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const updatedAt = new Date();
  await db.update(contacts).set({ stage, updatedAt }).where(eq(contacts.id, contactId));
  await db.insert(auditLogs).values({ actorUserId, contactId, action: "stage_changed", summary: `Lead movido para ${stage}` });
  const contact = await getContactById(contactId);
  if (contact?.workspaceId) {
    await enqueueDomainEvent({
      workspaceId: contact.workspaceId,
      event: "stage.changed",
      aggregateType: "contact",
      aggregateId: contactId,
      eventKey: `stage.changed:${contactId}:${updatedAt.toISOString()}`,
      payload: { contactId, stage, actorUserId, changedAt: updatedAt },
    });
  }
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

export async function listContactNotes(contactId: number) {
  const db = await getDb();
  if (!db) return [];
  const workspace = await ensureDemoWorkspace();
  if (!workspace) return [];
  return db.select().from(contactNotes)
    .where(and(eq(contactNotes.contactId, contactId), eq(contactNotes.workspaceId, workspace.id)))
    .orderBy(desc(contactNotes.createdAt), desc(contactNotes.id)).limit(50);
}

export async function addContactNote(contactId: number, content: string, actorUserId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const contact = await getContactById(contactId);
  if (!contact || !contact.workspaceId) throw new Error("Contact not found");
  const created = await db.insert(contactNotes).values({ workspaceId: contact.workspaceId, contactId, content: content.trim(), authorType: "human" }).returning();
  await db.insert(auditLogs).values({ actorUserId, contactId, action: "note_created", summary: "Nota interna adicionada à ficha" });
  return created[0];
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

export async function getDashboardSnapshot() {
  const db = await getDb();
  const workspace = await ensureDemoWorkspace();
  if (!db || !workspace) return { newContactsToday: 0, awaitingResponse: 0, aiPaused: 0, urgentOpen: 0, quotesPendingCents: 0, appointmentsToday: 0, receivedMonthCents: 0, pendingCents: 0, recentEvents: [], upcomingAppointments: [] };
  const workspaceContacts = await db.select().from(contacts).where(eq(contacts.workspaceId, workspace.id));
  const workspaceAppointments = await db.select().from(appointmentsTable).where(eq(appointmentsTable.workspaceId, workspace.id)).orderBy(asc(appointmentsTable.startsAt));
  const contactIds = workspaceContacts.map((contact) => contact.id);
  const recentEvents = contactIds.length === 0 ? [] : await db.select().from(auditLogs).where(sql`${auditLogs.contactId} IN (${sql.join(contactIds.map((id) => sql`${id}`), sql`, `)})`).orderBy(desc(auditLogs.createdAt), desc(auditLogs.id)).limit(8);
  const now = new Date();
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
  const activeAppointments = workspaceAppointments.filter((appointment) => appointment.status !== "cancelled");
  const pendingCents = workspaceContacts.reduce((total, contact) => total + contact.quoteCents, 0);
  return {
    newContactsToday: workspaceContacts.filter((contact) => contact.createdAt >= startOfToday).length,
    awaitingResponse: workspaceContacts.filter((contact) => contact.unreadCount > 0).length,
    aiPaused: workspaceContacts.filter((contact) => contact.aiEnabled === 0).length,
    urgentOpen: workspaceContacts.filter((contact) => (contact.urgency === "Alta" || contact.urgency === "Crítica") && contact.stage !== "Concluído").length,
    quotesPendingCents: pendingCents,
    appointmentsToday: activeAppointments.filter((appointment) => appointment.startsAt >= startOfToday && appointment.startsAt < new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000)).length,
    receivedMonthCents: 0,
    pendingCents,
    recentEvents,
    upcomingAppointments: activeAppointments.filter((appointment) => appointment.startsAt >= now).slice(0, 5),
  };
}


export async function listQuotes() {
  const db = await getDb();
  const workspace = await ensureDemoWorkspace();
  if (!db || !workspace) return [];
  const rows = await db.select({ quote: quotes, contact: contacts }).from(quotes).leftJoin(contacts, eq(quotes.contactId, contacts.id)).where(eq(quotes.workspaceId, workspace.id)).orderBy(desc(quotes.createdAt));
  return rows.map(({ quote, contact }) => ({ ...quote, contactName: contact?.name ?? "Contato removido", contactInitials: (contact?.name ?? "CR").split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase() }));
}

export async function createQuote(input: { contactId: number; serviceName: string; description?: string; quotedCents: number; receivedCents?: number; status?: "orcamento" | "aguardando_aprovacao" | "aprovado" | "sinal_pendente" | "parcialmente_pago" | "pago" | "cancelado"; dueDate?: Date; notes?: string }, actorUserId?: number) {
  const db = await getDb();
  const workspace = await ensureDemoWorkspace();
  if (!db || !workspace) throw new Error("Database unavailable");
  const contact = await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.id, input.contactId), eq(contacts.workspaceId, workspace.id))).limit(1);
  if (!contact[0]) throw new Error("Contact not found");
  const now = new Date();
  const inserted = await db.insert(quotes).values({ workspaceId: workspace.id, contactId: input.contactId, serviceName: input.serviceName, description: input.description, quotedCents: input.quotedCents, receivedCents: input.receivedCents ?? 0, status: input.status ?? "orcamento", dueDate: input.dueDate, notes: input.notes, createdAt: now, updatedAt: now }).returning();
  await db.update(contacts).set({ quoteCents: input.quotedCents, updatedAt: now }).where(eq(contacts.id, input.contactId));
  await db.insert(auditLogs).values({ actorUserId, contactId: input.contactId, action: "quote_created", summary: `Orçamento criado: ${input.serviceName}` });
  return inserted[0];
}

export async function updateQuotePayment(id: number, receivedCents: number, status: "orcamento" | "aguardando_aprovacao" | "aprovado" | "sinal_pendente" | "parcialmente_pago" | "pago" | "cancelado", actorUserId?: number) {
  const db = await getDb();
  const workspace = await ensureDemoWorkspace();
  if (!db || !workspace) throw new Error("Database unavailable");
  const existing = await db.select().from(quotes).where(and(eq(quotes.id, id), eq(quotes.workspaceId, workspace.id))).limit(1);
  if (!existing[0]) throw new Error("Quote not found");
  const updated = await db.update(quotes).set({ receivedCents, status, updatedAt: new Date() }).where(eq(quotes.id, id)).returning();
  await db.insert(auditLogs).values({ actorUserId, contactId: existing[0].contactId, action: "quote_updated", summary: `Recebimento do orçamento atualizado para ${receivedCents} centavos` });
  return updated[0];
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
    if (contact) {
      await enqueueDomainEvent({
        workspaceId: workspace.id,
        event: "contact.created",
        aggregateType: "contact",
        aggregateId: contact.id,
        eventKey: `contact.created:${contact.id}`,
        payload: { contactId: contact.id, phone: contact.externalPhone, name: contact.name, stage: contact.stage },
      });
    }
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
  const created = await db.insert(messages).values({
    conversationId: conversation.id,
    externalId: input.eventId,
    direction: "inbound",
    senderType: "lead",
    messageType: input.messageType ?? "text",
    content: input.content,
    status: "received",
    createdAt: receivedAt,
  }).returning();
  if (created[0]) {
    await enqueueDomainEvent({
      workspaceId: workspace.id,
      event: "message.received",
      aggregateType: "message",
      aggregateId: created[0].id,
      eventKey: `message.received:${input.eventId}`,
      payload: { messageId: created[0].id, contactId: contact.id, conversationId: conversation.id, phone: contact.externalPhone, content: input.content, messageType: input.messageType ?? "text", receivedAt },
    });
  }
  await db.update(conversations).set({ unreadCount: sql`${conversations.unreadCount} + 1`, lastMessageAt: receivedAt, updatedAt: receivedAt }).where(eq(conversations.id, conversation.id));
  return { contactId: contact.id, conversationId: conversation.id, messageId: created[0]?.id };
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
  const created = (await db.select().from(contacts).where(eq(contacts.externalPhone, input.phone)).limit(1))[0];
  if (created) {
    await enqueueDomainEvent({
      workspaceId: workspace.id,
      event: "contact.created",
      aggregateType: "contact",
      aggregateId: created.id,
      eventKey: `contact.created:${created.id}`,
      payload: { contactId: created.id, phone: created.externalPhone, name: created.name, stage: created.stage },
    });
  }
  return created;
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
  const created = await db.insert(messages).values({ conversationId: conversation.id, direction: "outbound", senderType: "human", messageType: "text", content, status: "queued", provider: selectedProvider, createdAt }).returning();
  await db.update(contacts).set({ aiEnabled: 0, unreadCount: 0, lastMessagePreview: content.slice(0, 500), lastMessageAt: createdAt, updatedAt: createdAt }).where(eq(contacts.id, contactId));
  await db.update(conversations).set({ humanControlled: 1, unreadCount: 0, lastMessageAt: createdAt, updatedAt: createdAt }).where(eq(conversations.id, conversation.id));
  await db.insert(auditLogs).values({ contactId, action: "api_message_queued", summary: "Mensagem enfileirada para o worker de WhatsApp" });
  return created[0];
}

export async function recoverProcessingMessages() {
  const db = await getDb();
  if (!db) return 0;
  const recovered = await db.update(messages).set({ status: "queued" }).where(eq(messages.status, "processing")).returning({ id: messages.id });
  return recovered.length;
}

export async function processQueuedMessagesOnce(limit = 10, maxAttempts = 3) {
  const db = await getDb();
  if (!db) return { processed: 0, sent: 0, failed: 0 };
  const pending = await db.select({
    message: messages,
    phone: contacts.externalPhone,
    contactId: contacts.id,
    workspaceId: contacts.workspaceId,
  }).from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .innerJoin(contacts, eq(contacts.id, conversations.contactId))
    .where(eq(messages.status, "queued"))
    .orderBy(asc(messages.createdAt), asc(messages.id))
    .limit(limit);

  let sent = 0;
  let failed = 0;
  for (const item of pending) {
    const claimed = await db.update(messages).set({
      status: "processing",
      attemptCount: sql`${messages.attemptCount} + 1`,
    }).where(and(eq(messages.id, item.message.id), eq(messages.status, "queued"))).returning({ id: messages.id });
    if (claimed.length === 0) continue;
    try {
      const adapter = getWhatsappAdapter(item.message.provider);
      const result = await adapter.sendMessage({
        idempotencyKey: `forte-message-${item.message.id}`,
        phone: item.phone,
        content: item.message.content,
        messageType: item.message.messageType,
        provider: item.message.provider,
      });
      await db.update(messages).set({ status: "sent", externalId: result.externalId, sentAt: new Date(), lastError: null }).where(eq(messages.id, item.message.id));
      await db.insert(auditLogs).values({ contactId: item.contactId, action: "message_sent", summary: `Mensagem enviada pelo provedor ${item.message.provider}` });
      sent += 1;
      if (item.workspaceId) {
        try {
          await enqueueDomainEvent({
            workspaceId: item.workspaceId,
            event: "message.sent",
            aggregateType: "message",
            aggregateId: item.message.id,
            eventKey: `message.sent:${item.message.id}`,
            payload: { messageId: item.message.id, contactId: item.contactId, provider: item.message.provider, externalId: result.externalId, sentAt: new Date() },
          });
        } catch (eventError) {
          console.error("[forte-worker] falha ao enfileirar message.sent", eventError);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha desconhecida no envio";
      const nextStatus = item.message.attemptCount + 1 >= maxAttempts ? "failed" : "queued";
      await db.update(messages).set({ status: nextStatus, lastError: message }).where(eq(messages.id, item.message.id));
      failed += 1;
    }
  }
  return { processed: sent + failed, sent, failed };
}

export async function cancelAgendaAppointment(appointmentId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const workspace = await ensureDemoWorkspace();
  if (!workspace) throw new Error("Workspace unavailable");
  const appointment = (await db.select().from(appointmentsTable).where(and(eq(appointmentsTable.id, appointmentId), eq(appointmentsTable.workspaceId, workspace.id))).limit(1))[0];
  if (!appointment) return undefined;
  const updatedAt = new Date();
  await db.update(appointmentsTable).set({ status: "cancelled", updatedAt }).where(eq(appointmentsTable.id, appointmentId));
  await enqueueDomainEvent({
    workspaceId: workspace.id,
    event: "appointment.cancelled",
    aggregateType: "appointment",
    aggregateId: appointmentId,
    eventKey: `appointment.cancelled:${appointmentId}:${updatedAt.toISOString()}`,
    payload: { appointmentId, contactId: appointment.contactId, startsAt: appointment.startsAt, endsAt: appointment.endsAt, cancelledAt: updatedAt },
  });
  return { ...appointment, status: "cancelled" as const };
}

export async function updateAgendaStatus(appointmentId: number, status: "confirmed" | "completed" | "no_show") {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const workspace = await ensureDemoWorkspace();
  if (!workspace) throw new Error("Workspace unavailable");
  const appointment = (await db.select().from(appointmentsTable).where(and(eq(appointmentsTable.id, appointmentId), eq(appointmentsTable.workspaceId, workspace.id))).limit(1))[0];
  if (!appointment) return undefined;
  const updated = await db.update(appointmentsTable).set({ status, updatedAt: new Date() }).where(eq(appointmentsTable.id, appointmentId)).returning();
  if (appointment.contactId) await db.insert(auditLogs).values({ contactId: appointment.contactId, action: `appointment_${status}`, summary: `Agendamento ${appointmentId} atualizado para ${status}` });
  return updated[0];
}

export async function rescheduleAgendaAppointment(appointmentId: number, startsAt: Date, endsAt: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const workspace = await ensureDemoWorkspace();
  if (!workspace) throw new Error("Workspace unavailable");
  return db.transaction(async (tx) => {
    const appointment = (await tx.select().from(appointmentsTable).where(and(
      eq(appointmentsTable.id, appointmentId),
      eq(appointmentsTable.workspaceId, workspace.id),
    )).limit(1))[0];
    if (!appointment) return undefined;
    await tx.execute(sql`SELECT "id" FROM "professionals" WHERE "id" = ${appointment.professionalId} AND "workspaceId" = ${workspace.id} FOR UPDATE`);
    const windows = await tx.select({ weekday: availability.weekday, startMinute: availability.startMinute, endMinute: availability.endMinute })
      .from(availability)
      .where(and(eq(availability.workspaceId, workspace.id), eq(availability.professionalId, appointment.professionalId), eq(availability.active, 1)));
    assertWithinWorkingHours(startsAt, endsAt, workspace.timezone, windows);

    const conflict = await tx.select({ id: appointmentsTable.id }).from(appointmentsTable).where(and(
      eq(appointmentsTable.workspaceId, workspace.id),
      eq(appointmentsTable.professionalId, appointment.professionalId),
      ne(appointmentsTable.id, appointmentId),
      ne(appointmentsTable.status, "cancelled"),
      lt(appointmentsTable.startsAt, endsAt),
      gt(appointmentsTable.endsAt, startsAt),
    )).limit(1);
    if (conflict.length > 0) throw new ScheduleError("appointment_conflict", "Horário indisponível: existe outro atendimento deste profissional neste intervalo");
    const updated = await tx.update(appointmentsTable).set({ startsAt, endsAt, status: "requested", updatedAt: new Date() }).where(and(
      eq(appointmentsTable.id, appointmentId),
      eq(appointmentsTable.workspaceId, workspace.id),
    )).returning();
    return updated[0];
  });
}


export async function leadMemoryOperation(input: {
  action: "buscar_lead" | "criar_lead" | "atualizar_lead" | "registrar_nota";
  phone: string;
  name?: string;
  city?: string;
  neighborhood?: string;
  serviceRequested?: string;
  fields?: { name?: string; city?: string; neighborhood?: string; serviceRequested?: string; urgency?: "Baixa" | "Média" | "Alta" | "Crítica"; stage?: string; quoteCents?: number; aiEnabled?: boolean };
  note?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await ensureDemoInbox();
  const workspace = await ensureDemoWorkspace();
  if (!workspace) throw new Error("Workspace unavailable");
  const phone = input.phone.replace(/[^0-9]/g, "");
  let contact = (await db.select().from(contacts).where(and(eq(contacts.externalPhone, phone), eq(contacts.workspaceId, workspace.id))).limit(1))[0];

  if (input.action === "buscar_lead") {
    if (!contact) return { exists: false, lead: null, notes: [] };
    const notes = await db.select().from(contactNotes).where(eq(contactNotes.contactId, contact.id)).orderBy(desc(contactNotes.createdAt), desc(contactNotes.id)).limit(20);
    const audit = await db.select().from(auditLogs).where(eq(auditLogs.contactId, contact.id)).orderBy(desc(auditLogs.createdAt), desc(auditLogs.id)).limit(20);
    return { exists: true, lead: contact, notes, audit };
  }

  if (input.action === "atualizar_lead" && !contact) return { exists: false, updated: false, lead: null };

  if (input.action === "criar_lead" || input.action === "atualizar_lead") {
    const fields = input.fields ?? {};
    contact = await upsertApiContact({ phone, name: fields.name ?? input.name, city: fields.city ?? input.city, neighborhood: fields.neighborhood ?? input.neighborhood, serviceRequested: fields.serviceRequested ?? input.serviceRequested });
    if (!contact) throw new Error("Contact could not be created");
    if (fields.urgency || fields.stage || fields.quoteCents !== undefined || fields.aiEnabled !== undefined) {
      await db.update(contacts).set({ urgency: fields.urgency, stage: fields.stage, quoteCents: fields.quoteCents, aiEnabled: fields.aiEnabled === undefined ? undefined : fields.aiEnabled ? 1 : 0, updatedAt: new Date() }).where(eq(contacts.id, contact.id));
      contact = (await db.select().from(contacts).where(eq(contacts.id, contact.id)).limit(1))[0];
    }
    return { exists: true, updated: input.action === "atualizar_lead", lead: contact };
  }

  if (!contact) return { exists: false, noteCreated: false, lead: null };
  const note = input.note?.trim();
  if (!note) throw new Error("Note is required");
  await db.insert(contactNotes).values({ workspaceId: workspace.id, contactId: contact.id, content: note, authorType: "ai" });
  await db.insert(auditLogs).values({ contactId: contact.id, action: "lead_note_created", summary: note.slice(0, 500) });
  const created = await db.select().from(contactNotes).where(and(eq(contactNotes.contactId, contact.id), eq(contactNotes.content, note))).orderBy(desc(contactNotes.id)).limit(1);
  return { exists: true, noteCreated: true, lead: contact, note: created[0] };
}

export async function recoverProcessingDomainEvents() {
  const db = await getDb();
  if (!db) return 0;
  const recovered = await db.update(domainEvents)
    .set({ status: "pending", updatedAt: new Date() })
    .where(eq(domainEvents.status, "processing"))
    .returning({ id: domainEvents.id });
  return recovered.length;
}

export async function processDomainEventsOnce(limit = 10, maxAttempts = 5) {
  const db = await getDb();
  if (!db || !process.env.N8N_EVENTS_WEBHOOK_URL) return { processed: 0, delivered: 0, failed: 0, skipped: true };
  const now = new Date();
  const pending = await db.select().from(domainEvents)
    .where(and(eq(domainEvents.status, "pending"), lte(domainEvents.availableAt, now)))
    .orderBy(asc(domainEvents.availableAt), asc(domainEvents.id))
    .limit(limit);

  let delivered = 0;
  let failed = 0;
  const adapter = createN8nAdapter();
  for (const item of pending) {
    const claimed = await db.update(domainEvents).set({
      status: "processing",
      attemptCount: sql`${domainEvents.attemptCount} + 1`,
      updatedAt: new Date(),
    }).where(and(eq(domainEvents.id, item.id), eq(domainEvents.status, "pending"), lte(domainEvents.availableAt, now))).returning({ id: domainEvents.id });
    if (claimed.length === 0) continue;

    try {
      const result = await adapter.dispatchEvent({
        eventId: item.eventKey,
        event: item.eventType,
        workspaceId: item.workspaceId,
        aggregateType: item.aggregateType,
        aggregateId: item.aggregateId ?? undefined,
        payload: JSON.parse(item.payload) as Record<string, unknown>,
        occurredAt: item.createdAt,
      });
      if (!result.accepted) throw new Error("n8n não aceitou o evento");
      await db.update(domainEvents).set({ status: "delivered", deliveredAt: new Date(), lastError: null, updatedAt: new Date() }).where(eq(domainEvents.id, item.id));
      delivered += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha desconhecida na entrega do evento";
      const attempt = item.attemptCount + 1;
      const terminal = attempt >= maxAttempts;
      const backoffMs = Math.min(60_000, 1_000 * (2 ** Math.max(0, attempt - 1)));
      await db.update(domainEvents).set({
        status: terminal ? "failed" : "pending",
        availableAt: new Date(Date.now() + backoffMs),
        lastError: message,
        updatedAt: new Date(),
      }).where(eq(domainEvents.id, item.id));
      failed += 1;
    }
  }
  return { processed: delivered + failed, delivered, failed, skipped: false };
}
