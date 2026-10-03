import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import {
  onboardingAudioAssets,
  onboardingRetentionPolicies,
  onboardingTranscriptions,
  workspaces,
} from "../drizzle/schema";
import { cleanupOnboardingAudioRetention, getDb } from "./db";

const hasDatabase = Boolean(
  process.env.DATABASE_URL &&
    /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL)
);

describe.skipIf(!hasDatabase)("onboarding audio retention", () => {
  const now = new Date("2026-09-27T12:00:00.000Z");
  const suffix = `audio-retention-${Date.now()}`;
  let workspaceA = 0;
  let workspaceB = 0;
  let assetA = 0;
  let assetB = 0;
  let transcriptionA = 0;
  let transcriptionB = 0;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const rows = await db
      .insert(workspaces)
      .values([
        { name: `Retention A ${suffix}`, slug: `retention-a-${suffix}` },
        { name: `Retention B ${suffix}`, slug: `retention-b-${suffix}` },
      ])
      .returning({ id: workspaces.id });
    workspaceA = rows[0].id;
    workspaceB = rows[1].id;
    await db.insert(onboardingRetentionPolicies).values({
      workspaceId: workspaceA,
      rawArtifactDays: 1,
      derivedDataDays: 30,
      policyVersion: "test-retention",
      updatedBy: 1,
    });
    const assets = await db
      .insert(onboardingAudioAssets)
      .values([
        {
          sessionId: 900001,
          workspaceId: workspaceA,
          stepKey: "voice",
          storageKey: `workspaces/${workspaceA}/retention-a.webm`,
          mimeType: "audio/webm",
          sizeBytes: 10,
          durationMs: 1_000,
          sha256: "b".repeat(64),
          transcriptStatus: "completed",
          expiresAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
          createdByUserId: 1,
          createdAt: new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000),
          updatedAt: new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000),
        },
        {
          sessionId: 900002,
          workspaceId: workspaceB,
          stepKey: "voice",
          storageKey: `workspaces/${workspaceB}/retention-b.webm`,
          mimeType: "audio/webm",
          sizeBytes: 10,
          durationMs: 1_000,
          sha256: "c".repeat(64),
          transcriptStatus: "completed",
          expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          createdByUserId: 1,
          createdAt: new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000),
          updatedAt: new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000),
        },
      ])
      .returning({ id: onboardingAudioAssets.id });
    assetA = assets[0].id;
    assetB = assets[1].id;
    const transcriptions = await db
      .insert(onboardingTranscriptions)
      .values([
        {
          assetId: assetA,
          sessionId: 900001,
          workspaceId: workspaceA,
          status: "completed",
          provider: "baileys",
          model: "test",
          language: "pt",
          text: "expirar",
          segments: [],
          retryCount: 0,
          completedAt: new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000),
          createdAt: new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000),
          updatedAt: new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000),
        },
        {
          assetId: assetB,
          sessionId: 900002,
          workspaceId: workspaceB,
          status: "completed",
          provider: "baileys",
          model: "test",
          language: "pt",
          text: "preservar",
          segments: [],
          retryCount: 0,
          completedAt: new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000),
          createdAt: new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000),
          updatedAt: new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000),
        },
      ])
      .returning({ id: onboardingTranscriptions.id });
    transcriptionA = transcriptions[0].id;
    transcriptionB = transcriptions[1].id;
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db
      .delete(onboardingTranscriptions)
      .where(
        inArray(
          onboardingTranscriptions.id,
          [transcriptionA, transcriptionB].filter(Boolean)
        )
      );
    await db
      .delete(onboardingAudioAssets)
      .where(
        inArray(onboardingAudioAssets.id, [assetA, assetB].filter(Boolean))
      );
    await db
      .delete(onboardingRetentionPolicies)
      .where(
        inArray(
          onboardingRetentionPolicies.workspaceId,
          [workspaceA, workspaceB].filter(Boolean)
        )
      );
    await db
      .delete(workspaces)
      .where(inArray(workspaces.id, [workspaceA, workspaceB].filter(Boolean)));
  });

  it("supports dry-run without deleting and reports counts by workspace", async () => {
    const result = await cleanupOnboardingAudioRetention({ dryRun: true, now });
    expect(result).toMatchObject({
      skipped: false,
      dryRun: true,
      assetsExpired: 1,
      transcriptionsExpired: 1,
      workspaces: { [workspaceA]: { assets: 1, transcriptions: 1 } },
    });
    const db = await getDb();
    expect(
      await db
        ?.select()
        .from(onboardingAudioAssets)
        .where(inArray(onboardingAudioAssets.id, [assetA]))
    ).toHaveLength(1);
  });

  it("deletes only expired rows and keeps another workspace intact", async () => {
    const result = await cleanupOnboardingAudioRetention({ now });
    expect(result).toMatchObject({
      assetsExpired: 1,
      transcriptionsExpired: 1,
    });
    const db = await getDb();
    expect(
      await db
        ?.select()
        .from(onboardingAudioAssets)
        .where(inArray(onboardingAudioAssets.id, [assetA]))
    ).toHaveLength(0);
    expect(
      await db
        ?.select()
        .from(onboardingTranscriptions)
        .where(inArray(onboardingTranscriptions.id, [transcriptionA]))
    ).toHaveLength(0);
    expect(
      await db
        ?.select()
        .from(onboardingAudioAssets)
        .where(inArray(onboardingAudioAssets.id, [assetB]))
    ).toHaveLength(1);
    expect(
      await db
        ?.select()
        .from(onboardingTranscriptions)
        .where(inArray(onboardingTranscriptions.id, [transcriptionB]))
    ).toHaveLength(1);
  });
});
