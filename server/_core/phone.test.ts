import { describe, expect, it } from "vitest";
import {
  isValidContactPhone,
  normalizeContactPhone,
  normalizeWhatsappJid,
} from "./phone";

describe("phone normalization", () => {
  it("deduplicates common Brazilian phone formats", () => {
    const formats = [
      "+55 (11) 99999-9999",
      "55 11 99999-9999",
      "5511999999999@s.whatsapp.net",
    ];
    expect(new Set(formats.map(normalizeContactPhone)).size).toBe(1);
    expect(normalizeContactPhone(formats[0]!)).toBe("5511999999999");
  });

  it("keeps LID and group identities distinct from phone numbers", () => {
    expect(normalizeContactPhone("1234@lid")).toBe("lid:1234");
    expect(normalizeContactPhone("1234@g.us")).toBe("group:1234");
    expect(normalizeContactPhone("1234@lid")).not.toBe("1234");
  });

  it("normalizes routing JIDs while preserving the suffix", () => {
    expect(normalizeWhatsappJid("5511 9999@LID")).toBe("55119999@lid");
    expect(normalizeWhatsappJid("+55 (11) 99999-9999")).toBe(
      "5511999999999@s.whatsapp.net"
    );
    expect(normalizeWhatsappJid(undefined)).toBeUndefined();
  });

  it("rejects empty or too-short contact keys", () => {
    expect(isValidContactPhone("abc")).toBe(false);
    expect(isValidContactPhone("5511999999999")).toBe(true);
  });
});
