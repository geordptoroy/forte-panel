import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertAllowedLlmBaseUrl,
} from "./llm-url-security";
import {
  invokeConfiguredLLM,
  invokeConfiguredEmbeddings,
  invokeConfiguredTTS,
  type AgentProviderSettings,
} from "./llm-providers";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  lookup: vi.fn(),
  agents: [] as any[],
}));

vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
vi.mock("undici", () => ({
  fetch: mocks.fetch,
  Agent: class MockAgent {
    options: any;
    close = vi.fn(async () => undefined);

    constructor(options: any) {
      this.options = options;
      mocks.agents.push(this);
    }
  },
}));

const settings: AgentProviderSettings = {
  providers: {
    nvidia_nim: {
      enabled: true,
      baseUrl: "https://integrate.api.nvidia.com/v1",
      apiKey: "primary-key",
    },
    google_gemini: {
      enabled: true,
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      apiKey: "fallback-key",
    },
    openai_compatible: { enabled: false, baseUrl: "", apiKey: "" },
  },
  routing: {
    text: {
      provider: "nvidia_nim",
      model: "primary-model",
      fallback: [{ provider: "google_gemini", model: "fallback-model" }],
    },
    vision: { provider: "nvidia_nim", model: "vision-model" },
    audio: { provider: "nvidia_nim", model: "audio-model" },
    document: { provider: "nvidia_nim", model: "document-model" },
    embeddings: { provider: "nvidia_nim", model: "embedding-model" },
    tts: { provider: "nvidia_nim", model: "tts-model" },
  },
};

function response(content: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(content), {
    status,
    headers: { "content-type": "application/json", ...Object.fromEntries(new Headers(headers)) },
  });
}

