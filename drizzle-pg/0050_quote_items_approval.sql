DO $$ BEGIN
  CREATE TYPE "quote_approval_status" AS ENUM ('draft', 'pending', 'approved', 'rejected', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "quote_payment_status" AS ENUM ('unpaid', 'partially_paid', 'paid', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "opportunities"
  ADD CONSTRAINT "opportunities_workspace_id_unique" UNIQUE ("workspaceId", "id");
--> statement-breakpoint
ALTER TABLE "quotes"
  ADD COLUMN IF NOT EXISTS "opportunityId" integer,
  ADD COLUMN IF NOT EXISTS "approvalStatus" "quote_approval_status" NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS "paymentStatus" "quote_payment_status" NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS "validUntil" timestamp,
  ADD COLUMN IF NOT EXISTS "approvedAt" timestamp,
  ADD COLUMN IF NOT EXISTS "approvedByUserId" integer,
  ADD COLUMN IF NOT EXISTS "rejectedAt" timestamp,
  ADD COLUMN IF NOT EXISTS "rejectedByUserId" integer;
--> statement-breakpoint
ALTER TABLE "quotes"
  ADD CONSTRAINT "quotes_workspace_id_unique" UNIQUE ("workspaceId", "id");
--> statement-breakpoint
ALTER TABLE "quotes"
  ADD CONSTRAINT "quotes_opportunity_workspace_fk"
    FOREIGN KEY ("workspaceId", "opportunityId")
    REFERENCES "opportunities" ("workspaceId", "id")
    ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "quotes"
  ADD CONSTRAINT "quotes_approved_by_user_fk"
    FOREIGN KEY ("approvedByUserId") REFERENCES "users" ("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "quotes"
  ADD CONSTRAINT "quotes_rejected_by_user_fk"
    FOREIGN KEY ("rejectedByUserId") REFERENCES "users" ("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quotes_workspace_opportunity_idx"
  ON "quotes" ("workspaceId", "opportunityId", "createdAt");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quoteItems" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL,
  "quoteId" integer NOT NULL,
  "position" integer NOT NULL DEFAULT 0,
  "serviceName" varchar(160) NOT NULL,
  "description" text,
  "quantity" integer NOT NULL DEFAULT 1,
  "unitPriceCents" integer NOT NULL DEFAULT 0,
  "totalCents" integer NOT NULL DEFAULT 0,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "quote_items_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "quote_items_unit_price_check" CHECK ("unitPriceCents" >= 0),
  CONSTRAINT "quote_items_total_check" CHECK ("totalCents" >= 0),
  CONSTRAINT "quote_items_quote_workspace_fk"
    FOREIGN KEY ("workspaceId", "quoteId")
    REFERENCES "quotes" ("workspaceId", "id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "quote_items_workspace_quote_position_unique_idx"
  ON "quoteItems" ("workspaceId", "quoteId", "position");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quote_items_workspace_quote_idx"
  ON "quoteItems" ("workspaceId", "quoteId");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quoteApprovalHistory" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL,
  "quoteId" integer NOT NULL,
  "fromStatus" "quote_approval_status",
  "toStatus" "quote_approval_status" NOT NULL,
  "actorUserId" integer,
  "note" varchar(1000),
  "createdAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "quote_approval_history_quote_workspace_fk"
    FOREIGN KEY ("workspaceId", "quoteId")
    REFERENCES "quotes" ("workspaceId", "id") ON DELETE CASCADE,
  CONSTRAINT "quote_approval_history_actor_fk"
    FOREIGN KEY ("actorUserId") REFERENCES "users" ("id") ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quote_approval_history_workspace_quote_idx"
  ON "quoteApprovalHistory" ("workspaceId", "quoteId", "createdAt", "id");
--> statement-breakpoint
UPDATE "quotes" AS q
SET "opportunityId" = o."id"
FROM "leads" AS l
JOIN "opportunities" AS o
  ON o."workspaceId" = l."workspaceId" AND o."leadId" = l."id"
WHERE q."workspaceId" = l."workspaceId"
  AND q."contactId" = l."contactId"
  AND q."opportunityId" IS NULL;
--> statement-breakpoint
UPDATE "quotes"
SET "approvalStatus" = CASE
  WHEN "status" IN ('aprovado', 'sinal_pendente', 'parcialmente_pago', 'pago') THEN 'approved'::"quote_approval_status"
  WHEN "status" = 'aguardando_aprovacao' THEN 'pending'::"quote_approval_status"
  ELSE 'draft'::"quote_approval_status"
END,
"paymentStatus" = CASE
  WHEN "status" = 'pago' THEN 'paid'::"quote_payment_status"
  WHEN "status" IN ('sinal_pendente', 'parcialmente_pago') OR "receivedCents" > 0 THEN 'partially_paid'::"quote_payment_status"
  WHEN "status" = 'cancelado' THEN 'cancelled'::"quote_payment_status"
  ELSE 'unpaid'::"quote_payment_status"
END;
--> statement-breakpoint
INSERT INTO "quoteItems" (
  "workspaceId", "quoteId", "position", "serviceName", "description", "quantity", "unitPriceCents", "totalCents", "createdAt"
)
SELECT "workspaceId", "id", 0, "serviceName", "description", 1, "quotedCents", "quotedCents", "createdAt"
FROM "quotes"
ON CONFLICT ("workspaceId", "quoteId", "position") DO NOTHING;
--> statement-breakpoint
INSERT INTO "quoteApprovalHistory" ("workspaceId", "quoteId", "fromStatus", "toStatus", "note", "createdAt")
SELECT "workspaceId", "id", NULL, "approvalStatus", 'Registro legado importado; aprovação histórica não foi inferida.', "createdAt"
FROM "quotes"
ON CONFLICT DO NOTHING;
