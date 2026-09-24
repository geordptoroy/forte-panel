CREATE TYPE "public"."appointment_status" AS ENUM('requested', 'confirmed', 'cancelled', 'completed', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."conversation_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('inbound', 'outbound', 'system');--> statement-breakpoint
CREATE TYPE "public"."message_sender_type" AS ENUM('lead', 'ai', 'human', 'system');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('received', 'queued', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."message_type" AS ENUM('text', 'image', 'audio', 'video', 'document');--> statement-breakpoint
CREATE TYPE "public"."note_author_type" AS ENUM('human', 'ai', 'system');--> statement-breakpoint
CREATE TYPE "public"."urgency" AS ENUM('Baixa', 'Média', 'Alta', 'Crítica');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."webhook_status" AS ENUM('received', 'processed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."whatsapp_provider" AS ENUM('papi', 'meta_cloud_api');--> statement-breakpoint
CREATE TYPE "public"."workspace_member_role" AS ENUM('owner', 'admin', 'manager', 'agent');--> statement-breakpoint
CREATE TYPE "public"."workspace_plan" AS ENUM('starter', 'pro', 'business');--> statement-breakpoint
CREATE TABLE "apiIdempotency" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspaceId" integer,
	"key" varchar(180) NOT NULL,
	"fingerprint" varchar(128) NOT NULL,
	"statusCode" integer DEFAULT 200 NOT NULL,
	"responseBody" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "apiIdempotency_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspaceId" integer NOT NULL,
	"contactId" integer,
	"serviceId" integer NOT NULL,
	"professionalId" integer NOT NULL,
	"startsAt" timestamp NOT NULL,
	"endsAt" timestamp NOT NULL,
	"status" "appointment_status" DEFAULT 'requested' NOT NULL,
	"notes" varchar(500),
	"source" varchar(40) DEFAULT 'panel' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auditLogs" (
	"id" serial PRIMARY KEY NOT NULL,
	"actorUserId" integer,
	"contactId" integer,
	"action" varchar(100) NOT NULL,
	"summary" varchar(500) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspaceId" integer NOT NULL,
	"professionalId" integer NOT NULL,
	"weekday" integer NOT NULL,
	"startMinute" integer NOT NULL,
	"endMinute" integer NOT NULL,
	"active" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contactNotes" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspaceId" integer NOT NULL,
	"contactId" integer NOT NULL,
	"content" text NOT NULL,
	"authorType" "note_author_type" DEFAULT 'ai' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspaceId" integer,
	"externalPhone" varchar(32) NOT NULL,
	"name" varchar(160) NOT NULL,
	"city" varchar(100),
	"neighborhood" varchar(100),
	"serviceRequested" varchar(180),
	"urgency" "urgency" DEFAULT 'Média' NOT NULL,
	"stage" varchar(80) DEFAULT 'Novo contato' NOT NULL,
	"aiEnabled" integer DEFAULT 1 NOT NULL,
	"quoteCents" integer DEFAULT 0 NOT NULL,
	"unreadCount" integer DEFAULT 0 NOT NULL,
	"lastMessagePreview" varchar(500),
	"lastMessageAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "contacts_externalPhone_unique" UNIQUE("externalPhone")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"contactId" integer NOT NULL,
	"status" "conversation_status" DEFAULT 'open' NOT NULL,
	"humanControlled" integer DEFAULT 0 NOT NULL,
	"lastMessageAt" timestamp,
	"unreadCount" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversationId" integer NOT NULL,
	"externalId" varchar(160),
	"direction" "message_direction" NOT NULL,
	"senderType" "message_sender_type" NOT NULL,
	"messageType" "message_type" DEFAULT 'text' NOT NULL,
	"content" text NOT NULL,
	"status" "message_status" DEFAULT 'received' NOT NULL,
	"provider" "whatsapp_provider" DEFAULT 'papi' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "professionals" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspaceId" integer NOT NULL,
	"name" varchar(160) NOT NULL,
	"specialty" varchar(120),
	"color" varchar(20) DEFAULT '#56d68a' NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspaceId" integer NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" text,
	"durationMinutes" integer DEFAULT 60 NOT NULL,
	"priceCents" integer DEFAULT 0 NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
--> statement-breakpoint
CREATE TABLE "webhookEvents" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspaceId" integer,
	"eventId" varchar(180) NOT NULL,
	"provider" varchar(60) DEFAULT 'whatsapp' NOT NULL,
	"payload" text NOT NULL,
	"status" "webhook_status" DEFAULT 'received' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"processedAt" timestamp,
	CONSTRAINT "webhookEvents_eventId_unique" UNIQUE("eventId")
);
--> statement-breakpoint
CREATE TABLE "whatsappChannels" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspaceId" integer NOT NULL,
	"provider" "whatsapp_provider" NOT NULL,
	"name" varchar(120) NOT NULL,
	"phoneNumber" varchar(32),
	"phoneNumberId" varchar(100),
	"credentialsRef" varchar(160),
	"active" integer DEFAULT 1 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaceMembers" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspaceId" integer NOT NULL,
	"userId" integer NOT NULL,
	"role" "workspace_member_role" DEFAULT 'agent' NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaceSettings" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspaceId" integer NOT NULL,
	"key" varchar(100) NOT NULL,
	"value" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(160) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"segment" varchar(80) DEFAULT 'servicos' NOT NULL,
	"plan" "workspace_plan" DEFAULT 'starter' NOT NULL,
	"timezone" varchar(64) DEFAULT 'America/Sao_Paulo' NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_slug_unique" UNIQUE("slug")
);
