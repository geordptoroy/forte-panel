DROP INDEX IF EXISTS "public"."contacts_workspace_phone_unique_idx";
CREATE UNIQUE INDEX "contacts_workspace_phone_unique_idx" ON "public"."contacts" USING btree ("workspaceId", "externalPhone");
