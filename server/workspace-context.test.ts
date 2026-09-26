import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { selectSingleWorkspaceMembership } from "./db";

function createContext(): TrpcContext {
  return {
    user: {
      id: 2_147_483_647,
      openId: "unassigned-test-user",
      name: "Unassigned",
      email: null,
      phone: null,
      loginMethod: "test",
      role: "admin",
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

describe("tenant context resolution", () => {
  it("accepts exactly one active membership", () => {
    const membership = { workspaceId: 42 };
    expect(selectSingleWorkspaceMembership([membership])).toBe(membership);
  });

  it("fails closed for no membership or ambiguous multiple memberships", () => {
    expect(selectSingleWorkspaceMembership([])).toBeNull();
    expect(selectSingleWorkspaceMembership([{ workspaceId: 42 }, { workspaceId: 43 }])).toBeNull();
  });

  it("denies protected procedures to an unassigned user even if their global role is admin", async () => {
    const caller = appRouter.createCaller(createContext());
    await expect(caller.auth.access()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
