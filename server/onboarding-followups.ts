export const onboardingFollowUpFieldKeys = {
  identity: ["businessName", "segment", "description"],
  offering: ["services"],
  operations: ["serviceArea", "businessHours"],
  guardrails: ["forbiddenWords", "humanHandoffRules"],
  voice: ["toneOfVoice", "faq", "cancellationPolicy", "qualificationRules"],
} as const;

export type OnboardingFollowUpStepKey = keyof typeof onboardingFollowUpFieldKeys;
export type OnboardingFollowUpField = (typeof onboardingFollowUpFieldKeys)[OnboardingFollowUpStepKey][number];

export const onboardingFollowUpFieldTitles: Record<string, string> = {
  businessName: "nome do negócio",
  segment: "segmento",
  description: "descrição do negócio",
  services: "serviços oferecidos",
  serviceArea: "área de atendimento",
  businessHours: "horários de atendimento",
  forbiddenWords: "palavras ou condutas proibidas",
  humanHandoffRules: "quando transferir para uma pessoa",
  toneOfVoice: "tom de voz",
  faq: "perguntas frequentes e respostas aprovadas",
  cancellationPolicy: "política de cancelamento",
  qualificationRules: "critérios de qualificação",
};

export function buildOnboardingMissingQuestion(field: string) {
  const title = onboardingFollowUpFieldTitles[field] ?? field;
  return `Qual informação aprovada devemos registrar sobre ${title}? Não invente: responda “decidir depois” se ainda não houver uma regra.`;
}

export function buildOnboardingConflictQuestion(conflict: string) {
  return `Qual versão deve valer para resolver esta ambiguidade: “${conflict}”? Informe a regra aprovada ou responda “decidir depois”.`;
}
