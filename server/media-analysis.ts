import {
  invokeConfiguredLLM,
  type AgentProviderSettings,
  type LLMInvocationTelemetry,
} from "./llm-providers";
import type { Message } from "./_core/llm";

export type MediaAnalysisCapability = "vision" | "document";

export type MediaAnalysisResult = {
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

export async function analyzeMedia(
  settings: AgentProviderSettings,
  input: {
    capability: MediaAnalysisCapability;
    mediaUrl: string;
    mimeType?: string;
    model?: string;
  }
): Promise<MediaAnalysisResult> {
  const isVision = input.capability === "vision";
  const instruction = isVision
    ? "Analise a imagem para atendimento comercial. Extraia texto legível, descreva somente elementos relevantes para o pedido do cliente e sinalize incerteza. Retorne fatos objetivos, sem inventar detalhes."
    : "Analise o documento para atendimento comercial. Extraia texto e dados relevantes ao pedido do cliente, preserve números e datas, e sinalize trechos ilegíveis. Retorne fatos objetivos, sem inventar detalhes.";
  const content: Message["content"] = isVision
    ? [
        { type: "text", text: instruction },
        { type: "image_url", image_url: { url: input.mediaUrl, detail: "auto" } },
      ]
    : [
        { type: "text", text: instruction },
        {
          type: "file_url",
          file_url: {
            url: input.mediaUrl,
            ...(input.mimeType
              ? {
                  mime_type: input.mimeType as
                    | "application/pdf"
                    | "audio/mpeg"
                    | "audio/wav"
                    | "audio/ogg"
                    | "audio/webm"
                    | "audio/aac"
                    | "audio/x-wav"
                    | "audio/mp4"
                    | "video/mp4",
                }
              : {}),
          },
        },
      ];
  const response = await invokeConfiguredLLM(settings, input.capability, {
    model: input.model,
    messages: [{ role: "user", content }],
    maxTokens: 1_800,
  });
  const text = textFromContent(response.choices[0]?.message.content);
  if (!text) throw new Error(`${input.capability}_analysis_empty`);
  return { text: text.slice(0, 16_000), telemetry: response.telemetry };
}
