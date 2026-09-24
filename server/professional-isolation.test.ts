import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { ensureDemoWorkspace, getDb } from "./db";
import { appointmentsTable, professionals, professionalServices, services, users, workspaceMembers } from "../drizzle/schema";
import { and, eq, inArray } from "drizzle-orm";

/**
 * The isolation suite runs against a real PostgreSQL instance. It is skipped
 * automatically when DATABASE_URL is not configured, so the default test run
 * (contract tests without a database) keeps working in any environment.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL && /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL));

function createContext(user: TrpcContext["user"]): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe.skipIf(!hasDatabase)("professional agenda isolation", () => {
  const suffix = `iso${Date.now()}`;
  let workspaceId = 0;
  let serviceId = 0;
  let professionalAId = 0;
  let professionalBId = 0;
  let appointmentAId = 0;
  let appointmentBId = 0;
  let adminUserId = 0;
  let professionalAUserId = 0;
  let professionalBUserId = 0;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const workspace = await ensureDemoWorkspace();
    if (!workspace) throw new Error("workspace unavailable");
    workspaceId = workspace.id;

    // The installation keeps a single global administrator (`users_single_admin_idx`),
    // so the owner of this fixture is defined by the workspace membership instead.
    const [admin] = await db.insert(users).values({ openId: `admin_${suffix}`, name: "Isolation Owner", email: `admin_${suffix}@test.local`, role: "user" }).returning();
    const [userA] = await db.insert(users).values({ openId: `prof_a_${suffix}`, name: "Isolation Prof A", email: `a_${suffix}@test.local`, operationalRole: "professional" }).returning();
    const [userB] = await db.insert(users).values({ openId: `prof_b_${suffix}`, name: "Isolation Prof B", email: `b_${suffix}@test.local`, operationalRole: "professional" }).returning();
    adminUserId = admin.id;
    professionalAUserId = userA.id;
    professionalBUserId = userB.id;

    const [profA] = await db.insert(professionals).values({ workspaceId, name: `Executor A ${suffix}`, specialty: "Elétrica" }).returning();
    const [profB] = await db.insert(professionals).values({ workspaceId, name: `Executor B ${suffix}`, specialty: "Hidráulica" }).returning();
    professionalAId = profA.id;
    professionalBId = profB.id;

    await db.insert(workspaceMembers).values([
      { workspaceId, userId: admin.id, role: "owner" },
      { workspaceId, userId: userA.id, role: "agent", professionalId: professionalAId },
      { workspaceId, userId: userB.id, role: "agent", professionalId: professionalBId },
    ]);

    const [service] = await db.insert(services).values({ workspaceId, name: `Serviço ${suffix}`, durationMinutes: 60 }).returning();
    serviceId = service.id;
    await db.insert(professionalServices).values([
      { workspaceId, professionalId: professionalAId, serviceId },
      { workspaceId, professionalId: professionalBId, serviceId },
    ]);

    const base = new Date("2030-01-10T13:00:00.000Z");
    const [appointmentA] = await db.insert(appointmentsTable).values({
      workspaceId, serviceId, professionalId: professionalAId,
      startsAt: base, endsAt: new Date(base.getTime() + 3_600_000), status: "confirmed", notes: "Do profissional A",
    }).returning();
    const [appointmentB] = await db.insert(appointmentsTable).values({
      workspaceId, serviceId, professionalId: professionalBId,
      startsAt: new Date(base.getTime() + 7_200_000), endsAt: new Date(base.getTime() + 10_800_000), status: "confirmed", notes: "Do profissional B",
    }).returning();
    appointmentAId = appointmentA.id;
    appointmentBId = appointmentB.id;
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(appointmentsTable).where(inArray(appointmentsTable.professionalId, [professionalAId, professionalBId].filter(Boolean)));
    await db.delete(professionalServices).where(inArray(professionalServices.professionalId, [professionalAId, professionalBId].filter(Boolean)));
    await db.delete(services).where(inArray(services.id, serviceId ? [serviceId] : []));
    await db.delete(workspaceMembers).where(inArray(workspaceMembers.userId, [adminUserId, professionalAUserId, professionalBUserId].filter(Boolean)));
    await db.delete(professionals).where(inArray(professionals.id, [professionalAId, professionalBId].filter(Boolean)));
    await db.delete(users).where(inArray(users.id, [adminUserId, professionalAUserId, professionalBUserId].filter(Boolean)));
  });

  const callerFor = (userId: number, operationalRole: "professional" | "human_attendant" | null = null, role: "user" | "admin" = "user") =>
    appRouter.createCaller(createContext({ id: userId, role, operationalRole } as TrpcContext["user"]));

  it("keeps the professional inside the assignments linked to their own professionalId", async () => {
    const result = await callerFor(professionalAUserId, "professional").professional.myAgenda();
    expect(result.linked).toBe(true);
    if (!result.linked) return;
    expect(result.professionalId).toBe(professionalAId);
    const ids = [...result.today, ...result.week, ...result.month, ...result.upcoming].map((entry) => entry.id);
    expect(ids).not.toContain(appointmentBId);
  });

  it("refuses status changes on appointments owned by another professional", async () => {
    const caller = callerFor(professionalAUserId, "professional");
    await expect(caller.agenda.updateMyStatus({ id: appointmentBId, status: "completed" }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller.agenda.updateStatus({ id: appointmentBId, status: "completed" }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller.agenda.cancel({ id: appointmentBId }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("allows a professional to update their own appointment", async () => {
    const caller = callerFor(professionalAUserId, "professional");
    const updated = await caller.agenda.updateMyStatus({ id: appointmentAId, status: "in_progress" });
    expect(updated).toMatchObject({ id: appointmentAId, status: "in_progress" });
  });

  it("lets a manager read the full agenda but never lets an executor create for someone else", async () => {
    const managerCaller = callerFor(adminUserId, "human_attendant");
    const snapshot = await managerCaller.agenda.snapshot();
    const ids = snapshot.appointments.map((appointment) => appointment.id);
    expect(ids).toContain(appointmentAId);
    expect(ids).toContain(appointmentBId);

    const executorCaller = callerFor(professionalAUserId, "professional");
    await expect(executorCaller.agenda.create({
      serviceId,
      professionalId: professionalBId,
      startsAt: new Date("2030-02-01T13:00:00.000Z"),
      endsAt: new Date("2030-02-01T14:00:00.000Z"),
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks a deactivated member from reading the agenda", async () => {
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    await db.update(workspaceMembers).set({ active: 0 })
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, professionalBUserId)));
    const caller = callerFor(professionalBUserId, "professional");
    await expect(caller.agenda.snapshot()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await db.update(workspaceMembers).set({ active: 1 })
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, professionalBUserId)));
  });
});
