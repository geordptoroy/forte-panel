import { describe, expect, it } from "vitest";
import { PanelMessageEchoTracker } from "./message-normalization.js";

describe("panel message echo tracker", () => {
  it("recognizes only recent outbound IDs", () => {
    const tracker = new PanelMessageEchoTracker();
    tracker.rememberSentId("panel-outbound-1");
    expect(tracker.hasSentId("panel-outbound-1")).toBe(true);
    expect(tracker.hasSentId("phone-originated-1")).toBe(false);
  });
});
