import crypto from "node:crypto";
import { fetch as undiciFetch } from "undici";
import type { FormData as UndiciFormData } from "undici";
import type { InvokeParams, InvokeResult, Tool } from "./_core/llm";
import {
  buildAudioTranscriptionsEndpoint,
  buildLlmEndpoint,
  buildTtsEndpoint,
  createLocalAiAgent,
  createGuardedLlmAgent,
  isConfiguredLocalAiTarget,
  validateLlmTarget,
} from "./llm-url-security";

export type AgentProviderId = string;
export type AgentCapability =
  | "text"
  | "vision"
  | "audio"
  | "document"
  | "video"
  | "prompt_builder"
  | "moderation"
  | "embeddings"
  | "tts";

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
  providers: {},
  routing: {
    text: { provider: "default", model: "" },
    vision: { provider: "default", model: "" },
    audio: { provider: "default", model: "" },
    document: { provider: "default", model: "" },
    video: { provider: "default", model: "" },
    prompt_builder: { provider: "default", model: "" },
    moderation: { provider: "default", model: "" },
    embeddings: { provider: "default", model: "" },
    tts: { provider: "default", model: "" },
  },
};

export const defaultAgentProviderSettings = (): AgentProviderSettings =>
  structuredClone(DEFAULTS);

export function mergeAgentProviderSettings(
  input?: Partial<AgentProviderSettings>
): AgentProviderSettings {
  const base = defaultAgentProviderSettings();
  if (!input) return base;
  for (const [id, candidate] of Object.entries(input.providers ?? {}))
    base.providers[id] = { ...base.providers[id], ...candidate };
  for (const capability of Object.keys(base.routing) as AgentCapability[]) {
    const candidate = input.routing?.[capability];
    if (candidate)
      base.routing[capability] = { ...base.routing[capability], ...candidate };
  }
  for (const [capability, candidate] of Object.entries(input.routing ?? {})) {
    if (!(capability in base.routing))
      base.routing[capability as AgentCapability] = candidate;
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

async function readBoundedJson<T = InvokeResult>(
  response: Awaited<ReturnType<typeof undiciFetch>>
): Promise<T> {
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
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
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
      dispatcher = isConfiguredLocalAiTarget(candidate.provider, baseUrl)
        ? createLocalAiAgent()
        : createGuardedLlmAgent();
      const requestUrl = buildLlmEndpoint(target.toString());
      const requestOptions = {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${decryptProviderSecret(apiKey)}`,
        },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "error",
        dispatcher,
      } as const;
      const requestParams = { ...params, model: candidate.model || params.model };
      let response = await undiciFetch(requestUrl, {
        ...requestOptions,
        body: JSON.stringify(normalizeParams(requestParams)),
      });
      // Some OpenAI-compatible providers return 5xx for an otherwise valid
      // request when one of the advertised tool schemas is unsupported. Keep
      // WhatsApp text replies available by retrying once without tools; tool
      // execution remains enabled whenever the provider accepts the schema.
      if (
        !response.ok &&
        response.status >= 500 &&
        Array.isArray(requestParams.tools) &&
        requestParams.tools.length > 0
      ) {
        await response.body?.cancel().catch(() => undefined);
        response = await undiciFetch(requestUrl, {
          ...requestOptions,
          body: JSON.stringify(
            normalizeParams({
              ...requestParams,
              tools: undefined,
              toolChoice: undefined,
              tool_choice: undefined,
            })
          ),
        });
      }
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

const LOCALAI_EMBEDDING_DIMENSIONS = 2048;
const QWEN3_EMBEDDING_4B_MODEL = "qwen3-embedding-4b";
const QWEN3_EMBEDDING_4B_MAX_DIMENSIONS = 2560;

class EmbeddingDimensionError extends Error {
  constructor() {
    super("LOCALAI_EMBEDDING_DIMENSION_MISMATCH");
    this.name = "EmbeddingDimensionError";
  }
}

function normalizeQwen3Embedding2048(vector: number[]) {
  if (
    (vector.length !== LOCALAI_EMBEDDING_DIMENSIONS &&
      vector.length !== QWEN3_EMBEDDING_4B_MAX_DIMENSIONS) ||
    vector.some(value => !Number.isFinite(value))
  )
    throw new EmbeddingDimensionError();

  const prefix = vector.slice(0, LOCALAI_EMBEDDING_DIMENSIONS);
  const normSquared = prefix.reduce((sum, value) => sum + value * value, 0);
  const norm = Math.sqrt(normSquared);
  if (!Number.isFinite(norm) || norm <= 0)
    throw new EmbeddingDimensionError();
  return prefix.map(value => value / norm);
}

function prepareLocalAiEmbedding(vector: number[], model: string) {
  if (vector.some(value => !Number.isFinite(value)))
    throw new EmbeddingDimensionError();

  const modelId = model.trim().split("/").at(-1)?.toLowerCase();
  if (modelId === QWEN3_EMBEDDING_4B_MODEL)
    return normalizeQwen3Embedding2048(vector);
  if (vector.length !== LOCALAI_EMBEDDING_DIMENSIONS)
    throw new EmbeddingDimensionError();
  return vector;
}

export async function invokeConfiguredEmbeddings(
  settings: AgentProviderSettings,
  input: { texts: string[]; model?: string; inputType?: "query" | "passage" }
): Promise<{ embeddings: number[][]; model: string; telemetry: LLMInvocationTelemetry }> {
  if (!input.texts.length || input.texts.some(text => !text.trim())) throw new Error("EMBEDDING_INPUT_EMPTY");
  const route = settings.routing.embeddings;
  const candidates = [route, ...(route.fallback ?? [])];
  const timeoutMs = Math.max(1_000, Math.min(Number(process.env.AGENT_EMBEDDING_TIMEOUT_MS ?? 45_000), 180_000));
  const failures: string[] = [];
  let attempts = 0;
  for (const candidate of candidates) {
    attempts += 1;
    const provider = settings.providers[candidate.provider];
    const baseUrl = candidate.baseUrl || provider?.baseUrl;
    const apiKey = candidate.apiKey || provider?.apiKey;
    if ((!provider?.enabled && !(candidate.baseUrl && candidate.apiKey)) || !baseUrl || !apiKey) {
      failures.push(`${candidate.provider}:indisponível`);
      continue;
    }
    let dispatcher: ReturnType<typeof createGuardedLlmAgent> | undefined;
    try {
      const target = await validateLlmTarget(candidate.provider, baseUrl);
      const localAi = isConfiguredLocalAiTarget(candidate.provider, baseUrl);
      dispatcher = localAi ? createLocalAiAgent() : createGuardedLlmAgent();
      const base = target.toString().replace(/\/+$/, "").replace(/\/embeddings$/i, "");
      const endpoint = /\/v1$/i.test(base) ? `${base}/embeddings` : `${base}/v1/embeddings`;
      const requestedModel = candidate.model || input.model;
      const model = /integrate\.api\.nvidia\.com/i.test(base) && requestedModel === "llama-nemotron-embed-vl-1b-v2"
        ? "nvidia/llama-nemotron-embed-vl-1b-v2"
        : requestedModel;
      const body: Record<string, unknown> = {
        model,
        input: input.texts,
      };
      if (localAi) body.dimensions = 2048;
      if (input.inputType && !localAi) {
        body.input_type = input.inputType;
        body.modality = "text";
        body.encoding_format = "float";
        body.truncate = "NONE";
      }
      const response = await undiciFetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${decryptProviderSecret(apiKey)}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "error",
        dispatcher,
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        failures.push(`${candidate.provider}:http_${response.status}`);
        continue;
      }
      const json = await readBoundedJson<{
        data?: Array<{ embedding?: number[]; index?: number }>;
        model?: string;
      }>(response);
      const ordered = [...(json.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      if (ordered.length !== input.texts.length || ordered.some(item => !item.embedding?.length)) throw new Error("EMBEDDING_RESPONSE_INVALID");
      const embeddings = ordered.map(item =>
        localAi
          ? prepareLocalAiEmbedding(item.embedding!, model || "")
          : item.embedding!
      );
      return {
        embeddings,
        model: json.model || candidate.model || input.model || "",
        telemetry: { capability: "embeddings", provider: candidate.provider, attempts, fallbackUsed: attempts > 1, failureCode: null },
      };
    } catch (error) {
      failures.push(`${candidate.provider}:${error instanceof Error ? error.name : "erro"}`);
    } finally {
      await dispatcher?.close().catch(() => undefined);
    }
  }
  throw new LLMProviderError(`Nenhum provider disponível para embeddings; tentativas: ${failures.join(", ")}`, {
    capability: "embeddings", provider: null, attempts, fallbackUsed: attempts > 1,
    failureCode: failures.at(-1)?.split(":").slice(1).join(":") || "unavailable",
  });
}

export async function invokeConfiguredLocalAudioTranscription(
  settings: AgentProviderSettings,
  input: { audio: Buffer; mimeType: string; model?: string }
): Promise<{ text: string; telemetry: LLMInvocationTelemetry }> {
  const candidate = settings.routing.audio;
  const provider = settings.providers[candidate.provider];
  const baseUrl = candidate.baseUrl || provider?.baseUrl;
  const apiKey = candidate.apiKey || provider?.apiKey;
  if (
    !baseUrl ||
    !apiKey ||
    (!provider?.enabled && !(candidate.baseUrl && candidate.apiKey)) ||
    !isConfiguredLocalAiTarget(candidate.provider, baseUrl)
  )
    throw new Error("LOCALAI_AUDIO_ROUTE_NOT_CONFIGURED");

  let dispatcher: ReturnType<typeof createLocalAiAgent> | undefined;
  try {
    const target = await validateLlmTarget(candidate.provider, baseUrl);
    dispatcher = createLocalAiAgent();
    const form = new FormData();
    const bytes = new Uint8Array(input.audio.byteLength);
    bytes.set(input.audio);
    const extension = input.mimeType === "audio/ogg" ? "ogg"
      : input.mimeType === "audio/mpeg" ? "mp3"
        : input.mimeType === "audio/mp4" ? "m4a"
          : input.mimeType === "audio/webm" ? "webm"
            : input.mimeType === "audio/aac" ? "aac" : "wav";
    form.append("file", new Blob([bytes.buffer as ArrayBuffer], { type: input.mimeType }), `audio.${extension}`);
    form.append("model", candidate.model || input.model || "whisper-base");
    form.append("language", "pt");
    const timeoutMsRaw = Number(process.env.AGENT_AUDIO_TIMEOUT_MS ?? 180_000);
    const timeoutMs = Number.isFinite(timeoutMsRaw)
      ? Math.max(1_000, Math.min(timeoutMsRaw, 300_000))
      : 180_000;
    const response = await undiciFetch(buildAudioTranscriptionsEndpoint(target.toString()), {
      method: "POST",
      headers: { authorization: `Bearer ${decryptProviderSecret(apiKey)}` },
      body: form as unknown as UndiciFormData,
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "error",
      dispatcher,
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`LOCALAI_AUDIO_HTTP_${response.status}`);
    }
    const json = await readBoundedJson<{ text?: unknown }>(response);
    if (typeof json.text !== "string") throw new Error("LOCALAI_AUDIO_RESPONSE_INVALID");
    return {
      text: json.text.trim().slice(0, 12_000),
      telemetry: {
        capability: "audio",
        provider: candidate.provider,
        attempts: 1,
        fallbackUsed: false,
        failureCode: null,
      },
    };
  } finally {
    await dispatcher?.close().catch(() => undefined);
  }
}

export async function invokeConfiguredTTS(
  settings: AgentProviderSettings,
  input: { text: string; model?: string; voice?: string; responseFormat?: "mp3" | "wav" | "ogg" }
): Promise<{ audio: Buffer; mimeType: string; model: string; telemetry: LLMInvocationTelemetry }> {
  const route = settings.routing.tts;
  const candidates = [route, ...(route.fallback ?? [])];
  const timeoutMsRaw = Number(process.env.AGENT_TTS_TIMEOUT_MS ?? process.env.AGENT_LLM_TIMEOUT_MS ?? 45_000);
  const timeoutMs = Number.isFinite(timeoutMsRaw) ? Math.max(1_000, Math.min(timeoutMsRaw, 180_000)) : 45_000;
  const maxBytes = 10 * 1024 * 1024;
  const failures: string[] = [];
  let attempts = 0;
  for (const candidate of candidates) {
    attempts += 1;
    const provider = settings.providers[candidate.provider];
    const baseUrl = candidate.baseUrl || provider?.baseUrl;
    const apiKey = candidate.apiKey || provider?.apiKey;
    if ((!provider?.enabled && !(candidate.baseUrl && candidate.apiKey)) || !baseUrl || !apiKey) {
      failures.push(`${candidate.provider}:indisponível`);
      continue;
    }
    let dispatcher: ReturnType<typeof createGuardedLlmAgent> | undefined;
    try {
      const target = await validateLlmTarget(candidate.provider, baseUrl);
      dispatcher = isConfiguredLocalAiTarget(candidate.provider, baseUrl)
        ? createLocalAiAgent()
        : createGuardedLlmAgent();
      const responseFormat = input.responseFormat ?? "mp3";
      const response = await undiciFetch(buildTtsEndpoint(target.toString()), {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${decryptProviderSecret(apiKey)}` },
        body: JSON.stringify({
          model: candidate.model || input.model,
          input: input.text,
          voice: input.voice || process.env.AGENT_TTS_VOICE || "alloy",
          response_format: responseFormat,
        }),
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "error",
        dispatcher,
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        failures.push(`${candidate.provider}:http_${response.status}`);
        continue;
      }
      const contentLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(contentLength) && contentLength > maxBytes) throw new Error("Resposta TTS excedeu o limite de 10 MiB");
      const body = Buffer.from(await response.arrayBuffer());
      if (!body.length || body.length > maxBytes) throw new Error("Resposta TTS vazia ou excedeu o limite de 10 MiB");
      return {
        audio: body,
        mimeType: responseFormat === "wav" ? "audio/wav" : responseFormat === "ogg" ? "audio/ogg" : "audio/mpeg",
        model: candidate.model || input.model || "",
        telemetry: { capability: "tts", provider: candidate.provider, attempts, fallbackUsed: attempts > 1, failureCode: null },
      };
    } catch (error) {
      failures.push(`${candidate.provider}:${error instanceof Error ? error.name : "erro"}`);
    } finally {
      await dispatcher?.close().catch(() => undefined);
    }
  }
  throw new LLMProviderError(`Nenhum provider disponível para tts; tentativas: ${failures.join(", ")}`, {
    capability: "tts",
    provider: null,
    attempts,
    fallbackUsed: attempts > 1,
    failureCode: failures.at(-1)?.split(":").slice(1).join(":") || "unavailable",
  });
}

export function capabilityForMessageType(
  messageType?: string
): AgentCapability {
  if (messageType === "image") return "vision";
  if (messageType === "audio") return "audio";
  if (messageType === "video") return "video";
  if (["document", "pdf"].includes(messageType ?? "")) return "document";
  return "text";
}

export type { Tool };
