CREATE TYPE "public"."operational_role" AS ENUM('human_attendant', 'ai_attendant', 'professional');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "passwordHash" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "operationalRole" "operational_role";--> statement-breakpoint
ALTER TABLE "workspaceMembers" ADD COLUMN "professionalId" integer;