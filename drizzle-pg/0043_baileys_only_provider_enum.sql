-- Remove the historical multi-provider boundary in favour of Baileys-only.
-- The product decision is explicit: PAPI/Meta/generic WhatsApp providers are
-- not supported or migrated. Their provider rows, queued messages, settings
-- and webhook records are deleted in this transaction; Baileys rows remain.
DELETE FROM "messages" WHERE "provider"::text <> 'baileys';
--> statement-breakpoint
DELETE FROM "whatsappInstances" WHERE "provider"::text <> 'baileys';
--> statement-breakpoint
DELETE FROM "whatsappChannels" WHERE "provider"::text <> 'baileys';
--> statement-breakpoint
DELETE FROM "webhookEvents" WHERE "provider" <> 'baileys';
--> statement-breakpoint
DELETE FROM "workspaceSettings"
 WHERE "key" = 'default_whatsapp_provider'
   AND COALESCE("value", '') <> 'baileys';
--> statement-breakpoint
ALTER TABLE "webhookEvents"
  DROP CONSTRAINT IF EXISTS "webhook_events_operational_provider_check";
--> statement-breakpoint
ALTER TABLE "webhookEvents"
  ADD CONSTRAINT "webhook_events_operational_provider_check"
  CHECK ("provider" = 'baileys');
--> statement-breakpoint
ALTER TABLE "webhookEvents" ALTER COLUMN "provider" SET DEFAULT 'baileys';
--> statement-breakpoint
ALTER TABLE "whatsappChannels"
  DROP CONSTRAINT IF EXISTS "whatsapp_channels_operational_provider_check";
--> statement-breakpoint
ALTER TABLE "whatsappInstances"
  DROP CONSTRAINT IF EXISTS "whatsapp_instances_operational_provider_check";
--> statement-breakpoint
ALTER TABLE "messages"
  DROP CONSTRAINT IF EXISTS "messages_operational_provider_check";
--> statement-breakpoint
DROP INDEX IF EXISTS "whatsapp_instances_baileys_instance_global_unique_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "whatsapp_instances_baileys_workspace_default_unique_idx";
--> statement-breakpoint
ALTER TABLE "whatsappInstances" ALTER COLUMN "provider" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "provider" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "whatsappChannels" ALTER COLUMN "provider" SET DATA TYPE text;
--> statement-breakpoint
ALTER TABLE "whatsappInstances" ALTER COLUMN "provider" SET DATA TYPE text;
--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "provider" SET DATA TYPE text;
--> statement-breakpoint
DROP TYPE "public"."whatsapp_provider";
--> statement-breakpoint
CREATE TYPE "public"."whatsapp_provider" AS ENUM('baileys');
--> statement-breakpoint
ALTER TABLE "whatsappChannels"
  ALTER COLUMN "provider" SET DATA TYPE "public"."whatsapp_provider"
  USING "provider"::"public"."whatsapp_provider";
--> statement-breakpoint
ALTER TABLE "whatsappInstances"
  ALTER COLUMN "provider" SET DATA TYPE "public"."whatsapp_provider"
  USING "provider"::"public"."whatsapp_provider";
--> statement-breakpoint
ALTER TABLE "messages"
  ALTER COLUMN "provider" SET DATA TYPE "public"."whatsapp_provider"
  USING "provider"::"public"."whatsapp_provider";
--> statement-breakpoint
ALTER TABLE "whatsappInstances"
  ALTER COLUMN "provider" SET DEFAULT 'baileys'::"public"."whatsapp_provider";
--> statement-breakpoint
ALTER TABLE "messages"
  ALTER COLUMN "provider" SET DEFAULT 'baileys'::"public"."whatsapp_provider";
--> statement-breakpoint
ALTER TABLE "whatsappChannels"
  ADD CONSTRAINT "whatsapp_channels_operational_provider_check"
  CHECK ("provider"::text = 'baileys');
--> statement-breakpoint
ALTER TABLE "whatsappInstances"
  ADD CONSTRAINT "whatsapp_instances_operational_provider_check"
  CHECK ("provider"::text = 'baileys');
--> statement-breakpoint
ALTER TABLE "messages"
  ADD CONSTRAINT "messages_operational_provider_check"
  CHECK ("provider"::text = 'baileys');
--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_instances_baileys_instance_global_unique_idx"
  ON "whatsappInstances" ("instanceId")
  WHERE "provider" = 'baileys'::"public"."whatsapp_provider";
--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_instances_baileys_workspace_default_unique_idx"
  ON "whatsappInstances" ("workspaceId")
  WHERE "provider" = 'baileys'::"public"."whatsapp_provider"
    AND "active" = 1
    AND "isDefault" = 1;
