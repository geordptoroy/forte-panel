import { describe, expect, it, vi } from "vitest";
import { reconcileWorkspaceMedia, type WorkspaceMediaStore } from "./storage-reconciliation";

describe("storage reconciliation provider contract", () => {
  it("paginates and stays dry-run by default", async () => {
    const store: WorkspaceMediaStore = {
      list: vi.fn()
        .mockResolvedValueOnce({
          objects: [{ key: "workspaces/12/whatsapp/old.png", lastModifiedAt: new Date("2026-09-01"), etag: "a" }],
          nextCursor: "next",
        })
        .mockResolvedValueOnce({ objects: [{ key: "workspaces/12/whatsapp/new.png", lastModifiedAt: new Date("2026-09-30T11:30:00Z"), etag: "b" }] }),
      delete: vi.fn(),
    };

    const result = await reconcileWorkspaceMedia({
      store,
      workspaceId: 12,
      referencedKeys: new Set(),
      now: new Date("2026-09-30T12:00:00Z"),
    });

    expect(store.list).toHaveBeenCalledTimes(2);
    expect(store.delete).not.toHaveBeenCalled();
    expect(result.orphanCandidates).toEqual(["workspaces/12/whatsapp/old.png"]);
    expect(result.protected).toEqual(["workspaces/12/whatsapp/new.png"]);
    expect(result.metrics).toMatchObject({
      workspaceId: 12,
      dryRun: true,
      pages: 2,
      orphanCandidates: 1,
      protected: 1,
      deleted: 0,
    });
    expect(result.metrics).not.toHaveProperty("keys");
  });

  it("deletes only candidates with an etag and passes ifMatch", async () => {
    const store: WorkspaceMediaStore = {
      list: vi.fn().mockResolvedValue({
        objects: [
          { key: "workspaces/12/whatsapp/old.png", lastModifiedAt: new Date("2026-09-01"), etag: "etag-old" },
          { key: "workspaces/12/whatsapp/no-etag.png", lastModifiedAt: new Date("2026-09-01") },
        ],
      }),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    const result = await reconcileWorkspaceMedia({
      store,
      workspaceId: 12,
      referencedKeys: new Set(),
      dryRun: false,
      now: new Date("2026-09-30T12:00:00Z"),
    });

    expect(store.delete).toHaveBeenCalledWith("workspaces/12/whatsapp/old.png", { ifMatch: "etag-old" });
    expect(result.deleted).toEqual(["workspaces/12/whatsapp/old.png"]);
    expect(result.skippedWithoutEtag).toEqual(["workspaces/12/whatsapp/no-etag.png"]);
    expect(result.metrics).toMatchObject({ dryRun: false, deleted: 1, skippedWithoutEtag: 1 });
  });

  it("fails closed when a provider cursor exceeds the page limit", async () => {
    const store: WorkspaceMediaStore = {
      list: vi.fn().mockResolvedValue({ objects: [], nextCursor: "again" }),
      delete: vi.fn(),
    };

    await expect(
      reconcileWorkspaceMedia({
        store,
        workspaceId: 12,
        referencedKeys: new Set(),
        maxPages: 2,
      })
    ).rejects.toThrow("STORAGE_RECONCILIATION_PAGE_LIMIT");
    expect(store.delete).not.toHaveBeenCalled();
  });
});
