import { index, integer, jsonb, pgEnum, pgTable, serial, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);
export const operationalRoleEnum = pgEnum("operational_role", ["human_attendant", "ai_attendant", "professional"]);
export const workspacePlanEnum = pgEnum("workspace_plan", ["starter", "pro", "business"]);
export const workspaceMemberRoleEnum = pgEnum("workspace_member_role", ["owner", "admin", "manager", "agent"]);
export const whatsappProviderEnum = pgEnum("whatsapp_provider", ["papi", "meta_cloud_api"]);
export const webhookStatusEnum = pgEnum("webhook_status", ["received", "processed", "failed"]);
export const domainEventStatusEnum = pgEnum("domain_event_status", ["pending", "processing", "delivered", "failed"]);
export const urgencyEnum = pgEnum("urgency", ["Baixa", "Média", "Alta", "Crítica"]);
export const noteAuthorTypeEnum = pgEnum("note_author_type", ["human", "ai", "system"]);
export const conversationStatusEnum = pgEnum("conversation_status", ["open", "resolved"]);
export const messageDirectionEnum = pgEnum("message_direction", ["inbound", "outbound", "system"]);
export const messageSenderTypeEnum = pgEnum("message_sender_type", ["lead", "ai", "human", "system"]);
export const messageTypeEnum = pgEnum("message_type", ["text", "image", "audio", "video", "document", "button"]);
export const messageStatusEnum = pgEnum("message_status", ["received", "queued", "processing", "sent", "failed"]);
export const appointmentStatusEnum = pgEnum("appointment_status", ["requested", "confirmed", "in_progress", "completed", "cancelled", "no_show"]);
export const quoteStatusEnum = pgEnum("quote_status", ["orcamento", "aguardando_aprovacao", "aprovado", "sinal_pendente", "parcialmente_pago", "pago", "cancelado"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 32 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: userRoleEnum("role").default("user").notNull(),
  passwordHash: text("passwordHash"),
  operationalRole: operationalRoleEnum("operationalRole"),
  sessionVersion: integer("sessionVersion").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("users_single_admin_idx").on(table.role).where(sql`${table.role} = 'admin'`),
]);

export const workspaces = pgTable("workspaces", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  segment: varchar("segment", { length: 80 }).default("servicos").notNull(),
  plan: workspacePlanEnum("plan").default("starter").notNull(),
  timezone: varchar("timezone", { length: 64 }).default("America/Sao_Paulo").notNull(),
  active: integer("active").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const workspaceMembers = pgTable("workspaceMembers", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull(),
  userId: integer("userId").notNull(),
  role: workspaceMemberRoleEnum("role").default("agent").notNull(),
  professionalId: integer("professionalId"),
  active: integer("active").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("workspace_members_unique_idx").on(table.workspaceId, table.userId),
  index("workspace_members_professional_idx").on(table.workspaceId, table.professionalId),
]);

