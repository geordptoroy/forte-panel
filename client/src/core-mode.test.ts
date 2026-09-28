import { describe, expect, it } from "vitest";
import { CORE_ROUTE, CORE_USAGE_ROUTE, isCoreAllowedRoute } from "./core-mode";

describe("core-only routes", () => {
  it("allows only the WhatsApp connection page", () => {
    expect(isCoreAllowedRoute(CORE_ROUTE)).toBe(true);
    expect(isCoreAllowedRoute(CORE_USAGE_ROUTE)).toBe(false);
  });

  it("keeps other product pages frozen", () => {
    expect(isCoreAllowedRoute("/dashboard")).toBe(false);
    expect(isCoreAllowedRoute("/billing")).toBe(false);
  });
});
