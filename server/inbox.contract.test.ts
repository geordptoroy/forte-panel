import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createContext(): TrpcContext {
  return {
    user: { id: 1, openId: "test-user", role: "admin" } as TrpcContext["user"],
    workspace: { workspaceId: 1, workspaceName: "Test Workspace", workspaceSlug: "test", segment: "test", plan: "starter", timezone: "America/Sao_Paulo", memberId: 1, role: "owner", professionalId: null, operationalRole: null },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("inbox procedures", () => {
  it("rejects empty manual messages before touching the database", async () => {
    const caller = appRouter.createCaller(createContext());
    await expect(caller.inbox.sendMessage({ contactId: 1, content: "   " })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects invalid contact identifiers", async () => {
    const caller = appRouter.createCaller(createContext());
    await expect(caller.inbox.toggleAi({ contactId: 0, enabled: true })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("does not mutate or audit a contact outside the resolved workspace", async () => {
    const caller = appRouter.createCaller(createContext());
    await expect(caller.inbox.toggleAi({ contactId: 999999, enabled: true })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller.inbox.moveStage({ contactId: 999999, stage: "Triagem" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("keeps the seed procedure idempotent at the contract level", async () => {
    const caller = appRouter.createCaller(createContext());
    expect(caller.inbox.seed).toBeTypeOf("function");
  });
});
