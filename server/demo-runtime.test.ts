import { describe, expect, it } from "vitest";
import { isDemoRuntimeAllowed } from "./db";

describe("demo runtime guard", () => {
  it("never allows demo seeding in production, even with explicit demo flags", () => {
    expect(
      isDemoRuntimeAllowed({
        NODE_ENV: "production",
        DEMO_MODE: "true",
        DEMO_ENVIRONMENT: "qa",
      })
    ).toBe(false);
  });

  it("requires the explicit demo flag outside production", () => {
    expect(
      isDemoRuntimeAllowed({ NODE_ENV: "development", DEMO_MODE: "false" })
    ).toBe(false);
  });
});
