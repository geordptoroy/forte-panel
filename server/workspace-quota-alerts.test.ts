import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { notifications, users, workspaceMembers, workspaceUsageBuckets, workspaces } from "../drizzle/schema";
import { getDb, processWorkspaceQuotaAlertsOnce } from "./db";

const hasDatabase = Boolean(process.env.DATABASE_URL && /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL));

describe.skipIf(!hasDatabase)("workspace quota alerts", () => {
  const suffix = `quota-alert${Date.now()}`;
  let workspaceAId = 0;
  let workspaceBId = 0;
  let userAId = 0;
  let userBId = 0;
  const bucketStart = new Date(Math.floor(Date.now() / 60_000) * 60_000);

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const workspaceRows = await db.insert(workspaces).values([
      { name: `Quota Alert A ${suffix}`, slug: `quota-alert-a-${suffix}` },
      { name: `Quota Alert B ${suffix}`, slug: `quota-alert-b-${suffix}` },
    ]).returning({ id: workspaces.id });
    workspaceAId = workspaceRows[0]!.id;
    workspaceBId = workspaceRows[1]!.id;
    const userRows = await db.insert(users).values([
      { openId: `quota-alert-user-a-${suffix}`, name: "Quota Manager A" },
      { openId: `quota-alert-user-b-${suffix}`, name: "Quota Manager B" },
    ]).returning({ id: users.id });
    userAId = userRows[0]!.id;
    userBId = userRows[1]!.id;
    await db.insert(workspaceMembers).values([
      { workspaceId: workspaceAId, userId: userAId, role: "manager" },
      { workspaceId: workspaceBId, userId: userBId, role: "manager" },
    ]);
    await db.insert(workspaceUsageBuckets).values({ workspaceId: workspaceAId, bucketStart, apiRequests: 84 });
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    const workspaceIds = [workspaceAId, workspaceBId].filter(Boolean);
    const userIds = [userAId, userBId].filter(Boolean);
    await db.delete(notifications).where(inArray(notifications.workspaceId, workspaceIds));
    await db.delete(workspaceUsageBuckets).where(inArray(workspaceUsageBuckets.workspaceId, workspaceIds));
    await db.delete(workspaceMembers).where(inArray(workspaceMembers.workspaceId, workspaceIds));
    await db.delete(users).where(inArray(users.id, userIds));
    await db.delete(workspaces).where(inArray(workspaces.id, workspaceIds));
  });

  it("creates one 70% alert per workspace and does not duplicate repeated sweeps", async () => {
    const first = await processWorkspaceQuotaAlertsOnce(bucketStart, workspaceAId);
    const second = await processWorkspaceQuotaAlertsOnce(bucketStart, workspaceAId);
    expect(first.processed).toBe(1);
    expect(second.processed).toBe(0);
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const rows = await db.select().from(notifications).where(and(eq(notifications.workspaceId, workspaceAId), eq(notifications.userId, userAId)));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: "quota_warning", title: "Consumo elevado", href: "/integrations" });
  });

  it("does not create an alert in another workspace without usage", async () => {
    const result = await processWorkspaceQuotaAlertsOnce(bucketStart, workspaceBId);
    expect(result.processed).toBe(0);
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const rows = await db.select().from(notifications).where(eq(notifications.workspaceId, workspaceBId));
    expect(rows).toHaveLength(0);
  });
});
