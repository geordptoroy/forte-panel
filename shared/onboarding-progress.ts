export const onboardingStepIds = [
  "identity",
  "offering",
  "operations",
  "guardrails",
  "review",
  "activation",
] as const;

export type OnboardingStepId = (typeof onboardingStepIds)[number];

export function getOnboardingStepIndex(step: unknown): number | null {
  if (typeof step !== "string") return null;
  const index = (onboardingStepIds as readonly string[]).indexOf(step);
  return index >= 0 ? index : null;
}

export function isSameOnboardingDraft<T>(left: T, right: T): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
