import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import {
  apiIdempotency,
  contacts,
  conversations,
  domainEvents,
  messages,
  webhookEvents,
  whatsappInstances,
  workspaces,
} from "../drizzle/schema";
import {
  claimApiIdempotency,
  completeApiIdempotency,
  enqueueDomainEvent,
  failApiIdempotency,
  getDb,
  markWebhookEvent,
  reconcileBaileysDeliveryStatus,
  registerWebhookEvent,
} from "./db";

const hasDatabase = Boolean(
  process.env.DATABASE_URL &&
    /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL)
);

describe.skipIf(!hasDatabase)("workspace-scoped deduplication", () => {
  const suffix = `keys${Date.now()}`;
  let workspaceAId = 0;
  let workspaceBId = 0;
  let seededConversationIds: number[] = [];
  let seededContactIds: number[] = [];
  let seededInstanceIds: string[] = [];

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const inserted = await db
      .insert(workspaces)
      .values([
        { name: `Keys A ${suffix}`, slug: `keys-a-${suffix}` },
        { name: `Keys B ${suffix}`, slug: `keys-b-${suffix}` },
      ])
      .returning({ id: workspaces.id });
    workspaceAId = inserted[0]!.id;
    workspaceBId = inserted[1]!.id;
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    const ids = [workspaceAId, workspaceBId].filter(Boolean);
    if (seededConversationIds.length)
      await db
        .delete(messages)
        .where(inArray(messages.conversationId, seededConversationIds));
    if (seededConversationIds.length)
      await db
        .delete(conversations)
        .where(inArray(conversations.id, seededConversationIds));
    if (seededContactIds.length)
      await db.delete(contacts).where(inArray(contacts.id, seededContactIds));
    if (seededInstanceIds.length)
      await db
        .delete(whatsappInstances)
        .where(inArray(whatsappInstances.instanceId, seededInstanceIds));
    await db.delete(domainEvents).where(inArray(domainEvents.workspaceId, ids));
    await db
      .delete(webhookEvents)
      .where(inArray(webhookEvents.workspaceId, ids));
    await db
      .delete(apiIdempotency)
      .where(inArray(apiIdempotency.workspaceId, ids));
    await db.delete(workspaces).where(inArray(workspaces.id, ids));
  });

  it("allows the same idempotency key, webhook event, and domain event key in different workspaces", async () => {
    const first = await claimApiIdempotency({
      workspaceId: workspaceAId,
      key: "same-key-123456",
      fingerprint: "a",
    });
    const second = await claimApiIdempotency({
      workspaceId: workspaceBId,
      key: "same-key-123456",
      fingerprint: "b",
    });
    expect(first.claimed).toBe(true);
    expect(second.claimed).toBe(true);

    const webhookA = await registerWebhookEvent({
      workspaceId: workspaceAId,
      eventId: "same-event-123456",
      provider: "baileys",
      payload: { workspace: "a" },
    });
    const webhookB = await registerWebhookEvent({
      workspaceId: workspaceBId,
      eventId: "same-event-123456",
      provider: "baileys",
      payload: { workspace: "b" },
    });
    expect(webhookA.duplicate).toBe(false);
    expect(webhookB.duplicate).toBe(false);

    const eventA = await enqueueDomainEvent({
      workspaceId: workspaceAId,
      event: "task.due",
      aggregateType: "task",
      eventKey: "same-domain-key-123456",
      payload: { workspace: "a" },
    });
    const eventB = await enqueueDomainEvent({
      workspaceId: workspaceBId,
      event: "task.due",
      aggregateType: "task",
      eventKey: "same-domain-key-123456",
      payload: { workspace: "b" },
    });
    expect(eventA?.workspaceId).toBe(workspaceAId);
    expect(eventB?.workspaceId).toBe(workspaceBId);
  });

  it("does not re-run an expired REST claim when its side-effect outcome is unknown", async () => {
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const key = `expired-rest-${suffix}`;
    const first = await claimApiIdempotency({
      workspaceId: workspaceAId,
      key,
      fingerprint: "expired-payload",
    });
    if (!first.claimed) throw new Error("expected the first REST claim");

    await db
      .update(apiIdempotency)
      .set({ leaseUntil: new Date(Date.now() - 1) })
      .where(
        and(
          eq(apiIdempotency.workspaceId, workspaceAId),
          eq(apiIdempotency.key, key)
        )
      );
    const retry = await claimApiIdempotency({
      workspaceId: workspaceAId,
      key,
      fingerprint: "expired-payload",
    });
    expect(retry).toMatchObject({ claimed: false, outcomeUnknown: true });
    expect(retry.record?.claimToken).toBe(first.claimToken);

    expect(
      await completeApiIdempotency({
        workspaceId: workspaceAId,
        key,
        claimToken: first.claimToken,
        statusCode: 201,
        responseBody: { owner: "original" },
      })
    ).toBe(true);
  });

  it("fences complete and fail from a stale REST claim after explicit safe reopening", async () => {
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const key = `fenced-rest-${suffix}`;
    const first = await claimApiIdempotency({
      workspaceId: workspaceAId,
      key,
      fingerprint: "fenced-payload",
    });
    if (!first.claimed) throw new Error("expected the first REST claim");

    // This explicit DB state represents an operator-approved retry after reconciliation.
    await db
      .update(apiIdempotency)
      .set({ status: "failed", leaseUntil: null })
      .where(
        and(
          eq(apiIdempotency.workspaceId, workspaceAId),
          eq(apiIdempotency.key, key)
        )
      );
    const second = await claimApiIdempotency({
      workspaceId: workspaceAId,
      key,
      fingerprint: "fenced-payload",
    });
    if (!second.claimed) throw new Error("expected the reconciled REST claim");
    expect(second.claimToken).not.toBe(first.claimToken);

    expect(
      await completeApiIdempotency({
        workspaceId: workspaceAId,
        key,
        claimToken: first.claimToken,
        statusCode: 200,
        responseBody: { owner: "stale" },
      })
    ).toBe(false);
    expect(await failApiIdempotency(workspaceAId, key, first.claimToken)).toBe(
      false
    );
    expect(
      await completeApiIdempotency({
        workspaceId: workspaceAId,
        key,
        claimToken: second.claimToken,
        statusCode: 201,
        responseBody: { owner: "current" },
      })
    ).toBe(true);
  });

  it("reclaims expired webhook leases and rejects stale completion tokens", async () => {
    const eventId = "recoverable-event-123456";
    const payload = { text: "hello" };
    const first = await registerWebhookEvent({
      workspaceId: workspaceAId,
      eventId,
      provider: "baileys",
      payload,
    });
    expect(first.duplicate).toBe(false);
    if (first.duplicate) throw new Error("expected first webhook lease");

    const activeDuplicate = await registerWebhookEvent({
      workspaceId: workspaceAId,
      eventId,
      provider: "baileys",
      payload,
    });
    expect(activeDuplicate.duplicate).toBe(true);

    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    await db
      .update(webhookEvents)
      .set({ leaseUntil: new Date(Date.now() - 1) })
      .where(eq(webhookEvents.id, first.event.id));
    const retry = await registerWebhookEvent({
      workspaceId: workspaceAId,
      eventId,
      provider: "baileys",
      payload,
    });
    expect(retry.duplicate).toBe(false);
    if (retry.duplicate)
      throw new Error("expected expired webhook lease to be reclaimed");
    expect(retry.leaseToken).not.toBe(first.leaseToken);

    await markWebhookEvent(
      workspaceAId,
      eventId,
      "processed",
      first.leaseToken
    );
    const stillOwned = await db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.id, first.event.id))
      .limit(1);
    expect(stillOwned[0]).toMatchObject({
      status: "received",
      leaseToken: retry.leaseToken,
    });

    await markWebhookEvent(
      workspaceAId,
      eventId,
      "processed",
      retry.leaseToken
    );
    const completedDuplicate = await registerWebhookEvent({
      workspaceId: workspaceAId,
      eventId,
      provider: "baileys",
      payload,
    });
    expect(completedDuplicate.duplicate).toBe(true);
  });

  it("reconciles only matching workspace/instance receipts and never regresses read status", async () => {
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const instanceA = `receipt-a-${suffix}`;
    const instanceB = `receipt-b-${suffix}`;
    await db.insert(whatsappInstances).values([
      { workspaceId: workspaceAId, instanceId: instanceA, name: "Receipt A" },
      { workspaceId: workspaceBId, instanceId: instanceB, name: "Receipt B" },
    ]);
    seededInstanceIds = [instanceA, instanceB];
    const [contact] = await db
      .insert(contacts)
      .values({
        workspaceId: workspaceAId,
        externalPhone: `55${Date.now().toString().slice(-10)}`,
        name: "Receipt test",
      })
      .returning({ id: contacts.id });
    seededContactIds = [contact!.id];
    const [conversation] = await db
      .insert(conversations)
      .values({ contactId: contact!.id })
      .returning({ id: conversations.id });
    seededConversationIds = [conversation!.id];
    const externalId = `outbound-receipt-${suffix}`;
    await db.insert(messages).values({
      conversationId: conversation!.id,
      externalId,
      direction: "outbound",
      senderType: "human",
      messageType: "text",
      content: "hello",
      metadata: { instanceId: instanceA, deliveryStatus: "sent" },
      status: "sent",
      provider: "baileys",
    });

    await expect(
      reconcileBaileysDeliveryStatus({
        workspaceId: workspaceAId,
        instanceId: instanceB,
        messageId: externalId,
        status: "delivered",
      })
    ).resolves.toBe(false);
    await expect(
      reconcileBaileysDeliveryStatus({
        workspaceId: workspaceBId,
        instanceId: instanceA,
        messageId: externalId,
        status: "delivered",
      })
    ).resolves.toBe(false);
    await expect(
      reconcileBaileysDeliveryStatus({
        workspaceId: workspaceAId,
        instanceId: instanceA,
        messageId: externalId,
        status: "delivered",
      })
    ).resolves.toBe(true);
    await reconcileBaileysDeliveryStatus({
      workspaceId: workspaceAId,
      instanceId: instanceA,
      messageId: externalId,
      status: "read",
    });
    await reconcileBaileysDeliveryStatus({
      workspaceId: workspaceAId,
      instanceId: instanceA,
      messageId: externalId,
      status: "delivered",
    });
    const stored = await db
      .select({ metadata: messages.metadata })
      .from(messages)
      .where(eq(messages.externalId, externalId))
      .limit(1);
    expect(stored[0]?.metadata?.deliveryStatus).toBe("read");
  });
});
