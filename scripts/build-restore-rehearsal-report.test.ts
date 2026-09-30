import { describe, expect, it } from "vitest";
import {
  buildRestoreRehearsalReport,
  type RestoreEvidenceInput,
} from "./build-restore-rehearsal-report";

const completeEvidence: RestoreEvidenceInput = {
  rehearsalId: "rr-20260930-01",
  backupCreatedAt: "2026-09-29T23:00:00.000Z",
  startedAt: "2026-09-30T00:00:00.000Z",
  readyAt: "2026-09-30T00:20:00.000Z",
  targetRpoMs: 2 * 60 * 60 * 1000,
  targetRtoMs: 60 * 60 * 1000,
  imageDigests: [`sha256:${"a".repeat(64)}`],
  noProductionTraffic: true,
  rollbackDemonstrated: true,
  components: {
    postgres: { status: "pass", evidence: "pg_restore_list_ok" },
    media: { status: "pass", evidence: "inventory_hashes_ok" },
    redis: { status: "pass", evidence: "isolated" },
    baileys_session: { status: "pass", evidence: "separate_target" },
    keys: { status: "pass", evidence: "secret_manager_check" },
    config: { status: "pass", evidence: "core_only" },
  },
  counts: { workspaces: 2, conversations: 4, messages: 10, mediaObjects: 6 },
};

describe("restore rehearsal report", () => {
  it("approves only complete evidence within RPO/RTO", () => {
    const report = buildRestoreRehearsalReport(completeEvidence);
    expect(report.decision).toBe("approved");
    expect(report.timing).toMatchObject({
      rpoMs: 60 * 60 * 1000,
      rtoMs: 20 * 60 * 1000,
    });
    expect(report.counts).toEqual({
      workspaces: 2,
      conversations: 4,
      messages: 10,
      mediaObjects: 6,
    });
  });

  it("marks missing readiness or unknown components inconclusive", () => {
    const report = buildRestoreRehearsalReport({
      ...completeEvidence,
      readyAt: undefined,
      components: {
        ...completeEvidence.components,
        redis: { status: "unknown" },
      },
    });
    expect(report.decision).toBe("inconclusive");
    expect(report.reasons).toEqual(
      expect.arrayContaining(["readiness_missing", "redis_inconclusive"])
    );
  });

  it("blocks failed safety or component evidence", () => {
    const report = buildRestoreRehearsalReport({
      ...completeEvidence,
      noProductionTraffic: false,
      components: { ...completeEvidence.components, media: { status: "fail" } },
    });
    expect(report.decision).toBe("blocked");
    expect(report.reasons).toEqual(
      expect.arrayContaining([
        "production_traffic_not_excluded",
        "media_failed",
      ])
    );
  });
});
