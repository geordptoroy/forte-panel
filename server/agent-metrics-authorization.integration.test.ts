import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import {
  getDb,
  getWorkspaceMembershipContext,
} from "./db";
import {
  agentRuns,
  users,
  workspaceMembers,
  workspaces,
} from "../drizzle/schema";
import { eq, inArray } from "drizzle-orm";

const hasDatabase = Boolean(
  process.env.DATABASE_URL && /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL)
);

describe.skipIf(!hasDatabase)("agent metrics router authorization", () => {
  const suffix = `agent-metrics-auth-${Date.now()}`;
  let workspaceAId = 0;
  let workspaceBId = 0;
  const userIds: number[] = [];

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const insertedWorkspaces = await db.insert(workspaces).values([
      { name: `Metrics A ${suffix}`, slug: `metrics-a-${suffix}` },
      { name: `Metrics B ${suffix}`, slug: `metrics-b-${suffix}` },
    ]).returning({ id: workspaces.id });
    workspaceAId = insertedWorkspaces[0]!.id;
    workspaceBId = insertedWorkspaces[1]!.id;

    const roles = ["owner", "admin", "manager", "agent", "agent"] as const;
    const insertedUsers = await db.insert(users).values(
      roles.map((role, index) => ({
        openId: `${suffix}-${role}-${index}`,
        name: `${role} ${index}`,
        role: "user" as const,
        operationalRole: index === 4 ? "professional" as const : "human_attendant" as const,
      }))
    ).returning({ id: users.id });
    userIds.push(...insertedUsers.map(user => user.id));
    await db.insert(workspaceMembers).values(insertedUsers.map((user, index) => ({
      workspaceId: workspaceAId,
      userId: user.id,
      role: roles[index]!,
      operationalRole: index === 4 ? "professional" as const : "human_attendant" as const,
    })));
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(agentRuns).where(inArray(agentRuns.workspaceId, [workspaceAId, workspaceBId].filter(Boolean)));
    await db.delete(workspaceMembers).where(inArray(workspaceMembers.workspaceId, [workspaceAId, workspaceBId].filter(Boolean)));
    await db.delete(users).where(inArray(users.id, userIds));
    await db.delete(workspaces).where(inArray(workspaces.id, [workspaceAId, workspaceBId].filter(Boolean)));
  });

  function contextFor(user: Awaited<ReturnType<typeof getWorkspaceMembershipContext>>): TrpcContext {
    if (!user) throw new Error("membership context unavailable");
    return {
      user: {
        id: user.userId,
        openId: `${suffix}-caller-${user.userId}`,
        name: "Metrics caller",
        email: null,
        phone: null,
        loginMethod: "test",
        role: "user",
        passwordHash: null,
        operationalRole: user.operationalRole,
        sessionVersion: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      workspace: user,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };
  }

  async function callerFor(userId: number) {
    const membership = await getWorkspaceMembershipContext(userId);
    return appRouter.createCaller(contextFor(membership));
  }

  it("allows owner, admin and manager but blocks agent and professional", async () => {
    for (const index of [0, 1, 2]) {
      const caller = await callerFor(userIds[index]!);
      await expect(caller.agent.metrics({ windowDays: 7 })).resolves.toMatchObject({ windowDays: 7 });
      await expect(caller.agent.killSwitch()).resolves.toHaveProperty("paused");
    }
    for (const index of [3, 4]) {
      const caller = await callerFor(userIds[index]!);
      await expect(caller.agent.metrics({ windowDays: 7 })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller.agent.killSwitch()).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });

  it("uses the resolved workspace and never includes another workspace's runs", async () => {
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    await db.insert(agentRuns).values([
      { workspaceId: workspaceAId, eventId: `${suffix}-a`, contactId: 1, capability: "text", outcome: "resolved", latencyMs: 10 },
      { workspaceId: workspaceBId, eventId: `${suffix}-b`, contactId: 1, capability: "vision", outcome: "failed", failureCode: "Error", latencyMs: 20 },
    ]);
    const caller = await callerFor(userIds[2]!);
    const metrics = await caller.agent.metrics({ windowDays: 90 });
    expect(metrics.runs).toBe(1);
    expect(metrics.failed).toBe(0);
    expect(metrics.capabilities).toEqual([
      expect.objectContaining({ capability: "text", runs: 1 }),
    ]);
    expect(metrics.capabilities).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ capability: "vision" }),
    ]));
  });
});
