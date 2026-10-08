import { describe, expect, it } from "vitest";
import { buildOnboardingKnowledgeMarkdown, extractKnowledgeSourceText } from "./knowledge-base";
import { chunkKnowledgeText } from "./knowledge-chunking";
import { buildKnowledgeContext } from "./native-agent";

describe("audio onboarding to RAG agent flow", () => {
  it("transforms an approved transcript into a retrievable agent context", async () => {
    const transcript = "Atendemos de segunda a sexta, das nove às dezoito horas. Nunca prometemos prazo sem consultar a agenda.";
    const markdown = buildOnboardingKnowledgeMarkdown({
      version: 3,
      profile: {
        businessName: "Clínica Forte",
        segment: "Saúde",
        description: "Atendimento particular.",
        services: "Avaliação inicial",
        serviceArea: "São Paulo",
        businessHours: transcript,
        toneOfVoice: "Claro e acolhedor",
        forbiddenWords: "Não prometer prazo sem consultar a agenda.",
        faq: "",
        cancellationPolicy: "Cancelamento com 24 horas.",
        humanHandoffRules: "Encaminhar dúvidas clínicas.",
        qualificationRules: "",
      },
      prompt: "Use a agenda real antes de confirmar qualquer horário.",
    });

    const extracted = await extractKnowledgeSourceText(Buffer.from(markdown, "utf8"), "text/markdown");
    const chunks = chunkKnowledgeText(extracted, { maxChars: 420, overlapChars: 60 });
    const critical = chunks.find(chunk => /agenda|prometemos prazo/i.test(chunk.text));

    expect(extracted).toContain("Atendemos de segunda a sexta");
    expect(chunks.length).toBeGreaterThan(1);
    expect(critical).toBeDefined();

    const context = buildKnowledgeContext([
      {
        text: critical!.text,
        heading: critical!.heading,
        similarity: 0.51,
        isCritical: true,
      },
      {
        text: "A empresa oferece avaliação inicial.",
        heading: "Serviços e produtos",
        similarity: 0.94,
        isCritical: false,
      },
    ]);

    const simulatedAgentResponse = context.includes("REGRA CRÍTICA")
      ? "Vou consultar a agenda real antes de confirmar o horário."
      : "Posso confirmar o horário.";

    expect(context.indexOf("REGRA CRÍTICA")).toBeGreaterThanOrEqual(0);
    expect(context.indexOf("REGRA CRÍTICA")).toBeLessThan(context.indexOf("A empresa oferece"));
    expect(simulatedAgentResponse).toContain("consultar a agenda real");
  });
});
