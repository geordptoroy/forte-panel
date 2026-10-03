import { describe, expect, it, vi } from "vitest";
import { runStorageReconciliationSweep, type StorageReconciliationProvider } from "./storage-reconciliation-runner";

describe("storage reconciliation runner", () => {
  it("does not activate without an explicit provider", async () => {
    await expect(runStorageReconciliationSweep({})).resolves.toMatchObject({
      skipped: true,
      reason: "provider_not_configured",
      dryRun: true,
    });
  });

  it("runs each workspace in dry-run and never calls delete", async () => {
    const store = {
      list: vi.fn().mockResolvedValue({
        objects: [
          {
            key: "workspaces/12/whatsapp/orphan.png",
            lastModifiedAt: new Date("2026-09-01"),
            etag: "etag",
          },
        ],
      }),
      delete: vi.fn(),
    };
    const provider: StorageReconciliationProvider = {
      listWorkspaceIds: vi.fn().mockResolvedValue([12]),
      storeForWorkspace: vi.fn().mockResolvedValue(store),
      referencedKeys: vi.fn().mockResolvedValue(new Set()),
    };

    const result = await runStorageReconciliationSweep({ provider });

    expect(result).toMatchObject({ skipped: false, dryRun: true, workspaces: 1, candidates: 1, deleted: 0, failures: 0 });
    expect(store.delete).not.toHaveBeenCalled();
  });
});
