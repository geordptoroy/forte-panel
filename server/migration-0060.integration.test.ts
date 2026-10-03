import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;
const usesLocalDatabase = (() => {
  if (!databaseUrl || !/^postgres(ql)?:\/\//i.test(databaseUrl)) return false;
  try {
    return ["localhost", "127.0.0.1", "::1"].includes(
      new URL(databaseUrl).hostname.replace(/^\[|\]$/g, "")
    );
  } catch {
    return false;
  }
})();

const migration = readFileSync(
  join(process.cwd(), "drizzle-pg/0060_api_idempotency_claim_fencing.sql"),
  "utf8"
);

describe.skipIf(!usesLocalDatabase)("migration 0060 idempotency claim fencing", () => {
  it("adds claim tokens and makes legacy in-flight/failed claims inconclusive", async () => {
    if (!databaseUrl) throw new Error("DATABASE_URL unavailable");
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      await client.query(`
        CREATE TEMP TABLE "apiIdempotency" (
          id serial PRIMARY KEY,
          status varchar(20) NOT NULL,
          "leaseUntil" timestamptz,
          "updatedAt" timestamptz NOT NULL DEFAULT now()
        )
      `);
      await client.query(`
        INSERT INTO "apiIdempotency" (status, "leaseUntil") VALUES
          ('processing', now() + interval '2 minutes'),
          ('failed', now() - interval '1 minute'),
          ('completed', NULL)
      `);
      await client.query(migration);

      const result = await client.query<{
        status: string;
        claimToken: string | null;
        leaseUntil: Date | null;
      }>(`SELECT status, "claimToken", "leaseUntil" FROM "apiIdempotency" ORDER BY id`);

      expect(result.rows[0]).toMatchObject({ status: "indeterminate", leaseUntil: null });
      expect(result.rows[0]?.claimToken).toMatch(/^[0-9a-f-]{36}$/i);
      expect(result.rows[1]).toMatchObject({ status: "indeterminate", leaseUntil: null });
      expect(result.rows[1]?.claimToken).toMatch(/^[0-9a-f-]{36}$/i);
      expect(result.rows[2]).toMatchObject({ status: "completed", claimToken: null });
    } finally {
      await client.end();
    }
  });
});
