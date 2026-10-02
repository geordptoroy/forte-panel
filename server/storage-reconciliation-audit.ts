import { auditLogs } from "../drizzle/schema";
import { getDb } from "./db";
import type { StorageReconciliationMetrics } from "./storage-reconciliation-observability";

export function buildStorageReconciliationAuditSummary(
  metrics: StorageReconciliationMetrics
) {
  return [
    `Reconciliação ${metrics.dryRun ? "dry-run" : "controlada"}`,
    `run=${metrics.runId}`,
    `pages=${metrics.pages}`,
    `referenced=${metrics.referenced}`,
    `protected=${metrics.protected}`,
    `candidates=${metrics.orphanCandidates}`,
    `unknown=${metrics.unknown}`,
    `deleted=${metrics.deleted}`,
    `without_etag=${metrics.skippedWithoutEtag}`,
    `duration_ms=${metrics.durationMs}`,
  ].join(" ").slice(0, 500);
}

export async function persistStorageReconciliationAudit(
  metrics: StorageReconciliationMetrics
) {
  const db = await getDb();
  if (!db) return { persisted: false as const };

  const [created] = await db
    .insert(auditLogs)
    .values({
      workspaceId: metrics.workspaceId,
      actorUserId: null,
      contactId: null,
      action: "storage_reconciliation_completed",
      summary: buildStorageReconciliationAuditSummary(metrics),
    })
    .returning({ id: auditLogs.id });

  return { persisted: true as const, auditId: created?.id ?? null };
}
