export type HistoricalBaileysWebhookInput = {
  historySync: boolean;
  isGroup: boolean;
  instanceId?: string;
  instanceOwner: boolean;
  groupJid?: string;
  phone: string;
  content: string;
};

/**
 * Histórico incompleto deve ser reconhecido e encerrado, não ficar em retry
 * infinito. A ownership da instância já deve ter sido resolvida pelo handler.
 */
export function historicalBaileysIgnoreReason(
  input: HistoricalBaileysWebhookInput
): "historical_payload_not_importable" | undefined {
  if (!input.historySync) return undefined;
  if (!input.content.trim()) return "historical_payload_not_importable";
  if (input.isGroup) {
    if (
      !input.instanceId ||
      !input.instanceOwner ||
      !input.groupJid?.endsWith("@g.us")
    )
      return "historical_payload_not_importable";
    return undefined;
  }
  if (input.phone.length < 8) return "historical_payload_not_importable";
  return undefined;
}
