import type { Message } from "./_core/llm";
import {
  invokeConfiguredLLM,
  type AgentProviderSettings,
  type LLMInvocationTelemetry,
} from "./llm-providers";

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
  input: { mediaUrl: string; mimeType?: string; model?: string }
): Promise<AudioTranscriptionResult> {
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
