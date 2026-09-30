import { readFileSync, writeFileSync } from "node:fs";
import {
  buildRestoreRehearsalReport,
  type RestoreEvidenceInput,
  type RestoreRehearsalReport,
} from "./build-restore-rehearsal-report";
import {
  validateRestoreRehearsalIsolation,
  type RehearsalIsolationInput,
  type RehearsalIsolationResult,
} from "./validate-restore-rehearsal-isolation";
import { verifyRestoreRehearsal } from "./verify-restore-rehearsal";

export type RestoreRehearsalPreflightResult = {
  decision: "approved" | "inconclusive" | "blocked";
  package: ReturnType<typeof verifyRestoreRehearsal>;
  isolation: RehearsalIsolationResult;
  report: RestoreRehearsalReport;
};

function mergeDecision(
  reportDecision: RestoreRehearsalReport["decision"],
  isolationDecision: RehearsalIsolationResult["decision"]
): RestoreRehearsalReport["decision"] {
  if (reportDecision === "blocked" || isolationDecision === "blocked")
    return "blocked";
  if (reportDecision === "inconclusive" || isolationDecision === "inconclusive")
    return "inconclusive";
  return "approved";
}

export function runRestoreRehearsalPreflight(input: {
  backupDir: string;
  evidencePath: string;
  reportPath?: string;
  now?: Date;
}): RestoreRehearsalPreflightResult {
  const packageEvidence = verifyRestoreRehearsal(input.backupDir);
  const evidence = JSON.parse(
    readFileSync(input.evidencePath, "utf8").replace(/^\uFEFF/, "")
  ) as RestoreEvidenceInput & RehearsalIsolationInput;
  const isolation = validateRestoreRehearsalIsolation(evidence);
  const baseReport = buildRestoreRehearsalReport(evidence, input.now);
  const isolationReasons = isolation.reasons.map(
    reason => `isolation_${reason}`
  );
  const decision = mergeDecision(baseReport.decision, isolation.decision);
  const report: RestoreRehearsalReport = {
    ...baseReport,
    decision,
    reasons: [...baseReport.reasons, ...isolationReasons],
    preflight: {
      packageVerified: true,
      isolationDecision: isolation.decision,
    },
  };
  const result = { decision, package: packageEvidence, isolation, report };
  if (input.reportPath)
    writeFileSync(input.reportPath, `${JSON.stringify(result, null, 2)}\n`, {
      mode: 0o600,
    });
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [backupDir, evidencePath, reportPath] = process.argv.slice(2);
  if (!backupDir || !evidencePath) {
    console.error(
      "Usage: pnpm preflight:restore-rehearsal BACKUP_DIR EVIDENCE.json [PREFLIGHT.json]"
    );
    process.exitCode = 2;
  } else {
    try {
      const result = runRestoreRehearsalPreflight({
        backupDir,
        evidencePath,
        reportPath,
      });
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      if (result.decision !== "approved") process.exitCode = 1;
    } catch (error) {
      console.error(
        error instanceof Error ? error.message : "restore_preflight_failed"
      );
      process.exitCode = 1;
    }
  }
}
