import { describe, expect, it } from "vitest";
import {
  createPairingCode,
  requestPairingCodeWithAcceptedRestart,
} from "./pairing-code.js";

describe("Baileys pairing code", () => {
  it("generates an eight-character code from Baileys' Crockford alphabet", () => {
    const code = createPairingCode();
    expect(code).toHaveLength(8);
    expect(
      [...code].every(character =>
        "123456789ABCDEFGHJKLMNPQRSTVWXYZ".includes(character)
      )
    ).toBe(true);
  });

  it("returns the requested code when WhatsApp accepted pairing before closing the stream", async () => {
    const code = "AB12CD34";
    let accepted = false;
    await expect(
      requestPairingCodeWithAcceptedRestart(
        code,
        async requestedCode => {
          expect(requestedCode).toBe(code);
          accepted = true;
          throw new Error("Connection Closed");
        },
        () => accepted
      )
    ).resolves.toBe(code);
  });

  it("does not hide a close that happened before pairing was accepted", async () => {
    await expect(
      requestPairingCodeWithAcceptedRestart(
        "AB12CD34",
        async () => {
          throw new Error("Connection Closed");
        },
        () => false
      )
    ).rejects.toThrow("Connection Closed");
  });

  it("does not hide unrelated failures after pairing acceptance", async () => {
    await expect(
      requestPairingCodeWithAcceptedRestart(
        "AB12CD34",
        async () => {
          throw new Error("Pairing request timed out");
        },
        () => true
      )
    ).rejects.toThrow("Pairing request timed out");
  });
});
