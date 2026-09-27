import { describe, expect, it } from "vitest";
import {
  buildOnboardingAudioStorageKey,
  decodeOnboardingAudioBase64,
  ONBOARDING_AUDIO_MAX_BYTES,
  sha256ForOnboardingAudio,
  validateOnboardingAudioMetadata,
} from "./onboarding-audio";

describe("onboarding audio boundary", () => {
  it("accepts supported browser audio MIME parameters and bounds duration", () => {
    expect(
      validateOnboardingAudioMetadata({
        mimeType: "audio/webm;codecs=opus",
        durationMs: 20_000,
      })
    ).toMatchObject({ valid: true, mimeType: "audio/webm" });
    expect(
      validateOnboardingAudioMetadata({
        mimeType: "audio/webm",
        durationMs: 120_001,
      }).valid
    ).toBe(false);
    expect(
      validateOnboardingAudioMetadata({ mimeType: "video/mp4" }).valid
    ).toBe(false);
  });

  it("decodes raw base64 and data URLs, but rejects mismatched or oversized audio", () => {
    const base64 = Buffer.from("audio-bytes").toString("base64");
    expect(decodeOnboardingAudioBase64(base64, "audio/webm").toString()).toBe(
      "audio-bytes"
    );
    expect(
      decodeOnboardingAudioBase64(
        `data:audio/webm;base64,${base64}`,
        "audio/webm"
      ).toString()
    ).toBe("audio-bytes");
    expect(() =>
      decodeOnboardingAudioBase64(
        `data:audio/mpeg;base64,${base64}`,
        "audio/webm"
      )
    ).toThrow("ONBOARDING_AUDIO_MIME_MISMATCH");
    const oversized = Buffer.alloc(ONBOARDING_AUDIO_MAX_BYTES + 1).toString(
      "base64"
    );
    expect(() => decodeOnboardingAudioBase64(oversized, "audio/webm")).toThrow(
      "ONBOARDING_AUDIO_TOO_LARGE"
    );
  });

  it("creates opaque workspace/session-scoped storage keys and stable hashes", () => {
    const key = buildOnboardingAudioStorageKey(42, 7, "audio/webm");
    expect(key).toMatch(
      /^workspaces\/42\/onboarding-audio\/7\/[0-9a-f-]+\.webm$/
    );
    expect(key).not.toContain("..");
    expect(sha256ForOnboardingAudio(Buffer.from("same-audio"))).toBe(
      sha256ForOnboardingAudio(Buffer.from("same-audio"))
    );
  });
});
