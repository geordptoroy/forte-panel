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
 * O primeiro sync de uma sessão pode conter milhares de mensagens antigas e
 * placeholders sem mídia física. O MVP aceita o evento, mas não o importa;
 * mensagens novas seguem o fluxo normal depois que a sessão fica online.
 */
export function historicalBaileysIgnoreReason(
  input: HistoricalBaileysWebhookInput
): "historical_payload_not_importable" | undefined {
  if (input.historySync) return "historical_payload_not_importable";
  return undefined;
}
