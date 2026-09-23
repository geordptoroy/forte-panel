export type IntegrationName = "papi" | "n8n" | "clientverse" | "easyappointments" | "qdrant" | "localai";

export type IntegrationHealth = {
  name: IntegrationName;
  ok: boolean;
  checkedAt: Date;
  latencyMs?: number;
  detail?: string;
};

export type InboundMessageEvent = {
  eventId: string;
  phone: string;
  name?: string;
  content: string;
  messageType: "text" | "image" | "audio" | "video" | "document";
  receivedAt: Date;
};

export type OutboundMessageCommand = {
  idempotencyKey: string;
  phone: string;
  content: string;
  messageType?: "text" | "image" | "audio" | "video" | "document";
};

export type WorkflowCommand = {
  idempotencyKey: string;
  event: string;
  contactId: number;
  payload: Record<string, unknown>;
};

export type AppointmentSlot = {
  externalId: string;
  startsAt: Date;
  endsAt: Date;
  service?: string;
  provider?: string;
  available: boolean;
};

export interface PapiAdapter {
  health(): Promise<IntegrationHealth>;
  sendMessage(command: OutboundMessageCommand): Promise<{ externalId: string; status: "queued" | "sent" }>;
  normalizeInbound(event: unknown): InboundMessageEvent;
}

export interface N8nAdapter {
  health(): Promise<IntegrationHealth>;
  dispatch(command: WorkflowCommand): Promise<{ accepted: boolean; executionId?: string }>;
}

export interface ClientverseAdapter {
  health(): Promise<IntegrationHealth>;
  upsertContact(contact: { externalPhone: string; name: string; city?: string; neighborhood?: string }): Promise<{ externalId?: string }>;
}

export interface EasyAppointmentsAdapter {
  health(): Promise<IntegrationHealth>;
  listSlots(from: Date, to: Date): Promise<AppointmentSlot[]>;
}

export interface VectorMemoryAdapter {
  health(): Promise<IntegrationHealth>;
  search(input: { contactId: number; query: string; limit: number }): Promise<Array<{ id: string; score: number; text: string }>>;
}
