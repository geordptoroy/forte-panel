CREATE TABLE IF NOT EXISTS "onboardingSourceConsents" (
  "id" serial PRIMARY KEY NOT NULL,
  "workspaceId" integer NOT NULL,
  "userId" integer NOT NULL,
  "source" varchar(24) NOT NULL,
  "purpose" varchar(80) NOT NULL,
  "policyVersion" varchar(64) NOT NULL,
  "status" varchar(16) NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onboarding_source_consents_workspace_idx"
  ON "onboardingSourceConsents" ("workspaceId", "source", "createdAt");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "onboardingRetentionPolicies" (
  "id" serial PRIMARY KEY NOT NULL,
  "workspaceId" integer NOT NULL UNIQUE,
  "rawArtifactDays" integer DEFAULT 30 NOT NULL,
  "derivedDataDays" integer DEFAULT 180 NOT NULL,
  "policyVersion" varchar(64) NOT NULL,
  "updatedBy" integer NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onboarding_retention_policies_workspace_idx"
  ON "onboardingRetentionPolicies" ("workspaceId");
