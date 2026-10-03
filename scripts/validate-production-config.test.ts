import { describe, expect, it } from "vitest";
import { validateProductionConfig } from "./validate-production-config";

const valid = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://db.internal/forte",
  JWT_SECRET: "j".repeat(40),
  FORTE_SECURITY_FAIL_CLOSED: "true",
  DEMO_MODE: "false",
  WORKSPACE_BOOTSTRAP_ENABLED: "false",
  BAILEYS_BASE_URL: "http://forte-whatsapp:3010",
  BAILEYS_API_KEY: "a".repeat(40),
  BAILEYS_WEBHOOK_SECRET: "w".repeat(40),
  WHATSAPP_SESSION_ENCRYPTION_KEY: "e".repeat(64),
} as NodeJS.ProcessEnv;

describe("production configuration gate", () => {
  it("accepts the required fail-closed configuration", () => {
    expect(validateProductionConfig(valid)).toEqual({ ok: true, errors: [] });
  });

  it("rejects placeholders, demo mode and missing database", () => {
    const result = validateProductionConfig({
      ...valid,
      DATABASE_URL: "",
      JWT_SECRET: "CHANGE_ME_JWT_SECRET",
      FORTE_SECURITY_FAIL_CLOSED: "false",
      DEMO_MODE: "true",
      BAILEYS_API_KEY: "CHANGE_ME_BAILEYS_API_KEY",
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        "DATABASE_URL must be a PostgreSQL URL",
        "FORTE_SECURITY_FAIL_CLOSED=true is required explicitly",
        "DEMO_MODE must be false",
      ])
    );
    expect(result.errors.some(error => error.startsWith("JWT_SECRET"))).toBe(
      true
    );
    expect(
      result.errors.some(error => error.startsWith("BAILEYS_API_KEY"))
    ).toBe(true);
  });

  it("requires an authenticated HTTPS sink when external observability is enabled", () => {
    const result = validateProductionConfig({
      ...valid,
      FORTE_OBSERVABILITY_WEBHOOK_URL: "http://observer.internal/events",
      FORTE_OBSERVABILITY_WEBHOOK_TOKEN: "short",
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining(["FORTE_OBSERVABILITY_WEBHOOK_URL must use HTTPS"])
    );
    expect(
      result.errors.some(error =>
        error.startsWith("FORTE_OBSERVABILITY_WEBHOOK_TOKEN")
      )
    ).toBe(true);
  });
});
