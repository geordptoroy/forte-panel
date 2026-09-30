import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runRestoreRehearsalPreflight } from "./run-restore-rehearsal-preflight";

function sha(path: string) {
  return execFileSync("sha256sum", [path], { encoding: "utf8" }).split(
    /\s+/
  )[0];
}

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "forte-preflight-"));
  const bin = join(root, "bin");
  const backupDir = join(root, "backup");
  mkdirSync(bin);
  mkdirSync(backupDir);
  writeFileSync(join(bin, "pg_restore"), "#!/usr/bin/env bash\nexit 0\n");
  chmodSync(join(bin, "pg_restore"), 0o755);
  writeFileSync(join(backupDir, "postgres.dump"), "synthetic dump\n");
  execFileSync("tar", [
    "-czf",
    join(backupDir, "sessions.tar.gz"),
    "-C",
    root,
    "bin",
  ]);
  writeFileSync(
    join(backupDir, "media.json"),
    JSON.stringify([
      {
        workspaceId: 12,
        key: "workspaces/12/whatsapp/a.png",
        sha256: "a".repeat(64),
      },
    ])
  );
  writeFileSync(
    join(backupDir, "manifest-test.txt"),
    [
      "created_at=20260930T000000Z",
      "postgres_file=postgres.dump",
      `postgres_sha256=${sha(join(backupDir, "postgres.dump"))}`,
      "session_file=sessions.tar.gz",
      `session_sha256=${sha(join(backupDir, "sessions.tar.gz"))}`,
      "media_inventory_file=media.json",
      `media_inventory_sha256=${sha(join(backupDir, "media.json"))}`,
      "",
    ].join("\n")
  );
  const evidencePath = join(root, "evidence.json");
  const evidence = {
    rehearsalId: "rr-01",
    backupCreatedAt: "2026-09-29T23:00:00.000Z",
    startedAt: "2026-09-30T00:00:00.000Z",
    readyAt: "2026-09-30T00:20:00.000Z",
    targetRpoMs: 7_200_000,
    targetRtoMs: 3_600_000,
    imageDigests: [`sha256:${"a".repeat(64)}`],
    noProductionTraffic: true,
    rollbackDemonstrated: true,
    components: Object.fromEntries(
      ["postgres", "media", "redis", "baileys_session", "keys", "config"].map(
        key => [key, { status: "pass", evidence: "ok" }]
      )
    ),
    coreOnlyMode: true,
    trafficBlocked: true,
    outboundEnabled: false,
    productionHosts: ["app.forte.example"],
    endpoints: ["http://panel.restore.local:3000"],
    activeSessionDir: "/app/sessions-active",
    restoreSessionDir: "/restore/rr-01/sessions",
    rollbackReady: true,
    readiness: "passed",
  };
  writeFileSync(evidencePath, JSON.stringify(evidence));
  return { root, bin, backupDir, evidencePath };
}

describe("restore rehearsal preflight", () => {
  it("runs package verification before isolation and produces one approved result", () => {
    const fixture = createFixture();
    const reportPath = join(fixture.root, "preflight.json");
    const previousPath = process.env.PATH;
    process.env.PATH = `${fixture.bin}:${previousPath ?? ""}`;
    try {
      const result = runRestoreRehearsalPreflight({
        backupDir: fixture.backupDir,
        evidencePath: fixture.evidencePath,
        reportPath,
        now: new Date("2026-09-30T01:00:00.000Z"),
      });
      expect(result.decision).toBe("approved");
      expect(result.package.mediaObjects).toBe(1);
      expect(result.isolation.decision).toBe("approved");
      expect(result.report.preflight).toEqual({
        packageVerified: true,
        isolationDecision: "approved",
      });
      expect(JSON.parse(readFileSync(reportPath, "utf8")).decision).toBe(
        "approved"
      );
    } finally {
      process.env.PATH = previousPath;
    }
  });

  it("blocks a production endpoint even when the package is valid", () => {
    const fixture = createFixture();
    const evidence = JSON.parse(readFileSync(fixture.evidencePath, "utf8"));
    evidence.endpoints = ["https://app.forte.example/api"];
    writeFileSync(fixture.evidencePath, JSON.stringify(evidence));
    const previousPath = process.env.PATH;
    process.env.PATH = `${fixture.bin}:${previousPath ?? ""}`;
    try {
      const result = runRestoreRehearsalPreflight({
        backupDir: fixture.backupDir,
        evidencePath: fixture.evidencePath,
      });
      expect(result.decision).toBe("blocked");
      expect(result.report.reasons).toContain(
        "isolation_production_endpoint_detected"
      );
    } finally {
      process.env.PATH = previousPath;
    }
  });
});
