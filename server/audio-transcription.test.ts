import { afterEach, describe, expect, it, vi } from "vitest";
import { transcribeAudio } from "./audio-transcription";
import type { AgentProviderSettings } from "./llm-providers";

const settings: AgentProviderSettings = {
  providers: {
    nvidia_nim: { enabled: false, baseUrl: "", apiKey: "" },
    google_gemini: {
      enabled: true,
      baseUrl: "https://audio.example/v1",
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

afterEach(() => vi.unstubAllGlobals());

describe("audio transcription", () => {
  it("sends private media to the audio capability and returns only transcript text", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "audio-model",
          choices: [{ message: { content: "  Quero agendar amanhã.  " } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

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
