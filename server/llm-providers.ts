import crypto from "node:crypto";
import { fetch as undiciFetch } from "undici";
import type { InvokeParams, InvokeResult, Tool } from "./_core/llm";
import {
  buildLlmEndpoint,
  createGuardedLlmAgent,
  validateLlmTarget,
} from "./llm-url-security";

export type AgentProviderId =
  | "nvidia_nim"
  | "google_gemini"
  | "openai_compatible";
export type AgentCapability = "text" | "vision" | "audio" | "document";

export type ProviderConfig = {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
};

export type AgentRouting = Record<
  AgentCapability,
  {
    provider: AgentProviderId;
    model: string;
    baseUrl?: string;
    apiKey?: string;
    fallback?: Array<{
      provider: AgentProviderId;
      model: string;
      baseUrl?: string;
      apiKey?: string;
    }>;
  }
>;

export type AgentProviderSettings = {
  providers: Record<AgentProviderId, ProviderConfig>;
  routing: AgentRouting;
};

export type LLMInvocationTelemetry = {
  capability: AgentCapability;
  provider: AgentProviderId | null;
  attempts: number;
  fallbackUsed: boolean;
  failureCode: string | null;
};

export class LLMProviderError extends Error {
  constructor(
    message: string,
    readonly telemetry: LLMInvocationTelemetry
  ) {
    super(message);
    this.name = "LLMProviderError";
  }
}

const DEFAULTS: AgentProviderSettings = {
  providers: {
    nvidia_nim: {
      enabled: false,
      baseUrl: "https://integrate.api.nvidia.com/v1",
      apiKey: "",
    },
    google_gemini: {
      enabled: false,
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      apiKey: "",
    },
    openai_compatible: { enabled: false, baseUrl: "", apiKey: "" },
  },
  routing: {
    text: { provider: "nvidia_nim", model: "meta/llama-3.1-70b-instruct" },
    vision: { provider: "google_gemini", model: "gemini-2.0-flash" },
    audio: { provider: "google_gemini", model: "gemini-2.0-flash" },
    document: { provider: "google_gemini", model: "gemini-2.0-flash" },
  },
};

export const defaultAgentProviderSettings = (): AgentProviderSettings =>
  structuredClone(DEFAULTS);

export function mergeAgentProviderSettings(
  input?: Partial<AgentProviderSettings>
): AgentProviderSettings {
  const base = defaultAgentProviderSettings();
  if (!input) return base;
  for (const id of Object.keys(base.providers) as AgentProviderId[]) {
    const candidate = input.providers?.[id];
    if (candidate) base.providers[id] = { ...base.providers[id], ...candidate };
  }
  for (const capability of Object.keys(base.routing) as AgentCapability[]) {
    const candidate = input.routing?.[capability];
    if (candidate)
      base.routing[capability] = { ...base.routing[capability], ...candidate };
  }
  return base;
}

const secretKey = () => {
  const configured = process.env.JWT_SECRET?.trim();
  if (!configured && process.env.NODE_ENV === "production")
    throw new Error(
      "JWT_SECRET é obrigatório em produção para criptografar secrets"
    );
  return crypto
    .createHash("sha256")
    .update(configured || "forte-panel-local-secret")
    .digest();
};

export function encryptProviderSecret(value: string) {
  if (!value) return "";
  let serialized = "";
  do {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", secretKey(), iv);
    const encrypted = Buffer.concat([
      cipher.update(value, "utf8"),
      cipher.final(),
    ]);
    serialized = `v1:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${encrypted.toString("base64url")}`;
  } while (serialized.endsWith("x"));
  return serialized;
}

