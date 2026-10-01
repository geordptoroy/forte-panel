BEGIN;
ALTER TABLE "contacts"
  ADD COLUMN IF NOT EXISTS "assignedUserId" integer,
  ADD COLUMN IF NOT EXISTS "followUpAt" timestamp,
  ADD COLUMN IF NOT EXISTS "followUpNote" varchar(500),
  ADD COLUMN IF NOT EXISTS "followUpCompletedAt" timestamp;
CREATE INDEX IF NOT EXISTS "contacts_workspace_assignment_idx"
  ON "contacts" ("workspaceId", "assignedUserId", "followUpAt");
COMMIT;
