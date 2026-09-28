/**
 * Reversible product-scope flag. Keep this enabled while the core is delivered
 * one page/flow at a time; keep the operational page and its plan/usage view
 * available while all unrelated product routes remain frozen.
 * Hiding routes is a product freeze, not authorization: backend RBAC remains
 * responsible for protecting every procedure.
 */
export const CORE_ONLY_MODE = true;
export const CORE_ROUTE = "/whatsapp-connection";
export const CORE_USAGE_ROUTE = "/plans-usage";

export function isCoreAllowedRoute(pathname: string) {
  return pathname === CORE_ROUTE || pathname === CORE_USAGE_ROUTE;
}
