import {
  claimKnowledgeDocumentVersions,
  completeKnowledgeDocumentIngestion,
  failKnowledgeDocumentIngestion,
  getNativeAgentRuntimeConfig,
} from "./db";
import { invokeConfiguredEmbeddings } from "./llm-providers";
import { chunkKnowledgeText } from "./knowledge-chunking";

const EMBEDDING_BATCH_SIZE = 32;

export async function processKnowledgeIngestionOnce(limit = 2) {
  const versions = await claimKnowledgeDocumentVersions(limit, process.env.KNOWLEDGE_INGESTION_RETRY_FAILED === "true");
  let indexed = 0;
  let failed = 0;
  for (const version of versions) {
    try {
      const chunks = chunkKnowledgeText(version.sourceText);
      if (!chunks.length) throw new Error("KNOWLEDGE_SOURCE_EMPTY");
      const config = await getNativeAgentRuntimeConfig(version.workspaceId);
      const embeddings: number[][] = [];
      let model = config.llm.routing.embeddings.model;
      for (let offset = 0; offset < chunks.length; offset += EMBEDDING_BATCH_SIZE) {
        const batch = chunks.slice(offset, offset + EMBEDDING_BATCH_SIZE);
        const response = await invokeConfiguredEmbeddings(config.llm, {
          texts: batch.map(chunk => chunk.text),
          model,
          inputType: "passage",
        });
        if (response.embeddings.some(embedding => embedding.length !== 2048))
          throw new Error("EMBEDDING_DIMENSION_MUST_BE_2048");
        embeddings.push(...response.embeddings);
        model = response.model || model;
      }
      if (embeddings.length !== chunks.length) throw new Error("EMBEDDING_COUNT_MISMATCH");
      await completeKnowledgeDocumentIngestion({
        versionId: version.id,
        documentId: version.documentId,
        workspaceId: version.workspaceId,
        chunks: chunks.map((chunk, index) => ({
          ...chunk,
          embedding: embeddings[index]!,
          embeddingModel: model,
        })),
      });
      indexed += 1;
    } catch (error) {
      failed += 1;
      await failKnowledgeDocumentIngestion(
        version.id,
        version.workspaceId,
        error instanceof Error ? error.message : "KNOWLEDGE_INGESTION_FAILED"
      );
    }
  }
  return { claimed: versions.length, indexed, failed };
}
