DO $$
DECLARE
  indexed_count bigint;
BEGIN
  SELECT count(*) INTO indexed_count
  FROM "knowledgeDocumentChunks"
  WHERE "embedding" IS NOT NULL;

  IF indexed_count > 0 THEN
    RAISE EXCEPTION 'Não é possível alterar knowledgeDocumentChunks.embedding para 2048 com % embeddings existentes; reindexe em uma janela de migração controlada primeiro', indexed_count;
  END IF;
END $$;

DROP INDEX IF EXISTS "knowledge_chunks_embedding_hnsw_idx";

ALTER TABLE "knowledgeDocumentChunks"
  ALTER COLUMN "embedding" TYPE vector(2048);

CREATE INDEX IF NOT EXISTS "knowledge_chunks_embedding_hnsw_idx"
  ON "knowledgeDocumentChunks" USING hnsw (("embedding"::halfvec(2048)) halfvec_cosine_ops);
