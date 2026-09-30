import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { platformAuditLogs, supportSessions, workspaceUsageBuckets, workspaces } from "../drizzle/schema";
import { getDb, getWorkspaceUsageSnapshot } from "./db";
import { canPlatformAdminMutate, getActiveSupportSession, startSupportSession } from "./platform-admin";

const hasDatabase = Boolean(process.env.DATABASE_URL && /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL));

describe("O6.1 negative tenancy and role proofs", () => {
  it("keeps platform permission boundaries explicit", () => {
    expect(canPlatformAdminMutate("platform_support_readonly")).toBe(false);
    expect(canPlatformAdminMutate("platform_support_operator")).toBe(true);
    expect(canPlatformAdminMutate("platform_admin")).toBe(true);
    expect(canPlatformAdminMutate("platform_support_operator", "read_only")).toBe(false);
    expect(canPlatformAdminMutate("platform_support_operator", "operator")).toBe(true);
  });

  describe.skipIf(!hasDatabase)("database tenant boundaries", () => {
    const suffix = `o61${Date.now()}`;
    const platformAdminId = 9_000_601;
    let workspaceAId = 0;
    let workspaceBId = 0;

    beforeAll(async () => {
      const db = await getDb();
      if (!db) throw new Error("database unavailable");
      const rows = await db.insert(workspaces).values([
        { name: `O6.1 A ${suffix}`, slug: `o61-a-${suffix}` },
        { name: `O6.1 B ${suffix}`, slug: `o61-b-${suffix}` },
      ]).returning({ id: workspaces.id });
      workspaceAId = rows[0]!.id;
      workspaceBId = rows[1]!.id;
    });

    afterAll(async () => {
      const db = await getDb();
      if (!db) return;
      const ids = [workspaceAId, workspaceBId].filter(Boolean);
      await db.delete(platformAuditLogs).where(and(eq(platformAuditLogs.platformAdminId, platformAdminId), inArray(platformAuditLogs.workspaceId, ids)));
      await db.delete(supportSessions).where(and(eq(supportSessions.platformAdminId, platformAdminId), inArray(supportSessions.workspaceId, ids)));
      await db.delete(workspaceUsageBuckets).where(inArray(workspaceUsageBuckets.workspaceId, ids));
      await db.delete(workspaces).where(inArray(workspaces.id, ids));
    });

    it("does not allow a support session to cross workspace or operator identity", async () => {
      const session = await startSupportSession({ platformAdminId, workspaceId: workspaceAId, mode: "operator", reason: "Prova negativa O6.1", expiresInMinutes: 5 });
      await expect(getActiveSupportSession({ platformAdminId, sessionId: session.id, workspaceId: workspaceAId, requireOperator: true })).resolves.toMatchObject({ workspaceId: workspaceAId });
      await expect(getActiveSupportSession({ platformAdminId, sessionId: session.id, workspaceId: workspaceBId, requireOperator: true })).resolves.toBeNull();
      await expect(getActiveSupportSession({ platformAdminId: platformAdminId + 1, sessionId: session.id, workspaceId: workspaceAId, requireOperator: true })).resolves.toBeNull();
    });

    it("does not leak usage buckets between workspaces", async () => {
      const db = await getDb();
      if (!db) throw new Error("database unavailable");
      const bucketStart = new Date(Math.floor(Date.now() / 60_000) * 60_000);
      await db.insert(workspaceUsageBuckets).values({ workspaceId: workspaceBId, bucketStart, apiRequests: 37, aiRequests: 11, outboundMessages: 5 });
      const snapshotA = await getWorkspaceUsageSnapshot(workspaceAId);
      const snapshotB = await getWorkspaceUsageSnapshot(workspaceBId);
      expect(snapshotA.workspace.apiRequests.used).toBe(0);
      expect(snapshotA.workspace.aiRequests.used).toBe(0);
      expect(snapshotB.workspace.apiRequests.used).toBe(37);
      expect(snapshotB.workspace.aiRequests.used).toBe(11);
    });
  });
});
