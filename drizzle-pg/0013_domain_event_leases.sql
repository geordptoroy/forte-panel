ALTER TABLE "domainEvents" ADD COLUMN "workerId" varchar(120);
ALTER TABLE "domainEvents" ADD COLUMN "claimedAt" timestamp;
ALTER TABLE "domainEvents" ADD COLUMN "leaseUntil" timestamp;
CREATE INDEX "domain_events_lease_idx" ON "domainEvents" ("status", "leaseUntil", "id");
