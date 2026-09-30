export const onboardingReviewExamples = [
  {
    key: "unknown_service",
    title: "Serviço ou preço fora do catálogo",
    customerMessage: "Vocês fazem um serviço que não aparece no catálogo? Quanto custa?",
    expectedBehavior: "Não inventar serviço, preço ou duração; oferecer confirmar com a equipe.",
    requiresHuman: true,
    requiresLiveAgenda: false,
  },
  {
    key: "specific_time",
    title: "Pedido de horário específico",
    customerMessage: "Tem horário amanhã às 19h? Pode confirmar para mim?",
    expectedBehavior: "Consultar a agenda real antes de sugerir ou confirmar qualquer horário.",
    requiresHuman: false,
    requiresLiveAgenda: true,
  },
  {
    key: "human_handoff",
    title: "Reclamação ou pedido de uma pessoa",
    customerMessage: "Tive um problema e quero falar com alguém da equipe agora.",
    expectedBehavior: "Respeitar o pedido, seguir a regra de transferência e não discutir com o cliente.",
    requiresHuman: true,
    requiresLiveAgenda: false,
  },
] as const;

export type OnboardingReviewExampleKey = (typeof onboardingReviewExamples)[number]["key"];
export type OnboardingSimulationExample = (typeof onboardingReviewExamples)[number] & {
  suggestedReply: string;
  basisNote: string;
};
export type OnboardingSimulationResult = {
  examples: OnboardingSimulationExample[];
  profileFingerprint: string;
};

function boundedText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

/** Normalize generated replies while keeping prompts and expected behavior application-defined. */
export function normalizeOnboardingSimulationResponses(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("ONBOARDING_SIMULATION_INVALID");
  const rawExamples = (value as Record<string, unknown>).examples;
  if (!Array.isArray(rawExamples) || rawExamples.length !== onboardingReviewExamples.length)
    throw new Error("ONBOARDING_SIMULATION_INVALID");

  const byKey = new Map<string, Record<string, unknown>>();
  for (const raw of rawExamples) {
    if (!raw || typeof raw !== "object") throw new Error("ONBOARDING_SIMULATION_INVALID");
    const item = raw as Record<string, unknown>;
    if (typeof item.key !== "string" || byKey.has(item.key))
      throw new Error("ONBOARDING_SIMULATION_INVALID");
    byKey.set(item.key, item);
  }

  const examples = onboardingReviewExamples.map(example => {
    const raw = byKey.get(example.key);
    if (!raw) throw new Error("ONBOARDING_SIMULATION_INVALID");
    const suggestedReply = boundedText(raw.suggestedReply, 1_200);
    const basisNote = boundedText(raw.basisNote, 400);
    if (!suggestedReply || !basisNote) throw new Error("ONBOARDING_SIMULATION_INVALID");
    return { ...example, suggestedReply, basisNote };
  });
  return { examples };
}
