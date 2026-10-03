import type { MessageUpsertType } from "baileys";

export type BaileysMessageKind =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "document"
  | "sticker"
  | "location"
  | "contact"
  | "poll"
  | "list"
  | "button"
  | "carousel"
  | "react";

export function shouldForwardLiveUpsert(
  type: MessageUpsertType,
  requestId?: string
): boolean {
  return type === "notify" && !requestId;
}

type AnyRecord = Record<string, any>;

function record(value: unknown): AnyRecord {
  return value && typeof value === "object" ? (value as AnyRecord) : {};
}

/** Baileys nests ordinary messages inside wrappers for ephemeral/view-once content. */
export function unwrapBaileysMessage(value: unknown): AnyRecord {
  let body = record(value);
  for (let depth = 0; depth < 8; depth += 1) {
    const nested =
      body.ephemeralMessage?.message ??
      body.viewOnceMessage?.message ??
      body.viewOnceMessageV2?.message ??
      body.viewOnceMessageV2Extension?.message ??
      body.documentWithCaptionMessage?.message ??
      body.editedMessage?.message;
    if (!nested || typeof nested !== "object") break;
    body = record(nested);
  }
  return body;
}

export function normalizeBaileysMessage(value: unknown): {
  body: AnyRecord;
  messageType: BaileysMessageKind;
  content: string;
  echoContent: string;
  isPlaceholder: boolean;
} {
  const body = unwrapBaileysMessage(value);
  const image = record(body.imageMessage);
  const audio = record(body.audioMessage);
  const video = record(body.videoMessage);
  const document = record(body.documentMessage);
  const sticker = body.stickerMessage;
  const location = record(body.locationMessage);
  const contact = record(body.contactMessage ?? body.contactsArrayMessage);
  const poll = record(body.pollCreationMessage ?? body.pollUpdateMessage);
  const list = record(body.listMessage);
  const button = record(
    body.buttonsMessage ??
      body.templateButtonReplyMessage ??
      body.buttonsResponseMessage ??
      body.listResponseMessage
  );
  const reaction = record(body.reactionMessage);
  const carousel = record(body.interactiveMessage?.carouselMessage);

  const messageType: BaileysMessageKind = body.imageMessage
    ? "image"
    : body.audioMessage
      ? "audio"
      : body.videoMessage
        ? "video"
        : body.documentMessage
          ? "document"
          : sticker
            ? "sticker"
            : body.locationMessage
              ? "location"
              : body.contactMessage || body.contactsArrayMessage
                ? "contact"
                : body.pollCreationMessage || body.pollUpdateMessage
                  ? "poll"
                  : body.listMessage
                    ? "list"
                    : body.buttonsMessage ||
                        body.templateButtonReplyMessage ||
                        body.buttonsResponseMessage ||
                        body.listResponseMessage
                      ? "button"
              : carousel.cards
                ? "carousel"
                : body.reactionMessage
                  ? "react"
                  : "text";

  const caption =
    image.caption ?? video.caption ?? document.caption ?? button.selectedDisplayText;
  const text =
    body.conversation ??
    body.extendedTextMessage?.text ??
    caption ??
    location.name ??
    location.address ??
    contact.displayName ??
    contact.contacts?.[0]?.displayName ??
    poll.name ??
    list.description ??
    button.contentText ??
    button.selectedButtonId ??
    reaction.text;
  const fallback: Record<BaileysMessageKind, string> = {
    text: "[mensagem recebida]",
    image: "[imagem recebida]",
    audio: "[áudio recebido]",
    video: "[vídeo recebido]",
    document: "[documento recebido]",
    sticker: "[figurinha recebida]",
    location: "[localização recebida]",
    contact: "[contato recebido]",
    poll: "[enquete recebida]",
    list: "[lista recebida]",
    button: "[resposta recebida]",
    carousel: "[carrossel recebido]",
    react: "[reação recebida]",
  };

  return {
    body,
    messageType,
    content: typeof text === "string" && text.length > 0 ? text : fallback[messageType],
    isPlaceholder: typeof text !== "string" || text.trim().length === 0,
    // Media URLs are not echoed back in WAMessage; captions are stable and text is exact.
    echoContent:
      messageType === "text"
        ? typeof text === "string" ? text : ""
        : messageType === "button"
          ? typeof (button.contentText ?? button.selectedDisplayText) === "string"
            ? button.contentText ?? button.selectedDisplayText
            : ""
        : typeof caption === "string" ? caption : "",
  };
}

