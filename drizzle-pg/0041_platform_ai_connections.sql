DO $$ BEGIN
  CREATE TYPE "public"."platform_ai_connection_capability" AS ENUM(
    'whatsapp_reply',
    'audio_transcription',
    'image_analysis',
    'document_analysis',
    'admin_support'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "platformAiConnections" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" varchar(120) NOT NULL,
  "capability" "platform_ai_connection_capability" NOT NULL,
  "provider" varchar(80) NOT NULL,
  "baseUrl" varchar(500) NOT NULL,
  "model" varchar(200) NOT NULL,
  "encryptedApiKey" text NOT NULL,
  "active" integer DEFAULT 1 NOT NULL,
  "status" varchar(40) DEFAULT 'pending' NOT NULL,
  "lastTestedAt" timestamp,
  "lastError" text,
  "createdBy" integer,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "platform_ai_connections_name_unique_idx"
  ON "platformAiConnections" ("name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "platform_ai_connections_capability_idx"
  ON "platformAiConnections" ("capability", "active");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "platform_ai_connections_active_capability_unique_idx"
  ON "platformAiConnections" ("capability")
  WHERE "active" = 1;
