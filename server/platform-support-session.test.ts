import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import {
  platformAuditLogs,
  supportSessions,
  workspaces,
} from "../drizzle/schema";
import {
  getActiveSupportSession,
  revokeSupportSession,
  startSupportSession,
} from "./platform-admin";
import { getDb } from "./db";

const hasDatabase = Boolean(
  process.env.DATABASE_URL && /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL)
);

describe.skipIf(!hasDatabase)("support session authorization boundaries", () => {
  const suffix = `support${Date.now()}`;
  const platformAdminId = 9_000_001;
  let workspaceAId = 0;
  let workspaceBId = 0;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const inserted = await db
      .insert(workspaces)
      .values([
        { name: `Support A ${suffix}`, slug: `support-a-${suffix}` },
        { name: `Support B ${suffix}`, slug: `support-b-${suffix}` },
      ])
      .returning({ id: workspaces.id });
    workspaceAId = inserted[0]!.id;
    workspaceBId = inserted[1]!.id;
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    const workspaceIds = [workspaceAId, workspaceBId].filter(Boolean);
    await db
      .delete(platformAuditLogs)
      .where(
        and(
          eq(platformAuditLogs.platformAdminId, platformAdminId),
          inArray(platformAuditLogs.workspaceId, workspaceIds)
        )
      );
    await db
      .delete(supportSessions)
      .where(
        and(
          eq(supportSessions.platformAdminId, platformAdminId),
          inArray(supportSessions.workspaceId, workspaceIds)
        )
      );
    await db.delete(workspaces).where(inArray(workspaces.id, workspaceIds));
  });

  it("requires the exact platform admin and workspace for a session", async () => {
    const session = await startSupportSession({
      platformAdminId,
      workspaceId: workspaceAId,
      mode: "read_only",
      reason: "Validar isolamento de suporte",
      expiresInMinutes: 5,
    });

    await expect(
      getActiveSupportSession({
        platformAdminId,
        sessionId: session.id,
        workspaceId: workspaceAId,
      })
    ).resolves.toMatchObject({ id: session.id, workspaceId: workspaceAId });

    await expect(
      getActiveSupportSession({
        platformAdminId: platformAdminId + 1,
        sessionId: session.id,
        workspaceId: workspaceAId,
      })
    ).resolves.toBeNull();

    await expect(
      getActiveSupportSession({
        platformAdminId,
        sessionId: session.id,
        workspaceId: workspaceBId,
      })
    ).resolves.toBeNull();
  });

  it("does not treat read-only sessions as operator sessions and revocation is immediate", async () => {
    const session = await startSupportSession({
      platformAdminId,
      workspaceId: workspaceAId,
      mode: "read_only",
      reason: "Validar modo read-only",
      expiresInMinutes: 5,
    });

    await expect(
      getActiveSupportSession({
        platformAdminId,
        sessionId: session.id,
        workspaceId: workspaceAId,
        requireOperator: true,
      })
    ).resolves.toBeNull();

    await revokeSupportSession({
      platformAdminId,
      sessionId: session.id,
      reason: "Encerramento do teste",
    });

    await expect(
      getActiveSupportSession({
        platformAdminId,
        sessionId: session.id,
        workspaceId: workspaceAId,
      })
    ).resolves.toBeNull();
  });

  it("expires sessions before returning them", async () => {
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const [created] = await db
      .insert(supportSessions)
      .values({
        platformAdminId,
        workspaceId: workspaceAId,
        mode: "operator",
        reason: "Validar expiração",
        expiresAt: new Date(Date.now() - 1_000),
      })
      .returning({ id: supportSessions.id });

    await expect(
      getActiveSupportSession({
        platformAdminId,
        sessionId: created!.id,
        workspaceId: workspaceAId,
      })
    ).resolves.toBeNull();

    const [expired] = await db
      .select({ status: supportSessions.status })
      .from(supportSessions)
      .where(eq(supportSessions.id, created!.id));
    expect(expired?.status).toBe("expired");
  });
});
