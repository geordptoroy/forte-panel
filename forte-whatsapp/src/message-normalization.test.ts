import { describe, expect, it } from "vitest";
import {
  normalizeBaileysMessage,
  normalizeBaileysOutgoingMessage,
  PanelMessageEchoTracker,
  shouldForwardLiveUpsert,
} from "./message-normalization.js";

describe("Baileys message normalization", () => {
  it.each([
    {
      label: "ephemeral",
      message: {
        ephemeralMessage: { message: { conversation: "oi" } },
      },
    },
    {
      label: "view once v2",
      message: {
        viewOnceMessageV2: {
          message: { extendedTextMessage: { text: "oi" } },
        },
      },
    },
    {
      label: "edited wrapper",
      message: {
        editedMessage: {
          message: { extendedTextMessage: { text: "oi" } },
        },
      },
    },
  ])("preserves plain text wrapped as $label instead of replacing it with a media placeholder", ({ message }) => {
    expect(normalizeBaileysMessage(message)).toMatchObject({
      messageType: "text",
      content: "oi",
      echoContent: "oi",
    });
  });

  it("unwraps view-once image captions and preserves the media kind", () => {
    expect(
      normalizeBaileysMessage({
        viewOnceMessage: {
          message: { imageMessage: { caption: "Veja a foto", mimetype: "image/jpeg" } },
        },
      })
    ).toMatchObject({
      messageType: "image",
      content: "Veja a foto",
      echoContent: "Veja a foto",
    });
  });

  it("uses type-specific placeholders for media that has no caption", () => {
    expect(normalizeBaileysMessage({ audioMessage: { ptt: true } })).toMatchObject({
      messageType: "audio",
      content: "[áudio recebido]",
      echoContent: "",
    });
    expect(normalizeBaileysMessage({ imageMessage: {} }).content).toBe(
      "[imagem recebida]"
    );
  });

  it("marks an unknown text fallback without mistaking valid media placeholders for text", () => {
    expect(
      normalizeBaileysMessage({ protocolMessage: { type: 0 } })
    ).toMatchObject({
      messageType: "text",
      content: "[mensagem recebida]",
      isPlaceholder: true,
    });
    expect(normalizeBaileysMessage({ conversation: "oi" })).toMatchObject({
      content: "oi",
      isPlaceholder: false,
    });
    expect(normalizeBaileysMessage({ audioMessage: { ptt: true } })).toMatchObject({
      messageType: "audio",
      isPlaceholder: true,
    });
  });

  it.each([
    { payload: { text: "oi" }, messageType: "text", echoContent: "oi" },
    {
      payload: { image: { url: "image.jpg" }, caption: "legenda" },
      messageType: "image",
      echoContent: "legenda",
    },
    {
      payload: { audio: { url: "audio.ogg" } },
      messageType: "audio",
      echoContent: "",
    },
    {
      payload: { video: { url: "video.mp4" }, caption: "legenda" },
      messageType: "video",
      echoContent: "legenda",
    },
    {
      payload: { document: { url: "doc.pdf" }, caption: "legenda" },
      messageType: "document",
      echoContent: "legenda",
    },
    {
      payload: { sticker: { url: "sticker.webp" } },
      messageType: "sticker",
      echoContent: "",
    },
    {
      payload: { location: { degreesLatitude: 1, degreesLongitude: 2 } },
      messageType: "location",
      echoContent: "",
    },
    {
      payload: { contacts: [{ displayName: "Contato" }] },
      messageType: "contact",
      echoContent: "",
    },
    {
      payload: { poll: { name: "Enquete" } },
      messageType: "poll",
      echoContent: "",
    },
    {
      payload: { list: { description: "Lista" } },
      messageType: "list",
      echoContent: "",
    },
    {
      payload: {
        text: "Escolha",
        buttons: [{ buttonId: "1", buttonText: { displayText: "Sim" } }],
      },
      messageType: "button",
      echoContent: "Escolha",
    },
    {
      payload: { react: { text: "👍" } },
      messageType: "react",
      echoContent: "",
    },
  ])(
    "creates the matching $messageType echo signature",
    ({ payload, messageType, echoContent }) => {
      expect(normalizeBaileysOutgoingMessage(payload)).toEqual({
        messageType,
        echoContent,
      });
    }
  );

  it("uses button content text in the inbound echo signature", () => {
    expect(
      normalizeBaileysMessage({
        buttonsMessage: { contentText: "Escolha", buttons: [] },
      })
    ).toMatchObject({ messageType: "button", echoContent: "Escolha" });
  });
});

describe("Baileys live upsert routing", () => {
  it("only forwards online notify events without a backfill request id", () => {
    expect(shouldForwardLiveUpsert("notify")).toBe(true);
    expect(shouldForwardLiveUpsert("append")).toBe(false);
    expect(shouldForwardLiveUpsert("notify", "history-request-1")).toBe(false);
  });
});

describe("Panel message echo tracking", () => {
  it("suppresses an echoed Panel send but not a different manual message from the connected number", () => {
    const echoes = new PanelMessageEchoTracker();
    echoes.rememberPending("5511999999999@s.whatsapp.net", "text", "resposta da IA");

    expect(
      echoes.isPanelEcho(
        undefined,
        "5511999999999@s.whatsapp.net",
        "text",
        "resposta da IA"
      )
    ).toBe(true);
    expect(
      echoes.isPanelEcho(
        "manual-id",
        "5511999999999@s.whatsapp.net",
        "text",
        "oi"
      )
    ).toBe(false);
  });

  it("uses the provider message ID to suppress a delayed echo", () => {
    const echoes = new PanelMessageEchoTracker();
    echoes.rememberSentId("panel-message-id");
    expect(
      echoes.isPanelEcho(
        "panel-message-id",
        "5511999999999@s.whatsapp.net",
        "text",
        "qualquer texto"
      )
    ).toBe(true);
    expect(
      echoes.isPanelEcho(
        "panel-message-id",
        "5511999999999@s.whatsapp.net",
        "text",
        "qualquer texto"
      )
    ).toBe(true);
  });

  it("consumes the matching fingerprint when the provider ID identifies the echo", () => {
    const echoes = new PanelMessageEchoTracker();
    const jid = "5511999999999@s.whatsapp.net";
    echoes.rememberPending(jid, "text", "resposta");
    echoes.rememberSentMessage("panel-message-id", jid, "text", "resposta");

    expect(echoes.isPanelEcho("panel-message-id", jid, "text", "resposta")).toBe(
      true
    );
    expect(echoes.isPanelEcho(undefined, jid, "text", "resposta")).toBe(false);
  });

  it("does not suppress a later manual message after a failed send is cancelled", () => {
    const echoes = new PanelMessageEchoTracker();
    const jid = "5511999999999@s.whatsapp.net";
    echoes.rememberPending(jid, "text", "resposta");
    echoes.forgetPending(jid, "text", "resposta");
    expect(echoes.isPanelEcho(undefined, jid, "text", "resposta")).toBe(false);
  });
});
