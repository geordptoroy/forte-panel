import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import {
  contacts,
  conversations,
  domainEvents,
  messages,
  whatsappInstances,
  workspaces,
} from "../drizzle/schema";
import {
  getDb,
  ingestInboundWhatsApp,
  listInboxContacts,
  listMessagesForContact,
} from "./db";

const hasDatabase = Boolean(
  process.env.DATABASE_URL && /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL)
);

describe.skipIf(!hasDatabase)("Inbox instance filter isolation", () => {
  const suffix = `instance${Date.now()}`;
  const instanceA1 = `filter-a1-${suffix}`;
  const instanceA2 = `filter-a2-${suffix}`;
  const instanceB1 = `filter-b1-${suffix}`;
  const phoneA = `551199${suffix.slice(-8)}`;
  const phoneB = `551188${suffix.slice(-8)}`;
  const phoneExisting = `551166${suffix.slice(-8)}`;
  const phoneFromMe = `551177${suffix.slice(-8)}`;
  let workspaceAId = 0;
  let workspaceBId = 0;
  let contactAId = 0;
  let contactBId = 0;
  let existingContactId = 0;
  let conversationAId = 0;
  let conversationBId = 0;
  let existingConversationId = 0;
  let fromMeContactId = 0;
  let fromMeConversationId = 0;
  const messageIds: number[] = [];

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const insertedWorkspaces = await db
      .insert(workspaces)
      .values([
        { name: `Instance A ${suffix}`, slug: `instance-a-${suffix}` },
        { name: `Instance B ${suffix}`, slug: `instance-b-${suffix}` },
      ])
      .returning({ id: workspaces.id });
    workspaceAId = insertedWorkspaces[0]!.id;
    workspaceBId = insertedWorkspaces[1]!.id;

    await db.insert(whatsappInstances).values([
      {
        workspaceId: workspaceAId,
        provider: "baileys",
        instanceId: instanceA1,
        name: "A principal",
        status: "connected",
        active: 1,
      },
      {
        workspaceId: workspaceAId,
        provider: "baileys",
        instanceId: instanceA2,
        name: "A secundária",
        status: "connected",
        active: 1,
      },
      {
        workspaceId: workspaceBId,
        provider: "baileys",
        instanceId: instanceB1,
        name: "B privada",
        status: "connected",
        active: 1,
      },
    ]);

    const insertedContacts = await db
      .insert(contacts)
      .values([
        {
          workspaceId: workspaceAId,
          externalPhone: phoneA,
          name: "Contato A",
          lastMessagePreview: "Legada",
        },
        {
          workspaceId: workspaceBId,
          externalPhone: phoneB,
          name: "Contato B",
          lastMessagePreview: "Somente workspace B",
        },
        {
          workspaceId: workspaceAId,
          externalPhone: phoneExisting,
          name: "Contato existente",
          aiEnabled: 1,
          unreadCount: 1,
          lastMessagePreview: "Entrada anterior",
        },
      ])
      .returning({ id: contacts.id });
    contactAId = insertedContacts[0]!.id;
    contactBId = insertedContacts[1]!.id;
    existingContactId = insertedContacts[2]!.id;

    const insertedConversations = await db
      .insert(conversations)
      .values([
        { contactId: contactAId },
        { contactId: contactBId },
        {
          contactId: existingContactId,
          humanControlled: 0,
          unreadCount: 1,
        },
      ])
      .returning({ id: conversations.id });
    conversationAId = insertedConversations[0]!.id;
    conversationBId = insertedConversations[1]!.id;
    existingConversationId = insertedConversations[2]!.id;

    const baseTime = Date.now() - 60_000;
    const insertedMessages = await db
      .insert(messages)
      .values([
        {
          conversationId: conversationAId,
          direction: "inbound",
          senderType: "lead",
          provider: "baileys",
          content: "Mensagem da instância A1",
          metadata: { instanceId: instanceA1, provider: "baileys" },
          createdAt: new Date(baseTime),
        },
        {
          conversationId: conversationAId,
          direction: "inbound",
          senderType: "lead",
          provider: "baileys",
          content: "Mensagem da instância A2",
          metadata: { instanceId: instanceA2, provider: "baileys" },
          createdAt: new Date(baseTime + 1_000),
        },
        {
          conversationId: conversationAId,
          direction: "inbound",
          senderType: "lead",
          provider: "baileys",
          content: "Mensagem legada sem origem",
          metadata: null,
          createdAt: new Date(baseTime + 2_000),
        },
        {
          conversationId: conversationAId,
          direction: "inbound",
          senderType: "lead",
          provider: "baileys",
          content: "Não exibir: origem do workspace B",
          metadata: { instanceId: instanceB1, provider: "baileys" },
          createdAt: new Date(baseTime + 2_500),
        },
        {
          conversationId: conversationBId,
          direction: "inbound",
          senderType: "lead",
          provider: "baileys",
          content: "Segredo workspace B",
          metadata: { instanceId: instanceB1, provider: "baileys" },
          createdAt: new Date(baseTime + 3_000),
        },
        {
          conversationId: existingConversationId,
          direction: "inbound",
          senderType: "lead",
          provider: "baileys",
          content: "Entrada anterior",
          metadata: { instanceId: instanceA2, provider: "baileys" },
          createdAt: new Date(baseTime + 4_000),
        },
      ])
      .returning({ id: messages.id });
    messageIds.push(...insertedMessages.map(row => row.id));
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    if (workspaceAId || workspaceBId)
      await db
        .delete(domainEvents)
        .where(inArray(domainEvents.workspaceId, [workspaceAId, workspaceBId].filter(Boolean)));
    const conversationIds = [
      conversationAId,
      conversationBId,
      existingConversationId,
      fromMeConversationId,
    ].filter(Boolean);
    if (conversationIds.length)
      await db.delete(messages).where(inArray(messages.conversationId, conversationIds));
    const contactIds = [
      contactAId,
      contactBId,
      existingContactId,
      fromMeContactId,
    ].filter(Boolean);
    if (contactIds.length)
      await db.delete(conversations).where(inArray(conversations.contactId, contactIds));
    if (contactIds.length)
      await db.delete(contacts).where(inArray(contacts.id, contactIds));
    if (workspaceAId || workspaceBId)
      await db
        .delete(whatsappInstances)
        .where(inArray(whatsappInstances.workspaceId, [workspaceAId, workspaceBId].filter(Boolean)));
    if (workspaceAId || workspaceBId)
      await db
        .delete(workspaces)
        .where(inArray(workspaces.id, [workspaceAId, workspaceBId].filter(Boolean)));
    void messageIds;
  });

  it("filters thread history and previews by one or several instances; All retains legacy rows", async () => {
    const onlyA1 = await listMessagesForContact(workspaceAId, contactAId, {
      instanceIds: [instanceA1],
    });
    expect(onlyA1.map(message => message.content)).toEqual([
      "Mensagem da instância A1",
    ]);

    const both = await listMessagesForContact(workspaceAId, contactAId, {
      instanceIds: [instanceA1, instanceA2],
    });
    expect(both.map(message => message.content)).toEqual([
      "Mensagem da instância A1",
      "Mensagem da instância A2",
    ]);

    const allMessages = await listMessagesForContact(workspaceAId, contactAId);
    expect(allMessages.map(message => message.content)).toContain(
      "Mensagem legada sem origem"
    );
    expect(allMessages.map(message => message.content)).not.toContain(
      "Não exibir: origem do workspace B"
    );

    const a1Contacts = await listInboxContacts(workspaceAId, undefined, [instanceA1]);
    expect(a1Contacts.find(contact => contact.id === contactAId)?.lastMessagePreview).toBe(
      "Mensagem da instância A1"
    );
    const allAContacts = await listInboxContacts(workspaceAId);
    expect(allAContacts.map(contact => contact.id)).toContain(contactAId);
    expect(allAContacts.map(contact => contact.id)).not.toContain(contactBId);
  });

  it("stores a manual fromMe text as a human outbound message and pauses AI without a received-agent event", async () => {
    const eventId = `manual-fromme-${suffix}`;
    await ingestInboundWhatsApp(workspaceAId, {
      eventId,
      phone: phoneFromMe,
      name: "Atendimento próprio",
      content: "oi",
      messageType: "text",
      fromMe: true,
      metadata: {
        provider: "baileys",
        instanceId: instanceA1,
        jid: `${phoneFromMe}@s.whatsapp.net`,
      },
    });

    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const contact = (
      await db
        .select()
        .from(contacts)
        .where(and(eq(contacts.workspaceId, workspaceAId), eq(contacts.externalPhone, phoneFromMe)))
        .limit(1)
    )[0]!;
    fromMeContactId = contact.id;
    expect(contact.aiEnabled).toBe(0);
    expect(contact.unreadCount).toBe(0);

    const conversation = (
      await db
        .select()
        .from(conversations)
        .where(eq(conversations.contactId, fromMeContactId))
        .limit(1)
    )[0]!;
    fromMeConversationId = conversation.id;
    expect(conversation.humanControlled).toBe(1);
    expect(conversation.unreadCount).toBe(0);

    const stored = (
      await db
        .select()
        .from(messages)
        .where(and(eq(messages.conversationId, fromMeConversationId), eq(messages.externalId, eventId)))
        .limit(1)
    )[0]!;
    expect(stored).toMatchObject({
      direction: "outbound",
      senderType: "human",
      messageType: "text",
      content: "oi",
    });
    expect(stored.metadata).toMatchObject({ instanceId: instanceA1 });

    const receivedEvent = await db
      .select({ id: domainEvents.id })
      .from(domainEvents)
      .where(
        and(
          eq(domainEvents.workspaceId, workspaceAId),
          eq(domainEvents.eventKey, `message.received:${eventId}`)
        )
      )
      .limit(1);
    expect(receivedEvent).toHaveLength(0);
    await ingestInboundWhatsApp(workspaceAId, {
      eventId: `manual-existing-fromme-${suffix}`,
      phone: phoneExisting,
      content: "resposta manual numa conversa existente",
      messageType: "text",
      fromMe: true,
      metadata: {
        provider: "baileys",
        instanceId: instanceA2,
        jid: `${phoneExisting}@s.whatsapp.net`,
      },
    });
    const existingContact = (
      await db
        .select()
        .from(contacts)
        .where(eq(contacts.id, existingContactId))
        .limit(1)
    )[0]!;
    const existingConversation = (
      await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, existingConversationId))
        .limit(1)
    )[0]!;
    expect(existingContact).toMatchObject({ aiEnabled: 0, unreadCount: 0 });
    expect(existingConversation).toMatchObject({
      humanControlled: 1,
      unreadCount: 0,
    });
  });
});
