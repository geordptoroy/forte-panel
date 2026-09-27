DO $$ BEGIN
 CREATE TYPE "public"."workspace_invite_status" AS ENUM('pending', 'sent', 'accepted', 'expired', 'revoked', 'replaced');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workspaceInvites" (
  "id" serial PRIMARY KEY NOT NULL,
  "workspaceId" integer NOT NULL,
  "email" varchar(320) NOT NULL,
  "inviteeName" varchar(160),
  "role" "workspace_member_role" DEFAULT 'agent' NOT NULL,
  "operationalRole" "operational_role" DEFAULT 'human_attendant' NOT NULL,
  "professionalId" integer,
  "scope" varchar(80) DEFAULT 'workspace' NOT NULL,
  "tokenHash" varchar(64) NOT NULL,
  "status" "workspace_invite_status" DEFAULT 'pending' NOT NULL,
  "expiresAt" timestamp NOT NULL,
  "invitedByUserId" integer NOT NULL,
  "acceptedByUserId" integer,
  "acceptedAt" timestamp,
  "revokedAt" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "workspaceInvites_tokenHash_unique" UNIQUE("tokenHash")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_invites_pending_email_unique_idx"
  ON "workspaceInvites" ("workspaceId", "email")
  WHERE "status" IN ('pending', 'sent');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_invites_workspace_status_idx"
  ON "workspaceInvites" ("workspaceId", "status", "expiresAt");
