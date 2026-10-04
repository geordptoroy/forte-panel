import { describe, expect, it, vi } from "vitest";
import { resolveOutboundJid } from "./jid-resolution.js";

function fakeSocket(mapping?: {
  getLIDForPN: (pn: string) => Promise<string | null>;
}) {
  return {
    signalRepository: mapping ? { lidMapping: mapping } : undefined,
  } as never;
}

describe("resolveOutboundJid", () => {
  it("preserves an explicit LID or other JID", async () => {
    await expect(
      resolveOutboundJid(fakeSocket(), "236450952020113@lid")
    ).resolves.toBe("236450952020113@lid");
  });

  it("uses the Baileys PN-to-LID mapping before sending", async () => {
    const getLIDForPN = vi.fn(async () => "236450952020113@lid");
    await expect(
      resolveOutboundJid(fakeSocket({ getLIDForPN }), "+55 (38) 99903-4689")
    ).resolves.toBe("236450952020113@lid");
    expect(getLIDForPN).toHaveBeenCalledWith("5538999034689@s.whatsapp.net");
  });

  it("lets Baileys USync populate a missing mapping", async () => {
    let mapped: string | null = null;
    const getLIDForPN = vi.fn(async () => mapped);
    const getUSyncDevices = vi.fn(async () => {
      mapped = "236450952020113@lid";
    });
    const socket = {
      signalRepository: { lidMapping: { getLIDForPN } },
      getUSyncDevices,
    } as never;

    await expect(resolveOutboundJid(socket, "5538999034689")).resolves.toBe(
      "236450952020113@lid"
    );
    expect(getUSyncDevices).toHaveBeenCalledWith(
      ["5538999034689@s.whatsapp.net", "553899034689@s.whatsapp.net"],
      false,
      true
    );
  });

  it("falls back to a PN JID when the mapping is unavailable", async () => {
    await expect(
      resolveOutboundJid(
        fakeSocket({ getLIDForPN: async () => null }),
        "5538999034689"
      )
    ).resolves.toBe("5538999034689@s.whatsapp.net");
  });
});
