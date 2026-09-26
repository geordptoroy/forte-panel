ALTER TYPE "public"."message_type" ADD VALUE 'button';--> statement-breakpoint
ALTER TABLE "contacts" DROP CONSTRAINT "contacts_externalPhone_unique";--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "externalId" SET DATA TYPE varchar(180);--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_workspace_phone_unique_idx" ON "contacts" USING btree ("workspaceId","externalPhone") WHERE "contacts"."workspaceId" IS NOT NULL;--> statement-breakpoint
WITH ranked_external_ids AS (
  SELECT "id", row_number() OVER (PARTITION BY "externalId" ORDER BY "id") AS duplicate_number
  FROM "messages"
  WHERE "externalId" IS NOT NULL
)
UPDATE "messages" AS message
SET "externalId" = NULL
FROM ranked_external_ids AS ranked
WHERE message."id" = ranked."id" AND ranked.duplicate_number > 1;--> statement-breakpoint
CREATE UNIQUE INDEX "messages_external_id_unique_idx" ON "messages" USING btree ("externalId") WHERE "messages"."externalId" IS NOT NULL;
