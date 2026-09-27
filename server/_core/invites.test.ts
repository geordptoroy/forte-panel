import { describe, expect, it } from "vitest";
import {
  createInviteToken,
  hashInviteToken,
  isInviteExpired,
  normalizeInviteEmail,
} from "./invites";

describe("invite security helpers", () => {
  it("creates high-entropy tokens and stores only a deterministic hash", () => {
    const first = createInviteToken();
    const second = createInviteToken();
    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThan(30);
    expect(hashInviteToken(first)).toHaveLength(64);
    expect(hashInviteToken(first)).toBe(hashInviteToken(first));
    expect(hashInviteToken(first)).not.toBe(hashInviteToken(second));
  });

  it("normalizes the invited email before identity matching", () => {
    expect(normalizeInviteEmail("  Employee@Example.COM ")).toBe(
      "employee@example.com"
    );
  });

  it("treats the expiry boundary as expired", () => {
    const now = new Date("2026-09-27T12:00:00.000Z");
    expect(isInviteExpired(new Date("2026-09-27T12:00:00.000Z"), now)).toBe(true);
    expect(isInviteExpired(new Date("2026-09-27T12:00:01.000Z"), now)).toBe(false);
  });
});
