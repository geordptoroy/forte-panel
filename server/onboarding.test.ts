import { describe, expect, it } from "vitest";
import {
  buildOnboardingStepAnswers,
  getOnboardingChecklist,
  type OnboardingProfile,
} from "./db";

const completeProfile: OnboardingProfile = {
  businessName: "Clínica Vida Plena",
  segment: "clínica",
  description: "Atendimento clínico para adultos.",
  services: "Consulta — 60 min — R$ 250",
  serviceArea: "São Paulo, zona sul",
  businessHours: "Segunda a sexta, 8h às 18h",
  toneOfVoice: "Acolhedor e direto",
  forbiddenWords: "Não prometer diagnóstico ou resultado.",
  faq: "Convênio: confirmar com a recepção.",
  cancellationPolicy: "Reagendamento com 24h de antecedência.",
  humanHandoffRules: "Reclamação, risco ou pedido de humano.",
  qualificationRules: "Identificar serviço e urgência.",
};

describe("onboarding checklist", () => {
  it("fails closed when required business facts are missing", () => {
    const checklist = getOnboardingChecklist({ ...completeProfile, services: "" }, false);
    expect(checklist.requiredComplete).toBe(false);
    expect(checklist.readyToPublish).toBe(false);
    expect(checklist.nextStep?.id).toBe("offering");
  });

  it("allows publication only after required facts are complete", () => {
    const draft = getOnboardingChecklist(completeProfile, false);
    expect(draft.requiredComplete).toBe(true);
    expect(draft.readyToPublish).toBe(true);
    expect(draft.nextStep?.id).toBe("publication");

    const published = getOnboardingChecklist(completeProfile, true);
    expect(published.completionPercent).toBe(100);
    expect(published.nextStep).toBeNull();
  });

  it("maps the profile into stable, block-scoped answers", () => {
    const answers = buildOnboardingStepAnswers(completeProfile);
    expect(answers.map(answer => answer.stepKey)).toEqual([
      "identity",
      "offering",
      "operations",
      "guardrails",
      "voice",
    ]);
    expect(answers[0].answer).toMatchObject({ businessName: "Clínica Vida Plena" });
    expect(answers[2].answer).toMatchObject({ businessHours: "Segunda a sexta, 8h às 18h" });
    expect(answers[0]).toMatchObject({ source: "human_form", confidence: 100, missing: [], conflicts: [] });
    expect(buildOnboardingStepAnswers({ ...completeProfile, faq: "" }).find(answer => answer.stepKey === "voice"))
      .toMatchObject({ missing: ["faq"], source: "human_form" });
  });
});
