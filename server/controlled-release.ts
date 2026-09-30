export type ReleaseEvidenceStatus = "passed" | "failed" | "not_configured" | "unknown";
export type ControlledReleaseEvidence = {
  coreOnlyMode: boolean;
  readiness: ReleaseEvidenceStatus;
  postgresIntegration: ReleaseEvidenceStatus;
  tenantIsolation: ReleaseEvidenceStatus;
  backupRestore: ReleaseEvidenceStatus;
  whatsappE2E: ReleaseEvidenceStatus;
  observability: ReleaseEvidenceStatus;
  legalReview: ReleaseEvidenceStatus;
  saasBilling: ReleaseEvidenceStatus;
};

const requiredEvidence = [
  ["readiness", "readiness PostgreSQL"],
  ["postgresIntegration", "integração PostgreSQL"],
  ["tenantIsolation", "isolamento negativo de tenancy"],
  ["backupRestore", "backup e restore verificados"],
  ["whatsappE2E", "E2E WhatsApp com número controlado"],
  ["observability", "observabilidade e alertas externos"],
  ["legalReview", "revisão legal, privacidade e termos"],
  ["saasBilling", "billing SaaS configurado"],
] as const;

export function evaluateControlledRelease(evidence: ControlledReleaseEvidence) {
  const failedGates: string[] = [];
  if (evidence.coreOnlyMode) failedGates.push("CORE_ONLY_MODE ainda ativo");
  for (const [key, label] of requiredEvidence) {
    if (evidence[key] !== "passed") failedGates.push(`${label}: ${evidence[key]}`);
  }
  return {
    state: failedGates.length === 0 ? "ready_for_controlled_release" as const : "blocked" as const,
    publicSignupEnabled: failedGates.length === 0,
    failedGates,
    evidence,
  };
}

export function getControlledReleasePolicy() {
  return {
    mode: "fail_closed" as const,
    publicSignupDefault: false,
    requiresExplicitEvidence: true,
    requiredEvidence: requiredEvidence.map(([key, label]) => ({ key, label })),
    controlledRelease: "staged_only_until_all_gates_pass",
    rollback: "disable_public_entrypoints_and_preserve_existing_workspaces",
  };
}
