CREATE TABLE "workspaceUsageBuckets" (
  "id" serial PRIMARY KEY NOT NULL,
  "workspaceId" integer NOT NULL,
  "bucketStart" timestamp NOT NULL,
  "apiRequests" integer DEFAULT 0 NOT NULL,
  "aiRequests" integer DEFAULT 0 NOT NULL,
  "outboundMessages" integer DEFAULT 0 NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "workspace_usage_buckets_unique_idx" UNIQUE("workspaceId", "bucketStart")
);
CREATE INDEX "workspace_usage_buckets_created_idx" ON "workspaceUsageBuckets" ("createdAt");
