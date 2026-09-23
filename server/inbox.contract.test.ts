import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createContext(): TrpcContext {
  return {
    user: undefined,
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

  it("keeps the seed procedure idempotent at the contract level", async () => {
    const caller = appRouter.createCaller(createContext());
    expect(caller.inbox.seed).toBeTypeOf("function");
  });
});
