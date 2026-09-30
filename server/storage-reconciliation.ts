import {
  classifyWorkspaceMediaObjects,
  type MediaReconciliationResult,
  type StorageObjectCandidate,
} from "./media-reconciliation";

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
};

export async function reconcileWorkspaceMedia(input: {
  store: WorkspaceMediaStore;
  workspaceId: number;
  referencedKeys: ReadonlySet<string>;
  dryRun?: boolean;
  now?: Date;
  protectionWindowMs?: number;
}): Promise<ReconcileStorageResult> {
  const prefix = `workspaces/${input.workspaceId}/`;
  const objects: StorageObjectCandidate[] = [];
  let cursor: string | undefined;
  do {
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

  return { ...classified, deleted, skippedWithoutEtag };
}
