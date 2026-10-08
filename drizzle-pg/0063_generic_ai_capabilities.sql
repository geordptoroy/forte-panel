ALTER TYPE "public"."platform_ai_connection_capability" ADD VALUE IF NOT EXISTS 'video_analysis';
--> statement-breakpoint
ALTER TYPE "public"."platform_ai_connection_capability" ADD VALUE IF NOT EXISTS 'prompt_builder';
--> statement-breakpoint
ALTER TYPE "public"."platform_ai_connection_capability" ADD VALUE IF NOT EXISTS 'moderation';
