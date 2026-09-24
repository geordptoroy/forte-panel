CREATE TYPE "public"."domain_event_status" AS ENUM('pending', 'processing', 'delivered', 'failed');--> statement-breakpoint
CREATE TABLE "domainEvents" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspaceId" integer NOT NULL,
	"eventKey" varchar(180) NOT NULL,
	"eventType" varchar(80) NOT NULL,
	"aggregateType" varchar(80) NOT NULL,
	"aggregateId" integer,
	"payload" text NOT NULL,
	"status" "domain_event_status" DEFAULT 'pending' NOT NULL,
	"attemptCount" integer DEFAULT 0 NOT NULL,
	"availableAt" timestamp DEFAULT now() NOT NULL,
	"lastError" text,
	"deliveredAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "domainEvents_eventKey_unique" UNIQUE("eventKey")
);
