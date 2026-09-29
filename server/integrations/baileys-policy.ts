import type { WhatsappProvider } from "./contracts";

/**
 * Baileys is the only WhatsApp provider supported by the current product.
 * Legacy provider values may remain in historical rows during migration, but
 * they must never be selected for a new operational action.
 */
export const OPERATIONAL_WHATSAPP_PROVIDER = "baileys" as const;
export type OperationalWhatsappProvider = typeof OPERATIONAL_WHATSAPP_PROVIDER;

export function isOperationalWhatsappProvider(
  provider: string | null | undefined
): provider is OperationalWhatsappProvider {
  return provider === OPERATIONAL_WHATSAPP_PROVIDER;
}

export function assertOperationalWhatsappProvider(
  provider: string | null | undefined
): OperationalWhatsappProvider {
  if (!isOperationalWhatsappProvider(provider)) {
    throw new Error(
      "O único provedor de WhatsApp disponível neste produto é o gateway Baileys"
    );
  }
  return OPERATIONAL_WHATSAPP_PROVIDER;
}

export function assertStoredWhatsappProvider(
  provider: WhatsappProvider
): OperationalWhatsappProvider {
  return assertOperationalWhatsappProvider(provider);
}
