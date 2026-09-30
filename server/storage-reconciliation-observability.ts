import { randomUUID } from "node:crypto";
import type { ReconcileStorageResult } from "./storage-reconciliation";

export type StorageReconciliationMetrics = {
  runId: string;
  workspaceId: number;
  dryRun: boolean;
  pages: number;
  referenced: number;
  protected: number;
  orphanCandidates: number;
  unknown: number;
  deleted: number;
  skippedWithoutEtag: number;
  durationMs: number;
};

export function summarizeStorageReconciliation(input: {
  workspaceId: number;
  dryRun: boolean;
  pages: number;
  durationMs: number;
  result: Omit<ReconcileStorageResult, "metrics">;
  runId?: string;
}): StorageReconciliationMetrics {
  return {
    runId: input.runId ?? randomUUID(),
    workspaceId: input.workspaceId,
    dryRun: input.dryRun,
    pages: input.pages,
    referenced: input.result.referenced.length,
    protected: input.result.protected.length,
    orphanCandidates: input.result.orphanCandidates.length,
    unknown: input.result.unknown.length,
    deleted: input.result.deleted.length,
    skippedWithoutEtag: input.result.skippedWithoutEtag.length,
    durationMs: Math.max(0, Math.floor(input.durationMs)),
  };
}
