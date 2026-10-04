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
      }).buttons
    ).toHaveLength(2);
  });

  it("accepts four Native Flow buttons", () => {
    expect(() =>
      validateInteractiveMessage({
        messageType: "button",
        content: "Escolha uma opção",
        metadata: {
          buttons: [1, 2, 3, 4].map(index => ({
            buttonId: `option-${index}`,
            buttonText: { displayText: `Opção ${index}` },
          })),
        },
      })
    ).not.toThrow();
  });

  it("requires a gateway payload for lists and polls", () => {
    expect(() =>
      validateInteractiveMessage({
        messageType: "list",
        content: "Escolha",
        metadata: {},
      })
    ).toThrow("exige payload");
    expect(() =>
      validateInteractiveMessage({
        messageType: "poll",
        content: "Votação",
        metadata: { payload: { poll: { name: "Escolha" } } },
      })
    ).not.toThrow();
  });

  it("accepts a carousel described by at least two cards", () => {
    expect(() =>
      validateInteractiveMessage({
        messageType: "carousel",
        content: "Escolha um produto",
        metadata: {
          cards: [
            { image: "https://example.com/one.jpg", body: "Um" },
            { image: "https://example.com/two.jpg", body: "Dois" },
          ],
        },
      })
    ).not.toThrow();
  });
});
