import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createN8nAdapter } from "./n8n";

const originalEnv = {
  webhookUrl: process.env.N8N_EVENTS_WEBHOOK_URL,
  secret: process.env.N8N_WEBHOOK_SECRET,
  timeout: process.env.N8N_WEBHOOK_TIMEOUT_MS,
};

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalEnv.webhookUrl === undefined) delete process.env.N8N_EVENTS_WEBHOOK_URL;
  else process.env.N8N_EVENTS_WEBHOOK_URL = originalEnv.webhookUrl;
  if (originalEnv.secret === undefined) delete process.env.N8N_WEBHOOK_SECRET;
  else process.env.N8N_WEBHOOK_SECRET = originalEnv.secret;
  if (originalEnv.timeout === undefined) delete process.env.N8N_WEBHOOK_TIMEOUT_MS;
  else process.env.N8N_WEBHOOK_TIMEOUT_MS = originalEnv.timeout;
});

describe("n8n adapter", () => {
  it("envia evento com idempotência e assinatura HMAC do corpo bruto", async () => {
    process.env.N8N_EVENTS_WEBHOOK_URL = "https://n8n.example.test/webhook/events";
    process.env.N8N_WEBHOOK_SECRET = "evento-secreto";
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = String(init?.body ?? "");
      const expectedSignature = `sha256=${crypto.createHmac("sha256", "evento-secreto").update(body).digest("hex")}`;
      expect(init?.headers).toMatchObject({
        "Content-Type": "application/json",
        "Idempotency-Key": "message.sent:42",
        "X-Forte-Event-Id": "message.sent:42",
        "X-Forte-Signature": expectedSignature,
      });
      expect(JSON.parse(body)).toMatchObject({
        eventId: "message.sent:42",
        event: "message.sent",
        workspaceId: 7,
        aggregateType: "message",
        aggregateId: 42,
        payload: { contactId: 9 },
      });
      return new Response(JSON.stringify({ executionId: "exec-42" }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await createN8nAdapter().dispatchEvent({
      eventId: "message.sent:42",
      event: "message.sent",
      workspaceId: 7,
      aggregateType: "message",
      aggregateId: 42,
      payload: { contactId: 9 },
      occurredAt: new Date("2026-09-24T12:00:00.000Z"),
    });

    expect(result).toEqual({ accepted: true, executionId: "exec-42" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("aceita resposta 2xx sem corpo", async () => {
    process.env.N8N_EVENTS_WEBHOOK_URL = "https://n8n.example.test/webhook/events";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));

    await expect(createN8nAdapter().dispatchEvent({
      eventId: "appointment.created:10",
      event: "appointment.created",
      workspaceId: 7,
      aggregateType: "appointment",
      aggregateId: 10,
      payload: {},
      occurredAt: new Date(),
    })).resolves.toEqual({ accepted: true, executionId: undefined });
  });

  it("falha explicitamente quando o webhook não está configurado", async () => {
    delete process.env.N8N_EVENTS_WEBHOOK_URL;
    await expect(createN8nAdapter().dispatchEvent({
      eventId: "contact.created:3",
      event: "contact.created",
      workspaceId: 7,
      aggregateType: "contact",
      aggregateId: 3,
      payload: {},
      occurredAt: new Date(),
    })).rejects.toThrow("N8N_EVENTS_WEBHOOK_URL não configurada");
  });
});
