import { describe, expect, it } from "vitest";
import { evaluateControlledRelease, getControlledReleasePolicy, type ControlledReleaseEvidence } from "./controlled-release";

const passedEvidence: ControlledReleaseEvidence = {
  coreOnlyMode: false,
  readiness: "passed",
  postgresIntegration: "passed",
  tenantIsolation: "passed",
  backupRestore: "passed",
  whatsappE2E: "passed",
  observability: "passed",
  legalReview: "passed",
  saasBilling: "passed",
};

describe("controlled public release gate", () => {
  it("blocks public signup while core-only or any critical evidence is incomplete", () => {
    const result = evaluateControlledRelease({ ...passedEvidence, coreOnlyMode: true, whatsappE2E: "unknown" });
    expect(result).toMatchObject({ state: "blocked", publicSignupEnabled: false });
    expect(result.failedGates).toEqual(expect.arrayContaining(["CORE_ONLY_MODE ainda ativo", "E2E WhatsApp com número controlado: unknown"]));
  });

  it("blocks missing billing, legal and restore evidence instead of guessing readiness", () => {
    const result = evaluateControlledRelease({ ...passedEvidence, backupRestore: "not_configured", legalReview: "unknown", saasBilling: "not_configured" });
    expect(result.state).toBe("blocked");
    expect(result.failedGates).toEqual(expect.arrayContaining(["backup e restore verificados: not_configured", "revisão legal, privacidade e termos: unknown", "billing SaaS configurado: not_configured"]));
  });

  it("allows controlled release only when every explicit gate passes", () => {
    expect(evaluateControlledRelease(passedEvidence)).toMatchObject({ state: "ready_for_controlled_release", publicSignupEnabled: true, failedGates: [] });
  });

  it("publishes a fail-closed policy with rollback semantics", () => {
    expect(getControlledReleasePolicy()).toMatchObject({ mode: "fail_closed", publicSignupDefault: false, requiresExplicitEvidence: true, controlledRelease: "staged_only_until_all_gates_pass", rollback: "disable_public_entrypoints_and_preserve_existing_workspaces" });
  });
});
