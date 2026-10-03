import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeMedia } from "./media-analysis";
import type { AgentProviderSettings } from "./llm-providers";

const settings: AgentProviderSettings = {
  providers: {
    nvidia_nim: { enabled: false, baseUrl: "", apiKey: "" },
    google_gemini: { enabled: true, baseUrl: "https://media.example/v1", apiKey: "media-key" },
    openai_compatible: { enabled: false, baseUrl: "", apiKey: "" },
  },
  routing: {
    text: { provider: "google_gemini", model: "text-model" },
    vision: { provider: "google_gemini", model: "vision-model" },
    audio: { provider: "google_gemini", model: "audio-model" },
    document: { provider: "google_gemini", model: "document-model" },
  },
};

afterEach(() => vi.unstubAllGlobals());

describe("multimodal media analysis", () => {
  it.each([
    ["vision", "image/jpeg", "Imagem contém um orçamento"],
    ["document", "application/pdf", "Total: R$ 250,00"],
  ] as const)("analyzes %s media and returns factual context", async (capability, mimeType, expected) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      model: `${capability}-model`,
      choices: [{ message: { content: expected } }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzeMedia(settings, {
      capability,
      mediaUrl: `https://private.example/${capability}`,
      mimeType,
    });

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(result.text).toBe(expected);
    expect(result.telemetry).toMatchObject({ capability, provider: "google_gemini", attempts: 1 });
    expect(payload.messages[0].content[1]).toMatchObject(
      capability === "vision"
        ? { type: "image_url", image_url: { url: `https://private.example/${capability}` } }
        : { type: "file_url", file_url: { url: `https://private.example/${capability}`, mime_type: mimeType } }
    );
  });
});
