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

describe.skipIf(!localDatabaseUrl)("migration 0043 Baileys-only purge", () => {
  const databaseName = `forte_panel_0043_purge_${process.pid}_${Date.now()}`;
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
      CREATE TABLE public."whatsappChannels" (
        "id" serial PRIMARY KEY,
        "provider" public.whatsapp_provider NOT NULL
      );
      CREATE TABLE public."whatsappInstances" (
        "id" serial PRIMARY KEY,
        "workspaceId" integer NOT NULL DEFAULT 1,
        "instanceId" text NOT NULL DEFAULT 'fixture-instance',
        "active" integer NOT NULL DEFAULT 1,
        "isDefault" integer NOT NULL DEFAULT 1,
        "provider" public.whatsapp_provider NOT NULL
      );
      CREATE TABLE public."messages" (
        "id" serial PRIMARY KEY,
        "provider" public.whatsapp_provider NOT NULL
      );
      CREATE TABLE public."webhookEvents" (
        "id" serial PRIMARY KEY,
        "provider" text NOT NULL DEFAULT 'whatsapp'
      );
      CREATE TABLE public."workspaceSettings" (
        "id" serial PRIMARY KEY,
        "key" text NOT NULL,
        "value" text
      );
    `);
  }, 30_000);

  afterAll(async () => {
    await testClient?.end().catch(() => undefined);
    if (adminClient) {
      await adminClient
        .query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`)
        .catch(() => undefined);
      await adminClient.end().catch(() => undefined);
    }
  }, 30_000);

  it("purges non-Baileys provider rows and leaves the schema Baileys-only", async () => {
    const client = testClient;
    if (!client) throw new Error("isolated local test database unavailable");

    await client.query(`
      INSERT INTO public."whatsappChannels" ("provider") VALUES ('baileys'), ('meta');
      INSERT INTO public."whatsappInstances" ("provider") VALUES ('baileys'), ('papi');
      INSERT INTO public."messages" ("provider") VALUES ('baileys'), ('meta');
      INSERT INTO public."webhookEvents" ("provider") VALUES ('baileys'), ('whatsapp');
      INSERT INTO public."workspaceSettings" ("key", "value")
        VALUES ('default_whatsapp_provider', 'papi'), ('notification_preferences', '{}');
    `);

    await client.query(migrationSql);

    await expect(
      client.query(`SELECT "provider"::text AS provider FROM public."whatsappChannels"`)
    ).resolves.toMatchObject({ rows: [{ provider: "baileys" }] });
    await expect(
      client.query(`SELECT "provider"::text AS provider FROM public."whatsappInstances"`)
    ).resolves.toMatchObject({ rows: [{ provider: "baileys" }] });
    await expect(
      client.query(`SELECT "provider"::text AS provider FROM public."messages"`)
    ).resolves.toMatchObject({ rows: [{ provider: "baileys" }] });
    await expect(
      client.query(`SELECT "provider" FROM public."webhookEvents"`)
    ).resolves.toMatchObject({ rows: [{ provider: "baileys" }] });
    await expect(
      client.query(`SELECT "key" FROM public."workspaceSettings" ORDER BY "key"`)
    ).resolves.toMatchObject({ rows: [{ key: "notification_preferences" }] });

    const enumLabels = await client.query<{ enumlabel: string }>(`
      SELECT enumlabel
        FROM pg_enum
       WHERE enumtypid = 'public.whatsapp_provider'::regtype
       ORDER BY enumsortorder
    `);
    expect(enumLabels.rows.map(row => row.enumlabel)).toEqual(["baileys"]);

    const webhookConstraint = await client.query(`
      SELECT 1
        FROM pg_constraint
       WHERE conname = 'webhook_events_operational_provider_check'
    `);
    expect(webhookConstraint.rowCount).toBe(1);
  });
});
