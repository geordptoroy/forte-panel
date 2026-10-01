BEGIN;
CREATE TABLE IF NOT EXISTS "paymentLedger" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL,
  "quoteId" integer NOT NULL,
  "contactId" integer NOT NULL,
  "appointmentId" integer,
  "amountCents" integer NOT NULL CHECK ("amountCents" > 0),
  "method" varchar(40) NOT NULL,
  "receivedAt" timestamp NOT NULL DEFAULT now(),
  "note" varchar(500),
  "createdByUserId" integer,
  "createdAt" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "payment_ledger_workspace_idx" ON "paymentLedger" ("workspaceId", "receivedAt");
CREATE INDEX IF NOT EXISTS "payment_ledger_quote_idx" ON "paymentLedger" ("quoteId", "createdAt");
COMMIT;
