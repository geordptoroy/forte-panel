CREATE TABLE IF NOT EXISTS "onboardingStepAnswerRevisions" (
  "id" serial PRIMARY KEY NOT NULL,
  "answerId" integer NOT NULL,
  "sessionId" integer NOT NULL,
  "workspaceId" integer NOT NULL,
  "stepKey" varchar(80) NOT NULL,
  "answer" text NOT NULL,
  "status" varchar(24) DEFAULT 'draft' NOT NULL,
  "changedBy" integer,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onboarding_step_answer_revisions_answer_idx"
  ON "onboardingStepAnswerRevisions" ("answerId", "createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onboarding_step_answer_revisions_workspace_idx"
  ON "onboardingStepAnswerRevisions" ("workspaceId", "stepKey", "createdAt");
