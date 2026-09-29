import { z } from "zod";

export const buttonDefinitionSchema = z.object({
  buttonId: z.string().trim().min(1).max(200),
  buttonText: z.object({ displayText: z.string().trim().min(1).max(80) }).strict(),
}).strict();

export const interactiveMetadataSchema = z.object({
  footer: z.string().trim().max(200).optional(),
  buttons: z.array(buttonDefinitionSchema).min(1).max(3).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

export const interactiveMessageTypeSchema = z.enum(["button", "list", "poll"]);
export type InteractiveMessageType = z.infer<typeof interactiveMessageTypeSchema>;

export function validateInteractiveMessage(input: {
  messageType: InteractiveMessageType;
  content: string;
  metadata?: Record<string, unknown>;
}) {
  const metadata = interactiveMetadataSchema.parse(input.metadata ?? {});
  if (input.messageType === "button" && (!metadata.buttons || metadata.buttons.length < 1))
    throw new Error("Mensagem de botões exige de 1 a 3 opções");
  if (["list", "poll"].includes(input.messageType) && !metadata.payload)
    throw new Error(`Mensagem ${input.messageType} exige payload do gateway`);
  return metadata;
}

/** Baileys/Web não possui um contrato universal de carrossel; não aceitar payload arbitrário. */
export const unsupportedInteractiveKinds = ["carousel"] as const;
