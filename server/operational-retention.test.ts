import { describe, expect, it } from "vitest";
import { cleanupOperationalRetention } from "./db";

describe("operational retention contract", () => {
  it("defaults to dry-run and clamps unsafe retention parameters", async () => {
    const result = await cleanupOperationalRetention({
      limit: 0,
      retentionDays: 1,
      now: new Date("2026-09-30T00:00:00.000Z"),
    });

    expect(result).toMatchObject({
      skipped: true,
      dryRun: true,
      limit: 1,
      retentionDays: 7,
      webhookEvents: 0,
      domainEvents: 0,
      securityRateLimitBuckets: 0,
    });
  });
});
