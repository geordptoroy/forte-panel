import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  auditLogs,
  consentRecords,
  users,
  workspaceMembers,
  workspaces,
} from "../drizzle/schema";
import {
  createPublicSignup,
  getDb,
  PUBLIC_PRIVACY_VERSION,
  PUBLIC_TERMS_VERSION,
  verifyLocalPassword,
} from "./db";

const hasDatabase = Boolean(
  process.env.DATABASE_URL && /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL)
);

describe.skipIf(!hasDatabase)("public signup transaction", () => {
  const suffix = `signup${Date.now()}`;
  let userId = 0;
  let workspaceId = 0;
  const email = `owner-${suffix}@example.com`;

  beforeAll(async () => {
    const created = await createPublicSignup({
      name: "Owner de Teste",
      email,
      password: "senha-segura-123",
      workspaceName: "Clínica de Teste",
    });
    userId = created.user.id;
    workspaceId = created.workspace.id;
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(auditLogs).where(eq(auditLogs.workspaceId, workspaceId));
    await db.delete(consentRecords).where(eq(consentRecords.workspaceId, workspaceId));
    await db.delete(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId));
    await db.delete(users).where(inArray(users.id, [userId].filter(Boolean)));
    await db.delete(workspaces).where(inArray(workspaces.id, [workspaceId].filter(Boolean)));
  });

  it("creates owner, workspace, membership, password hash and versioned consent atomically", async () => {
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const user = (await db.select().from(users).where(inArray(users.id, [userId]))).at(0);
    const workspace = (await db.select().from(workspaces).where(inArray(workspaces.id, [workspaceId]))).at(0);
    const member = (await db.select().from(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId))).at(0);
    const consent = (await db.select().from(consentRecords).where(eq(consentRecords.workspaceId, workspaceId))).at(0);
    expect(user?.email).toBe(email);
    expect(verifyLocalPassword("senha-segura-123", user?.passwordHash ?? null)).toBe(true);
    expect(workspace).toMatchObject({ name: "Clínica de Teste", plan: "starter", status: "onboarding" });
    expect(workspace?.slug).toMatch(/^clinica-de-teste-[a-f0-9]{8}$/);
    expect(member).toMatchObject({ userId, workspaceId, role: "owner", active: 1 });
    expect(consent).toMatchObject({ userId, workspaceId, termsVersion: PUBLIC_TERMS_VERSION, privacyVersion: PUBLIC_PRIVACY_VERSION });
  });

  it("rejects a second account with the same email", async () => {
    await expect(createPublicSignup({
      name: "Outro Owner",
      email: email.toUpperCase(),
      password: "outra-senha-123",
      workspaceName: "Outro Workspace",
    })).rejects.toThrow("Já existe uma conta");
  });
});
