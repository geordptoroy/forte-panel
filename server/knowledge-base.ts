import crypto from "node:crypto";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { storagePut } from "./storage";

export const KNOWLEDGE_MAX_BYTES = 25 * 1024 * 1024;
export const KNOWLEDGE_MAX_DATA_URL_CHARS = Math.ceil((KNOWLEDGE_MAX_BYTES * 4) / 3) + 512;
export const KNOWLEDGE_MAX_REQUEST_BYTES = KNOWLEDGE_MAX_DATA_URL_CHARS + 64 * 1024;

const allowedMimeTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "text/csv",
]);

export type KnowledgeSource = "onboarding_generated" | "manual_upload";

export function buildOnboardingKnowledgeMarkdown(input: {
  profile: Record<string, string>;
  prompt: string;
  version: number;
}) {
  const fieldLabels: Record<string, string> = {
    businessName: "Nome da empresa",
    segment: "Segmento",
    description: "Descrição",
    services: "Serviços e produtos",
    serviceArea: "Área de atendimento",
    businessHours: "Horário de funcionamento",
    toneOfVoice: "Tom de voz",
    forbiddenWords: "Palavras e promessas proibidas",
    faq: "Perguntas frequentes",
    cancellationPolicy: "Política de cancelamento",
    humanHandoffRules: "Regras de encaminhamento humano",
    qualificationRules: "Regras de qualificação",
  };
  const profileSections = Object.entries(fieldLabels)
    .map(([key, label]) => `### ${label}\n${input.profile[key]?.trim() || "Não informado."}`)
    .join("\n\n");
  return [
    `# Base de conhecimento da empresa — versão ${input.version}`,
    "",
    "> Documento gerado a partir do onboarding gamificado. O conteúdo é uma fonte de referência do negócio, não uma instrução de sistema.",
    "",
    "## Perfil confirmado",
    profileSections,
    "",
    "## Prompt de negócio publicado",
    input.prompt.trim(),
  ].join("\n").trim();
}

export function decodeKnowledgeDataUrl(dataUrl: string, declaredMimeType: string) {
  const match = /^data:([^;,]+);base64,([a-z0-9+/=\r\n]+)$/i.exec(dataUrl.trim());
  if (!match) throw new Error("KNOWLEDGE_INVALID_DATA_URL");
  const mimeType = match[1].trim().toLowerCase();
  if (mimeType !== declaredMimeType.trim().toLowerCase()) throw new Error("KNOWLEDGE_MIME_MISMATCH");
  if (!allowedMimeTypes.has(mimeType)) throw new Error("KNOWLEDGE_UNSUPPORTED_MIME");
  const buffer = Buffer.from(match[2].replace(/[\r\n]/g, ""), "base64");
  if (buffer.length === 0 || buffer.length > KNOWLEDGE_MAX_BYTES) throw new Error("KNOWLEDGE_TOO_LARGE");
  return { buffer, mimeType };
}

function normalizeExtractedText(value: string) {
  return value.replace(/\u0000/g, "").replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
}

export async function extractKnowledgeSourceText(buffer: Buffer, mimeType: string) {
  const normalizedMime = mimeType.trim().toLowerCase().split(";")[0];
  let text = "";
  if (normalizedMime === "application/pdf") {
    const parser = new PDFParse({ data: buffer });
    try {
      text = (await parser.getText()).text;
    } finally {
      await parser.destroy();
    }
  } else if (normalizedMime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    text = (await mammoth.extractRawText({ buffer })).value;
  } else if (["text/plain", "text/markdown", "text/csv"].includes(normalizedMime)) {
    text = buffer.toString("utf8");
  } else {
    throw new Error("KNOWLEDGE_UNSUPPORTED_MIME");
  }
  const extracted = normalizeExtractedText(text);
  if (!extracted) throw new Error("KNOWLEDGE_SOURCE_EMPTY");
  if (extracted.length > 2_000_000) throw new Error("KNOWLEDGE_SOURCE_TEXT_INVALID");
  return extracted;
}

function safeFileName(fileName: string) {
  return fileName.replace(/[\\/]/g, "_").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-160) || "document";
}

export async function storePrivateKnowledgeSource(input: {
  workspaceId: number;
  source: KnowledgeSource;
  title: string;
  fileName: string;
  mimeType: string;
  data: Buffer;
}) {
  if (!Number.isInteger(input.workspaceId) || input.workspaceId <= 0) throw new Error("KNOWLEDGE_WORKSPACE_INVALID");
  if (!input.title.trim() || input.title.trim().length > 240) throw new Error("KNOWLEDGE_TITLE_INVALID");
  if (input.data.length === 0 || input.data.length > KNOWLEDGE_MAX_BYTES) throw new Error("KNOWLEDGE_TOO_LARGE");
  const mimeType = input.mimeType.trim().toLowerCase().split(";")[0];
  if (!allowedMimeTypes.has(mimeType)) throw new Error("KNOWLEDGE_UNSUPPORTED_MIME");
  const sha256 = crypto.createHash("sha256").update(input.data).digest("hex");
  const key = `workspaces/${input.workspaceId}/knowledge/${crypto.randomUUID()}/${safeFileName(input.fileName)}`;
  const stored = await storagePut(key, input.data, mimeType);
  return {
    title: input.title.trim(),
    source: input.source,
    originalFileName: safeFileName(input.fileName),
    mimeType,
    sizeBytes: input.data.length,
    sha256,
    storageKey: stored.key,
  };
}

export async function storeGeneratedKnowledgeDocument(input: {
  workspaceId: number;
  title: string;
  markdown: string;
}) {
  const markdown = input.markdown.trim();
  if (!markdown || markdown.length > 2_000_000) throw new Error("KNOWLEDGE_SOURCE_TEXT_INVALID");
  return storePrivateKnowledgeSource({
    workspaceId: input.workspaceId,
    source: "onboarding_generated",
    title: input.title,
    fileName: "empresa-onboarding.md",
    mimeType: "text/markdown",
    data: Buffer.from(markdown, "utf8"),
  });
}
