ALTER TABLE "workspaceMembers"
  ADD COLUMN IF NOT EXISTS "jobTitle" varchar(160),
  ADD COLUMN IF NOT EXISTS "canRegisterPayments" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "workspaceInvites"
  ADD COLUMN IF NOT EXISTS "jobTitle" varchar(160),
  ADD COLUMN IF NOT EXISTS "canRegisterPayments" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE "workspaceMembers"
SET "canRegisterPayments" = 1
WHERE "role" IN ('owner', 'admin', 'manager');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_members_payment_access_idx"
  ON "workspaceMembers" ("workspaceId", "canRegisterPayments", "active");
