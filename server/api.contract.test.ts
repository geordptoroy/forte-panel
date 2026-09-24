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
});
