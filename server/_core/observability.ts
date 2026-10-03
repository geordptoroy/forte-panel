import { ENV } from "./env";

export type OperationalSeverity = "info" | "warning" | "critical";

export type OperationalEvent = {
  event: string;
  severity: OperationalSeverity;
  service: string;
  observedAt?: string;
  data?: Record<string, string | number | boolean | null>;
};

const DELIVERY_TIMEOUT_MS = 2_000;
const MAX_EVENT_NAME_LENGTH = 80;
const MAX_SERVICE_NAME_LENGTH = 80;
const MAX_DATA_KEYS = 24;
let lastTransportFailureAt = 0;

function configuredEndpoint() {
  const raw = ENV.observabilityWebhookUrl.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (
      url.protocol !== "https:" &&
      !(url.protocol === "http:" && !ENV.isProduction)
    )
      return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function getObservabilityTransportConfig() {
  const endpoint = configuredEndpoint();
  const token = ENV.observabilityWebhookToken.trim();
  return {
    enabled: Boolean(endpoint),
    endpoint,
    authenticated: Boolean(token),
    ready: Boolean(endpoint && token),
  } as const;
}

function safeText(value: string, maxLength: number) {
  return value.trim().slice(0, maxLength);
}

function safeData(data: OperationalEvent["data"]) {
  if (!data) return undefined;
  return Object.fromEntries(
    Object.entries(data)
      .filter(
        ([key, value]) =>
          /^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/.test(key) &&
          (value === null ||
            typeof value === "string" ||
            typeof value === "number" ||
            typeof value === "boolean")
      )
      .slice(0, MAX_DATA_KEYS)
      .map(([key, value]) => [
        key,
        typeof value === "string" ? value.slice(0, 240) : value,
      ])
  );
}

export function redactOperationalEvent(event: OperationalEvent) {
  return {
    event: safeText(event.event, MAX_EVENT_NAME_LENGTH),
    severity: event.severity,
    service: safeText(event.service, MAX_SERVICE_NAME_LENGTH),
    observedAt: event.observedAt ?? new Date().toISOString(),
    data: safeData(event.data) ?? null,
  } as const;
}

export async function emitOperationalEvent(
  event: OperationalEvent
): Promise<boolean> {
  const config = getObservabilityTransportConfig();
  if (!config.ready || !config.endpoint) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
  try {
    const response = await fetch(config.endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${ENV.observabilityWebhookToken}`,
      },
      body: JSON.stringify(redactOperationalEvent(event)),
    });
    if (!response.ok)
      throw new Error(`observability transport returned ${response.status}`);
    return true;
  } catch (error) {
    const now = Date.now();
    if (now - lastTransportFailureAt >= 60_000) {
      lastTransportFailureAt = now;
      console.error(
        JSON.stringify({
          event: "observability_transport_failed",
          service: event.service,
          error: error instanceof Error ? error.name : "unknown_error",
          timestamp: new Date().toISOString(),
        })
      );
    }
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
