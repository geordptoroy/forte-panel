export type NotificationPreferences = {
  newLead: boolean;
  appointmentCreated: boolean;
  appointmentConfirmed: boolean;
  dailySummary: boolean;
};

export const defaultNotificationPreferences: NotificationPreferences = {
  newLead: true,
  appointmentCreated: true,
  appointmentConfirmed: true,
  dailySummary: false,
};

export function parseNotificationPreferences(value: string | null | undefined): NotificationPreferences {
  if (!value) return { ...defaultNotificationPreferences };
  try {
    const parsed = JSON.parse(value) as Partial<NotificationPreferences>;
    return {
      newLead: typeof parsed.newLead === "boolean" ? parsed.newLead : defaultNotificationPreferences.newLead,
      appointmentCreated: typeof parsed.appointmentCreated === "boolean" ? parsed.appointmentCreated : defaultNotificationPreferences.appointmentCreated,
      appointmentConfirmed: typeof parsed.appointmentConfirmed === "boolean" ? parsed.appointmentConfirmed : defaultNotificationPreferences.appointmentConfirmed,
      dailySummary: typeof parsed.dailySummary === "boolean" ? parsed.dailySummary : defaultNotificationPreferences.dailySummary,
    };
  } catch {
    return { ...defaultNotificationPreferences };
  }
}

export type NotificationEvent = "contact.created" | "appointment.created" | "appointment.confirmed";

export function notificationPreferenceForEvent(event: string): keyof NotificationPreferences | undefined {
  if (event === "contact.created") return "newLead";
  if (event === "appointment.created") return "appointmentCreated";
  if (event === "appointment.confirmed") return "appointmentConfirmed";
  return undefined;
}

export function notificationForEvent(input: {
  event: NotificationEvent;
  payload: Record<string, unknown>;
  appointment?: { contactName: string | null; serviceName: string | null; professionalName: string | null; startsAt: Date | null };
  timezone: string;
}) {
  if (input.event === "contact.created") {
    const name = typeof input.payload.name === "string" && input.payload.name.trim() ? input.payload.name.trim() : "Novo contato";
    return { type: "new_lead", title: "Novo lead", body: `${name} chegou pelo canal de atendimento.`, href: "/inbox" };
  }
  const when = input.appointment?.startsAt && Number.isFinite(input.appointment.startsAt.getTime())
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: input.timezone }).format(input.appointment.startsAt)
    : "horário atualizado";
  const subject = [input.appointment?.contactName, input.appointment?.serviceName].filter(Boolean).join(" · ") || "Atendimento";
  const created = input.event === "appointment.created";
  return {
    type: created ? "appointment_created" : "appointment_confirmed",
    title: created ? "Novo agendamento" : "Agendamento confirmado",
    body: `${subject} · ${input.appointment?.professionalName ?? "equipe"} · ${when}`,
    href: "/agenda",
  };
}

export function dailySummaryFor(dateKey: string, appointments: number, newLeads: number) {
  return {
    type: "daily_summary",
    title: "Resumo do dia",
    body: `${appointments} ${appointments === 1 ? "atendimento" : "atendimentos"} · ${newLeads} ${newLeads === 1 ? "novo lead" : "novos leads"} em ${dateKey.split("-").reverse().join("/")}.`,
    href: "/dashboard",
  };
}

export function dailySummaryEventKey(workspaceId: number, dateKey: string) {
  return `daily-summary:${workspaceId}:${dateKey}`;
}
