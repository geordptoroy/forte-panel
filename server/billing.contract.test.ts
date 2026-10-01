import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createContext(): TrpcContext {
  return {
    user: { id: 1, openId: "billing-test", role: "admin" } as TrpcContext["user"],
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

describe("billing procedures", () => {
  it("requires a positive item quantity", async () => {
    const caller = appRouter.createCaller(createContext());
    await expect(
      caller.billing.createQuote({
        contactId: 1,
        serviceName: "Instalação",
        items: [{ description: "Mão de obra", quantity: 0, unitCents: 1000 }],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("keeps approval as a dedicated mutation", async () => {
    const caller = appRouter.createCaller(createContext());
    await expect(caller.billing.approve({ id: 0 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller.billing.updatePayment({ id: 1, receivedCents: 0, status: "aprovado" as never })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
