import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import type { InstanceRegistry } from "./instance-registry.js";

type FakeStatus = {
  instanceId: string;
  instanceName: string;
  status: string;
  qr: string | null;
  webhookOutboxPending?: number;
  webhookOutboxDeadLetter?: number;
  webhookLastError?: string;
  settings: {
    rejectCalls: boolean;
    rejectGroups: boolean;
    logCalls: boolean;
    ignoreStatusUpdates: boolean;
  };
};

type FakeManager = {
  getStatus: () => FakeStatus;
};

type FakeRegistry = {
  list: () => FakeStatus[];
  get: (instanceId: string) => FakeManager | undefined;
  create: (instanceId: string, name: string) => Promise<FakeStatus>;
  rename: (instanceId: string, name: string) => Promise<FakeStatus>;
  updateSettings: (instanceId: string, settings: unknown) => Promise<FakeStatus>;
  remove: (instanceId: string) => Promise<{ success: boolean; instanceId: string }>;
  qr: (instanceId: string) => Promise<string | null>;
  connect: (instanceId: string) => Promise<FakeStatus>;
  requestPairingCode: (instanceId: string, phone: string) => Promise<{ instanceId: string; code: string }>;
  disconnect: (instanceId: string, logout?: boolean) => Promise<FakeStatus>;
  sendMessage: (
    instanceId: string,
    phone: string,
    messageType: string,
    content: string,
    metadata?: Record<string, unknown>
  ) => Promise<string>;
  sendPayload: (instanceId: string, phone: string, payload: never) => Promise<string>;
};

type CreateServer = (registry: InstanceRegistry) => Server;
let createServer: CreateServer;
let server: Server;
let baseUrl = "";
let reconnectCalls = 0;
let pairingPhone = "";
let deletedInstance = "";
let sentMessageInstance = "";
const statusById = new Map<string, FakeStatus>();
const qrById = new Map<string, string>();
const managerById = new Map<string, FakeManager>();

function saveStatus(instanceId: string, instanceName = `WhatsApp · ${instanceId}`) {
  const status: FakeStatus = {
    instanceId,
    instanceName,
    status: "disconnected",
    qr: qrById.get(instanceId) ?? null,
    settings: {
      rejectCalls: false,
      rejectGroups: true,
      logCalls: true,
      ignoreStatusUpdates: true,
    },
    webhookOutboxPending: 2,
    webhookOutboxDeadLetter: 5,
    webhookLastError: "webhook_http_400",
  };
  statusById.set(instanceId, status);
  managerById.set(instanceId, { getStatus: () => statusById.get(instanceId)! });
  return status;
}

