import { describe, expect, it } from "vitest";
import {
  getNextActionState,
  isFutureNextActionDueAt,
} from "../shared/inbox-next-action";

describe("Inbox next-action timing", () => {
  const now = new Date("2026-09-30T12:00:00.000Z");

  it("classifies a missing action and invalid timestamp safely", () => {
    expect(getNextActionState(null, now)).toBe("none");
    expect(getNextActionState("not-a-date", now)).toBe("none");
  });

  it("classifies a future action as scheduled and an elapsed action as overdue", () => {
    expect(getNextActionState("2026-09-30T12:00:01.000Z", now)).toBe("scheduled");
    expect(getNextActionState("2026-09-30T11:59:59.000Z", now)).toBe("overdue");
    expect(getNextActionState(now, now)).toBe("overdue");
  });

  it("accepts only finite timestamps strictly in the future", () => {
    expect(isFutureNextActionDueAt("2026-09-30T12:00:01.000Z", now)).toBe(true);
    expect(isFutureNextActionDueAt(now, now)).toBe(false);
    expect(isFutureNextActionDueAt("invalid", now)).toBe(false);
  });
});
