import { describe, expect, it } from "vitest";
import { resolveReplyRoute } from "./message-routing";

describe("reply routing", () => {
  it("uses the provider, instance and JID from the latest inbound message", () => {
    expect(
      resolveReplyRoute({
        latestInbound: {
          provider: "papi",
          metadata: { instanceId: "instance-origin", jid: "5511999999999@lid" },
        },
        defaultProvider: "papi",
        defaultInstanceId: "instance-default",
      })
    ).toEqual({
      provider: "papi",
      instanceId: "instance-origin",
      jid: "5511999999999@lid",
      usedLegacyFallback: false,
    });
  });

  it("does not replace a Baileys origin with the workspace default provider", () => {
    expect(
      resolveReplyRoute({
        latestInbound: {
          provider: "baileys",
          metadata: { instanceId: "baileys-origin" },
        },
        defaultProvider: "papi",
        defaultInstanceId: "papi-default",
      })
    ).toEqual({
      provider: "baileys",
      instanceId: "baileys-origin",
      usedLegacyFallback: false,
    });
  });

  it("uses the default only for legacy messages without origin metadata", () => {
    expect(
      resolveReplyRoute({
        latestInbound: { provider: "papi", metadata: { jid: "5511@s.whatsapp.net" } },
        defaultProvider: "papi",
        defaultInstanceId: "legacy-default",
      })
    ).toEqual({
      provider: "papi",
      instanceId: "legacy-default",
      jid: "5511@s.whatsapp.net",
      usedLegacyFallback: true,
    });
  });
});
