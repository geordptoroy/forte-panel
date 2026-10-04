import { describe, expect, it } from "vitest";
import { buildInteractiveAdditionalNodes } from "./interactive-wire.js";

describe("interactive wire protocol", () => {
  it("adds native_flow and bot nodes for private native-flow messages", () => {
    const nodes = buildInteractiveAdditionalNodes(
      {
        interactiveMessage: {
          nativeFlowMessage: {
            buttons: [
              {
                name: "quick_reply",
                buttonParamsJson: JSON.stringify({
                  display_text: "Sim",
                  id: "sim",
                }),
              },
            ],
          },
        },
      } as never,
      "236450952020113@lid"
    );
    expect(nodes).toEqual([
      {
        tag: "biz",
        attrs: {},
        content: [
          {
            tag: "interactive",
            attrs: { type: "native_flow", v: "1" },
            content: [{ tag: "native_flow", attrs: { v: "9", name: "mixed" } }],
          },
        ],
      },
      { tag: "bot", attrs: { biz_bot: "1" } },
    ]);
  });

  it("uses the list node for legacy lists and omits bot for groups", () => {
    const nodes = buildInteractiveAdditionalNodes(
      { listMessage: { buttonText: "Abrir", sections: [] } } as never,
      "120363000000000000@g.us"
    );
    expect(nodes).toEqual([
      {
        tag: "biz",
        attrs: {},
        content: [{ tag: "list", attrs: { v: "2", type: "product_list" } }],
      },
    ]);
  });

  it("adds the native-flow node for carousel messages", () => {
    const nodes = buildInteractiveAdditionalNodes(
      { interactiveMessage: { carouselMessage: { cards: [] } } } as never,
      "236450952020113@lid"
    );
    expect(nodes[0]).toMatchObject({ tag: "biz" });
    expect(nodes[0].content?.[0].content?.[0].attrs).toEqual({
      v: "9",
      name: "mixed",
    });
  });
});
