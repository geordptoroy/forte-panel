import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { appointmentsTable, availability, contacts, professionals, professionalServices, services, workspaces } from "../drizzle/schema";
import { cancelAgendaAppointment, createAgendaAppointment, getAgendaSnapshot, getDb, rescheduleAgendaAppointment } from "./db";
import { getProfessionalPortalSnapshot, listAppointmentsForProfessional, transitionAppointment } from "./agenda";
import { ScheduleError } from "./schedule";

const hasDatabase = Boolean(process.env.DATABASE_URL && /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL));

describe.skipIf(!hasDatabase)("agenda workspace isolation", () => {
  const suffix = `agenda-${Date.now()}`;
  let workspaceAId = 0;
  let workspaceBId = 0;
  let serviceAId = 0;
  let serviceBId = 0;
  let professionalAId = 0;
  let professionalBId = 0;
  let contactBId = 0;
  let appointmentAId = 0;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const [workspaceA] = await db.insert(workspaces).values({ name: `Agenda A ${suffix}`, slug: `agenda-a-${suffix}` }).returning();
    const [workspaceB] = await db.insert(workspaces).values({ name: `Agenda B ${suffix}`, slug: `agenda-b-${suffix}` }).returning();
    workspaceAId = workspaceA.id;
    workspaceBId = workspaceB.id;

    const [serviceA] = await db.insert(services).values({ workspaceId: workspaceAId, name: `Service A ${suffix}` }).returning();
    const [serviceB] = await db.insert(services).values({ workspaceId: workspaceBId, name: `Service B ${suffix}` }).returning();
    serviceAId = serviceA.id;
    serviceBId = serviceB.id;
    const [professionalA] = await db.insert(professionals).values({ workspaceId: workspaceAId, name: `Professional A ${suffix}` }).returning();
    const [professionalB] = await db.insert(professionals).values({ workspaceId: workspaceBId, name: `Professional B ${suffix}` }).returning();
    professionalAId = professionalA.id;
    professionalBId = professionalB.id;
    await db.insert(professionalServices).values([
      { workspaceId: workspaceAId, professionalId: professionalAId, serviceId: serviceAId, active: 1 },
      { workspaceId: workspaceBId, professionalId: professionalBId, serviceId: serviceBId, active: 1 },
    ]);
    await db.insert(availability).values([1, 2, 3, 4, 5].flatMap((weekday) => [
      { workspaceId: workspaceAId, professionalId: professionalAId, weekday, startMinute: 9 * 60, endMinute: 18 * 60 },
      { workspaceId: workspaceBId, professionalId: professionalBId, weekday, startMinute: 9 * 60, endMinute: 18 * 60 },
    ]));
    const [contactB] = await db.insert(contacts).values({ workspaceId: workspaceBId, externalPhone: `999${Date.now()}`, name: `Contact B ${suffix}` }).returning();
    contactBId = contactB.id;

    const [appointment] = await db.insert(appointmentsTable).values({
      workspaceId: workspaceAId,
      serviceId: serviceAId,
      professionalId: professionalAId,
      startsAt: new Date("2030-01-10T13:00:00.000Z"),
      endsAt: new Date("2030-01-10T14:00:00.000Z"),
      status: "confirmed",
      notes: "Tenant A appointment",
    }).returning();
    appointmentAId = appointment.id;
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    const workspaceIds = [workspaceAId, workspaceBId].filter(Boolean);
    if (!workspaceIds.length) return;
    await db.delete(appointmentsTable).where(inArray(appointmentsTable.workspaceId, workspaceIds));
    await db.delete(availability).where(inArray(availability.workspaceId, workspaceIds));
    await db.delete(professionalServices).where(inArray(professionalServices.workspaceId, workspaceIds));
    await db.delete(contacts).where(and(eq(contacts.id, contactBId), eq(contacts.workspaceId, workspaceBId)));
    await db.delete(services).where(inArray(services.workspaceId, workspaceIds));
    await db.delete(professionals).where(inArray(professionals.workspaceId, workspaceIds));
    await db.delete(workspaces).where(inArray(workspaces.id, workspaceIds));
  });

  it("lists agenda, services, professionals, and portal data only for the selected workspace", async () => {
    const snapshotA = await getAgendaSnapshot(workspaceAId, undefined, true);
    expect(snapshotA.services.map((row) => row.id)).toContain(serviceAId);
    expect(snapshotA.services.map((row) => row.id)).not.toContain(serviceBId);
    expect(snapshotA.professionals.map((row) => row.id)).toContain(professionalAId);
    expect(snapshotA.professionals.map((row) => row.id)).not.toContain(professionalBId);
    expect(snapshotA.appointments.map((row) => row.id)).toContain(appointmentAId);
    expect(await listAppointmentsForProfessional(workspaceAId, professionalBId)).toEqual([]);
    const foreignProfessionalPortal = await getProfessionalPortalSnapshot(workspaceAId, professionalBId);
    expect(foreignProfessionalPortal.professionalName).toBeNull();
    expect(foreignProfessionalPortal.month).toEqual([]);
  });

  it("rejects creating appointments with foreign workspace resources", async () => {
    const startsAt = new Date("2030-01-11T13:00:00.000Z");
    const endsAt = new Date("2030-01-11T14:00:00.000Z");
    await expect(createAgendaAppointment(workspaceAId, { serviceId: serviceBId, professionalId: professionalAId, startsAt, endsAt }))
      .rejects.toMatchObject({ reason: "service_unavailable" } satisfies Partial<ScheduleError>);
    await expect(createAgendaAppointment(workspaceAId, { serviceId: serviceAId, professionalId: professionalBId, startsAt, endsAt }))
      .rejects.toMatchObject({ reason: "professional_unavailable" } satisfies Partial<ScheduleError>);
    await expect(createAgendaAppointment(workspaceAId, { contactId: contactBId, serviceId: serviceAId, professionalId: professionalAId, startsAt, endsAt }))
      .rejects.toMatchObject({ reason: "contact_unavailable" } satisfies Partial<ScheduleError>);
  });

  it("cannot mutate or reschedule an appointment by guessing another tenant's ID", async () => {
    await expect(cancelAgendaAppointment(workspaceBId, appointmentAId)).resolves.toBeUndefined();
    await expect(transitionAppointment({ workspaceId: workspaceBId, appointmentId: appointmentAId, status: "completed" })).resolves.toBeUndefined();
    await expect(rescheduleAgendaAppointment(workspaceBId, appointmentAId, new Date("2030-01-11T13:00:00.000Z"), new Date("2030-01-11T14:00:00.000Z"))).resolves.toBeUndefined();
    const db = await getDb();
    const unchanged = await db!.select().from(appointmentsTable).where(and(eq(appointmentsTable.id, appointmentAId), eq(appointmentsTable.workspaceId, workspaceAId))).limit(1);
    expect(unchanged[0]?.status).toBe("confirmed");
    expect(unchanged[0]?.startsAt).toEqual(new Date("2030-01-10T13:00:00.000Z"));
  });
});
