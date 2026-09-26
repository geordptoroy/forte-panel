import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { apiIdempotency, domainEvents, webhookEvents, workspaces } from "../drizzle/schema";
import { claimApiIdempotency, enqueueDomainEvent, getDb, registerWebhookEvent } from "./db";

const hasDatabase = Boolean(process.env.DATABASE_URL && /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL));

describe.skipIf(!hasDatabase)("workspace-scoped deduplication", () => {
  const suffix = `keys${Date.now()}`;
  let workspaceAId = 0;
  let workspaceBId = 0;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const inserted = await db.insert(workspaces).values([
      { name: `Keys A ${suffix}`, slug: `keys-a-${suffix}` },
      { name: `Keys B ${suffix}`, slug: `keys-b-${suffix}` },
    ]).returning({ id: workspaces.id });
    workspaceAId = inserted[0]!.id;
    workspaceBId = inserted[1]!.id;
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    const ids = [workspaceAId, workspaceBId].filter(Boolean);
    await db.delete(domainEvents).where(inArray(domainEvents.workspaceId, ids));
    await db.delete(webhookEvents).where(inArray(webhookEvents.workspaceId, ids));
    await db.delete(apiIdempotency).where(inArray(apiIdempotency.workspaceId, ids));
    await db.delete(workspaces).where(inArray(workspaces.id, ids));
  });

  it("allows the same idempotency key, webhook event, and domain event key in different workspaces", async () => {
    const first = await claimApiIdempotency({ workspaceId: workspaceAId, key: "same-key-123456", fingerprint: "a" });
    const second = await claimApiIdempotency({ workspaceId: workspaceBId, key: "same-key-123456", fingerprint: "b" });
    expect(first.claimed).toBe(true);
    expect(second.claimed).toBe(true);

    const webhookA = await registerWebhookEvent({ workspaceId: workspaceAId, eventId: "same-event-123456", provider: "test", payload: { workspace: "a" } });
    const webhookB = await registerWebhookEvent({ workspaceId: workspaceBId, eventId: "same-event-123456", provider: "test", payload: { workspace: "b" } });
    expect(webhookA.duplicate).toBe(false);
    expect(webhookB.duplicate).toBe(false);

    const eventA = await enqueueDomainEvent({ workspaceId: workspaceAId, event: "task.due", aggregateType: "task", eventKey: "same-domain-key-123456", payload: { workspace: "a" } });
    const eventB = await enqueueDomainEvent({ workspaceId: workspaceBId, event: "task.due", aggregateType: "task", eventKey: "same-domain-key-123456", payload: { workspace: "b" } });
    expect(eventA?.workspaceId).toBe(workspaceAId);
    expect(eventB?.workspaceId).toBe(workspaceBId);
  });
});
