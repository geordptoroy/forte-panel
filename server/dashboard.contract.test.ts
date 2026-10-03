import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createContext(): TrpcContext {
  return {
    user: { id: 1, openId: "dashboard-test", role: "admin" } as TrpcContext["user"],
    workspace: {
      workspaceId: 1,
      workspaceName: "Test Workspace",
      workspaceSlug: "test",
      segment: "test",
      plan: "starter",
      timezone: "America/Sao_Paulo",
      memberId: 1,
      role: "owner",
      professionalId: null,
      operationalRole: null,
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("dashboard snapshot", () => {
  it("exposes operational decisions and channel health", async () => {
    const snapshot = await appRouter.createCaller(createContext()).dashboard.snapshot();
    expect(snapshot.decisions).toEqual(expect.any(Array));
    expect(snapshot.channelHealth).toEqual(expect.objectContaining({
      status: expect.any(String),
      activeChannels: expect.any(Number),
      worker: expect.any(String),
    }));
    expect(snapshot).toHaveProperty("receivedMonthCents");
  });
});
