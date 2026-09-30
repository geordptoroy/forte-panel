import { createHash } from "node:crypto";
import type { OnboardingProfile } from "./db";

const onboardingProfileFields: (keyof OnboardingProfile)[] = [
  "businessName",
  "segment",
  "description",
  "services",
  "serviceArea",
  "businessHours",
  "toneOfVoice",
  "forbiddenWords",
  "faq",
  "cancellationPolicy",
  "humanHandoffRules",
  "qualificationRules",
];

/** Stable fingerprint for the exact onboarding profile that will be published. */
export function fingerprintOnboardingProfile(profile: OnboardingProfile) {
  const normalized = onboardingProfileFields.map(field => [
    field,
    typeof profile[field] === "string" ? profile[field].trim() : "",
  ]);
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}
