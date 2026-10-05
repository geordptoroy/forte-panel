import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { validateMediaInventory } from "./verify-restore-rehearsal";

export type MediaBackupEvidence = {
  inventoryPath: string;
  inventoryObjects: number;
  provider: "forge-presign-only" | "s3-compatible-export" | "unknown";
  contentExportPath?: string;
  contentExportSha256?: string;
  restoreProofPath?: string;
  restoreProofSha256?: string;
};

export type MediaBackupAssessment = {
  state: "blocked" | "inventory_only" | "restore_proven";
  reasons: string[];
  evidence: MediaBackupEvidence;
};

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function artifactInside(baseDir: string, candidate: string | undefined) {
  if (!candidate) return false;
  const resolved = resolve(baseDir, candidate);
  const relativePath = relative(resolve(baseDir), resolved);
  return (
    Boolean(relativePath) &&
    !relativePath.startsWith("..") &&
    !isAbsolute(relativePath) &&
    existsSync(resolved)
  );
}

function sha256(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function assessMediaBackupEvidence(input: {
  inventoryPath: string;
  provider?: MediaBackupEvidence["provider"];
  contentExportPath?: string;
  contentExportSha256?: string;
  restoreProofPath?: string;
  restoreProofSha256?: string;
}): MediaBackupAssessment {
  const inventoryPath = resolve(input.inventoryPath);
  if (!existsSync(inventoryPath))
    throw new Error("media_inventory_input_missing");
  const inventoryObjects = validateMediaInventory(inventoryPath);
  const baseDir = resolve(inventoryPath, "..");
  const provider = input.provider ?? "unknown";
  const evidence: MediaBackupEvidence = {
    inventoryPath,
    inventoryObjects,
    provider,
    ...(input.contentExportPath
      ? { contentExportPath: input.contentExportPath }
      : {}),
    ...(input.contentExportSha256
      ? { contentExportSha256: input.contentExportSha256 }
      : {}),
    ...(input.restoreProofPath
      ? { restoreProofPath: input.restoreProofPath }
      : {}),
    ...(input.restoreProofSha256
      ? { restoreProofSha256: input.restoreProofSha256 }
      : {}),
  };
  const reasons: string[] = [];

  if (provider === "forge-presign-only") {
    reasons.push("provider_exposes_presign_only");
  } else if (provider === "unknown") {
    reasons.push("provider_not_declared");
  }
  if (!artifactInside(baseDir, input.contentExportPath)) {
    reasons.push("media_content_export_missing");
  }
  if (!isSha256(input.contentExportSha256)) {
    reasons.push("media_content_export_hash_missing");
  } else if (
    artifactInside(baseDir, input.contentExportPath) &&
    sha256(resolve(baseDir, input.contentExportPath!)) !==
      input.contentExportSha256
  ) {
    reasons.push("media_content_export_hash_mismatch");
  }
  if (!artifactInside(baseDir, input.restoreProofPath)) {
    reasons.push("media_restore_proof_missing");
  }
  if (!isSha256(input.restoreProofSha256)) {
    reasons.push("media_restore_proof_hash_missing");
  } else if (
    artifactInside(baseDir, input.restoreProofPath) &&
    sha256(resolve(baseDir, input.restoreProofPath!)) !==
      input.restoreProofSha256
  ) {
    reasons.push("media_restore_proof_hash_mismatch");
  }

  const state =
    reasons.length === 0
      ? "restore_proven"
      : provider === "forge-presign-only" &&
          reasons.length === 5 &&
          reasons.includes("provider_exposes_presign_only")
        ? "inventory_only"
        : "blocked";
  return { state, reasons, evidence };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [
    inventoryPath,
    provider,
    contentExportPath,
    contentExportSha256,
    restoreProofPath,
    restoreProofSha256,
  ] = process.argv.slice(2);
  if (!inventoryPath) {
    console.error(
      "Usage: pnpm verify:media-backup INVENTORY.json [provider] [content-export] [content-sha256] [restore-proof] [proof-sha256]"
    );
    process.exitCode = 2;
  } else {
    try {
      const result = assessMediaBackupEvidence({
        inventoryPath,
        provider: provider as MediaBackupEvidence["provider"] | undefined,
        contentExportPath,
        contentExportSha256,
        restoreProofPath,
        restoreProofSha256,
      });
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      if (result.state !== "restore_proven") process.exitCode = 1;
    } catch (error) {
      console.error(
        error instanceof Error ? error.message : "media_backup_evidence_failed"
      );
      process.exitCode = 1;
    }
  }
}
