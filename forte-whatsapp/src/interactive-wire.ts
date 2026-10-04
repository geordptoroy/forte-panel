import { type AnyMessageContent } from "baileys";
import { isGroupJid } from "./instance-settings.js";

type WireNode = {
  tag: string;
  attrs: Record<string, string>;
  content?: WireNode[];
};

function unwrap(payload: AnyMessageContent): Record<string, unknown> {
  const root = payload as Record<string, unknown>;
  const viewOnce = root.viewOnceMessage;
  if (viewOnce && typeof viewOnce === "object") {
    const message = (viewOnce as Record<string, unknown>).message;
    if (message && typeof message === "object")
      return message as Record<string, unknown>;
  }
  return root;
}

export function buildInteractiveAdditionalNodes(
  payload: AnyMessageContent,
  jid: string
): WireNode[] {
  const root = unwrap(payload);
  const list = root.listMessage;
  const interactive = root.interactiveMessage;
  const interactiveValue =
    interactive && typeof interactive === "object"
      ? (interactive as Record<string, unknown>)
      : undefined;
  const nativeFlow = interactiveValue?.nativeFlowMessage;
  const carousel = interactiveValue?.carouselMessage;
  const firstButtonName =
    nativeFlow &&
    typeof nativeFlow === "object" &&
    Array.isArray((nativeFlow as Record<string, unknown>).buttons)
      ? ((
          (nativeFlow as Record<string, unknown>).buttons as Array<
            Record<string, unknown>
          >
        )[0]?.name as string | undefined)
      : undefined;
  let biz: WireNode | undefined;

  if (
    firstButtonName === "payment_info" ||
    firstButtonName === "review_and_pay"
  ) {
    biz = {
      tag: "biz",
      attrs: {
        native_flow_name:
          firstButtonName === "review_and_pay"
            ? "order_details"
            : firstButtonName,
      },
    };
  } else if (nativeFlow || carousel) {
    biz = {
      tag: "biz",
      attrs: {},
      content: [
        {
          tag: "interactive",
          attrs: { type: "native_flow", v: "1" },
          content: [
            {
              tag: "native_flow",
              attrs: { v: "9", name: "mixed" },
            },
          ],
        },
      ],
    };
  } else if (list && typeof list === "object") {
    biz = {
      tag: "biz",
      attrs: {},
      content: [
        {
          tag: "list",
          attrs: { v: "2", type: "product_list" },
        },
      ],
    };
  }

  if (!biz) return [];
  const nodes = [biz];
  if (!isGroupJid(jid)) nodes.push({ tag: "bot", attrs: { biz_bot: "1" } });
  return nodes;
}
