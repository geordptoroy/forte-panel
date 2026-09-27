import { describe, expect, it } from "vitest";
import {
  buildOnboardingConflictQuestion,
  buildOnboardingMissingQuestion,
  onboardingFollowUpFieldKeys,
} from "./onboarding-followups";

describe("onboarding follow-up questions", () => {
  it("creates a grounded question for a missing field", () => {
    const question = buildOnboardingMissingQuestion("businessHours");
    expect(question).toContain("horários de atendimento");
    expect(question).toContain("decidir depois");
  });

  it("creates an explicit question for a conflict without resolving it silently", () => {
    const question = buildOnboardingConflictQuestion("atende somente no centro ou em toda a cidade?");
    expect(question).toContain("Qual versão deve valer");
    expect(question).toContain("atende somente no centro");
  });

  it("keeps field catalog aligned with onboarding blocks", () => {
    expect(onboardingFollowUpFieldKeys.identity).toContain("businessName");
    expect(onboardingFollowUpFieldKeys.guardrails).toContain("humanHandoffRules");
  });
});
