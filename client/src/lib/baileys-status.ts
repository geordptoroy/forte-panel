const FAST_REFRESH_STATES = new Set(["connecting", "pairing", "qr"]);

export function baileysStatusPollingInterval(status?: string | null): number {
  return status && FAST_REFRESH_STATES.has(status) ? 2_000 : 15_000;
}
