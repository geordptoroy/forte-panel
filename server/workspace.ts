import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  auditLogs,
  availability,
  professionals,
  professionalServices,
  services,
  users,
  workspaceMembers,
  workspaceSettings,
  type User,
} from "../drizzle/schema";
import { ensureDemoWorkspace, getDb } from "./db";

export type WorkspaceMemberRole = "owner" | "admin" | "manager" | "agent";
export type OperationalRole = "human_attendant" | "ai_attendant" | "professional";

export type WorkspaceAccess = {
  userId: number;
  memberId: number | null;
  role: WorkspaceMemberRole;
  operationalRole: OperationalRole;
  professionalId: number | null;
  professionalName: string | null;
  memberActive: boolean;
  bootstrapOwner: boolean;
  canManageTeam: boolean;
  canManageCatalog: boolean;
  canSeeFullAgenda: boolean;
  restrictedToOwnAgenda: boolean;
};

export function isManagerRole(role: WorkspaceMemberRole) {
  return role === "owner" || role === "admin" || role === "manager";
}

export function isAdministratorRole(role: WorkspaceMemberRole) {
  return role === "owner" || role === "admin";
}

async function getActiveProfessionalName(professionalId: number | null) {
  const db = await getDb();
  if (!db || !professionalId) return null;
  const rows = await db.select({ name: professionals.name }).from(professionals).where(eq(professionals.id, professionalId)).limit(1);
  return rows[0]?.name ?? null;
}

/**
 * Resolves the access context of a logged user inside the workspace.
 *
 * The workspace membership is the source of truth for authorization. The
 * global `users.role` column only bootstraps the installation owner, so a
 * member whose access was deactivated never inherits administrator visibility.
 */
export async function resolveWorkspaceAccess(
  user: { id: number; role: User["role"]; operationalRole: User["operationalRole"] },
  options: { professionalName?: string | null } = {},
): Promise<WorkspaceAccess> {
  const db = await getDb();
  const workspace = await ensureDemoWorkspace();
  const member = db && workspace
    ? (await db.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspace.id), eq(workspaceMembers.userId, user.id))).limit(1))[0]
    : undefined;

  const bootstrapOwner = !member && user.role === "admin";
  const role: WorkspaceMemberRole = (member?.role as WorkspaceMemberRole | undefined) ?? (bootstrapOwner ? "owner" : "agent");
  const operationalRole: OperationalRole = (user.operationalRole as OperationalRole | null) ?? "human_attendant";
  const professionalId = member?.professionalId ?? null;
  const memberActive = member ? member.active === 1 : bootstrapOwner;
  const manager = isManagerRole(role) && memberActive;
  const professionalName = options.professionalName ?? (await getActiveProfessionalName(professionalId));

  return {
    userId: user.id,
    memberId: member?.id ?? null,
    role,
    operationalRole,
    professionalId,
    professionalName,
    memberActive,
    bootstrapOwner,
    canManageTeam: isAdministratorRole(role) && memberActive,
    canManageCatalog: manager,
    canSeeFullAgenda: manager,
    restrictedToOwnAgenda: !manager && operationalRole === "professional",
  };
}

export async function logWorkspaceAction(input: { actorUserId?: number; contactId?: number; action: string; summary: string }) {
  const db = await getDb();
  if (!db) return;
  await db.insert(auditLogs).values({
    actorUserId: input.actorUserId,
    contactId: input.contactId,
    action: input.action,
    summary: input.summary.slice(0, 500),
  });
}

/* ------------------------------------------------------------------ */
/* Serviços e profissionais                                            */
/* ------------------------------------------------------------------ */

export async function listServices(options: { includeInactive?: boolean } = {}) {
  const db = await getDb();
  const workspace = await ensureDemoWorkspace();
  if (!db || !workspace) return [];
  const rows = await db.select().from(services)
    .where(options.includeInactive ? eq(services.workspaceId, workspace.id) : and(eq(services.workspaceId, workspace.id), eq(services.active, 1)))
    .orderBy(asc(services.name), asc(services.id));
  const links = await db.select().from(professionalServices).where(eq(professionalServices.workspaceId, workspace.id));
  return rows.map((service) => ({
    ...service,
    professionalIds: links.filter((link) => link.serviceId === service.id && link.active === 1).map((link) => link.professionalId),
  }));
}

