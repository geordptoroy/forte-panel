export type WorkspaceTemporalContext = {
  timezone: string;
  nowIso: string;
  localDate: string;
  localDateTime: string;
};

export function getWorkspaceTemporalContextAt(
  now: Date,
  timezone: string
): WorkspaceTemporalContext {
  const resolvedTimezone = timezone || "America/Sao_Paulo";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: resolvedTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const localDate = `${values.year}-${values.month}-${values.day}`;
  return {
    timezone: resolvedTimezone,
    nowIso: now.toISOString(),
    localDate,
    localDateTime: `${localDate}T${values.hour}:${values.minute}:${values.second}`,
  };
}

export function relativeDate(localDate: string, days: number) {
  const date = new Date(`${localDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function temporalPrompt(context: WorkspaceTemporalContext) {
  return `CONTEXTO TEMPORAL OFICIAL — não use o relógio interno do modelo:\n- Fuso horário do workspace: ${context.timezone}\n- Data e hora locais atuais: ${context.localDateTime}\n- Data local de hoje: ${context.localDate}\n- “amanhã” corresponde a: ${relativeDate(context.localDate, 1)}\n- “ontem” corresponde a: ${relativeDate(context.localDate, -1)}\nConverta datas relativas para a data ISO correspondente antes de consultar a agenda ou criar um agendamento. Se o cliente enviar a data que faltava, retome o fluxo e não pergunte a mesma data novamente.`;
}
