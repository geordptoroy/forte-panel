import { afterEach, describe, expect, it, vi } from "vitest";
import { invokeConfiguredLLM, type AgentProviderSettings } from "./llm-providers";

const settings: AgentProviderSettings = {
  providers: {
    nvidia_nim: { enabled: true, baseUrl: "https://primary.example/v1", apiKey: "primary-key" },
    google_gemini: { enabled: true, baseUrl: "https://fallback.example/v1", apiKey: "fallback-key" },
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
  },
};

afterEach(() => vi.unstubAllGlobals());

describe("configured LLM routing", () => {
  it("uses the explicit fallback after a primary provider failure", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("primary unavailable"))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        model: "fallback-model",
        choices: [{ message: { content: "Resposta de fallback" } }],
      }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await invokeConfiguredLLM(settings, "text", {
      model: "unused-model",
      messages: [{ role: "user", content: "Olá" }],
    });

    expect(result.choices[0]?.message.content).toBe("Resposta de fallback");
    expect(result.telemetry).toEqual({ capability: "text", provider: "google_gemini", attempts: 2, fallbackUsed: true, failureCode: null });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).model).toBe("fallback-model");
  });

  it("does not try an implicit provider when no fallback is configured", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("unavailable"));
    vi.stubGlobal("fetch", fetchMock);

    const error = await invokeConfiguredLLM({
      ...settings,
      routing: { ...settings.routing, text: { provider: "nvidia_nim", model: "primary-model" } },
    }, "text", { model: "unused-model", messages: [] }).catch(error => error);
    expect(error.telemetry).toEqual({ capability: "text", provider: null, attempts: 1, fallbackUsed: false, failureCode: "Error" });
    expect(error.message).toContain("tentativas: nvidia_nim:Error");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["text", "text-fallback"],
    ["vision", "vision-fallback"],
    ["audio", "audio-fallback"],
    ["document", "document-fallback"],
  ] as const)("uses the explicit fallback for %s", async (capability, fallbackModel) => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("primary unavailable"))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        model: fallbackModel,
        choices: [{ message: { content: `fallback-${capability}` } }],
      }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

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
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).model).toBe(fallbackModel);
  });

  it.each(["text", "vision", "audio", "document"] as const)(
    "fails closed with bounded telemetry when %s has no available provider",
    async capability => {
      const fetchMock = vi.fn().mockRejectedValue(new Error("provider offline"));
      vi.stubGlobal("fetch", fetchMock);

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
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  );
});
