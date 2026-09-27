import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import type { InstanceManager } from "./instance-manager.js";

type FakeManager = {
  getStatus: () => Record<string, unknown>;
  start: () => Promise<void>;
  stop: (logout?: boolean) => Promise<void>;
  sendMessage: (
    phone: string,
    messageType: string,
    content: string,
    metadata?: Record<string, unknown>
  ) => Promise<string>;
  sendPayload: (phone: string, payload: never) => Promise<string>;
};

type CreateServer = (manager: InstanceManager) => Server;
let createServer: CreateServer;
let server: Server;
let baseUrl = "";

beforeAll(async () => {
  process.env.WHATSAPP_API_KEY = "gateway-test-key";
  process.env.WHATSAPP_INSTANCE_ID = "test-instance";
  ({ createServer } = await import("./server.js"));

  const manager = {
    getStatus: () => ({
      instanceId: "test-instance",
      status: "disconnected",
      qr: null,
    }),
    start: async () => undefined,
    stop: async () => undefined,
    sendMessage: async (
      phone: string,
      messageType: string,
      content: string,
      metadata?: Record<string, unknown>
    ) =>
      `fake-${messageType}-${phone}-${content}-${metadata?.mediaMimeType ?? "none"}`,
    sendPayload: async (phone: string, _payload: never) =>
      `fake-payload-${phone}`,
  } as unknown as InstanceManager;
  server = createServer(manager);
  await new Promise<void>(resolve => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address !== "string")
        baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close(error => (error ? reject(error) : resolve()))
  );
});

describe("Baileys gateway HTTP contract", () => {
  it("exposes unauthenticated health and readiness", async () => {
    const health = await fetch(`${baseUrl}/health`);
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toMatchObject({
      status: "ok",
      service: "forte-whatsapp",
    });

    const ready = await fetch(`${baseUrl}/ready`);
    expect(ready.status).toBe(200);
    await expect(ready.json()).resolves.toMatchObject({ status: "ready" });
  });

  it("protects operational routes with the gateway API key", async () => {
    const response = await fetch(`${baseUrl}/api/instances`);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "unauthorized",
    });
  });

  it.each([
    { messageType: "text", content: "Olá", metadata: {} },
    {
      messageType: "image",
      content: "data:image/png;base64,AA==",
      metadata: { mediaMimeType: "image/png" },
    },
    {
      messageType: "audio",
      content: "data:audio/ogg;base64,AA==",
      metadata: { mediaMimeType: "audio/ogg" },
    },
    {
      messageType: "video",
      content: "data:video/mp4;base64,AA==",
      metadata: { mediaMimeType: "video/mp4" },
    },
    {
      messageType: "document",
      content: "data:application/pdf;base64,AA==",
      metadata: { mediaMimeType: "application/pdf" },
    },
  ])(
    "accepts $messageType sends through the manager",
    async ({ messageType, content, metadata }) => {
      const response = await fetch(
        `${baseUrl}/api/instances/test-instance/send`,
        {
          method: "POST",
          headers: {
            Authorization: "Bearer gateway-test-key",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            phone: "5511999999999@s.whatsapp.net",
            messageType,
            content,
            metadata,
          }),
        }
      );
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        success: true,
        status: "sent",
        messageType,
      });
    }
  );

  it("rejects malformed sends before calling the manager", async () => {
    const response = await fetch(
      `${baseUrl}/api/instances/test-instance/send`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer gateway-test-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messageType: "audio" }),
      }
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "phone_required",
    });
  });
});
