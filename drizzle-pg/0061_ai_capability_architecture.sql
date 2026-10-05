DO $$ BEGIN
  CREATE TYPE "public"."ai_capability" AS ENUM(
    'text',
    'moderation',
    'prompt_generation',
    'vision',
    'stt',
    'tts',
    'documents',
    'embeddings'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."ai_model_source" AS ENUM('catalog', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."ai_model_status" AS ENUM('active', 'unavailable');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."ai_route_failure_action" AS ENUM('skip', 'text', 'human', 'fail');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."global_prompt_status" AS ENUM('draft', 'published', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "aiConnections" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" varchar(120) NOT NULL,
  "baseUrl" varchar(500) NOT NULL,
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
CREATE UNIQUE INDEX IF NOT EXISTS "ai_connections_name_unique_idx"
  ON "aiConnections" ("name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_connections_active_idx"
  ON "aiConnections" ("active");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "aiModels" (
  "id" serial PRIMARY KEY NOT NULL,
  "connectionId" integer NOT NULL,
  "remoteModelId" varchar(200) NOT NULL,
  "displayName" varchar(200),
  "source" "ai_model_source" DEFAULT 'manual' NOT NULL,
  "status" "ai_model_status" DEFAULT 'active' NOT NULL,
  "detectedCapabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "active" integer DEFAULT 1 NOT NULL,
  "lastSeenAt" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_models_connection_remote_id_unique_idx"
  ON "aiModels" ("connectionId", "remoteModelId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_models_connection_status_idx"
  ON "aiModels" ("connectionId", "status", "active");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "aiCapabilityRoutes" (
  "id" serial PRIMARY KEY NOT NULL,
  "capability" "ai_capability" NOT NULL,
  "primaryModelId" integer,
  "fallbackModelIds" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "enabled" integer DEFAULT 1 NOT NULL,
  "onFailure" "ai_route_failure_action" DEFAULT 'text' NOT NULL,
  "createdBy" integer,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_capability_routes_capability_unique_idx"
  ON "aiCapabilityRoutes" ("capability");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_capability_routes_enabled_idx"
  ON "aiCapabilityRoutes" ("enabled");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "globalPrompts" (
  "id" serial PRIMARY KEY NOT NULL,
  "topic" varchar(120) NOT NULL,
  "capability" "ai_capability",
  "version" integer NOT NULL,
  "status" "global_prompt_status" DEFAULT 'draft' NOT NULL,
  "prompt" text NOT NULL,
  "impact" text,
  "reason" varchar(500) NOT NULL,
  "createdBy" integer,
  "rollbackOfId" integer,
  "publishedAt" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "global_prompts_topic_version_unique_idx"
  ON "globalPrompts" ("topic", "version");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "global_prompts_topic_status_idx"
  ON "globalPrompts" ("topic", "status", "version");
