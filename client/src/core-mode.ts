import { isRouteEnabledInCore } from "./release-catalog";

/**
 * Reversible product-scope flag. Keep this enabled while the core is delivered
 * one page/flow at a time; keep only the validated operational pages available
 * while all unrelated product routes remain frozen.
 * Hiding routes is a product freeze, not authorization: backend RBAC remains
 * responsible for protecting every procedure.
 */
export const CORE_ONLY_MODE = true;
export const CORE_ROUTE = "/onboarding";
export const CORE_USAGE_ROUTE = "/plans-usage";
export const PLATFORM_ADMIN_ROUTE = "/platform-admin";

export function isCoreAllowedRoute(pathname: string) {
  return isRouteEnabledInCore(pathname);
}
