import { describe, expect, it } from "vitest";
import {
  buildPasswordResetUrl,
  describeEmailDelivery,
  getEmailDeliveryConfig,
  preparePasswordResetEmail,
} from "./_core/email";

describe("password reset email adapter", () => {
  it("stays disabled by default and never sends from the preparation layer", () => {
    expect(describeEmailDelivery()).toBe("disabled");
    expect(getEmailDeliveryConfig().ready).toBe(false);
  });

  it("builds a reset URL without exposing a token outside the prepared payload", () => {
    const token = "token-with+reserved/chars";
    const url = buildPasswordResetUrl(token, "https://panel.example.com/");
    expect(url).toBe(
      "https://panel.example.com/reset-password?token=token-with%2Breserved%2Fchars"
    );
    const message = preparePasswordResetEmail({
      to: "owner@example.com",
      name: "Owner",
      token,
      expiresAt: new Date("2026-09-27T13:00:00Z"),
    }, { ...getEmailDeliveryConfig(), appUrl: "https://panel.example.com" });
    expect(message.text).toContain(url);
    expect(message.subject).toContain("Forte Panel");
  });
});
