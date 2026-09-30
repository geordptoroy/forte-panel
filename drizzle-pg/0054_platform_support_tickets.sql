CREATE TABLE IF NOT EXISTS "platformSupportTickets" (
  "id" serial PRIMARY KEY, "workspaceId" integer NOT NULL, "supportSessionId" integer NOT NULL,
  "openedByPlatformAdminId" integer NOT NULL, "assignedToPlatformAdminId" integer,
  "status" varchar(20) NOT NULL DEFAULT 'open', "priority" varchar(20) NOT NULL DEFAULT 'normal',
  "subject" varchar(180) NOT NULL, "description" text NOT NULL, "resolution" text,
  "closedAt" timestamp, "closedByPlatformAdminId" integer,
  "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "platform_support_tickets_workspace_status_idx" ON "platformSupportTickets" ("workspaceId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "platform_support_tickets_session_idx" ON "platformSupportTickets" ("supportSessionId", "createdAt");
