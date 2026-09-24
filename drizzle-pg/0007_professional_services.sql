CREATE TABLE "professionalServices" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspaceId" integer NOT NULL,
	"professionalId" integer NOT NULL,
	"serviceId" integer NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "professional_services_unique_idx" ON "professionalServices" USING btree ("workspaceId","professionalId","serviceId");