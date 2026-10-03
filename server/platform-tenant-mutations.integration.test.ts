import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import {
  platformAdmins,
  platformAuditLogs,
  platformIncidents,
  supportSessions,
  workspaces,
} from "../drizzle/schema";
import { startSupportSession } from "./platform-admin";
import { getDb } from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const configuredDatabaseUrl = process.env.DATABASE_URL;
const hasLocalDatabase = (() => {
  if (!configuredDatabaseUrl || !/^postgres(ql)?:\/\//i.test(configuredDatabaseUrl))
    return false;
  try {
    const host = new URL(configuredDatabaseUrl).hostname.replace(/^\[|\]$/g, "");
    return ["localhost", "127.0.0.1", "::1"].includes(host);
  } catch {
    return false;
  }
})();

function createContext(userId: number): TrpcContext {
  const now = new Date();
  return {
    user: {
      id: userId,
      openId: `tenant-mutation-${userId}`,
      name: "Operador de teste",
      email: `${userId}@tenant-mutation.test`,
      phone: null,
      loginMethod: "test",
      role: "user",
      passwordHash: null,
      operationalRole: null,
      sessionVersion: 0,
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
    },
    workspace: {
      workspaceId: 1,
      workspaceName: "Fixture",
      workspaceSlug: "fixture",
      segment: "services",
      plan: "starter",
      timezone: "UTC",
      memberId: userId,
      role: "owner",
      professionalId: null,
      operationalRole: null,
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe.skipIf(!hasLocalDatabase)("platform tenant mutations require an operator support session", () => {
  const suffix = `${process.pid}-${Date.now()}`;
  const adminAUserId = 1_800_000_000 + (Date.now() % 100_000_000);
  const adminBUserId = adminAUserId + 1;
  let adminAId = 0;
  let adminBId = 0;
  let workspaceAId = 0;
  let workspaceBId = 0;
  let incidentId = 0;
  const callerA = () => appRouter.createCaller(createContext(adminAUserId));

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const [adminA] = await db
      .insert(platformAdmins)
      .values({ userId: adminAUserId, permission: "platform_support_operator" })
      .returning({ id: platformAdmins.id });
    const [adminB] = await db
      .insert(platformAdmins)
      .values({ userId: adminBUserId, permission: "platform_support_operator" })
      .returning({ id: platformAdmins.id });
    adminAId = adminA!.id;
    adminBId = adminB!.id;
    const inserted = await db
      .insert(workspaces)
      .values([
        { name: `Tenant mutation A ${suffix}`, slug: `tenant-mutation-a-${suffix}` },
        { name: `Tenant mutation B ${suffix}`, slug: `tenant-mutation-b-${suffix}` },
      ])
      .returning({ id: workspaces.id });
    workspaceAId = inserted[0]!.id;
    workspaceBId = inserted[1]!.id;
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    const workspaceIds = [workspaceAId, workspaceBId].filter(Boolean);
    const adminIds = [adminAId, adminBId].filter(Boolean);
    if (incidentId)
      await db.delete(platformIncidents).where(eq(platformIncidents.id, incidentId));
    if (adminIds.length && workspaceIds.length) {
      await db
        .delete(platformAuditLogs)
        .where(
          and(
            inArray(platformAuditLogs.platformAdminId, adminIds),
            inArray(platformAuditLogs.workspaceId, workspaceIds)
          )
        );
      await db
        .delete(supportSessions)
        .where(
          and(
            inArray(supportSessions.platformAdminId, adminIds),
            inArray(supportSessions.workspaceId, workspaceIds)
          )
        );
    }
    if (workspaceIds.length)
      await db.delete(workspaces).where(inArray(workspaces.id, workspaceIds));
    if (adminIds.length)
      await db.delete(platformAdmins).where(inArray(platformAdmins.id, adminIds));
  });

  it("forbids missing sessions, read-only sessions, wrong workspace sessions, and another admin's session", async () => {
    await expect(
      callerA().platform.setWorkspaceLifecycleStatus({
        workspaceId: workspaceAId,
        status: "suspended",
        reason: "Must require support session",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      callerA().platform.setWorkspacePlan({
        workspaceId: workspaceAId,
        plan: "pro",
        reason: "Must require support session",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      callerA().platform.openIncident({
        workspaceId: workspaceAId,
        severity: "low",
        title: "No session incident",
        details: "This must not be persisted",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const readOnly = await startSupportSession({
      platformAdminId: adminAId,
      workspaceId: workspaceAId,
      mode: "read_only",
      reason: "Test read-only boundary",
      expiresInMinutes: 5,
    });
    const wrongWorkspace = await startSupportSession({
      platformAdminId: adminAId,
      workspaceId: workspaceBId,
      mode: "operator",
      reason: "Test workspace boundary",
      expiresInMinutes: 5,
    });
    const wrongAdmin = await startSupportSession({
      platformAdminId: adminBId,
      workspaceId: workspaceAId,
      mode: "operator",
      reason: "Test admin boundary",
      expiresInMinutes: 5,
    });

    for (const sessionId of [readOnly.id, wrongWorkspace.id, wrongAdmin.id]) {
      await expect(
        callerA().platform.setWorkspaceLifecycleStatus({
          workspaceId: workspaceAId,
          sessionId,
          status: "suspended",
          reason: "Must reject invalid session",
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await expect(
      callerA().platform.setWorkspacePlan({
        workspaceId: workspaceAId,
        sessionId: readOnly.id,
        plan: "pro",
        reason: "Must reject read-only session",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows a same-admin operator session and records it for status, plan, and incident mutations", async () => {
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const session = await startSupportSession({
      platformAdminId: adminAId,
      workspaceId: workspaceAId,
      mode: "operator",
      reason: "Test authorized tenant mutations",
      expiresInMinutes: 5,
    });

    await expect(
      callerA().platform.setWorkspaceLifecycleStatus({
        workspaceId: workspaceAId,
        sessionId: session.id,
        status: "suspended",
        reason: "Authorized status change",
      })
    ).resolves.toMatchObject({ status: "suspended", active: false });
    await expect(
      callerA().platform.setWorkspacePlan({
        workspaceId: workspaceAId,
        sessionId: session.id,
        plan: "pro",
        reason: "Authorized plan change",
      })
    ).resolves.toMatchObject({ plan: "pro" });
    const incident = await callerA().platform.openIncident({
      workspaceId: workspaceAId,
      sessionId: session.id,
      severity: "low",
      title: "Authorized incident",
      details: "Incident created under a scoped operator support session.",
    });
    incidentId = incident.id;
    await callerA().platform.resolveIncident({
      incidentId,
      sessionId: session.id,
      reason: "Authorized incident resolution",
    });

    const audits = await db
      .select({ action: platformAuditLogs.action, supportSessionId: platformAuditLogs.supportSessionId })
      .from(platformAuditLogs)
      .where(
        and(
          eq(platformAuditLogs.platformAdminId, adminAId),
          eq(platformAuditLogs.workspaceId, workspaceAId),
          inArray(platformAuditLogs.action, [
            "workspace_suspended",
            "workspace_plan_changed",
            "workspace_incident_opened",
            "workspace_incident_resolved",
          ])
        )
      );
    expect(audits).toHaveLength(4);
    expect(audits.every(audit => audit.supportSessionId === session.id)).toBe(true);
  });
});
