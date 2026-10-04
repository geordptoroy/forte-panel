import {
  prepareWAMessageMedia,
  type AnyMessageContent,
  type WASocket,
} from "baileys";

type InteractiveMetadata = Record<string, unknown>;

type ButtonDefinition = {
  buttonId?: unknown;
  buttonText?: { displayText?: unknown };
  name?: unknown;
  buttonParamsJson?: unknown;
  copyCode?: unknown;
};

type ListSection = Record<string, unknown>;

type CarouselCard = Record<string, unknown>;

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function listRows(section: ListSection) {
  const rows = Array.isArray(section.rows) ? section.rows : [];
  return rows.map(row => {
    const item =
      row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    return {
      rowId: text(item.id ?? item.rowId),
      title: text(item.title),
      description: text(item.description) || undefined,
    };
  });
}

export function buildLegacyListPayload(
  content: string,
  metadata: InteractiveMetadata
): AnyMessageContent {
  const sections = Array.isArray(metadata.sections)
    ? (metadata.sections as ListSection[])
    : [];
  return {
    listMessage: {
      title: text(metadata.title, "Opções"),
      description: content,
      footerText: text(metadata.footer) || undefined,
      buttonText: text(metadata.buttonText, "Ver opções"),
      sections: sections.map(section => ({
        title: text(section.title),
        rows: listRows(section),
      })),
    },
  } as unknown as AnyMessageContent;
}

function cardButton(button: Record<string, unknown>) {
  const label = text(
    button.displayText ??
      button.title ??
      (button.buttonText as Record<string, unknown> | undefined)?.displayText
  );
  const id = text(button.id ?? button.buttonId);
  const url = text(button.url);
  return {
    name: url ? "cta_url" : "quick_reply",
    buttonParamsJson: JSON.stringify(
      url ? { display_text: label, url } : { display_text: label, id }
    ),
  };
}

function nativeFlowButton(button: ButtonDefinition) {
  const displayText = text(button.buttonText?.displayText);
  if (
    typeof button.name === "string" &&
    typeof button.buttonParamsJson === "string"
  ) {
    return {
      name: button.name,
      buttonParamsJson: button.buttonParamsJson,
    };
  }
  if (typeof button.copyCode === "string") {
    return {
      name: "cta_copy",
      buttonParamsJson: JSON.stringify({
        display_text: displayText,
        copy_code: button.copyCode,
      }),
    };
  }
  return {
    name: "quick_reply",
    buttonParamsJson: JSON.stringify({
      display_text: displayText,
      id: text(button.buttonId),
    }),
  };
}

export async function buildCarouselPayload(
  socket: Pick<WASocket, "waUploadToServer">,
  content: string,
  metadata: InteractiveMetadata
): Promise<AnyMessageContent> {
  const cards = Array.isArray(metadata.cards)
    ? (metadata.cards as CarouselCard[])
    : [];
  if (cards.length < 2 || cards.length > 10)
    throw new Error("Carrossel exige entre 2 e 10 cartões");

  const preparedCards = await Promise.all(
    cards.map(async card => {
      const image = text(card.image ?? card.imageUrl);
      const video = text(card.video ?? card.videoUrl);
      if (!image && !video)
        throw new Error("Cada cartão do carrossel exige imagem ou vídeo");
      const media = await prepareWAMessageMedia(
        video ? { video: { url: video } } : { image: { url: image } },
        { upload: socket.waUploadToServer }
      );
      const buttons = Array.isArray(card.buttons)
        ? card.buttons
            .filter((button): button is Record<string, unknown> =>
              Boolean(button && typeof button === "object")
            )
            .map(cardButton)
        : [];
      return {
        header: {
          hasMediaAttachment: true,
          ...(media.imageMessage ? { imageMessage: media.imageMessage } : {}),
          ...(media.videoMessage ? { videoMessage: media.videoMessage } : {}),
        },
        body: { text: text(card.body ?? card.text) },
        footer: text(card.footer) ? { text: text(card.footer) } : undefined,
        nativeFlowMessage: {
          messageVersion: 1,
          buttons,
        },
      };
    })
  );

  return {
    interactiveMessage: {
      body: { text: content },
      carouselMessage: {
        messageVersion: 1,
        carouselCardType: 1,
        cards: preparedCards,
      },
    },
  } as unknown as AnyMessageContent;
}

export function buildNativeInteractivePayload(
  messageType: "button" | "list",
  content: string,
  metadata: InteractiveMetadata
): AnyMessageContent {
  const footer = text(metadata.footer);
  const bodyText = content.trim() === "[button]" ? "Escolha uma opção" : content;
  const body: Record<string, unknown> = { text: bodyText };
  const interactive: Record<string, unknown> = { body };
  if (footer) interactive.footer = { text: footer };
  if (text(metadata.title))
    interactive.header = {
      title: text(metadata.title),
      hasMediaAttachment: false,
    };

  if (messageType === "button") {
    const buttons = Array.isArray(metadata.buttons)
      ? (metadata.buttons as ButtonDefinition[])
      : [];
    interactive.nativeFlowMessage = {
      messageVersion: 1,
      buttons: buttons.map(nativeFlowButton),
    };
  } else {
    const sections = Array.isArray(metadata.sections)
      ? (metadata.sections as ListSection[])
      : [];
    interactive.nativeFlowMessage = {
      messageVersion: 1,
      buttons: [
        {
          name: "single_select",
          buttonParamsJson: JSON.stringify({
            title: text(metadata.buttonText, "Ver opções"),
            sections,
          }),
        },
      ],
    };
  }

  // A implementação de referência envia o InteractiveMessage diretamente
  // para relayMessage. O wrapper viewOnceMessage/contextInfo fazia o painel
  // marcar como enviado, mas alguns clientes não renderizavam a mensagem.
  return { interactiveMessage: interactive } as unknown as AnyMessageContent;
}
