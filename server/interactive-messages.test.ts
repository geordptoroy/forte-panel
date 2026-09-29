import { describe, expect, it } from "vitest";
import { validateInteractiveMessage } from "./interactive-messages";

describe("interactive message contracts", () => {
  it("accepts up to three WhatsApp buttons", () => {
    expect(
      validateInteractiveMessage({
        messageType: "button",
        content: "Escolha uma opção",
        metadata: {
          buttons: [
            { buttonId: "yes", buttonText: { displayText: "Sim" } },
            { buttonId: "no", buttonText: { displayText: "Não" } },
          ],
        },
      }).buttons,
    ).toHaveLength(2);
  });

  it("requires a gateway payload for lists and polls", () => {
    expect(() =>
      validateInteractiveMessage({ messageType: "list", content: "Escolha", metadata: {} }),
    ).toThrow("exige payload");
    expect(() =>
      validateInteractiveMessage({
        messageType: "poll",
        content: "Votação",
        metadata: { payload: { poll: { name: "Escolha" } } },
      }),
    ).not.toThrow();
  });
});
