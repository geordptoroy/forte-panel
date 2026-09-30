export type NextActionState = "none" | "scheduled" | "overdue";

function timestampOf(value: string | Date | null | undefined) {
  if (value == null) return Number.NaN;
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

export function getNextActionState(
  dueAt: string | Date | null | undefined,
  now: Date = new Date()
): NextActionState {
  const dueAtMs = timestampOf(dueAt);
  if (!Number.isFinite(dueAtMs)) return "none";
  return dueAtMs <= now.getTime() ? "overdue" : "scheduled";
}

export function isFutureNextActionDueAt(
  dueAt: string | Date,
  now: Date = new Date()
) {
  const dueAtMs = timestampOf(dueAt);
  return Number.isFinite(dueAtMs) && dueAtMs > now.getTime();
}
