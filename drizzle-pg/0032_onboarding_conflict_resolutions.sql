CREATE TABLE IF NOT EXISTS "onboardingConflictResolutions" (
  "id" serial PRIMARY KEY NOT NULL,
  "answerId" integer NOT NULL,
  "sessionId" integer NOT NULL,
  "workspaceId" integer NOT NULL,
  "stepKey" varchar(80) NOT NULL,
  "conflictKey" varchar(160) NOT NULL,
  "resolution" varchar(32) NOT NULL,
  "note" text NOT NULL,
  "answerSnapshot" text NOT NULL,
  "resolvedBy" integer NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onboarding_conflict_resolutions_answer_idx"
  ON "onboardingConflictResolutions" ("answerId", "createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onboarding_conflict_resolutions_workspace_idx"
  ON "onboardingConflictResolutions" ("workspaceId", "stepKey", "createdAt");
