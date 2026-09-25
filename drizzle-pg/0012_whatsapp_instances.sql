CREATE TABLE "whatsappInstances" (
  "id" serial PRIMARY KEY NOT NULL,
  "workspaceId" integer NOT NULL,
  "channelId" integer,
  "provider" "whatsapp_provider" DEFAULT 'papi' NOT NULL,
  "deployment" varchar(32) DEFAULT 'self_hosted' NOT NULL,
  "instanceId" varchar(160) NOT NULL,
  "name" varchar(120) NOT NULL,
  "encryptedApiKey" text,
  "webhookId" varchar(120),
  "encryptedWebhookSecret" text,
  "status" varchar(40) DEFAULT 'unknown' NOT NULL,
  "active" integer DEFAULT 1 NOT NULL,
  "isDefault" integer DEFAULT 0 NOT NULL,
  "lastHealthError" text,
  "lastSeenAt" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "whatsapp_instances_workspace_instance_unique" UNIQUE("workspaceId", "instanceId")
);
--> statement-breakpoint
CREATE INDEX "whatsapp_instances_workspace_idx" ON "whatsappInstances" USING btree ("workspaceId", "active", "isDefault");
