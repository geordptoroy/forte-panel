import { describe, expect, it, vi } from "vitest";
import {
  assertResourceInWorkspace,
  assertWorkspaceId,
  getResourceInWorkspace,
  resourceBelongsToWorkspace,
  WorkspaceScopeError,
} from "./workspace-scope";

describe("trusted workspace scope", () => {
  it("returns the trusted workspace and accepts an omitted duplicate", () => {
    expect(assertWorkspaceId(42)).toBe(42);
    expect(assertWorkspaceId(42, null)).toBe(42);
    expect(assertWorkspaceId(42, 42)).toBe(42);
  });

  it("rejects invalid IDs and a client-supplied workspace mismatch", () => {
    expect(() => assertWorkspaceId(0)).toThrowError(WorkspaceScopeError);
    expect(() => assertWorkspaceId(42, 0)).toThrowError(WorkspaceScopeError);
    expect(() => assertWorkspaceId(42, 43)).toThrowError(
      expect.objectContaining({ code: "workspace_mismatch" })
    );
  });

  it("checks resource ownership without revealing foreign resources", () => {
    expect(resourceBelongsToWorkspace({ workspaceId: 42 }, 42)).toBe(true);
    expect(resourceBelongsToWorkspace({ workspaceId: 43 }, 42)).toBe(false);
    expect(resourceBelongsToWorkspace(undefined, 42)).toBe(false);

    expect(() =>
      assertResourceInWorkspace(42, { id: 7, workspaceId: 43 })
    ).toThrowError(
      expect.objectContaining({
        code: "resource_not_found",
        message: "Recurso não encontrado neste workspace",
      })
    );
  });

  it("passes both trusted IDs to the lookup and returns only same-workspace data", async () => {
    const lookup = vi.fn(async (workspaceId: number, resourceId: number) => ({
      id: resourceId,
      workspaceId,
    }));

    await expect(getResourceInWorkspace(42, 7, lookup)).resolves.toEqual({
      id: 7,
      workspaceId: 42,
    });
    expect(lookup).toHaveBeenCalledWith(42, 7);
  });

  it("hides a foreign resource even if a buggy lookup returns it", async () => {
    const lookup = vi.fn(async () => ({ id: 7, workspaceId: 43 }));

    await expect(
      getResourceInWorkspace(42, 7, lookup)
    ).resolves.toBeUndefined();
  });

  it("rejects invalid resource IDs before calling the lookup", async () => {
    const lookup = vi.fn();

    await expect(getResourceInWorkspace(42, 0, lookup)).rejects.toMatchObject({
      code: "invalid_resource_id",
    });
    expect(lookup).not.toHaveBeenCalled();
  });
});
