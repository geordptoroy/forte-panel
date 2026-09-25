import { ENV } from "../_core/env";

export type PapiCloudInstance = {
  id: string;
  instanceName?: string;
  name?: string;
  status?: string;
};

type PapiCloudResponse<T> = T & { success?: boolean; error?: string; message?: string };

function requireConfig() {
  if (!ENV.papiCloudPanelToken.trim()) {
    throw new Error("PAPI_CLOUD_PANEL_TOKEN não configurado no backend");
  }
  return {
    managementUrl: ENV.papiCloudManagementUrl.replace(/\/$/, ""),
    apiUrl: ENV.papiCloudApiUrl.replace(/\/$/, ""),
    panelToken: ENV.papiCloudPanelToken.trim(),
  };
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(15_000) });
  const text = await response.text();
  let body: PapiCloudResponse<T> | undefined;
  try { body = text ? JSON.parse(text) as PapiCloudResponse<T> : undefined; } catch { body = undefined; }
  if (!response.ok) {
    const detail = body?.message || body?.error || text.slice(0, 300) || `HTTP ${response.status}`;
    throw new Error(`PAPI Cloud respondeu ${response.status}: ${detail}`);
  }
  return (body ?? {}) as T;
}

export function isPapiCloudConfigured() {
  return Boolean(ENV.papiCloudPanelToken.trim());
}

export async function createPapiCloudInstance(instanceName: string) {
  const config = requireConfig();
  const body = await request<PapiCloudResponse<{ id?: string; instance?: PapiCloudInstance }>>(`${config.managementUrl}/api/v1/instances`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-panel-token": config.panelToken },
    body: JSON.stringify({ instanceName: instanceName.trim() }),
  });
  const instance = body.instance ?? (body.id ? { id: body.id, instanceName: instanceName.trim() } : undefined);
  if (!instance?.id) throw new Error("PAPI Cloud não retornou o id da instância criada");
  return instance;
}

export async function getPapiCloudInstanceApiKey(instanceId: string) {
  const config = requireConfig();
  const body = await request<PapiCloudResponse<{ apiKey?: string; key?: string }>>(`${config.managementUrl}/api/v1/instances/${encodeURIComponent(instanceId)}/apikey`, {
    method: "GET",
    headers: { "x-panel-token": config.panelToken },
  });
  const apiKey = body.apiKey ?? body.key;
  if (!apiKey) throw new Error("PAPI Cloud não retornou a API key da instância");
  return apiKey;
}

export async function rotatePapiCloudInstanceApiKey(instanceId: string) {
  const config = requireConfig();
  const body = await request<PapiCloudResponse<{ apiKey?: string; key?: string }>>(`${config.managementUrl}/api/v1/instances/${encodeURIComponent(instanceId)}/apikey/rotate`, {
    method: "POST",
    headers: { "x-panel-token": config.panelToken },
  });
  const apiKey = body.apiKey ?? body.key;
  if (!apiKey) throw new Error("PAPI Cloud não retornou a nova API key após rotação");
  return apiKey;
}

export async function deletePapiCloudInstance(instanceId: string) {
  const config = requireConfig();
  await request(`${config.managementUrl}/api/v1/instances/${encodeURIComponent(instanceId)}`, {
    method: "DELETE",
    headers: { "x-panel-token": config.panelToken },
  });
}

export async function configurePapiCloudWebhook(instanceId: string, apiKey: string, input: { url: string; events?: string[] }) {
  const config = requireConfig();
  return request<PapiCloudResponse<{ webhook?: { url: string; enabled: boolean; events: string[] } }>>(`${config.apiUrl}/api/instances/${encodeURIComponent(instanceId)}/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({ url: input.url, enabled: true, events: input.events ?? ["messages", "status"] }),
  });
}

export async function getPapiCloudInstanceStatus(instanceId: string, apiKey: string) {
  const config = requireConfig();
  return request<PapiCloudResponse<Record<string, unknown>>>(`${config.apiUrl}/api/instances/${encodeURIComponent(instanceId)}/status`, {
    method: "GET",
    headers: { "x-api-key": apiKey },
  });
}
