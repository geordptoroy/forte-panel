CREATE TABLE IF NOT EXISTS "onboardingAudioAssets" (
  "id" serial PRIMARY KEY NOT NULL,
  "sessionId" integer NOT NULL,
  "workspaceId" integer NOT NULL,
  "stepKey" varchar(80) NOT NULL,
  "storageKey" varchar(512) NOT NULL UNIQUE,
  "mimeType" varchar(120) NOT NULL,
  "sizeBytes" integer NOT NULL,
  "durationMs" integer,
  "sha256" varchar(64) NOT NULL,
  "transcriptStatus" varchar(24) DEFAULT 'uploaded' NOT NULL,
  "expiresAt" timestamp NOT NULL,
  "createdByUserId" integer NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "onboarding_audio_assets_session_hash_idx"
  ON "onboardingAudioAssets" ("sessionId", "sha256");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onboarding_audio_assets_workspace_idx"
  ON "onboardingAudioAssets" ("workspaceId", "createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onboarding_audio_assets_session_idx"
  ON "onboardingAudioAssets" ("sessionId", "stepKey", "createdAt");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "onboardingTranscriptions" (
  "id" serial PRIMARY KEY NOT NULL,
  "assetId" integer NOT NULL UNIQUE,
  "sessionId" integer NOT NULL,
  "workspaceId" integer NOT NULL,
  "status" varchar(24) DEFAULT 'pending' NOT NULL,
  "provider" varchar(80),
  "model" varchar(80),
  "language" varchar(16),
  "text" text,
  "segments" jsonb,
  "errorCode" varchar(48),
  "retryCount" integer DEFAULT 0 NOT NULL,
  "completedAt" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onboarding_transcriptions_workspace_idx"
  ON "onboardingTranscriptions" ("workspaceId", "createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onboarding_transcriptions_asset_idx"
  ON "onboardingTranscriptions" ("assetId");
