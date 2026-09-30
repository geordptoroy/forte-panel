export const messageDeliveryStatuses = ["sent", "delivered", "read"] as const;

export type MessageDeliveryStatus = (typeof messageDeliveryStatuses)[number];

export function messageDeliveryRank(status: unknown): number {
  switch (status) {
    case "read":
      return 3;
    case "delivered":
      return 2;
    case "sent":
    default:
      return 1;
  }
}
