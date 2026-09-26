import { and, asc, eq, gte, lt, ne } from "drizzle-orm";
import {
  appointmentsTable,
  availability,
  contacts,
  professionals,
  professionalServices,
  services,
  workspaces,
} from "../drizzle/schema";
import { getDb, enqueueDomainEvent } from "./db";

export type AppointmentStatus = "requested" | "confirmed" | "in_progress" | "completed" | "cancelled" | "no_show";

export type AgendaEntry = {
  id: number;
  contactId: number | null;
  serviceId: number;
  professionalId: number;
  startsAt: Date;
  endsAt: Date;
  status: AppointmentStatus;
  notes: string | null;
  source: string;
  createdAt: Date;
  updatedAt: Date;
  serviceName: string | null;
  serviceDurationMinutes: number | null;
  professionalName: string | null;
  professionalColor: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactCity: string | null;
  contactNeighborhood: string | null;
  contactStage: string | null;
};

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function addDays(date: Date, amount: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

/**
 * Loads the appointments of a single professional, optionally bounded by a
 * date range. Every query is scoped by workspace and professional id, so a
 * professional executor can never read another professional's agenda.
 */
export async function listAppointmentsForProfessional(workspaceId: number, professionalId: number, options: { from?: Date; to?: Date; includeCancelled?: boolean } = {}): Promise<AgendaEntry[]> {
  const db = await getDb();
  if (!db) return [];
  const filters = [eq(appointmentsTable.workspaceId, workspaceId), eq(appointmentsTable.professionalId, professionalId)];
  if (options.from) filters.push(gte(appointmentsTable.startsAt, options.from));
  if (options.to) filters.push(lt(appointmentsTable.startsAt, options.to));
  if (!options.includeCancelled) filters.push(ne(appointmentsTable.status, "cancelled"));
  const rows = await db.select({
    id: appointmentsTable.id,
    contactId: appointmentsTable.contactId,
    serviceId: appointmentsTable.serviceId,
    professionalId: appointmentsTable.professionalId,
    startsAt: appointmentsTable.startsAt,
    endsAt: appointmentsTable.endsAt,
    status: appointmentsTable.status,
    notes: appointmentsTable.notes,
    source: appointmentsTable.source,
    createdAt: appointmentsTable.createdAt,
    updatedAt: appointmentsTable.updatedAt,
    serviceName: services.name,
    serviceDurationMinutes: services.durationMinutes,
    professionalName: professionals.name,
    professionalColor: professionals.color,
    contactName: contacts.name,
    contactPhone: contacts.externalPhone,
    contactCity: contacts.city,
    contactNeighborhood: contacts.neighborhood,
    contactStage: contacts.stage,
  }).from(appointmentsTable)
    .leftJoin(services, and(eq(services.id, appointmentsTable.serviceId), eq(services.workspaceId, workspaceId)))
    .leftJoin(professionals, and(eq(professionals.id, appointmentsTable.professionalId), eq(professionals.workspaceId, workspaceId)))
    .leftJoin(contacts, and(eq(contacts.id, appointmentsTable.contactId), eq(contacts.workspaceId, workspaceId)))
    .where(and(...filters))
    .orderBy(asc(appointmentsTable.startsAt), asc(appointmentsTable.id));
  return rows as AgendaEntry[];
}

export type ProfessionalPortalSnapshot = {
  timezone: string;
  professionalId: number;
  professionalName: string | null;
  professionalSpecialty: string | null;
  professionalColor: string | null;
  todayCount: number;
  weekCount: number;
  monthCount: number;
  pendingCount: number;
  completedCount: number;
  nextAppointment: AgendaEntry | null;
  today: AgendaEntry[];
  upcoming: AgendaEntry[];
  week: AgendaEntry[];
  month: AgendaEntry[];
  clients: { id: number; name: string; phone: string; city: string | null; neighborhood: string | null; stage: string | null; lastAppointmentAt: Date }[];
};

export async function getProfessionalPortalSnapshot(workspaceId: number, professionalId: number, reference: Date = new Date()): Promise<ProfessionalPortalSnapshot> {
  const db = await getDb();
  const workspace = db ? (await db.select({ timezone: workspaces.timezone }).from(workspaces).where(and(eq(workspaces.id, workspaceId), eq(workspaces.active, 1))).limit(1))[0] : undefined;
  const empty: ProfessionalPortalSnapshot = {
    timezone: workspace?.timezone ?? "America/Sao_Paulo",
    professionalId,
    professionalName: null,
    professionalSpecialty: null,
    professionalColor: null,
    todayCount: 0,
    weekCount: 0,
    monthCount: 0,
    pendingCount: 0,
    completedCount: 0,
    nextAppointment: null,
    today: [],
    upcoming: [],
    week: [],
    month: [],
    clients: [],
  };
  if (!db || !workspace) return empty;

  const professional = (await db.select().from(professionals).where(and(eq(professionals.id, professionalId), eq(professionals.workspaceId, workspaceId))).limit(1))[0];
  if (!professional) return empty;

  const dayStart = startOfDay(reference);
  const weekStart = addDays(dayStart, -((dayStart.getDay() + 6) % 7));
  const weekEnd = addDays(weekStart, 7);
  const monthStart = new Date(dayStart.getFullYear(), dayStart.getMonth(), 1);
  const monthEnd = new Date(dayStart.getFullYear(), dayStart.getMonth() + 1, 1);

  const monthEntries = await listAppointmentsForProfessional(workspaceId, professionalId, { from: monthStart, to: monthEnd });
  const weekEntries = await listAppointmentsForProfessional(workspaceId, professionalId, { from: weekStart, to: weekEnd });
  const allEntries = await listAppointmentsForProfessional(workspaceId, professionalId, { from: addDays(dayStart, -180), to: addDays(dayStart, 365) });

  const today = allEntries.filter((entry) => entry.startsAt >= dayStart && entry.startsAt < addDays(dayStart, 1));
  const upcoming = allEntries.filter((entry) => entry.startsAt >= reference && entry.status !== "completed" && entry.status !== "no_show");
  const clientsMap = new Map<number, ProfessionalPortalSnapshot["clients"][number]>();
  for (const entry of allEntries) {
    if (!entry.contactId || !entry.contactName) continue;
    const current = clientsMap.get(entry.contactId);
    if (!current || entry.startsAt > current.lastAppointmentAt) {
      clientsMap.set(entry.contactId, {
        id: entry.contactId,
        name: entry.contactName,
        phone: entry.contactPhone ?? "",
        city: entry.contactCity,
        neighborhood: entry.contactNeighborhood,
        stage: entry.contactStage,
        lastAppointmentAt: entry.startsAt,
      });
    }
  }

  return {
    timezone: workspace.timezone,
    professionalId,
    professionalName: professional.name,
    professionalSpecialty: professional.specialty,
    professionalColor: professional.color,
    todayCount: today.length,
    weekCount: weekEntries.length,
    monthCount: monthEntries.length,
    pendingCount: allEntries.filter((entry) => entry.status === "requested" || entry.status === "confirmed" || entry.status === "in_progress").length,
    completedCount: monthEntries.filter((entry) => entry.status === "completed").length,
    nextAppointment: upcoming[0] ?? null,
    today,
    upcoming: upcoming.slice(0, 12),
    week: weekEntries,
    month: monthEntries,
    clients: Array.from(clientsMap.values()).sort((a, b) => b.lastAppointmentAt.getTime() - a.lastAppointmentAt.getTime()).slice(0, 40),
  };
}

/**
 * Recomputes the status of an appointment, keeping the professional ownership
 * boundary enforced on the server. A professional may only move their own
 * appointments; managers keep full access.
 */
export async function transitionAppointment(input: {
  workspaceId: number;
  appointmentId: number;
  status: AppointmentStatus;
  actorUserId?: number;
  restrictToProfessionalId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  const filters = [eq(appointmentsTable.id, input.appointmentId), eq(appointmentsTable.workspaceId, input.workspaceId)];
  if (input.restrictToProfessionalId) filters.push(eq(appointmentsTable.professionalId, input.restrictToProfessionalId));
  const appointment = (await db.select().from(appointmentsTable).where(and(...filters)).limit(1))[0];
  if (!appointment) return undefined;
  if (appointment.status === input.status) return appointment;
  const updatedAt = new Date();
  const updated = await db.update(appointmentsTable).set({ status: input.status, updatedAt }).where(and(eq(appointmentsTable.id, appointment.id), eq(appointmentsTable.workspaceId, input.workspaceId))).returning();
  if (input.status === "confirmed" || input.status === "cancelled") {
    await enqueueDomainEvent({
      workspaceId: input.workspaceId,
      event: input.status === "confirmed" ? "appointment.confirmed" : "appointment.cancelled",
      aggregateType: "appointment",
      aggregateId: appointment.id,
      eventKey: `appointment.${input.status}:${appointment.id}:${updatedAt.toISOString()}`,
      payload: { appointmentId: appointment.id, contactId: appointment.contactId, professionalId: appointment.professionalId, status: input.status, changedAt: updatedAt },
    });
  }
  return updated[0];
}

export async function professionalCanExecuteService(workspaceId: number, professionalId: number, serviceId: number) {
  const db = await getDb();
  if (!db) return false;
  const link = (await db.select({ id: professionalServices.id }).from(professionalServices).where(and(
    eq(professionalServices.workspaceId, workspaceId),
    eq(professionalServices.professionalId, professionalId),
    eq(professionalServices.serviceId, serviceId),
    eq(professionalServices.active, 1),
  )).limit(1))[0];
  if (link) return true;
  const anyLink = (await db.select({ id: professionalServices.id }).from(professionalServices).where(eq(professionalServices.workspaceId, workspaceId)).limit(1))[0];
  if (anyLink) return false;
  const service = (await db.select({ id: services.id }).from(services).where(and(eq(services.id, serviceId), eq(services.workspaceId, workspaceId), eq(services.active, 1))).limit(1))[0];
  return Boolean(service);
}

export async function listActiveProfessionalsForService(workspaceId: number, serviceId: number) {
  const db = await getDb();
  if (!db) return [];
  const links = await db.select({ professionalId: professionalServices.professionalId }).from(professionalServices)
    .where(and(eq(professionalServices.workspaceId, workspaceId), eq(professionalServices.serviceId, serviceId), eq(professionalServices.active, 1)));
  const linkedIds = links.map((link) => link.professionalId);
  const rows = await db.select().from(professionals).where(and(eq(professionals.workspaceId, workspaceId), eq(professionals.active, 1)));
  const filtered = linkedIds.length > 0 ? rows.filter((row) => linkedIds.includes(row.id)) : rows;
  return filtered;
}

export async function listAvailabilityForProfessional(workspaceId: number, professionalId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(availability).where(and(eq(availability.workspaceId, workspaceId), eq(availability.professionalId, professionalId))).orderBy(availability.weekday);
  return rows;
}
