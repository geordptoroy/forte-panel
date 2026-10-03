import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  contacts,
  conversations,
  whatsappInstances,
  workspaces,
} from "../drizzle/schema";
import { getDb, queueOutboundMessage } from "./db";

const hasDatabase = Boolean(
  process.env.DATABASE_URL && /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL)
);

describe.skipIf(!hasDatabase)("outbound tenant isolation", () => {
  const suffix = `tenantqueue${Date.now()}`;
  const instanceA = `queue-a-${suffix}`;
  const instanceB = `queue-b-${suffix}`;
  let workspaceAId = 0;
  let workspaceBId = 0;
  let contactAId = 0;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const insertedWorkspaces = await db
      .insert(workspaces)
      .values([
        { name: `Queue A ${suffix}`, slug: `queue-a-${suffix}` },
        { name: `Queue B ${suffix}`, slug: `queue-b-${suffix}` },
      ])
      .returning({ id: workspaces.id });
    workspaceAId = insertedWorkspaces[0]!.id;
    workspaceBId = insertedWorkspaces[1]!.id;

    await db.insert(whatsappInstances).values([
      {
        workspaceId: workspaceAId,
        provider: "baileys",
        instanceId: instanceA,
        name: "Queue A",
        active: 1,
      },
      {
        workspaceId: workspaceBId,
        provider: "baileys",
        instanceId: instanceB,
        name: "Queue B",
        active: 1,
      },
    ]);

    const insertedContacts = await db
      .insert(contacts)
      .values({
        workspaceId: workspaceAId,
        externalPhone: `55119${String(Date.now()).slice(-8)}`,
        name: "Contacto de teste isolado",
      })
      .returning({ id: contacts.id });
    contactAId = insertedContacts[0]!.id;
  });

  afterAll(async () => {
    const db = await getDb();
    const workspaceIds = [workspaceAId, workspaceBId].filter(Boolean);
    if (!db || workspaceIds.length === 0) return;

    if (contactAId) {
      const existingConversations = await db
        .select({ id: conversations.id })
        .from(conversations)
        .where(eq(conversations.contactId, contactAId));
      if (existingConversations.length > 0) {
        await db
          .delete(conversations)
          .where(eq(conversations.contactId, contactAId));
      }
      await db.delete(contacts).where(eq(contacts.id, contactAId));
    }
    await db
      .delete(whatsappInstances)
      .where(inArray(whatsappInstances.workspaceId, workspaceIds));
    await db.delete(workspaces).where(inArray(workspaces.id, workspaceIds));
  });

  it("rejects a foreign or missing instance before creating a conversation", async () => {
    await expect(
      queueOutboundMessage(
        workspaceAId,
        contactAId,
        "Mensagem de teste",
        "baileys",
        "human",
        "text",
        { instanceId: instanceB }
      )
    ).rejects.toThrow("Instância Baileys inválida para este workspace");

    await expect(
      queueOutboundMessage(
        workspaceAId,
        contactAId,
        "Mensagem sem rota",
        "baileys",
        "human",
        "text",
        {}
      )
    ).rejects.toThrow("instanceId é obrigatório para envio Baileys");

    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const createdConversations = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.contactId, contactAId));
    expect(createdConversations).toHaveLength(0);
  });
});
