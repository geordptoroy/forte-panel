CREATE TABLE "whatsappGroupParticipants" (
	"id" serial PRIMARY KEY NOT NULL,
	"groupId" integer NOT NULL,
	"jid" varchar(180) NOT NULL,
	"jidAlt" varchar(180),
	"name" varchar(160),
	"isAdmin" integer DEFAULT 0 NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsappGroups" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspaceId" integer NOT NULL,
	"instanceId" varchar(160) NOT NULL,
	"jid" varchar(180) NOT NULL,
	"subject" varchar(160) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "contacts_workspace_phone_unique_idx";--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "groupId" integer;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "pushName" varchar(160);--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "nameSource" varchar(16) DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "nameUpdatedAt" timestamp;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "nameUpdatedBy" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_group_participants_group_jid_unique_idx" ON "whatsappGroupParticipants" USING btree ("groupId","jid");--> statement-breakpoint
CREATE INDEX "whatsapp_group_participants_group_idx" ON "whatsappGroupParticipants" USING btree ("groupId","updatedAt");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_groups_workspace_instance_jid_unique_idx" ON "whatsappGroups" USING btree ("workspaceId","instanceId","jid");--> statement-breakpoint
CREATE INDEX "whatsapp_groups_workspace_instance_idx" ON "whatsappGroups" USING btree ("workspaceId","instanceId","updatedAt");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_whatsapp_group_unique_idx" ON "contacts" USING btree ("groupId") WHERE "contacts"."groupId" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_workspace_phone_unique_idx" ON "contacts" USING btree ("workspaceId","externalPhone") WHERE "contacts"."groupId" IS NULL;