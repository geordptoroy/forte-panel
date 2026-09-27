import { describe, expect, it } from "vitest";
import {
  normalizeOnboardingStructuredProposal,
  onboardingStepFields,
} from "./onboarding-structured";

describe("onboarding structured proposals", () => {
  it("keeps only fields from the selected block and derives missing values", () => {
    const result = normalizeOnboardingStructuredProposal("identity", {
      values: {
        businessName: " Clínica Forte ",
        segment: "",
        description: "Atendimento local",
        services: "não deve entrar",
      },
      missing: ["segment", "services"],
      conflicts: ["nome ambíguo"],
      confidence: 72,
    });
    expect(result.answer).toEqual({
      businessName: "Clínica Forte",
      segment: "",
      description: "Atendimento local",
    });
    expect(result.missing).toEqual(["segment"]);
    expect(result.conflicts).toEqual(["nome ambíguo"]);
  });

  it("defines the exact allowed fields for every onboarding block", () => {
    expect(onboardingStepFields.offering).toEqual(["services"]);
    expect(onboardingStepFields.voice).toContain("qualificationRules");
  });

  it("fails closed when the model returns invalid confidence or values", () => {
    expect(() => normalizeOnboardingStructuredProposal("voice", {
      values: Object.fromEntries(onboardingStepFields.voice.map(field => [field, ""])),
      missing: [],
      conflicts: [],
      confidence: 101,
    })).toThrow("ONBOARDING_PROPOSAL_INVALID");
    expect(() => normalizeOnboardingStructuredProposal("voice", {
      values: { toneOfVoice: "ok" },
      missing: [],
      conflicts: [],
      confidence: 50,
    })).toThrow("ONBOARDING_PROPOSAL_INVALID");
  });
});
