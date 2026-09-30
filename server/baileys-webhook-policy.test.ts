import { describe, expect, it } from "vitest";
import { historicalBaileysIgnoreReason } from "./baileys-webhook-policy";

describe("Baileys historical webhook policy", () => {
  const base = {
    historySync: true,
    isGroup: false,
    instanceId: "instance-a",
    instanceOwner: true,
    groupJid: undefined,
    phone: "5511999999999",
    content: "mensagem antiga",
  };

  it("acknowledges every historical event before database ingestion", () => {
    expect(historicalBaileysIgnoreReason(base)).toBe(
      "historical_payload_not_importable"
    );
  });

  it("acknowledges historical events without content", () => {
    expect(historicalBaileysIgnoreReason({ ...base, content: "   " })).toBe(
      "historical_payload_not_importable"
    );
  });

  it("acknowledges historical events with an unusable phone", () => {
    expect(historicalBaileysIgnoreReason({ ...base, phone: "123" })).toBe(
      "historical_payload_not_importable"
    );
  });

  it("does not weaken group ownership validation", () => {
    expect(
      historicalBaileysIgnoreReason({
        ...base,
        isGroup: true,
        groupJid: "5511999999999@s.whatsapp.net",
      })
    ).toBe("historical_payload_not_importable");
  });

  it("allows live events through the policy", () => {
    expect(
      historicalBaileysIgnoreReason({ ...base, historySync: false })
    ).toBeUndefined();
  });
});
