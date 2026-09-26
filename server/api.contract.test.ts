import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerApiRoutes } from "./api";
import type { Server } from "node:http";

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  registerApiRoutes(app);
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address !== "string") baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

describe("versioned API", () => {
  it("exposes an unauthenticated healthcheck", async () => {
    const response = await fetch(`${baseUrl}/api/v1/health`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "ok", version: "v1" });
  });

  it("exposes readiness separately and never reports ready without a database", async () => {
    const response = await fetch(`${baseUrl}/api/v1/ready`);
    const body = await response.json();
    expect([200, 503]).toContain(response.status);
    expect(body).toMatchObject({ service: "forte-panel-api", checks: { database: expect.any(String) } });
    if (!process.env.DATABASE_URL) expect(response.status).toBe(503);
  });

  it("does not expose private contact routes without server credentials", async () => {
    const response = await fetch(`${baseUrl}/api/v1/contacts/upsert`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "test-key-123456" },
      body: JSON.stringify({ phone: "5511999999999", name: "Teste" }),
    });
    expect([401, 503]).toContain(response.status);
  });

  it("fails closed on every REST agenda route without a valid workspace binding", async () => {
    const previousKey = process.env.FORTE_API_KEY;
    const previousWorkspaceId = process.env.FORTE_API_WORKSPACE_ID;
    process.env.FORTE_API_KEY = "test-api-key";
    delete process.env.FORTE_API_WORKSPACE_ID;
    try {
      const headers = { Authorization: "Bearer test-api-key", "Content-Type": "application/json", "Idempotency-Key": "agenda-tenant-test-1" };
      const requests: Array<[string, RequestInit]> = [
        ["/api/v1/availability", { headers }],
        ["/api/v1/appointments", { method: "POST", headers, body: JSON.stringify({ serviceId: 1, professionalId: 1, startsAt: "2030-01-10T13:00:00Z", endsAt: "2030-01-10T14:00:00Z" }) }],
        ["/api/v1/appointments/1/cancel", { method: "POST", headers }],
        ["/api/v1/appointments/1/reschedule", { method: "POST", headers, body: JSON.stringify({ startsAt: "2030-01-10T13:00:00Z", endsAt: "2030-01-10T14:00:00Z" }) }],
      ];
      for (const [path, init] of requests) {
        const response = await fetch(`${baseUrl}${path}`, init);
        expect(response.status, path).toBe(503);
        await expect(response.json(), path).resolves.toMatchObject({ error: "api_workspace_not_configured" });
      }

      process.env.FORTE_API_WORKSPACE_ID = "not-a-workspace-id";
      const invalid = await fetch(`${baseUrl}/api/v1/availability`, { headers });
      expect(invalid.status).toBe(503);
      await expect(invalid.json()).resolves.toMatchObject({ error: "api_workspace_not_configured" });
    } finally {
      if (previousKey === undefined) delete process.env.FORTE_API_KEY;
      else process.env.FORTE_API_KEY = previousKey;
      if (previousWorkspaceId === undefined) delete process.env.FORTE_API_WORKSPACE_ID;
      else process.env.FORTE_API_WORKSPACE_ID = previousWorkspaceId;
    }
  });

  it("validates the CRM lead-memory contract", async () => {
    const previousKey = process.env.FORTE_API_KEY;
    process.env.FORTE_API_KEY = "test-api-key";
    try {
      const response = await fetch(`${baseUrl}/api/v1/lead-memory`, {
        method: "POST",
        headers: { Authorization: "Bearer test-api-key", "Content-Type": "application/json" },
        body: JSON.stringify({ action: "buscar_lead", phone: "1" }),
      });
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ error: "invalid_payload" });
    } finally {
      if (previousKey === undefined) delete process.env.FORTE_API_KEY;
      else process.env.FORTE_API_KEY = previousKey;
    }
  });

  it("requires button metadata before accepting an outbound button message", async () => {
    const previousKey = process.env.FORTE_API_KEY;
    process.env.FORTE_API_KEY = "test-api-key";
    try {
      const response = await fetch(`${baseUrl}/api/v1/messages`, {
        method: "POST",
        headers: { Authorization: "Bearer test-api-key", "Content-Type": "application/json", "Idempotency-Key": "button-test-key" },
        body: JSON.stringify({ phone: "5511999999999", content: "Escolha", messageType: "button", instanceId: "instance-1" }),
      });
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ error: "invalid_payload" });
    } finally {
      if (previousKey === undefined) delete process.env.FORTE_API_KEY;
      else process.env.FORTE_API_KEY = previousKey;
    }
  });

  it("requires an idempotency key for outbound audio messages", async () => {
    const previousKey = process.env.FORTE_API_KEY;
    process.env.FORTE_API_KEY = "test-api-key";
    try {
      const response = await fetch(`${baseUrl}/api/v1/messages`, {
        method: "POST",
        headers: { Authorization: "Bearer test-api-key", "Content-Type": "application/json" },
        body: JSON.stringify({ phone: "5511999999999", content: "https://media.example.test/audio.ogg", messageType: "audio", instanceId: "instance-1", metadata: { ptt: true }, senderType: "ai" }),
      });
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ error: "idempotency_key_required" });
    } finally {
      if (previousKey === undefined) delete process.env.FORTE_API_KEY;
      else process.env.FORTE_API_KEY = previousKey;
    }
  });

  it("requires inbound webhook Idempotency-Key to match eventId", async () => {
    const previousKey = process.env.FORTE_API_KEY;
    process.env.FORTE_API_KEY = "test-api-key";
    try {
      const payload = { eventId: "instance-1:message-1", phone: "5511999999999", content: "Olá", messageType: "text" };
      const missing = await fetch(`${baseUrl}/api/v1/webhooks/inbound/whatsapp`, {
        method: "POST",
        headers: { Authorization: "Bearer test-api-key", "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      expect(missing.status).toBe(400);
      await expect(missing.json()).resolves.toMatchObject({ error: "idempotency_key_required" });

      const mismatch = await fetch(`${baseUrl}/api/v1/webhooks/inbound/whatsapp`, {
        method: "POST",
        headers: { Authorization: "Bearer test-api-key", "Content-Type": "application/json", "Idempotency-Key": "another-message-key" },
        body: JSON.stringify(payload),
      });
      expect(mismatch.status).toBe(409);
      await expect(mismatch.json()).resolves.toMatchObject({ error: "idempotency_conflict" });
    } finally {
      if (previousKey === undefined) delete process.env.FORTE_API_KEY;
      else process.env.FORTE_API_KEY = previousKey;
    }
  });

  it("rejects PAPI webhooks without a secret, signature, or API key", async () => {
    const response = await fetch(`${baseUrl}/api/v1/webhooks/providers/papi`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: "unauthenticated-event", data: {} }),
    });
    expect([401, 403, 503]).toContain(response.status);
  });
});
