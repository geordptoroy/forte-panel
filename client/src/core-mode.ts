import { isRouteEnabledInCore } from "./release-catalog";

/**
 * Reversible product-scope flag. The commercial core and its operational
 * surfaces are now open; keep this flag available for a future emergency
 * containment without changing authorization rules.
 * Hiding routes is a product freeze, not authorization: backend RBAC remains
 * responsible for protecting every procedure.
 */
export const CORE_ONLY_MODE = false;
export const CORE_ROUTE = "/whatsapp-connection";
export const CORE_USAGE_ROUTE = "/plans-usage";
export const PLATFORM_ADMIN_ROUTE = "/platform-admin";

export function isCoreAllowedRoute(pathname: string) {
  return isRouteEnabledInCore(pathname);
}
