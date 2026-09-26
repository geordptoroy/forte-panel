CREATE TYPE "public"."workspace_status" AS ENUM('onboarding', 'active', 'suspended');
CREATE TYPE "public"."platform_permission" AS ENUM('platform_admin', 'platform_support_readonly', 'platform_support_operator');
CREATE TYPE "public"."support_session_mode" AS ENUM('read_only', 'operator');
CREATE TYPE "public"."support_session_status" AS ENUM('active', 'expired', 'revoked');
CREATE TYPE "public"."agent_prompt_status" AS ENUM('draft', 'published', 'archived');
CREATE TYPE "public"."agent_simulation_status" AS ENUM('queued', 'completed', 'failed');
CREATE TYPE "public"."platform_audit_result" AS ENUM('success', 'failure');
CREATE TYPE "public"."worker_heartbeat_status" AS ENUM('healthy', 'degraded');

ALTER TABLE "workspaces" ADD COLUMN "status" "workspace_status" DEFAULT 'active' NOT NULL;

CREATE TABLE "platformAdmins" (
  "id" serial PRIMARY KEY NOT NULL,
  "userId" integer NOT NULL,
  "permission" "platform_permission" DEFAULT 'platform_admin' NOT NULL,
  "active" integer DEFAULT 1 NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "platform_admins_user_unique_idx" ON "platformAdmins" ("userId");
CREATE INDEX "platform_admins_active_idx" ON "platformAdmins" ("active", "permission");

CREATE TABLE "supportSessions" (
  "id" serial PRIMARY KEY NOT NULL,
  "platformAdminId" integer NOT NULL,
  "workspaceId" integer NOT NULL,
  "mode" "support_session_mode" DEFAULT 'read_only' NOT NULL,
  "status" "support_session_status" DEFAULT 'active' NOT NULL,
  "scope" varchar(80) DEFAULT 'workspace' NOT NULL,
  "reason" varchar(500) NOT NULL,
  "startedAt" timestamp DEFAULT now() NOT NULL,
  "expiresAt" timestamp NOT NULL,
  "revokedAt" timestamp,
  "revokedByUserId" integer,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX "support_sessions_workspace_status_idx" ON "supportSessions" ("workspaceId", "status", "expiresAt");
CREATE INDEX "support_sessions_admin_idx" ON "supportSessions" ("platformAdminId", "status", "expiresAt");

CREATE TABLE "agentPromptVersions" (
  "id" serial PRIMARY KEY NOT NULL,
  "workspaceId" integer NOT NULL,
  "version" integer NOT NULL,
  "status" "agent_prompt_status" DEFAULT 'published' NOT NULL,
  "prompt" text NOT NULL,
  "configuration" text NOT NULL,
  "reason" varchar(500) NOT NULL,
  "createdByPlatformAdminId" integer NOT NULL,
  "rollbackOfId" integer,
  "publishedAt" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "agent_prompt_versions_workspace_version_unique_idx" ON "agentPromptVersions" ("workspaceId", "version");
CREATE INDEX "agent_prompt_versions_workspace_status_idx" ON "agentPromptVersions" ("workspaceId", "status", "version");

CREATE TABLE "agentPromptDrafts" (
  "id" serial PRIMARY KEY NOT NULL,
  "workspaceId" integer NOT NULL,
  "status" "agent_prompt_status" DEFAULT 'draft' NOT NULL,
  "prompt" text NOT NULL,
  "configuration" text NOT NULL,
  "createdByPlatformAdminId" integer NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "agent_prompt_drafts_workspace_unique_idx" ON "agentPromptDrafts" ("workspaceId");
CREATE INDEX "agent_prompt_drafts_status_idx" ON "agentPromptDrafts" ("status", "updatedAt");

CREATE TABLE "agentSimulationRuns" (
  "id" serial PRIMARY KEY NOT NULL,
  "workspaceId" integer NOT NULL,
  "platformAdminId" integer NOT NULL,
  "draftId" integer,
  "versionId" integer,
  "status" "agent_simulation_status" DEFAULT 'queued' NOT NULL,
  "input" text NOT NULL,
  "output" text,
  "providerCalled" integer DEFAULT 0 NOT NULL,
  "error" text,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX "agent_simulation_runs_workspace_created_idx" ON "agentSimulationRuns" ("workspaceId", "createdAt");

CREATE TABLE "platformAuditLogs" (
  "id" serial PRIMARY KEY NOT NULL,
  "platformAdminId" integer NOT NULL,
  "workspaceId" integer,
  "supportSessionId" integer,
  "action" varchar(120) NOT NULL,
  "scope" varchar(120) NOT NULL,
  "reason" varchar(500) NOT NULL,
  "summary" varchar(500) NOT NULL,
  "beforeData" text,
  "afterData" text,
  "result" "platform_audit_result" DEFAULT 'success' NOT NULL,
  "requestId" varchar(160),
  "ipAddress" varchar(64),
  "createdAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX "platform_audit_workspace_created_idx" ON "platformAuditLogs" ("workspaceId", "createdAt", "id");
CREATE INDEX "platform_audit_admin_created_idx" ON "platformAuditLogs" ("platformAdminId", "createdAt", "id");

CREATE TABLE "platformWorkspaceNotes" (
  "id" serial PRIMARY KEY NOT NULL,
  "platformAdminId" integer NOT NULL,
  "workspaceId" integer NOT NULL,
  "supportSessionId" integer NOT NULL,
  "body" text NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX "platform_workspace_notes_workspace_created_idx" ON "platformWorkspaceNotes" ("workspaceId", "createdAt", "id");

CREATE TABLE "workerHeartbeats" (
  "id" serial PRIMARY KEY NOT NULL,
  "service" varchar(120) NOT NULL,
  "status" "worker_heartbeat_status" DEFAULT 'healthy' NOT NULL,
  "ticks" integer DEFAULT 0 NOT NULL,
  "intervalMs" integer NOT NULL,
  "lastError" varchar(180),
  "observedAt" timestamp DEFAULT now() NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "worker_heartbeats_service_unique_idx" ON "workerHeartbeats" ("service");
CREATE INDEX "worker_heartbeats_observed_idx" ON "workerHeartbeats" ("observedAt");
