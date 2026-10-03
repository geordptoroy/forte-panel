import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";

const dbMocks = vi.hoisted(() => ({
  checkDatabaseHealth: vi.fn(),
  getActiveWorkspaceById: vi.fn(),
  consumeWorkspaceUsage: vi.fn(),
  claimApiIdempotency: vi.fn(),
  leadMemoryOperation: vi.fn(),
  failApiIdempotency: vi.fn(),
  upsertApiContact: vi.fn(),
  createAgendaAppointment: vi.fn(),
  findBaileysInstanceOwner: vi.fn(),
  getContactById: vi.fn(),
  moveContactStage: vi.fn(),
  cancelAgendaAppointment: vi.fn(),
}));
const agendaMocks = vi.hoisted(() => ({ professionalCanExecuteService: vi.fn() }));

vi.mock("./agenda", async importOriginal => {
  const actual = await importOriginal<typeof import("./agenda")>();
  return { ...actual, ...agendaMocks };
});

vi.mock("./db", async importOriginal => {
  const actual = await importOriginal<typeof import("./db")>();
  return { ...actual, ...dbMocks };
});

import { registerApiRoutes } from "./api";

let server: Server;
let baseUrl = "";
const previousEnvironment = {
  publicApi: process.env.FORTE_PUBLIC_API_ENABLED,
  apiKey: process.env.FORTE_API_KEY,
  workspaceId: process.env.FORTE_API_WORKSPACE_ID,
};

beforeAll(async () => {
  process.env.FORTE_PUBLIC_API_ENABLED = "true";
  process.env.FORTE_API_KEY = "express4-test-api-key";
  process.env.FORTE_API_WORKSPACE_ID = "1";
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  registerApiRoutes(app);
  await new Promise<void>(resolve => {
    server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address !== "string")
        baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.getActiveWorkspaceById.mockResolvedValue({ id: 1, active: true });
  dbMocks.consumeWorkspaceUsage.mockResolvedValue({
    allowed: true,
    limit: 100,
    remaining: 99,
    retryAfterMs: 0,
  });
  dbMocks.claimApiIdempotency.mockResolvedValue({
    claimed: true,
    claimToken: "claim-token-test",
  });
  dbMocks.failApiIdempotency.mockResolvedValue(true);
  dbMocks.findBaileysInstanceOwner.mockResolvedValue({ workspaceId: 1, active: true });
  dbMocks.getContactById.mockResolvedValue({ id: 7, externalPhone: "5511999999999" });
  agendaMocks.professionalCanExecuteService.mockResolvedValue(true);
});

afterAll(async () => {
  if (server)
    await new Promise<void>((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve()))
    );
  if (previousEnvironment.publicApi === undefined)
    delete process.env.FORTE_PUBLIC_API_ENABLED;
  else process.env.FORTE_PUBLIC_API_ENABLED = previousEnvironment.publicApi;
  if (previousEnvironment.apiKey === undefined) delete process.env.FORTE_API_KEY;
  else process.env.FORTE_API_KEY = previousEnvironment.apiKey;
  if (previousEnvironment.workspaceId === undefined)
    delete process.env.FORTE_API_WORKSPACE_ID;
  else process.env.FORTE_API_WORKSPACE_ID = previousEnvironment.workspaceId;
});

