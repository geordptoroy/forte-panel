CREATE TABLE IF NOT EXISTS "onboardingSessions" (
  "id" serial PRIMARY KEY NOT NULL,
  "workspaceId" integer NOT NULL UNIQUE,
  "ownerUserId" integer NOT NULL,
  "status" varchar(24) DEFAULT 'active' NOT NULL,
  "currentStep" varchar(80) DEFAULT 'identity' NOT NULL,
  "startedAt" timestamp DEFAULT now() NOT NULL,
  "lastActivityAt" timestamp DEFAULT now() NOT NULL,
  "pausedAt" timestamp,
  "completedAt" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onboarding_sessions_status_idx"
  ON "onboardingSessions" ("status", "lastActivityAt");
