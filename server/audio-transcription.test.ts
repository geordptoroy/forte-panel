import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

afterEach(() => {
  vi.unstubAllEnvs();
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

  it("sends validated private audio as multipart to the configured LocalAI Whisper endpoint", async () => {
    vi.stubEnv("LOCALAI_BASE_URL", "http://local-ai:8080/v1");
    const localSettings: AgentProviderSettings = {
      ...settings,
      providers: {
        ...settings.providers,
        openai_compatible: { enabled: true, baseUrl: "http://local-ai:8080/v1", apiKey: "local-key" },
      },
      routing: {
        ...settings.routing,
        audio: { provider: "openai_compatible", model: "whisper-base" },
      },
    };
    const audioBytes = Buffer.from("synthetic wav payload");
    const dataUrl = `data:audio/wav;base64,${audioBytes.toString("base64")}`;
    const fetchMock = llmNetwork.fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ text: "  Olá, quero agendar.  " }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const result = await transcribeAudio(localSettings, {
      mediaUrl: dataUrl,
      mimeType: "audio/wav",
    });

    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url.toString()).toBe("http://local-ai:8080/v1/audio/transcriptions");
    expect(options.headers.authorization).toBe("Bearer local-key");
    expect(options.redirect).toBe("error");
    expect(options.body).toHaveProperty("get");
    const form = options.body as unknown as FormData;
    expect(form.get("model")).toBe("whisper-base");
    expect(form.get("language")).toBe("pt");
    const file = form.get("file") as File;
    expect(file.name).toBe("audio.wav");
    expect(file.type).toBe("audio/wav");
    expect(Buffer.from(await file.arrayBuffer())).toEqual(audioBytes);
    expect(result.text).toBe("Olá, quero agendar.");
    expect(result.telemetry).toMatchObject({ capability: "audio", provider: "openai_compatible" });
    expect(llmNetwork.lookup).not.toHaveBeenCalled();
  });

  it("does not fetch an arbitrary signed URL for a LocalAI transcription", async () => {
    vi.stubEnv("LOCALAI_BASE_URL", "http://local-ai:8080/v1");
    const localSettings: AgentProviderSettings = {
      ...settings,
      providers: {
        ...settings.providers,
        openai_compatible: { enabled: true, baseUrl: "http://local-ai:8080/v1", apiKey: "local-key" },
      },
      routing: {
        ...settings.routing,
        audio: { provider: "openai_compatible", model: "whisper-base" },
      },
    };

    await expect(transcribeAudio(localSettings, {
      mediaUrl: "https://untrusted.example/audio.wav",
      mimeType: "audio/wav",
    })).rejects.toThrow("audio_media_unavailable_or_unsupported");
    expect(llmNetwork.fetch).not.toHaveBeenCalled();
  });
});