beforeAll(async () => {
  process.env.WHATSAPP_API_KEY = "gateway-test-key";
  process.env.WHATSAPP_INSTANCE_ID = "test-instance";
  saveStatus("test-instance", "Instância de teste");
  qrById.set("test-instance", "test-qr");
  ({ createServer } = await import("./server.js"));

  const registry: FakeRegistry = {
    list: () => Array.from(statusById.values()),
    get: instanceId => managerById.get(instanceId),
    create: async (instanceId, name) => saveStatus(instanceId, name),
    rename: async (instanceId, name) => saveStatus(instanceId, name),
    updateSettings: async (instanceId, settings) => {
      const status = statusById.get(instanceId)!;
      status.settings = settings as FakeStatus["settings"];
      return status;
    },
    remove: async instanceId => {
      deletedInstance = instanceId;
      statusById.delete(instanceId);
      managerById.delete(instanceId);
      return { success: true, instanceId };
    },
    qr: async instanceId => qrById.get(instanceId) ?? null,
    connect: async instanceId => {
      reconnectCalls += 1;
      return statusById.get(instanceId)!;
    },
    requestPairingCode: async (instanceId, phone) => {
      pairingPhone = phone;
      return { instanceId, code: "AB12-CD34" };
    },
    disconnect: async instanceId => statusById.get(instanceId)!,
    sendMessage: async (instanceId, phone, messageType, content, metadata) => {
      sentMessageInstance = instanceId;
      return `fake-${messageType}-${phone}-${content}-${metadata?.mediaMimeType ?? "none"}`;
    },
    sendPayload: async (instanceId, phone, _payload) => {
      sentMessageInstance = instanceId;
      return `fake-payload-${phone}`;
    },
  };

  server = createServer(registry as unknown as InstanceRegistry);
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

const auth = { Authorization: "Bearer gateway-test-key" };

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
    await expect(ready.json()).resolves.toMatchObject({
      status: "ready",
      instance: {
        webhookOutboxPending: 2,
        webhookOutboxDeadLetter: 5,
        webhookLastError: "webhook_http_400",
      },
    });
  });

  it("protects operational routes with the gateway API key", async () => {
    const response = await fetch(`${baseUrl}/api/instances`);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "unauthorized",
    });
  });

  it("protects and validates per-instance policy updates", async () => {
    const settings = {
      rejectCalls: true,
      rejectGroups: false,
      logCalls: true,
      ignoreStatusUpdates: false,
    };
    const url = `${baseUrl}/api/instances/test-instance/settings`;
    const unauthorized = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings }),
    });
    expect(unauthorized.status).toBe(401);

    const updated = await fetch(url, {
      method: "PATCH",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ settings }),
    });
    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toMatchObject({ settings });

    const invalid = await fetch(url, {
      method: "PATCH",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ settings: { ...settings, rejectCalls: "yes" } }),
    });
    expect(invalid.status).toBe(400);
  });

  it("creates, lists, renames, and deletes an instance by stable ID", async () => {
    const created = await fetch(`${baseUrl}/api/instances`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ instanceId: "ws5-instance-1", name: "Vendas" }),
    });
    expect(created.status).toBe(201);
    await expect(created.json()).resolves.toMatchObject({
      instanceId: "ws5-instance-1",
      instanceName: "Vendas",
    });
    const list = await fetch(`${baseUrl}/api/instances`, { headers: auth });
    expect(list.status).toBe(200);
    await expect(list.json()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          instanceId: "ws5-instance-1",
          instanceName: "Vendas",
        }),
      ])
    );

    const renamed = await fetch(`${baseUrl}/api/instances/ws5-instance-1`, {
      method: "PATCH",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Atendimento" }),
    });
    expect(renamed.status).toBe(200);
    await expect(renamed.json()).resolves.toMatchObject({
      instanceId: "ws5-instance-1",
      instanceName: "Atendimento",
    });

    const deleted = await fetch(`${baseUrl}/api/instances/ws5-instance-1`, {
      method: "DELETE",
      headers: auth,
    });
    expect(deleted.status).toBe(200);
    expect(deletedInstance).toBe("ws5-instance-1");
  });

  it("uses reconnect for an explicit QR retry", async () => {
    const before = reconnectCalls;
    const response = await fetch(
      `${baseUrl}/api/instances/test-instance/connect`,
      { method: "POST", headers: auth }
    );
    expect(response.status).toBe(202);
    expect(reconnectCalls).toBe(before + 1);
  });

  it("returns a protected pairing code for a phone number", async () => {
    const response = await fetch(
      `${baseUrl}/api/instances/test-instance/pairing-code`,
      {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ phone: "5511999999999" }),
      }
    );
    expect(response.status).toBe(200);
    expect(pairingPhone).toBe("5511999999999");
    await expect(response.json()).resolves.toMatchObject({ code: "AB12-CD34" });
  });

  it("returns a protected QR image for a selected instance", async () => {
    const response = await fetch(
      `${baseUrl}/api/instances/test-instance/qr`,
      { headers: auth }
    );
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.instanceId).toBe("test-instance");
    expect(result.imageDataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it.each([
    { messageType: "text", content: "Olá", metadata: {} },
    {
      messageType: "image",
      content: "https://media.example.test/image.png?signature=opaque",
      metadata: { mediaMimeType: "image/png", mediaStorageKey: "workspaces/1/outbound/image.png" },
    },
    {
      messageType: "audio",
      content: "https://media.example.test/audio.ogg?signature=opaque",
      metadata: { mediaMimeType: "audio/ogg" },
    },
    {
      messageType: "video",
      content: "https://media.example.test/video.mp4?signature=opaque",
      metadata: { mediaMimeType: "video/mp4" },
    },
    {
      messageType: "document",
      content: "https://media.example.test/document.pdf?signature=opaque",
      metadata: { mediaMimeType: "application/pdf" },
    },
    {
      messageType: "list",
      content: "Escolha um serviço",
      metadata: {
        buttonText: "Ver serviços",
        sections: [{ title: "Serviços", rows: [{ rowId: "1", title: "Corte" }] }],
      },
    },
    {
      messageType: "poll",
      content: "Qual horário prefere?",
      metadata: {
        payload: {
          poll: { name: "Qual horário prefere?", values: ["Manhã", "Tarde"] },
        },
      },
    },
  ])(
    "accepts $messageType sends through the selected instance",
    async ({ messageType, content, metadata }) => {
      const response = await fetch(
        `${baseUrl}/api/instances/test-instance/send`,
        {
          method: "POST",
          headers: {
            ...auth,
            "Content-Type": "application/json",
            "Idempotency-Key": `server-send-${messageType}`,
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
      expect(sentMessageInstance).toBe("test-instance");
      await expect(response.json()).resolves.toMatchObject({
        success: true,
        status: "sent",
        messageType,
      });
    }
  );

  it("rejects malformed sends before calling the manager", async () => {
    const response = await fetch(`${baseUrl}/api/instances/test-instance/send`, {
      method: "POST",
      headers: {
        ...auth,
        "Content-Type": "application/json",
        "Idempotency-Key": "server-malformed-1",
      },
      body: JSON.stringify({ messageType: "audio" }),
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "phone_required",
    });
  });

  it("accepts a validated embedded media data URL", async () => {
    sentMessageInstance = "";
    const response = await fetch(`${baseUrl}/api/instances/test-instance/send`, {
      method: "POST",
      headers: {
        ...auth,
        "Content-Type": "application/json",
        "Idempotency-Key": "server-media-1",
      },
      body: JSON.stringify({
        phone: "5511999999999@s.whatsapp.net",
        messageType: "image",
        content: "data:image/png;base64,AA==",
        metadata: { mediaMimeType: "image/png" },
      }),
    });
    expect(response.status).toBe(200);
    expect(sentMessageInstance).toBe("test-instance");
  });
});