export function decryptProviderSecret(value: string) {
  if (!value) return "";
  if (!value.startsWith("v1:")) return value;
  const parts = value.split(":");
  if (parts.length !== 4) return "";
  const [, ivRaw, tagRaw, encryptedRaw] = parts;
  const decodeCanonical = (raw: string) => {
    if (!raw || !/^[A-Za-z0-9_-]+$/.test(raw))
      throw new Error("invalid base64url");
    const decoded = Buffer.from(raw, "base64url");
    if (decoded.toString("base64url") !== raw)
      throw new Error("non-canonical base64url");
    return decoded;
  };
  try {
    const iv = decodeCanonical(ivRaw);
    const tag = decodeCanonical(tagRaw);
    const encrypted = decodeCanonical(encryptedRaw);
    if (iv.length !== 12 || tag.length !== 16 || encrypted.length === 0)
      return "";
    const decipher = crypto.createDecipheriv("aes-256-gcm", secretKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return "";
  }
}

export function maskProviderSecret(value: string) {
  const plain = decryptProviderSecret(value);
  return plain ? `••••••••${plain.slice(-4)}` : "";
}

function normalizeParams(params: InvokeParams) {
  const payload: Record<string, unknown> = {
    messages: params.messages,
    model: params.model,
    tools: params.tools,
  };
  const toolChoice = params.toolChoice || params.tool_choice;
  if (toolChoice) payload.tool_choice = toolChoice;
  const maxTokens = params.maxTokens ?? params.max_tokens;
  if (maxTokens) payload.max_tokens = maxTokens;
  if (params.thinking) payload.thinking = params.thinking;
  if (params.reasoning) payload.reasoning = params.reasoning;
  if (params.responseFormat || params.response_format)
    payload.response_format = params.responseFormat || params.response_format;
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  );
}

async function readBoundedJson(
  response: Awaited<ReturnType<typeof undiciFetch>>
): Promise<InvokeResult> {
  const maxResponseBytes = 10 * 1024 * 1024;
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxResponseBytes)
    throw new Error("Resposta LLM excedeu o limite de 10 MiB");

  const reader = response.body?.getReader();
  if (!reader) throw new Error("Resposta LLM sem corpo JSON");
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxResponseBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error("Resposta LLM excedeu o limite de 10 MiB");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as InvokeResult;
}

export async function invokeConfiguredLLM(
  settings: AgentProviderSettings,
  capability: AgentCapability,
  params: InvokeParams
): Promise<InvokeResult & { telemetry: LLMInvocationTelemetry }> {
  const route = settings.routing[capability];
  const candidates = [route, ...(route.fallback ?? [])];
  const timeoutMsRaw = Number(process.env.AGENT_LLM_TIMEOUT_MS ?? 45_000);
  const timeoutMs = Number.isFinite(timeoutMsRaw)
    ? Math.max(1_000, Math.min(timeoutMsRaw, 180_000))
    : 45_000;
  const failures: string[] = [];
  let attempts = 0;
  for (const candidate of candidates) {
    attempts += 1;
    const provider = settings.providers[candidate.provider];
    const baseUrl = candidate.baseUrl || provider?.baseUrl;
    const apiKey = candidate.apiKey || provider?.apiKey;
    if (
      (!provider?.enabled && !(candidate.baseUrl && candidate.apiKey)) ||
      !baseUrl ||
      !apiKey
    ) {
      failures.push(`${candidate.provider}:indisponível`);
      continue;
    }
    let dispatcher: ReturnType<typeof createGuardedLlmAgent> | undefined;
    try {
      const target = await validateLlmTarget(candidate.provider, baseUrl);
      dispatcher = createGuardedLlmAgent();
      const response = await undiciFetch(buildLlmEndpoint(target.toString()), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${decryptProviderSecret(apiKey)}`,
        },
        body: JSON.stringify(
          normalizeParams({ ...params, model: candidate.model || params.model })
        ),
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "error",
        dispatcher,
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        failures.push(`${candidate.provider}:http_${response.status}`);
        continue;
      }
      const result = await readBoundedJson(response);
      return {
        ...result,
        telemetry: {
          capability,
          provider: candidate.provider,
          attempts,
          fallbackUsed: attempts > 1,
          failureCode: null,
        },
      };
    } catch (error) {
      failures.push(
        `${candidate.provider}:${error instanceof Error ? error.name : "erro"}`
      );
    } finally {
      await dispatcher?.close().catch(() => undefined);
    }
  }
  throw new LLMProviderError(
    `Nenhum provider disponível para ${capability}; tentativas: ${failures.join(", ")}`,
    {
      capability,
      provider: null,
      attempts,
      fallbackUsed: attempts > 1,
      failureCode: failures.at(-1)?.split(":").slice(1).join(":") || "unavailable",
    }
  );
}

export function capabilityForMessageType(
  messageType?: string
): AgentCapability {
  if (messageType === "image") return "vision";
  if (messageType === "audio") return "audio";
  if (["document", "pdf"].includes(messageType ?? "")) return "document";
  return "text";
}

export type { Tool };
