CREATE TABLE IF NOT EXISTS "consentRecords" (
  "id" serial PRIMARY KEY NOT NULL,
  "userId" integer NOT NULL,
  "workspaceId" integer NOT NULL,
  "termsVersion" varchar(64) NOT NULL,
  "privacyVersion" varchar(64) NOT NULL,
  "acceptedAt" timestamp DEFAULT now() NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "consent_records_user_idx"
  ON "consentRecords" ("userId", "createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "consent_records_workspace_idx"
  ON "consentRecords" ("workspaceId", "createdAt");
