CREATE TABLE IF NOT EXISTS "agentRuns" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL,
  "eventId" varchar(180) NOT NULL,
  "contactId" integer NOT NULL,
  "model" varchar(180),
  "outcome" varchar(40) NOT NULL,
  "steps" integer NOT NULL DEFAULT 0,
  "toolCalls" integer NOT NULL DEFAULT 0,
  "transferred" integer NOT NULL DEFAULT 0,
  "pendingConfirmation" integer NOT NULL DEFAULT 0,
  "inputTokens" integer,
  "outputTokens" integer,
  "totalTokens" integer,
  "latencyMs" integer NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "agent_runs_workspace_event_unique" UNIQUE ("workspaceId", "eventId")
);
CREATE INDEX IF NOT EXISTS "agent_runs_workspace_created_idx" ON "agentRuns" ("workspaceId", "createdAt");
