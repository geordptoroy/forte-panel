import { describe, expect, it } from "vitest";
import {
  dailySummaryEventKey,
  dailySummaryFor,
  defaultNotificationPreferences,
  notificationForEvent,
  notificationPreferenceForEvent,
  parseNotificationPreferences,
} from "./notification-contract";

describe("notification contract", () => {
  it("uses safe defaults and preserves explicitly configured preferences", () => {
    expect(parseNotificationPreferences("not-json")).toEqual(defaultNotificationPreferences);
    expect(parseNotificationPreferences('{"newLead":false,"dailySummary":true}')).toEqual({
      ...defaultNotificationPreferences,
      newLead: false,
      dailySummary: true,
    });
  });

  it("maps only supported events to their corresponding workspace preference", () => {
    expect(notificationPreferenceForEvent("contact.created")).toBe("newLead");
    expect(notificationPreferenceForEvent("appointment.created")).toBe("appointmentCreated");
    expect(notificationPreferenceForEvent("appointment.confirmed")).toBe("appointmentConfirmed");
    expect(notificationPreferenceForEvent("appointment.cancelled")).toBeUndefined();
  });

  it("formats appointment notifications in the workspace timezone and lead links to inbox", () => {
    expect(notificationForEvent({
      event: "contact.created",
      payload: { name: "Maria" },
      timezone: "America/Sao_Paulo",
    })).toMatchObject({ type: "new_lead", title: "Novo lead", body: "Maria chegou pelo canal de atendimento.", href: "/inbox" });

    expect(notificationForEvent({
      event: "appointment.created",
      payload: {},
      appointment: {
        contactName: "Maria",
        serviceName: "Consulta",
        professionalName: "Ana",
        startsAt: new Date("2026-09-25T20:30:00.000Z"),
      },
      timezone: "America/Sao_Paulo",
    })).toMatchObject({ type: "appointment_created", title: "Novo agendamento", body: "Maria · Consulta · Ana · 25/09/2026, 17:30", href: "/agenda" });
  });

  it("creates a stable daily-summary copy and idempotency key", () => {
    expect(dailySummaryFor("2026-09-25", 1, 2).body).toBe("1 atendimento · 2 novos leads em 25/09/2026.");
    expect(dailySummaryFor("2026-09-25", 0, 0).body).toBe("0 atendimentos · 0 novos leads em 25/09/2026.");
    expect(dailySummaryEventKey(42, "2026-09-25")).toBe("daily-summary:42:2026-09-25");
  });
});
