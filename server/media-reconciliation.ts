const WORKSPACE_MEDIA_PREFIXES = [
  "outbound/",
  "whatsapp/",
  "onboarding-audio/",
] as const;

export type StorageObjectCandidate = {
  key: string;
  lastModifiedAt: Date;
};

export type MediaReconciliationResult = {
  referenced: string[];
  protected: string[];
  orphanCandidates: string[];
  unknown: string[];
};

export function isWorkspaceMediaKey(workspaceId: number, key: string) {
  if (!Number.isInteger(workspaceId) || workspaceId <= 0) return false;
  if (key.length > 512 || !key.startsWith(`workspaces/${workspaceId}/`)) return false;
  if (key.includes("..") || /[\\\u0000-\u001f]/.test(key)) return false;
  const relative = key.slice(`workspaces/${workspaceId}/`.length);
  return WORKSPACE_MEDIA_PREFIXES.some(prefix => relative.startsWith(prefix));
}

export function classifyWorkspaceMediaObjects(input: {
  workspaceId: number;
  objects: readonly StorageObjectCandidate[];
  referencedKeys: ReadonlySet<string>;
  now?: Date;
  protectionWindowMs?: number;
}): MediaReconciliationResult {
  const now = input.now ?? new Date();
  const protectionWindowMs = Math.max(
    60 * 60 * 1000,
    input.protectionWindowMs ?? 24 * 60 * 60 * 1000
  );
  const referenced = new Set<string>();
  const protectedKeys = new Set<string>();
  const orphanCandidates = new Set<string>();
  const unknown = new Set<string>();

  for (const key of Array.from(input.referencedKeys)) {
    if (isWorkspaceMediaKey(input.workspaceId, key)) referenced.add(key);
  }

  for (const object of input.objects) {
    if (!isWorkspaceMediaKey(input.workspaceId, object.key)) {
      unknown.add(object.key);
      continue;
    }
    if (referenced.has(object.key)) {
      referenced.add(object.key);
      continue;
    }
    if (now.getTime() - object.lastModifiedAt.getTime() < protectionWindowMs) {
      protectedKeys.add(object.key);
      continue;
    }
    orphanCandidates.add(object.key);
  }

  return {
    referenced: Array.from(referenced).sort(),
    protected: Array.from(protectedKeys).sort(),
    orphanCandidates: Array.from(orphanCandidates).sort(),
    unknown: Array.from(unknown).sort(),
  };
}
