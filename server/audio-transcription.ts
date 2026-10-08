import type { Message } from "./_core/llm";
import {
  invokeConfiguredLocalAudioTranscription,
  invokeConfiguredLLM,
  type AgentProviderSettings,
  type LLMInvocationTelemetry,
} from "./llm-providers";
import { isConfiguredLocalAiTarget } from "./llm-url-security";
import { decodeMediaDataUrl } from "./media-storage";
import { storageRead } from "./storage";

export type AudioTranscriptionResult = {
  text: string;
  telemetry: LLMInvocationTelemetry;
};

function textFromContent(content: Message["content"] | undefined) {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (part): part is { type: "text"; text: string } =>
        typeof part !== "string" && part.type === "text"
    )
    .map(part => part.text)
    .join("\n")
    .trim();
}

export async function transcribeAudio(
  settings: AgentProviderSettings,
  input: { mediaUrl: string; mediaStorageKey?: string; mimeType?: string; model?: string; allowEmpty?: boolean }
): Promise<AudioTranscriptionResult> {
  const route = settings.routing.audio;
  const provider = settings.providers[route.provider];
  const baseUrl = route.baseUrl || provider?.baseUrl;
  if (baseUrl && isConfiguredLocalAiTarget(route.provider, baseUrl)) {
    try {
      const decoded = input.mediaUrl.startsWith("data:")
        ? decodeMediaDataUrl(input.mediaUrl)
        : null;
      const audio = input.mediaStorageKey
        ? await storageRead(input.mediaStorageKey)
        : decoded?.buffer;
      const mimeType = (input.mimeType || decoded?.mimeType || "").toLowerCase();
      const supportedMimeTypes = new Set([
        "audio/aac",
        "audio/mp4",
        "audio/mpeg",
        "audio/ogg",
        "audio/wav",
        "audio/webm",
        "audio/x-wav",
      ]);
      if (!audio || !supportedMimeTypes.has(mimeType))
        throw new Error("audio_media_unavailable_or_unsupported");
      const response = await invokeConfiguredLocalAudioTranscription(settings, {
        audio,
        mimeType,
        model: input.model,
      });
      if (!response.text && !input.allowEmpty) throw new Error("audio_transcription_empty");
      return { text: response.text, telemetry: response.telemetry };
    } catch (error) {
      const [fallback, ...remaining] = route.fallback ?? [];
      if (!fallback) throw error;
      const fallbackSettings: AgentProviderSettings = {
        ...settings,
        routing: {
          ...settings.routing,
          audio: { ...fallback, fallback: remaining },
        },
      };
      const result = await transcribeAudio(fallbackSettings, input);
      return {
        ...result,
        telemetry: {
          ...result.telemetry,
          attempts: result.telemetry.attempts + 1,
          fallbackUsed: true,
        },
      };
    }
  }

  const response = await invokeConfiguredLLM(settings, "audio", {
    model: input.model,
    messages: [
      {
        role: "system",
        content:
          "Transcreva o áudio recebido para português do Brasil. Retorne somente a transcrição literal, sem introdução, resumo ou comentários. Se não houver fala compreensível, retorne uma string vazia.",
      },
      {
        role: "user",
        content: [
          {
            type: "file_url",
            file_url: {
              url: input.mediaUrl,
              ...(input.mimeType
                ? {
                    mime_type: input.mimeType as
                      | "audio/mpeg"
                      | "audio/wav"
                      | "audio/ogg"
                      | "audio/webm"
                      | "audio/aac"
                      | "audio/x-wav"
                      | "audio/mp4",
                  }
                : {}),
            },
          },
        ],
      },
    ],
    maxTokens: 1_200,
  });
  const text = textFromContent(response.choices[0]?.message.content);
  if (!text) throw new Error("audio_transcription_empty");
  return { text: text.slice(0, 12_000), telemetry: response.telemetry };
}
