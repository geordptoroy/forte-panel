import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";

type Manifest = Record<string, string>;

function parseManifest(path: string): Manifest {
  const values: Manifest = {};
  for (const line of readFileSync(path, "utf8")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)) {
    if (!line.trim()) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) throw new Error(`manifest_invalid_line:${line}`);
    values[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return values;
}

function sha256(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function runPgRestore(postgres: string) {
  try {
    execFileSync("pg_restore", ["--list", postgres], { stdio: "ignore" });
  } catch (error) {
    if (process.platform !== "win32") throw error;
    const comSpec = process.env.ComSpec ?? "cmd.exe";
    execFileSync(
      comSpec,
      ["/d", "/c", `pg_restore.cmd --list "${postgres.replaceAll('"', '""')}"`],
      { stdio: "ignore" }
    );
  }
}

function requireArtifact(dir: string, name: string, expectedHash: string) {
  if (!name || !expectedHash)
    throw new Error(`manifest_missing_${name ? "hash" : "artifact"}`);
  const path = resolve(dir, name);
  const relativePath = relative(resolve(dir), path);
  if (
    !relativePath ||
    relativePath.startsWith("..") ||
    isAbsolute(relativePath)
  )
    throw new Error("artifact_path_escape");
  if (!existsSync(path)) throw new Error(`artifact_missing:${name}`);
  if (sha256(path) !== expectedHash)
    throw new Error(`artifact_hash_mismatch:${name}`);
  return path;
}

export function validateMediaInventory(path: string) {
  const parsed: unknown = JSON.parse(
    readFileSync(path, "utf8").replace(/^\uFEFF/, "")
  );
  if (!Array.isArray(parsed)) throw new Error("media_inventory_must_be_array");
  for (const item of parsed) {
    if (!item || typeof item !== "object")
      throw new Error("media_inventory_entry_invalid");
    const value = item as Record<string, unknown>;
    if (typeof value.workspaceId !== "number" || value.workspaceId <= 0)
      throw new Error("media_inventory_workspace_invalid");
    if (
      typeof value.key !== "string" ||
      !value.key.startsWith(`workspaces/${value.workspaceId}/`)
    )
      throw new Error("media_inventory_key_invalid");
    if (
      typeof value.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/i.test(value.sha256)
    )
      throw new Error("media_inventory_hash_invalid");
  }
  return parsed.length;
}

export function verifyRestoreRehearsal(dirInput: string) {
  const dir = resolve(dirInput);
  if (!existsSync(dir)) throw new Error("backup_directory_missing");
  const manifests = readdirSync(dir)
    .filter(name => /^manifest-.*\.txt$/.test(name))
    .map(name => join(dir, name))
    .sort();
  const manifestPath = manifests.at(-1);
  if (!manifestPath) throw new Error("manifest_missing");
  const manifest = parseManifest(manifestPath);
  const postgres = requireArtifact(
    dir,
    manifest.postgres_file ?? "",
    manifest.postgres_sha256 ?? ""
  );
  const sessions = requireArtifact(
    dir,
    manifest.session_file ?? "",
    manifest.session_sha256 ?? ""
  );
  const mediaInventory = requireArtifact(
    dir,
    manifest.media_inventory_file ?? "",
    manifest.media_inventory_sha256 ?? ""
  );
  runPgRestore(postgres);
  execFileSync("tar", ["-tzf", sessions], { stdio: "ignore" });
  const mediaObjects = validateMediaInventory(mediaInventory);
  return {
    manifest: basename(manifestPath),
    postgresFile: manifest.postgres_file,
    sessionFile: manifest.session_file,
    mediaInventoryFile: manifest.media_inventory_file,
    mediaObjects,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2];
  if (!dir) {
    console.error("Usage: pnpm verify:restore-rehearsal BACKUP_DIR");
    process.exitCode = 2;
  } else {
    try {
      console.log(JSON.stringify(verifyRestoreRehearsal(dir)));
    } catch (error) {
      console.error(
        error instanceof Error
          ? error.message
          : "restore_rehearsal_verification_failed"
      );
      process.exitCode = 1;
    }
  }
}
