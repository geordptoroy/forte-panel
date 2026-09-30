import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function context(): TrpcContext {
  return {
    user: { id: 7, openId: "manager-confirmation-test", role: "user" } as TrpcContext["user"],
    workspace: {
      workspaceId: 1,
      workspaceName: "Test Workspace",
      workspaceSlug: "test",
      segment: "test",
      plan: "starter",
      timezone: "America/Sao_Paulo",
      memberId: 7,
      role: "manager",
      professionalId: null,
      operationalRole: null,
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("agent confirmation gate", () => {
  it("lists no pending proposals when the database is unavailable", async () => {
    const result = await appRouter.createCaller(context()).agent.pendingConfirmations();
    expect(result).toEqual([]);
  });

  it("defaults the tenant kill switch to running", async () => {
    await expect(appRouter.createCaller(context()).agent.killSwitch()).resolves.toMatchObject({
      paused: false,
      reason: null,
    });
  });

  it("returns an explicit non-attributed revenue basis", async () => {
    const result = await appRouter.createCaller(context()).agent.metrics({ windowDays: 30 });
    expect(result.revenueAttribution).toBe("workspace_total_not_attributed");
    expect(result).toMatchObject({ runs: 0, receivedRevenueCents: 0 });
  });
});
