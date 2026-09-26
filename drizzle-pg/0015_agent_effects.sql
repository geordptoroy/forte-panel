CREATE TABLE "agentEffects" (
  "id" serial PRIMARY KEY NOT NULL,
  "workspaceId" integer NOT NULL,
  "eventId" varchar(180) NOT NULL,
  "toolCallId" varchar(180) NOT NULL,
  "toolName" varchar(100) NOT NULL,
  "fingerprint" varchar(128) NOT NULL,
  "status" varchar(20) DEFAULT 'processing' NOT NULL,
  "result" text,
  "leaseUntil" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "agent_effects_event_tool_unique_idx" UNIQUE("workspaceId", "eventId", "toolCallId")
);
CREATE INDEX "agent_effects_lease_idx" ON "agentEffects" ("status", "leaseUntil", "id");
