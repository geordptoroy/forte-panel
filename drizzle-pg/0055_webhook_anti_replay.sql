BEGIN;

ALTER TABLE "webhookEvents"
  ADD COLUMN IF NOT EXISTS "instanceId" varchar(160),
  ADD COLUMN IF NOT EXISTS "webhookNonce" varchar(180),
  ADD COLUMN IF NOT EXISTS "webhookTimestamp" timestamp;

CREATE UNIQUE INDEX IF NOT EXISTS "webhook_events_workspace_provider_nonce_unique_idx"
  ON "webhookEvents" ("workspaceId", "provider", "webhookNonce");

COMMIT;
