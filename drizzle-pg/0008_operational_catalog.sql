ALTER TABLE "appointments" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "appointments" ALTER COLUMN "status" SET DEFAULT 'requested'::text;--> statement-breakpoint
DROP TYPE "public"."appointment_status";--> statement-breakpoint
CREATE TYPE "public"."appointment_status" AS ENUM('requested', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show');--> statement-breakpoint
ALTER TABLE "appointments" ALTER COLUMN "status" SET DEFAULT 'requested'::"public"."appointment_status";--> statement-breakpoint
ALTER TABLE "appointments" ALTER COLUMN "status" SET DATA TYPE "public"."appointment_status" USING "status"::"public"."appointment_status";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone" varchar(32);--> statement-breakpoint
CREATE INDEX "appointments_workspace_idx" ON "appointments" USING btree ("workspaceId","startsAt");--> statement-breakpoint
CREATE INDEX "appointments_professional_idx" ON "appointments" USING btree ("professionalId","startsAt");--> statement-breakpoint
CREATE INDEX "availability_professional_idx" ON "availability" USING btree ("workspaceId","professionalId","weekday");--> statement-breakpoint
CREATE INDEX "professionals_workspace_idx" ON "professionals" USING btree ("workspaceId","active");--> statement-breakpoint
CREATE INDEX "services_workspace_idx" ON "services" USING btree ("workspaceId","active");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_members_unique_idx" ON "workspaceMembers" USING btree ("workspaceId","userId");--> statement-breakpoint
CREATE INDEX "workspace_members_professional_idx" ON "workspaceMembers" USING btree ("workspaceId","professionalId");