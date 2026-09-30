export const DEFAULT_OPPORTUNITY_STAGE = "Novo contato";

export function shouldUpsertLeadFromInbound(input: {
  isGroup: boolean;
  fromMe: boolean;
  historySync: boolean;
  ignored: boolean;
}) {
  return !input.isGroup && !input.fromMe && !input.historySync && !input.ignored;
}

export function initialOpportunityStage(stage: string | null | undefined) {
  const normalized = stage?.trim().slice(0, 80);
  return normalized || DEFAULT_OPPORTUNITY_STAGE;
}
