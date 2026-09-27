import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  auditLogs,
  consentRecords,
  onboardingConflictResolutions,
  onboardingPublishedVersions,
  onboardingSessions,
  onboardingStepAnswerRevisions,
  onboardingStepAnswers,
  users,
  workspaceMembers,
  workspaceSettings,
  workspaces,
} from "../drizzle/schema";
import {
  confirmOnboardingStep,
  createPublicSignup,
  getDb,
  listOnboardingPublishedVersions,
  publishOnboardingDraft,
  rollbackOnboardingPublishedVersion,
  saveOnboardingProfile,
  startOnboardingSession,
} from "./db";

const hasDatabase = Boolean(
  process.env.DATABASE_URL && /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL)
);

const profile = {
  businessName: "Publicação Forte",
  segment: "servicos",
  description: "Descrição aprovada",
  services: "Consultoria aprovada",
  serviceArea: "São Paulo",
  businessHours: "Segunda a sexta, 9h às 18h",
  toneOfVoice: "claro e cordial",
  forbiddenWords: "Não prometer sem confirmar",
  faq: "Pergunta: prazo? Resposta: consultar equipe.",
  cancellationPolicy: "Avisar com antecedência",
  humanHandoffRules: "Transferir quando pedir humano",
  qualificationRules: "Identificar serviço e urgência",
};

describe.skipIf(!hasDatabase)("onboarding published versions", () => {
  const suffix = `publish${Date.now()}`;
  let workspaceId = 0;
  let userId = 0;

  beforeAll(async () => {
    const signup = await createPublicSignup({
      name: "Owner Publicação",
      email: `${suffix}@example.com`,
      password: "senha-segura-123",
      workspaceName: "Workspace Publicação",
    });
    workspaceId = signup.workspace.id;
    userId = signup.user.id;
    await startOnboardingSession(workspaceId, userId);
    await saveOnboardingProfile(workspaceId, profile, false, userId);
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(onboardingPublishedVersions).where(eqWorkspace(workspaceId));
    await db.delete(workspaceSettings).where(eqWorkspace(workspaceSettings.workspaceId, workspaceId));
    await db.delete(onboardingConflictResolutions).where(eqWorkspace(onboardingConflictResolutions.workspaceId, workspaceId));
    await db.delete(onboardingStepAnswerRevisions).where(eqWorkspace(onboardingStepAnswerRevisions.workspaceId, workspaceId));
    await db.delete(onboardingStepAnswers).where(eqWorkspace(onboardingStepAnswers.workspaceId, workspaceId));
    await db.delete(onboardingSessions).where(eqWorkspace(onboardingSessions.workspaceId, workspaceId));
    await db.delete(auditLogs).where(eqWorkspace(auditLogs.workspaceId, workspaceId));
    await db.delete(consentRecords).where(eqWorkspace(consentRecords.workspaceId, workspaceId));
    await db.delete(workspaceMembers).where(eqWorkspace(workspaceMembers.workspaceId, workspaceId));
    await db.delete(users).where(inArray(users.id, [userId]));
    await db.delete(workspaces).where(inArray(workspaces.id, [workspaceId]));
  });

  it("blocks publication before required confirmations", async () => {
    await expect(publishOnboardingDraft(workspaceId, userId)).rejects.toThrow("ONBOARDING_CONFIRMATION_REQUIRED");
  });

  it("publishes a version and rollback creates a new version", async () => {
    for (const stepKey of ["identity", "offering", "operations", "guardrails"] as const)
      await confirmOnboardingStep(workspaceId, stepKey, userId);
    const published = await publishOnboardingDraft(workspaceId, userId);
    expect(published).toMatchObject({ version: 1, published: true });
    const rolledBack = await rollbackOnboardingPublishedVersion(workspaceId, 1, userId);
    expect(rolledBack).toMatchObject({ version: 2, rollbackOf: 1, published: true });
    await expect(listOnboardingPublishedVersions(workspaceId)).resolves.toHaveLength(2);
  });
});

function eqWorkspace(column: any, workspaceId: number) {
  return eq(column, workspaceId);
}
