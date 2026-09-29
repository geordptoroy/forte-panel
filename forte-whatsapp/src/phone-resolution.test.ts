import { describe, expect, it, vi } from "vitest";
import {
  brazilianPhoneCandidates,
  resolveRecipientJid,
} from "./phone-resolution.js";

describe("Brazilian phone resolution", () => {
  it("keeps the exact formatted Brazilian number first", () => {
    expect(brazilianPhoneCandidates("038 9903-4689")).toEqual([
      "3899034689@s.whatsapp.net",
      "38999034689@s.whatsapp.net",
    ]);
  });

  it("offers the shorter candidate when an extra ninth digit was entered", () => {
    expect(brazilianPhoneCandidates("55 38 99903-4689")).toEqual([
      "38999034689@s.whatsapp.net",
      "3899034689@s.whatsapp.net",
    ]);
  });

  it("uses the WhatsApp-confirmed candidate instead of guessing", async () => {
    const lookup = vi.fn(async (...numbers: string[]) =>
      numbers.map(jid => ({ jid, exists: jid === "3899034689@s.whatsapp.net" }))
    );
    await expect(resolveRecipientJid("5538999034689", lookup)).resolves.toBe(
      "3899034689@s.whatsapp.net"
    );
    expect(lookup).toHaveBeenCalledWith(
      "38999034689@s.whatsapp.net",
      "3899034689@s.whatsapp.net"
    );
  });

  it("preserves explicit JIDs without directory lookup", async () => {
    const lookup = vi.fn();
    await expect(
      resolveRecipientJid("3899034689@s.whatsapp.net", lookup)
    ).resolves.toBe("3899034689@s.whatsapp.net");
    expect(lookup).not.toHaveBeenCalled();
  });
});
