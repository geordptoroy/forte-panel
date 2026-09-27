/**
 * Reversible product-scope flag. Keep this enabled while the core is delivered
 * one page/flow at a time; change it only after the next core is reviewed.
 * Hiding routes is a product freeze, not authorization: backend RBAC remains
 * responsible for protecting every procedure.
 */
export const CORE_ONLY_MODE = true;
export const CORE_ROUTE = "/whatsapp-connection";
