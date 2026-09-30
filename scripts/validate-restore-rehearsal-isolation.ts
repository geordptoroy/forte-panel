import { readFileSync } from "node:fs";

export type RehearsalIsolationInput = {
  coreOnlyMode: boolean;
  trafficBlocked: boolean;
  outboundEnabled: boolean;
  productionHosts: string[];
  endpoints: string[];
  activeSessionDir: string;
  restoreSessionDir: string;
  rollbackReady: boolean;
  readiness: "passed" | "failed" | "unknown";
};

export type RehearsalIsolationResult = {
  decision: "approved" | "inconclusive" | "blocked";
  checks: {
    coreOnlyMode: boolean;
    trafficBlocked: boolean;
    outboundDisabled: boolean;
    endpointsNonProduction: boolean;
    sessionTargetSeparated: boolean;
    rollbackReady: boolean;
    readinessPassed: boolean;
  };
  reasons: string[];
};

function normalizedHost(value: string) {
  return value.trim().toLowerCase().replace(/:\d+$/, "");
}

export function validateRestoreRehearsalIsolation(
  input: RehearsalIsolationInput
): RehearsalIsolationResult {
  const reasons: string[] = [];
  const productionHosts = new Set(
    input.productionHosts.map(normalizedHost).filter(Boolean)
  );
  let endpointsNonProduction = true;
  for (const endpoint of input.endpoints) {
    try {
      const url = new URL(endpoint);
      if (
        !/^https?:$/.test(url.protocol) ||
        productionHosts.has(normalizedHost(url.host))
      ) {
        endpointsNonProduction = false;
      }
    } catch {
      endpointsNonProduction = false;
    }
  }
  const checks = {
    coreOnlyMode: input.coreOnlyMode,
    trafficBlocked: input.trafficBlocked,
    outboundDisabled: !input.outboundEnabled,
    endpointsNonProduction,
    sessionTargetSeparated:
      Boolean(input.activeSessionDir && input.restoreSessionDir) &&
      input.activeSessionDir !== input.restoreSessionDir,
    rollbackReady: input.rollbackReady,
    readinessPassed: input.readiness === "passed",
  };
  if (!checks.coreOnlyMode) reasons.push("core_only_mode_disabled");
  if (!checks.trafficBlocked) reasons.push("traffic_not_blocked");
  if (!checks.outboundDisabled) reasons.push("outbound_enabled");
  if (!checks.endpointsNonProduction)
    reasons.push("production_endpoint_detected");
  if (!checks.sessionTargetSeparated)
    reasons.push("session_target_not_separated");
  if (!checks.rollbackReady) reasons.push("rollback_not_ready");
  if (input.readiness === "failed") reasons.push("readiness_failed");
  if (input.readiness === "unknown") reasons.push("readiness_unknown");
  const blocked = reasons.some(
    reason =>
      reason.endsWith("disabled") ||
      reason.includes("not_blocked") ||
      reason.includes("enabled") ||
      reason.includes("production") ||
      reason.includes("not_separated") ||
      reason.includes("rollback_not_ready") ||
      reason.includes("failed")
  );
  return {
    decision: blocked
      ? "blocked"
      : reasons.length
        ? "inconclusive"
        : "approved",
    checks,
    reasons,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error(
      "Usage: pnpm check:restore-rehearsal-isolation EVIDENCE.json"
    );
    process.exitCode = 2;
  } else {
    try {
      const result = validateRestoreRehearsalIsolation(
        JSON.parse(readFileSync(inputPath, "utf8")) as RehearsalIsolationInput
      );
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      if (result.decision !== "approved") process.exitCode = 1;
    } catch (error) {
      console.error(
        error instanceof Error
          ? error.message
          : "restore_isolation_check_failed"
      );
      process.exitCode = 1;
    }
  }
}
