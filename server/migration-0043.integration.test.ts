import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const configuredDatabaseUrl = process.env.DATABASE_URL;
const localDatabaseUrl = (() => {
  if (!configuredDatabaseUrl || !/^postgres(ql)?:\/\//i.test(configuredDatabaseUrl))
    return undefined;
  try {
    const host = new URL(configuredDatabaseUrl).hostname.replace(/^\[|\]$/g, "");
    return ["localhost", "127.0.0.1", "::1"].includes(host)
      ? configuredDatabaseUrl
      : undefined;
  } catch {
    return undefined;
  }
})();
const migrationSql = readFileSync(
  new URL("../drizzle-pg/0043_baileys_only_provider_enum.sql", import.meta.url),
  "utf8"
);
const blockers = [
  {
    surface: "whatsappChannels",
    seedSql: `INSERT INTO "whatsappChannels" ("provider") VALUES ('meta')`,
    verifySql: `SELECT "provider"::text AS provider FROM "whatsappChannels"`,
    expectedError: "legacy whatsappChannels provider rows exist",
  },
  {
    surface: "whatsappInstances",
    seedSql: `INSERT INTO "whatsappInstances" ("provider") VALUES ('papi')`,
    verifySql: `SELECT "provider"::text AS provider FROM "whatsappInstances"`,
    expectedError: "legacy whatsappInstances provider rows exist",
  },
  {
    surface: "messages",
    seedSql: `INSERT INTO "messages" ("provider") VALUES ('meta')`,
    verifySql: `SELECT "provider"::text AS provider FROM "messages"`,
    expectedError: "legacy messages provider rows exist",
  },
  {
    surface: "workspaceSettings",
    seedSql: `INSERT INTO "workspaceSettings" ("key", "value") VALUES ('default_whatsapp_provider', 'papi')`,
    verifySql: `SELECT "value" FROM "workspaceSettings" WHERE "key" = 'default_whatsapp_provider'`,
    expectedError: "legacy default provider settings exist",
  },
] as const;

describe.skipIf(!localDatabaseUrl)("migration 0043 legacy provider gate", () => {
  const databaseName = `forte_panel_0043_guard_${process.pid}_${Date.now()}`;
  let adminClient: Client | undefined;
  let testClient: Client | undefined;

  beforeAll(async () => {
    if (!localDatabaseUrl) return;
    const maintenanceUrl = new URL(localDatabaseUrl);
    maintenanceUrl.pathname = "/postgres";
    adminClient = new Client({ connectionString: maintenanceUrl.toString() });
    await adminClient.connect();
    await adminClient.query(`CREATE DATABASE "${databaseName}"`);

    const isolatedUrl = new URL(localDatabaseUrl);
    isolatedUrl.pathname = `/${databaseName}`;
    testClient = new Client({ connectionString: isolatedUrl.toString() });
    await testClient.connect();
    await testClient.query(`
      CREATE TYPE public.whatsapp_provider AS ENUM ('baileys', 'papi', 'meta');
      CREATE TABLE public."whatsappChannels" ("provider" public.whatsapp_provider NOT NULL);
      CREATE TABLE public."whatsappInstances" ("provider" public.whatsapp_provider NOT NULL);
      CREATE TABLE public."messages" ("provider" public.whatsapp_provider NOT NULL);
      CREATE TABLE public."workspaceSettings" ("key" text NOT NULL, "value" text);
    `);
  });

  afterAll(async () => {
    await testClient?.end().catch(() => undefined);
    if (adminClient) {
      await adminClient
        .query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`)
        .catch(() => undefined);
      await adminClient.end().catch(() => undefined);
    }
  });

  it.each(blockers)("blocks $surface legacy rows without changing their data", async blocker => {
    const client = testClient;
    if (!client) throw new Error("isolated local test database unavailable");
    await client.query(`
      DELETE FROM public."whatsappChannels";
      DELETE FROM public."whatsappInstances";
      DELETE FROM public."messages";
      DELETE FROM public."workspaceSettings";
    `);
    await client.query(blocker.seedSql);

    await client.query("BEGIN");
    await expect(client.query(migrationSql)).rejects.toThrow(blocker.expectedError);
    await client.query("ROLLBACK");

    const preserved = await client.query(blocker.verifySql);
    expect(preserved.rows).toHaveLength(1);
    if (blocker.surface === "workspaceSettings")
      expect(preserved.rows[0]?.value).toBe("papi");
    else expect(preserved.rows[0]?.provider).toMatch(/^(meta|papi)$/);

    const enumLabels = await client.query<{ enumlabel: string }>(`
      SELECT enumlabel
        FROM pg_enum
       WHERE enumtypid = 'public.whatsapp_provider'::regtype
       ORDER BY enumsortorder
    `);
    expect(enumLabels.rows.map(row => row.enumlabel)).toEqual([
      "baileys",
      "papi",
      "meta",
    ]);
  });
});
