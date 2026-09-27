export type ConversationActivity = {
  id: number;
  direction: "inbound" | "outbound";
  status: "queued" | "processing" | "sent" | "received" | "failed";
  createdAt: Date | string;
};

export type ConversationState = {
  latestActivity?: ConversationActivity;
  awaitingResponse: boolean;
  needsOperatorResponse: boolean;
};

/**
 * `awaitingResponse` means the business has sent the latest accepted outbound
 * message and is waiting for the lead. It is intentionally independent from
 * `unreadCount`, which means an operator has not read an inbound message.
 */
export function deriveConversationState(
  activities: ConversationActivity[]
): ConversationState {
  const ordered = [...activities].sort((a, b) => {
    const byTime = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return byTime || a.id - b.id;
  });
  const latestActivity = ordered.at(-1);
  if (!latestActivity)
    return { awaitingResponse: false, needsOperatorResponse: false };

  const awaitingResponse =
    latestActivity.direction === "outbound" && latestActivity.status === "sent";
  const needsOperatorResponse =
    latestActivity.direction === "inbound" && latestActivity.status !== "failed";

  return { latestActivity, awaitingResponse, needsOperatorResponse };
}
