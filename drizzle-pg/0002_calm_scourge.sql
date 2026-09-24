ALTER TYPE "public"."message_status" ADD VALUE 'processing' BEFORE 'sent';--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "attemptCount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "lastError" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "sentAt" timestamp;