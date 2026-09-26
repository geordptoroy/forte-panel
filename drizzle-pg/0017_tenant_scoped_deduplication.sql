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

UPDATE "auditLogs"
SET "workspaceId" = (SELECT "id" FROM "workspaces" WHERE "slug" = 'forte-demo' LIMIT 1)
WHERE "workspaceId" IS NULL;

ALTER TABLE "apiIdempotency" DROP CONSTRAINT "apiIdempotency_key_unique";
UPDATE "apiIdempotency" SET "workspaceId" = (SELECT "id" FROM "workspaces" WHERE "slug" = 'forte-demo' LIMIT 1) WHERE "workspaceId" IS NULL;
ALTER TABLE "apiIdempotency" ALTER COLUMN "workspaceId" SET NOT NULL;
CREATE UNIQUE INDEX "api_idempotency_workspace_key_unique_idx" ON "apiIdempotency" ("workspaceId", "key");

ALTER TABLE "webhookEvents" DROP CONSTRAINT "webhookEvents_eventId_unique";
UPDATE "webhookEvents" SET "workspaceId" = (SELECT "id" FROM "workspaces" WHERE "slug" = 'forte-demo' LIMIT 1) WHERE "workspaceId" IS NULL;
ALTER TABLE "webhookEvents" ALTER COLUMN "workspaceId" SET NOT NULL;
CREATE UNIQUE INDEX "webhook_events_workspace_event_unique_idx" ON "webhookEvents" ("workspaceId", "eventId");

ALTER TABLE "domainEvents" DROP CONSTRAINT "domainEvents_eventKey_unique";
CREATE UNIQUE INDEX "domain_events_workspace_key_unique_idx" ON "domainEvents" ("workspaceId", "eventKey");

ALTER TABLE "auditLogs" ALTER COLUMN "workspaceId" SET NOT NULL;
CREATE INDEX "audit_logs_workspace_created_idx" ON "auditLogs" ("workspaceId", "createdAt", "id");
