import {
  reconcileWorkspaceMedia,
  type ReconcileStorageResult,
  type WorkspaceMediaStore,
} from "./storage-reconciliation";
import { persistStorageReconciliationAudit } from "./storage-reconciliation-audit";

type StorageReconciliationProvider = {
  listWorkspaceIds(): Promise<number[]>;
  storeForWorkspace(workspaceId: number): Promise<WorkspaceMediaStore>;
  referencedKeys(workspaceId: number): Promise<ReadonlySet<string>>;
};

export type StorageReconciliationRunnerResult = {
  skipped: boolean;
  reason?: "provider_not_configured";
  dryRun: boolean;
  workspaces: number;
  candidates: number;
  deleted: number;
  persistedAudits: number;
  failures: number;
};

export async function runStorageReconciliationSweep(input: {
  provider?: StorageReconciliationProvider;
  dryRun?: boolean;
  workspaceLimit?: number;
  maxPages?: number;
}): Promise<StorageReconciliationRunnerResult> {
  const dryRun = input.dryRun !== false;
  if (!input.provider)
    return {
      skipped: true,
      reason: "provider_not_configured",
      dryRun,
      workspaces: 0,
      candidates: 0,
      deleted: 0,
      persistedAudits: 0,
      failures: 0,
    };

  const workspaceLimit = Math.max(
    1,
    Math.min(Math.floor(input.workspaceLimit ?? 100), 1_000)
  );
  const workspaceIds = (await input.provider.listWorkspaceIds()).slice(0, workspaceLimit);
  let candidates = 0;
  let deleted = 0;
  let persistedAudits = 0;
  let failures = 0;
  for (const workspaceId of workspaceIds) {
    try {
      const [store, referencedKeys] = await Promise.all([
        input.provider.storeForWorkspace(workspaceId),
        input.provider.referencedKeys(workspaceId),
      ]);
      const result: ReconcileStorageResult = await reconcileWorkspaceMedia({
        store,
        workspaceId,
        referencedKeys,
        dryRun,
        maxPages: input.maxPages,
        onMetrics: async metrics => {
          const audit = await persistStorageReconciliationAudit(metrics);
          if (audit.persisted) persistedAudits += 1;
        },
      });
      candidates += result.metrics.orphanCandidates;
      deleted += result.metrics.deleted;
    } catch {
      failures += 1;
    }
  }
  return {
    skipped: false,
    dryRun,
    workspaces: workspaceIds.length,
    candidates,
    deleted,
    persistedAudits,
    failures,
  };
}

export type { StorageReconciliationProvider };
