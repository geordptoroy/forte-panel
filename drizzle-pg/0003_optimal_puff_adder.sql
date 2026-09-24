CREATE TYPE "public"."quote_status" AS ENUM('orcamento', 'aguardando_aprovacao', 'aprovado', 'sinal_pendente', 'parcialmente_pago', 'pago', 'cancelado');--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspaceId" integer NOT NULL,
	"contactId" integer NOT NULL,
	"serviceName" varchar(160) NOT NULL,
	"description" text,
	"quotedCents" integer DEFAULT 0 NOT NULL,
	"receivedCents" integer DEFAULT 0 NOT NULL,
	"status" "quote_status" DEFAULT 'orcamento' NOT NULL,
	"dueDate" timestamp,
	"notes" varchar(1000),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
