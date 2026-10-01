import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import {
  agentRuns,
  platformAdmins,
  users,
  workspaces,
} from "../drizzle/schema";

const hasDatabase = Boolean(
  process.env.DATABASE_URL && /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL)
);

describe.skipIf(!hasDatabase)("platform.health response contract", () => {
  const suffix = `platform-health-${Date.now()}`;
  let adminUserId = 0;
  let workspaceAId = 0;
  let workspaceBId = 0;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const [user] = await db.insert(users).values({
      openId: `${suffix}-admin`,
      name: "Platform health test admin",
      role: "user",
    }).returning({ id: users.id });
    adminUserId = user!.id;
    await db.insert(platformAdmins).values({ userId: adminUserId, permission: "platform_admin" });
    const inserted = await db.insert(workspaces).values([
      { name: `Health A ${suffix}`, slug: `health-a-${suffix}` },
      { name: `Health B ${suffix}`, slug: `health-b-${suffix}` },
    ]).returning({ id: workspaces.id });
    workspaceAId = inserted[0]!.id;
    workspaceBId = inserted[1]!.id;
    await db.insert(agentRuns).values([
      {
        workspaceId: workspaceAId,
        eventId: `${suffix}-a`,
        contactId: 1,
        capability: "text",
        provider: "private-provider-name",
        model: "private-model-name",
        outcome: "resolved",
        providerAttempts: 2,
        latencyMs: 18,
        inputTokens: 123,
        outputTokens: 45,
        totalTokens: 168,
      },
      {
        workspaceId: workspaceBId,
        eventId: `${suffix}-b`,
        contactId: 2,
        capability: "vision",
        provider: "another-private-provider",
        model: "another-private-model",
        outcome: "failed",
        providerAttempts: 1,
        failureCode: "private_failure_code",
        latencyMs: 21,
      },
    ]);
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(agentRuns).where(inArray(agentRuns.workspaceId, [workspaceAId, workspaceBId].filter(Boolean)));
    await db.delete(platformAdmins).where(inArray(platformAdmins.userId, [adminUserId].filter(Boolean)));
    await db.delete(users).where(inArray(users.id, [adminUserId].filter(Boolean)));
    await db.delete(workspaces).where(inArray(workspaces.id, [workspaceAId, workspaceBId].filter(Boolean)));
  });

  function createContext(): TrpcContext {
    return {
      user: {
        id: adminUserId,
        openId: `${suffix}-admin`,
        name: "Platform health test admin",
        email: null,
        phone: null,
        loginMethod: "test",
        role: "user",
        passwordHash: null,
        operationalRole: null,
        sessionVersion: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      workspace: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };
  }

  it("returns only aggregate agent health at the platform boundary", async () => {
    const caller = appRouter.createCaller(createContext());
    const health = await caller.platform.health();
    expect(health.components.agent).toMatchObject({
      runs30d: expect.any(Number),
      failures30d: expect.any(Number),
      fallbackRuns30d: expect.any(Number),
    });
    expect(health.components.agent.runs30d).toBeGreaterThanOrEqual(2);
    expect(health.components.agent.failures30d).toBeGreaterThanOrEqual(1);
    expect(health.components.agent.fallbackRuns30d).toBeGreaterThanOrEqual(1);
    expect(Object.keys(health.components.agent).sort()).toEqual([
      "failures30d",
      "fallbackRuns30d",
      "runs30d",
      "status",
    ]);
    const serialized = JSON.stringify(health);
    for (const forbidden of [
      "private-provider-name",
      "private-model-name",
      "private_failure_code",
      "contactId",
      "eventId",
      "workspaceId",
      "inputTokens",
      "outputTokens",
      "totalTokens",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("keeps platform health behind the platform administrator boundary", async () => {
    const caller = appRouter.createCaller({
      ...createContext(),
      user: { ...createContext().user!, id: adminUserId + 1, openId: `${suffix}-not-admin` },
    });
    await expect(caller.platform.health()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