export async function createService(input: { name: string; description?: string; durationMinutes?: number; priceCents?: number }) {
  const db = await getDb();
  const workspace = await ensureDemoWorkspace();
  if (!db || !workspace) throw new Error("Workspace indisponível");
  const created = await db.insert(services).values({
    workspaceId: workspace.id,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    durationMinutes: input.durationMinutes ?? 60,
    priceCents: input.priceCents ?? 0,
  }).returning();
  return created[0];
}

export async function updateService(id: number, input: { name?: string; description?: string | null; durationMinutes?: number; priceCents?: number; active?: boolean }) {
  const db = await getDb();
  const workspace = await ensureDemoWorkspace();
  if (!db || !workspace) throw new Error("Workspace indisponível");
  const existing = (await db.select().from(services).where(and(eq(services.id, id), eq(services.workspaceId, workspace.id))).limit(1))[0];
  if (!existing) return undefined;
  const updated = await db.update(services).set({
    name: input.name?.trim() ?? existing.name,
    description: input.description === undefined ? existing.description : (input.description?.trim() || null),
    durationMinutes: input.durationMinutes ?? existing.durationMinutes,
    priceCents: input.priceCents ?? existing.priceCents,
    active: input.active === undefined ? existing.active : input.active ? 1 : 0,
    updatedAt: new Date(),
  }).where(eq(services.id, id)).returning();
  return updated[0];
}

export async function setServiceProfessionals(serviceId: number, professionalIds: number[]) {
  const db = await getDb();
  const workspace = await ensureDemoWorkspace();
  if (!db || !workspace) throw new Error("Workspace indisponível");
  const service = (await db.select().from(services).where(and(eq(services.id, serviceId), eq(services.workspaceId, workspace.id))).limit(1))[0];
  if (!service) throw new Error("Serviço não encontrado neste workspace");
  const validProfessionals = professionalIds.length === 0 ? [] : await db.select({ id: professionals.id }).from(professionals).where(and(eq(professionals.workspaceId, workspace.id), inArray(professionals.id, professionalIds)));
  const validIds = validProfessionals.map((row) => row.id);
  await db.delete(professionalServices).where(and(eq(professionalServices.workspaceId, workspace.id), eq(professionalServices.serviceId, serviceId)));
  if (validIds.length > 0) {
    await db.insert(professionalServices).values(validIds.map((professionalId) => ({ workspaceId: workspace.id, professionalId, serviceId, active: 1 })));
  }
  return validIds;
}

export async function listProfessionalsDetailed(options: { includeInactive?: boolean } = {}) {
  const db = await getDb();
  const workspace = await ensureDemoWorkspace();
  if (!db || !workspace) return [];
  const rows = await db.select().from(professionals)
    .where(options.includeInactive ? eq(professionals.workspaceId, workspace.id) : and(eq(professionals.workspaceId, workspace.id), eq(professionals.active, 1)))
    .orderBy(asc(professionals.name), asc(professionals.id));
  const links = await db.select().from(professionalServices).where(eq(professionalServices.workspaceId, workspace.id));
  const availabilityRows = await db.select().from(availability).where(eq(availability.workspaceId, workspace.id));
  const memberRows = await db.select().from(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspace.id));
  return rows.map((professional) => ({
    ...professional,
    serviceIds: links.filter((link) => link.professionalId === professional.id && link.active === 1).map((link) => link.serviceId),
    availability: availabilityRows
      .filter((row) => row.professionalId === professional.id && row.active === 1)
      .map((row) => ({ weekday: row.weekday, startMinute: row.startMinute, endMinute: row.endMinute }))
      .sort((a, b) => a.weekday - b.weekday),
    linkedMembers: memberRows.filter((row) => row.professionalId === professional.id).map((row) => row.userId),
  }));
}

export async function getProfessionalInWorkspace(professionalId: number) {
  const db = await getDb();
  const workspace = await ensureDemoWorkspace();
  if (!db || !workspace) return undefined;
  return (await db.select().from(professionals).where(and(eq(professionals.id, professionalId), eq(professionals.workspaceId, workspace.id))).limit(1))[0];
}

