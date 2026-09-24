import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  appointmentsTable,
  contacts,
  domainEvents,
  notifications,
  professionals,
  services,
  users,
  workspaceMembers,
  workspaceSettings,
  workspaces,
} from "../drizzle/schema";
import {
  enqueueDomainEvent,
  getDb,
  listInAppNotifications,
  markAllInAppNotificationsRead,
  markInAppNotificationRead,
  processDailySummaryNotificationsOnce,
} from "./db";
import { defaultNotificationPreferences, dailySummaryEventKey } from "./notification-contract";
import { saveNotificationPreferences } from "./workspace";

const hasDatabase = Boolean(process.env.DATABASE_URL && /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL));

describe.skipIf(!hasDatabase)("in-app notifications", () => {
  const suffix = `notice${Date.now()}`;
  const phone = `1555${Date.now()}`;
  const eventNow = new Date("2026-09-25T20:00:00.000Z");
  let workspaceId = 0;
  let ownerId = 0;
  let agentId = 0;
  let professionalUserId = 0;
  let professionalId = 0;
  let serviceId = 0;
  let contactId = 0;
  let appointmentId = 0;
  let contactEventKey = "";
  let appointmentEventKey = "";

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const [workspace] = await db.insert(workspaces).values({ name: `Notifications ${suffix}`, slug: `notifications-${suffix}`, timezone: "America/Sao_Paulo" }).returning();
    workspaceId = workspace.id;
    const [owner] = await db.insert(users).values({ openId: `notice_owner_${suffix}`, name: "Notification Owner", email: `${suffix}@owner.test` }).returning();
    const [agent] = await db.insert(users).values({ openId: `notice_agent_${suffix}`, name: "Notification Agent", email: `${suffix}@agent.test` }).returning();
    const [professionalUser] = await db.insert(users).values({ openId: `notice_prof_${suffix}`, name: "Notification Professional", email: `${suffix}@professional.test`, operationalRole: "professional" }).returning();
    ownerId = owner.id;
    agentId = agent.id;
    professionalUserId = professionalUser.id;
    const [professional] = await db.insert(professionals).values({ workspaceId, name: "Executor Notificações" }).returning();
    professionalId = professional.id;
    const [service] = await db.insert(services).values({ workspaceId, name: "Serviço Notificações" }).returning();
    serviceId = service.id;
    await db.insert(workspaceMembers).values([
      { workspaceId, userId: ownerId, role: "owner" },
      { workspaceId, userId: agentId, role: "agent" },
      { workspaceId, userId: professionalUserId, role: "agent", professionalId },
    ]);
    const [contact] = await db.insert(contacts).values({
      workspaceId,
      externalPhone: phone,
      name: "Cliente da Caixa",
      createdAt: new Date("2026-09-25T19:00:00.000Z"),
    }).returning();
    contactId = contact.id;
    const [appointment] = await db.insert(appointmentsTable).values({
      workspaceId,
      contactId,
      serviceId,
      professionalId,
      startsAt: eventNow,
      endsAt: new Date(eventNow.getTime() + 60 * 60_000),
      status: "requested",
      createdAt: new Date("2026-09-25T19:05:00.000Z"),
    }).returning();
    appointmentId = appointment.id;
    contactEventKey = `contact.created:${contactId}:notifications-test`;
    appointmentEventKey = `appointment.created:${appointmentId}:notifications-test`;
    await saveNotificationPreferences(workspaceId, defaultNotificationPreferences);
  });

  beforeEach(async () => {
    await saveNotificationPreferences(workspaceId, defaultNotificationPreferences);
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db || !workspaceId) return;
    await db.delete(notifications).where(eq(notifications.workspaceId, workspaceId));
    await db.delete(domainEvents).where(eq(domainEvents.workspaceId, workspaceId));
    await db.delete(workspaceSettings).where(eq(workspaceSettings.workspaceId, workspaceId));
    await db.delete(appointmentsTable).where(eq(appointmentsTable.workspaceId, workspaceId));
    await db.delete(contacts).where(eq(contacts.workspaceId, workspaceId));
    await db.delete(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId));
    await db.delete(services).where(eq(services.workspaceId, workspaceId));
    await db.delete(professionals).where(eq(professionals.workspaceId, workspaceId));
    await db.delete(users).where(inArray(users.id, [ownerId, agentId, professionalUserId].filter(Boolean)));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  });

  it("routes new-lead notifications to managers and human agents, once per event", async () => {
    const event = {
      workspaceId,
      event: "contact.created" as const,
      aggregateType: "contact",
      aggregateId: contactId,
      eventKey: contactEventKey,
      payload: { contactId, name: "Cliente da Caixa" },
    };
    await enqueueDomainEvent(event);
    await enqueueDomainEvent(event);
    const [owner, agent, professional] = await Promise.all([
      listInAppNotifications(workspaceId, ownerId),
      listInAppNotifications(workspaceId, agentId),
      listInAppNotifications(workspaceId, professionalUserId),
    ]);
    expect(owner.items.filter((item) => item.eventKey === contactEventKey)).toHaveLength(1);
    expect(owner.items.find((item) => item.eventKey === contactEventKey)).toMatchObject({ title: "Novo lead", href: "/inbox" });
    expect(agent.items.some((item) => item.eventKey === contactEventKey)).toBe(true);
    expect(professional.items.some((item) => item.eventKey === contactEventKey)).toBe(false);
  });

  it("routes appointment events only to managers and the assigned professional", async () => {
    await enqueueDomainEvent({
      workspaceId,
      event: "appointment.created",
      aggregateType: "appointment",
      aggregateId: appointmentId,
      eventKey: appointmentEventKey,
      payload: { appointmentId, contactId, professionalId },
    });
    const [owner, agent, professional] = await Promise.all([
      listInAppNotifications(workspaceId, ownerId),
      listInAppNotifications(workspaceId, agentId),
      listInAppNotifications(workspaceId, professionalUserId),
    ]);
    expect(owner.items.find((item) => item.eventKey === appointmentEventKey)).toMatchObject({ title: "Novo agendamento", href: "/agenda" });
    expect(professional.items.some((item) => item.eventKey === appointmentEventKey)).toBe(true);
    expect(agent.items.some((item) => item.eventKey === appointmentEventKey)).toBe(false);
  });

  it("honors disabled preferences and enforces per-user read isolation", async () => {
    await saveNotificationPreferences(workspaceId, { ...defaultNotificationPreferences, newLead: false });
    const disabledKey = `contact.created:${contactId}:notifications-disabled`;
    await enqueueDomainEvent({
      workspaceId,
      event: "contact.created",
      aggregateType: "contact",
      aggregateId: contactId,
      eventKey: disabledKey,
      payload: { contactId, name: "Lead silencioso" },
    });
    expect((await listInAppNotifications(workspaceId, ownerId)).items.some((item) => item.eventKey === disabledKey)).toBe(false);

    await saveNotificationPreferences(workspaceId, defaultNotificationPreferences);
    await enqueueDomainEvent({
      workspaceId,
      event: "contact.created",
      aggregateType: "contact",
      aggregateId: contactId,
      eventKey: contactEventKey,
      payload: { contactId, name: "Cliente da Caixa" },
    });
    const ownerBefore = await listInAppNotifications(workspaceId, ownerId);
    const notification = ownerBefore.items.find((item) => item.eventKey === contactEventKey);
    expect(notification).toBeDefined();
    if (!notification) return;
    expect(await markInAppNotificationRead(workspaceId, agentId, notification.id)).toBe(false);
    expect(await markInAppNotificationRead(workspaceId, ownerId, notification.id)).toBe(true);
    expect((await listInAppNotifications(workspaceId, ownerId)).unreadCount).toBe(ownerBefore.unreadCount - 1);
    expect(await markAllInAppNotificationsRead(workspaceId, ownerId)).toBeGreaterThanOrEqual(0);
    expect((await listInAppNotifications(workspaceId, ownerId)).unreadCount).toBe(0);
  });

  it("creates one local-time daily summary per manager after 18:00", async () => {
    await saveNotificationPreferences(workspaceId, { ...defaultNotificationPreferences, dailySummary: true });
    const beforeSix = await processDailySummaryNotificationsOnce(new Date("2026-09-25T20:00:00.000Z"), workspaceId); // 17:00 in São Paulo
    expect(beforeSix.processed).toBe(0);
    const afterSix = await processDailySummaryNotificationsOnce(new Date("2026-09-25T22:00:00.000Z"), workspaceId); // 19:00 in São Paulo
    expect(afterSix.processed).toBe(1);
    const repeated = await processDailySummaryNotificationsOnce(new Date("2026-09-25T22:01:00.000Z"), workspaceId);
    expect(repeated.processed).toBe(0);

    const ownerItems = (await listInAppNotifications(workspaceId, ownerId)).items;
    const dailySummary = ownerItems.find((item) => item.eventKey === dailySummaryEventKey(workspaceId, "2026-09-25"));
    expect(dailySummary?.body).toBe("1 atendimento · 1 novo lead em 25/09/2026.");
    expect((await listInAppNotifications(workspaceId, agentId)).items.some((item) => item.type === "daily_summary")).toBe(false);
  });
});
