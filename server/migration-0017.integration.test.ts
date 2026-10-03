import { readFileSync } from "node:fs";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

const hasDatabase = Boolean(
  process.env.DATABASE_URL && /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL)
);
const migrationSql = readFileSync(
  new URL("../drizzle-pg/0017_tenant_scoped_deduplication.sql", import.meta.url),
  "utf8"
);

async function withMigrationFixture(
  seed: (client: Client) => Promise<void>,
  run: (client: Client) => Promise<void>
) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  const schemaName = `migration_0017_${process.pid}_${Date.now()}`;
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA "${schemaName}"`);
    await client.query(`SET LOCAL search_path TO "${schemaName}"`);
    await client.query(`
      CREATE TABLE "workspaces" (
        "id" serial PRIMARY KEY,
        "name" text NOT NULL,
        "slug" text NOT NULL UNIQUE
      );
      CREATE TABLE "contacts" (
        "id" serial PRIMARY KEY,
        "workspaceId" integer
      );
      CREATE TABLE "workspaceMembers" (
        "id" serial PRIMARY KEY,
        "workspaceId" integer NOT NULL,
        "userId" integer NOT NULL,
        "active" integer NOT NULL DEFAULT 1
      );
      CREATE TABLE "auditLogs" (
        "id" serial PRIMARY KEY,
        "actorUserId" integer,
        "contactId" integer,
        "action" text NOT NULL,
        "summary" text NOT NULL,
        "createdAt" timestamp NOT NULL DEFAULT now()
      );
      CREATE TABLE "apiIdempotency" (
        "id" serial PRIMARY KEY,
        "workspaceId" integer,
        "key" varchar(180) NOT NULL,
        "fingerprint" varchar(128) NOT NULL,
        CONSTRAINT "apiIdempotency_key_unique" UNIQUE ("key")
      );
      CREATE TABLE "webhookEvents" (
        "id" serial PRIMARY KEY,
        "workspaceId" integer,
        "eventId" varchar(180) NOT NULL,
        "provider" varchar(60) NOT NULL DEFAULT 'whatsapp',
        "payload" text NOT NULL,
        CONSTRAINT "webhookEvents_eventId_unique" UNIQUE ("eventId")
      );
      CREATE TABLE "domainEvents" (
        "id" serial PRIMARY KEY,
        "workspaceId" integer NOT NULL,
        "eventKey" varchar(180) NOT NULL,
        CONSTRAINT "domainEvents_eventKey_unique" UNIQUE ("eventKey")
      );
    `);
    await seed(client);
    await run(client);
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.end();
  }
}

describe.skipIf(!hasDatabase)("migration 0017 tenant backfill", () => {
  it("backfills rows without a demo workspace when exactly one tenant exists", async () => {
    await withMigrationFixture(
      async client => {
        await client.query(
          `INSERT INTO "workspaces" ("name", "slug") VALUES ('Tenant real', 'tenant-real-fixture')`
        );
        await client.query(
          `INSERT INTO "contacts" ("workspaceId") VALUES (1)`
        );
        await client.query(
          `INSERT INTO "auditLogs" ("contactId", "action", "summary") VALUES (1, 'fixture', 'legado com contacto')`
        );
        await client.query(
          `INSERT INTO "apiIdempotency" ("key", "fingerprint") VALUES ('fixture-key', 'fixture-hash')`
        );
        await client.query(
          `INSERT INTO "webhookEvents" ("eventId", "payload") VALUES ('fixture-event-001', '{}')`
        );
      },
      async client => {
        await client.query(migrationSql);
        const result = await client.query(`
          SELECT
            (SELECT "workspaceId" FROM "auditLogs" LIMIT 1) AS audit_workspace,
            (SELECT "workspaceId" FROM "apiIdempotency" LIMIT 1) AS idempotency_workspace,
            (SELECT "workspaceId" FROM "webhookEvents" LIMIT 1) AS webhook_workspace
        `);
        expect(result.rows[0]).toEqual({
          audit_workspace: 1,
          idempotency_workspace: 1,
          webhook_workspace: 1,
        });
      }
    );
  });

  it("fails with a diagnostic instead of guessing when legacy ownership is ambiguous", async () => {
    await withMigrationFixture(
      async client => {
        await client.query(`
          INSERT INTO "workspaces" ("name", "slug") VALUES
            ('Tenant A', 'tenant-a-fixture'),
            ('Tenant B', 'tenant-b-fixture');
          INSERT INTO "apiIdempotency" ("key", "fingerprint")
            VALUES ('ambiguous-key', 'ambiguous-hash');
        `);
      },
      async client => {
        await client.query("SAVEPOINT before_migration_0017");
        await expect(client.query(migrationSql)).rejects.toThrow(
          "cannot infer tenant ownership safely"
        );
        await client.query("ROLLBACK TO SAVEPOINT before_migration_0017");
      }
    );
  });
});
