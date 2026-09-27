import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import {
  auditLogs,
  consentRecords,
  onboardingAudioAssets,
  onboardingTranscriptions,
  onboardingSessions,
  users,
  workspaceMembers,
  workspaces,
} from "../drizzle/schema";
import {
  createPublicSignup,
  createOnboardingAudioAsset,
  getDb,
  getOnboardingAudioAssetForWorkspace,
  getOnboardingAudioTranscription,
  claimOnboardingAudioTranscription,
  persistOnboardingAudioTranscription,
  startOnboardingSession,
} from "./db";

const hasDatabase = Boolean(
  process.env.DATABASE_URL && /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL)
);

describe.skipIf(!hasDatabase)("onboarding audio tenant boundaries", () => {
  const suffix = `audio${Date.now()}`;
  let workspaceA = 0;
  let workspaceB = 0;
  let userA = 0;
  let userB = 0;
  let sessionA = 0;
  let assetId = 0;

  beforeAll(async () => {
    const [signupA, signupB] = await Promise.all([
      createPublicSignup({
        name: "Owner Áudio A",
        email: `audio-a-${suffix}@example.com`,
        password: "senha-segura-123",
        workspaceName: "Audio A",
      }),
      createPublicSignup({
        name: "Owner Áudio B",
        email: `audio-b-${suffix}@example.com`,
        password: "senha-segura-123",
        workspaceName: "Audio B",
      }),
    ]);
    workspaceA = signupA.workspace.id;
    workspaceB = signupB.workspace.id;
    userA = signupA.user.id;
    userB = signupB.user.id;
    sessionA = (await startOnboardingSession(workspaceA, userA)).id;
    const asset = await createOnboardingAudioAsset({
      sessionId: sessionA,
      workspaceId: workspaceA,
      stepKey: "voice",
      storageKey: `workspaces/${workspaceA}/onboarding-audio/${sessionA}/asset.webm`,
      mimeType: "audio/webm",
      sizeBytes: 128,
      durationMs: 4_000,
      sha256: "a".repeat(64),
      createdByUserId: userA,
    });
    if (!asset) throw new Error("asset was not created");
    assetId = asset.id;
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(onboardingTranscriptions).where(inArray(onboardingTranscriptions.workspaceId, [workspaceA, workspaceB]));
    await db.delete(onboardingAudioAssets).where(inArray(onboardingAudioAssets.workspaceId, [workspaceA, workspaceB]));
    await db.delete(onboardingSessions).where(inArray(onboardingSessions.workspaceId, [workspaceA, workspaceB]));
    await db.delete(auditLogs).where(inArray(auditLogs.workspaceId, [workspaceA, workspaceB]));
    await db.delete(consentRecords).where(inArray(consentRecords.workspaceId, [workspaceA, workspaceB]));
    await db.delete(workspaceMembers).where(inArray(workspaceMembers.workspaceId, [workspaceA, workspaceB]));
    await db.delete(users).where(inArray(users.id, [userA, userB].filter(Boolean)));
    await db.delete(workspaces).where(inArray(workspaces.id, [workspaceA, workspaceB].filter(Boolean)));
  });

  it("does not expose an asset to another workspace", async () => {
    expect(await getOnboardingAudioAssetForWorkspace(workspaceA, assetId)).toMatchObject({
      id: assetId,
      workspaceId: workspaceA,
      sessionId: sessionA,
      transcriptStatus: "uploaded",
    });
    expect(await getOnboardingAudioAssetForWorkspace(workspaceB, assetId)).toBeUndefined();
    await expect(claimOnboardingAudioTranscription(workspaceB, assetId)).rejects.toThrow(
      "ONBOARDING_AUDIO_NOT_FOUND"
    );
  });

  it("deduplicates the same session/hash and permits one processing claim", async () => {
    const duplicate = await createOnboardingAudioAsset({
      sessionId: sessionA,
      workspaceId: workspaceA,
      stepKey: "voice",
      storageKey: `workspaces/${workspaceA}/onboarding-audio/${sessionA}/duplicate.webm`,
      mimeType: "audio/webm",
      sizeBytes: 128,
      durationMs: 4_000,
      sha256: "a".repeat(64),
      createdByUserId: userA,
    });
    expect(duplicate?.id).toBe(assetId);

    const firstClaim = await claimOnboardingAudioTranscription(workspaceA, assetId);
    expect(firstClaim).toMatchObject({ claimed: true, reason: "claimed" });
    const secondClaim = await claimOnboardingAudioTranscription(workspaceA, assetId);
    expect(secondClaim).toMatchObject({ claimed: false, reason: "processing" });

    const persisted = await persistOnboardingAudioTranscription(workspaceA, assetId, {
      ok: true,
      provider: "test",
      model: "test-model",
      language: "pt",
      text: "áudio de teste",
      segments: [],
    });
    expect(persisted).toMatchObject({ status: "completed", text: "áudio de teste" });
    expect(await getOnboardingAudioAssetForWorkspace(workspaceA, assetId)).toMatchObject({
      transcriptStatus: "completed",
    });
  });
});
