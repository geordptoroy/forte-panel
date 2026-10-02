import { describe, expect, it } from "vitest";
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
    expect(payload.interactiveMessage.body).toEqual({ text: "Escolha" });
    expect(payload.interactiveMessage.nativeFlowMessage.buttons).toHaveLength(2);
    expect(payload.interactiveMessage.nativeFlowMessage.buttons[0]).toMatchObject({ name: "quick_reply" });
    expect(JSON.parse(payload.interactiveMessage.nativeFlowMessage.buttons[0].buttonParamsJson)).toEqual({ display_text: "Sim", id: "yes" });
  });

  it("builds a single-select native flow for lists", () => {
    const sections = [{ title: "Serviços", rows: [{ id: "support", title: "Suporte" }] }];
    const payload = buildNativeInteractivePayload("list", "Selecione", { buttonText: "Abrir", sections }) as any;
    const button = payload.interactiveMessage.nativeFlowMessage.buttons[0];
    expect(button.name).toBe("single_select");
    expect(JSON.parse(button.buttonParamsJson)).toEqual({ title: "Abrir", sections });
  });
});
