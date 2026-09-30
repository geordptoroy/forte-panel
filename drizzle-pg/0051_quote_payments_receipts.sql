CREATE TABLE IF NOT EXISTS "quotePayments" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL,
  "quoteId" integer NOT NULL,
  "amountCents" integer NOT NULL,
  "method" varchar(30) NOT NULL,
  "receivedAt" timestamp NOT NULL,
  "notes" varchar(500),
  "actorUserId" integer,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "quote_payments_amount_check" CHECK ("amountCents" > 0),
  CONSTRAINT "quote_payments_workspace_quote_fk"
    FOREIGN KEY ("workspaceId", "quoteId")
    REFERENCES "quotes" ("workspaceId", "id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "quote_payments_workspace_quote_idx"
  ON "quotePayments" ("workspaceId", "quoteId", "receivedAt", "id");

CREATE TABLE IF NOT EXISTS "quoteReceipts" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL,
  "quoteId" integer NOT NULL,
  "paymentId" integer NOT NULL,
  "receiptNumber" varchar(80) NOT NULL,
  "issuedAt" timestamp NOT NULL,
  "issuedByUserId" integer,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "quote_receipts_workspace_quote_fk"
    FOREIGN KEY ("workspaceId", "quoteId")
    REFERENCES "quotes" ("workspaceId", "id") ON DELETE CASCADE,
  CONSTRAINT "quote_receipts_workspace_payment_fk"
    FOREIGN KEY ("workspaceId", "paymentId")
    REFERENCES "quotePayments" ("workspaceId", "id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "quote_receipts_workspace_number_unique_idx"
  ON "quoteReceipts" ("workspaceId", "receiptNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "quote_receipts_workspace_payment_unique_idx"
  ON "quoteReceipts" ("workspaceId", "paymentId");
CREATE INDEX IF NOT EXISTS "quote_receipts_workspace_quote_idx"
  ON "quoteReceipts" ("workspaceId", "quoteId", "issuedAt");

-- Legacy aggregate values remain authoritative until a new ledger entry is made.
-- No historical payment is invented because its method, date and actor are unknown.
