CREATE TABLE IF NOT EXISTS "onboardingPublishedVersions" (
  "id" serial PRIMARY KEY NOT NULL,
  "workspaceId" integer NOT NULL,
  "version" integer NOT NULL,
  "profile" text NOT NULL,
  "prompt" text NOT NULL,
  "publishedBy" integer NOT NULL,
  "rollbackOfId" integer,
  "publishedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "onboarding_published_versions_workspace_version_idx"
  ON "onboardingPublishedVersions" ("workspaceId", "version");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onboarding_published_versions_workspace_published_idx"
  ON "onboardingPublishedVersions" ("workspaceId", "publishedAt");
