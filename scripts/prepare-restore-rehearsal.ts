import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import {
  validateMediaInventory,
  verifyRestoreRehearsal,
} from "./verify-restore-rehearsal";

type Manifest = Record<string, string>;

function sha256(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function parseManifest(path: string): Manifest {
  const values: Manifest = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) throw new Error(`manifest_invalid_line:${line}`);
    values[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return values;
}

function findManifest(backupDir: string) {
  const manifest = readdirSync(backupDir)
    .filter(name => /^manifest-.*\.txt$/.test(name))
    .sort()
    .at(-1);
  if (!manifest) throw new Error("manifest_missing");
  return join(backupDir, manifest);
}

function updateManifest(path: string, mediaFile: string, mediaHash: string) {
  const lines = readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter(
      line =>
        !line.startsWith("media_inventory_file=") &&
        !line.startsWith("media_inventory_sha256=")
    );
  while (lines.at(-1) === "") lines.pop();
  lines.push(`media_inventory_file=${mediaFile}`);
  lines.push(`media_inventory_sha256=${mediaHash}`);
  lines.push("");
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, lines.join("\n"), { mode: 0o600 });
  renameSync(temporary, path);
  chmodSync(path, 0o600);
}

export function prepareRestoreRehearsal(input: {
  backupDir: string;
  mediaInventoryPath: string;
}) {
  const backupDir = resolve(input.backupDir);
  const sourceInventory = resolve(input.mediaInventoryPath);
  if (!existsSync(backupDir) || !statSync(backupDir).isDirectory())
    throw new Error("backup_directory_missing");
  if (!existsSync(sourceInventory))
    throw new Error("media_inventory_input_missing");

  const manifestPath = findManifest(backupDir);
  const manifest = parseManifest(manifestPath);
  if (!manifest.postgres_file || !manifest.session_file)
    throw new Error("manifest_missing_database_or_session");

  const destination = join(backupDir, "media.json");
  copyFileSync(sourceInventory, destination);
  chmodSync(destination, 0o600);
  const mediaObjects = validateMediaInventory(destination);
  const mediaHash = sha256(destination);
  updateManifest(manifestPath, "media.json", mediaHash);
  const verified = verifyRestoreRehearsal(backupDir);

  return {
    backupDir,
    manifest: basename(manifestPath),
    mediaInventoryFile: "media.json",
    mediaInventorySha256: mediaHash,
    mediaObjects,
    verified,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [backupDir, mediaInventoryPath] = process.argv.slice(2);
  if (!backupDir || !mediaInventoryPath) {
    console.error(
      "Usage: pnpm prepare:restore-rehearsal BACKUP_DIR MEDIA_INVENTORY.json"
    );
    process.exitCode = 2;
  } else {
    try {
      process.stdout.write(
        `${JSON.stringify(prepareRestoreRehearsal({ backupDir, mediaInventoryPath }), null, 2)}\n`
      );
    } catch (error) {
      console.error(
        error instanceof Error
          ? error.message
          : "restore_rehearsal_prepare_failed"
      );
      process.exitCode = 1;
    }
  }
}
