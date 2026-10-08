import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { knowledgeDocuments, users, workspaceMembers, workspaces } from "../drizzle/schema";
import { archiveKnowledgeDocument, completeKnowledgeDocumentIngestion, createKnowledgeDocumentRecord, createPublicSignup, getKnowledgeDocument, getDb, listKnowledgeDocuments, searchKnowledgeChunks } from "./db";

const enabled = Boolean(
  process.env.KNOWLEDGE_DB_INTEGRATION === "1" &&
  process.env.DATABASE_URL && /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL),
);

describe.skipIf(!enabled)("knowledge base PostgreSQL integration", () => {
  const suffix = `knowledge-${Date.now()}`;
  let workspaceA = 0;
  let workspaceB = 0;
  let userA = 0;
  let userB = 0;
  let documentA = 0;

  beforeAll(async () => {
    const [signupA, signupB] = await Promise.all([
      createPublicSignup({ name: "Knowledge Owner A", email: `${suffix}-a@example.com`, password: "senha-segura-123", workspaceName: "Knowledge A" }),
      createPublicSignup({ name: "Knowledge Owner B", email: `${suffix}-b@example.com`, password: "senha-segura-123", workspaceName: "Knowledge B" }),
    ]);
    workspaceA = signupA.workspace.id;
    workspaceB = signupB.workspace.id;
    userA = signupA.user.id;
    userB = signupB.user.id;
    const created = await createKnowledgeDocumentRecord({
      workspaceId: workspaceA,
      createdByUserId: userA,
      title: "Empresa transcrita do áudio",
      source: "onboarding_generated",
      originalFileName: "empresa-onboarding.md",
      mimeType: "text/markdown",
      sizeBytes: 72,
      sha256: `${suffix}`.padEnd(64, "0").slice(0, 64),
      storageKey: `workspaces/${workspaceA}/knowledge/test.md`,
      sourceText: "# Horários\nNunca confirme horário sem consultar a agenda.",
    });
    documentA = created.document.id;
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(knowledgeDocuments).where(inArray(knowledgeDocuments.workspaceId, [workspaceA, workspaceB].filter(Boolean)));
    await db.delete(workspaceMembers).where(inArray(workspaceMembers.workspaceId, [workspaceA, workspaceB].filter(Boolean)));
    await db.delete(users).where(inArray(users.id, [userA, userB].filter(Boolean)));
    await db.delete(workspaces).where(inArray(workspaces.id, [workspaceA, workspaceB].filter(Boolean)));
  });

  it("returns the generated source only inside its owning workspace", async () => {
    const own = await getKnowledgeDocument(workspaceA, documentA);
    const foreign = await getKnowledgeDocument(workspaceB, documentA);
    expect(own?.version?.sourceText).toContain("Nunca confirme horário");
    expect(foreign).toBeNull();
    expect(await listKnowledgeDocuments(workspaceB)).toHaveLength(0);
  });

  it("searches only indexed workspace chunks and excludes archived documents", async () => {
    const first = await getKnowledgeDocument(workspaceA, documentA);
    expect(first?.version?.id).toBeDefined();
    const embedding = Array.from({ length: 2048 }, (_, index) => index === 0 ? 1 : 0);
    const active = await createKnowledgeDocumentRecord({
      workspaceId: workspaceA,
      createdByUserId: userA,
      title: "Documento ativo",
      source: "manual_upload",
      originalFileName: "ativo.md",
      mimeType: "text/markdown",
      sizeBytes: 12,
      sha256: `${suffix}-active`.padEnd(64, "0").slice(0, 64),
      storageKey: `workspaces/${workspaceA}/knowledge/active.md`,
      sourceText: "Conteúdo ativo.",
    });
    const foreign = await createKnowledgeDocumentRecord({
      workspaceId: workspaceB,
      createdByUserId: userB,
      title: "Documento de outro workspace",
      source: "manual_upload",
      originalFileName: "outro-workspace.md",
      mimeType: "text/markdown",
      sizeBytes: 20,
      sha256: `${suffix}-foreign`.padEnd(64, "0").slice(0, 64),
      storageKey: `workspaces/${workspaceB}/knowledge/foreign.md`,
      sourceText: "Conteúdo de outro workspace.",
    });
    const chunk = (text: string) => ({
      chunkIndex: 0,
      text,
      heading: "Política",
      pageNumber: null,
      tokenCount: 3,
      contentHash: "a".repeat(64),
      embedding,
      embeddingModel: "integration-test",
    });
    await completeKnowledgeDocumentIngestion({
      versionId: first!.version!.id,
      documentId: documentA,
      workspaceId: workspaceA,
      chunks: [chunk("Conteúdo arquivado.")],
    });
    await completeKnowledgeDocumentIngestion({
      versionId: active.version.id,
      documentId: active.document.id,
      workspaceId: workspaceA,
      chunks: [chunk("Conteúdo ativo.")],
    });
    await completeKnowledgeDocumentIngestion({
      versionId: foreign.version.id,
      documentId: foreign.document.id,
      workspaceId: workspaceB,
      chunks: [chunk("Conteúdo de outro workspace.")],
    });
    await archiveKnowledgeDocument(workspaceA, documentA);

    const results = await searchKnowledgeChunks({ workspaceId: workspaceA, embedding, minSimilarity: 0.5 });
    expect(results.map(result => result.text)).toContain("Conteúdo ativo.");
    expect(results.map(result => result.text)).not.toContain("Conteúdo arquivado.");
    expect(results.map(result => result.text)).not.toContain("Conteúdo de outro workspace.");
  });
});
