export type ReleaseSlot = () => void;

/**
 * History sync can deliver hundreds of webhooks at once. Keep those imports
 * bounded so a newly paired workspace does not consume every PostgreSQL
 * connection and make normal UI/auth requests look logged out.
 */
export class HistoricalWebhookAdmission {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly limit = 2) {
    if (!Number.isInteger(limit) || limit < 1)
      throw new Error("Historical webhook admission limit must be positive");
  }

  async acquire(): Promise<ReleaseSlot> {
    if (this.active >= this.limit)
      await new Promise<void>(resolve => this.waiters.push(resolve));
    this.active += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
      this.waiters.shift()?.();
    };
  }

  get activeCount() {
    return this.active;
  }

  get queuedCount() {
    return this.waiters.length;
  }
}
