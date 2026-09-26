import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { users, workspaceUserUsageBuckets, workspaceUsageBuckets, workspaces } from "../drizzle/schema";
import { cleanupWorkspaceUsageBuckets, getDb } from "./db";

const hasDatabase = Boolean(process.env.DATABASE_URL && /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL));

describe.skipIf(!hasDatabase)("workspace usage retention", () => {
  const suffix = `retention${Date.now()}`;
  let workspaceId = 0;
  let userId = 0;
  const oldBucket = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  const currentBucket = new Date();

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const [workspace] = await db.insert(workspaces).values({ name: `Retention ${suffix}`, slug: `retention-${suffix}` }).returning({ id: workspaces.id });
    const [user] = await db.insert(users).values({ openId: `retention-user-${suffix}`, name: "Retention User" }).returning({ id: users.id });
    workspaceId = workspace!.id;
    userId = user!.id;
    await db.insert(workspaceUsageBuckets).values([
      { workspaceId, bucketStart: oldBucket, apiRequests: 3 },
      { workspaceId, bucketStart: currentBucket, apiRequests: 2 },
    ]);
    await db.insert(workspaceUserUsageBuckets).values([
      { workspaceId, userId, bucketStart: oldBucket, apiRequests: 3 },
      { workspaceId, userId, bucketStart: currentBucket, apiRequests: 2 },
    ]);
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(workspaceUserUsageBuckets).where(inArray(workspaceUserUsageBuckets.workspaceId, [workspaceId]));
    await db.delete(workspaceUsageBuckets).where(inArray(workspaceUsageBuckets.workspaceId, [workspaceId]));
    await db.delete(users).where(inArray(users.id, [userId]));
    await db.delete(workspaces).where(inArray(workspaces.id, [workspaceId]));
  });

  it("removes only buckets older than the configured retention window", async () => {
    const result = await cleanupWorkspaceUsageBuckets(7);
    expect(result).toMatchObject({ workspaceBuckets: 1, userBuckets: 1, retentionDays: 7 });
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const workspaceRows = await db.select().from(workspaceUsageBuckets).where(inArray(workspaceUsageBuckets.workspaceId, [workspaceId]));
    const userRows = await db.select().from(workspaceUserUsageBuckets).where(inArray(workspaceUserUsageBuckets.workspaceId, [workspaceId]));
    expect(workspaceRows).toHaveLength(1);
    expect(userRows).toHaveLength(1);
  });
});
