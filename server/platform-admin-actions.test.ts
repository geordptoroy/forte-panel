import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import {
  platformAuditLogs,
  platformWorkspaceNotes,
  supportSessions,
  workspaces,
} from "../drizzle/schema";
import {
  addPlatformWorkspaceNote,
  revokeSupportSession,
  setPlatformWorkspaceAi,
  setPlatformWorkspaceStatus,
  startSupportSession,
} from "./platform-admin";
import { getDb, getPlatformNativeAgentConfig } from "./db";

const hasDatabase = Boolean(
  process.env.DATABASE_URL && /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL)
);

describe.skipIf(!hasDatabase)("platform admin mutation safety", () => {
  const suffix = `actions${Date.now()}`;
  const platformAdminId = 9_000_002;
  let workspaceId = 0;
  let sessionId = 0;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const [workspace] = await db
      .insert(workspaces)
      .values({ name: `Admin actions ${suffix}`, slug: `admin-actions-${suffix}` })
      .returning({ id: workspaces.id });
    workspaceId = workspace!.id;
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db
      .delete(platformWorkspaceNotes)
      .where(
        and(
          eq(platformWorkspaceNotes.platformAdminId, platformAdminId),
          eq(platformWorkspaceNotes.workspaceId, workspaceId)
        )
      );
    await db
      .delete(platformAuditLogs)
      .where(
        and(
          eq(platformAuditLogs.platformAdminId, platformAdminId),
          eq(platformAuditLogs.workspaceId, workspaceId)
        )
      );
    await db
      .delete(supportSessions)
      .where(
        and(
          eq(supportSessions.platformAdminId, platformAdminId),
          eq(supportSessions.workspaceId, workspaceId)
        )
      );
    await db.delete(workspaces).where(inArray(workspaces.id, [workspaceId]));
  });

  it("pauses and reactivates AI while preserving the effective config", async () => {
    const session = await startSupportSession({
      platformAdminId,
      workspaceId,
      mode: "operator",
      reason: "Validar pausa e reativação com sessão operadora",
      expiresInMinutes: 5,
    });
    sessionId = session.id;
    const paused = await setPlatformWorkspaceAi({
      platformAdminId,
      workspaceId,
      supportSessionId: session.id,
      enabled: false,
      reason: "Teste operacional de pausa da IA",
    });
    expect(paused.enabled).toBe(false);
    expect((await getPlatformNativeAgentConfig(workspaceId)).enabled).toBe(false);

    const resumed = await setPlatformWorkspaceAi({
      platformAdminId,
      workspaceId,
      supportSessionId: session.id,
      enabled: true,
      reason: "Teste operacional de reativação da IA",
    });
    expect(resumed.enabled).toBe(true);
  });

  it("suspends and reactivates a workspace with explicit status transitions", async () => {
    const session = await startSupportSession({
      platformAdminId,
      workspaceId,
      mode: "operator",
      reason: "Validar transição com sessão operadora",
      expiresInMinutes: 5,
    });
    sessionId = session.id;
    const suspended = await setPlatformWorkspaceStatus({
      platformAdminId,
      workspaceId,
      supportSessionId: session.id,
      status: "suspended",
      reason: "Teste operacional de suspensão",
    });
    expect(suspended).toMatchObject({ status: "suspended", active: false });

    const reactivated = await setPlatformWorkspaceStatus({
      platformAdminId,
      workspaceId,
      supportSessionId: session.id,
      status: "active",
      reason: "Teste operacional de reativação",
    });
    expect(reactivated).toMatchObject({ status: "active", active: true });
    await revokeSupportSession({
      platformAdminId,
      sessionId: session.id,
      reason: "Fim da validação de transição",
    });
  });

  it("records a scoped support note and audit trail", async () => {
    const session = await startSupportSession({
      platformAdminId,
      workspaceId,
      mode: "operator",
      reason: "Teste operacional de nota",
      expiresInMinutes: 5,
    });
    sessionId = session.id;

    const note = await addPlatformWorkspaceNote({
      platformAdminId,
      workspaceId,
      supportSessionId: session.id,
      body: "Nota interna de teste, sem segredo bruto.",
      reason: "Registrar resultado do teste operacional",
    });
    expect(note.body).toContain("sem segredo bruto");

    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const audits = await db
      .select({ action: platformAuditLogs.action, workspaceId: platformAuditLogs.workspaceId })
      .from(platformAuditLogs)
      .where(
        and(
          eq(platformAuditLogs.platformAdminId, platformAdminId),
          eq(platformAuditLogs.workspaceId, workspaceId)
        )
      );
    expect(audits.map(row => row.action)).toEqual(
      expect.arrayContaining(["support_session_started", "internal_note_created"])
    );
    expect(audits.every(row => row.workspaceId === workspaceId)).toBe(true);

    await revokeSupportSession({
      platformAdminId,
      sessionId,
      reason: "Encerramento do teste operacional",
    });
  });
});
