import { describe, expect, it } from "vitest";
import {
  normalizeOnboardingSimulationResponses,
  onboardingReviewExamples,
} from "./onboarding-simulation";

const validResponses = {
  examples: onboardingReviewExamples.map(example => ({
    key: example.key,
    suggestedReply: `Vou verificar essa informação com a equipe antes de confirmar.`,
    basisNote: "A informação não está disponível nesta simulação.",
  })),
};

describe("onboarding simulation response normalization", () => {
  it("keeps the question, expected behavior, and safety flags application-defined", () => {
    const normalized = normalizeOnboardingSimulationResponses(validResponses);
    expect(normalized.examples).toHaveLength(3);
    expect(normalized.examples[0]).toMatchObject({
      key: "unknown_service",
      customerMessage: onboardingReviewExamples[0].customerMessage,
      expectedBehavior: onboardingReviewExamples[0].expectedBehavior,
      requiresHuman: true,
      requiresLiveAgenda: false,
      suggestedReply: validResponses.examples[0].suggestedReply,
    });
  });

  it("rejects missing, duplicate, unknown, or empty examples", () => {
    expect(() => normalizeOnboardingSimulationResponses({ examples: validResponses.examples.slice(1) })).toThrow("ONBOARDING_SIMULATION_INVALID");
    expect(() => normalizeOnboardingSimulationResponses({ examples: [validResponses.examples[0], validResponses.examples[0], validResponses.examples[2]] })).toThrow("ONBOARDING_SIMULATION_INVALID");
    expect(() => normalizeOnboardingSimulationResponses({ examples: validResponses.examples.map((item, index) => index ? item : { ...item, key: "unexpected" }) })).toThrow("ONBOARDING_SIMULATION_INVALID");
    expect(() => normalizeOnboardingSimulationResponses({ examples: validResponses.examples.map((item, index) => index ? item : { ...item, suggestedReply: " " }) })).toThrow("ONBOARDING_SIMULATION_INVALID");
  });

  it("bounds generated text before it reaches the review UI", () => {
    const normalized = normalizeOnboardingSimulationResponses({
      examples: validResponses.examples.map(item => ({
        ...item,
        suggestedReply: "R".repeat(2_000),
        basisNote: "B".repeat(800),
      })),
    });
    expect(normalized.examples[0].suggestedReply).toHaveLength(1_200);
    expect(normalized.examples[0].basisNote).toHaveLength(400);
  });
});
