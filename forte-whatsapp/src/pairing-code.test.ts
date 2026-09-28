import { describe, expect, it, vi } from "vitest";
import {
  clearUnregisteredPairingCredentials,
  requestPairingCodeWhenReady,
} from "./pairing-code.js";

describe("Baileys pairing code", () => {
  it("waits until the WhatsApp pairing flow is ready before requesting Baileys' native code", async () => {
    const calls: string[] = [];
    await expect(
      requestPairingCodeWhenReady(
        async () => {
          calls.push("ready");
        },
        async () => {
          calls.push("request");
          return "AB12CD34";
        }
      )
    ).resolves.toBe("AB12CD34");
    expect(calls).toEqual(["ready", "request"]);
  });

  it("does not request a code when the socket never becomes ready", async () => {
    const request = vi.fn(async () => "AB12CD34");
    await expect(
      requestPairingCodeWhenReady(async () => {
        throw new Error("WhatsApp connection closed");
      }, request)
    ).rejects.toThrow("WhatsApp connection closed");
    expect(request).not.toHaveBeenCalled();
  });

  it("clears stale pairing credentials only for unregistered sessions", () => {
    const creds: { registered?: boolean; me?: unknown; pairingCode?: string } =
      {
        registered: false,
        me: { id: "pending" },
        pairingCode: "AB12CD34",
      };
    expect(clearUnregisteredPairingCredentials(creds)).toBe(true);
    expect(creds).toEqual({ registered: false });
  });

  it("preserves credentials of a registered account", () => {
    const creds = {
      registered: true,
      me: { id: "registered" },
      pairingCode: "AB12CD34",
    };
    expect(clearUnregisteredPairingCredentials(creds)).toBe(false);
    expect(creds.me).toEqual({ id: "registered" });
    expect(creds.pairingCode).toBe("AB12CD34");
  });

  it("leaves fresh unregistered credentials unchanged", () => {
    const creds: { registered?: boolean; me?: unknown; pairingCode?: string } =
      {
        registered: false,
      };
    expect(clearUnregisteredPairingCredentials(creds)).toBe(false);
    expect(creds).toEqual({ registered: false });
  });
});