export function normalizeBaileysOutgoingMessage(value: unknown): {
  messageType: BaileysMessageKind;
  echoContent: string;
} {
  const body = record(value);
  const messageType: BaileysMessageKind = body.image || body.imageMessage
    ? "image"
    : body.audio || body.audioMessage
      ? "audio"
      : body.video || body.videoMessage
        ? "video"
        : body.document || body.documentMessage
          ? "document"
          : body.sticker || body.stickerMessage
            ? "sticker"
            : body.location || body.locationMessage
              ? "location"
              : body.contacts || body.contact || body.contactMessage
                ? "contact"
                : body.poll || body.pollCreationMessage || body.pollUpdateMessage
                  ? "poll"
                  : body.list || body.listMessage
                    ? "list"
                    : body.buttons ||
                        body.templateButtons ||
                        body.buttonsMessage ||
                        body.templateButtonReplyMessage ||
                        body.buttonsResponseMessage ||
                        body.listResponseMessage
                      ? "button"
                      : body.interactiveMessage?.carouselMessage
                        ? "carousel"
                        : body.react || body.reactionMessage
                          ? "react"
                          : "text";
  const media = record(
    body[messageType] ??
      body[`${messageType}Message`] ??
      (messageType === "contact" ? body.contacts : undefined)
  );
  const text =
    messageType === "text"
      ? body.text ?? body.conversation ?? body.extendedTextMessage?.text
      : messageType === "image" ||
          messageType === "video" ||
          messageType === "document"
        ? body.caption ?? media.caption
        : messageType === "button"
          ? body.text ?? media.contentText ?? media.selectedDisplayText
        : undefined;
  return {
    messageType,
    echoContent: typeof text === "string" ? text : "",
  };
}

/**
 * Tracks short-lived message IDs/fingerprints for messages sent by this Panel process.
 * An echo must not be re-ingested as a human takeover; unrelated fromMe messages are.
 */
export class PanelMessageEchoTracker {
  private readonly ids = new Map<
    string,
    { signature?: string; expiresAt: number }
  >();
  private readonly pending = new Map<string, { count: number; expiresAt: number }>();

  rememberPending(jid: string, messageType: string, echoContent: string) {
    this.prune();
    const key = this.key(jid, messageType, echoContent);
    const current = this.pending.get(key);
    this.pending.set(key, {
      count: (current?.count ?? 0) + 1,
      expiresAt: Date.now() + 15_000,
    });
  }

  rememberSentId(id: string | undefined) {
    if (!id) return;
    this.ids.set(id, { expiresAt: Date.now() + 120_000 });
    while (this.ids.size > 256) this.ids.delete(this.ids.keys().next().value!);
  }

  hasSentId(id: string | null | undefined) {
    this.prune();
    return Boolean(id && this.ids.has(id));
  }

  rememberSentMessage(
    id: string | undefined,
    jid: string,
    messageType: string,
    echoContent: string
  ) {
    if (!id) return;
    this.ids.set(id, {
      signature: this.key(jid, messageType, echoContent),
      expiresAt: Date.now() + 120_000,
    });
    while (this.ids.size > 256) this.ids.delete(this.ids.keys().next().value!);
  }

  forgetPending(jid: string, messageType: string, echoContent: string) {
    this.consumePending(this.key(jid, messageType, echoContent));
  }

  isPanelEcho(
    id: string | null | undefined,
    jid: string,
    messageType: string,
    echoContent: string
  ) {
    this.prune();
    if (id && this.ids.has(id)) {
      const sent = this.ids.get(id)!;
      if (sent.signature) {
        this.consumePending(sent.signature);
        this.ids.set(id, { expiresAt: sent.expiresAt });
      }
      return true;
    }
    const key = this.key(jid, messageType, echoContent);
    if (!this.consumePending(key)) return false;
    if (id) this.rememberSentId(id);
    return true;
  }

  private consumePending(key: string) {
    const pending = this.pending.get(key);
    if (!pending) return false;
    if (pending.count <= 1) this.pending.delete(key);
    else this.pending.set(key, { ...pending, count: pending.count - 1 });
    return true;
  }

  private key(jid: string, messageType: string, echoContent: string) {
    return `${jid}\u0000${messageType}\u0000${echoContent}`;
  }

  private prune() {
    const now = Date.now();
    for (const [key, value] of this.pending)
      if (value.expiresAt <= now) this.pending.delete(key);
    for (const [id, value] of this.ids)
      if (value.expiresAt <= now) this.ids.delete(id);
  }
}
