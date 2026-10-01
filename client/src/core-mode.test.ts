import { describe, expect, it } from "vitest";
import {
  CORE_ONLY_MODE,
  CORE_ROUTE,
  CORE_USAGE_ROUTE,
  PLATFORM_ADMIN_ROUTE,
  isCoreAllowedRoute,
} from "./core-mode";

describe("core-only routes", () => {
  it("keeps the emergency core route available", () => {
    expect(CORE_ONLY_MODE).toBe(false);
    expect(isCoreAllowedRoute(CORE_ROUTE)).toBe(true);
    expect(isCoreAllowedRoute(CORE_USAGE_ROUTE)).toBe(false);
  });

  it("keeps commercial routes available after the product freeze is lifted", () => {
    expect(isCoreAllowedRoute("/dashboard")).toBe(false);
    expect(isCoreAllowedRoute("/billing")).toBe(false);
  });

  it("keeps the platform admin console available", () => {
    expect(isCoreAllowedRoute(PLATFORM_ADMIN_ROUTE)).toBe(true);
    expect(isCoreAllowedRoute("/platform-admin/support")).toBe(true);
    expect(isCoreAllowedRoute("/platform-admin/workspaces/1")).toBe(true);
  });
});
