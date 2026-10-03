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

import { transcribeAudio } from "./audio-transcription";
import type { AgentProviderSettings } from "./llm-providers";

const settings: AgentProviderSettings = {
  providers: {
    nvidia_nim: { enabled: false, baseUrl: "", apiKey: "" },
    google_gemini: {
      enabled: true,
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      apiKey: "audio-key",
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

describe("audio transcription", () => {
  it("sends private media to the audio capability and returns only transcript text", async () => {
    const fetchMock = llmNetwork.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "audio-model",
          choices: [{ message: { content: "  Quero agendar amanhã.  " } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const result = await transcribeAudio(settings, {
      mediaUrl: "https://private.example/signed-audio",
      mimeType: "audio/ogg",
    });

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(result.text).toBe("Quero agendar amanhã.");
    expect(result.telemetry).toMatchObject({
      capability: "audio",
      provider: "google_gemini",
      attempts: 1,
    });
    expect(payload.messages[1].content[0].file_url).toMatchObject({
      url: "https://private.example/signed-audio",
      mime_type: "audio/ogg",
    });
    expect(payload.messages[0].content).toContain(
      "somente a transcrição literal"
    );
  });
});
