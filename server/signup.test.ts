import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { slugifyWorkspaceName } from "./db";
import type { TrpcContext } from "./_core/context";

function createPublicContext(): TrpcContext {
  return {
    user: null,
    workspace: null,
    req: {
      protocol: "https",
      headers: {},
      ip: "203.0.113.20",
      get: () => undefined,
    } as TrpcContext["req"],
    res: {
      cookie: () => undefined,
    } as TrpcContext["res"],
  };
}

describe("public signup", () => {
  it("normalizes workspace names without leaking accents or unsafe characters", () => {
    expect(slugifyWorkspaceName("Clínica da Ana & Filhos")).toBe(
      "clinica-da-ana-filhos"
    );
    expect(slugifyWorkspaceName("!!!")).toBe("workspace");
  });

  it("requires explicit acceptance of both legal documents", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await expect(
      caller.auth.signup({
        name: "Ana Silva",
        email: "ana@example.com",
        password: "senha-segura",
        workspaceName: "Clínica da Ana",
        acceptTerms: false as unknown as true,
        acceptPrivacy: true,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
