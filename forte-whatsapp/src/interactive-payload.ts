import type { AnyMessageContent } from "baileys";

type InteractiveMetadata = Record<string, unknown>;

type ButtonDefinition = {
  buttonId?: unknown;
  buttonText?: { displayText?: unknown };
};

type ListSection = Record<string, unknown>;

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

export function buildNativeInteractivePayload(
  messageType: "button" | "list",
  content: string,
  metadata: InteractiveMetadata
): AnyMessageContent {
  const footer = text(metadata.footer);
  const body: Record<string, unknown> = { text: content };
  const interactive: Record<string, unknown> = { body };
  if (footer) interactive.footer = { text: footer };
  if (text(metadata.title)) interactive.header = { title: text(metadata.title), hasMediaAttachment: false };

  if (messageType === "button") {
    const buttons = Array.isArray(metadata.buttons) ? (metadata.buttons as ButtonDefinition[]) : [];
    interactive.nativeFlowMessage = {
      buttons: buttons.map((button) => ({
        name: "quick_reply",
        buttonParamsJson: JSON.stringify({
          display_text: text(button.buttonText?.displayText),
          id: text(button.buttonId),
        }),
      })),
    };
  } else {
    const sections = Array.isArray(metadata.sections) ? (metadata.sections as ListSection[]) : [];
    interactive.nativeFlowMessage = {
      buttons: [{
        name: "single_select",
        buttonParamsJson: JSON.stringify({
          title: text(metadata.buttonText, "Ver opções"),
          sections,
        }),
      }],
    };
  }

  return { interactiveMessage: interactive } as unknown as AnyMessageContent;
}
