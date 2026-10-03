import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assessMediaBackupEvidence } from "./media-backup-evidence";

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "forte-media-evidence-"));
  const inventory = join(dir, "MEDIA_INVENTORY.json");
  writeFileSync(
    inventory,
    JSON.stringify([
      {
        workspaceId: 12,
        key: "workspaces/12/media/a.bin",
        sha256: "a".repeat(64),
      },
    ])
  );
  return { dir, inventory };
}

function sha256(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

describe("media backup evidence", () => {
  it("marks Forge presign-only as inventory-only, never restore-proven", () => {
    const { inventory } = fixture();
    const result = assessMediaBackupEvidence({
      inventoryPath: inventory,
      provider: "forge-presign-only",
    });
    expect(result.state).toBe("inventory_only");
    expect(result.reasons).toContain("provider_exposes_presign_only");
  });

  it("blocks an undeclared provider without content and restore proof", () => {
    const { inventory } = fixture();
    const result = assessMediaBackupEvidence({ inventoryPath: inventory });
    expect(result.state).toBe("blocked");
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        "provider_not_declared",
        "media_content_export_missing",
        "media_restore_proof_missing",
      ])
    );
  });

  it("accepts only complete bounded evidence", () => {
    const { dir, inventory } = fixture();
    const content = join(dir, "media.tar.zst");
    const proof = join(dir, "restore-proof.json");
    writeFileSync(content, "exported media");
    writeFileSync(proof, "restore verified");
    const result = assessMediaBackupEvidence({
      inventoryPath: inventory,
      provider: "s3-compatible-export",
      contentExportPath: "media.tar.zst",
      contentExportSha256: sha256(content),
      restoreProofPath: "restore-proof.json",
      restoreProofSha256: sha256(proof),
    });
    expect(result).toMatchObject({ state: "restore_proven", reasons: [] });
  });
});
