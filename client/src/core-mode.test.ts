import { describe, expect, it } from "vitest";
import { CORE_ROUTE, CORE_USAGE_ROUTE, isCoreAllowedRoute } from "./core-mode";

describe("core-only routes", () => {
  it("allows the WhatsApp core and plan/usage pages", () => {
    expect(isCoreAllowedRoute(CORE_ROUTE)).toBe(true);
    expect(isCoreAllowedRoute(CORE_USAGE_ROUTE)).toBe(true);
  });

  it("keeps other product pages frozen", () => {
    expect(isCoreAllowedRoute("/dashboard")).toBe(false);
    expect(isCoreAllowedRoute("/billing")).toBe(false);
  });
});
