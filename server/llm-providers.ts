import crypto from "node:crypto";
import type { InvokeParams, InvokeResult, Tool } from "./_core/llm";

export type AgentProviderId = "nvidia_nim" | "google_gemini" | "openai_compatible";
export type AgentCapability = "text" | "vision" | "audio" | "document";

export type ProviderConfig = {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
};

export type AgentRouting = Record<AgentCapability, { provider: AgentProviderId; model: string }>;

export type AgentProviderSettings = {
  providers: Record<AgentProviderId, ProviderConfig>;
  routing: AgentRouting;
};

const DEFAULTS: AgentProviderSettings = {
  providers: {
    nvidia_nim: { enabled: false, baseUrl: "https://integrate.api.nvidia.com/v1", apiKey: "" },
    google_gemini: { enabled: false, baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", apiKey: "" },
    openai_compatible: { enabled: false, baseUrl: "", apiKey: "" },
  },
  routing: {
    text: { provider: "nvidia_nim", model: "meta/llama-3.1-70b-instruct" },
    vision: { provider: "google_gemini", model: "gemini-2.0-flash" },
    audio: { provider: "google_gemini", model: "gemini-2.0-flash" },
    document: { provider: "google_gemini", model: "gemini-2.0-flash" },
  },
};

export const defaultAgentProviderSettings = (): AgentProviderSettings => structuredClone(DEFAULTS);

export function mergeAgentProviderSettings(input?: Partial<AgentProviderSettings>): AgentProviderSettings {
  const base = defaultAgentProviderSettings();
  if (!input) return base;
  for (const id of Object.keys(base.providers) as AgentProviderId[]) {
    const candidate = input.providers?.[id];
    if (candidate) base.providers[id] = { ...base.providers[id], ...candidate };
  }
  for (const capability of Object.keys(base.routing) as AgentCapability[]) {
    const candidate = input.routing?.[capability];
    if (candidate) base.routing[capability] = { ...base.routing[capability], ...candidate };
  }
  return base;
}

const secretKey = () => crypto.createHash("sha256").update(process.env.JWT_SECRET || "forte-panel-local-secret").digest();

export function encryptProviderSecret(value: string) {
  if (!value) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", secretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptProviderSecret(value: string) {
  if (!value) return "";
  if (!value.startsWith("v1:")) return value;
  const [, ivRaw, tagRaw, encryptedRaw] = value.split(":");
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", secretKey(), Buffer.from(ivRaw, "base64url"));
    decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

export function maskProviderSecret(value: string) {
  const plain = decryptProviderSecret(value);
  return plain ? `••••••••${plain.slice(-4)}` : "";
}

function endpoint(baseUrl: string) {
  const normalized = baseUrl.replace(/\/$/, "");
  return normalized.endsWith("/v1") ? normalized : `${normalized}/v1`;
}

function normalizeParams(params: InvokeParams) {
  const payload: Record<string, unknown> = { messages: params.messages, model: params.model, tools: params.tools };
  const toolChoice = params.toolChoice || params.tool_choice;
  if (toolChoice) payload.tool_choice = toolChoice;
  const maxTokens = params.maxTokens ?? params.max_tokens;
  if (maxTokens) payload.max_tokens = maxTokens;
  if (params.thinking) payload.thinking = params.thinking;
  if (params.reasoning) payload.reasoning = params.reasoning;
  if (params.responseFormat || params.response_format) payload.response_format = params.responseFormat || params.response_format;
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}

export async function invokeConfiguredLLM(settings: AgentProviderSettings, capability: AgentCapability, params: InvokeParams): Promise<InvokeResult> {
  const route = settings.routing[capability];
  const provider = settings.providers[route.provider];
  if (!provider?.enabled || !provider.baseUrl || !provider.apiKey) throw new Error(`Provedor configurado para ${capability} não está disponível`);
  const timeoutMsRaw = Number(process.env.AGENT_LLM_TIMEOUT_MS ?? 45_000);
  const timeoutMs = Number.isFinite(timeoutMsRaw) ? Math.max(1_000, Math.min(timeoutMsRaw, 180_000)) : 45_000;
  const response = await fetch(`${endpoint(provider.baseUrl)}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${decryptProviderSecret(provider.apiKey)}` },
    body: JSON.stringify(normalizeParams({ ...params, model: route.model || params.model })),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`LLM ${route.provider} respondeu ${response.status}: ${await response.text()}`);
  return await response.json() as InvokeResult;
}

export function capabilityForMessageType(messageType?: string): AgentCapability {
  if (messageType === "image") return "vision";
  if (messageType === "audio") return "audio";
  if (["document", "pdf"].includes(messageType ?? "")) return "document";
  return "text";
}

export type { Tool };