export const workspaceSettings = pgTable("workspaceSettings", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull(),
  key: varchar("key", { length: 100 }).notNull(),
  value: text("value"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const workspaceUsageBuckets = pgTable("workspaceUsageBuckets", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull(),
  bucketStart: timestamp("bucketStart").notNull(),
  apiRequests: integer("apiRequests").default(0).notNull(),
  aiRequests: integer("aiRequests").default(0).notNull(),
  outboundMessages: integer("outboundMessages").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("workspace_usage_buckets_unique_idx").on(table.workspaceId, table.bucketStart),
  index("workspace_usage_buckets_created_idx").on(table.createdAt),
]);

export const whatsappChannels = pgTable("whatsappChannels", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull(),
  provider: whatsappProviderEnum("provider").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  phoneNumber: varchar("phoneNumber", { length: 32 }),
  phoneNumberId: varchar("phoneNumberId", { length: 100 }),
  credentialsRef: varchar("credentialsRef", { length: 160 }),
  active: integer("active").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const whatsappInstances = pgTable("whatsappInstances", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull(),
  channelId: integer("channelId"),
  provider: whatsappProviderEnum("provider").default("papi").notNull(),
  deployment: varchar("deployment", { length: 32 }).default("self_hosted").notNull(),
  instanceId: varchar("instanceId", { length: 160 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  encryptedApiKey: text("encryptedApiKey"),
  webhookId: varchar("webhookId", { length: 120 }),
  encryptedWebhookSecret: text("encryptedWebhookSecret"),
  status: varchar("status", { length: 40 }).default("unknown").notNull(),
  active: integer("active").default(1).notNull(),
  isDefault: integer("isDefault").default(0).notNull(),
  lastHealthError: text("lastHealthError"),
  lastSeenAt: timestamp("lastSeenAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("whatsapp_instances_workspace_instance_unique_idx").on(table.workspaceId, table.instanceId),
  index("whatsapp_instances_workspace_idx").on(table.workspaceId, table.active, table.isDefault),
]);

export const apiIdempotency = pgTable("apiIdempotency", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull(),
  key: varchar("key", { length: 180 }).notNull(),
  fingerprint: varchar("fingerprint", { length: 128 }).notNull(),
  status: varchar("status", { length: 20 }).default("completed").notNull(),
  statusCode: integer("statusCode").default(200).notNull(),
  responseBody: text("responseBody"),
  leaseUntil: timestamp("leaseUntil"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("api_idempotency_workspace_key_unique_idx").on(table.workspaceId, table.key),
]);

export const agentEffects = pgTable("agentEffects", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull(),
  eventId: varchar("eventId", { length: 180 }).notNull(),
  toolCallId: varchar("toolCallId", { length: 180 }).notNull(),
  toolName: varchar("toolName", { length: 100 }).notNull(),
  fingerprint: varchar("fingerprint", { length: 128 }).notNull(),
  status: varchar("status", { length: 20 }).default("processing").notNull(),
  result: text("result"),
  leaseUntil: timestamp("leaseUntil"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("agent_effects_event_tool_unique_idx").on(table.workspaceId, table.eventId, table.toolCallId),
  index("agent_effects_lease_idx").on(table.status, table.leaseUntil, table.id),
]);

export const webhookEvents = pgTable("webhookEvents", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull(),
  eventId: varchar("eventId", { length: 180 }).notNull(),
  provider: varchar("provider", { length: 60 }).default("whatsapp").notNull(),
  payload: text("payload").notNull(),
  status: webhookStatusEnum("status").default("received").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  processedAt: timestamp("processedAt"),
}, (table) => [
  uniqueIndex("webhook_events_workspace_event_unique_idx").on(table.workspaceId, table.eventId),
]);

export const domainEvents = pgTable("domainEvents", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull(),
  eventKey: varchar("eventKey", { length: 180 }).notNull(),
  eventType: varchar("eventType", { length: 80 }).notNull(),
  aggregateType: varchar("aggregateType", { length: 80 }).notNull(),
  aggregateId: integer("aggregateId"),
  payload: text("payload").notNull(),
  status: domainEventStatusEnum("status").default("pending").notNull(),
  attemptCount: integer("attemptCount").default(0).notNull(),
  workerId: varchar("workerId", { length: 120 }),
  claimedAt: timestamp("claimedAt"),
  leaseUntil: timestamp("leaseUntil"),
  availableAt: timestamp("availableAt").defaultNow().notNull(),
  lastError: text("lastError"),
  deliveredAt: timestamp("deliveredAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("domain_events_workspace_key_unique_idx").on(table.workspaceId, table.eventKey),
  index("domain_events_pending_idx").on(table.status, table.availableAt, table.id),
  index("domain_events_lease_idx").on(table.status, table.leaseUntil, table.id),
  index("domain_events_workspace_idx").on(table.workspaceId, table.createdAt),
]);

export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId"),
  externalPhone: varchar("externalPhone", { length: 32 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  city: varchar("city", { length: 100 }),
  neighborhood: varchar("neighborhood", { length: 100 }),
  serviceRequested: varchar("serviceRequested", { length: 180 }),
  urgency: urgencyEnum("urgency").default("Média").notNull(),
  stage: varchar("stage", { length: 80 }).default("Novo contato").notNull(),
  aiEnabled: integer("aiEnabled").default(1).notNull(),
  quoteCents: integer("quoteCents").default(0).notNull(),
  unreadCount: integer("unreadCount").default(0).notNull(),
  lastMessagePreview: varchar("lastMessagePreview", { length: 500 }),
  lastMessageAt: timestamp("lastMessageAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("contacts_workspace_phone_unique_idx").on(table.workspaceId, table.externalPhone).where(sql`${table.workspaceId} IS NOT NULL`),
]);

export const contactNotes = pgTable("contactNotes", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull(),
  contactId: integer("contactId").notNull(),
  content: text("content").notNull(),
  authorType: noteAuthorTypeEnum("authorType").default("ai").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  contactId: integer("contactId").notNull(),
  status: conversationStatusEnum("status").default("open").notNull(),
  humanControlled: integer("humanControlled").default(0).notNull(),
  lastMessageAt: timestamp("lastMessageAt"),
  unreadCount: integer("unreadCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("conversations_contact_unique_idx").on(table.contactId),
]);

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversationId").notNull(),
  externalId: varchar("externalId", { length: 180 }),
  direction: messageDirectionEnum("direction").notNull(),
  senderType: messageSenderTypeEnum("senderType").notNull(),
  messageType: messageTypeEnum("messageType").default("text").notNull(),
  content: text("content").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  status: messageStatusEnum("status").default("received").notNull(),
  provider: whatsappProviderEnum("provider").default("papi").notNull(),
  attemptCount: integer("attemptCount").default(0).notNull(),
  lastError: text("lastError"),
  sentAt: timestamp("sentAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("messages_external_id_unique_idx").on(table.externalId).where(sql`${table.externalId} IS NOT NULL`),
]);

export const services = pgTable("services", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description"),
  durationMinutes: integer("durationMinutes").default(60).notNull(),
  priceCents: integer("priceCents").default(0).notNull(),
  active: integer("active").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => [
  index("services_workspace_idx").on(table.workspaceId, table.active),
]);

export const professionals = pgTable("professionals", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  specialty: varchar("specialty", { length: 120 }),
  color: varchar("color", { length: 20 }).default("#56d68a").notNull(),
  active: integer("active").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => [
  index("professionals_workspace_idx").on(table.workspaceId, table.active),
]);

export const professionalServices = pgTable("professionalServices", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull(),
  professionalId: integer("professionalId").notNull(),
  serviceId: integer("serviceId").notNull(),
  active: integer("active").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("professional_services_unique_idx").on(table.workspaceId, table.professionalId, table.serviceId),
]);

export const availability = pgTable("availability", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull(),
  professionalId: integer("professionalId").notNull(),
  weekday: integer("weekday").notNull(),
  startMinute: integer("startMinute").notNull(),
  endMinute: integer("endMinute").notNull(),
  active: integer("active").default(1).notNull(),
}, (table) => [
  index("availability_professional_idx").on(table.workspaceId, table.professionalId, table.weekday),
]);

export const appointmentsTable = pgTable("appointments", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull(),
  contactId: integer("contactId"),
  serviceId: integer("serviceId").notNull(),
  professionalId: integer("professionalId").notNull(),
  startsAt: timestamp("startsAt").notNull(),
  endsAt: timestamp("endsAt").notNull(),
  status: appointmentStatusEnum("status").default("requested").notNull(),
  notes: varchar("notes", { length: 500 }),
  source: varchar("source", { length: 40 }).default("panel").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => [
  index("appointments_workspace_idx").on(table.workspaceId, table.startsAt),
  index("appointments_professional_idx").on(table.professionalId, table.startsAt),
]);

export const quotes = pgTable("quotes", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull(),
  contactId: integer("contactId").notNull(),
  serviceName: varchar("serviceName", { length: 160 }).notNull(),
  description: text("description"),
  quotedCents: integer("quotedCents").default(0).notNull(),
  receivedCents: integer("receivedCents").default(0).notNull(),
  status: quoteStatusEnum("status").default("orcamento").notNull(),
  dueDate: timestamp("dueDate"),
  notes: varchar("notes", { length: 1000 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const auditLogs = pgTable("auditLogs", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull(),
  actorUserId: integer("actorUserId"),
  contactId: integer("contactId"),
  action: varchar("action", { length: 100 }).notNull(),
  summary: varchar("summary", { length: 500 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull(),
  userId: integer("userId").notNull(),
  eventKey: varchar("eventKey", { length: 255 }).notNull(),
  type: varchar("type", { length: 60 }).notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  body: text("body").notNull(),
  href: varchar("href", { length: 255 }).notNull(),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("notifications_user_event_unique_idx").on(table.workspaceId, table.userId, table.eventKey),
  index("notifications_user_created_idx").on(table.workspaceId, table.userId, table.createdAt, table.id),
  index("notifications_user_unread_idx").on(table.workspaceId, table.userId, table.readAt),
]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Workspace = typeof workspaces.$inferSelect;
export type InsertWorkspace = typeof workspaces.$inferInsert;
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type InsertWorkspaceMember = typeof workspaceMembers.$inferInsert;
export type WorkspaceSetting = typeof workspaceSettings.$inferSelect;
export type InsertWorkspaceSetting = typeof workspaceSettings.$inferInsert;
export type ApiIdempotency = typeof apiIdempotency.$inferSelect;
export type InsertApiIdempotency = typeof apiIdempotency.$inferInsert;
export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type InsertWebhookEvent = typeof webhookEvents.$inferInsert;
export type DomainEvent = typeof domainEvents.$inferSelect;
export type InsertDomainEvent = typeof domainEvents.$inferInsert;
export type WhatsappChannel = typeof whatsappChannels.$inferSelect;
export type InsertWhatsappChannel = typeof whatsappChannels.$inferInsert;
export type Contact = typeof contacts.$inferSelect;
export type InsertContact = typeof contacts.$inferInsert;
export type ContactNote = typeof contactNotes.$inferSelect;
export type InsertContactNote = typeof contactNotes.$inferInsert;
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;
export type Service = typeof services.$inferSelect;
export type InsertService = typeof services.$inferInsert;
export type Professional = typeof professionals.$inferSelect;
export type InsertProfessional = typeof professionals.$inferInsert;
export type ProfessionalService = typeof professionalServices.$inferSelect;
export type InsertProfessionalService = typeof professionalServices.$inferInsert;
export type Availability = typeof availability.$inferSelect;
export type InsertAvailability = typeof availability.$inferInsert;
export type Appointment = typeof appointmentsTable.$inferSelect;
export type InsertAppointment = typeof appointmentsTable.$inferInsert;
export type Quote = typeof quotes.$inferSelect;
export type InsertQuote = typeof quotes.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;
