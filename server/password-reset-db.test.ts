import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  auditLogs,
  passwordResetTokens,
  users,
  workspaceMembers,
  workspaces,
} from "../drizzle/schema";
import {
  getDb,
  issuePasswordResetToken,
  resetPasswordWithToken,
  verifyLocalPassword,
} from "./db";

const hasDatabase = Boolean(
  process.env.DATABASE_URL && /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL)
);

describe.skipIf(!hasDatabase)("password reset tokens", () => {
  const suffix = `reset${Date.now()}`;
  const email = `reset-${suffix}@example.com`;
  let userId = 0;
  let workspaceId = 0;
  let firstToken = "";
  let secondToken = "";

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const [workspace] = await db
      .insert(workspaces)
      .values({ name: `Reset ${suffix}`, slug: `reset-${suffix}` })
      .returning();
    workspaceId = workspace!.id;
    const [user] = await db
      .insert(users)
      .values({
        openId: `reset_${suffix}`,
        name: "Reset Owner",
        email,
        loginMethod: "local",
        role: "user",
      })
      .returning();
    userId = user!.id;
    await db.insert(workspaceMembers).values({
      workspaceId,
      userId,
      role: "owner",
    });
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
    await db.delete(auditLogs).where(eq(auditLogs.workspaceId, workspaceId));
    await db.delete(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId));
    await db.delete(users).where(inArray(users.id, [userId].filter(Boolean)));
    await db.delete(workspaces).where(inArray(workspaces.id, [workspaceId].filter(Boolean)));
  });

  it("revokes the previous token and consumes the latest token once", async () => {
    const first = await issuePasswordResetToken(email);
    firstToken = first!.token;
    const second = await issuePasswordResetToken(email);
    secondToken = second!.token;
    expect(firstToken).not.toBe(secondToken);
    await expect(resetPasswordWithToken(firstToken, "nova-senha-123")).rejects.toThrow(
      "Token de recuperação inválido ou expirado"
    );

    await expect(resetPasswordWithToken(secondToken, "nova-senha-123")).resolves.toEqual({ userId });
    await expect(resetPasswordWithToken(secondToken, "outra-senha-123")).rejects.toThrow(
      "Token de recuperação inválido ou expirado"
    );

    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    const user = (await db.select().from(users).where(eq(users.id, userId))).at(0);
    expect(user?.sessionVersion).toBe(1);
    expect(verifyLocalPassword("nova-senha-123", user?.passwordHash ?? null)).toBe(true);
  });
});
