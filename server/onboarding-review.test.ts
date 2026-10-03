import { describe, expect, it } from "vitest";
import { fingerprintOnboardingProfile } from "./onboarding-review";
import type { OnboardingProfile } from "./db";

const profile: OnboardingProfile = {
  businessName: "Clínica Exemplo",
  segment: "saúde",
  description: "Atendimento por horário marcado",
  services: "Consulte o catálogo operacional",
  serviceArea: "São Paulo",
  businessHours: "Segunda a sexta, consulte agenda real",
  toneOfVoice: "claro e cordial",
  forbiddenWords: "Não prometer resultados",
  faq: "",
  cancellationPolicy: "Confirmar com a equipe",
  humanHandoffRules: "Transferir quando solicitado",
  qualificationRules: "Perguntar qual serviço",
};

describe("onboarding review fingerprint", () => {
  it("is stable for the same content and ignores outer whitespace", () => {
    expect(fingerprintOnboardingProfile(profile)).toBe(fingerprintOnboardingProfile({ ...profile }));
    expect(fingerprintOnboardingProfile(profile)).toBe(fingerprintOnboardingProfile({ ...profile, businessName: "  Clínica Exemplo  " }));
  });

  it("changes when any publish-relevant field changes", () => {
    expect(fingerprintOnboardingProfile(profile)).not.toBe(
      fingerprintOnboardingProfile({ ...profile, humanHandoffRules: "Transferir em reclamações" })
    );
  });
});