describe("Express 4 async REST error handling", () => {
  it("converts a rejected async dependency into a safe JSON 500 response", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    dbMocks.checkDatabaseHealth.mockRejectedValueOnce(
      new Error("sensitive database diagnostic")
    );
    try {
      const response = await fetch(`${baseUrl}/api/v1/ready`);
      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: "internal_error",
        message: "Erro interno do servidor",
      });
      expect(consoleError).toHaveBeenCalledWith(
        "[REST API] Unhandled route error",
        expect.objectContaining({ error: "sensitive database diagnostic" })
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it("marks an idempotency claim failed before returning JSON 500 for a rejected handler", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    dbMocks.leadMemoryOperation.mockRejectedValueOnce(
      new Error("sensitive business-layer detail")
    );
    try {
      const response = await fetch(`${baseUrl}/api/v1/lead-memory`, {
        method: "POST",
        headers: {
          Authorization: "Bearer express4-test-api-key",
          "Content-Type": "application/json",
          "Idempotency-Key": "lead-memory-error-001",
        },
        body: JSON.stringify({
          action: "criar_lead",
          phone: "5511999999999",
        }),
      });
      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: "internal_error",
        message: "Erro interno do servidor",
      });
      expect(dbMocks.claimApiIdempotency).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 1,
          key: "lead-memory-error-001",
        })
      );
      expect(dbMocks.failApiIdempotency).toHaveBeenCalledWith(
        1,
        "lead-memory-error-001",
        "claim-token-test"
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it.each([
    {
      name: "contacts/upsert",
      path: "/api/v1/contacts/upsert",
      body: { phone: "5511999999999" },
      prepare: () => dbMocks.upsertApiContact.mockRejectedValueOnce(new Error("db failure")),
    },
    {
      name: "appointments",
      path: "/api/v1/appointments",
      body: {
        serviceId: 1,
        professionalId: 1,
        startsAt: "2030-01-10T13:00:00Z",
        endsAt: "2030-01-10T14:00:00Z",
      },
      prepare: () => dbMocks.createAgendaAppointment.mockRejectedValueOnce(new Error("db failure")),
    },
    {
      name: "messages",
      path: "/api/v1/messages",
      body: { phone: "5511999999999", content: "test", instanceId: "instance-test" },
      prepare: () => dbMocks.upsertApiContact.mockRejectedValueOnce(new Error("db failure")),
    },
    {
      name: "messages/batch",
      path: "/api/v1/messages/batch",
      body: {
        messages: [{ phone: "5511999999999", content: "test", instanceId: "instance-test" }],
      },
      prepare: () => dbMocks.upsertApiContact.mockRejectedValueOnce(new Error("db failure")),
    },
    {
      name: "contacts/:id/stage",
      path: "/api/v1/contacts/7/stage",
      method: "PATCH",
      body: { stage: "Novo contato" },
      prepare: () => dbMocks.moveContactStage.mockRejectedValueOnce(new Error("db failure")),
    },
    {
      name: "appointments/:id/cancel",
      path: "/api/v1/appointments/9/cancel",
      body: {},
      prepare: () => dbMocks.cancelAgendaAppointment.mockRejectedValueOnce(new Error("db failure")),
    },
  ])("returns a handled 500 and fails the idempotency claim for $name", async scenario => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    scenario.prepare();
    const key = `route-error-${scenario.name.replace(/[^a-z]+/gi, "-")}`;
    try {
      const response = await fetch(`${baseUrl}${scenario.path}`, {
        method: scenario.method ?? "POST",
        headers: {
          Authorization: "Bearer express4-test-api-key",
          "Content-Type": "application/json",
          "Idempotency-Key": key,
        },
        body: JSON.stringify(scenario.body),
      });
      expect(response.status, scenario.name).toBe(500);
      await expect(response.json(), scenario.name).resolves.toMatchObject({
        error: "internal_error",
      });
      expect(dbMocks.failApiIdempotency).toHaveBeenCalledWith(
        1,
        key,
        "claim-token-test"
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it("rejects an authenticated Baileys webhook when the workspace quota is exhausted", async () => {
    dbMocks.consumeWorkspaceUsage.mockResolvedValueOnce({
      allowed: false,
      limit: 1,
      remaining: 0,
      retryAfterMs: 30_000,
    });
    const response = await fetch(`${baseUrl}/api/v1/webhooks/providers/baileys`, {
      method: "POST",
      headers: {
        Authorization: "Bearer express4-test-api-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        eventId: "rate-limited-baileys-event",
        phone: "5511999999999",
        content: "Olá",
        messageType: "text",
      }),
    });
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      error: "workspace_rate_limited",
    });
    expect(dbMocks.claimApiIdempotency).not.toHaveBeenCalled();
  });
});
