import crypto from "node:crypto";
import type { DomainEventCommand, IntegrationHealth, N8nAdapter, WorkflowCommand } from "./contracts";

function health(ok: boolean, detail: string, latencyMs?: number): IntegrationHealth {
  return { name: "n8n", ok, detail, latencyMs, checkedAt: new Date() };
}

function getWebhookUrl() {
  const value = process.env.N8N_EVENTS_WEBHOOK_URL?.trim();
  return value ? value : undefined;
}

function getTimeoutMs() {
  const parsed = Number(process.env.N8N_WEBHOOK_TIMEOUT_MS ?? 10000);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10000;
}

function serializeEvent(command: DomainEventCommand) {
  return JSON.stringify({
    eventId: command.eventId,
    event: command.event,
    workspaceId: command.workspaceId,
    aggregateType: command.aggregateType,
    aggregateId: command.aggregateId,
    payload: command.payload,
    occurredAt: command.occurredAt.toISOString(),
  });
}

function signatureFor(body: string) {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  return secret ? `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}` : undefined;
}

async function post(url: string, body: string, headers: Record<string, string>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), getTimeoutMs());
  try {
    const response = await fetch(url, { method: "POST", headers, body, signal: controller.signal });
    if (!response.ok) throw new Error(`n8n respondeu ${response.status}`);
    let data: { executionId?: string } = {};
    try {
      data = await response.json() as { executionId?: string };
    } catch {
      // Alguns webhooks respondem 204 ou texto vazio; o status HTTP já confirma o aceite.
    }
    return { accepted: true, executionId: data.executionId };
  } finally {
    clearTimeout(timer);
  }
}

export function createN8nAdapter(): N8nAdapter {
  return {
    async health() {
      const url = process.env.N8N_BASE_URL?.replace(/\/$/, "");
      if (!url) return health(false, "N8N_BASE_URL não configurada");
      const started = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), getTimeoutMs());
      try {
        const response = await fetch(`${url}/healthz`, { signal: controller.signal });
        return health(response.ok, response.ok ? "n8n disponível" : `n8n respondeu ${response.status}`, Date.now() - started);
      } catch (error) {
        return health(false, error instanceof Error ? error.message : "Falha de conexão", Date.now() - started);
      } finally {
        clearTimeout(timer);
      }
    },
    async dispatch(command: WorkflowCommand) {
      const url = getWebhookUrl();
      if (!url) throw new Error("N8N_EVENTS_WEBHOOK_URL não configurada");
      const body = JSON.stringify(command);
      const signature = signatureFor(body);
      return post(url, body, {
        "Content-Type": "application/json",
        "Idempotency-Key": command.idempotencyKey,
        ...(signature ? { "X-Forte-Signature": signature } : {}),
      });
    },
    async dispatchEvent(command: DomainEventCommand) {
      const url = getWebhookUrl();
      if (!url) throw new Error("N8N_EVENTS_WEBHOOK_URL não configurada");
      const body = serializeEvent(command);
      const signature = signatureFor(body);
      return post(url, body, {
        "Content-Type": "application/json",
        "Idempotency-Key": command.eventId,
        "X-Forte-Event-Id": command.eventId,
        ...(signature ? { "X-Forte-Signature": signature } : {}),
      });
    },
  };
}

export function createN8nEventAdapter() {
  return createN8nAdapter();
}
