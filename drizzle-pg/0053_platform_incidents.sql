CREATE TABLE IF NOT EXISTS "platformIncidents" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL,
  "severity" varchar(20) NOT NULL DEFAULT 'medium',
  "status" varchar(20) NOT NULL DEFAULT 'open',
  "title" varchar(180) NOT NULL,
  "details" text NOT NULL,
  "openedByPlatformAdminId" integer NOT NULL,
  "resolvedByPlatformAdminId" integer,
  "resolvedAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "platform_incidents_workspace_status_idx" ON "platformIncidents" ("workspaceId", "status", "createdAt");
