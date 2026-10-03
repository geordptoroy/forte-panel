import { beforeEach, describe, expect, it, vi } from "vitest";

const llmNetwork = vi.hoisted(() => ({
  fetch: vi.fn(),
  lookup: vi.fn(),
}));
vi.mock("node:dns/promises", () => ({ lookup: llmNetwork.lookup }));
vi.mock("undici", () => ({
  fetch: llmNetwork.fetch,
  Agent: class MockAgent {
    close = vi.fn(async () => undefined);
    constructor(_options: unknown) {}
  },
}));

import { analyzeMedia } from "./media-analysis";
import type { AgentProviderSettings } from "./llm-providers";

const settings: AgentProviderSettings = {
  providers: {
    nvidia_nim: { enabled: false, baseUrl: "", apiKey: "" },
    google_gemini: {
      enabled: true,
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      apiKey: "media-key",
    },
    openai_compatible: { enabled: false, baseUrl: "", apiKey: "" },
  },
  routing: {
    text: { provider: "google_gemini", model: "text-model" },
    vision: { provider: "google_gemini", model: "vision-model" },
    audio: { provider: "google_gemini", model: "audio-model" },
    document: { provider: "google_gemini", model: "document-model" },
  },
};

beforeEach(() => {
  llmNetwork.fetch.mockReset();
  llmNetwork.lookup.mockReset().mockResolvedValue([
    { address: "8.8.8.8", family: 4 },
  ]);
});

describe("multimodal media analysis", () => {
  it.each([
    ["vision", "image/jpeg", "Imagem contém um orçamento"],
    ["document", "application/pdf", "Total: R$ 250,00"],
  ] as const)("analyzes %s media and returns factual context", async (capability, mimeType, expected) => {
    const fetchMock = llmNetwork.fetch.mockResolvedValue(new Response(JSON.stringify({
      model: `${capability}-model`,
      choices: [{ message: { content: expected } }],
    }), { status: 200, headers: { "content-type": "application/json" } }));

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
