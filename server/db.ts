import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  auditLogs,
  contacts,
  conversations,
  messages,
  users,
  type InsertUser,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] === undefined) continue;
    values[field] = user[field] ?? null;
    updateSet[field] = user[field] ?? null;
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  values.lastSignedIn ??= new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

const seedContacts = [
  { phone: "5511998421104", name: "Juliana Alves", city: "São Paulo", neighborhood: "Vila Mariana", service: "Instalação de chuveiro", urgency: "Alta" as const, stage: "Triagem", aiEnabled: 0, quoteCents: 38000, preview: "Consigo enviar as fotos ainda hoje." },
  { phone: "5511987104522", name: "Marcos Ferreira", city: "São Paulo", neighborhood: "Moema", service: "Quadro elétrico", urgency: "Crítica" as const, stage: "Visita solicitada", aiEnabled: 1, quoteCents: 95000, preview: "A energia caiu novamente no apartamento." },
  { phone: "5511976512088", name: "Renata Costa", city: "São Paulo", neighborhood: "Pinheiros", service: "Tomadas e iluminação", urgency: "Média" as const, stage: "Orçamento enviado", aiEnabled: 1, quoteCents: 62000, preview: "Vou analisar o orçamento com meu marido." },
  { phone: "5511965407721", name: "Paulo Mendes", city: "São Paulo", neighborhood: "Aclimação", service: "Manutenção preventiva", urgency: "Baixa" as const, stage: "Agendado", aiEnabled: 1, quoteCents: 28000, preview: "Perfeito, nos vemos na quinta." },
  { phone: "5511954420190", name: "Camila Souza", city: "São Paulo", neighborhood: "Saúde", service: "Ventilador de teto", urgency: "Média" as const, stage: "Sem retorno", aiEnabled: 0, quoteCents: 43000, preview: "Pode me chamar quando tiver disponibilidade." },
];

const seedMessages = [
  [
    { senderType: "system" as const, direction: "system" as const, content: "Conversa iniciada pelo WhatsApp" },
    { senderType: "lead" as const, direction: "inbound" as const, content: "Oi Gabriel, preciso trocar meu chuveiro. Você atende na Vila Mariana?" },
    { senderType: "ai" as const, direction: "outbound" as const, content: "Olá, Juliana. Atendo sim. Para te orientar melhor, consegue enviar uma foto do ponto de instalação?" },
    { senderType: "lead" as const, direction: "inbound" as const, content: "Consigo enviar as fotos ainda hoje." },
  ],
  [
    { senderType: "lead" as const, direction: "inbound" as const, content: "Bom dia, a energia caiu novamente no apartamento." },
    { senderType: "ai" as const, direction: "outbound" as const, content: "Entendi, Marcos. Vou sinalizar como prioridade. Você está sem energia em todos os cômodos?" },
    { senderType: "lead" as const, direction: "inbound" as const, content: "Sim, e o disjuntor não permanece ligado." },
  ],
  [
    { senderType: "lead" as const, direction: "inbound" as const, content: "Recebi o orçamento, obrigado." },
    { senderType: "human" as const, direction: "outbound" as const, content: "Fico à disposição, Renata. Se quiser, posso explicar cada item por aqui." },
    { senderType: "lead" as const, direction: "inbound" as const, content: "Vou analisar o orçamento com meu marido." },
  ],
  [
    { senderType: "ai" as const, direction: "outbound" as const, content: "Sua manutenção ficou reservada para quinta-feira às 14:00." },
    { senderType: "lead" as const, direction: "inbound" as const, content: "Perfeito, nos vemos na quinta." },
  ],
  [
    { senderType: "lead" as const, direction: "inbound" as const, content: "Pode me chamar quando tiver disponibilidade." },
    { senderType: "system" as const, direction: "system" as const, content: "IA pausada automaticamente após 3 dias sem resposta" },
  ],
];

