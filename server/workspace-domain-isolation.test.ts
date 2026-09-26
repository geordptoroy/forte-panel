import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { services, professionals, workspaces } from "../drizzle/schema";
import { getDb } from "./db";
import { createService, getProfessionalInWorkspace, listProfessionalsDetailed, listServices, setServiceProfessionals, updateProfessional, updateService } from "./workspace";

const hasDatabase = Boolean(process.env.DATABASE_URL && /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL));

describe.skipIf(!hasDatabase)("workspace-scoped catalog", () => {
  const suffix = `tenant${Date.now()}`;
  let workspaceAId = 0;
  let workspaceBId = 0;
  let serviceAId = 0;
  let serviceBId = 0;
  let professionalBId = 0;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const insertedWorkspaces = await db.insert(workspaces).values([
      { name: `Tenant A ${suffix}`, slug: `tenant-a-${suffix}` },
      { name: `Tenant B ${suffix}`, slug: `tenant-b-${suffix}` },
    ]).returning({ id: workspaces.id });
    workspaceAId = insertedWorkspaces[0]!.id;
    workspaceBId = insertedWorkspaces[1]!.id;

    const [service] = await db.insert(services).values({ workspaceId: workspaceBId, name: `Private service ${suffix}` }).returning();
    const [professional] = await db.insert(professionals).values({ workspaceId: workspaceBId, name: `Private professional ${suffix}` }).returning();
    serviceBId = service!.id;
    professionalBId = professional!.id;
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(services).where(inArray(services.workspaceId, [workspaceAId, workspaceBId].filter(Boolean)));
    await db.delete(professionals).where(inArray(professionals.workspaceId, [workspaceAId, workspaceBId].filter(Boolean)));
    await db.delete(workspaces).where(inArray(workspaces.id, [workspaceAId, workspaceBId].filter(Boolean)));
  });

  it("creates services in the workspace explicitly supplied by the caller", async () => {
    const created = await createService(workspaceAId, { name: `Tenant A service ${suffix}` });
    serviceAId = created!.id;
    expect(created).toMatchObject({ workspaceId: workspaceAId, name: `Tenant A service ${suffix}` });
  });

  it("does not list or mutate another workspace's service or professional by guessed ID", async () => {
    const visibleToA = await listServices(workspaceAId, { includeInactive: true });
    expect(visibleToA.some((row) => row.id === serviceBId)).toBe(false);
    const professionalsVisibleToA = await listProfessionalsDetailed(workspaceAId, { includeInactive: true });
    expect(professionalsVisibleToA.some((row) => row.id === professionalBId)).toBe(false);
    await expect(updateService(workspaceAId, serviceBId, { name: "tampered" })).resolves.toBeUndefined();
    await expect(getProfessionalInWorkspace(workspaceAId, professionalBId)).resolves.toBeUndefined();
    await expect(updateProfessional(workspaceAId, professionalBId, { name: "tampered" })).resolves.toBeUndefined();
    await expect(setServiceProfessionals(workspaceAId, serviceBId, [])).rejects.toThrow(/não encontrado neste workspace/i);
    await expect(setServiceProfessionals(workspaceAId, serviceAId, [professionalBId])).resolves.toEqual([]);
  });

  it("leaves the other workspace's records unchanged after rejected cross-tenant mutations", async () => {
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const service = (await db.select().from(services).where(eq(services.id, serviceBId)).limit(1))[0];
    const professional = (await db.select().from(professionals).where(eq(professionals.id, professionalBId)).limit(1))[0];
    expect(service?.name).toBe(`Private service ${suffix}`);
    expect(professional?.name).toBe(`Private professional ${suffix}`);
  });
});
