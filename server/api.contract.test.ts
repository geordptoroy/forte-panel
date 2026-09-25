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

  it("does not expose private contact routes without server credentials", async () => {
    const response = await fetch(`${baseUrl}/api/v1/contacts/upsert`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "test-key-123456" },
      body: JSON.stringify({ phone: "5511999999999", name: "Teste" }),
    });
    expect([401, 503]).toContain(response.status);
  });

  it("validates the n8n lead memory contract", async () => {
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
