import { describe, expect, it } from "vitest";
import { HistoricalWebhookAdmission } from "./historical-webhook-admission";

describe("HistoricalWebhookAdmission", () => {
  it("limits concurrent history imports and releases a slot only once", async () => {
    const admission = new HistoricalWebhookAdmission(1);
    const releaseFirst = await admission.acquire();
    let secondAcquired = false;
    const second = admission.acquire().then(release => {
      secondAcquired = true;
      return release;
    });

    await Promise.resolve();
    expect(secondAcquired).toBe(false);
    expect(admission.activeCount).toBe(1);
    expect(admission.queuedCount).toBe(1);

    releaseFirst();
    releaseFirst();
    const releaseSecond = await second;
    expect(secondAcquired).toBe(true);
    expect(admission.activeCount).toBe(1);

    releaseSecond();
    expect(admission.activeCount).toBe(0);
    expect(admission.queuedCount).toBe(0);
  });
});
