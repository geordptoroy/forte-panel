import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apiIdempotency, auditLogs, workspaces } from "../drizzle/schema";
import { getDb } from "./db";
import {
  listIndeterminateApiIdempotency,
  reconcileIndeterminateApiIdempotency,
} from "./api-idempotency-reconciliation";

const hasDatabase = Boolean(
  process.env.DATABASE_URL && /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL)
);

describe.skipIf(!hasDatabase)("API idempotency reconciliation", () => {
  const suffix = `reconcile-${Date.now()}`;
  let workspaceId = 0;
  const key = `indeterminate-${suffix}`;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const [workspace] = await db
      .insert(workspaces)
      .values({ name: `Reconciliation ${suffix}`, slug: suffix })
      .returning({ id: workspaces.id });
    workspaceId = workspace!.id;
    await db.insert(apiIdempotency).values({
      workspaceId,
      key,
      fingerprint: "fingerprint-reconciliation",
      status: "indeterminate",
      leaseUntil: null,
      claimToken: "claim-reconciliation",
    });
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db || !workspaceId) return;
    await db.delete(auditLogs).where(eq(auditLogs.workspaceId, workspaceId));
    await db.delete(apiIdempotency).where(eq(apiIdempotency.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  });

  it("lista por workspace e só reabre uma claim indeterminate com razão", async () => {
    const before = await listIndeterminateApiIdempotency({ workspaceId, key });
    expect(before).toHaveLength(1);
    expect(before[0]).toMatchObject({ key, status: "indeterminate" });

    await expect(
      reconcileIndeterminateApiIdempotency({
        workspaceId,
        key,
        reason: "Gateway consultado; não existe efeito externo para esta chave",
      })
    ).resolves.toMatchObject({ status: "failed", key });

    await expect(listIndeterminateApiIdempotency({ workspaceId, key })).resolves.toEqual([]);
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const [claim] = await db
      .select({ status: apiIdempotency.status, leaseUntil: apiIdempotency.leaseUntil })
      .from(apiIdempotency)
      .where(and(eq(apiIdempotency.workspaceId, workspaceId), eq(apiIdempotency.key, key)));
    expect(claim).toMatchObject({ status: "failed", leaseUntil: null });
    const [audit] = await db
      .select({ action: auditLogs.action, summary: auditLogs.summary })
      .from(auditLogs)
      .where(eq(auditLogs.workspaceId, workspaceId));
    expect(audit).toMatchObject({ action: "api_idempotency_reconciled" });
    expect(audit?.summary).toContain(key);
  });

  it("não permite reabrir novamente uma claim já failed", async () => {
    await expect(
      reconcileIndeterminateApiIdempotency({
        workspaceId,
        key,
        reason: "Tentativa repetida para confirmar a transição já aplicada",
      })
    ).rejects.toThrow("IDEMPOTENCY_CLAIM_NOT_INDETERMINATE:failed");
  });
});
