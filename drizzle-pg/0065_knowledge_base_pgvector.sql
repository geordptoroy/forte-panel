CREATE EXTENSION IF NOT EXISTS vector;

ALTER TYPE "public"."platform_ai_connection_capability" ADD VALUE IF NOT EXISTS 'embeddings';

DO $$ BEGIN
  CREATE TYPE knowledge_document_source AS ENUM ('onboarding_generated', 'manual_upload');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE knowledge_document_status AS ENUM ('uploaded', 'processing', 'indexed', 'published', 'failed', 'archived');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "knowledgeDocuments" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "title" varchar(240) NOT NULL,
  "source" knowledge_document_source NOT NULL,
  "status" knowledge_document_status NOT NULL DEFAULT 'uploaded',
  "originalFileName" varchar(255),
  "mimeType" varchar(120) NOT NULL,
  "sizeBytes" integer NOT NULL,
  "sha256" varchar(64) NOT NULL,
  "storageKey" varchar(512),
  "createdByUserId" integer,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "knowledge_documents_workspace_hash_unique_idx"
  ON "knowledgeDocuments" ("workspaceId", "sha256");
CREATE INDEX IF NOT EXISTS "knowledge_documents_workspace_status_idx"
  ON "knowledgeDocuments" ("workspaceId", "status");

CREATE TABLE IF NOT EXISTS "knowledgeDocumentVersions" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "documentId" integer NOT NULL REFERENCES "knowledgeDocuments"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "sourceText" text NOT NULL,
  "status" knowledge_document_status NOT NULL DEFAULT 'uploaded',
  "attemptCount" integer NOT NULL DEFAULT 0,
  "lastError" varchar(500),
  "errorMessage" varchar(500),
  "publishedAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "knowledge_document_versions_document_version_unique_idx"
  ON "knowledgeDocumentVersions" ("documentId", "version");
CREATE INDEX IF NOT EXISTS "knowledge_document_versions_workspace_status_idx"
  ON "knowledgeDocumentVersions" ("workspaceId", "status");

CREATE TABLE IF NOT EXISTS "knowledgeDocumentChunks" (
  "id" serial PRIMARY KEY,
  "workspaceId" integer NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "versionId" integer NOT NULL REFERENCES "knowledgeDocumentVersions"("id") ON DELETE CASCADE,
  "chunkIndex" integer NOT NULL,
  "text" text NOT NULL,
  "tokenCount" integer,
  "pageNumber" integer,
  "heading" varchar(240),
  "contentHash" varchar(64) NOT NULL,
  "embedding" vector(1536),
  "embeddingModel" varchar(160),
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "knowledge_chunks_version_index_unique_idx"
  ON "knowledgeDocumentChunks" ("versionId", "chunkIndex");
CREATE INDEX IF NOT EXISTS "knowledge_chunks_workspace_version_idx"
  ON "knowledgeDocumentChunks" ("workspaceId", "versionId");
CREATE INDEX IF NOT EXISTS "knowledge_chunks_embedding_hnsw_idx"
  ON "knowledgeDocumentChunks" USING hnsw ("embedding" vector_cosine_ops);
