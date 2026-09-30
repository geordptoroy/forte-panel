import { describe, expect, it } from "vitest";
import {
  CORE_ROUTE,
  CORE_USAGE_ROUTE,
  PLATFORM_ADMIN_ROUTE,
  isCoreAllowedRoute,
} from "./core-mode";

describe("core-only routes", () => {
  it("allows the onboarding-to-WhatsApp core journey", () => {
    expect(isCoreAllowedRoute(CORE_ROUTE)).toBe(true);
    expect(isCoreAllowedRoute("/onboarding")).toBe(true);
    expect(isCoreAllowedRoute("/whatsapp-connection")).toBe(true);
    expect(isCoreAllowedRoute("/inbox")).toBe(true);
    expect(isCoreAllowedRoute(CORE_USAGE_ROUTE)).toBe(false);
  });

  it("allows the operational sidebar while keeping billing plans and internal IA frozen", () => {
    expect(isCoreAllowedRoute("/dashboard")).toBe(true);
    expect(isCoreAllowedRoute("/billing")).toBe(true);
    expect(isCoreAllowedRoute("/agenda")).toBe(true);
    expect(isCoreAllowedRoute("/contacts")).toBe(true);
    expect(isCoreAllowedRoute("/integrations")).toBe(true);
    expect(isCoreAllowedRoute("/team")).toBe(true);
    expect(isCoreAllowedRoute("/services")).toBe(true);
    expect(isCoreAllowedRoute("/professionals")).toBe(true);
    expect(isCoreAllowedRoute("/settings")).toBe(true);
    expect(isCoreAllowedRoute(CORE_USAGE_ROUTE)).toBe(false);
    expect(isCoreAllowedRoute("/ai-config")).toBe(false);
  });

  it("keeps the platform admin console available during the core freeze", () => {
    expect(isCoreAllowedRoute(PLATFORM_ADMIN_ROUTE)).toBe(true);
    expect(isCoreAllowedRoute("/platform-admin/support")).toBe(true);
    expect(isCoreAllowedRoute("/platform-admin/workspaces/1")).toBe(true);
  });
});
