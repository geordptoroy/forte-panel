import { beforeEach, describe, expect, it, vi } from "vitest";

const assertOnboardingSourceConsent = vi.fn();

vi.mock("./db", () => ({
  assertOnboardingSourceConsent,
}));

describe("workspace transcription consent gate", () => {
  beforeEach(() => {
    assertOnboardingSourceConsent.mockReset();
  });

  it("fails closed without contacting the transcription provider", async () => {
    assertOnboardingSourceConsent.mockRejectedValue(new Error("ONBOARDING_SOURCE_CONSENT_REQUIRED:transcription"));
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { transcribeAudioForWorkspace } = await import("./_core/voiceTranscription");

    const result = await transcribeAudioForWorkspace(101, { audioUrl: "https://example.invalid/audio.ogg" });

    expect(result).toMatchObject({ code: "CONSENT_REQUIRED" });
    expect(assertOnboardingSourceConsent).toHaveBeenCalledWith(101, "transcription");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("does not disguise infrastructure failures as a granted consent", async () => {
    assertOnboardingSourceConsent.mockRejectedValue(new Error("DATABASE_UNAVAILABLE"));
    const { transcribeAudioForWorkspace } = await import("./_core/voiceTranscription");

    const result = await transcribeAudioForWorkspace(101, { audioUrl: "https://example.invalid/audio.ogg" });

    expect(result).toMatchObject({ code: "CONSENT_REQUIRED", details: "Consent verification failed" });
  });
});
