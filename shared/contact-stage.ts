export const CONTACT_STAGE_ORDER = [
  "Novo contato",
  "Triagem",
  "Aguardando foto",
  "Avaliação pendente",
  "Orçamento enviado",
  "Aguardando decisão",
  "Visita solicitada",
  "Agendado",
  "Concluído",
  "Sem retorno",
  "Perdido",
] as const;

export type ContactStage = (typeof CONTACT_STAGE_ORDER)[number];

const CONTACT_STAGE_SET = new Set<string>(CONTACT_STAGE_ORDER);

export function isContactStage(value: string): value is ContactStage {
  return CONTACT_STAGE_SET.has(value);
}

export function contactStageLabel(value: string) {
  return isContactStage(value) ? value : "Estágio não reconhecido";
}
