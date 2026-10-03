import { describe, expect, it } from "vitest";
import { WAMessageStatus } from "baileys";
import { normalizeBaileysMessageStatus } from "./delivery-status.js";

describe("Baileys delivery status normalization", () => {
  it("maps provider acknowledgements to monotonic receipt states", () => {
    expect(normalizeBaileysMessageStatus(WAMessageStatus.SERVER_ACK)).toBe("sent");
    expect(normalizeBaileysMessageStatus(WAMessageStatus.DELIVERY_ACK)).toBe("delivered");
    expect(normalizeBaileysMessageStatus(WAMessageStatus.READ)).toBe("read");
    expect(normalizeBaileysMessageStatus(WAMessageStatus.PLAYED)).toBe("read");
  });

  it("ignores pending, error, and unknown status values", () => {
    expect(normalizeBaileysMessageStatus(WAMessageStatus.PENDING)).toBeNull();
    expect(normalizeBaileysMessageStatus(WAMessageStatus.ERROR)).toBeNull();
    expect(normalizeBaileysMessageStatus("read")).toBeNull();
    expect(normalizeBaileysMessageStatus(999)).toBeNull();
  });
});
