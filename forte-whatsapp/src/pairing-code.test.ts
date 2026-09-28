import { describe, expect, it, vi } from "vitest";
import {
  clearUnregisteredPairingCredentials,
  getBaileysBrowser,
  getStatusAfterSocketClose,
  requestPairingCodeWhenReady,
  shouldUseRemoteLogout,
} from "./pairing-code.js";

describe("Baileys pairing code", () => {
  it("uses a canonical Chrome/Ubuntu identity for WhatsApp phone pairing", () => {
    expect(getBaileysBrowser()).toEqual(["Ubuntu", "Chrome", "22.04.4"]);
  });

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

  it("clears only credentials from an unaccepted pairing attempt", () => {
    const creds: {
      registered?: boolean;
      me?: unknown;
      pairingCode?: string;
      account?: unknown;
      signalIdentities?: unknown[];
    } = {
      registered: false,
      me: { id: "pending" },
      pairingCode: "AB12CD34",
    };
    expect(clearUnregisteredPairingCredentials(creds)).toBe(true);
    expect(creds).toEqual({ registered: false });
  });

  it("preserves the account state emitted by pair-success before registered becomes true", () => {
    const creds = {
      registered: false,
      me: { id: "accepted" },
      pairingCode: "AB12CD34",
      account: { details: "accepted-account" },
      signalIdentities: [{ identifier: { name: "accepted" } }],
    };
    expect(clearUnregisteredPairingCredentials(creds)).toBe(false);
    expect(creds.me).toEqual({ id: "accepted" });
    expect(creds.account).toEqual({ details: "accepted-account" });
    expect(creds.signalIdentities).toHaveLength(1);
  });

  it("preserves a registered account", () => {
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
    const creds: { registered?: boolean } = { registered: false };
    expect(clearUnregisteredPairingCredentials(creds)).toBe(false);
    expect(creds).toEqual({ registered: false });
  });

  it("does not send a remote logout for a pending, unaccepted pairing", () => {
    expect(shouldUseRemoteLogout(true, true)).toBe(false);
    expect(shouldUseRemoteLogout(false, true)).toBe(false);
    expect(shouldUseRemoteLogout(true, false)).toBe(true);
  });

  it("keeps the UI in a connecting state during the accepted-pairing restart", () => {
    expect(getStatusAfterSocketClose(false, true)).toBe("connecting");
    expect(getStatusAfterSocketClose(true, true)).toBe("logged_out");
    expect(getStatusAfterSocketClose(false, false)).toBe("disconnected");
  });
});
