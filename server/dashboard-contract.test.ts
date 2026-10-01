import { describe, expect, it } from "vitest";
import {
  isDashboardPendingLead,
  isDashboardStalledQuote,
} from "./dashboard-contract";

describe("dashboard decision contract", () => {
  const now = new Date("2026-10-01T15:00:00.000Z");

  it("does not turn a lead awaiting its own reply into operator work", () => {
    expect(
      isDashboardPendingLead({ needsOperatorResponse: false }, now)
    ).toBe(false);
    expect(
      isDashboardPendingLead({ needsOperatorResponse: true }, now)
    ).toBe(true);
  });

  it("detects an overdue follow-up but ignores a completed one", () => {
    const overdue = new Date("2026-09-30T14:59:59.000Z");
    expect(isDashboardPendingLead({ followUpAt: overdue }, now)).toBe(true);
    expect(
      isDashboardPendingLead({ followUpAt: overdue, followUpCompletedAt: now }, now)
    ).toBe(false);
  });

  it("uses a 48-hour boundary for stalled quotes", () => {
    expect(
      isDashboardStalledQuote(new Date("2026-09-29T15:00:00.000Z"), now)
    ).toBe(true);
    expect(
      isDashboardStalledQuote(new Date("2026-09-29T15:00:01.000Z"), now)
    ).toBe(false);
  });
});
