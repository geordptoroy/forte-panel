import { describe, expect, it } from "vitest";
import { resolveReplyRoute } from "./message-routing";

describe("reply routing", () => {
  it("uses the Baileys instance and JID from the latest inbound message", () => {
    expect(
      resolveReplyRoute({
        latestInbound: {
          provider: "baileys",
          metadata: { instanceId: "instance-origin", jid: "5511999999999@lid" },
        },
        defaultInstanceId: "instance-default",
      })
    ).toEqual({
      provider: "baileys",
      instanceId: "instance-origin",
      jid: "5511999999999@lid",
      usedLegacyFallback: false,
    });
  });

  it("does not replace a Baileys origin with the workspace default instance", () => {
    expect(
      resolveReplyRoute({
        latestInbound: {
          provider: "baileys",
          metadata: { instanceId: "baileys-origin" },
        },
        defaultInstanceId: "baileys-default",
      })
    ).toEqual({
      provider: "baileys",
      instanceId: "baileys-origin",
      usedLegacyFallback: false,
    });
  });

  it("uses the explicitly selected instance when a legacy message has no origin metadata", () => {
    expect(
      resolveReplyRoute({
        latestInbound: {
          provider: "baileys",
          metadata: { jid: "5511@s.whatsapp.net" },
        },
        defaultInstanceId: "baileys-default",
      })
    ).toEqual({
      provider: "baileys",
      instanceId: "baileys-default",
      jid: "5511@s.whatsapp.net",
      usedLegacyFallback: true,
    });
  });

  it("fails closed for a historical message recorded with a removed provider", () => {
    expect(() =>
      resolveReplyRoute({
        latestInbound: {
          provider: "papi",
          metadata: { instanceId: "legacy-instance" },
        },
      })
    ).toThrow("único provedor");
  });
});
