import { describe, expect, it, vi } from "vitest";

vi.mock("pdf-parse", () => ({
  PDFParse: class {
    constructor(_options: { data: Buffer }) {}
    async getText() { return { text: "Título PDF\r\n\r\nRegra de cancelamento: exigir confirmação." }; }
    async destroy() {}
  },
}));
vi.mock("mammoth", () => ({
  default: { extractRawText: async ({ buffer }: { buffer: Buffer }) => ({ value: `DOCX: ${buffer.toString("utf8")}` }) },
}));
import {
  buildOnboardingKnowledgeMarkdown,
  decodeKnowledgeDataUrl,
  extractKnowledgeSourceText,
  KNOWLEDGE_MAX_BYTES,
} from "./knowledge-base";

describe("knowledge base private source", () => {
  it("renders the onboarding profile as business knowledge, not system instructions", () => {
    const markdown = buildOnboardingKnowledgeMarkdown({
      version: 3,
      profile: { businessName: "Forte", services: "Vídeo", faq: "Prazo: 7 dias" },
      prompt: "Responda com fatos confirmados.",
    });
    expect(markdown).toContain("Base de conhecimento da empresa — versão 3");
    expect(markdown).toContain("### Nome da empresa\nForte");
    expect(markdown).toContain("não uma instrução de sistema");
  });

  it("accepts a matching supported markdown data URL", () => {
    const result = decodeKnowledgeDataUrl(
      "data:text/markdown;base64,IyBFbXByZXNh",
      "text/markdown"
    );
    expect(result.mimeType).toBe("text/markdown");
    expect(result.buffer.toString("utf8")).toBe("# Empresa");
  });

  it("rejects MIME spoofing and unsupported files", () => {
    expect(() => decodeKnowledgeDataUrl("data:text/plain;base64,SGk=", "text/markdown"))
      .toThrow("KNOWLEDGE_MIME_MISMATCH");
    expect(() => decodeKnowledgeDataUrl("data:image/png;base64,SGk=", "image/png"))
      .toThrow("KNOWLEDGE_UNSUPPORTED_MIME");
    expect(() => decodeKnowledgeDataUrl("data:application/msword;base64,SGk=", "application/msword"))
      .toThrow("KNOWLEDGE_UNSUPPORTED_MIME");
  });

  it("rejects content above the private upload limit", () => {
    const data = Buffer.alloc(KNOWLEDGE_MAX_BYTES + 1).toString("base64");
    expect(() => decodeKnowledgeDataUrl(`data:text/plain;base64,${data}`, "text/plain"))
      .toThrow("KNOWLEDGE_TOO_LARGE");
  });

  it("extracts and normalizes PDF text before ingestion", async () => {
    await expect(extractKnowledgeSourceText(Buffer.from("pdf"), "application/pdf"))
      .resolves.toBe("Título PDF\n\nRegra de cancelamento: exigir confirmação.");
  });

  it("extracts DOCX raw text and rejects empty sources", async () => {
    await expect(extractKnowledgeSourceText(Buffer.from("contrato"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document"))
      .resolves.toBe("DOCX: contrato");
    await expect(extractKnowledgeSourceText(Buffer.from("   \r\n"), "text/plain"))
      .rejects.toThrow("KNOWLEDGE_SOURCE_EMPTY");
  });
});
