CREATE TABLE IF NOT EXISTS "opportunityStageHistory" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "opportunityId" integer NOT NULL REFERENCES "opportunities"("id") ON DELETE CASCADE,
  "fromStage" varchar(80),
  "toStage" varchar(80) NOT NULL,
  "source" varchar(24) NOT NULL,
  "actorUserId" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "opportunity_stage_history_source_check"
    CHECK ("source" IN ('whatsapp', 'api', 'crm', 'inbox', 'lead_memory', 'migration')),
  CONSTRAINT "opportunity_stage_history_change_check"
    CHECK ("fromStage" IS NULL OR "fromStage" <> "toStage")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "opportunity_stage_history_timeline_idx"
  ON "opportunityStageHistory" ("workspaceId", "opportunityId", "createdAt", "id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "opportunity_stage_history_baseline_unique_idx"
  ON "opportunityStageHistory" ("workspaceId", "opportunityId")
  WHERE "fromStage" IS NULL;
--> statement-breakpoint
INSERT INTO "opportunityStageHistory" (
  "workspaceId", "opportunityId", "fromStage", "toStage", "source", "createdAt"
)
SELECT
  opportunity."workspaceId",
  opportunity."id",
  NULL,
  opportunity."stage",
  'migration',
  now()
FROM "opportunities" AS opportunity
ON CONFLICT DO NOTHING;