export async function updateProfessional(id: number, input: { name?: string; specialty?: string | null; color?: string; active?: boolean }) {
  const db = await getDb();
  const workspace = await ensureDemoWorkspace();
  if (!db || !workspace) throw new Error("Workspace indisponível");
  const existing = await getProfessionalInWorkspace(id);
  if (!existing) return undefined;
  const updated = await db.update(professionals).set({
    name: input.name?.trim() ?? existing.name,
    specialty: input.specialty === undefined ? existing.specialty : (input.specialty?.trim() || null),
    color: input.color ?? existing.color,
    active: input.active === undefined ? existing.active : input.active ? 1 : 0,
    updatedAt: new Date(),
  }).where(eq(professionals.id, id)).returning();
  return updated[0];
}

export async function setProfessionalServices(professionalId: number, serviceIds: number[]) {
  const db = await getDb();
  const workspace = await ensureDemoWorkspace();
  if (!db || !workspace) throw new Error("Workspace indisponível");
  const professional = await getProfessionalInWorkspace(professionalId);
  if (!professional) throw new Error("Profissional não encontrado neste workspace");
  const validServices = serviceIds.length === 0 ? [] : await db.select({ id: services.id }).from(services).where(and(eq(services.workspaceId, workspace.id), inArray(services.id, serviceIds)));
  const validIds = validServices.map((row) => row.id);
  await db.delete(professionalServices).where(and(eq(professionalServices.workspaceId, workspace.id), eq(professionalServices.professionalId, professionalId)));
  if (validIds.length > 0) {
    await db.insert(professionalServices).values(validIds.map((serviceId) => ({ workspaceId: workspace.id, professionalId, serviceId, active: 1 })));
  }
  return validIds;
}

export async function replaceAvailability(professionalId: number, entries: { weekday: number; startMinute: number; endMinute: number }[]) {
  const db = await getDb();
  const workspace = await ensureDemoWorkspace();
  if (!db || !workspace) throw new Error("Workspace indisponível");
  const professional = await getProfessionalInWorkspace(professionalId);
  if (!professional) throw new Error("Profissional não encontrado neste workspace");
  await db.transaction(async (tx) => {
    // Use the same per-professional lock as reservation checks, so changing
    // weekly hours cannot race with a booking using the previous schedule.
    await tx.execute(sql`SELECT "id" FROM "professionals" WHERE "id" = ${professionalId} AND "workspaceId" = ${workspace.id} FOR UPDATE`);
    await tx.delete(availability).where(and(eq(availability.workspaceId, workspace.id), eq(availability.professionalId, professionalId)));
    if (entries.length > 0) {
      await tx.insert(availability).values(entries.map((entry) => ({
        workspaceId: workspace.id,
        professionalId,
        weekday: entry.weekday,
        startMinute: entry.startMinute,
        endMinute: entry.endMinute,
        active: 1,
      })));
    }
  });
  return entries;
}

/* ------------------------------------------------------------------ */
/* Membros, contas e auditoria                                         */
/* ------------------------------------------------------------------ */

export async function listWorkspaceMembersDetailed() {
  const db = await getDb();
  const workspace = await ensureDemoWorkspace();
  if (!db || !workspace) return [];
  const rows = await db.select({
    id: workspaceMembers.id,
    userId: workspaceMembers.userId,
    role: workspaceMembers.role,
    active: workspaceMembers.active,
    professionalId: workspaceMembers.professionalId,
    name: users.name,
    email: users.email,
    operationalRole: users.operationalRole,
    lastSignedIn: users.lastSignedIn,
  }).from(workspaceMembers)
    .leftJoin(users, eq(users.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, workspace.id))
    .orderBy(asc(workspaceMembers.id));
  const professionalRows = await db.select({ id: professionals.id, name: professionals.name }).from(professionals).where(eq(professionals.workspaceId, workspace.id));
  return rows.map((row) => ({
    ...row,
    professionalName: row.professionalId ? professionalRows.find((item) => item.id === row.professionalId)?.name ?? null : null,
  }));
}

