CREATE TABLE IF NOT EXISTS "professionalServices" (
  "id" serial PRIMARY KEY NOT NULL,
  "workspaceId" integer NOT NULL,
  "professionalId" integer NOT NULL,
  "serviceId" integer NOT NULL,
  "active" integer DEFAULT 1 NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "professional_services_unique_idx" UNIQUE("workspaceId", "professionalId", "serviceId")
);
