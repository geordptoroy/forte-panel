import { describe, expect, it } from "vitest";
import { proto } from "baileys";
import { buildNativeInteractivePayload } from "./interactive-payload.js";

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
    expect(interactive.nativeFlowMessage.buttons[0]).toMatchObject({ name: "quick_reply" });
    expect(JSON.parse(interactive.nativeFlowMessage.buttons[0].buttonParamsJson)).toEqual({ display_text: "Sim", id: "yes" });
  });

  it("builds a single-select native flow for lists", () => {
    const sections = [{ title: "Serviços", rows: [{ id: "support", title: "Suporte" }] }];
    const payload = buildNativeInteractivePayload("list", "Selecione", { buttonText: "Abrir", sections }) as any;
    const button = payload.interactiveMessage.nativeFlowMessage.buttons[0];
    expect(button.name).toBe("single_select");
    expect(JSON.parse(button.buttonParamsJson)).toEqual({ title: "Abrir", sections });
  });

  it("round-trips the direct envelope through Baileys protobuf", () => {
    const payload = buildNativeInteractivePayload("button", "Escolha", {
      buttons: [{ buttonId: "yes", buttonText: { displayText: "Sim" } }],
    });
    const encoded = proto.Message.encode(proto.Message.fromObject(payload as never)).finish();
    const decoded = proto.Message.toObject(proto.Message.decode(encoded), {
      longs: String,
      enums: String,
      defaults: false,
    }) as any;
    expect(decoded.viewOnceMessage).toBeUndefined();
    expect(decoded.interactiveMessage.nativeFlowMessage.messageVersion).toBe(1);
    expect(JSON.parse(decoded.interactiveMessage.nativeFlowMessage.buttons[0].buttonParamsJson)).toEqual({
      display_text: "Sim",
      id: "yes",
    });
  });
});
