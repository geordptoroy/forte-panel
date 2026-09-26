ALTER TABLE "apiIdempotency" ADD COLUMN "status" varchar(20) DEFAULT 'completed' NOT NULL;
ALTER TABLE "apiIdempotency" ADD COLUMN "leaseUntil" timestamp;
ALTER TABLE "apiIdempotency" ADD COLUMN "updatedAt" timestamp DEFAULT now() NOT NULL;
