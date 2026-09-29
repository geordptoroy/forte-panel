import { z } from "zod";

export const buttonDefinitionSchema = z.object({
  buttonId: z.string().trim().min(1).max(200),
  buttonText: z.object({ displayText: z.string().trim().min(1).max(80) }).strict(),
}).strict();

export const interactiveMetadataSchema = z.object({
  title: z.string().trim().max(120).optional(),
  buttonText: z.string().trim().min(1).max(40).optional(),
  footer: z.string().trim().max(200).optional(),
  buttons: z.array(buttonDefinitionSchema).min(1).max(3).optional(),
  sections: z.array(z.record(z.string(), z.unknown())).min(1).max(10).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

export const interactiveMessageTypeSchema = z.enum(["button", "list", "poll", "carousel"]);
export type InteractiveMessageType = z.infer<typeof interactiveMessageTypeSchema>;

export function validateInteractiveMessage(input: {
  messageType: InteractiveMessageType;
  content: string;
  metadata?: Record<string, unknown>;
}) {
  const metadata = interactiveMetadataSchema.parse(input.metadata ?? {});
  if (input.messageType === "button" && (!metadata.buttons || metadata.buttons.length < 1))
    throw new Error("Mensagem de botões exige de 1 a 3 opções");
  if (input.messageType === "list" && !metadata.sections?.length && !metadata.payload)
    throw new Error("Mensagem list exige payload ou seções do gateway");
  if (input.messageType === "poll" && !metadata.payload)
    throw new Error("Mensagem poll exige payload do gateway");
  if (input.messageType === "carousel") {
    const native = metadata.payload?.interactiveMessage;
    if (!native || typeof native !== "object")
      throw new Error("Carousel exige payload interactiveMessage nativo do Baileys");
  }
  return metadata;
}
