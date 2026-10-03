import { describe, expect, it } from "vitest";
import {
  getOnboardingStepIndex,
  isSameOnboardingDraft,
  onboardingStepIds,
} from "./onboarding-progress";

describe("onboarding progress helpers", () => {
  it("maps persisted steps to the wizard and rejects unknown values", () => {
    expect(getOnboardingStepIndex("identity")).toBe(0);
    expect(getOnboardingStepIndex("activation")).toBe(onboardingStepIds.length - 1);
    expect(getOnboardingStepIndex("legacy-step")).toBeNull();
    expect(getOnboardingStepIndex(undefined)).toBeNull();
  });

  it("only considers an autosave current when it matches the exact current draft", () => {
    const saved = { name: "Forte", faq: "A" };
    expect(isSameOnboardingDraft(saved, { ...saved })).toBe(true);
    expect(isSameOnboardingDraft(saved, { ...saved, faq: "B" })).toBe(false);
  });
});
