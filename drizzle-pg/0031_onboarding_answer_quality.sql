ALTER TABLE "onboardingStepAnswers"
  ADD COLUMN IF NOT EXISTS "confidence" integer,
  ADD COLUMN IF NOT EXISTS "missing" text DEFAULT '[]' NOT NULL,
  ADD COLUMN IF NOT EXISTS "conflicts" text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE "onboardingStepAnswers"
  ALTER COLUMN "source" SET DEFAULT 'human_form';
--> statement-breakpoint
ALTER TABLE "onboardingStepAnswerRevisions"
  ADD COLUMN IF NOT EXISTS "source" varchar(24) DEFAULT 'human_form' NOT NULL,
  ADD COLUMN IF NOT EXISTS "confidence" integer,
  ADD COLUMN IF NOT EXISTS "missing" text DEFAULT '[]' NOT NULL,
  ADD COLUMN IF NOT EXISTS "conflicts" text DEFAULT '[]' NOT NULL;
