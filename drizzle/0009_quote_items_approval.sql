BEGIN;
ALTER TABLE "quotes"
  ADD COLUMN IF NOT EXISTS "validUntil" timestamp,
  ADD COLUMN IF NOT EXISTS "approvedAt" timestamp,
  ADD COLUMN IF NOT EXISTS "approvedByUserId" integer;
CREATE TABLE IF NOT EXISTS "quoteItems" (
  "id" serial PRIMARY KEY,
  "quoteId" integer NOT NULL,
  "description" varchar(240) NOT NULL,
  "quantity" integer NOT NULL DEFAULT 1,
  "unitCents" integer NOT NULL DEFAULT 0,
  "totalCents" integer NOT NULL DEFAULT 0,
  "createdAt" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "quote_items_quote_idx" ON "quoteItems" ("quoteId");
COMMIT;
