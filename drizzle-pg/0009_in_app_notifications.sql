CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspaceId" integer NOT NULL,
	"userId" integer NOT NULL,
	"eventKey" varchar(255) NOT NULL,
	"type" varchar(60) NOT NULL,
	"title" varchar(180) NOT NULL,
	"body" text NOT NULL,
	"href" varchar(255) NOT NULL,
	"readAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_user_event_unique_idx" ON "notifications" USING btree ("workspaceId","userId","eventKey");--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("workspaceId","userId","createdAt","id");--> statement-breakpoint
CREATE INDEX "notifications_user_unread_idx" ON "notifications" USING btree ("workspaceId","userId","readAt");