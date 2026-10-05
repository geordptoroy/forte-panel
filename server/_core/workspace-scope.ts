export type WorkspaceScopedResource = {
  workspaceId: number;
};

export type WorkspaceResourceLookup<T extends WorkspaceScopedResource> = (
  workspaceId: number,
  resourceId: number
) => Promise<T | null | undefined>;

export type WorkspaceScopeErrorCode =
  | "invalid_workspace_id"
  | "invalid_resource_id"
  | "workspace_mismatch"
  | "resource_not_found";

/**
 * Error raised by the trusted workspace-scope helpers.
 *
 * Callers can map this to NOT_FOUND or FORBIDDEN at their boundary without
 * exposing whether a resource exists in another workspace.
 */
export class WorkspaceScopeError extends Error {
  readonly code: WorkspaceScopeErrorCode;

  constructor(
    code: WorkspaceScopeErrorCode,
    message = "Recurso não encontrado neste workspace"
  ) {
    super(message);
    this.name = "WorkspaceScopeError";
    this.code = code;
  }
}

function assertPositiveInteger(value: number, code: WorkspaceScopeErrorCode) {
  if (!Number.isInteger(value) || value < 1)
    throw new WorkspaceScopeError(
      code,
      code === "invalid_workspace_id"
        ? "Workspace inválido"
        : "Recurso inválido"
    );
  return value;
}

/**
 * Returns the trusted workspace ID and rejects a client-supplied mismatch.
 *
 * A missing supplied ID is accepted for backwards-compatible inputs that do
 * not need to repeat the workspace. When supplied, it must match exactly.
 */
export function assertWorkspaceId(
  trustedWorkspaceId: number,
  suppliedWorkspaceId?: number | null
) {
  const trusted = assertPositiveInteger(
    trustedWorkspaceId,
    "invalid_workspace_id"
  );
  if (suppliedWorkspaceId === undefined || suppliedWorkspaceId === null)
    return trusted;

  const supplied = assertPositiveInteger(
    suppliedWorkspaceId,
    "invalid_workspace_id"
  );
  if (supplied !== trusted)
    throw new WorkspaceScopeError(
      "workspace_mismatch",
      "O workspace solicitado não corresponde ao contexto autenticado"
    );
  return trusted;
}

export function assertResourceId(resourceId: number) {
  return assertPositiveInteger(resourceId, "invalid_resource_id");
}

export function resourceBelongsToWorkspace(
  resource: WorkspaceScopedResource | null | undefined,
  trustedWorkspaceId: number
) {
  const workspaceId = assertWorkspaceId(trustedWorkspaceId);
  return Boolean(resource && resource.workspaceId === workspaceId);
}

/**
 * Resolve a resource using both workspace and resource IDs.
 *
 * The lookup callback must enforce the same pair at the database/query layer.
 * The post-lookup check remains as defence in depth if a buggy callback ever
 * returns a resource from another workspace.
 */
export async function getResourceInWorkspace<T extends WorkspaceScopedResource>(
  trustedWorkspaceId: number,
  resourceId: number,
  lookup: WorkspaceResourceLookup<T>
) {
  const workspaceId = assertWorkspaceId(trustedWorkspaceId);
  const id = assertResourceId(resourceId);
  const resource = await lookup(workspaceId, id);
  return resourceBelongsToWorkspace(resource, workspaceId)
    ? resource
    : undefined;
}

/**
 * Assert that a previously loaded resource belongs to the trusted workspace.
 *
 * The error intentionally uses a generic not-found code/message so callers do
 * not reveal that the ID exists in another tenant.
 */
export function assertResourceInWorkspace<T extends WorkspaceScopedResource>(
  trustedWorkspaceId: number,
  resource: T | null | undefined,
  message = "Recurso não encontrado neste workspace"
) {
  if (!resourceBelongsToWorkspace(resource, trustedWorkspaceId))
    throw new WorkspaceScopeError("resource_not_found", message);
  return resource;
}
