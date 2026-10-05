import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { describe, expect, it } from "vitest";
import { verifyRestoreRehearsal } from "./verify-restore-rehearsal";

function sha(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

describe("restore rehearsal verifier", () => {
  it("validates database, Baileys session and media inventory without mutating", () => {
    const root = mkdtempSync(join(tmpdir(), "forte-rehearsal-"));
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
    writeFileSync(join(backup, "postgres.dump"), "synthetic dump\n");
    execFileSync("tar", [
      "-czf",
      join(backup, "sessions.tar.gz"),
      "-C",
      root,
      "bin",
    ]);
    writeFileSync(
      join(backup, "media.json"),
      JSON.stringify([
        {
          workspaceId: 12,
          key: "workspaces/12/whatsapp/a.png",
          sha256: "a".repeat(64),
        },
      ])
    );
    writeFileSync(
      join(backup, "manifest-test.txt"),
      [
        "created_at=20260930T000000Z",
        "postgres_file=postgres.dump",
        `postgres_sha256=${sha(join(backup, "postgres.dump"))}`,
        "session_file=sessions.tar.gz",
        `session_sha256=${sha(join(backup, "sessions.tar.gz"))}`,
        "media_inventory_file=media.json",
        `media_inventory_sha256=${sha(join(backup, "media.json"))}`,
        "",
      ].join("\n")
    );

    const previous = process.env.PATH;
    process.env.PATH = `${bin}${delimiter}${previous ?? ""}`;
    try {
      expect(verifyRestoreRehearsal(backup)).toMatchObject({
        manifest: "manifest-test.txt",
        mediaObjects: 1,
      });
    } finally {
      process.env.PATH = previous;
    }
  });

  it("fails when the media inventory is absent from the manifest", () => {
    const root = mkdtempSync(join(tmpdir(), "forte-rehearsal-missing-media-"));
    mkdirSync(join(root, "backup"));
    writeFileSync(
      join(root, "backup", "manifest-test.txt"),
      "postgres_file=db.dump\n"
    );
    expect(() => verifyRestoreRehearsal(join(root, "backup"))).toThrow(
      "manifest_missing_hash"
    );
  });
});
