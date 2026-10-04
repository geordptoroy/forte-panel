import { describe, expect, it } from "vitest";
import { proto } from "baileys";
import {
  buildCarouselPayload,
  buildLegacyListPayload,
  buildNativeInteractivePayload,
} from "./interactive-payload.js";

describe("native interactive payloads", () => {
  it("builds quick replies for buttons", () => {
    const payload = buildNativeInteractivePayload("button", "Escolha", {
      footer: "Forte",
      buttons: [
        { buttonId: "yes", buttonText: { displayText: "Sim" } },
        { buttonId: "no", buttonText: { displayText: "Não" } },
      ],
    }) as any;
    const interactive = payload.interactiveMessage;
    expect(interactive.body).toEqual({ text: "Escolha" });
    expect(interactive.nativeFlowMessage.messageVersion).toBe(1);
    expect(interactive.nativeFlowMessage.buttons).toHaveLength(2);
    expect(interactive.nativeFlowMessage.buttons[0]).toMatchObject({
      name: "quick_reply",
    });
    expect(
      JSON.parse(interactive.nativeFlowMessage.buttons[0].buttonParamsJson)
    ).toEqual({ display_text: "Sim", id: "yes" });
  });

  it("builds the legacy list envelope used by PAPI", () => {
    const sections = [
      { title: "Serviços", rows: [{ id: "support", title: "Suporte" }] },
    ];
    const payload = buildLegacyListPayload("Selecione", {
      title: "Escolha",
      footer: "Forte",
      buttonText: "Abrir",
      sections,
    }) as any;
    expect(payload.interactiveMessage).toBeUndefined();
    expect(payload.listMessage).toMatchObject({
      title: "Escolha",
      description: "Selecione",
      footerText: "Forte",
      buttonText: "Abrir",
      sections: [
        { title: "Serviços", rows: [{ rowId: "support", title: "Suporte" }] },
      ],
    });
  });

  it("round-trips the direct envelope through Baileys protobuf", () => {
    const payload = buildNativeInteractivePayload("button", "Escolha", {
      buttons: [{ buttonId: "yes", buttonText: { displayText: "Sim" } }],
    });
    const encoded = proto.Message.encode(
      proto.Message.fromObject(payload as never)
    ).finish();
    const decoded = proto.Message.toObject(proto.Message.decode(encoded), {
      longs: String,
      enums: String,
      defaults: false,
    }) as any;
    expect(decoded.viewOnceMessage).toBeUndefined();
    expect(decoded.interactiveMessage.nativeFlowMessage.messageVersion).toBe(1);
    expect(
      JSON.parse(
        decoded.interactiveMessage.nativeFlowMessage.buttons[0].buttonParamsJson
      )
    ).toEqual({
      display_text: "Sim",
      id: "yes",
    });
  });

  it("serializes a Pix key as a copy action", () => {
    const payload = buildNativeInteractivePayload("button", "Chave Pix", {
      buttons: [
        {
          buttonId: "pix",
          buttonText: { displayText: "Copiar chave Pix" },
          copyCode: "10703598660",
        },
      ],
    }) as any;
    const button = payload.interactiveMessage.nativeFlowMessage.buttons[0];
    expect(button.name).toBe("cta_copy");
    expect(JSON.parse(button.buttonParamsJson)).toEqual({
      display_text: "Copiar chave Pix",
      copy_code: "10703598660",
    });
  });

  it("prepares media and native-flow actions for carousel cards", async () => {
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const payload = (await buildCarouselPayload(
      {
        waUploadToServer: async () => ({
          mediaUrl: "https://upload.invalid/media",
          directPath: "/media",
        }),
      },
      "Escolha",
      {
        cards: [
          {
            image: png,
            body: "Um",
            buttons: [{ id: "one", displayText: "Um" }],
          },
          {
            image: png,
            body: "Dois",
            buttons: [{ id: "two", displayText: "Dois" }],
          },
        ],
      }
    )) as any;
    const carousel = payload.interactiveMessage.carouselMessage;
    expect(carousel.messageVersion).toBe(1);
    expect(carousel.cards).toHaveLength(2);
    expect(carousel.cards[0].header.imageMessage).toBeDefined();
    expect(carousel.cards[0].nativeFlowMessage.buttons[0].name).toBe(
      "quick_reply"
    );
  });
});
