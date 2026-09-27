import { invokeLLM } from "./_core/llm";

export const onboardingStructuredStepKeys = [
  "identity",
  "offering",
  "operations",
  "guardrails",
  "voice",
] as const;

export type OnboardingStructuredStepKey =
  (typeof onboardingStructuredStepKeys)[number];

export const onboardingStepFields: Record<OnboardingStructuredStepKey, string[]> = {
  identity: ["businessName", "segment", "description"],
  offering: ["services"],
  operations: ["serviceArea", "businessHours"],
  guardrails: ["forbiddenWords", "humanHandoffRules"],
  voice: ["toneOfVoice", "faq", "cancellationPolicy", "qualificationRules"],
};

export type OnboardingStructuredProposal = {
  stepKey: OnboardingStructuredStepKey;
  answer: Record<string, string>;
  missing: string[];
  conflicts: string[];
  confidence: number;
};

const allFields = [
  "businessName",
  "segment",
  "description",
  "services",
  "serviceArea",
  "businessHours",
  "toneOfVoice",
  "forbiddenWords",
  "humanHandoffRules",
  "faq",
  "cancellationPolicy",
  "qualificationRules",
] as const;

const proposalSchema = {
  type: "object",
  properties: {
    values: {
      type: "object",
      properties: Object.fromEntries(
        allFields.map(field => [field, { type: "string" }])
      ),
      required: [...allFields],
      additionalProperties: false,
    },
    missing: { type: "array", items: { type: "string" } },
    conflicts: { type: "array", items: { type: "string" } },
    confidence: { type: "integer", minimum: 0, maximum: 100 },
  },
  required: ["values", "missing", "conflicts", "confidence"],
  additionalProperties: false,
};

function responseText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((part): part is { type: "text"; text: string } =>
        Boolean(part && typeof part === "object" && "text" in part && typeof part.text === "string")
      )
      .map(part => part.text)
      .join("\n");
  }
  return "";
}

export function normalizeOnboardingStructuredProposal(
  stepKey: OnboardingStructuredStepKey,
  value: unknown
): OnboardingStructuredProposal {
  if (!value || typeof value !== "object") throw new Error("ONBOARDING_PROPOSAL_INVALID");
  const raw = value as Record<string, unknown>;
  const rawValues = raw.values;
  if (!rawValues || typeof rawValues !== "object") throw new Error("ONBOARDING_PROPOSAL_INVALID");
  const allowed = new Set(onboardingStepFields[stepKey]);
  const answer: Record<string, string> = {};
  for (const field of onboardingStepFields[stepKey]) {
    const candidate = (rawValues as Record<string, unknown>)[field];
    if (typeof candidate !== "string") throw new Error("ONBOARDING_PROPOSAL_INVALID");
    answer[field] = candidate.trim().slice(0, 8_000);
  }
  const missing = Array.isArray(raw.missing)
    ? raw.missing.filter(item => typeof item === "string" && allowed.has(item)).slice(0, 40)
    : [];
  const conflicts = Array.isArray(raw.conflicts)
    ? raw.conflicts.filter(item => typeof item === "string" && item.trim()).map(item => item.trim().slice(0, 160)).slice(0, 40)
    : [];
  const confidence = Number(raw.confidence);
  if (!Number.isInteger(confidence) || confidence < 0 || confidence > 100)
    throw new Error("ONBOARDING_PROPOSAL_INVALID");
  const derivedMissing = onboardingStepFields[stepKey].filter(field => !answer[field]);
  return {
    stepKey,
    answer,
    missing: Array.from(new Set([...missing, ...derivedMissing])),
    conflicts,
    confidence,
  };
}

export async function extractOnboardingStructuredProposal(input: {
  stepKey: OnboardingStructuredStepKey;
  text: string;
  language?: string;
}) {
  const text = input.text.trim();
  if (!text) throw new Error("ONBOARDING_PROPOSAL_TEXT_REQUIRED");
  const fields = onboardingStepFields[input.stepKey].join(", ");
  const result = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `Você extrai um rascunho de onboarding para uma pequena empresa. Responda somente JSON conforme o schema. Extraia apenas fatos explícitos no texto; nunca invente preço, prazo, disponibilidade, serviço, política ou promessa. Para campos ausentes use string vazia e inclua o nome em missing. Para ambiguidade, contradição ou baixa precisão, inclua uma descrição curta em conflicts. Os campos permitidos neste bloco são: ${fields}. O resultado é sempre um rascunho que exige revisão humana e nunca deve ser publicado automaticamente.`,
      },
      {
        role: "user",
        content: `Bloco: ${input.stepKey}\nIdioma: ${input.language ?? "pt-BR"}\nTexto corrigido pelo operador:\n${text.slice(0, 12_000)}`,
      },
    ],
    outputSchema: {
      name: "onboarding_structured_proposal",
      strict: true,
      schema: proposalSchema,
    },
    maxTokens: 2_000,
  });
  const content = responseText(result.choices[0]?.message?.content);
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("ONBOARDING_PROPOSAL_INVALID");
  }
  return normalizeOnboardingStructuredProposal(input.stepKey, parsed);
}
