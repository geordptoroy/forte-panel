CREATE TABLE IF NOT EXISTS "onboardingTelemetryEvents" (
  "id" serial PRIMARY KEY NOT NULL,
  "workspaceId" integer NOT NULL,
  "sessionId" integer NOT NULL,
  "eventType" varchar(64) NOT NULL,
  "stepKey" varchar(80),
  "source" varchar(24),
  "durationMs" integer,
  "inputTokens" integer,
  "outputTokens" integer,
  "totalTokens" integer,
  "correction" integer DEFAULT 0 NOT NULL,
  "metadata" jsonb,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onboarding_telemetry_workspace_created_idx"
  ON "onboardingTelemetryEvents" ("workspaceId", "createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onboarding_telemetry_session_event_idx"
  ON "onboardingTelemetryEvents" ("sessionId", "eventType", "createdAt");