export async function ensureDemoInbox() {
  const db = await getDb();
  if (!db || process.env.DEMO_MODE === "false") return;
  const existing = await db.select({ id: contacts.id }).from(contacts).limit(1);
  if (existing.length > 0) return;

  for (let index = 0; index < seedContacts.length; index += 1) {
    const seed = seedContacts[index];
    await db.insert(contacts).values({
      externalPhone: seed.phone,
      name: seed.name,
      city: seed.city,
      neighborhood: seed.neighborhood,
      serviceRequested: seed.service,
      urgency: seed.urgency,
      stage: seed.stage,
      aiEnabled: seed.aiEnabled,
      quoteCents: seed.quoteCents,
      unreadCount: index < 2 ? (index === 0 ? 2 : 1) : 0,
      lastMessagePreview: seed.preview,
      lastMessageAt: new Date(),
    });
    const contact = await db.select().from(contacts).where(eq(contacts.externalPhone, seed.phone)).limit(1);
    const contactId = contact[0]?.id;
    if (!contactId) continue;
    await db.insert(conversations).values({
      contactId,
      humanControlled: seed.aiEnabled ? 0 : 1,
      unreadCount: index < 2 ? (index === 0 ? 2 : 1) : 0,
      lastMessageAt: new Date(),
    });
    const conversation = await db.select().from(conversations).where(eq(conversations.contactId, contactId)).limit(1);
    const conversationId = conversation[0]?.id;
    if (!conversationId) continue;
    for (const item of seedMessages[index]) {
      await db.insert(messages).values({
        conversationId,
        direction: item.direction,
        senderType: item.senderType,
        messageType: "text",
        content: item.content,
        status: item.senderType === "system" ? "received" : "sent",
      });
    }
  }
}

export async function listInboxContacts() {
  const db = await getDb();
  if (!db) return [];
  await ensureDemoInbox();
  return db.select().from(contacts).orderBy(desc(contacts.lastMessageAt), desc(contacts.id));
}

export async function getConversationByContact(contactId: number) {
  const db = await getDb();
  if (!db) return undefined;
  await ensureDemoInbox();
  const result = await db.select().from(conversations).where(eq(conversations.contactId, contactId)).limit(1);
  return result[0];
}

export async function listMessagesForContact(contactId: number) {
  const db = await getDb();
  if (!db) return [];
  const conversation = await getConversationByContact(contactId);
  if (!conversation) return [];
  return db.select().from(messages).where(eq(messages.conversationId, conversation.id)).orderBy(messages.createdAt, messages.id);
}

export async function setContactAi(contactId: number, enabled: boolean, actorUserId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(contacts).set({ aiEnabled: enabled ? 1 : 0, updatedAt: new Date() }).where(eq(contacts.id, contactId));
  const conversation = await getConversationByContact(contactId);
  if (conversation) {
    await db.update(conversations).set({ humanControlled: enabled ? 0 : 1, updatedAt: new Date() }).where(eq(conversations.id, conversation.id));
  }
  await db.insert(auditLogs).values({ actorUserId, contactId, action: enabled ? "ai_enabled" : "ai_paused", summary: enabled ? "IA reativada pelo operador" : "IA pausada pelo operador" });
}

export async function sendManualMessage(contactId: number, content: string, actorUserId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const conversation = await getConversationByContact(contactId);
  if (!conversation) throw new Error("Conversation not found");
  const createdAt = new Date();
  await db.insert(messages).values({ conversationId: conversation.id, direction: "outbound", senderType: "human", messageType: "text", content, status: "sent", createdAt });
  await db.update(contacts).set({ aiEnabled: 0, unreadCount: 0, lastMessagePreview: content.slice(0, 500), lastMessageAt: createdAt, updatedAt: createdAt }).where(eq(contacts.id, contactId));
  await db.update(conversations).set({ humanControlled: 1, unreadCount: 0, lastMessageAt: createdAt, updatedAt: createdAt }).where(eq(conversations.id, conversation.id));
  await db.insert(auditLogs).values({ actorUserId, contactId, action: "manual_message_sent", summary: "Mensagem manual enviada em modo demo" });
  const result = await db.select().from(messages).where(and(eq(messages.conversationId, conversation.id), eq(messages.createdAt, createdAt))).orderBy(desc(messages.id)).limit(1);
  return result[0];
}

export async function moveContactStage(contactId: number, stage: string, actorUserId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(contacts).set({ stage, updatedAt: new Date() }).where(eq(contacts.id, contactId));
  await db.insert(auditLogs).values({ actorUserId, contactId, action: "stage_changed", summary: `Lead movido para ${stage}` });
}

export async function getContactById(contactId: number) {
  const db = await getDb();
  if (!db) return undefined;
  await ensureDemoInbox();
  const result = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
  return result[0];
}

export async function getAuditLogForContact(contactId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(auditLogs).where(eq(auditLogs.contactId, contactId)).orderBy(desc(auditLogs.createdAt), desc(auditLogs.id)).limit(20);
}

export async function countContacts() {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ count: sql<number>`count(*)` }).from(contacts);
  return Number(result[0]?.count ?? 0);
}
