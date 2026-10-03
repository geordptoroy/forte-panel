import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const gateway = vi.hoisted(() => ({ deleteBaileysInstance: vi.fn() }));
vi.mock("./baileys-gateway", async importOriginal => {
  const actual = await importOriginal<typeof import("./baileys-gateway")>();
  return { ...actual, deleteBaileysInstance: gateway.deleteBaileysInstance };
});

import { and, eq, inArray } from "drizzle-orm";
import {
  platformAdmins,
  platformAuditLogs,
  whatsappInstances,
  workspaces,
} from "../drizzle/schema";
import { ensurePlatformSupportWorkspace } from "./platform-admin";
import { appRouter } from "./routers";
import { getDb } from "./db";
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
      openId: `support-delete-${userId}`,
      name: "Operador de teste",
      email: `${userId}@support.test`,
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

describe.skipIf(!hasLocalDatabase)("platform support Baileys instance deletion ownership", () => {
  const suffix = `${process.pid}-${Date.now()}`;
  const operatorUserId = 1_900_000_000 + (Date.now() % 100_000_000);
  const ownInstanceId = `support-own-${suffix}`;
  const foreignInstanceId = `support-foreign-${suffix}`;
  let platformAdminId = 0;
  let supportWorkspaceId = 0;
  let foreignWorkspaceId = 0;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const [platformAdmin] = await db
      .insert(platformAdmins)
      .values({ userId: operatorUserId, permission: "platform_support_operator" })
      .returning({ id: platformAdmins.id });
    platformAdminId = platformAdmin!.id;

    const supportWorkspace = await ensurePlatformSupportWorkspace();
    supportWorkspaceId = supportWorkspace.id;
    const [foreignWorkspace] = await db
      .insert(workspaces)
      .values({
        name: `Foreign support delete ${suffix}`,
        slug: `foreign-support-delete-${suffix}`,
      })
      .returning({ id: workspaces.id });
    foreignWorkspaceId = foreignWorkspace!.id;

    await db.insert(whatsappInstances).values([
      {
        workspaceId: supportWorkspaceId,
        provider: "baileys",
        instanceId: ownInstanceId,
        name: "Instância interna de teste",
        active: 1,
      },
      {
        workspaceId: foreignWorkspaceId,
        provider: "baileys",
        instanceId: foreignInstanceId,
        name: "Instância estrangeira de teste",
        active: 1,
      },
    ]);
  });

  beforeEach(() => gateway.deleteBaileysInstance.mockReset());

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    const ids = [ownInstanceId, foreignInstanceId];
    await db.delete(whatsappInstances).where(inArray(whatsappInstances.instanceId, ids));
    if (foreignWorkspaceId)
      await db.delete(workspaces).where(eq(workspaces.id, foreignWorkspaceId));
    if (platformAdminId) {
      await db
        .delete(platformAuditLogs)
        .where(
          and(
            eq(platformAuditLogs.platformAdminId, platformAdminId),
            eq(platformAuditLogs.workspaceId, supportWorkspaceId)
          )
        );
      await db.delete(platformAdmins).where(eq(platformAdmins.id, platformAdminId));
    }
  });

  it("rejects a foreign instance before making any gateway request", async () => {
    const caller = appRouter.createCaller(createContext(operatorUserId));

    await expect(
      caller.platform.supportDeleteBaileysInstance({
        instanceId: foreignInstanceId,
        confirmDeletion: true,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(gateway.deleteBaileysInstance).not.toHaveBeenCalled();
  });

  it("deletes only the owned instance and records the scoped audit event", async () => {
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const caller = appRouter.createCaller(createContext(operatorUserId));

    await expect(
      caller.platform.supportDeleteBaileysInstance({
        instanceId: ownInstanceId,
        confirmDeletion: true,
      })
    ).resolves.toEqual({ success: true, instanceId: ownInstanceId });

    expect(gateway.deleteBaileysInstance).toHaveBeenCalledTimes(1);
    expect(gateway.deleteBaileysInstance).toHaveBeenCalledWith(ownInstanceId);
    const [archived] = await db
      .select({ active: whatsappInstances.active, status: whatsappInstances.status })
      .from(whatsappInstances)
      .where(eq(whatsappInstances.instanceId, ownInstanceId));
    expect(archived).toMatchObject({ active: 0, status: "deleted" });

    const audits = await db
      .select({ action: platformAuditLogs.action, workspaceId: platformAuditLogs.workspaceId })
      .from(platformAuditLogs)
      .where(
        and(
          eq(platformAuditLogs.platformAdminId, platformAdminId),
          eq(platformAuditLogs.workspaceId, supportWorkspaceId),
          eq(platformAuditLogs.action, "support_baileys_instance_deleted")
        )
      );
    expect(audits).toHaveLength(1);
    expect(audits[0]?.workspaceId).toBe(supportWorkspaceId);
  });
});
