import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { workerHeartbeats, workspaces } from "../drizzle/schema";
import {
  getPlatformWorkspaceDetail,
  recordWorkerHeartbeat,
} from "./platform-admin";
import { getDb } from "./db";

const hasDatabase = Boolean(
  process.env.DATABASE_URL && /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL)
);

describe.skipIf(!hasDatabase)("worker heartbeat observability", () => {
  const suffix = `heartbeat${Date.now()}`;
  const service = "forte-panel-worker";
  let workspaceId = 0;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const [workspace] = await db
      .insert(workspaces)
      .values({ name: `Heartbeat ${suffix}`, slug: `heartbeat-${suffix}` })
      .returning({ id: workspaces.id });
    workspaceId = workspace!.id;
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db
      .delete(workerHeartbeats)
      .where(eq(workerHeartbeats.service, service));
  });

  it("upserts the worker signal and exposes healthy/degraded/stale states", async () => {
    await recordWorkerHeartbeat({
      service,
      ticks: 1,
      intervalMs: 10_000,
      lastError: null,
    });
    const healthy = await getPlatformWorkspaceDetail(workspaceId);
    expect(healthy?.workspace.health.worker).toBe("healthy");

    await recordWorkerHeartbeat({
      service,
      ticks: 2,
      intervalMs: 10_000,
      lastError: "provider_timeout",
    });
    const degraded = await getPlatformWorkspaceDetail(workspaceId);
    expect(degraded?.workspace.health.worker).toBe("degraded");

    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    await db
      .update(workerHeartbeats)
      .set({ observedAt: new Date(Date.now() - 181_000) })
      .where(eq(workerHeartbeats.service, service));
    const stale = await getPlatformWorkspaceDetail(workspaceId);
    expect(stale?.workspace.health.worker).toBe("stale");

    const rows = await db
      .select({ service: workerHeartbeats.service })
      .from(workerHeartbeats)
      .where(inArray(workerHeartbeats.service, [service]));
    expect(rows).toHaveLength(1);
  });
});
