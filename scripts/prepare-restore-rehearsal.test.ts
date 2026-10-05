import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { describe, expect, it } from "vitest";
import { prepareRestoreRehearsal } from "./prepare-restore-rehearsal";

function sha(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "forte-prepare-rehearsal-"));
  const bin = join(root, "bin");
  const backup = join(root, "backup");
  mkdirSync(bin);
  mkdirSync(backup);
  if (process.platform === "win32") {
    writeFileSync(join(bin, "pg_restore.cmd"), "@echo off\r\nexit /b 0\r\n");
  } else {
    writeFileSync(join(bin, "pg_restore"), "#!/usr/bin/env bash\nexit 0\n");
    chmodSync(join(bin, "pg_restore"), 0o755);
  }
  writeFileSync(join(backup, "postgres.dump"), "dump\n");
  execFileSync("tar", [
    "-czf",
    join(backup, "sessions.tar.gz"),
    "-C",
    root,
    "bin",
  ]);
  writeFileSync(
    join(backup, "manifest-test.txt"),
    [
      "created_at=20260930T000000Z",
      "postgres_file=postgres.dump",
      `postgres_sha256=${sha(join(backup, "postgres.dump"))}`,
      "session_file=sessions.tar.gz",
      `session_sha256=${sha(join(backup, "sessions.tar.gz"))}`,
      "",
    ].join("\n")
  );
  const input = join(root, "inventory-input.json");
  writeFileSync(
    input,
    JSON.stringify([
      {
        workspaceId: 12,
        key: "workspaces/12/whatsapp/a.png",
        sha256: "a".repeat(64),
      },
    ])
  );
  return { root, bin, backup, input };
}

describe("prepare restore rehearsal", () => {
  it("attaches a validated private media inventory and re-verifies the package", () => {
    const f = fixture();
    const previousPath = process.env.PATH;
    process.env.PATH = `${f.bin}${delimiter}${previousPath ?? ""}`;
    try {
      const result = prepareRestoreRehearsal({
        backupDir: f.backup,
        mediaInventoryPath: f.input,
      });
      expect(result.mediaObjects).toBe(1);
      expect(result.verified.mediaInventoryFile).toBe("media.json");
      expect(
        readFileSync(join(f.backup, "manifest-test.txt"), "utf8")
      ).toContain("media_inventory_file=media.json");
    } finally {
      process.env.PATH = previousPath;
    }
  });

  it("rejects an inventory entry without a valid hash before approval", () => {
    const f = fixture();
    writeFileSync(
      f.input,
      JSON.stringify([
        {
          workspaceId: 12,
          key: "workspaces/12/whatsapp/a.png",
          sha256: "missing",
        },
      ])
    );
    expect(() =>
      prepareRestoreRehearsal({
        backupDir: f.backup,
        mediaInventoryPath: f.input,
      })
    ).toThrow(/media_inventory_hash_invalid/);
  });
});
