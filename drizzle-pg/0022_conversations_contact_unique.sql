CREATE UNIQUE INDEX IF NOT EXISTS "conversations_contact_unique_idx" ON "public"."conversations" USING btree ("contactId");
