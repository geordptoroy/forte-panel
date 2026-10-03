import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const script = join(process.cwd(), "scripts", "backup-restore.sh");

function run(args: string[], env: NodeJS.ProcessEnv = {}) {
  return execFileSync("bash", [script, ...args], {
    env: { ...process.env, ...env },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

describe("backup/restore contract", () => {
  it("documents the destructive restore confirmation and private targets", () => {
    const source = readFileSync(script, "utf8");
    expect(source).toMatch(/CONFIRM_RESTORE:-\}.*== "YES"/);
    expect(source).toContain('RESTORE_SESSION_DIR');
    expect(source).toContain('pg_restore "$DATABASE_URL" --clean --if-exists');
    expect(source).toContain('chmod 600');
    expect(source).toContain('pg_restore --list');
    expect(source).toContain('verify "$dir" >/dev/null');
    expect(source).toContain('RESTORE_SESSION_DIR não pode ser a sessão ativa');
    expect(source).toContain('tar -czf "$session_archive" -T /dev/null');
    expect(source).toContain("session_key_sha256");
  });

  it("verifies a manifest and rejects a tampered PostgreSQL artifact", () => {
    const root = mkdtempSync(join(tmpdir(), "forte-backup-contract-"));
    const bin = join(root, "bin");
    const backup = join(root, "backup");
    mkdirSync(bin);
    mkdirSync(backup);
    writeFileSync(join(bin, "pg_restore"), "#!/usr/bin/env bash\nexit 0\n");
    chmodSync(join(bin, "pg_restore"), 0o755);
    writeFileSync(join(backup, "postgres-test.dump"), "safe dump\n");
    execFileSync("tar", ["-czf", join(backup, "whatsapp-sessions-test.tar.gz"), "-C", root, "bin"]);
    const sha = (file: string) => execFileSync("sha256sum", [file], { encoding: "utf8" }).split(/\s+/)[0];
    writeFileSync(join(backup, "manifest-test.txt"), [
      "created_at=20260930T000000Z",
      "postgres_file=postgres-test.dump",
      `postgres_sha256=${sha(join(backup, "postgres-test.dump"))}`,
      "session_file=whatsapp-sessions-test.tar.gz",
      `session_sha256=${sha(join(backup, "whatsapp-sessions-test.tar.gz"))}`,
      `session_key_sha256=${"e".repeat(64)}`,
      "",
    ].join("\n"));
    chmodSync(join(backup, "manifest-test.txt"), 0o600);

    expect(run(["verify", backup], { PATH: `${bin}:${process.env.PATH ?? ""}` })).toContain("Backup verificável");
    writeFileSync(join(backup, "postgres-test.dump"), "tampered dump\n");
    expect(() => run(["verify", backup], { PATH: `${bin}:${process.env.PATH ?? ""}` })).toThrow(/Hash do dump PostgreSQL diverge/);
  });

  it("refuses restore before any database or session command is reached", () => {
    const root = mkdtempSync(join(tmpdir(), "forte-restore-contract-"));
    const backup = join(root, "backup");
    mkdirSync(backup);
    expect(() => run(["restore", backup], { DATABASE_URL: "postgresql://not-used" })).toThrow(/CONFIRM_RESTORE=YES/);
  });
});
