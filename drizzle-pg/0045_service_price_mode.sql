DO $$
BEGIN
  CREATE TYPE "public"."service_price_type" AS ENUM ('fixed', 'starting_at', 'quote');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "services"
  ADD COLUMN IF NOT EXISTS "priceType" "public"."service_price_type"
  NOT NULL DEFAULT 'fixed';
