import { describe, expect, it } from "vitest";
import { deriveConversationState, type ConversationActivity } from "./conversation-state";

const activity = (
  id: number,
  direction: ConversationActivity["direction"],
  status: ConversationActivity["status"],
  createdAt: string
): ConversationActivity => ({ id, direction, status, createdAt });

describe("conversation state", () => {
  it("marks the conversation as awaiting the lead after an accepted outbound", () => {
    const state = deriveConversationState([
      activity(1, "inbound", "received", "2026-09-27T10:00:00Z"),
      activity(2, "outbound", "sent", "2026-09-27T10:01:00Z"),
    ]);
    expect(state.awaitingResponse).toBe(true);
    expect(state.needsOperatorResponse).toBe(false);
  });

  it("marks the conversation as needing an operator after a new inbound", () => {
    const state = deriveConversationState([
      activity(1, "outbound", "sent", "2026-09-27T10:00:00Z"),
      activity(2, "inbound", "received", "2026-09-27T10:02:00Z"),
    ]);
    expect(state.awaitingResponse).toBe(false);
    expect(state.needsOperatorResponse).toBe(true);
  });

  it("does not await the lead after a failed outbound", () => {
    const state = deriveConversationState([
      activity(1, "outbound", "failed", "2026-09-27T10:00:00Z"),
    ]);
    expect(state.awaitingResponse).toBe(false);
    expect(state.needsOperatorResponse).toBe(false);
  });

  it("does not await the lead before an outbound message is sent", () => {
    const state = deriveConversationState([
      activity(1, "outbound", "queued", "2026-09-27T10:00:00Z"),
    ]);
    expect(state.awaitingResponse).toBe(false);
  });

  it("uses message id to break same-timestamp ties and handles empty threads", () => {
    const state = deriveConversationState([
      activity(2, "inbound", "received", "2026-09-27T10:00:00Z"),
      activity(3, "outbound", "sent", "2026-09-27T10:00:00Z"),
    ]);
    expect(state.latestActivity?.id).toBe(3);
    expect(deriveConversationState([])).toEqual({
      awaitingResponse: false,
      needsOperatorResponse: false,
    });
  });
});
