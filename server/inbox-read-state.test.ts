import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import {
  contacts,
  conversationReads,
  conversations,
  messages,
  users,
  workspaces,
} from "../drizzle/schema";
import {
  getDb,
  listInboxContacts,
  markConversationRead,
} from "./db";

const hasDatabase = Boolean(
  process.env.DATABASE_URL && /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL)
);

describe.skipIf(!hasDatabase)("per-operator Inbox read state", () => {
  const suffix = `read${Date.now()}`;
  let workspaceAId = 0;
  let workspaceBId = 0;
  let userAId = 0;
  let userBId = 0;
  let contactAId = 0;
  let contactBId = 0;
  let conversationAId = 0;
  let conversationBId = 0;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const insertedWorkspaces = await db
      .insert(workspaces)
      .values([
        { name: `Read A ${suffix}`, slug: `read-a-${suffix}` },
        { name: `Read B ${suffix}`, slug: `read-b-${suffix}` },
      ])
      .returning({ id: workspaces.id });
    workspaceAId = insertedWorkspaces[0]!.id;
    workspaceBId = insertedWorkspaces[1]!.id;

    const insertedUsers = await db
      .insert(users)
      .values([
        { openId: `read-user-a-${suffix}`, name: "Operator A" },
        { openId: `read-user-b-${suffix}`, name: "Operator B" },
      ])
      .returning({ id: users.id });
    userAId = insertedUsers[0]!.id;
    userBId = insertedUsers[1]!.id;

    const insertedContacts = await db
      .insert(contacts)
      .values([
        {
          workspaceId: workspaceAId,
          externalPhone: `551199999${suffix.slice(-4)}`,
          name: "Contato A",
          unreadCount: 2,
        },
        {
          workspaceId: workspaceBId,
          externalPhone: `551188888${suffix.slice(-4)}`,
          name: "Contato B",
          unreadCount: 1,
        },
      ])
      .returning({ id: contacts.id });
    contactAId = insertedContacts[0]!.id;
    contactBId = insertedContacts[1]!.id;

    const insertedConversations = await db
      .insert(conversations)
      .values([
        { contactId: contactAId, unreadCount: 2 },
        { contactId: contactBId, unreadCount: 1 },
      ])
      .returning({ id: conversations.id });
    conversationAId = insertedConversations[0]!.id;
    conversationBId = insertedConversations[1]!.id;

    await db.insert(messages).values([
      {
        conversationId: conversationAId,
        direction: "inbound",
        senderType: "lead",
        content: "Primeira mensagem",
        status: "received",
      },
      {
        conversationId: conversationAId,
        direction: "inbound",
        senderType: "lead",
        content: "Segunda mensagem",
        status: "received",
      },
      {
        conversationId: conversationBId,
        direction: "inbound",
        senderType: "lead",
        content: "Mensagem de outro workspace",
        status: "received",
      },
    ]);
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db
      .delete(conversationReads)
      .where(
        inArray(
          conversationReads.conversationId,
          [conversationAId, conversationBId].filter(Boolean)
        )
      );
    await db
      .delete(messages)
      .where(
        inArray(messages.conversationId, [conversationAId, conversationBId].filter(Boolean))
      );
    await db
      .delete(conversations)
      .where(inArray(conversations.id, [conversationAId, conversationBId].filter(Boolean)));
    await db
      .delete(contacts)
      .where(inArray(contacts.id, [contactAId, contactBId].filter(Boolean)));
    await db
      .delete(users)
      .where(inArray(users.id, [userAId, userBId].filter(Boolean)));
    await db
      .delete(workspaces)
      .where(inArray(workspaces.id, [workspaceAId, workspaceBId].filter(Boolean)));
  });

  it("keeps read state per operator and never crosses workspace boundaries", async () => {
    const operatorAView = await listInboxContacts(workspaceAId, userAId);
    expect(operatorAView.find(contact => contact.id === contactAId)?.unreadCount).toBe(2);

    await expect(markConversationRead(workspaceAId, userAId, contactAId)).resolves.toMatchObject({
      conversationId: conversationAId,
      lastReadMessageId: expect.any(Number),
    });

    const operatorAAfterRead = await listInboxContacts(workspaceAId, userAId);
    const operatorBView = await listInboxContacts(workspaceAId, userBId);
    const otherWorkspaceView = await listInboxContacts(workspaceBId, userAId);
    expect(operatorAAfterRead.find(contact => contact.id === contactAId)?.unreadCount).toBe(0);
    expect(operatorBView.find(contact => contact.id === contactAId)?.unreadCount).toBe(2);
    expect(otherWorkspaceView.find(contact => contact.id === contactBId)?.unreadCount).toBe(1);

    await expect(markConversationRead(workspaceAId, userAId, contactBId)).resolves.toBeUndefined();
    expect((await listInboxContacts(workspaceBId, userAId)).find(contact => contact.id === contactBId)?.unreadCount).toBe(1);

    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    await db.insert(messages).values({
      conversationId: conversationAId,
      direction: "inbound",
      senderType: "lead",
      content: "Mensagem nova depois da leitura",
      status: "received",
    });
    expect((await listInboxContacts(workspaceAId, userAId)).find(contact => contact.id === contactAId)?.unreadCount).toBe(1);
  });
});
