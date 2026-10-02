import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import {
  agentRuns,
  auditLogs,
  domainEvents,
  workspaceSettings,
  workspaces,
} from "../drizzle/schema";
import {
  getDb,
  processDomainEventsOnce,
  setNativeAgentKillSwitch,
} from "./db";

const hasDatabase = Boolean(
  process.env.DATABASE_URL && /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL)
);

describe.skipIf(!hasDatabase)("native agent runtime integration", () => {
  const suffix = `agentgate${Date.now()}`;
  let workspaceId = 0;
  const eventKeys = [
    "message.received:text",
    "message.received:audio",
    "message.received:image",
    "message.received:document",
  ].map(key => `${key}:${suffix}`);

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const [workspace] = await db
      .insert(workspaces)
      .values({
        name: `Agent Gate ${suffix}`,
        slug: `agent-gate-${suffix}`,
        timezone: "America/Sao_Paulo",
      })
      .returning({ id: workspaces.id });
    workspaceId = workspace.id;

    await setNativeAgentKillSwitch({
      workspaceId,
      paused: true,
      reason: "pausa\noperacional\u0000 provider",
      actorUserId: 0,
    });

    await db.insert(domainEvents).values(
      eventKeys.map((eventKey, index) => ({
        workspaceId,
        eventKey,
        eventType: "message.received",
        aggregateType: "message",
        aggregateId: index + 1,
        payload: JSON.stringify({
          contactId: 0,
          conversationId: 0,
          messageId: index + 1,
          messageType: ["text", "audio", "image", "document"][index],
          content: "fixture sintético",
        }),
      }))
    );
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db || !workspaceId) return;
    await db.delete(agentRuns).where(eq(agentRuns.workspaceId, workspaceId));
    await db.delete(domainEvents).where(eq(domainEvents.workspaceId, workspaceId));
    await db.delete(workspaceSettings).where(eq(workspaceSettings.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  });

  it("requeues text, audio, vision and document before any provider call", async () => {
    const result = await processDomainEventsOnce(10, 5, workspaceId);
    expect(result.skipped).not.toBe(true);

    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const rows = await db
      .select({
        eventKey: domainEvents.eventKey,
        status: domainEvents.status,
        attemptCount: domainEvents.attemptCount,
        workerId: domainEvents.workerId,
        lastError: domainEvents.lastError,
      })
      .from(domainEvents)
      .where(
        andWorkspaceEvents(workspaceId, eventKeys)
      );
    const auditRows = await db
      .select({ action: auditLogs.action, summary: auditLogs.summary })
      .from(auditLogs)
      .where(eq(auditLogs.workspaceId, workspaceId));

    expect(rows).toHaveLength(4);
    expect(rows).toEqual(
      expect.arrayContaining(
        eventKeys.map(eventKey =>
          expect.objectContaining({
            eventKey,
            status: "pending",
            attemptCount: 1,
            workerId: null,
            lastError: "native_agent_kill_switch:pausa operacional provider",
          })
        )
      )
    );
    expect(auditRows).toHaveLength(4);
    expect(auditRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "native_agent_kill_switch_blocked",
          summary: expect.stringContaining("capability text"),
        }),
        expect.objectContaining({
          action: "native_agent_kill_switch_blocked",
          summary: expect.stringContaining("capability audio"),
        }),
        expect.objectContaining({
          action: "native_agent_kill_switch_blocked",
          summary: expect.stringContaining("capability vision"),
        }),
        expect.objectContaining({
          action: "native_agent_kill_switch_blocked",
          summary: expect.stringContaining("capability document"),
        }),
      ])
    );
    expect(
      auditRows.every(row => !/[\u0000-\u001f\u007f]/.test(row.summary))
    ).toBe(true);
    expect(auditRows.every(row => !row.summary.includes("https://"))).toBe(
      true
    );
    expect(
      await db.select({ id: agentRuns.id }).from(agentRuns).where(eq(agentRuns.workspaceId, workspaceId))
    ).toHaveLength(0);
  });
});

function andWorkspaceEvents(workspaceId: number, eventKeys: string[]) {
  return and(
    eq(domainEvents.workspaceId, workspaceId),
    inArray(domainEvents.eventKey, eventKeys)
  );
}
