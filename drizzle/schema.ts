import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const workspaces = mysqlTable("workspaces", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  segment: varchar("segment", { length: 80 }).default("servicos").notNull(),
  plan: mysqlEnum("plan", ["starter", "pro", "business"]).default("starter").notNull(),
  timezone: varchar("timezone", { length: 64 }).default("America/Sao_Paulo").notNull(),
  active: int("active").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const workspaceMembers = mysqlTable("workspaceMembers", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["owner", "admin", "manager", "agent"]).default("agent").notNull(),
  active: int("active").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const workspaceSettings = mysqlTable("workspaceSettings", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  key: varchar("key", { length: 100 }).notNull(),
  value: text("value"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const apiIdempotency = mysqlTable("apiIdempotency", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId"),
  key: varchar("key", { length: 180 }).notNull().unique(),
  fingerprint: varchar("fingerprint", { length: 128 }).notNull(),
  statusCode: int("statusCode").default(200).notNull(),
  responseBody: text("responseBody"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const webhookEvents = mysqlTable("webhookEvents", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId"),
  eventId: varchar("eventId", { length: 180 }).notNull().unique(),
  provider: varchar("provider", { length: 60 }).default("whatsapp").notNull(),
  payload: text("payload").notNull(),
  status: mysqlEnum("status", ["received", "processed", "failed"]).default("received").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  processedAt: timestamp("processedAt"),
});

export const contacts = mysqlTable("contacts", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId"),
  externalPhone: varchar("externalPhone", { length: 32 }).notNull().unique(),
  name: varchar("name", { length: 160 }).notNull(),
  city: varchar("city", { length: 100 }),
  neighborhood: varchar("neighborhood", { length: 100 }),
  serviceRequested: varchar("serviceRequested", { length: 180 }),
  urgency: mysqlEnum("urgency", ["Baixa", "Média", "Alta", "Crítica"]).default("Média").notNull(),
  stage: varchar("stage", { length: 80 }).default("Novo contato").notNull(),
  aiEnabled: int("aiEnabled").default(1).notNull(),
  quoteCents: int("quoteCents").default(0).notNull(),
  unreadCount: int("unreadCount").default(0).notNull(),
  lastMessagePreview: varchar("lastMessagePreview", { length: 500 }),
  lastMessageAt: timestamp("lastMessageAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const conversations = mysqlTable("conversations", {
  id: int("id").autoincrement().primaryKey(),
  contactId: int("contactId").notNull(),
  status: mysqlEnum("status", ["open", "resolved"]).default("open").notNull(),
  humanControlled: int("humanControlled").default(0).notNull(),
  lastMessageAt: timestamp("lastMessageAt"),
  unreadCount: int("unreadCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  externalId: varchar("externalId", { length: 160 }),
  direction: mysqlEnum("direction", ["inbound", "outbound", "system"]).notNull(),
  senderType: mysqlEnum("senderType", ["lead", "ai", "human", "system"]).notNull(),
  messageType: mysqlEnum("messageType", ["text", "image", "audio", "video", "document"]).default("text").notNull(),
  content: text("content").notNull(),
  status: mysqlEnum("status", ["received", "queued", "sent", "failed"]).default("received").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const services = mysqlTable("services", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description"),
  durationMinutes: int("durationMinutes").default(60).notNull(),
  priceCents: int("priceCents").default(0).notNull(),
  active: int("active").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const professionals = mysqlTable("professionals", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  specialty: varchar("specialty", { length: 120 }),
  color: varchar("color", { length: 20 }).default("#56d68a").notNull(),
  active: int("active").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const availability = mysqlTable("availability", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  professionalId: int("professionalId").notNull(),
  weekday: int("weekday").notNull(),
  startMinute: int("startMinute").notNull(),
  endMinute: int("endMinute").notNull(),
  active: int("active").default(1).notNull(),
});

export const appointmentsTable = mysqlTable("appointments", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  contactId: int("contactId"),
  serviceId: int("serviceId").notNull(),
  professionalId: int("professionalId").notNull(),
  startsAt: timestamp("startsAt").notNull(),
  endsAt: timestamp("endsAt").notNull(),
  status: mysqlEnum("status", ["requested", "confirmed", "cancelled", "completed", "no_show"]).default("requested").notNull(),
  notes: varchar("notes", { length: 500 }),
  source: varchar("source", { length: 40 }).default("panel").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const auditLogs = mysqlTable("auditLogs", {
  id: int("id").autoincrement().primaryKey(),
  actorUserId: int("actorUserId"),
  contactId: int("contactId"),
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
export type Contact = typeof contacts.$inferSelect;
export type InsertContact = typeof contacts.$inferInsert;
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
