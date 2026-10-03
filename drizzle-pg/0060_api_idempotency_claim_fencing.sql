ALTER TABLE "apiIdempotency"
  ADD COLUMN IF NOT EXISTS "claimToken" varchar(64);

-- Legacy in-flight/failed claims have no provable ownership token or safe retry
-- boundary. Preserve them for reconciliation instead of replaying side effects.
UPDATE "apiIdempotency"
SET
  "claimToken" = gen_random_uuid()::text,
  status = 'indeterminate',
  "leaseUntil" = NULL,
  "updatedAt" = now()
WHERE status IN ('processing', 'failed');
