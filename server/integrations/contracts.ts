export type IntegrationName = "papi" | "n8n" | "qdrant" | "localai";

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
  id: number;
  startsAt: Date;
  endsAt: Date;
  serviceId: number;
  professionalId: number;
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

export interface VectorMemoryAdapter {
  health(): Promise<IntegrationHealth>;
  search(input: { workspaceId: number; contactId: number; query: string; limit: number }): Promise<Array<{ id: string; score: number; text: string }>>;
}

export interface LocalAiAdapter {
  health(): Promise<IntegrationHealth>;
  classify(input: { workspaceId: number; text: string }): Promise<{ urgency: string; intent: string; confidence: number }>;
}

export type NativeCrmModule = "contacts" | "pipeline" | "calendar" | "tasks" | "billing";
