import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createContext(): TrpcContext {
  return {
    user: { id: 1, openId: "test-user", role: "admin" } as TrpcContext["user"],
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("agenda procedures", () => {
  it("returns the native agenda shape even without a database connection", async () => {
    const caller = appRouter.createCaller(createContext());
    const result = await caller.agenda.snapshot();
    expect(result).toMatchObject({
      timezone: "America/Sao_Paulo",
      services: expect.any(Array),
      professionals: expect.any(Array),
      appointments: expect.any(Array),
    });
  });

  it("rejects invalid service and professional identifiers", async () => {
    const caller = appRouter.createCaller(createContext());
    await expect(caller.agenda.create({
      serviceId: 0,
      professionalId: 0,
      startsAt: "2026-09-26T17:30:00-03:00",
      endsAt: "2026-09-26T18:30:00-03:00",
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
