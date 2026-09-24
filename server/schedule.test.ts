import { describe, expect, it } from "vitest";
import { assertWithinWorkingHours, getLocalDayBounds, intervalsOverlap, ScheduleError } from "./schedule";

const weekdaySchedule = [{ weekday: 5, startMinute: 9 * 60, endMinute: 18 * 60 }]; // Friday, São Paulo time

describe("weekly availability validation", () => {
  it("accepts an interval fully contained in the workspace-local window", () => {
    expect(() => assertWithinWorkingHours(
      new Date("2026-09-25T12:00:00.000Z"), // Friday 09:00 in São Paulo
      new Date("2026-09-25T13:30:00.000Z"), // Friday 10:30
      "America/Sao_Paulo",
      weekdaySchedule,
    )).not.toThrow();
  });

  it("uses workspace timezone rather than the host process timezone", () => {
    expect(() => assertWithinWorkingHours(
      new Date("2026-09-25T21:00:00.000Z"), // Friday 18:00 in São Paulo, exactly the closing boundary
      new Date("2026-09-25T21:30:00.000Z"),
      "America/Sao_Paulo",
      weekdaySchedule,
    )).toThrowError(ScheduleError);
  });

  it("rejects a weekday mismatch and an unconfigured schedule", () => {
    expect(() => assertWithinWorkingHours(
      new Date("2026-09-24T12:00:00.000Z"),
      new Date("2026-09-24T13:00:00.000Z"),
      "America/Sao_Paulo",
      weekdaySchedule,
    )).toThrowError(expect.objectContaining({ reason: "outside_working_hours" }));

    expect(() => assertWithinWorkingHours(
      new Date("2026-09-25T12:00:00.000Z"),
      new Date("2026-09-25T13:00:00.000Z"),
      "America/Sao_Paulo",
      [],
    )).toThrowError(expect.objectContaining({ reason: "schedule_not_configured" }));
  });

  it("rejects an interval that crosses a local day boundary", () => {
    expect(() => assertWithinWorkingHours(
      new Date("2026-09-26T02:30:00.000Z"), // Friday 23:30 in São Paulo
      new Date("2026-09-26T04:00:00.000Z"), // Saturday 01:00 in São Paulo
      "America/Sao_Paulo",
      [{ weekday: 5, startMinute: 0, endMinute: 1440 }],
    )).toThrowError(expect.objectContaining({ reason: "outside_working_hours" }));
  });
});

describe("appointment interval overlap", () => {
  const at = (minute: number) => new Date(Date.UTC(2026, 8, 25, 12, minute));

  it("detects true overlap but permits adjacent appointments", () => {
    expect(intervalsOverlap(at(0), at(60), at(59), at(90))).toBe(true);
    expect(intervalsOverlap(at(0), at(60), at(60), at(90))).toBe(false);
    expect(intervalsOverlap(at(60), at(90), at(0), at(60))).toBe(false);
  });
});

describe("workspace-local day boundaries", () => {
  it("uses the workspace timezone for the local date and midnight bounds", () => {
    const bounds = getLocalDayBounds(new Date("2026-09-25T20:00:00.000Z"), "America/Sao_Paulo");
    expect(bounds.dayKey).toBe("2026-09-25");
    expect(bounds.minuteOfDay).toBe(17 * 60);
    expect(bounds.start.toISOString()).toBe("2026-09-25T03:00:00.000Z");
    expect(bounds.end.toISOString()).toBe("2026-09-26T03:00:00.000Z");
  });

  it("uses a 23-hour day when the timezone moves forward for daylight saving", () => {
    const bounds = getLocalDayBounds(new Date("2026-03-08T12:00:00.000Z"), "America/New_York");
    expect(bounds.dayKey).toBe("2026-03-08");
    expect(bounds.start.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(bounds.end.toISOString()).toBe("2026-03-09T04:00:00.000Z");
  });
});
