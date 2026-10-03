CREATE TABLE IF NOT EXISTS "leads" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "contactId" integer NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE,
  "source" varchar(32) NOT NULL DEFAULT 'whatsapp',
  "lastActivityAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "leads_workspace_contact_unique_idx"
  ON "leads" ("workspaceId", "contactId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_workspace_updated_idx"
  ON "leads" ("workspaceId", "updatedAt");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "opportunities" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "leadId" integer NOT NULL REFERENCES "leads"("id") ON DELETE CASCADE,
  "stage" varchar(80) NOT NULL DEFAULT 'Novo contato',
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "opportunities_workspace_lead_unique_idx"
  ON "opportunities" ("workspaceId", "leadId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "opportunities_workspace_stage_updated_idx"
  ON "opportunities" ("workspaceId", "stage", "updatedAt");
--> statement-breakpoint
ALTER TABLE "conversations"
  ADD COLUMN IF NOT EXISTS "opportunityId" integer REFERENCES "opportunities"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "conversations_opportunity_unique_idx"
  ON "conversations" ("opportunityId")
  WHERE "opportunityId" IS NOT NULL;
--> statement-breakpoint
INSERT INTO "leads" (
  "workspaceId", "contactId", "source", "lastActivityAt", "createdAt", "updatedAt"
)
SELECT
  c."workspaceId", c."id", 'migration', c."lastMessageAt", c."createdAt", c."updatedAt"
FROM "contacts" AS c
INNER JOIN "workspaces" AS w ON w."id" = c."workspaceId"
WHERE c."workspaceId" IS NOT NULL AND c."groupId" IS NULL
ON CONFLICT ("workspaceId", "contactId") DO NOTHING;
--> statement-breakpoint
INSERT INTO "opportunities" (
  "workspaceId", "leadId", "stage", "createdAt", "updatedAt"
)
SELECT
  l."workspaceId", l."id", COALESCE(NULLIF(BTRIM(c."stage"), ''), 'Novo contato'), c."createdAt", c."updatedAt"
FROM "leads" AS l
INNER JOIN "contacts" AS c
  ON c."id" = l."contactId" AND c."workspaceId" = l."workspaceId"
ON CONFLICT ("workspaceId", "leadId") DO NOTHING;
--> statement-breakpoint
UPDATE "conversations" AS conv
SET "opportunityId" = o."id"
FROM "contacts" AS c
INNER JOIN "leads" AS l
  ON l."contactId" = c."id" AND l."workspaceId" = c."workspaceId"
INNER JOIN "opportunities" AS o
  ON o."leadId" = l."id" AND o."workspaceId" = l."workspaceId"
WHERE conv."contactId" = c."id"
  AND c."workspaceId" IS NOT NULL
  AND c."groupId" IS NULL
  AND conv."opportunityId" IS NULL;
