import { describe, expect, it } from "vitest";
import { canTransitionAppointmentStatus } from "./agenda";

describe("appointment status transitions", () => {
  it("allows the operational lifecycle", () => {
    expect(canTransitionAppointmentStatus("requested", "confirmed")).toBe(true);
    expect(canTransitionAppointmentStatus("confirmed", "in_progress")).toBe(true);
    expect(canTransitionAppointmentStatus("in_progress", "completed")).toBe(true);
    expect(canTransitionAppointmentStatus("confirmed", "no_show")).toBe(true);
    expect(canTransitionAppointmentStatus("requested", "cancelled")).toBe(true);
  });

  it("does not reopen terminal states or skip lifecycle steps", () => {
    expect(canTransitionAppointmentStatus("requested", "completed")).toBe(false);
    expect(canTransitionAppointmentStatus("completed", "confirmed")).toBe(false);
    expect(canTransitionAppointmentStatus("cancelled", "confirmed")).toBe(false);
    expect(canTransitionAppointmentStatus("no_show", "in_progress")).toBe(false);
  });
});
