ALTER TABLE "opportunities"
  ADD COLUMN IF NOT EXISTS "assignedMemberId" integer REFERENCES "workspaceMembers"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "opportunities_workspace_assignee_updated_idx"
  ON "opportunities" ("workspaceId", "assignedMemberId", "updatedAt");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "opportunityFollowUps" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "opportunityId" integer NOT NULL REFERENCES "opportunities"("id") ON DELETE CASCADE,
  "title" varchar(180) NOT NULL,
  "dueAt" timestamp NOT NULL,
  "status" varchar(16) NOT NULL DEFAULT 'open',
  "createdByUserId" integer NOT NULL,
  "completedByUserId" integer,
  "completedAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "opportunity_follow_ups_status_check"
    CHECK ("status" IN ('open', 'completed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "opportunity_follow_ups_one_open_unique_idx"
  ON "opportunityFollowUps" ("workspaceId", "opportunityId")
  WHERE "status" = 'open';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "opportunity_follow_ups_open_due_idx"
  ON "opportunityFollowUps" ("workspaceId", "dueAt", "opportunityId")
  WHERE "status" = 'open';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "opportunity_follow_ups_history_idx"
  ON "opportunityFollowUps" ("workspaceId", "opportunityId", "createdAt");
