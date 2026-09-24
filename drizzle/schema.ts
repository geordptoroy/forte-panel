import { integer, pgEnum, pgTable, serial, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);
export const workspacePlanEnum = pgEnum("workspace_plan", ["starter", "pro", "business"]);
export const workspaceMemberRoleEnum = pgEnum("workspace_member_role", ["owner", "admin", "manager", "agent"]);
export const whatsappProviderEnum = pgEnum("whatsapp_provider", ["papi", "meta_cloud_api"]);
export const webhookStatusEnum = pgEnum("webhook_status", ["received", "processed", "failed"]);
export const urgencyEnum = pgEnum("urgency", ["Baixa", "Média", "Alta", "Crítica"]);
export const noteAuthorTypeEnum = pgEnum("note_author_type", ["human", "ai", "system"]);
export const conversationStatusEnum = pgEnum("conversation_status", ["open", "resolved"]);
export const messageDirectionEnum = pgEnum("message_direction", ["inbound", "outbound", "system"]);
export const messageSenderTypeEnum = pgEnum("message_sender_type", ["lead", "ai", "human", "system"]);
export const messageTypeEnum = pgEnum("message_type", ["text", "image", "audio", "video", "document"]);
export const messageStatusEnum = pgEnum("message_status", ["received", "queued", "sent", "failed"]);
export const appointmentStatusEnum = pgEnum("appointment_status", ["requested", "confirmed", "cancelled", "completed", "no_show"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: userRoleEnum("role").default("user").notNull(),
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
  active: integer("active").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const workspaceSettings = pgTable("workspaceSettings", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull(),
  key: varchar("key", { length: 100 }).notNull(),
  value: text("value"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

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

export const apiIdempotency = pgTable("apiIdempotency", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId"),
  key: varchar("key", { length: 180 }).notNull().unique(),
  fingerprint: varchar("fingerprint", { length: 128 }).notNull(),
  statusCode: integer("statusCode").default(200).notNull(),
  responseBody: text("responseBody"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const webhookEvents = pgTable("webhookEvents", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId"),
  eventId: varchar("eventId", { length: 180 }).notNull().unique(),
  provider: varchar("provider", { length: 60 }).default("whatsapp").notNull(),
  payload: text("payload").notNull(),
  status: webhookStatusEnum("status").default("received").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  processedAt: timestamp("processedAt"),
});

export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId"),
  externalPhone: varchar("externalPhone", { length: 32 }).notNull().unique(),
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
});

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
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversationId").notNull(),
  externalId: varchar("externalId", { length: 160 }),
  direction: messageDirectionEnum("direction").notNull(),
  senderType: messageSenderTypeEnum("senderType").notNull(),
  messageType: messageTypeEnum("messageType").default("text").notNull(),
  content: text("content").notNull(),
  status: messageStatusEnum("status").default("received").notNull(),
  provider: whatsappProviderEnum("provider").default("papi").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

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
});

export const professionals = pgTable("professionals", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  specialty: varchar("specialty", { length: 120 }),
  color: varchar("color", { length: 20 }).default("#56d68a").notNull(),
  active: integer("active").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const availability = pgTable("availability", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull(),
  professionalId: integer("professionalId").notNull(),
  weekday: integer("weekday").notNull(),
  startMinute: integer("startMinute").notNull(),
  endMinute: integer("endMinute").notNull(),
  active: integer("active").default(1).notNull(),
});

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
});

export const auditLogs = pgTable("auditLogs", {
  id: serial("id").primaryKey(),
  actorUserId: integer("actorUserId"),
  contactId: integer("contactId"),
  action: varchar("action", { length: 100 }).notNull(),
  summary: varchar("summary", { length: 500 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

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
export type Availability = typeof availability.$inferSelect;
export type InsertAvailability = typeof availability.$inferInsert;
export type Appointment = typeof appointmentsTable.$inferSelect;
export type InsertAppointment = typeof appointmentsTable.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;
