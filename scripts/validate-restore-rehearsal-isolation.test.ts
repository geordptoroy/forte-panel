import { describe, expect, it } from "vitest";
import {
  validateRestoreRehearsalIsolation,
  type RehearsalIsolationInput,
} from "./validate-restore-rehearsal-isolation";

const safeInput: RehearsalIsolationInput = {
  coreOnlyMode: true,
  trafficBlocked: true,
  outboundEnabled: false,
  productionHosts: ["app.forte.example"],
  endpoints: [
    "http://panel.restore.local:3000",
    "http://gateway.restore.local:3010",
  ],
  activeSessionDir: "/app/sessions-active",
  restoreSessionDir: "/restore-data/rr-01/sessions",
  rollbackReady: true,
  readiness: "passed",
};

describe("restore rehearsal isolation gate", () => {
  it("approves isolated core-only rehearsal", () => {
    expect(validateRestoreRehearsalIsolation(safeInput)).toMatchObject({
      decision: "approved",
    });
  });

  it("blocks production endpoint, outbound and session reuse", () => {
    const result = validateRestoreRehearsalIsolation({
      ...safeInput,
      outboundEnabled: true,
      endpoints: ["https://app.forte.example/api"],
      restoreSessionDir: "/app/sessions-active",
    });
    expect(result.decision).toBe("blocked");
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        "outbound_enabled",
        "production_endpoint_detected",
        "session_target_not_separated",
      ])
    );
  });

  it("keeps unknown readiness inconclusive when isolation is otherwise safe", () => {
    const result = validateRestoreRehearsalIsolation({
      ...safeInput,
      readiness: "unknown",
    });
    expect(result.decision).toBe("inconclusive");
    expect(result.reasons).toContain("readiness_unknown");
  });
});
