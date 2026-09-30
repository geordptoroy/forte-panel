import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createContext(): TrpcContext {
  return {
    user: { id: 1, openId: "test-user", role: "admin" } as TrpcContext["user"],
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

describe("billing payment procedures", () => {
  it("rejects zero-value ledger entries", async () => {
    const caller = appRouter.createCaller(createContext());
    await expect(caller.billing.registerPayment({
      quoteId: 1,
      amountCents: 0,
      method: "pix",
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects unsupported payment methods at the contract boundary", async () => {
    const caller = appRouter.createCaller(createContext());
    await expect(caller.billing.registerPayment({
      quoteId: 1,
      amountCents: 100,
      method: "crypto" as "pix",
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
