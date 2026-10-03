BEGIN;
ALTER TABLE "appointments"
  ADD COLUMN IF NOT EXISTS "quoteId" integer;
CREATE INDEX IF NOT EXISTS "appointments_quote_idx"
  ON "appointments" ("quoteId");
COMMIT;
