const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 60_000;

export function reconnectDelayMs(attempt: number, random = Math.random): number {
  const safeAttempt = Math.max(1, Math.floor(Number.isFinite(attempt) ? attempt : 1));
  const exponent = Math.min(16, safeAttempt - 1);
  const base = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** exponent);
  const sample = Math.max(0, Math.min(1, random()));
  const jittered = base * (0.8 + sample * 0.4);
  return Math.max(1, Math.min(MAX_DELAY_MS, Math.round(jittered)));
}
