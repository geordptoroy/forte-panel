import {
  classifyWorkspaceMediaObjects,
  type MediaReconciliationResult,
  type StorageObjectCandidate,
} from "./media-reconciliation";
import {
  summarizeStorageReconciliation,
  type StorageReconciliationMetrics,
} from "./storage-reconciliation-observability";

export type StoragePage = {
  objects: StorageObjectCandidate[];
  nextCursor?: string;
};

export interface WorkspaceMediaStore {
  list(prefix: string, cursor?: string): Promise<StoragePage>;
  delete(key: string, options: { ifMatch: string }): Promise<void>;
}

export type ReconcileStorageResult = MediaReconciliationResult & {
  deleted: string[];
  skippedWithoutEtag: string[];
  metrics: StorageReconciliationMetrics;
};

export async function reconcileWorkspaceMedia(input: {
  store: WorkspaceMediaStore;
  workspaceId: number;
  referencedKeys: ReadonlySet<string>;
  dryRun?: boolean;
  now?: Date;
  protectionWindowMs?: number;
  maxPages?: number;
}): Promise<ReconcileStorageResult> {
  const startedAt = Date.now();
  const maxPages = Math.max(1, Math.min(Math.floor(input.maxPages ?? 1000), 10_000));
  const prefix = `workspaces/${input.workspaceId}/`;
  const objects: StorageObjectCandidate[] = [];
  let cursor: string | undefined;
  let pages = 0;
  do {
    pages += 1;
    if (pages > maxPages) throw new Error("STORAGE_RECONCILIATION_PAGE_LIMIT");
    const page = await input.store.list(prefix, cursor);
    objects.push(...page.objects);
    cursor = page.nextCursor;
  } while (cursor);

  const classified = classifyWorkspaceMediaObjects({
    workspaceId: input.workspaceId,
    objects,
    referencedKeys: input.referencedKeys,
    now: input.now,
    protectionWindowMs: input.protectionWindowMs,
  });
  const byKey = new Map(objects.map(object => [object.key, object]));
  const deleted: string[] = [];
  const skippedWithoutEtag: string[] = [];

  if (input.dryRun === false) {
    for (const key of classified.orphanCandidates) {
      const etag = byKey.get(key)?.etag;
      if (!etag) {
        skippedWithoutEtag.push(key);
        continue;
      }
      await input.store.delete(key, { ifMatch: etag });
      deleted.push(key);
    }
  }

  const result = { ...classified, deleted, skippedWithoutEtag };
  return {
    ...result,
    metrics: summarizeStorageReconciliation({
      workspaceId: input.workspaceId,
      dryRun: input.dryRun !== false,
      pages,
      durationMs: Date.now() - startedAt,
      result,
    }),
  };
}
