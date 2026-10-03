import { and, desc, eq } from "drizzle-orm";
import { apiIdempotency, auditLogs } from "../drizzle/schema";
import { getDb } from "./db";

export type IndeterminateApiIdempotency = {
  id: number;
  workspaceId: number;
  key: string;
  fingerprint: string;
  status: string;
  statusCode: number;
  responseBody: string | null;
  claimToken: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function listIndeterminateApiIdempotency(input?: {
  workspaceId?: number;
  key?: string;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const limit = Math.max(1, Math.min(input?.limit ?? 100, 500));
  const conditions = [eq(apiIdempotency.status, "indeterminate")];
  if (input?.workspaceId !== undefined)
    conditions.push(eq(apiIdempotency.workspaceId, input.workspaceId));
  if (input?.key !== undefined) conditions.push(eq(apiIdempotency.key, input.key));
  return db
    .select({
      id: apiIdempotency.id,
      workspaceId: apiIdempotency.workspaceId,
      key: apiIdempotency.key,
      fingerprint: apiIdempotency.fingerprint,
      status: apiIdempotency.status,
      statusCode: apiIdempotency.statusCode,
      responseBody: apiIdempotency.responseBody,
      claimToken: apiIdempotency.claimToken,
      createdAt: apiIdempotency.createdAt,
      updatedAt: apiIdempotency.updatedAt,
    })
    .from(apiIdempotency)
    .where(and(...conditions))
    .orderBy(desc(apiIdempotency.updatedAt), desc(apiIdempotency.id))
    .limit(limit);
}

export async function reconcileIndeterminateApiIdempotency(input: {
  workspaceId: number;
  key: string;
  reason: string;
  actorUserId?: number;
}) {
  const reason = input.reason.trim();
  if (reason.length < 10 || reason.length > 450)
    throw new Error("A razão de reconciliação deve ter entre 10 e 450 caracteres");
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => {
    const existing = (
      await tx
        .select()
        .from(apiIdempotency)
        .where(
          and(
            eq(apiIdempotency.workspaceId, input.workspaceId),
            eq(apiIdempotency.key, input.key)
          )
        )
        .for("update")
        .limit(1)
    )[0];
    if (!existing) throw new Error("IDEMPOTENCY_CLAIM_NOT_FOUND");
    if (existing.status !== "indeterminate")
      throw new Error(`IDEMPOTENCY_CLAIM_NOT_INDETERMINATE:${existing.status}`);
    const updated = (
      await tx
        .update(apiIdempotency)
        .set({ status: "failed", leaseUntil: null, updatedAt: new Date() })
        .where(
          and(
            eq(apiIdempotency.id, existing.id),
            eq(apiIdempotency.status, "indeterminate")
          )
        )
        .returning()
    )[0];
    if (!updated) throw new Error("IDEMPOTENCY_RECONCILIATION_RACE");
    await tx.insert(auditLogs).values({
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "api_idempotency_reconciled",
      summary: `Claim REST ${input.key} reaberta como failed após verificação: ${reason}`,
    });
    return updated;
  });
}
