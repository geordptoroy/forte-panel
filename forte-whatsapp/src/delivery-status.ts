import { WAMessageStatus } from "baileys";

export type DeliveryStatus = "sent" | "delivered" | "read";

export function normalizeBaileysMessageStatus(value: unknown): DeliveryStatus | null {
  if (value === WAMessageStatus.PLAYED || value === WAMessageStatus.READ)
    return "read";
  if (value === WAMessageStatus.DELIVERY_ACK) return "delivered";
  if (value === WAMessageStatus.SERVER_ACK) return "sent";
  return null;
}
