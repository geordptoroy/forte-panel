BEGIN;

CREATE TABLE IF NOT EXISTS "securityRateLimitBuckets" (
  "id" serial PRIMARY KEY NOT NULL,
  "bucketType" varchar(40) NOT NULL,
  "scopeKey" varchar(320) NOT NULL,
  "failures" integer DEFAULT 0 NOT NULL,
  "firstFailureAt" timestamp NOT NULL,
  "blockedUntil" timestamp,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "security_rate_limit_bucket_unique_idx"
  ON "securityRateLimitBuckets" ("bucketType", "scopeKey");
CREATE INDEX IF NOT EXISTS "security_rate_limit_bucket_updated_idx"
  ON "securityRateLimitBuckets" ("updatedAt");

COMMIT;
