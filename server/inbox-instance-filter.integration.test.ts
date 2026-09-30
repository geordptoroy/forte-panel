import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import {
  auditLogs,
  contacts,
  conversations,
  domainEvents,
  leads,
  messages,
  opportunities,
  opportunityFollowUps,
  users,
  whatsappGroupParticipants,
  whatsappGroups,
  whatsappInstances,
  workspaceMembers,
  workspaces,
} from "../drizzle/schema";
import {
  getDb,
  getConversationByContact,
  ingestInboundWhatsApp,
  listInboxContacts,
  listInboxAssignableMembers,
  listMessagesForContact,
  assignInboxOpportunity,
  completeOpportunityNextAction,
  setOpportunityNextAction,
  moveContactStage,
  queueOutboundMessage,
  renameContact,
  sendManualMessage,
  upsertApiContact,
} from "./db";
import { setMemberProfile } from "./workspace";

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
  const phoneIgnored = `551155${suffix.slice(-8)}`;
  const phoneHistorical = `551133${suffix.slice(-8)}`;
  const phoneForeignInstance = `551144${suffix.slice(-8)}`;
  const phoneLiveLead = `551222${suffix.slice(-8)}`;
  const phoneApiLead = `551223${suffix.slice(-8)}`;
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
  const groupContactIds: number[] = [];
  const groupConversationIds: number[] = [];
  const messageIds: number[] = [];
  const testMemberUserIds: number[] = [];

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
    const workspaceIds = [workspaceAId, workspaceBId].filter(Boolean);
    if (workspaceAId || workspaceBId)
      await db
        .delete(domainEvents)
        .where(inArray(domainEvents.workspaceId, [workspaceAId, workspaceBId].filter(Boolean)));
    if (workspaceAId || workspaceBId)
      await db
        .delete(auditLogs)
        .where(inArray(auditLogs.workspaceId, [workspaceAId, workspaceBId].filter(Boolean)));
    const tenantContacts = workspaceIds.length
      ? await db
          .select({ id: contacts.id })
          .from(contacts)
          .where(inArray(contacts.workspaceId, workspaceIds))
      : [];
    const contactIds = Array.from(new Set([
      ...[
        contactAId,
        contactBId,
        existingContactId,
        fromMeContactId,
        ...groupContactIds,
      ].filter(Boolean),
      ...tenantContacts.map(contact => contact.id),
    ]));
    const tenantConversations = contactIds.length
      ? await db
          .select({ id: conversations.id })
          .from(conversations)
          .where(inArray(conversations.contactId, contactIds))
      : [];
    const conversationIds = Array.from(new Set([
      ...[
      conversationAId,
      conversationBId,
      existingConversationId,
      fromMeConversationId,
      ...groupConversationIds,
      ].filter(Boolean),
      ...tenantConversations.map(conversation => conversation.id),
    ]));
    if (conversationIds.length)
      await db.delete(messages).where(inArray(messages.conversationId, conversationIds));
    if (workspaceIds.length)
      await db
        .delete(opportunities)
        .where(inArray(opportunities.workspaceId, workspaceIds));
    if (workspaceIds.length)
      await db
        .delete(workspaceMembers)
        .where(inArray(workspaceMembers.workspaceId, workspaceIds));
    if (testMemberUserIds.length)
      await db.delete(users).where(inArray(users.id, testMemberUserIds));
    if (workspaceIds.length)
      await db.delete(leads).where(inArray(leads.workspaceId, workspaceIds));
    if (contactIds.length)
      await db.delete(conversations).where(inArray(conversations.contactId, contactIds));
    if (contactIds.length)
      await db.delete(contacts).where(inArray(contacts.id, contactIds));
    if (workspaceAId || workspaceBId) {
      const groupRows = await db
        .select({ id: whatsappGroups.id })
        .from(whatsappGroups)
        .where(
          inArray(
            whatsappGroups.workspaceId,
            [workspaceAId, workspaceBId].filter(Boolean)
          )
        );
      const ids = groupRows.map(row => row.id);
      if (ids.length) {
        await db
          .delete(whatsappGroupParticipants)
          .where(inArray(whatsappGroupParticipants.groupId, ids));
        await db.delete(whatsappGroups).where(inArray(whatsappGroups.id, ids));
      }
    }
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
        upsertType: "notify",
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
    expect(
      await db
        .select({ id: leads.id })
        .from(leads)
        .where(
          and(
            eq(leads.workspaceId, workspaceAId),
            eq(leads.contactId, contact.id)
          )
        )
    ).toHaveLength(0);

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
        upsertType: "notify",
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

    await renameContact(workspaceAId, contactAId, "Nome real do lead");
    await ingestInboundWhatsApp(workspaceAId, {
      eventId: `push-name-after-rename-${suffix}`,
      phone: phoneA,
      name: "Push name atualizado",
      content: "nova mensagem depois da correção do nome",
      metadata: {
        provider: "baileys",
        instanceId: instanceA1,
        jid: `${phoneA}@s.whatsapp.net`,
      },
    });
    const renamedContact = (
      await db.select().from(contacts).where(eq(contacts.id, contactAId)).limit(1)
    )[0]!;
    expect(renamedContact).toMatchObject({
      name: "Nome real do lead",
      pushName: "Push name atualizado",
      nameSource: "manual",
    });
  });

  it("ignores Baileys history and unknown text placeholders without creating a lead", async () => {
    const history = await ingestInboundWhatsApp(workspaceAId, {
      eventId: `history-append-${suffix}`,
      phone: phoneIgnored,
      name: "Histórico antigo",
      content: "oi",
      messageType: "text",
      fromMe: true,
      metadata: {
        provider: "baileys",
        instanceId: instanceA1,
        jid: `${phoneIgnored}@s.whatsapp.net`,
        upsertType: "append",
      },
    });
    expect(history).toMatchObject({
      ignored: true,
      reason: "non_live_baileys_event",
    });

    const placeholder = await ingestInboundWhatsApp(workspaceAId, {
      eventId: `placeholder-text-${suffix}`,
      phone: phoneIgnored,
      name: "Conteúdo desconhecido",
      content: "[mensagem recebida]",
      messageType: "text",
      fromMe: true,
      metadata: {
        provider: "baileys",
        instanceId: instanceA1,
        jid: `${phoneIgnored}@s.whatsapp.net`,
        upsertType: "notify",
        isPlaceholder: true,
      },
    });
    expect(placeholder).toMatchObject({
      ignored: true,
      reason: "empty_or_unrecognized_baileys_payload",
    });

    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const contactsCreated = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.workspaceId, workspaceAId),
          eq(contacts.externalPhone, phoneIgnored)
        )
      );
    expect(contactsCreated).toHaveLength(0);
  });

  it("imports history idempotently without unread, takeover or AI domain events", async () => {
    const input = {
      eventId: `history-import-${suffix}`,
      phone: phoneHistorical,
      name: "Contato histórico",
      content: "mensagem antiga",
      messageType: "text" as const,
      fromMe: true,
      receivedAt: new Date("2026-09-01T12:00:00.000Z"),
      metadata: {
        provider: "baileys",
        instanceId: instanceA1,
        jid: `${phoneHistorical}@s.whatsapp.net`,
        upsertType: "append",
        historySync: true,
      },
    };
    const first = await ingestInboundWhatsApp(workspaceAId, input);
    const second = await ingestInboundWhatsApp(workspaceAId, input);
    expect(first).toMatchObject({ duplicate: false });
    expect(second).toMatchObject({ duplicate: true });
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const contact = (
      await db
        .select()
        .from(contacts)
        .where(
          and(eq(contacts.workspaceId, workspaceAId), eq(contacts.externalPhone, phoneHistorical))
        )
        .limit(1)
    )[0]!;
    const conversation = (
      await db
        .select()
        .from(conversations)
        .where(eq(conversations.contactId, contact.id))
        .limit(1)
    )[0]!;
    expect(contact).toMatchObject({ aiEnabled: 1, unreadCount: 0 });
    expect(conversation).toMatchObject({ humanControlled: 0, unreadCount: 0 });
    expect(
      await db
        .select({ id: leads.id })
        .from(leads)
        .where(
          and(
            eq(leads.workspaceId, workspaceAId),
            eq(leads.contactId, contact.id)
          )
        )
    ).toHaveLength(0);
    expect(
      await db.select({ id: messages.id }).from(messages).where(eq(messages.externalId, input.eventId))
    ).toHaveLength(1);
    expect(
      await db
        .select({ id: domainEvents.id })
        .from(domainEvents)
        .where(eq(domainEvents.eventKey, `message.received:${input.eventId}`))
    ).toHaveLength(0);
  });

  it("rejects individual Baileys messages from an instance owned by another workspace", async () => {
    await expect(
      ingestInboundWhatsApp(workspaceAId, {
        eventId: `foreign-instance-message-${suffix}`,
        phone: phoneForeignInstance,
        content: "Mensagem de instância alheia",
        messageType: "text",
        metadata: {
          provider: "baileys",
          instanceId: instanceB1,
          jid: `${phoneForeignInstance}@s.whatsapp.net`,
          upsertType: "notify",
        },
      })
    ).rejects.toThrow("Baileys instance is not active or owned by this workspace");

    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const foreignContact = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.workspaceId, workspaceAId),
          eq(contacts.externalPhone, phoneForeignInstance)
        )
      );
    expect(foreignContact).toHaveLength(0);
  });

  it("persists Baileys groups by instance, tracks authors, and never sends them to AI", async () => {
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const groupJid = `120363${suffix.slice(-8)}@g.us`;
    const groupSubject = "Reforma 2026";
    const addGroupMessage = (
      eventId: string,
      instanceId: string,
      authorJid: string,
      authorName: string,
      content: string
    ) =>
      ingestInboundWhatsApp(workspaceAId, {
        eventId,
        phone: groupJid,
        name: groupSubject,
        content,
        messageType: "text",
        metadata: {
          provider: "baileys",
          instanceId,
          jid: groupJid,
          groupJid,
          groupSubject,
          isGroup: true,
          authorJid,
          authorName,
        },
      });

    await addGroupMessage(
      `group-ana-${suffix}`,
      instanceA1,
      `55110001@s.whatsapp.net`,
      "Ana",
      "Alguém consegue ver o orçamento?"
    );
    await addGroupMessage(
      `group-bruno-${suffix}`,
      instanceA1,
      `55110002@s.whatsapp.net`,
      "Bruno",
      "Vou verificar"
    );
    await addGroupMessage(
      `group-other-instance-${suffix}`,
      instanceA2,
      `55110001@s.whatsapp.net`,
      "Ana",
      "Mensagem pela outra sessão"
    );

    const groups = await db
      .select()
      .from(whatsappGroups)
      .where(and(eq(whatsappGroups.workspaceId, workspaceAId), eq(whatsappGroups.jid, groupJid)));
    expect(groups).toHaveLength(2);
    const groupA1 = groups.find(group => group.instanceId === instanceA1)!;
    const groupA2 = groups.find(group => group.instanceId === instanceA2)!;
    expect(groupA1.subject).toBe(groupSubject);

    const participants = await db
      .select()
      .from(whatsappGroupParticipants)
      .where(eq(whatsappGroupParticipants.groupId, groupA1.id));
    expect(participants.map(participant => participant.name).sort()).toEqual([
      "Ana",
      "Bruno",
    ]);

    const groupContactA1 = (
      await db.select().from(contacts).where(eq(contacts.groupId, groupA1.id)).limit(1)
    )[0]!;
    const groupContactA2 = (
      await db.select().from(contacts).where(eq(contacts.groupId, groupA2.id)).limit(1)
    )[0]!;
    groupContactIds.push(groupContactA1.id, groupContactA2.id);
    expect(
      await db
        .select({ id: leads.id })
        .from(leads)
        .where(
          and(
            eq(leads.workspaceId, workspaceAId),
            inArray(leads.contactId, [groupContactA1.id, groupContactA2.id])
          )
        )
    ).toHaveLength(0);
    expect(groupContactA1).toMatchObject({
      name: groupSubject,
      aiEnabled: 0,
      nameSource: "auto",
    });
    expect(groupContactA2.id).not.toBe(groupContactA1.id);
    await expect(
      renameContact(workspaceAId, groupContactA1.id, "Nome CRM para grupo")
    ).rejects.toThrow("Lead não encontrado");

    const groupConversationA1 = (
      await db
        .select()
        .from(conversations)
        .where(eq(conversations.contactId, groupContactA1.id))
        .limit(1)
    )[0]!;
    const groupConversationA2 = (
      await db
        .select()
        .from(conversations)
        .where(eq(conversations.contactId, groupContactA2.id))
        .limit(1)
    )[0]!;
    groupConversationIds.push(groupConversationA1.id, groupConversationA2.id);
    expect(groupConversationA1.humanControlled).toBe(1);

    const visibleA1 = await listMessagesForContact(
      workspaceAId,
      groupContactA1.id,
      { instanceIds: [instanceA1] }
    );
    expect(visibleA1.map(message => message.content)).toEqual([
      "Alguém consegue ver o orçamento?",
      "Vou verificar",
    ]);
    expect(visibleA1[0]?.metadata).toMatchObject({
      isGroup: true,
      groupJid,
      authorJid: "55110001@s.whatsapp.net",
      authorName: "Ana",
    });
    const groupInbox = await listInboxContacts(
      workspaceAId,
      undefined,
      [instanceA1],
      true
    );
    const groupContactDto = groupInbox.find(
      contact => contact.id === groupContactA1.id
    );
    expect(groupContactDto).toMatchObject({
      isGroup: true,
      groupSubject,
      groupInstanceId: instanceA1,
      groupParticipantCount: 2,
    });
    expect(
      groupContactDto?.groupParticipants.map(participant => participant.name).sort()
    ).toEqual(["Ana", "Bruno"]);
    expect(groupInbox.map(contact => contact.id)).not.toContain(
      groupContactA2.id
    );
    const crmContacts = await listInboxContacts(workspaceAId);
    expect(crmContacts.map(contact => contact.id)).not.toContain(groupContactA1.id);
    const groupReply = await sendManualMessage(
      workspaceAId,
      groupContactA1.id,
      "Resposta no grupo",
      undefined,
      "text",
      undefined,
      [instanceA1]
    );
    expect(groupReply).toMatchObject({
      provider: "baileys",
      direction: "outbound",
      metadata: {
        instanceId: instanceA1,
        jid: groupJid,
        routingSource: "inbound_origin",
      },
    });
    const visibleA2Contacts = await listInboxContacts(
      workspaceAId,
      undefined,
      [instanceA2],
      true
    );
    expect(visibleA2Contacts.map(contact => contact.id)).toContain(groupContactA2.id);
    expect(visibleA2Contacts.map(contact => contact.id)).not.toContain(groupContactA1.id);

    const receivedEvents = await db
      .select({ id: domainEvents.id })
      .from(domainEvents)
      .where(
        and(
          eq(domainEvents.workspaceId, workspaceAId),
          inArray(domainEvents.eventKey, [
            `message.received:group-ana-${suffix}`,
            `message.received:group-bruno-${suffix}`,
            `message.received:group-other-instance-${suffix}`,
          ])
        )
      );
    expect(receivedEvents).toHaveLength(0);
  });

  it("creates one workspace-scoped Lead and linked Opportunity for live inbound", async () => {
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const firstAt = new Date("2026-09-30T00:00:00.000Z");
    const firstInput = {
      eventId: `lead-live-${suffix}`,
      phone: phoneLiveLead,
      name: "Novo lead comercial",
      content: "Olá, gostaria de um orçamento",
      messageType: "text" as const,
      receivedAt: firstAt,
      metadata: {
        provider: "baileys",
        instanceId: instanceA1,
        jid: `${phoneLiveLead}@s.whatsapp.net`,
        upsertType: "notify",
      },
    };
    const first = await ingestInboundWhatsApp(workspaceAId, firstInput);
    if (
      !("leadId" in first) ||
      typeof first.leadId !== "number" ||
      !("opportunityId" in first) ||
      typeof first.opportunityId !== "number" ||
      !("opportunityStage" in first)
    )
      throw new Error("Live inbound did not return its Lead/Opportunity link");
    const leadId = first.leadId;
    const opportunityId = first.opportunityId;
    expect(first.opportunityStage).toBe("Novo contato");

    const duplicate = await ingestInboundWhatsApp(workspaceAId, firstInput);
    expect(duplicate).toMatchObject({ duplicate: true });
    const secondAt = new Date(firstAt.getTime() + 5_000);
    const second = await ingestInboundWhatsApp(workspaceAId, {
      ...firstInput,
      eventId: `lead-live-follow-up-${suffix}`,
      content: "Também posso enviar fotos do serviço",
      receivedAt: secondAt,
    });
    if (
      !("leadId" in second) ||
      second.leadId !== leadId ||
      !("opportunityId" in second) ||
      second.opportunityId !== opportunityId
    )
      throw new Error("A repeat inbound created a second Lead/Opportunity");

    const contact = (
      await db
        .select()
        .from(contacts)
        .where(
          and(
            eq(contacts.workspaceId, workspaceAId),
            eq(contacts.externalPhone, phoneLiveLead)
          )
        )
        .limit(1)
    )[0]!;
    const leadRows = await db
      .select()
      .from(leads)
      .where(
        and(
          eq(leads.workspaceId, workspaceAId),
          eq(leads.contactId, contact.id)
        )
      );
    expect(leadRows).toHaveLength(1);
    expect(leadRows[0]).toMatchObject({ id: leadId, source: "whatsapp" });
    expect(leadRows[0]?.lastActivityAt?.getTime()).toBe(secondAt.getTime());

    const opportunityRows = await db
      .select()
      .from(opportunities)
      .where(
        and(
          eq(opportunities.workspaceId, workspaceAId),
          eq(opportunities.leadId, leadId)
        )
      );
    expect(opportunityRows).toHaveLength(1);
    expect(opportunityRows[0]).toMatchObject({
      id: opportunityId,
      stage: "Novo contato",
    });
    const conversation = await getConversationByContact(
      workspaceAId,
      contact.id
    );
    expect(conversation).toMatchObject({
      opportunityId,
      opportunityStage: "Novo contato",
    });
    const inboxBeforeMove = await listInboxContacts(workspaceAId);
    expect(inboxBeforeMove.find(row => row.id === contact.id)).toMatchObject({
      leadId,
      opportunityId,
      opportunityStage: "Novo contato",
    });

    await moveContactStage(workspaceAId, contact.id, "Em atendimento");
    const updatedContact = (
      await db.select().from(contacts).where(eq(contacts.id, contact.id)).limit(1)
    )[0]!;
    const updatedOpportunity = (
      await db
        .select()
        .from(opportunities)
        .where(eq(opportunities.id, opportunityId))
        .limit(1)
    )[0]!;
    expect(updatedContact.stage).toBe("Em atendimento");
    expect(updatedOpportunity.stage).toBe("Em atendimento");
    const inboxAfterMove = await listInboxContacts(workspaceAId);
    expect(inboxAfterMove.find(row => row.id === contact.id)?.opportunityStage).toBe(
      "Em atendimento"
    );

    const otherWorkspace = await ingestInboundWhatsApp(workspaceBId, {
      ...firstInput,
      eventId: `lead-live-other-workspace-${suffix}`,
      metadata: {
        provider: "baileys",
        instanceId: instanceB1,
        jid: `${phoneLiveLead}@s.whatsapp.net`,
        upsertType: "notify",
      },
    });
    if (
      !("leadId" in otherWorkspace) ||
      typeof otherWorkspace.leadId !== "number" ||
      !("opportunityId" in otherWorkspace) ||
      typeof otherWorkspace.opportunityId !== "number"
    )
      throw new Error("Second workspace did not receive its own commercial records");
    expect(otherWorkspace.leadId).not.toBe(leadId);
    expect(otherWorkspace.opportunityId).not.toBe(opportunityId);
    const otherContact = (
      await db
        .select()
        .from(contacts)
        .where(
          and(
            eq(contacts.workspaceId, workspaceBId),
            eq(contacts.externalPhone, phoneLiveLead)
          )
        )
        .limit(1)
    )[0]!;
    expect(
      await db
        .select({ id: leads.id })
        .from(leads)
        .where(
          and(
            eq(leads.workspaceId, workspaceBId),
            eq(leads.contactId, otherContact.id)
          )
        )
    ).toHaveLength(1);
    const apiContact = await upsertApiContact(workspaceAId, {
      phone: phoneApiLead,
      name: "Lead de integração API",
    });
    if (!apiContact) throw new Error("API contact upsert returned no contact");
    const apiLead = (
      await db
        .select()
        .from(leads)
        .where(
          and(
            eq(leads.workspaceId, workspaceAId),
            eq(leads.contactId, apiContact.id)
          )
        )
        .limit(1)
    )[0]!;
    const apiOpportunity = (
      await db
        .select()
        .from(opportunities)
        .where(
          and(
            eq(opportunities.workspaceId, workspaceAId),
            eq(opportunities.leadId, apiLead.id)
          )
        )
        .limit(1)
    )[0]!;
    expect(apiLead.source).toBe("api");
    await queueOutboundMessage(
      workspaceAId,
      apiContact.id,
      "Contato iniciado pelo time",
      "baileys",
      "human"
    );
    const apiConversation = await getConversationByContact(
      workspaceAId,
      apiContact.id
    );
    expect(apiConversation?.opportunityId).toBe(apiOpportunity.id);
  });

  it("assigns an active member and persists one workspace-scoped next action", async () => {
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const insertedUsers = await db
      .insert(users)
      .values([
        { openId: `o32-a-${suffix}`, name: "Agente O3.2 A", loginMethod: "test" },
        { openId: `o32-b-${suffix}`, name: "Agente O3.2 B", loginMethod: "test" },
        { openId: `o32-inactive-${suffix}`, name: "Agente inativo", loginMethod: "test" },
      ])
      .returning({ id: users.id });
    testMemberUserIds.push(...insertedUsers.map(user => user.id));
    const insertedMembers = await db
      .insert(workspaceMembers)
      .values([
        {
          workspaceId: workspaceAId,
          userId: insertedUsers[0]!.id,
          role: "manager",
          active: 1,
        },
        {
          workspaceId: workspaceBId,
          userId: insertedUsers[1]!.id,
          role: "manager",
          active: 1,
        },
        {
          workspaceId: workspaceAId,
          userId: insertedUsers[2]!.id,
          role: "agent",
          active: 0,
        },
      ])
      .returning({ id: workspaceMembers.id });
    const memberAId = insertedMembers[0]!.id;
    const memberBId = insertedMembers[1]!.id;
    const inactiveMemberAId = insertedMembers[2]!.id;
    const phone = `551225${suffix.slice(-8)}`;
    const inbound = {
      phone,
      name: "Lead O3.2",
      content: "Preciso de um orçamento",
      messageType: "text" as const,
      receivedAt: new Date(),
    };
    await ingestInboundWhatsApp(workspaceAId, {
      ...inbound,
      eventId: `o32-workspace-a-${suffix}`,
      metadata: {
        provider: "baileys",
        instanceId: instanceA1,
        jid: `${phone}@s.whatsapp.net`,
        upsertType: "notify",
      },
    });
    await ingestInboundWhatsApp(workspaceBId, {
      ...inbound,
      eventId: `o32-workspace-b-${suffix}`,
      metadata: {
        provider: "baileys",
        instanceId: instanceB1,
        jid: `${phone}@s.whatsapp.net`,
        upsertType: "notify",
      },
    });
    const contactA = (
      await db
        .select()
        .from(contacts)
        .where(
          and(
            eq(contacts.workspaceId, workspaceAId),
            eq(contacts.externalPhone, phone)
          )
        )
        .limit(1)
    )[0]!;
    const contactB = (
      await db
        .select()
        .from(contacts)
        .where(
          and(
            eq(contacts.workspaceId, workspaceBId),
            eq(contacts.externalPhone, phone)
          )
        )
        .limit(1)
    )[0]!;

    const availableA = await listInboxAssignableMembers(workspaceAId);
    expect(availableA.map(member => member.id)).toContain(memberAId);
    expect(availableA.map(member => member.id)).not.toContain(memberBId);
    expect(availableA.map(member => member.id)).not.toContain(inactiveMemberAId);
    await expect(
      assignInboxOpportunity(
        workspaceAId,
        contactA.id,
        memberBId,
        insertedUsers[0]!.id
      )
    ).rejects.toThrow("MEMBER_NOT_ASSIGNABLE");
    await expect(
      assignInboxOpportunity(
        workspaceAId,
        contactA.id,
        inactiveMemberAId,
        insertedUsers[0]!.id
      )
    ).rejects.toThrow("MEMBER_NOT_ASSIGNABLE");
    expect(
      await assignInboxOpportunity(
        workspaceAId,
        contactA.id,
        memberAId,
        insertedUsers[0]!.id
      )
    ).toMatchObject({ assignedMemberId: memberAId, changed: true });
    expect(
      await assignInboxOpportunity(
        workspaceAId,
        contactB.id,
        memberAId,
        insertedUsers[0]!.id
      )
    ).toBeUndefined();

    const firstDueAt = new Date(Date.now() + 30 * 60_000);
    const firstAction = await setOpportunityNextAction(
      workspaceAId,
      contactA.id,
      { title: "Retornar com orçamento", dueAt: firstDueAt },
      insertedUsers[0]!.id
    );
    if (!firstAction) throw new Error("O3.2 next action was not saved");
    const nextDueAt = new Date(Date.now() + 45 * 60_000);
    const rescheduledAction = await setOpportunityNextAction(
      workspaceAId,
      contactA.id,
      { title: "Confirmar o orçamento", dueAt: nextDueAt },
      insertedUsers[0]!.id
    );
    expect(rescheduledAction?.id).toBe(firstAction.id);
    expect(rescheduledAction?.title).toBe("Confirmar o orçamento");
    await expect(
      setOpportunityNextAction(
        workspaceAId,
        contactA.id,
        { title: "Prazo no passado", dueAt: new Date(Date.now() - 60_000) },
        insertedUsers[0]!.id
      )
    ).rejects.toThrow("INVALID_NEXT_ACTION_DUE_AT");
    await expect(
      setOpportunityNextAction(
        workspaceAId,
        contactB.id,
        { title: "Ação indevida", dueAt: nextDueAt },
        insertedUsers[0]!.id
      )
    ).resolves.toBeUndefined();

    const projectedA = (await listInboxContacts(workspaceAId)).find(
      row => row.id === contactA.id
    );
    expect(projectedA).toMatchObject({
      assignedMemberId: memberAId,
      assignedMemberName: "Agente O3.2 A",
      nextAction: {
        id: firstAction.id,
        title: "Confirmar o orçamento",
      },
    });
    expect(projectedA?.nextAction?.dueAt.getTime()).toBe(nextDueAt.getTime());
    const projectedB = (await listInboxContacts(workspaceBId)).find(
      row => row.id === contactB.id
    );
    expect(projectedB).toMatchObject({
      assignedMemberId: null,
      assignedMemberName: null,
      nextAction: null,
    });
    expect(
      await db
        .select()
        .from(opportunityFollowUps)
        .where(eq(opportunityFollowUps.workspaceId, workspaceBId))
    ).toHaveLength(0);

    expect(
      await completeOpportunityNextAction(
        workspaceAId,
        contactA.id,
        insertedUsers[0]!.id
      )
    ).toMatchObject({ completed: true, followUpId: firstAction.id });
    expect(
      await completeOpportunityNextAction(
        workspaceAId,
        contactA.id,
        insertedUsers[0]!.id
      )
    ).toEqual({ completed: false });
    const completedRows = await db
      .select()
      .from(opportunityFollowUps)
      .where(
        and(
          eq(opportunityFollowUps.workspaceId, workspaceAId),
          eq(opportunityFollowUps.opportunityId, firstAction.opportunityId)
        )
      );
    expect(completedRows).toHaveLength(1);
    expect(completedRows[0]).toMatchObject({
      id: firstAction.id,
      status: "completed",
      completedByUserId: insertedUsers[0]!.id,
    });
    expect(
      (await listInboxContacts(workspaceAId)).find(row => row.id === contactA.id)
        ?.nextAction
    ).toBeNull();
    const auditRows = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.workspaceId, workspaceAId),
          eq(auditLogs.contactId, contactA.id)
        )
      );
    const auditActions = auditRows.map(row => row.action);
    expect(auditActions).toHaveLength(4);
    expect(auditActions).toEqual(
      expect.arrayContaining([
        "opportunity_assigned",
        "opportunity_next_action_created",
        "opportunity_next_action_rescheduled",
        "opportunity_next_action_completed",
      ])
    );
    const disabledMember = await setMemberProfile(workspaceAId, memberAId, {
      active: false,
    });
    expect(disabledMember?.active).toBe(0);
    const opportunityAfterDisable = (
      await db
        .select()
        .from(opportunities)
        .where(eq(opportunities.id, firstAction.opportunityId))
        .limit(1)
    )[0]!;
    expect(opportunityAfterDisable.assignedMemberId).toBeNull();
    expect(opportunityAfterDisable.workspaceId).toBe(workspaceAId);
  });
});
