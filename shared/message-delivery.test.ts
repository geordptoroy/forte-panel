import { describe, expect, it } from "vitest";
import { messageDeliveryRank } from "./message-delivery";

describe("message delivery ordering", () => {
  it("orders sent, delivered, and read monotonically", () => {
    expect(messageDeliveryRank("sent")).toBeLessThan(messageDeliveryRank("delivered"));
    expect(messageDeliveryRank("delivered")).toBeLessThan(messageDeliveryRank("read"));
  });

  it("treats missing or unrecognized persisted values as the sent baseline", () => {
    expect(messageDeliveryRank(undefined)).toBe(1);
    expect(messageDeliveryRank("unknown")).toBe(messageDeliveryRank("sent"));
  });
});
