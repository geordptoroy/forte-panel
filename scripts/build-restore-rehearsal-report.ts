import { readFileSync, writeFileSync } from "node:fs";

type ComponentStatus = "pass" | "fail" | "unknown";
const COMPONENTS = [
  "postgres",
  "media",
  "redis",
  "baileys_session",
  "keys",
  "config",
] as const;
type Component = (typeof COMPONENTS)[number];

export type RestoreEvidenceInput = {
  rehearsalId: string;
  backupCreatedAt: string;
  startedAt: string;
  readyAt?: string;
  targetRpoMs: number;
  targetRtoMs: number;
  imageDigests?: string[];
  noProductionTraffic: boolean;
  rollbackDemonstrated: boolean;
  components: Partial<
    Record<Component, { status: ComponentStatus; evidence?: string }>
  >;
  counts?: {
    workspaces?: number;
    conversations?: number;
    messages?: number;
    mediaObjects?: number;
  };
};

export type RestoreRehearsalReport = {
  rehearsalId: string;
  decision: "approved" | "inconclusive" | "blocked";
  generatedAt: string;
  timing: {
    rpoMs: number | null;
    rtoMs: number | null;
    targetRpoMs: number;
    targetRtoMs: number;
  };
  components: Record<Component, { status: ComponentStatus; evidence?: string }>;
  imageDigests: string[];
  counts: {
    workspaces: number;
    conversations: number;
    messages: number;
    mediaObjects: number;
  };
  safety: { noProductionTraffic: boolean; rollbackDemonstrated: boolean };
  reasons: string[];
};

function parseDate(value: string, name: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`${name}_invalid`);
  return timestamp;
}

function safeDigest(value: string) {
  return /^sha256:[a-f0-9]{64}$/i.test(value) ? value : null;
}

function safeEvidence(value: string | undefined) {
  if (!value) return undefined;
  return /^[A-Za-z0-9_.:-]{1,120}$/.test(value) ? value : "redacted";
}

export function buildRestoreRehearsalReport(
  input: RestoreEvidenceInput,
  now = new Date("2026-09-30T00:00:00.000Z")
): RestoreRehearsalReport {
  if (!/^[A-Za-z0-9._-]{1,120}$/.test(input.rehearsalId))
    throw new Error("rehearsal_id_invalid");
  const backupAt = parseDate(input.backupCreatedAt, "backup_created_at");
  const startedAt = parseDate(input.startedAt, "started_at");
  const readyAt = input.readyAt ? parseDate(input.readyAt, "ready_at") : null;
  const rpoMs = startedAt - backupAt;
  const rtoMs = readyAt === null ? null : readyAt - startedAt;
  const reasons: string[] = [];
  if (rpoMs < 0) reasons.push("rpo_negative");
  if (rtoMs !== null && rtoMs < 0) reasons.push("rto_negative");
  if (!Number.isFinite(input.targetRpoMs) || input.targetRpoMs <= 0)
    reasons.push("target_rpo_invalid");
  if (!Number.isFinite(input.targetRtoMs) || input.targetRtoMs <= 0)
    reasons.push("target_rto_invalid");
  if (rpoMs > input.targetRpoMs) reasons.push("rpo_target_exceeded");
  if (rtoMs !== null && rtoMs > input.targetRtoMs)
    reasons.push("rto_target_exceeded");
  if (!input.noProductionTraffic)
    reasons.push("production_traffic_not_excluded");
  if (!input.rollbackDemonstrated) reasons.push("rollback_not_demonstrated");

  const components = Object.fromEntries(
    COMPONENTS.map(component => [
      component,
      input.components[component] ?? { status: "unknown" as const },
    ])
  ) as RestoreRehearsalReport["components"];
  for (const component of COMPONENTS) {
    if (components[component].status === "fail")
      reasons.push(`${component}_failed`);
    if (components[component].status === "unknown")
      reasons.push(`${component}_inconclusive`);
  }
  if (readyAt === null) reasons.push("readiness_missing");

  const imageDigests = (input.imageDigests ?? [])
    .map(safeDigest)
    .filter((value): value is string => value !== null);
  if ((input.imageDigests ?? []).length === 0)
    reasons.push("image_digest_missing");
  if (imageDigests.length !== (input.imageDigests ?? []).length)
    reasons.push("image_digest_invalid");
  const counts = {
    workspaces: Math.max(0, Math.floor(input.counts?.workspaces ?? 0)),
    conversations: Math.max(0, Math.floor(input.counts?.conversations ?? 0)),
    messages: Math.max(0, Math.floor(input.counts?.messages ?? 0)),
    mediaObjects: Math.max(0, Math.floor(input.counts?.mediaObjects ?? 0)),
  };

  const blocked = reasons.some(
    reason =>
      reason.endsWith("_failed") ||
      reason.includes("negative") ||
      reason.includes("invalid") ||
      reason === "production_traffic_not_excluded"
  );
  const inconclusive = reasons.length > 0;
  return {
    rehearsalId: input.rehearsalId,
    decision: blocked ? "blocked" : inconclusive ? "inconclusive" : "approved",
    generatedAt: now.toISOString(),
    timing: {
      rpoMs: rpoMs >= 0 ? rpoMs : null,
      rtoMs: rtoMs !== null && rtoMs >= 0 ? rtoMs : null,
      targetRpoMs: input.targetRpoMs,
      targetRtoMs: input.targetRtoMs,
    },
    components: Object.fromEntries(
      COMPONENTS.map(component => [
        component,
        {
          status: components[component].status,
          evidence: safeEvidence(components[component].evidence),
        },
      ])
    ) as RestoreRehearsalReport["components"],
    imageDigests,
    counts,
    safety: {
      noProductionTraffic: input.noProductionTraffic,
      rollbackDemonstrated: input.rollbackDemonstrated,
    },
    reasons,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];
  if (!inputPath) {
    console.error(
      "Usage: pnpm report:restore-rehearsal EVIDENCE.json [REPORT.json]"
    );
    process.exitCode = 2;
  } else {
    try {
      const report = buildRestoreRehearsalReport(
        JSON.parse(readFileSync(inputPath, "utf8")) as RestoreEvidenceInput
      );
      const serialized = `${JSON.stringify(report, null, 2)}\n`;
      if (outputPath) writeFileSync(outputPath, serialized, { mode: 0o600 });
      else process.stdout.write(serialized);
      if (report.decision !== "approved") process.exitCode = 1;
    } catch (error) {
      console.error(
        error instanceof Error ? error.message : "restore_report_failed"
      );
      process.exitCode = 1;
    }
  }
}
