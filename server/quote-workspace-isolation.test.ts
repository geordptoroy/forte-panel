import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import {
  contacts,
  quotePayments,
  quoteReceipts,
  quotes,
  users,
  workspaceMembers,
  workspaces,
} from "../drizzle/schema";
import {
  changeQuoteApproval,
  createQuote,
  getDb,
  listQuotes,
  registerQuotePayment,
  updateQuotePayment,
} from "./db";

const hasDatabase = Boolean(
  process.env.DATABASE_URL && /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL)
);

describe.skipIf(!hasDatabase)("quote workspace isolation", () => {
  const suffix = `quote-${Date.now()}`;
  let workspaceAId = 0;
  let workspaceBId = 0;
  let actorAId = 0;
  let actorBId = 0;
  let contactAId = 0;
  let contactBId = 0;
  let quoteAId = 0;
  let quoteBId = 0;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const insertedWorkspaces = await db
      .insert(workspaces)
      .values([
        { name: `Quote A ${suffix}`, slug: `quote-a-${suffix}` },
        { name: `Quote B ${suffix}`, slug: `quote-b-${suffix}` },
      ])
      .returning({ id: workspaces.id });
    workspaceAId = insertedWorkspaces[0]!.id;
    workspaceBId = insertedWorkspaces[1]!.id;

    const insertedUsers = await db
      .insert(users)
      .values([
        { openId: `quote-actor-a-${suffix}`, name: "Quote Actor A" },
        { openId: `quote-actor-b-${suffix}`, name: "Quote Actor B" },
      ])
      .returning({ id: users.id });
    actorAId = insertedUsers[0]!.id;
    actorBId = insertedUsers[1]!.id;
    await db.insert(workspaceMembers).values([
      { workspaceId: workspaceAId, userId: actorAId, role: "owner", active: 1 },
      { workspaceId: workspaceBId, userId: actorBId, role: "owner", active: 1 },
    ]);

    const insertedContacts = await db
      .insert(contacts)
      .values([
        {
          workspaceId: workspaceAId,
          externalPhone: `5511999${suffix.slice(-6)}`,
          name: "Quote Contact A",
        },
        {
          workspaceId: workspaceBId,
          externalPhone: `5511888${suffix.slice(-6)}`,
          name: "Quote Contact B",
        },
      ])
      .returning({ id: contacts.id });
    contactAId = insertedContacts[0]!.id;
    contactBId = insertedContacts[1]!.id;

    const insertedQuotes = await db
      .insert(quotes)
      .values([
        {
          workspaceId: workspaceAId,
          contactId: contactAId,
          serviceName: "Service A",
          quotedCents: 10000,
          receivedCents: 0,
          approvalStatus: "approved",
          paymentStatus: "unpaid",
          status: "aprovado",
        },
        {
          workspaceId: workspaceBId,
          contactId: contactBId,
          serviceName: "Service B",
          quotedCents: 20000,
          receivedCents: 0,
          approvalStatus: "approved",
          paymentStatus: "unpaid",
          status: "aprovado",
        },
      ])
      .returning({ id: quotes.id });
    quoteAId = insertedQuotes[0]!.id;
    quoteBId = insertedQuotes[1]!.id;
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    const workspaceIds = [workspaceAId, workspaceBId].filter(Boolean);
    await db.delete(quoteReceipts).where(inArray(quoteReceipts.workspaceId, workspaceIds));
    await db.delete(quotePayments).where(inArray(quotePayments.workspaceId, workspaceIds));
    await db.delete(quotes).where(inArray(quotes.workspaceId, workspaceIds));
    await db.delete(contacts).where(inArray(contacts.workspaceId, workspaceIds));
    await db.delete(workspaceMembers).where(inArray(workspaceMembers.workspaceId, workspaceIds));
    await db.delete(users).where(inArray(users.id, [actorAId, actorBId].filter(Boolean)));
    await db.delete(workspaces).where(inArray(workspaces.id, workspaceIds));
  });

  it("lists only quotes from the selected workspace", async () => {
    const rows = await listQuotes(workspaceAId);
    expect(rows.map(row => row.id)).toEqual([quoteAId]);
    expect(rows.map(row => row.contactId)).not.toContain(contactBId);
  });

  it("rejects creating a quote for a foreign contact", async () => {
    await expect(
      createQuote(
        {
          contactId: contactBId,
          serviceName: "Foreign service",
          quotedCents: 1000,
        },
        workspaceAId,
        actorAId
      )
    ).rejects.toThrow("Contact not found");
  });

  it("cannot approve or mutate payments for a foreign quote", async () => {
    await expect(
      changeQuoteApproval(quoteBId, "pending", workspaceAId, actorAId)
    ).rejects.toThrow("Quote not found");
    await expect(
      updateQuotePayment(quoteBId, 1000, workspaceAId, actorAId)
    ).rejects.toThrow("Quote not found");
    await expect(
      registerQuotePayment(
        { quoteId: quoteBId, amountCents: 1000, method: "pix" },
        workspaceAId,
        actorAId
      )
    ).rejects.toThrow("Quote not found");

    const db = await getDb();
    const foreignQuote = await db!
      .select({ receivedCents: quotes.receivedCents })
      .from(quotes)
      .where(and(eq(quotes.id, quoteBId), eq(quotes.workspaceId, workspaceBId)))
      .limit(1);
    expect(foreignQuote[0]?.receivedCents).toBe(0);
  });
});
