import { describe, expect, it } from "vitest";
import {
  DEFAULT_OPPORTUNITY_STAGE,
  initialOpportunityStage,
  shouldUpsertLeadFromInbound,
} from "../shared/lead-opportunity";

describe("lead and opportunity rules", () => {
  it("promotes only accepted live individual inbound messages", () => {
    expect(
      shouldUpsertLeadFromInbound({
        isGroup: false,
        fromMe: false,
        historySync: false,
        ignored: false,
      })
    ).toBe(true);

    for (const excluded of [
      { isGroup: true, fromMe: false, historySync: false, ignored: false },
      { isGroup: false, fromMe: true, historySync: false, ignored: false },
      { isGroup: false, fromMe: false, historySync: true, ignored: false },
      { isGroup: false, fromMe: false, historySync: false, ignored: true },
    ]) {
      expect(shouldUpsertLeadFromInbound(excluded)).toBe(false);
    }
  });

  it("preserves a nonempty legacy stage and defaults empty values", () => {
    expect(initialOpportunityStage(" Triagem ")).toBe("Triagem");
    expect(initialOpportunityStage(null)).toBe(DEFAULT_OPPORTUNITY_STAGE);
    expect(initialOpportunityStage("   ")).toBe(DEFAULT_OPPORTUNITY_STAGE);
  });

  it("bounds the projected stage to the existing 80-character contract", () => {
    expect(initialOpportunityStage("x".repeat(100))).toBe("x".repeat(80));
  });
});
