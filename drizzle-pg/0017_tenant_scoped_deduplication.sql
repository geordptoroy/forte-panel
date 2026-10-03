ALTER TABLE "auditLogs" ADD COLUMN "workspaceId" integer;

UPDATE "auditLogs" AS audit
SET "workspaceId" = contacts."workspaceId"
FROM "contacts" AS contacts
WHERE audit."contactId" = contacts."id"
  AND contacts."workspaceId" IS NOT NULL;

UPDATE "auditLogs" AS audit
SET "workspaceId" = membership."workspaceId"
FROM "workspaceMembers" AS membership
WHERE audit."workspaceId" IS NULL
  AND audit."actorUserId" = membership."userId"
  AND membership."active" = 1
  AND (SELECT count(*) FROM "workspaceMembers" AS candidate WHERE candidate."userId" = audit."actorUserId" AND candidate."active" = 1) = 1;

-- Legacy rows without a contact or a uniquely active member have no proven owner.
-- Use a workspace fallback only when the database contains exactly one workspace;
-- otherwise fail before changing tenant-scoped constraints rather than guessing.
DO $$
DECLARE
  workspace_count bigint;
  sole_workspace_id integer;
  unresolved_audit_logs bigint;
  unresolved_idempotency bigint;
  unresolved_webhooks bigint;
BEGIN
  SELECT count(*), min("id")
    INTO workspace_count, sole_workspace_id
    FROM "workspaces";

  IF workspace_count = 1 THEN
    UPDATE "auditLogs" SET "workspaceId" = sole_workspace_id WHERE "workspaceId" IS NULL;
    UPDATE "apiIdempotency" SET "workspaceId" = sole_workspace_id WHERE "workspaceId" IS NULL;
    UPDATE "webhookEvents" SET "workspaceId" = sole_workspace_id WHERE "workspaceId" IS NULL;
  END IF;

  SELECT count(*) INTO unresolved_audit_logs FROM "auditLogs" WHERE "workspaceId" IS NULL;
  SELECT count(*) INTO unresolved_idempotency FROM "apiIdempotency" WHERE "workspaceId" IS NULL;
  SELECT count(*) INTO unresolved_webhooks FROM "webhookEvents" WHERE "workspaceId" IS NULL;

  IF unresolved_audit_logs > 0 OR unresolved_idempotency > 0 OR unresolved_webhooks > 0 THEN
    RAISE EXCEPTION
      'Migration 0017 cannot infer tenant ownership safely (auditLogs=%, apiIdempotency=%, webhookEvents=%, workspaces=%). Resolve legacy ownership before retrying; no demo workspace fallback is permitted.',
      unresolved_audit_logs,
      unresolved_idempotency,
      unresolved_webhooks,
      workspace_count;
  END IF;
END $$;

ALTER TABLE "apiIdempotency" DROP CONSTRAINT "apiIdempotency_key_unique";
ALTER TABLE "apiIdempotency" ALTER COLUMN "workspaceId" SET NOT NULL;
CREATE UNIQUE INDEX "api_idempotency_workspace_key_unique_idx" ON "apiIdempotency" ("workspaceId", "key");

ALTER TABLE "webhookEvents" DROP CONSTRAINT "webhookEvents_eventId_unique";
ALTER TABLE "webhookEvents" ALTER COLUMN "workspaceId" SET NOT NULL;
CREATE UNIQUE INDEX "webhook_events_workspace_event_unique_idx" ON "webhookEvents" ("workspaceId", "eventId");

ALTER TABLE "domainEvents" DROP CONSTRAINT "domainEvents_eventKey_unique";
CREATE UNIQUE INDEX "domain_events_workspace_key_unique_idx" ON "domainEvents" ("workspaceId", "eventKey");

ALTER TABLE "auditLogs" ALTER COLUMN "workspaceId" SET NOT NULL;
CREATE INDEX "audit_logs_workspace_created_idx" ON "auditLogs" ("workspaceId", "createdAt", "id");
