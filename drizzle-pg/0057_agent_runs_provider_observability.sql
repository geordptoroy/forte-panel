BEGIN;

ALTER TABLE "agentRuns"
  ADD COLUMN IF NOT EXISTS "provider" varchar(80),
  ADD COLUMN IF NOT EXISTS "capability" varchar(32),
  ADD COLUMN IF NOT EXISTS "providerAttempts" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "failureCode" varchar(80),
  ADD COLUMN IF NOT EXISTS "transcriptionProvider" varchar(80),
  ADD COLUMN IF NOT EXISTS "transcriptionAttempts" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "mediaAnalysisProvider" varchar(80),
  ADD COLUMN IF NOT EXISTS "mediaAnalysisAttempts" integer DEFAULT 0 NOT NULL;

CREATE INDEX IF NOT EXISTS "agent_runs_workspace_provider_idx"
  ON "agentRuns" ("workspaceId", "provider", "createdAt");

COMMIT;
