-- Baileys-only operational boundary.
-- Existing legacy rows are intentionally tolerated during this migration so that
-- historical data is not rewritten or mislabeled. NOT VALID still enforces the
-- check for every new INSERT/UPDATE. The text cast is intentional: migration
-- 0020 adds the enum label in the same outer Drizzle transaction, and PostgreSQL
-- rejects a direct enum constant until that transaction commits.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_channels_operational_provider_check'
  ) THEN
    ALTER TABLE "whatsappChannels"
      ADD CONSTRAINT "whatsapp_channels_operational_provider_check"
      CHECK ("provider"::text = 'baileys') NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_instances_operational_provider_check'
  ) THEN
    ALTER TABLE "whatsappInstances"
      ADD CONSTRAINT "whatsapp_instances_operational_provider_check"
      CHECK ("provider"::text = 'baileys') NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'messages_operational_provider_check'
  ) THEN
    ALTER TABLE "messages"
      ADD CONSTRAINT "messages_operational_provider_check"
      CHECK ("provider"::text = 'baileys') NOT VALID;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "whatsappInstances" ALTER COLUMN "provider" SET DEFAULT ('baileys'::text)::"public"."whatsapp_provider";
--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "provider" SET DEFAULT ('baileys'::text)::"public"."whatsapp_provider";
--> statement-breakpoint
UPDATE "workspaceSettings"
SET "value" = 'baileys', "updatedAt" = now()
WHERE "key" = 'default_whatsapp_provider'
  AND "value" <> 'baileys';
