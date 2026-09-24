export type WeeklyAvailabilityWindow = {
  weekday: number;
  startMinute: number;
  endMinute: number;
};

export type ScheduleFailure = "invalid_period" | "schedule_not_configured" | "outside_working_hours" | "appointment_conflict" | "professional_unavailable";

export class ScheduleError extends Error {
  constructor(readonly reason: ScheduleFailure, message: string) {
    super(message);
    this.name = "ScheduleError";
  }
}

type ZonedClock = {
  year: number;
  month: number;
  day: number;
  weekday: number;
  minuteOfDay: number;
};

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function getZonedClock(date: Date, timezone: string): ZonedClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekday = WEEKDAY_INDEX[values.weekday];
  if (weekday === undefined) throw new RangeError(`Fuso horário inválido: ${timezone}`);
  const hour = Number(values.hour);
  const minute = Number(values.minute);
  const second = Number(values.second);
  const minuteOfDay = hour * 60 + minute + second / 60 + date.getMilliseconds() / 60_000;
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day), weekday, minuteOfDay };
}

function civilDayNumber(value: Pick<ZonedClock, "year" | "month" | "day">) {
  return Math.floor(Date.UTC(value.year, value.month - 1, value.day) / 86_400_000);
}

/**
 * Rejects appointments that are not fully covered by one weekly availability
 * window. All wall-clock calculations use the workspace timezone, never the
 * host process timezone. Overnight shifts are intentionally unsupported because
 * the stored availability model represents one window within one weekday.
 */
export function assertWithinWorkingHours(
  startsAt: Date,
  endsAt: Date,
  timezone: string,
  windows: WeeklyAvailabilityWindow[],
): void {
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) {
    throw new ScheduleError("invalid_period", "O horário final precisa ser maior que o inicial");
  }
  if (windows.length === 0) {
    throw new ScheduleError("schedule_not_configured", "Este profissional não tem disponibilidade semanal cadastrada");
  }

  let start: ZonedClock;
  let end: ZonedClock;
  try {
    start = getZonedClock(startsAt, timezone);
    end = getZonedClock(endsAt, timezone);
  } catch {
    throw new ScheduleError("invalid_period", "Não foi possível validar o fuso horário do workspace");
  }

  const sameDay = civilDayNumber(start) === civilDayNumber(end);
  const endsAtMidnightNextDay = civilDayNumber(end) === civilDayNumber(start) + 1 && end.minuteOfDay < 0.001;
  if (!sameDay && !endsAtMidnightNextDay) {
    throw new ScheduleError("outside_working_hours", "O atendimento precisa ocorrer dentro da jornada de um único dia");
  }
  const endMinute = endsAtMidnightNextDay ? 1440 : end.minuteOfDay;
  const covered = windows.some((window) =>
    window.weekday === start.weekday
    && start.minuteOfDay >= window.startMinute
    && endMinute <= window.endMinute,
  );
  if (!covered) {
    throw new ScheduleError("outside_working_hours", "O horário solicitado está fora da disponibilidade semanal deste profissional");
  }
}

export function intervalsOverlap(firstStart: Date, firstEnd: Date, secondStart: Date, secondEnd: Date) {
  return firstStart < secondEnd && firstEnd > secondStart;
}
