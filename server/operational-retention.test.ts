import { describe, expect, it } from "vitest";
import { cleanupOperationalRetention } from "./db";

const hasDatabase = Boolean(
  process.env.DATABASE_URL &&
    /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL)
);

describe("operational retention contract", () => {
  it("defaults to dry-run, clamps unsafe retention parameters, and only skips without PostgreSQL", async () => {
    const result = await cleanupOperationalRetention({
      limit: 0,
      retentionDays: 1,
      now: new Date("2026-09-30T00:00:00.000Z"),
    });

    expect(result).toMatchObject({
      skipped: !hasDatabase,
      dryRun: true,
      limit: 1,
      retentionDays: 7,
      webhookEvents: 0,
      domainEvents: 0,
      securityRateLimitBuckets: 0,
    });
  });
});
