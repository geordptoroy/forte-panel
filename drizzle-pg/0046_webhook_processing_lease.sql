ALTER TABLE "webhookEvents"
  ADD COLUMN IF NOT EXISTS "leaseToken" varchar(64);
--> statement-breakpoint
ALTER TABLE "webhookEvents"
  ADD COLUMN IF NOT EXISTS "leaseUntil" timestamp;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_events_status_lease_idx"
  ON "webhookEvents" ("status", "leaseUntil");
