CREATE TABLE IF NOT EXISTS "conversationReads" (
  "id" serial PRIMARY KEY NOT NULL,
  "workspaceId" integer NOT NULL,
  "conversationId" integer NOT NULL,
  "userId" integer NOT NULL,
  "lastReadMessageId" integer,
  "readAt" timestamp DEFAULT now() NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "conversation_reads_user_unique_idx"
  ON "conversationReads" ("workspaceId", "conversationId", "userId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversation_reads_workspace_user_idx"
  ON "conversationReads" ("workspaceId", "userId", "updatedAt");