export async function setMemberProfile(memberId: number, input: { role?: WorkspaceMemberRole; operationalRole?: OperationalRole; professionalId?: number | null; active?: boolean }) {
  const db = await getDb();
  const workspace = await ensureDemoWorkspace();
  if (!db || !workspace) throw new Error("Workspace indisponível");
  const member = (await db.select().from(workspaceMembers).where(and(eq(workspaceMembers.id, memberId), eq(workspaceMembers.workspaceId, workspace.id))).limit(1))[0];
  if (!member) throw new Error("Membro não encontrado neste workspace");
  if (input.professionalId) {
    const professional = await getProfessionalInWorkspace(input.professionalId);
    if (!professional) throw new Error("Profissional não pertence a este workspace");
  }
  const nextRole = input.role ?? (member.role as WorkspaceMemberRole);
  const nextProfessionalId = input.professionalId === undefined ? member.professionalId : input.professionalId;
  if (member.role === "owner" && nextRole !== "owner") {
    const owners = await db.select({ id: workspaceMembers.id }).from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspace.id), eq(workspaceMembers.role, "owner"), eq(workspaceMembers.active, 1)));
    if (owners.length <= 1) throw new Error("A instalação precisa manter pelo menos um proprietário ativo");
  }
  const updated = await db.update(workspaceMembers).set({
    role: nextRole,
    professionalId: nextProfessionalId ?? null,
    active: input.active === undefined ? member.active : input.active ? 1 : 0,
    updatedAt: new Date(),
  }).where(eq(workspaceMembers.id, memberId)).returning();
  if (input.operationalRole) {
    await db.update(users).set({ operationalRole: input.operationalRole, updatedAt: new Date() }).where(eq(users.id, member.userId));
  }
  return updated[0];
}

export async function updateOwnProfile(userId: number, input: { name: string; email: string; phone?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  const email = input.email.trim().toLowerCase();
  const conflict = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (conflict[0] && conflict[0].id !== userId) throw new Error("Já existe uma conta com este e-mail");
  const updated = await db.update(users).set({
    name: input.name.trim(),
    email,
    phone: input.phone?.trim() || null,
    updatedAt: new Date(),
  }).where(eq(users.id, userId)).returning();
  return updated[0];
}

export async function getNotificationPreferences(workspaceId: number) {
  const db = await getDb();
  if (!db) return defaultNotificationPreferences;
  const row = (await db.select().from(workspaceSettings).where(and(eq(workspaceSettings.workspaceId, workspaceId), eq(workspaceSettings.key, "notification_preferences"))).orderBy(desc(workspaceSettings.id)).limit(1))[0];
  if (!row?.value) return defaultNotificationPreferences;
  try {
    return { ...defaultNotificationPreferences, ...(JSON.parse(row.value) as Partial<NotificationPreferences>) };
  } catch {
    return defaultNotificationPreferences;
  }
}

export type NotificationPreferences = {
  newLead: boolean;
  appointmentCreated: boolean;
  appointmentConfirmed: boolean;
  dailySummary: boolean;
};

export const defaultNotificationPreferences: NotificationPreferences = {
  newLead: true,
  appointmentCreated: true,
  appointmentConfirmed: true,
  dailySummary: false,
};

export async function saveNotificationPreferences(workspaceId: number, preferences: NotificationPreferences) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  const existing = (await db.select().from(workspaceSettings).where(and(eq(workspaceSettings.workspaceId, workspaceId), eq(workspaceSettings.key, "notification_preferences"))).orderBy(desc(workspaceSettings.id)).limit(1))[0];
  if (existing) {
    await db.update(workspaceSettings).set({ value: JSON.stringify(preferences), updatedAt: new Date() }).where(eq(workspaceSettings.id, existing.id));
  } else {
    await db.insert(workspaceSettings).values({ workspaceId, key: "notification_preferences", value: JSON.stringify(preferences) });
  }
  return preferences;
}

export async function listWorkspaceAudit(limit = 60) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: auditLogs.id,
    action: auditLogs.action,
    summary: auditLogs.summary,
    createdAt: auditLogs.createdAt,
    actorUserId: auditLogs.actorUserId,
    actorName: users.name,
    contactId: auditLogs.contactId,
  }).from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(limit);
}

export async function countWorkspaceMembers() {
  const db = await getDb();
  const workspace = await ensureDemoWorkspace();
  if (!db || !workspace) return 0;
  const result = await db.select({ count: sql<number>`count(*)` }).from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspace.id), eq(workspaceMembers.active, 1)));
  return Number(result[0]?.count ?? 0);
}