function onlyPrimaryProviderSettings(): AgentProviderSettings {
  return {
    ...settings,
    routing: {
      ...settings.routing,
      text: { provider: "nvidia_nim", model: "primary-model" },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  mocks.agents.length = 0;
  mocks.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("configured LLM routing", () => {
  it("invokes embeddings and preserves provider ordering", async () => {
    mocks.fetch.mockResolvedValueOnce(response({
      model: "embedding-model",
      data: [{ index: 1, embedding: [0.2, 0.3] }, { index: 0, embedding: [0.1, 0.4] }],
    }));
    const result = await invokeConfiguredEmbeddings(settings, { texts: ["um", "dois"] });
    expect(result.embeddings).toEqual([[0.1, 0.4], [0.2, 0.3]]);
    expect(result.telemetry).toMatchObject({ capability: "embeddings", provider: "nvidia_nim", attempts: 1 });
    expect(mocks.fetch.mock.calls[0]![0].toString()).toContain("/embeddings");
    expect(JSON.parse(mocks.fetch.mock.calls[0]![1].body)).toMatchObject({ model: "embedding-model", input: ["um", "dois"] });
  });

  it("requests exactly 2048 dimensions from the configured LocalAI embeddings route", async () => {
    vi.stubEnv("LOCALAI_BASE_URL", "http://local-ai:8080/v1");
    mocks.fetch.mockResolvedValueOnce(response({
      model: "qwen3-embedding-4b",
      data: [{ index: 0, embedding: Array.from({ length: 2048 }, () => 0.1) }],
    }));
    const localSettings: AgentProviderSettings = {
      ...settings,
      providers: {
        ...settings.providers,
        openai_compatible: { enabled: true, baseUrl: "http://local-ai:8080/v1", apiKey: "local-key" },
      },
      routing: {
        ...settings.routing,
        embeddings: { provider: "openai_compatible", model: "qwen3-embedding-4b" },
      },
    };

    const result = await invokeConfiguredEmbeddings(localSettings, { texts: ["teste"], inputType: "query" });

    expect(result.embeddings[0]).toHaveLength(2048);
    const requestBody = JSON.parse(mocks.fetch.mock.calls[0]![1].body);
    expect(requestBody).toMatchObject({
      model: "qwen3-embedding-4b",
      dimensions: 2048,
    });
    expect(requestBody).not.toHaveProperty("input_type");
    expect(requestBody).not.toHaveProperty("truncate");
    expect(mocks.fetch.mock.calls[0]![0].toString()).toBe("http://local-ai:8080/v1/embeddings");
    expect(mocks.lookup).not.toHaveBeenCalled();
  });

  it("truncates Qwen3 MRL to 2048 and renormalizes when LocalAI returns 2560", async () => {
    vi.stubEnv("LOCALAI_BASE_URL", "http://local-ai:8080/v1");
    const localSettings: AgentProviderSettings = {
      ...settings,
      providers: {
        ...settings.providers,
        openai_compatible: { enabled: true, baseUrl: "http://local-ai:8080/v1", apiKey: "local-key" },
      },
      routing: {
        ...settings.routing,
        embeddings: { provider: "openai_compatible", model: "qwen3-embedding-4b" },
      },
    };
    const rawVector = [...Array.from({ length: 2048 }, () => 1), ...Array.from({ length: 512 }, () => 50)];
    mocks.fetch.mockResolvedValueOnce(response({
      model: "qwen3-embedding-4b",
      data: [{ index: 0, embedding: rawVector }],
    }));

    const result = await invokeConfiguredEmbeddings(localSettings, { texts: ["texto sintético"] });
    const vector = result.embeddings[0]!;
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));

    expect(vector).toHaveLength(2048);
    expect(vector[0]).toBeCloseTo(1 / Math.sqrt(2048), 8);
    expect(norm).toBeCloseTo(1, 8);
  });

  it("rejects non-Qwen LocalAI embeddings that do not match the 2048 schema", async () => {
    vi.stubEnv("LOCALAI_BASE_URL", "http://local-ai:8080/v1");
    const localSettings: AgentProviderSettings = {
      ...settings,
      providers: {
        ...settings.providers,
        openai_compatible: { enabled: true, baseUrl: "http://local-ai:8080/v1", apiKey: "local-key" },
      },
      routing: {
        ...settings.routing,
        embeddings: { provider: "openai_compatible", model: "other-local-embedding" },
      },
    };
    mocks.fetch.mockResolvedValueOnce(response({
      model: "other-local-embedding",
      data: [{ index: 0, embedding: Array.from({ length: 2560 }, () => 0.1) }],
    }));

    const error = await invokeConfiguredEmbeddings(localSettings, { texts: ["texto sintético"] }).catch(error => error);

    expect(error.telemetry.failureCode).toBe("EmbeddingDimensionError");
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("invokes the OpenAI-compatible speech endpoint and reports TTS telemetry", async () => {
    mocks.fetch.mockResolvedValueOnce(new Response(Buffer.from("audio"), {
      status: 200,
      headers: { "content-type": "audio/mpeg" },
    }));

    const result = await invokeConfiguredTTS(settings, { text: "Olá", voice: "alloy" });

    expect(result.audio.toString()).toBe("audio");
    expect(result.mimeType).toBe("audio/mpeg");
    expect(result.telemetry).toMatchObject({ capability: "tts", provider: "nvidia_nim", attempts: 1, fallbackUsed: false });
    expect(mocks.fetch.mock.calls[0]![0].toString()).toContain("/audio/speech");
    expect(JSON.parse(mocks.fetch.mock.calls[0]![1].body)).toMatchObject({ model: "tts-model", input: "Olá", voice: "alloy", response_format: "mp3" });
  });

  it("uses the configured TTS fallback after a primary failure", async () => {
    mocks.fetch
      .mockRejectedValueOnce(new Error("primary unavailable"))
      .mockResolvedValueOnce(new Response(Buffer.from("fallback-audio"), { status: 200, headers: { "content-type": "audio/mpeg" } }));

    const result = await invokeConfiguredTTS({
      ...settings,
      routing: { ...settings.routing, tts: { provider: "nvidia_nim", model: "primary-tts", fallback: [{ provider: "google_gemini", model: "fallback-tts" }] } },
    }, { text: "Fallback" });

    expect(result.audio.toString()).toBe("fallback-audio");
    expect(result.telemetry).toMatchObject({ capability: "tts", provider: "google_gemini", attempts: 2, fallbackUsed: true });
  });

  it("uses the explicit fallback after a primary provider failure", async () => {
    mocks.fetch
      .mockRejectedValueOnce(new Error("primary unavailable"))
      .mockResolvedValueOnce(response({
        model: "fallback-model",
        choices: [{ message: { content: "Resposta de fallback" } }],
      }));

    const result = await invokeConfiguredLLM(settings, "text", {
      model: "unused-model",
      messages: [{ role: "user", content: "Olá" }],
    });

    expect(result.choices[0]?.message.content).toBe("Resposta de fallback");
    expect(result.telemetry).toEqual({
      capability: "text",
      provider: "google_gemini",
      attempts: 2,
      fallbackUsed: true,
      failureCode: null,
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(mocks.fetch.mock.calls[1]![1].body).model).toBe(
      "fallback-model"
    );
    expect(mocks.fetch.mock.calls[1]![1]).toMatchObject({ redirect: "error" });
  });

  it("retries text-only when a provider rejects tool schemas with a 5xx", async () => {
    mocks.fetch
      .mockResolvedValueOnce(response({ error: "tool schema rejected" }, 500))
      .mockResolvedValueOnce(response({
        model: "primary-model",
        choices: [{ message: { content: "Resposta sem ferramenta" } }],
      }));

    const result = await invokeConfiguredLLM(onlyPrimaryProviderSettings(), "text", {
      model: "unused-model",
      messages: [{ role: "user", content: "Olá" }],
      tools: [{
        type: "function",
        function: {
          name: "consultar_contexto_comercial",
          description: "Consulta contexto.",
          parameters: { type: "object", properties: {}, additionalProperties: false },
        },
      }],
      toolChoice: "auto",
    });

    expect(result.choices[0]?.message.content).toBe("Resposta sem ferramenta");
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(mocks.fetch.mock.calls[0]![1].body).tools).toHaveLength(1);
    expect(JSON.parse(mocks.fetch.mock.calls[1]![1].body)).not.toHaveProperty("tools");
    expect(JSON.parse(mocks.fetch.mock.calls[1]![1].body)).not.toHaveProperty("tool_choice");
  });

  it("does not try an implicit provider when no fallback is configured", async () => {
    mocks.fetch.mockRejectedValue(new Error("unavailable"));

    const error = await invokeConfiguredLLM(
      onlyPrimaryProviderSettings(),
      "text",
      { model: "unused-model", messages: [] }
    ).catch(error => error);
    expect(error.telemetry).toEqual({
      capability: "text",
      provider: null,
      attempts: 1,
      fallbackUsed: false,
      failureCode: "Error",
    });
    expect(error.message).toContain("tentativas: nvidia_nim:Error");
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["text", "text-fallback"],
    ["vision", "vision-fallback"],
    ["audio", "audio-fallback"],
    ["document", "document-fallback"],
  ] as const)("uses the explicit fallback for %s", async (capability, fallbackModel) => {
    mocks.fetch
      .mockRejectedValueOnce(new Error("primary unavailable"))
      .mockResolvedValueOnce(response({
        model: fallbackModel,
        choices: [{ message: { content: `fallback-${capability}` } }],
      }));

    const result = await invokeConfiguredLLM({
      ...settings,
      routing: {
        ...settings.routing,
        [capability]: {
          provider: "nvidia_nim",
          model: `${capability}-primary`,
          fallback: [{ provider: "google_gemini", model: fallbackModel }],
        },
      },
    }, capability, { model: "unused-model", messages: [] });

    expect(result.choices[0]?.message.content).toBe(`fallback-${capability}`);
    expect(result.telemetry).toEqual({
      capability,
      provider: "google_gemini",
      attempts: 2,
      fallbackUsed: true,
      failureCode: null,
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(mocks.fetch.mock.calls[1]![1].body).model).toBe(
      fallbackModel
    );
  });

  it.each(["text", "vision", "audio", "document"] as const)(
    "fails closed with bounded telemetry when %s has no available provider",
    async capability => {
      mocks.fetch.mockRejectedValue(new Error("provider offline"));

      const error = await invokeConfiguredLLM({
        ...settings,
        routing: {
          ...settings.routing,
          [capability]: { provider: "nvidia_nim", model: `${capability}-primary` },
        },
      }, capability, { model: "unused-model", messages: [] }).catch(error => error);

      expect(error.telemetry).toEqual({
        capability,
        provider: null,
        attempts: 1,
        fallbackUsed: false,
        failureCode: "Error",
      });
      expect(error.message).toContain("nvidia_nim:Error");
      expect(mocks.fetch).toHaveBeenCalledTimes(1);
    }
  );

  it.each([
    "http://127.0.0.1/v1",
    "https://127.0.0.1/v1",
    "https://10.0.0.1/v1",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/v1",
  ])("rejects a local or literal-IP target before sending the provider key: %s", async baseUrl => {
    const unsafe = {
      ...onlyPrimaryProviderSettings(),
      providers: {
        ...settings.providers,
        nvidia_nim: { enabled: true, baseUrl, apiKey: "must-not-leak" },
      },
    };

    await expect(
      invokeConfiguredLLM(unsafe, "text", { model: "m", messages: [] })
    ).rejects.toThrow();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("blocks a hostname that resolves to a private, link-local, or mixed DNS set", async () => {
    mocks.lookup.mockResolvedValueOnce([
      { address: "8.8.8.8", family: 4 },
      { address: "169.254.169.254", family: 4 },
    ]);

    await expect(
      invokeConfiguredLLM(onlyPrimaryProviderSettings(), "text", {
        model: "m",
        messages: [],
      })
    ).rejects.toThrow("Nenhum provider disponível");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("disables redirects so a provider cannot forward the authorization header", async () => {
    mocks.fetch.mockResolvedValueOnce(
      new Response("", {
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data" },
      })
    );

    await expect(
      invokeConfiguredLLM(onlyPrimaryProviderSettings(), "text", {
        model: "m",
        messages: [],
      })
    ).rejects.toThrow("Nenhum provider disponível");

    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.fetch.mock.calls[0]![1]).toMatchObject({ redirect: "error" });
    expect(mocks.fetch.mock.calls[0]![1].headers.authorization).toBe(
      "Bearer primary-key"
    );
  });

  it("rechecks DNS through the socket dispatcher to block rebinding", async () => {
    mocks.fetch.mockResolvedValueOnce(
      response({ choices: [{ message: { content: "OK" } }] })
    );
    await invokeConfiguredLLM(onlyPrimaryProviderSettings(), "text", {
      model: "m",
      messages: [],
    });

    const socketLookup = mocks.agents[0]!.options.connect.lookup;
    expect(typeof socketLookup).toBe("function");
    mocks.lookup.mockResolvedValueOnce([{ address: "10.0.0.9", family: 4 }]);
    const outcome = await new Promise<any>(resolve => {
      socketLookup("integrate.api.nvidia.com", { all: true }, (error: Error | null, addresses: unknown) =>
        resolve(error ?? addresses)
      );
    });
    expect(outcome).toMatchObject({ code: "EACCES" });
  });

  it("requires custom OpenAI-compatible hosts to be explicitly allowlisted", () => {
    expect(() =>
      assertAllowedLlmBaseUrl("openai_compatible", "https://api.custom-ai.net/v1")
    ).toThrow("FORTE_LLM_ALLOWED_HOSTS");
    vi.stubEnv("FORTE_LLM_ALLOWED_HOSTS", "api.custom-ai.net");
    expect(
      assertAllowedLlmBaseUrl(
        "openai_compatible",
        "https://api.custom-ai.net/v1"
    ).hostname
    ).toBe("api.custom-ai.net");
  });

  it("allows only the exact internal LocalAI URL configured by Compose", () => {
    vi.stubEnv("LOCALAI_BASE_URL", "http://local-ai:8080/v1");
    expect(
      assertAllowedLlmBaseUrl("openai_compatible", "http://local-ai:8080/v1").href
    ).toBe("http://local-ai:8080/v1");
    expect(() =>
      assertAllowedLlmBaseUrl("openai_compatible", "http://other-service:8080/v1")
    ).toThrow("Providers LLM só podem usar HTTPS");
    expect(() =>
      assertAllowedLlmBaseUrl("openai_compatible", "http://local-ai:8080/v2")
    ).toThrow("Providers LLM só podem usar HTTPS");
  });
});
