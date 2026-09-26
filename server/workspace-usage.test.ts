import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { workspaces, workspaceUsageBuckets } from "../drizzle/schema";
import { consumeWorkspaceUsage, getDb } from "./db";

const hasDatabase = Boolean(process.env.DATABASE_URL && /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL));

describe.skipIf(!hasDatabase)("workspace usage limits", () => {
  const suffix = `usage${Date.now()}`;
  let workspaceAId = 0;
  let workspaceBId = 0;
  const previousLimit = process.env.FORTE_WORKSPACE_API_REQUESTS_PER_MINUTE;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const inserted = await db.insert(workspaces).values([
      { name: `Usage A ${suffix}`, slug: `usage-a-${suffix}` },
      { name: `Usage B ${suffix}`, slug: `usage-b-${suffix}` },
    ]).returning({ id: workspaces.id });
    workspaceAId = inserted[0]!.id;
    workspaceBId = inserted[1]!.id;
    process.env.FORTE_WORKSPACE_API_REQUESTS_PER_MINUTE = "1";
  });

  afterAll(async () => {
    if (previousLimit === undefined) delete process.env.FORTE_WORKSPACE_API_REQUESTS_PER_MINUTE;
    else process.env.FORTE_WORKSPACE_API_REQUESTS_PER_MINUTE = previousLimit;
    const db = await getDb();
    if (!db) return;
    await db.delete(workspaceUsageBuckets).where(inArray(workspaceUsageBuckets.workspaceId, [workspaceAId, workspaceBId].filter(Boolean)));
    await db.delete(workspaces).where(inArray(workspaces.id, [workspaceAId, workspaceBId].filter(Boolean)));
  });

  it("limits one workspace without consuming another workspace's allowance", async () => {
    await expect(consumeWorkspaceUsage(workspaceAId, "apiRequests")).resolves.toMatchObject({ allowed: true, remaining: 0, limit: 1 });
    await expect(consumeWorkspaceUsage(workspaceAId, "apiRequests")).resolves.toMatchObject({ allowed: false, remaining: 0, limit: 1 });
    await expect(consumeWorkspaceUsage(workspaceBId, "apiRequests")).resolves.toMatchObject({ allowed: true, remaining: 0, limit: 1 });
  });
});
