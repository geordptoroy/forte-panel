import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createContext(input: {
  id: number;
  role: "user" | "admin";
  workspaceRole: "owner" | "agent";
}): TrpcContext {
  return {
    user: {
      id: input.id,
      openId: `workspace-user-${input.id}`,
      name: input.workspaceRole === "owner" ? "Owner da empresa" : "Agente da empresa",
      email: `${input.id}@workspace.test`,
      phone: null,
      loginMethod: "test",
      role: input.role,
      passwordHash: null,
      operationalRole: null,
      sessionVersion: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    workspace: {
      workspaceId: 9001,
      workspaceName: "Workspace de teste",
      workspaceSlug: "workspace-teste",
      segment: "serviços",
      plan: "starter",
      timezone: "America/Sao_Paulo",
      memberId: input.id,
      role: input.workspaceRole,
      professionalId: null,
      operationalRole: null,
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("platform admin authorization boundary", () => {
  it.each([
    { label: "owner", id: 2_147_480_001, role: "user" as const, workspaceRole: "owner" as const },
    { label: "member", id: 2_147_480_002, role: "user" as const, workspaceRole: "agent" as const },
    { label: "global admin sem registro de plataforma", id: 2_147_480_003, role: "admin" as const, workspaceRole: "owner" as const },
  ])("nega acesso ao console para $label", async input => {
    const caller = appRouter.createCaller(createContext(input));

    await expect(caller.platform.access()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
