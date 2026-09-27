CREATE TABLE IF NOT EXISTS "onboardingStepAnswers" (
  "id" serial PRIMARY KEY NOT NULL,
  "sessionId" integer NOT NULL,
  "workspaceId" integer NOT NULL,
  "stepKey" varchar(80) NOT NULL,
  "answer" text NOT NULL,
  "source" varchar(24) DEFAULT 'form' NOT NULL,
  "status" varchar(24) DEFAULT 'draft' NOT NULL,
  "updatedBy" integer,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "onboarding_step_answers_session_step_unique" UNIQUE("sessionId", "stepKey")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onboarding_step_answers_workspace_idx"
  ON "onboardingStepAnswers" ("workspaceId", "updatedAt");
