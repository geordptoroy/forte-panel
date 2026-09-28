import crypto from "node:crypto";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  appointmentsTable,
  agentEffects,
  apiIdempotency,
  auditLogs,
  availability,
  contactNotes,
  contacts,
  consentRecords,
  conversations,
  conversationReads,
  domainEvents,
  messages,
  notifications,
  onboardingAudioAssets,
  onboardingSessions,
  onboardingConflictResolutions,
  onboardingSourceConsents,
  onboardingRetentionPolicies,
  onboardingStepAnswers,
  onboardingStepAnswerRevisions,
  onboardingTelemetryEvents,
  onboardingPublishedVersions,
  onboardingTranscriptions,
  passwordResetTokens,
  professionals,
  professionalServices,
  quotes,
  services,
  users,
  webhookEvents,
  whatsappChannels,
  whatsappGroupParticipants,
  whatsappGroups,
  whatsappInstances,
  workspaceInvites,
  workspaceMembers,
  workspaceSettings,
  workspaceUsageBuckets,
  workspaceUserUsageBuckets,
  workspaces,
  type InsertUser,
} from "../drizzle/schema";
import type { WhatsappProvider } from "./integrations/contracts";
import { getWhatsappAdapter } from "./integrations/whatsapp";
import { ENV } from "./_core/env";
import {
  createInviteToken,
  hashInviteToken,
  INVITE_TTL_MS,
  isInviteExpired,
  normalizeInviteEmail,
} from "./_core/invites";
import {
  createPasswordResetToken,
  hashPasswordResetToken,
  isPasswordResetExpired,
  PASSWORD_RESET_TTL_MS,
} from "./_core/password-reset";
import { resolveReplyRoute } from "./_core/message-routing";
import { normalizeContactPhone, normalizeWhatsappJid } from "./_core/phone";
import {
  deriveConversationState,
  type ConversationActivity,
} from "./_core/conversation-state";
import {
  assertWithinWorkingHours,
  getLocalDayBounds,
  ScheduleError,
} from "./schedule";
import {
  dailySummaryEventKey,
  dailySummaryFor,
  notificationForEvent,
  notificationPreferenceForEvent,
  parseNotificationPreferences,
  quotaAlertEventKey,
  quotaAlertFor,
  type NotificationEvent,
} from "./notification-contract";
import {
  decryptProviderSecret,
  encryptProviderSecret,
  maskProviderSecret,
  mergeAgentProviderSettings,
  type AgentProviderSettings,
} from "./llm-providers";
import { persistInboundMedia, resolvePrivateMediaUrl } from "./media-storage";
import { onboardingFollowUpFieldKeys } from "./onboarding-followups";

const DOMAIN_EVENT_WORKER_ID =
  process.env.WORKER_ID?.trim() || `worker-${crypto.randomUUID()}`;
const DOMAIN_EVENT_LEASE_MS = Math.max(
  10_000,
  Math.min(Number(process.env.EVENT_WORKER_LEASE_MS ?? 120_000), 900_000)
);

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: Pool | null = null;

export async function getDb() {
  const connectionString = process.env.DATABASE_URL;
  if (
    !_db &&
    connectionString &&
    /^postgres(ql)?:\/\//i.test(connectionString)
  ) {
    try {
      const pool = new Pool({
        connectionString,
        max: 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
      });
      pool.on("error", error => {
        console.error("[Database] pool connection error", error);
        if (_pool === pool) {
          _db = null;
          _pool = null;
          void pool.end().catch(() => undefined);
        }
      });
      _pool = pool;
      _db = drizzle(pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function checkDatabaseHealth() {
  const db = await getDb();
  if (!db) return { status: "not_configured" as const };
  try {
    await db.execute(sql`select 1`);
    return { status: "ok" as const };
  } catch {
    return { status: "error" as const };
  }
}

export function shouldAssignBootstrapOwnerMembership(input: {
  openId: string;
  role?: InsertUser["role"];
  existingRole?: InsertUser["role"];
  ownerOpenId: string;
  canBootstrapAdmin: boolean;
}) {
  return (
    input.role === "admin" ||
    input.existingRole === "admin" ||
    (input.canBootstrapAdmin &&
      input.ownerOpenId.length > 0 &&
      input.openId === input.ownerOpenId)
  );
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const existingUser = (
    await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.openId, user.openId))
      .limit(1)
  )[0];
  const anyAdmin = (
    await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, "admin"))
      .limit(1)
  )[0];
  const canBootstrapAdmin = !anyAdmin && !existingUser;
  const shouldAssignBootstrapOwner = shouldAssignBootstrapOwnerMembership({
    openId: user.openId,
    role: user.role,
    existingRole: existingUser?.role,
    ownerOpenId: ENV.ownerOpenId,
    canBootstrapAdmin,
  });
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] === undefined) continue;
    values[field] = user[field] ?? null;
    updateSet[field] = user[field] ?? null;
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (
    existingUser?.role === "admin" ||
    (user.openId === ENV.ownerOpenId && canBootstrapAdmin)
  ) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  values.lastSignedIn ??= new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db
    .insert(users)
    .values(values)
    .onConflictDoUpdate({ target: users.openId, set: updateSet });
  const persisted = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.openId, user.openId))
    .limit(1);
  const workspace = await ensureDemoWorkspace();
  if (persisted[0] && workspace && shouldAssignBootstrapOwner) {
    await ensureWorkspaceMember(workspace.id, persisted[0].id, "owner");
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);
  return result[0];
}

function hashLocalPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyLocalPassword(password: string, stored: string | null) {
  if (!stored) return false;
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64).toString("hex");
  return (
    actual.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
  );
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);
  return result[0];
}

export async function getUserById(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return result[0];
}

export async function isWorkspaceMemberActive(userId: number) {
  if (userId < 0) return false;
  return Boolean(await getWorkspaceMembershipContext(userId));
}

export type WorkspaceMembershipContext = {
  workspaceId: number;
  workspaceName: string;
  workspaceSlug: string;
  segment: string;
  plan: "starter" | "pro" | "business";
  timezone: string;
  memberId: number;
  role: "owner" | "admin" | "manager" | "agent";
  jobTitle: string | null;
  canRegisterPayments: boolean;
  professionalId: number | null;
  operationalRole: "human_attendant" | "ai_attendant" | "professional" | null;
};

/**
 * Resolve the only active workspace for a user. This intentionally fails
 * closed for zero or multiple active memberships; callers must not guess a
 * tenant from a global role, URL input, or the demo workspace.
 */
export async function getWorkspaceMembershipContext(
  userId: number
): Promise<WorkspaceMembershipContext | null> {
  const db = await getDb();
  if (!db || userId < 1) return null;
  const rows = await db
    .select({
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
      workspaceSlug: workspaces.slug,
      segment: workspaces.segment,
      plan: workspaces.plan,
      timezone: workspaces.timezone,
      memberId: workspaceMembers.id,
      role: workspaceMembers.role,
      jobTitle: workspaceMembers.jobTitle,
      canRegisterPayments: workspaceMembers.canRegisterPayments,
      professionalId: workspaceMembers.professionalId,
      operationalRole: users.operationalRole,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(
      and(
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.active, 1),
        eq(workspaces.active, 1)
      )
    )
    .orderBy(asc(workspaceMembers.id))
    .limit(2);
  const selected = selectSingleWorkspaceMembership(rows);
  return selected
    ? {
        ...selected,
        canRegisterPayments: selected.canRegisterPayments === 1,
      }
    : null;
}

export function selectSingleWorkspaceMembership<T>(
  memberships: readonly T[]
): T | null {
  return memberships.length === 1 ? memberships[0]! : null;
}

export async function setLocalPassword(userId: number, password: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db
    .update(users)
    .set({ passwordHash: hashLocalPassword(password), updatedAt: new Date() })
    .where(eq(users.id, userId));
}

export const PUBLIC_TERMS_VERSION = "2026-09-27.v1";
export const PUBLIC_PRIVACY_VERSION = "2026-09-27.v1";

export function slugifyWorkspaceName(name: string) {
  const base = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
  return base || "workspace";
}

export async function createPublicSignup(input: {
  name: string;
  email: string;
  password: string;
  workspaceName: string;
  segment?: string;
  timezone?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const workspaceName = input.workspaceName.trim();
  const now = new Date();
  return db.transaction(async tx => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${email}))`
    );
    const existing = await tx
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1);
    if (existing[0]) throw new Error("Já existe uma conta com este e-mail");

    const slug = `${slugifyWorkspaceName(workspaceName)}-${crypto
      .randomBytes(4)
      .toString("hex")}`;
    const [workspace] = await tx
      .insert(workspaces)
      .values({
        name: workspaceName,
        slug,
        segment: input.segment?.trim() || "servicos",
        timezone: input.timezone?.trim() || "America/Sao_Paulo",
        plan: "starter",
        status: "onboarding",
      })
      .returning();
    if (!workspace) throw new Error("Não foi possível criar o workspace");

    const [user] = await tx
      .insert(users)
      .values({
        openId: `local_${crypto.randomUUID()}`,
        name,
        email,
        loginMethod: "local",
        role: "user",
        passwordHash: hashLocalPassword(input.password),
        operationalRole: "human_attendant",
        lastSignedIn: now,
      })
      .returning();
    if (!user) throw new Error("Não foi possível criar a conta");

    await tx.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId: user.id,
      role: "owner",
      active: 1,
    });
    await tx.insert(whatsappChannels).values({
      workspaceId: workspace.id,
      provider: "baileys",
      name: "WhatsApp Comercial",
      credentialsRef: "BAILEYS_API_KEY",
      active: 1,
    });
    await tx.insert(consentRecords).values({
      userId: user.id,
      workspaceId: workspace.id,
      termsVersion: PUBLIC_TERMS_VERSION,
      privacyVersion: PUBLIC_PRIVACY_VERSION,
      acceptedAt: now,
      createdAt: now,
    });
    await tx.insert(auditLogs).values({
      workspaceId: workspace.id,
      actorUserId: user.id,
      action: "public_signup_completed",
      summary: "Cadastro público criou owner e workspace",
      createdAt: now,
    });
    return { user, workspace };
  });
}

export async function issuePasswordResetToken(emailInput: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const email = emailInput.trim().toLowerCase();
  const user = (
    await db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1)
  )[0];
  if (!user) return undefined;
  const token = createPasswordResetToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PASSWORD_RESET_TTL_MS);
  await db.transaction(async tx => {
    await tx
      .update(passwordResetTokens)
      .set({ revokedAt: now })
      .where(
        and(
          eq(passwordResetTokens.userId, user.id),
          isNull(passwordResetTokens.usedAt),
          isNull(passwordResetTokens.revokedAt)
        )
      );
    await tx.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash: hashPasswordResetToken(token),
      expiresAt,
      createdAt: now,
    });
  });
  return { userId: user.id, email: user.email ?? email, name: user.name, token, expiresAt };
}

export async function resetPasswordWithToken(tokenInput: string, password: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const tokenHash = hashPasswordResetToken(tokenInput);
  return db.transaction(async tx => {
    const candidate = (
      await tx
        .select()
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.tokenHash, tokenHash))
        .limit(1)
    )[0];
    if (
      !candidate ||
      candidate.usedAt ||
      candidate.revokedAt ||
      isPasswordResetExpired(candidate.expiresAt)
    ) {
      throw new Error("Token de recuperação inválido ou expirado");
    }
    await tx.execute(
      sql`SELECT "id" FROM "passwordResetTokens" WHERE "id" = ${candidate.id} FOR UPDATE`
    );
    const now = new Date();
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(passwordResetTokens.id, candidate.id),
          isNull(passwordResetTokens.usedAt),
          isNull(passwordResetTokens.revokedAt)
        )
      );
    await tx
      .update(passwordResetTokens)
      .set({ revokedAt: now })
      .where(
        and(
          eq(passwordResetTokens.userId, candidate.userId),
          ne(passwordResetTokens.id, candidate.id),
          isNull(passwordResetTokens.usedAt),
          isNull(passwordResetTokens.revokedAt)
        )
      );
    await tx
      .update(users)
      .set({
        passwordHash: hashLocalPassword(password),
        sessionVersion: sql`${users.sessionVersion} + 1`,
        updatedAt: now,
      })
      .where(eq(users.id, candidate.userId));
    const memberships = await tx
      .select({ workspaceId: workspaceMembers.workspaceId })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.userId, candidate.userId),
          eq(workspaceMembers.active, 1)
        )
      );
    if (memberships.length > 0) {
      await tx.insert(auditLogs).values(
        memberships.map(membership => ({
          workspaceId: membership.workspaceId,
          actorUserId: candidate.userId,
          action: "password_reset_completed",
          summary: "Senha redefinida por token one-time",
          createdAt: now,
        }))
      );
    }
    return { userId: candidate.userId };
  });
}

export async function revokeUserSessions(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db
    .update(users)
    .set({
      sessionVersion: sql`${users.sessionVersion} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

export async function touchLastSignedIn(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(users)
    .set({ lastSignedIn: new Date() })
    .where(eq(users.id, userId));
}

export async function createLocalWorkspaceMember(
  workspaceId: number,
  input: {
    name: string;
    email: string;
    password: string;
    role: "owner" | "admin" | "manager" | "agent";
    operationalRole: "human_attendant" | "ai_attendant" | "professional";
    professionalId?: number;
    jobTitle?: string | null;
    canRegisterPayments?: boolean;
  },
  actorUserId?: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const email = input.email.trim().toLowerCase();
  const existing = await getUserByEmail(email);
  if (existing) throw new Error("Já existe uma conta com este e-mail");
  if (input.operationalRole === "professional" && !input.professionalId) {
    throw new Error(
      "Profissional executor precisa estar vinculado a um profissional cadastrado"
    );
  }
  if (input.operationalRole === "professional" && !input.jobTitle?.trim())
    throw new Error("Informe a função do profissional executor");
  if (input.professionalId) {
    const professional = (
      await db
        .select({ id: professionals.id })
        .from(professionals)
        .where(
          and(
            eq(professionals.id, input.professionalId),
            eq(professionals.workspaceId, workspaceId)
          )
        )
        .limit(1)
    )[0];
    if (!professional)
      throw new Error("Profissional não pertence a este workspace");
  }
  const [user] = await db
    .insert(users)
    .values({
      openId: `local_${crypto.randomUUID()}`,
      name: input.name.trim(),
      email,
      loginMethod: "local",
      // Workspace roles are stored only on workspaceMembers. Never promote a
      // customer employee to the installation-wide platform administrator.
      role: "user",
      passwordHash: hashLocalPassword(input.password),
      operationalRole: input.operationalRole,
    })
    .returning();
  if (!user) throw new Error("Não foi possível criar a conta");
  await db.insert(workspaceMembers).values({
    workspaceId: workspaceId,
    userId: user.id,
    role: input.role,
    jobTitle: input.jobTitle?.trim() || null,
    professionalId:
      input.operationalRole === "professional"
        ? (input.professionalId ?? null)
        : null,
    canRegisterPayments: input.canRegisterPayments ? 1 : 0,
  });
  await db.insert(auditLogs).values({
    workspaceId,
    actorUserId,
    action: "member_created",
    summary: `Conta ${email} criada com papel ${input.role} e perfil ${input.operationalRole}`,
  });
  return user;
}


export async function createWorkspaceInvite(
  workspaceId: number,
  actorUserId: number,
  input: {
    email: string;
    inviteeName?: string;
    role: "admin" | "manager" | "agent";
    operationalRole: "human_attendant" | "ai_attendant" | "professional";
    professionalId?: number | null;
    scope?: string;
    jobTitle?: string | null;
    canRegisterPayments?: boolean;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const email = normalizeInviteEmail(input.email);
  const token = createInviteToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);
  const created = await db.transaction(async tx => {
    const existingUser = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existingUser[0]) throw new Error("Já existe uma conta com este e-mail");
    if (input.operationalRole === "professional" && !input.professionalId)
      throw new Error("Profissional executor precisa estar vinculado a um profissional");
    if (input.operationalRole === "professional" && !input.jobTitle?.trim())
      throw new Error("Informe a função do profissional executor");
    if (input.professionalId) {
      const professional = await tx
        .select({ id: professionals.id })
        .from(professionals)
        .where(and(eq(professionals.id, input.professionalId), eq(professionals.workspaceId, workspaceId)))
        .limit(1);
      if (!professional[0]) throw new Error("Profissional não pertence a este workspace");
    }
    await tx
      .update(workspaceInvites)
      .set({ status: "replaced", updatedAt: now })
      .where(
        and(
          eq(workspaceInvites.workspaceId, workspaceId),
          eq(workspaceInvites.email, email),
          inArray(workspaceInvites.status, ["pending", "sent"])
        )
      );
    const [invite] = await tx
      .insert(workspaceInvites)
      .values({
        workspaceId,
        email,
        inviteeName: input.inviteeName?.trim() || null,
        role: input.role,
        operationalRole: input.operationalRole,
        jobTitle: input.jobTitle?.trim() || null,
        professionalId: input.professionalId ?? null,
        canRegisterPayments: input.canRegisterPayments ? 1 : 0,
        scope: input.scope?.trim() || "workspace",
        tokenHash: hashInviteToken(token),
        status: "pending",
        expiresAt,
        invitedByUserId: actorUserId,
      })
      .returning();
    if (!invite) throw new Error("Não foi possível criar o convite");
    await tx.insert(auditLogs).values({
      workspaceId,
      actorUserId,
      action: "member_invite_created",
      summary: `Convite criado para ${email} com papel ${input.role}`,
    });
    return invite;
  });
  return { invite: created, token };
}

export async function listWorkspaceInvites(workspaceId: number) {
  const db = await getDb();
  if (!db) return [];
  const now = new Date();
  await db
    .update(workspaceInvites)
    .set({ status: "expired", updatedAt: now })
    .where(
      and(
        eq(workspaceInvites.workspaceId, workspaceId),
        inArray(workspaceInvites.status, ["pending", "sent"]),
        lte(workspaceInvites.expiresAt, now)
      )
    );
  return db
    .select({
      id: workspaceInvites.id,
      workspaceId: workspaceInvites.workspaceId,
      email: workspaceInvites.email,
      inviteeName: workspaceInvites.inviteeName,
      role: workspaceInvites.role,
      operationalRole: workspaceInvites.operationalRole,
      jobTitle: workspaceInvites.jobTitle,
      professionalId: workspaceInvites.professionalId,
      canRegisterPayments: workspaceInvites.canRegisterPayments,
      scope: workspaceInvites.scope,
      status: workspaceInvites.status,
      expiresAt: workspaceInvites.expiresAt,
      invitedByUserId: workspaceInvites.invitedByUserId,
      acceptedByUserId: workspaceInvites.acceptedByUserId,
      acceptedAt: workspaceInvites.acceptedAt,
      revokedAt: workspaceInvites.revokedAt,
      createdAt: workspaceInvites.createdAt,
    })
    .from(workspaceInvites)
    .where(eq(workspaceInvites.workspaceId, workspaceId))
    .orderBy(desc(workspaceInvites.createdAt), desc(workspaceInvites.id));
}

export async function revokeWorkspaceInvite(
  workspaceId: number,
  inviteId: number,
  actorUserId: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const now = new Date();
  const updated = await db
    .update(workspaceInvites)
    .set({ status: "revoked", revokedAt: now, updatedAt: now })
    .where(
      and(
        eq(workspaceInvites.id, inviteId),
        eq(workspaceInvites.workspaceId, workspaceId),
        inArray(workspaceInvites.status, ["pending", "sent"])
      )
    )
    .returning({ id: workspaceInvites.id, email: workspaceInvites.email });
  if (!updated[0]) return false;
  await db.insert(auditLogs).values({
    workspaceId,
    actorUserId,
    action: "member_invite_revoked",
    summary: `Convite ${inviteId} revogado para ${updated[0].email}`,
  });
  return true;
}

export async function markWorkspaceInviteSent(inviteId: number) {
  const db = await getDb();
  if (!db) return false;
  const updated = await db
    .update(workspaceInvites)
    .set({ status: "sent", updatedAt: new Date() })
    .where(
      and(
        eq(workspaceInvites.id, inviteId),
        eq(workspaceInvites.status, "pending")
      )
    )
    .returning({ id: workspaceInvites.id });
  return Boolean(updated[0]);
}

export async function acceptWorkspaceInvite(
  token: string,
  input: { name: string; password: string }
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const tokenHash = hashInviteToken(token);
  return db.transaction(async tx => {
    const invite = (
      await tx
        .select()
        .from(workspaceInvites)
        .where(eq(workspaceInvites.tokenHash, tokenHash))
        .limit(1)
    )[0];
    if (!invite) throw new Error("Convite inválido ou expirado");
    if (invite.status !== "pending" && invite.status !== "sent")
      throw new Error("Convite inválido ou já utilizado");
    const now = new Date();
    if (isInviteExpired(invite.expiresAt, now)) {
      await tx.update(workspaceInvites).set({ status: "expired", updatedAt: now }).where(eq(workspaceInvites.id, invite.id));
      throw new Error("Convite expirado");
    }
    await tx.execute(sql`SELECT "id" FROM "workspaceInvites" WHERE "id" = ${invite.id} FOR UPDATE`);
    const existingUser = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, invite.email))
      .limit(1);
    if (existingUser[0]) throw new Error("Já existe uma conta com este e-mail");
    const [user] = await tx
      .insert(users)
      .values({
        openId: `local_${crypto.randomUUID()}`,
        name: input.name.trim() || invite.inviteeName || invite.email,
        email: invite.email,
        loginMethod: "local",
        role: "user",
        passwordHash: hashLocalPassword(input.password),
        operationalRole: invite.operationalRole,
      })
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        openId: users.openId,
        sessionVersion: users.sessionVersion,
      });
    if (!user) throw new Error("Não foi possível criar a conta");
    await tx.insert(workspaceMembers).values({
      workspaceId: invite.workspaceId,
      userId: user.id,
      role: invite.role,
      jobTitle: invite.jobTitle,
      professionalId: invite.professionalId,
      canRegisterPayments: invite.canRegisterPayments,
    });
    const updated = await tx
      .update(workspaceInvites)
      .set({ status: "accepted", acceptedByUserId: user.id, acceptedAt: now, updatedAt: now })
      .where(and(eq(workspaceInvites.id, invite.id), inArray(workspaceInvites.status, ["pending", "sent"])))
      .returning({ id: workspaceInvites.id });
    if (!updated[0]) throw new Error("Convite já foi utilizado");
    await tx.insert(auditLogs).values({
      workspaceId: invite.workspaceId,
      actorUserId: user.id,
      action: "member_invite_accepted",
      summary: `Convite ${invite.id} aceito por ${invite.email}`,
    });
    return {
      user,
      workspaceId: invite.workspaceId,
      role: invite.role,
      operationalRole: invite.operationalRole,
    };
  });
}

export async function getWorkspaceMemberForUser(
  workspaceId: number,
  userId: number
) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.active, 1)
      )
    )
    .limit(1);
  return result[0];
}

export async function listProfessionals(workspaceId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(professionals)
    .where(
      and(
        eq(professionals.workspaceId, workspaceId),
        eq(professionals.active, 1)
      )
    )
    .orderBy(asc(professionals.name));
}

export async function createProfessional(
  workspaceId: number,
  input: { name: string; specialty?: string; color?: string }
) {
  const db = await getDb();
  if (!db) throw new Error("Workspace unavailable");
  const [professional] = await db
    .insert(professionals)
    .values({
      workspaceId: workspaceId,
      name: input.name.trim(),
      specialty: input.specialty?.trim() || null,
      color: input.color ?? "#56d68a",
    })
    .returning();
  return professional;
}

export async function linkProfessionalService(
  workspaceId: number,
  professionalId: number,
  serviceId: number
) {
  const db = await getDb();
  if (!db) throw new Error("Workspace unavailable");
  await db
    .insert(professionalServices)
    .values({ workspaceId: workspaceId, professionalId, serviceId, active: 1 })
    .onConflictDoUpdate({
      target: [
        professionalServices.workspaceId,
        professionalServices.professionalId,
        professionalServices.serviceId,
      ],
      set: { active: 1 },
    });
}

export const DEMO_WORKSPACE_SLUG = "forte-demo";

export type DomainEventName =
  | "message.received"
  | "message.sent"
  | "contact.created"
  | "stage.changed"
  | "appointment.created"
  | "appointment.confirmed"
  | "appointment.cancelled"
  | "task.due";

export async function enqueueDomainEvent(input: {
  workspaceId: number;
  event: DomainEventName;
  aggregateType: string;
  aggregateId?: number;
  payload: Record<string, unknown>;
  eventKey?: string;
}) {
  const db = await getDb();
  if (!db) return undefined;
  const eventKey =
    input.eventKey ??
    `${input.event}:${input.aggregateType}:${input.aggregateId ?? crypto.randomUUID()}`;
  return db.transaction(async tx => {
    const created = await tx
      .insert(domainEvents)
      .values({
        workspaceId: input.workspaceId,
        eventKey,
        eventType: input.event,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        payload: JSON.stringify(input.payload),
      })
      .onConflictDoNothing({
        target: [domainEvents.workspaceId, domainEvents.eventKey],
      })
      .returning();
    if (!created[0]) {
      const existing = await tx
        .select()
        .from(domainEvents)
        .where(
          and(
            eq(domainEvents.workspaceId, input.workspaceId),
            eq(domainEvents.eventKey, eventKey)
          )
        )
        .limit(1);
      return existing[0];
    }

    const preferenceKey = notificationPreferenceForEvent(input.event);
    if (!preferenceKey) return created[0];

    const settings = await tx
      .select({ value: workspaceSettings.value })
      .from(workspaceSettings)
      .where(
        and(
          eq(workspaceSettings.workspaceId, input.workspaceId),
          eq(workspaceSettings.key, "notification_preferences")
        )
      )
      .orderBy(desc(workspaceSettings.id))
      .limit(1);
    const preferences = parseNotificationPreferences(settings[0]?.value);
    if (!preferences[preferenceKey]) return created[0];

    const members = await tx
      .select({
        userId: workspaceMembers.userId,
        role: workspaceMembers.role,
        professionalId: workspaceMembers.professionalId,
        operationalRole: users.operationalRole,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(
        and(
          eq(workspaceMembers.workspaceId, input.workspaceId),
          eq(workspaceMembers.active, 1)
        )
      );
    const allMemberIds = await tx
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, input.workspaceId));
    const managerRole = (role: string) =>
      role === "owner" || role === "admin" || role === "manager";
    const professionalId = Number(input.payload.professionalId ?? 0);
    const recipients = members
      .filter(member => {
        if (input.event === "contact.created")
          return (
            managerRole(member.role) ||
            (member.role === "agent" &&
              member.operationalRole !== "professional")
          );
        return (
          managerRole(member.role) ||
          (member.operationalRole === "professional" &&
            member.professionalId === professionalId)
        );
      })
      .map(member => member.userId);

    // The bootstrap administrator may be authorized without an explicit member row.
    if (!members.some(member => managerRole(member.role))) {
      const bootstrapAdmins = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, "admin"));
      const allMemberUserIds = new Set(
        allMemberIds.map(member => member.userId)
      );
      for (const user of bootstrapAdmins)
        if (!allMemberUserIds.has(user.id)) recipients.push(user.id);
    }
    const uniqueRecipients = Array.from(new Set(recipients));
    if (uniqueRecipients.length === 0) return created[0];

    let appointment:
      | {
          contactName: string | null;
          serviceName: string | null;
          professionalName: string | null;
          startsAt: Date | null;
        }
      | undefined;
    let timezone = "America/Sao_Paulo";
    if (input.event !== "contact.created") {
      const appointmentId = Number(
        input.payload.appointmentId ?? input.aggregateId ?? 0
      );
      appointment = appointmentId
        ? (
            await tx
              .select({
                contactName: contacts.name,
                serviceName: services.name,
                professionalName: professionals.name,
                startsAt: appointmentsTable.startsAt,
              })
              .from(appointmentsTable)
              .leftJoin(contacts, eq(contacts.id, appointmentsTable.contactId))
              .leftJoin(services, eq(services.id, appointmentsTable.serviceId))
              .leftJoin(
                professionals,
                eq(professionals.id, appointmentsTable.professionalId)
              )
              .where(
                and(
                  eq(appointmentsTable.id, appointmentId),
                  eq(appointmentsTable.workspaceId, input.workspaceId)
                )
              )
              .limit(1)
          )[0]
        : undefined;
      const workspace = (
        await tx
          .select({ timezone: workspaces.timezone })
          .from(workspaces)
          .where(eq(workspaces.id, input.workspaceId))
          .limit(1)
      )[0];
      timezone = workspace?.timezone ?? timezone;
    }
    const copy = notificationForEvent({
      event: input.event as NotificationEvent,
      payload: input.payload,
      appointment,
      timezone,
    });

    await tx
      .insert(notifications)
      .values(
        uniqueRecipients.map(userId => ({
          workspaceId: input.workspaceId,
          userId,
          eventKey,
          type: copy.type,
          title: copy.title,
          body: copy.body,
          href: copy.href,
          createdAt: created[0]!.createdAt,
        }))
      )
      .onConflictDoNothing({
        target: [
          notifications.workspaceId,
          notifications.userId,
          notifications.eventKey,
        ],
      });
    return created[0];
  });
}

export async function listInAppNotifications(
  workspaceId: number,
  userId: number,
  limit = 30
) {
  const db = await getDb();
  if (!db) return { items: [], unreadCount: 0 };
  const items = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.workspaceId, workspaceId),
        eq(notifications.userId, userId)
      )
    )
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit);
  const unreadRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(
        eq(notifications.workspaceId, workspaceId),
        eq(notifications.userId, userId),
        isNull(notifications.readAt)
      )
    );
  return { items, unreadCount: Number(unreadRows[0]?.count ?? 0) };
}

export async function markInAppNotificationRead(
  workspaceId: number,
  userId: number,
  notificationId: number
) {
  const db = await getDb();
  if (!db) return false;
  const updated = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.workspaceId, workspaceId),
        eq(notifications.userId, userId),
        eq(notifications.id, notificationId),
        isNull(notifications.readAt)
      )
    )
    .returning({ id: notifications.id });
  return updated.length > 0;
}

export async function markAllInAppNotificationsRead(
  workspaceId: number,
  userId: number
) {
  const db = await getDb();
  if (!db) return 0;
  const updated = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.workspaceId, workspaceId),
        eq(notifications.userId, userId),
        isNull(notifications.readAt)
      )
    )
    .returning({ id: notifications.id });
  return updated.length;
}

export async function processDailySummaryNotificationsOnce(
  now = new Date(),
  onlyWorkspaceId?: number
) {
  const db = await getDb();
  if (!db) return { processed: 0, skipped: true };
  const activeWorkspaces = await db
    .select()
    .from(workspaces)
    .where(
      onlyWorkspaceId
        ? and(eq(workspaces.active, 1), eq(workspaces.id, onlyWorkspaceId))
        : eq(workspaces.active, 1)
    );
  let processed = 0;
  for (const workspace of activeWorkspaces) {
    let bounds: ReturnType<typeof getLocalDayBounds>;
    try {
      bounds = getLocalDayBounds(now, workspace.timezone);
    } catch {
      continue;
    }
    if (bounds.minuteOfDay < 18 * 60) continue;
    const settings = await db
      .select({ value: workspaceSettings.value })
      .from(workspaceSettings)
      .where(
        and(
          eq(workspaceSettings.workspaceId, workspace.id),
          eq(workspaceSettings.key, "notification_preferences")
        )
      )
      .orderBy(desc(workspaceSettings.id))
      .limit(1);
    if (!parseNotificationPreferences(settings[0]?.value).dailySummary)
      continue;

    const members = await db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspace.id),
          eq(workspaceMembers.active, 1),
          inArray(workspaceMembers.role, ["owner", "admin", "manager"])
        )
      );
    const allMemberIds = await db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, workspace.id));
    const recipients = members.map(member => member.userId);
    const allMemberUserIds = new Set(allMemberIds.map(member => member.userId));
    if (recipients.length === 0) {
      const bootstrapAdmins = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, "admin"));
      for (const user of bootstrapAdmins)
        if (!allMemberUserIds.has(user.id)) recipients.push(user.id);
    }
    const uniqueRecipients = Array.from(new Set(recipients));
    if (uniqueRecipients.length === 0) continue;

    const [appointmentRows, leadRows] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(appointmentsTable)
        .where(
          and(
            eq(appointmentsTable.workspaceId, workspace.id),
            gte(appointmentsTable.startsAt, bounds.start),
            lt(appointmentsTable.startsAt, bounds.end),
            ne(appointmentsTable.status, "cancelled")
          )
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(contacts)
        .where(
          and(
            eq(contacts.workspaceId, workspace.id),
            isNull(contacts.groupId),
            gte(contacts.createdAt, bounds.start),
            lt(contacts.createdAt, bounds.end)
          )
        ),
    ]);
    const copy = dailySummaryFor(
      bounds.dayKey,
      Number(appointmentRows[0]?.count ?? 0),
      Number(leadRows[0]?.count ?? 0)
    );
    const created = await db
      .insert(notifications)
      .values(
        uniqueRecipients.map(userId => ({
          workspaceId: workspace.id,
          userId,
          eventKey: dailySummaryEventKey(workspace.id, bounds.dayKey),
          type: copy.type,
          title: copy.title,
          body: copy.body,
          href: copy.href,
        }))
      )
      .onConflictDoNothing({
        target: [
          notifications.workspaceId,
          notifications.userId,
          notifications.eventKey,
        ],
      })
      .returning({ id: notifications.id });
    processed += created.length;
  }
  return { processed, skipped: false };
}

export async function processWorkspaceQuotaAlertsOnce(
  now = new Date(),
  onlyWorkspaceId?: number
) {
  const db = await getDb();
  if (!db) return { processed: 0, skipped: true };
  const bucketStart = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  const activeWorkspaces = await db
    .select()
    .from(workspaces)
    .where(
      onlyWorkspaceId
        ? and(eq(workspaces.active, 1), eq(workspaces.id, onlyWorkspaceId))
        : eq(workspaces.active, 1)
    );
  const metrics: WorkspaceUsageMetric[] = [
    "apiRequests",
    "aiRequests",
    "outboundMessages",
  ];
  let processed = 0;
  for (const workspace of activeWorkspaces) {
    const usage = (
      await db
        .select()
        .from(workspaceUsageBuckets)
        .where(
          and(
            eq(workspaceUsageBuckets.workspaceId, workspace.id),
            eq(workspaceUsageBuckets.bucketStart, bucketStart)
          )
        )
        .limit(1)
    )[0];
    if (!usage) continue;
    const recipients = await db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspace.id),
          eq(workspaceMembers.active, 1),
          inArray(workspaceMembers.role, ["owner", "admin", "manager"])
        )
      );
    if (recipients.length === 0) continue;
    for (const metric of metrics) {
      const used = Number(usage[metric] ?? 0);
      const limit = workspaceUsageLimitsForPlan(
        workspace.plan,
        metric
      ).workspaceLimit;
      if (limit <= 0) continue;
      for (const threshold of [70, 90] as const) {
        if (used * 100 < limit * threshold) continue;
        const copy = quotaAlertFor({ metric, threshold, used, limit });
        const eventKey = quotaAlertEventKey(
          workspace.id,
          bucketStart,
          metric,
          threshold
        );
        const created = await db
          .insert(notifications)
          .values(
            recipients.map(({ userId }) => ({
              workspaceId: workspace.id,
              userId,
              eventKey,
              type: copy.type,
              title: copy.title,
              body: copy.body,
              href: copy.href,
              createdAt: now,
            }))
          )
          .onConflictDoNothing({
            target: [
              notifications.workspaceId,
              notifications.userId,
              notifications.eventKey,
            ],
          })
          .returning({ id: notifications.id });
        processed += created.length;
      }
    }
  }
  return { processed, skipped: false };
}

export async function ensureDemoWorkspace() {
  const db = await getDb();
  if (!db) return undefined;
  const demoMode = process.env.DEMO_MODE === "true";
  const slug = demoMode
    ? DEMO_WORKSPACE_SLUG
    : (process.env.WORKSPACE_SLUG ?? "forte-workspace");
  const name = demoMode
    ? "Forte Serviços Demo"
    : (process.env.WORKSPACE_NAME ?? "Minha empresa");
  await db
    .insert(workspaces)
    .values({
      name,
      slug,
      segment: process.env.WORKSPACE_SEGMENT ?? "servicos",
      plan: "starter",
      timezone: process.env.WORKSPACE_TIMEZONE ?? "America/Sao_Paulo",
    })
    .onConflictDoUpdate({
      target: workspaces.slug,
      set: { name, updatedAt: new Date() },
    });
  const result = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.slug, slug))
    .limit(1);
  return result[0];
}

export async function ensureWorkspaceMember(
  workspaceId: number,
  userId: number,
  role: "owner" | "admin" | "manager" | "agent" = "owner"
) {
  const db = await getDb();
  if (!db) return undefined;
  const existing = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId)
      )
    )
    .limit(1);
  if (existing.length > 0) return existing[0];
  await db.insert(workspaceMembers).values({ workspaceId, userId, role });
  const created = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId)
      )
    )
    .limit(1);
  return created[0];
}

export async function ensureDemoWhatsappChannels() {
  const db = await getDb();
  if (!db || process.env.DEMO_MODE !== "true") return [];
  const workspace = await ensureDemoWorkspace();
  if (!workspace) return [];
  const existing = await db
    .select()
    .from(whatsappChannels)
    .where(eq(whatsappChannels.workspaceId, workspace.id));
  if (existing.length === 0) {
    await db.insert(whatsappChannels).values([
      {
        workspaceId: workspace.id,
        provider: "baileys",
        name: "Baileys · WhatsApp conectado",
        credentialsRef: "BAILEYS_API_KEY",
        active: 1,
      },
      {
        workspaceId: workspace.id,
        provider: "meta_cloud_api",
        name: "WhatsApp Cloud API oficial",
        credentialsRef: "META_WHATSAPP_ACCESS_TOKEN",
        active: 1,
      },
    ]);
  }
  return db
    .select()
    .from(whatsappChannels)
    .where(eq(whatsappChannels.workspaceId, workspace.id));
}

export async function listWhatsappChannels(workspaceId: number) {
  const db = await getDb();
  if (!db) return [];
  await ensureBaileysChannel(workspaceId);
  return db
    .select()
    .from(whatsappChannels)
    .where(
      and(
        eq(whatsappChannels.workspaceId, workspaceId),
        eq(whatsappChannels.active, 1)
      )
    );
}

export async function ensureBaileysChannel(workspaceId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  const existing = await db
    .select()
    .from(whatsappChannels)
    .where(
      and(
        eq(whatsappChannels.workspaceId, workspaceId),
        eq(whatsappChannels.provider, "baileys")
      )
    )
    .limit(1);
  if (existing[0]) return existing[0];
  const created = await db
    .insert(whatsappChannels)
    .values({
      workspaceId,
      provider: "baileys",
      name: "WhatsApp Comercial",
      credentialsRef: "BAILEYS_API_KEY",
      active: 1,
    })
    .returning();
  if (!created[0]) throw new Error("Não foi possível criar o canal Baileys");
  return created[0];
}

export type BaileysInstanceSummary = {
  id: number;
  workspaceId: number;
  channelId: number | null;
  instanceId: string;
  name: string;
  status: string;
  active: boolean;
  isDefault: boolean;
  lastSeenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function summarizeBaileysInstance(
  instance: typeof whatsappInstances.$inferSelect
): BaileysInstanceSummary {
  return {
    id: instance.id,
    workspaceId: instance.workspaceId,
    channelId: instance.channelId,
    instanceId: instance.instanceId,
    name: instance.name,
    status: instance.status,
    active: instance.active === 1,
    isDefault: instance.isDefault === 1,
    lastSeenAt: instance.lastSeenAt,
    createdAt: instance.createdAt,
    updatedAt: instance.updatedAt,
  };
}

export async function listBaileysInstances(workspaceId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  const rows = await db
    .select()
    .from(whatsappInstances)
    .where(
      and(
        eq(whatsappInstances.workspaceId, workspaceId),
        eq(whatsappInstances.provider, "baileys"),
        eq(whatsappInstances.active, 1)
      )
    )
    .orderBy(asc(whatsappInstances.id));
  return rows.map(summarizeBaileysInstance);
}

export async function getBaileysInstance(
  workspaceId: number,
  instanceId: string,
  includeInactive = false
) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  const conditions = [
    eq(whatsappInstances.workspaceId, workspaceId),
    eq(whatsappInstances.instanceId, instanceId),
    eq(whatsappInstances.provider, "baileys"),
  ];
  if (!includeInactive) conditions.push(eq(whatsappInstances.active, 1));
  const rows = await db
    .select()
    .from(whatsappInstances)
    .where(and(...conditions))
    .limit(1);
  return rows[0] ? summarizeBaileysInstance(rows[0]) : undefined;
}

export async function createBaileysInstance(
  workspaceId: number,
  channelId: number,
  instanceId: string,
  name: string
) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  const workspace = await getActiveWorkspaceById(workspaceId);
  if (!workspace) throw new Error("Workspace inativo ou não encontrado");
  const normalized = name.trim();
  if (normalized.length < 2 || normalized.length > 120)
    throw new Error("O nome da instância deve ter entre 2 e 120 caracteres");
  return db.transaction(async tx => {
    const active = await tx
      .select({ id: whatsappInstances.id })
      .from(whatsappInstances)
      .where(
        and(
          eq(whatsappInstances.workspaceId, workspaceId),
          eq(whatsappInstances.provider, "baileys"),
          eq(whatsappInstances.active, 1)
        )
      )
      .limit(1);
    const rows = await tx
      .insert(whatsappInstances)
      .values({
        workspaceId,
        channelId,
        provider: "baileys",
        deployment: "self_hosted",
        instanceId,
        name: normalized,
        status: "idle",
        active: 1,
        isDefault: active.length === 0 ? 1 : 0,
      })
      .returning();
    if (!rows[0]) throw new Error("Não foi possível salvar a instância Baileys");
    return summarizeBaileysInstance(rows[0]);
  });
}

export async function updateBaileysInstanceName(
  workspaceId: number,
  instanceId: string,
  name: string
) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  const normalized = name.trim();
  if (normalized.length < 2 || normalized.length > 120)
    throw new Error("O nome da instância deve ter entre 2 e 120 caracteres");
  const rows = await db
    .update(whatsappInstances)
    .set({ name: normalized, updatedAt: new Date() })
    .where(
      and(
        eq(whatsappInstances.workspaceId, workspaceId),
        eq(whatsappInstances.instanceId, instanceId),
        eq(whatsappInstances.provider, "baileys"),
        eq(whatsappInstances.active, 1)
      )
    )
    .returning();
  return rows[0] ? summarizeBaileysInstance(rows[0]) : undefined;
}

export async function archiveBaileysInstance(
  workspaceId: number,
  instanceId: string
) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  return db.transaction(async tx => {
    const rows = await tx
      .update(whatsappInstances)
      .set({ active: 0, isDefault: 0, status: "deleted", updatedAt: new Date() })
      .where(
        and(
          eq(whatsappInstances.workspaceId, workspaceId),
          eq(whatsappInstances.instanceId, instanceId),
          eq(whatsappInstances.provider, "baileys"),
          eq(whatsappInstances.active, 1)
        )
      )
      .returning();
    const archived = rows[0];
    if (!archived) return undefined;
    if (archived.isDefault === 1) {
      const next = await tx
        .select({ id: whatsappInstances.id })
        .from(whatsappInstances)
        .where(
          and(
            eq(whatsappInstances.workspaceId, workspaceId),
            eq(whatsappInstances.provider, "baileys"),
            eq(whatsappInstances.active, 1)
          )
        )
        .orderBy(asc(whatsappInstances.id))
        .limit(1);
      if (next[0])
        await tx
          .update(whatsappInstances)
          .set({ isDefault: 1, updatedAt: new Date() })
          .where(eq(whatsappInstances.id, next[0].id));
    }
    return summarizeBaileysInstance(archived);
  });
}

export async function findBaileysInstanceOwner(instanceId: string) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  const rows = await db
    .select({
      workspaceId: whatsappInstances.workspaceId,
      active: whatsappInstances.active,
    })
    .from(whatsappInstances)
    .where(
      and(
        eq(whatsappInstances.instanceId, instanceId),
        eq(whatsappInstances.provider, "baileys")
      )
    )
    .limit(1);
  const instance = rows[0];
  if (!instance) return undefined;
  const workspace = await getActiveWorkspaceById(instance.workspaceId);
  return {
    workspaceId: instance.workspaceId,
    active: instance.active === 1 && Boolean(workspace),
  };
}

export type PapiInstanceSummary = {
  id: number;
  workspaceId: number;
  instanceId: string;
  name: string;
  deployment: string;
  status: string;
  active: boolean;
  isDefault: boolean;
  apiKeyMasked: string;
  webhookId: string | null;
  lastHealthError: string | null;
  lastSeenAt: Date | null;
};

function summarizePapiInstance(
  instance: typeof whatsappInstances.$inferSelect
): PapiInstanceSummary {
  return {
    id: instance.id,
    workspaceId: instance.workspaceId,
    instanceId: instance.instanceId,
    name: instance.name,
    deployment: instance.deployment,
    status: instance.status,
    active: instance.active === 1,
    isDefault: instance.isDefault === 1,
    apiKeyMasked: maskProviderSecret(instance.encryptedApiKey ?? ""),
    webhookId: instance.webhookId,
    lastHealthError: instance.lastHealthError,
    lastSeenAt: instance.lastSeenAt,
  };
}

export async function listPapiInstances(workspaceId: number) {
  const db = await getDb();
  const workspace = await getActiveWorkspaceById(workspaceId);
  if (!db || !workspace) return [];
  const existingRows = await db
    .select()
    .from(whatsappInstances)
    .where(eq(whatsappInstances.workspaceId, workspace.id))
    .orderBy(asc(whatsappInstances.id));
  const rows = await db
    .select()
    .from(whatsappInstances)
    .where(eq(whatsappInstances.workspaceId, workspace.id))
    .orderBy(asc(whatsappInstances.id));
  return rows.map(summarizePapiInstance);
}

export async function upsertPapiInstance(
  workspaceId: number,
  input: {
    instanceId: string;
    name: string;
    deployment?: "self_hosted" | "cloud";
    apiKey?: string | null;
    webhookId?: string | null;
    webhookSecret?: string | null;
    status?: string;
    active?: boolean;
  }
) {
  const db = await getDb();
  const workspace = await getActiveWorkspaceById(workspaceId);
  if (!db || !workspace) throw new Error("Workspace unavailable");
  const instanceId = input.instanceId.trim();
  if (!instanceId) throw new Error("instanceId é obrigatório");
  const existing = await db
    .select()
    .from(whatsappInstances)
    .where(
      and(
        eq(whatsappInstances.workspaceId, workspace.id),
        eq(whatsappInstances.instanceId, instanceId)
      )
    )
    .limit(1);
  const values = {
    workspaceId: workspace.id,
    provider: "papi" as const,
    deployment: input.deployment ?? "self_hosted",
    instanceId,
    name: input.name.trim() || instanceId,
    ...(input.apiKey !== undefined
      ? {
          encryptedApiKey: input.apiKey
            ? encryptProviderSecret(input.apiKey)
            : null,
        }
      : {}),
    ...(input.webhookId !== undefined ? { webhookId: input.webhookId } : {}),
    ...(input.webhookSecret !== undefined
      ? {
          encryptedWebhookSecret: input.webhookSecret
            ? encryptProviderSecret(input.webhookSecret)
            : null,
        }
      : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.active !== undefined ? { active: input.active ? 1 : 0 } : {}),
    updatedAt: new Date(),
  };
  if (existing[0]) {
    const updated = await db
      .update(whatsappInstances)
      .set(values)
      .where(eq(whatsappInstances.id, existing[0].id))
      .returning();
    return summarizePapiInstance(updated[0]);
  }
  const created = await db
    .insert(whatsappInstances)
    .values({ ...values, isDefault: 0 })
    .returning();
  return summarizePapiInstance(created[0]);
}

export async function getPapiInstanceSecret(
  workspaceId: number,
  instanceId: string
) {
  const db = await getDb();
  if (!db) return "";
  const row = await db
    .select({ encryptedApiKey: whatsappInstances.encryptedApiKey })
    .from(whatsappInstances)
    .where(
      and(
        eq(whatsappInstances.workspaceId, workspaceId),
        eq(whatsappInstances.instanceId, instanceId),
        eq(whatsappInstances.active, 1)
      )
    )
    .limit(1);
  return decryptProviderSecret(row[0]?.encryptedApiKey ?? "");
}

export async function updatePapiInstanceApiKey(
  workspaceId: number,
  instanceId: string,
  apiKey: string
) {
  const db = await getDb();
  const workspace = await getActiveWorkspaceById(workspaceId);
  if (!db || !workspace) throw new Error("Workspace unavailable");
  const updated = await db
    .update(whatsappInstances)
    .set({
      encryptedApiKey: encryptProviderSecret(apiKey),
      status: "configured",
      lastHealthError: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(whatsappInstances.workspaceId, workspace.id),
        eq(whatsappInstances.instanceId, instanceId),
        eq(whatsappInstances.active, 1)
      )
    )
    .returning();
  if (!updated[0]) throw new Error("Instância PAPI não encontrada ou inativa");
  return summarizePapiInstance(updated[0]);
}

export async function setDefaultPapiInstance(workspaceId: number, id: number) {
  const db = await getDb();
  const workspace = await getActiveWorkspaceById(workspaceId);
  if (!db || !workspace) throw new Error("Workspace unavailable");
  return db.transaction(async tx => {
    await tx
      .update(whatsappInstances)
      .set({ isDefault: 0, updatedAt: new Date() })
      .where(eq(whatsappInstances.workspaceId, workspace.id));
    const selected = await tx
      .update(whatsappInstances)
      .set({ isDefault: 1, updatedAt: new Date() })
      .where(
        and(
          eq(whatsappInstances.id, id),
          eq(whatsappInstances.workspaceId, workspace.id),
          eq(whatsappInstances.active, 1)
        )
      )
      .returning();
    if (!selected[0])
      throw new Error("Instância PAPI não encontrada ou inativa");
    if (selected[0].webhookId) {
      await tx
        .update(workspaceSettings)
        .set({ value: selected[0].webhookId, updatedAt: new Date() })
        .where(
          and(
            eq(workspaceSettings.workspaceId, workspace.id),
            eq(workspaceSettings.key, PAPI_DEFAULT_WEBHOOK_SETTING)
          )
        );
    }
    return summarizePapiInstance(selected[0]);
  });
}

export async function getDefaultWhatsappProvider(
  workspaceId: number
): Promise<WhatsappProvider> {
  const db = await getDb();
  const baileysConfigured = Boolean(
    process.env.BAILEYS_BASE_URL?.trim() && process.env.BAILEYS_API_KEY?.trim()
  );
  if (!db) return "baileys";
  const setting = await db
    .select()
    .from(workspaceSettings)
    .where(
      and(
        eq(workspaceSettings.workspaceId, workspaceId),
        eq(workspaceSettings.key, "default_whatsapp_provider")
      )
    )
    .limit(1);
  if (setting[0]?.value === "meta_cloud_api") return "meta_cloud_api";
  if (setting[0]?.value === "baileys") return "baileys";
  return "baileys";
}

export async function setDefaultWhatsappProvider(
  workspaceId: number,
  provider: WhatsappProvider
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const workspace = await getActiveWorkspaceById(workspaceId);
  if (!workspace) throw new Error("Workspace unavailable");
  const existing = await db
    .select()
    .from(workspaceSettings)
    .where(
      and(
        eq(workspaceSettings.workspaceId, workspace.id),
        eq(workspaceSettings.key, "default_whatsapp_provider")
      )
    )
    .limit(1);
  if (existing[0]) {
    await db
      .update(workspaceSettings)
      .set({ value: provider, updatedAt: new Date() })
      .where(eq(workspaceSettings.id, existing[0].id));
  } else {
    await db.insert(workspaceSettings).values({
      workspaceId: workspace.id,
      key: "default_whatsapp_provider",
      value: provider,
    });
  }
  return provider;
}

export type PapiWebhookConfig = {
  id: string;
  name: string;
  instanceId: string;
  secret: string;
  createdAt: string;
  legacy?: boolean;
};

export type PapiIntegrationConfig = {
  webhooks: Array<
    Omit<PapiWebhookConfig, "secret"> & {
      secretMasked: string;
      webhookUrl: string;
    }
  >;
  defaultWebhookId: string | null;
};

const PAPI_WEBHOOKS_SETTING = "papi_webhooks";
const PAPI_DEFAULT_WEBHOOK_SETTING = "papi_default_webhook";

function papiWebhookBaseUrl() {
  const configured = process.env.PAPI_WEBHOOK_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const publicUrl = process.env.PANEL_PUBLIC_URL?.trim();
  if (publicUrl)
    return `${publicUrl.replace(/\/$/, "")}/api/v1/webhooks/providers/papi`;
  return "http://forte-panel:3000/api/v1/webhooks/providers/papi";
}

async function getStoredPapiWebhooks(workspaceId: number) {
  const workspace = await getActiveWorkspaceById(workspaceId);
  if (!workspace)
    return { workspace: undefined, webhooks: [] as PapiWebhookConfig[] };
  const setting = await getWorkspaceSetting(
    workspace.id,
    PAPI_WEBHOOKS_SETTING
  );
  let webhooks: PapiWebhookConfig[] = [];
  if (setting?.value) {
    try {
      const stored = JSON.parse(setting.value) as PapiWebhookConfig[];
      webhooks = stored.map(webhook => ({
        ...webhook,
        secret: decryptProviderSecret(webhook.secret),
      }));
    } catch {
      webhooks = [];
    }
  }
  return { workspace, webhooks };
}

function serializePapiWebhooks(webhooks: PapiWebhookConfig[]) {
  return webhooks.map(webhook => ({
    ...webhook,
    secret: encryptProviderSecret(webhook.secret),
  }));
}

function withPapiWebhookUrl(webhook: PapiWebhookConfig, includeSecret = false) {
  const base = papiWebhookBaseUrl();
  const { secret, ...safeWebhook } = webhook;
  return {
    ...safeWebhook,
    ...(includeSecret ? { secret } : {}),
    secretMasked: secret
      ? `${secret.slice(0, 4)}…${secret.slice(-4)}`
      : "não configurado",
    webhookUrl: webhook.legacy
      ? base
      : `${base}/${encodeURIComponent(webhook.id)}`,
  };
}

export async function getPapiIntegrationConfig(
  workspaceId: number
): Promise<PapiIntegrationConfig> {
  const { workspace, webhooks } = await getStoredPapiWebhooks(workspaceId);
  const setting = workspace
    ? await getWorkspaceSetting(workspace.id, PAPI_DEFAULT_WEBHOOK_SETTING)
    : undefined;
  const defaultWebhookId = setting?.value || (webhooks[0]?.id ?? null);
  return {
    webhooks: webhooks.map(webhook => withPapiWebhookUrl(webhook)),
    defaultWebhookId,
  };
}

export async function getPapiWebhookById(id: string, workspaceId: number) {
  const { webhooks } = await getStoredPapiWebhooks(workspaceId);
  return webhooks.find(webhook => webhook.id === id);
}

export async function getDefaultPapiWebhook(workspaceId: number) {
  const config = await getPapiIntegrationConfig(workspaceId);
  return (
    config.webhooks.find(webhook => webhook.id === config.defaultWebhookId) ??
    config.webhooks[0]
  );
}

export async function createPapiWebhook(
  workspaceId: number,
  input: { name: string; instanceId: string }
) {
  const { workspace, webhooks } = await getStoredPapiWebhooks(workspaceId);
  if (!workspace) throw new Error("Workspace unavailable");
  const webhook: PapiWebhookConfig = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    instanceId: input.instanceId.trim(),
    secret: crypto.randomBytes(24).toString("hex"),
    createdAt: new Date().toISOString(),
  };
  await upsertWorkspaceSetting(
    workspace.id,
    PAPI_WEBHOOKS_SETTING,
    JSON.stringify(
      serializePapiWebhooks([...webhooks.filter(item => !item.legacy), webhook])
    )
  );
  if (webhooks.length === 0 || webhooks.every(item => item.legacy))
    await upsertWorkspaceSetting(
      workspace.id,
      PAPI_DEFAULT_WEBHOOK_SETTING,
      webhook.id
    );
  await upsertPapiInstance(workspaceId, {
    instanceId: webhook.instanceId,
    name: webhook.name,
    deployment: ENV.papiDeployment as "self_hosted" | "cloud",
    apiKey:
      ENV.papiDeployment === "self_hosted"
        ? (process.env.PAPI_API_KEY ?? null)
        : undefined,
    webhookId: webhook.id,
    webhookSecret: webhook.secret,
    status: "configured",
  });
  return withPapiWebhookUrl(webhook, true);
}

export async function setDefaultPapiWebhook(workspaceId: number, id: string) {
  const db = await getDb();
  const { workspace, webhooks } = await getStoredPapiWebhooks(workspaceId);
  if (!db || !workspace || !webhooks.some(webhook => webhook.id === id))
    throw new Error("Webhook PAPI não encontrado");
  await upsertWorkspaceSetting(workspace.id, PAPI_DEFAULT_WEBHOOK_SETTING, id);
  await db
    .update(whatsappInstances)
    .set({ isDefault: 0, updatedAt: new Date() })
    .where(eq(whatsappInstances.workspaceId, workspace.id));
  await db
    .update(whatsappInstances)
    .set({ isDefault: 1, updatedAt: new Date() })
    .where(
      and(
        eq(whatsappInstances.workspaceId, workspace.id),
        eq(whatsappInstances.webhookId, id),
        eq(whatsappInstances.active, 1)
      )
    );
  return id;
}

export async function deletePapiWebhook(workspaceId: number, id: string) {
  const db = await getDb();
  const { workspace, webhooks } = await getStoredPapiWebhooks(workspaceId);
  if (!db || !workspace) throw new Error("Workspace unavailable");
  const next = webhooks.filter(webhook => webhook.id !== id && !webhook.legacy);
  await upsertWorkspaceSetting(
    workspace.id,
    PAPI_WEBHOOKS_SETTING,
    JSON.stringify(serializePapiWebhooks(next))
  );
  await db
    .update(whatsappInstances)
    .set({ active: 0, isDefault: 0, updatedAt: new Date() })
    .where(
      and(
        eq(whatsappInstances.workspaceId, workspace.id),
        eq(whatsappInstances.webhookId, id)
      )
    );
  const config = await getPapiIntegrationConfig(workspaceId);
  if (config.defaultWebhookId === id)
    await upsertWorkspaceSetting(
      workspace.id,
      PAPI_DEFAULT_WEBHOOK_SETTING,
      next[0]?.id ?? ""
    );
}

export type OnboardingProfile = {
  businessName: string;
  segment: string;
  description: string;
  services: string;
  serviceArea: string;
  businessHours: string;
  toneOfVoice: string;
  forbiddenWords: string;
  faq: string;
  cancellationPolicy: string;
  humanHandoffRules: string;
  qualificationRules: string;
};

const emptyOnboardingProfile: OnboardingProfile = {
  businessName: "",
  segment: "servicos",
  description: "",
  services: "",
  serviceArea: "",
  businessHours: "",
  toneOfVoice: "profissional, claro e cordial",
  forbiddenWords: "",
  faq: "",
  cancellationPolicy: "",
  humanHandoffRules: "",
  qualificationRules: "",
};

export type OnboardingChecklistItem = {
  id: string;
  title: string;
  description: string;
  complete: boolean;
  required: boolean;
};

export function getOnboardingChecklist(
  profile: OnboardingProfile,
  published: boolean
) {
  const items: OnboardingChecklistItem[] = [
    {
      id: "identity",
      title: "Identidade da empresa",
      description: "Nome, segmento e descrição do negócio",
      complete: Boolean(profile.businessName.trim() && profile.segment.trim() && profile.description.trim()),
      required: true,
    },
    {
      id: "offering",
      title: "Oferta e serviços",
      description: "Serviços, preços, duração ou regras de orçamento",
      complete: Boolean(profile.services.trim()),
      required: true,
    },
    {
      id: "operations",
      title: "Área e horários",
      description: "Onde atende e quando a equipe está disponível",
      complete: Boolean(profile.serviceArea.trim() && profile.businessHours.trim()),
      required: true,
    },
    {
      id: "guardrails",
      title: "Limites do atendimento",
      description: "Condutas proibidas e quando transferir para humano",
      complete: Boolean(profile.forbiddenWords.trim() && profile.humanHandoffRules.trim()),
      required: true,
    },
    {
      id: "voice",
      title: "Tom e respostas aprovadas",
      description: "Tom de voz e perguntas frequentes",
      complete: Boolean(profile.toneOfVoice.trim() && profile.faq.trim()),
      required: false,
    },
    {
      id: "publication",
      title: "Revisão e publicação",
      description: "Publique somente depois de revisar as regras",
      complete: published,
      required: false,
    },
  ];
  const requiredItems = items.filter(item => item.required);
  const requiredComplete = requiredItems.every(item => item.complete);
  const completedCount = items.filter(item => item.complete).length;
  const next = items.find(item => !item.complete);
  return {
    items,
    completedCount,
    totalCount: items.length,
    completionPercent: Math.round((completedCount / items.length) * 100),
    requiredComplete,
    readyToPublish: requiredComplete,
    nextStep: next
      ? { id: next.id, title: next.title, description: next.description }
      : null,
  };
}

export type OnboardingSessionStatus = "active" | "paused" | "completed";

export async function getOnboardingSession(workspaceId: number) {
  const db = await getDb();
  if (!db) return undefined;
  return (
    await db
      .select()
      .from(onboardingSessions)
      .where(eq(onboardingSessions.workspaceId, workspaceId))
      .limit(1)
  )[0];
}

export type OnboardingTelemetryEventInput = {
  workspaceId: number;
  sessionId: number;
  eventType: string;
  stepKey?: string | null;
  source?: string | null;
  durationMs?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  correction?: boolean;
  metadata?: Record<string, string | number | boolean | null>;
};

export async function recordOnboardingTelemetry(input: OnboardingTelemetryEventInput) {
  const db = await getDb();
  if (!db) return undefined;
  const [event] = await db
    .insert(onboardingTelemetryEvents)
    .values({
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      eventType: input.eventType.slice(0, 64),
      stepKey: input.stepKey?.slice(0, 80) ?? null,
      source: input.source?.slice(0, 24) ?? null,
      durationMs: input.durationMs ?? null,
      inputTokens: input.inputTokens ?? null,
      outputTokens: input.outputTokens ?? null,
      totalTokens: input.totalTokens ?? null,
      correction: input.correction ? 1 : 0,
      metadata: input.metadata,
    })
    .returning({ id: onboardingTelemetryEvents.id });
  return event;
}

export async function getOnboardingTelemetrySummary(workspaceId: number, windowDays = 30) {
  const db = await getDb();
  const empty = {
    windowDays,
    started: 0,
    completed: 0,
    abandoned: 0,
    corrections: 0,
    followUps: 0,
    conflictFollowUps: 0,
    audioDurationMs: 0,
    llmCalls: 0,
    llmTotalTokens: 0,
    averageCompletedDurationMs: null as number | null,
    eventsByType: {} as Record<string, number>,
  };
  if (!db) return empty;
  const safeWindowDays = Math.min(90, Math.max(1, windowDays));
  const since = new Date(Date.now() - safeWindowDays * 24 * 60 * 60 * 1000);
  const events = await db
    .select()
    .from(onboardingTelemetryEvents)
    .where(and(eq(onboardingTelemetryEvents.workspaceId, workspaceId), gte(onboardingTelemetryEvents.createdAt, since)))
    .limit(50_000);
  const eventsByType: Record<string, number> = {};
  let audioDurationMs = 0;
  let llmTotalTokens = 0;
  let llmCalls = 0;
  let corrections = 0;
  let followUps = 0;
  let conflictFollowUps = 0;
  const completedDurations: number[] = [];
  for (const event of events) {
    eventsByType[event.eventType] = (eventsByType[event.eventType] ?? 0) + 1;
    if (event.eventType === "audio_uploaded") audioDurationMs += event.durationMs ?? 0;
    if (event.eventType === "llm_proposal_created") {
      llmCalls += 1;
      llmTotalTokens += event.totalTokens ?? 0;
    }
    if (event.correction) corrections += 1;
    if (event.eventType === "follow_up_answered") followUps += 1;
    if (event.eventType === "conflict_follow_up_answered") conflictFollowUps += 1;
    if (event.eventType === "session_completed" && event.durationMs !== null) completedDurations.push(event.durationMs);
  }
  const sessions = await db
    .select({ status: onboardingSessions.status, lastActivityAt: onboardingSessions.lastActivityAt })
    .from(onboardingSessions)
    .where(eq(onboardingSessions.workspaceId, workspaceId))
    .limit(1);
  const session = sessions[0];
  const abandoned = session && session.status !== "completed" && session.lastActivityAt < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) ? 1 : 0;
  return {
    ...empty,
    windowDays: safeWindowDays,
    started: eventsByType.session_started ?? 0,
    completed: eventsByType.session_completed ?? 0,
    abandoned,
    corrections,
    followUps,
    conflictFollowUps,
    audioDurationMs,
    llmCalls,
    llmTotalTokens,
    averageCompletedDurationMs: completedDurations.length
      ? Math.round(completedDurations.reduce((total, duration) => total + duration, 0) / completedDurations.length)
      : null,
    eventsByType,
  };
}

export async function startOnboardingSession(workspaceId: number, ownerUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const now = new Date();
  const existing = await getOnboardingSession(workspaceId);
  if (existing) {
    const [session] = await db
      .update(onboardingSessions)
      .set({ ownerUserId, status: "active", pausedAt: null, lastActivityAt: now, updatedAt: now })
      .where(eq(onboardingSessions.id, existing.id))
      .returning();
    await recordOnboardingTelemetry({
      workspaceId,
      sessionId: session.id,
      eventType: "session_started",
      metadata: { resumed: true },
    });
    return session;
  }
  const [session] = await db
    .insert(onboardingSessions)
    .values({ workspaceId, ownerUserId, status: "active", startedAt: now, lastActivityAt: now, updatedAt: now })
    .returning();
  await recordOnboardingTelemetry({
    workspaceId,
    sessionId: session.id,
    eventType: "session_started",
    metadata: { resumed: false },
  });
  return session;
}

export async function pauseOnboardingSession(workspaceId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const now = new Date();
  const [session] = await db
    .update(onboardingSessions)
    .set({ status: "paused", pausedAt: now, lastActivityAt: now, updatedAt: now })
    .where(eq(onboardingSessions.workspaceId, workspaceId))
    .returning();
  if (session)
    await recordOnboardingTelemetry({
      workspaceId,
      sessionId: session.id,
      eventType: "session_paused",
    });
  return session;
}

async function touchOnboardingSession(workspaceId: number, nextStep: string | null, completed: boolean) {
  const db = await getDb();
  if (!db) return;
  const now = new Date();
  const existing = completed ? await getOnboardingSession(workspaceId) : undefined;
  await db
    .update(onboardingSessions)
    .set({
      status: completed ? "completed" : "active",
      currentStep: nextStep ?? "review",
      lastActivityAt: now,
      completedAt: completed ? now : null,
      updatedAt: now,
    })
    .where(eq(onboardingSessions.workspaceId, workspaceId));
  if (completed && existing)
    await recordOnboardingTelemetry({
      workspaceId,
      sessionId: existing.id,
      eventType: "session_completed",
      durationMs: Math.max(0, now.getTime() - existing.startedAt.getTime()),
    });
}

export type OnboardingStepAnswerPayload = {
  stepKey: "identity" | "offering" | "operations" | "guardrails" | "voice";
  answer: Record<string, string>;
  source: "human_form";
  confidence: number;
  missing: string[];
  conflicts: string[];
};

export const requiredOnboardingStepKeys = [
  "identity",
  "offering",
  "operations",
  "guardrails",
] as const;
export const confirmableOnboardingStepKeys = [
  ...requiredOnboardingStepKeys,
  "voice",
] as const;
export const onboardingAnswerSources = [
  "human_form",
  "transcription",
  "llm",
  "import",
] as const;

export type OnboardingAnswerSource = (typeof onboardingAnswerSources)[number];

export function validateOnboardingAnswerMetadata(input: {
  source: string;
  confidence: number | null;
  missing: string[];
  conflicts: string[];
}) {
  const errors: string[] = [];
  if (!onboardingAnswerSources.includes(input.source as OnboardingAnswerSource))
    errors.push("source_invalid");
  if (input.confidence !== null && (!Number.isInteger(input.confidence) || input.confidence < 0 || input.confidence > 100))
    errors.push("confidence_out_of_range");
  if (input.source === "human_form" && input.confidence !== 100)
    errors.push("human_form_confidence_must_be_100");
  if (input.missing.some(field => !field.trim())) errors.push("missing_field_invalid");
  if (input.conflicts.some(conflict => !conflict.trim())) errors.push("conflict_invalid");
  return { valid: errors.length === 0, errors };
}

export function buildOnboardingStepAnswers(profile: OnboardingProfile): OnboardingStepAnswerPayload[] {
  const base: Array<Pick<OnboardingStepAnswerPayload, "stepKey" | "answer">> = [
    {
      stepKey: "identity",
      answer: {
        businessName: profile.businessName,
        segment: profile.segment,
        description: profile.description,
      },
    },
    { stepKey: "offering", answer: { services: profile.services } },
    {
      stepKey: "operations",
      answer: { serviceArea: profile.serviceArea, businessHours: profile.businessHours },
    },
    {
      stepKey: "guardrails",
      answer: {
        forbiddenWords: profile.forbiddenWords,
        humanHandoffRules: profile.humanHandoffRules,
      },
    },
    {
      stepKey: "voice",
      answer: {
        toneOfVoice: profile.toneOfVoice,
        faq: profile.faq,
        cancellationPolicy: profile.cancellationPolicy,
        qualificationRules: profile.qualificationRules,
      },
    },
  ];
  return base.map(payload => ({
    ...payload,
    source: "human_form" as const,
    confidence: 100,
    missing: Object.entries(payload.answer)
      .filter(([, value]) => !value.trim())
      .map(([key]) => key),
    conflicts: [],
  }));
}

async function listOnboardingStepAnswers(workspaceId: number) {
  const db = await getDb();
  const session = await getOnboardingSession(workspaceId);
  if (!db || !session) return [];
  const rows = await db
    .select({
      stepKey: onboardingStepAnswers.stepKey,
      answer: onboardingStepAnswers.answer,
      source: onboardingStepAnswers.source,
      confidence: onboardingStepAnswers.confidence,
      missing: onboardingStepAnswers.missing,
      conflicts: onboardingStepAnswers.conflicts,
      status: onboardingStepAnswers.status,
      updatedAt: onboardingStepAnswers.updatedAt,
    })
    .from(onboardingStepAnswers)
    .where(
      and(
        eq(onboardingStepAnswers.workspaceId, workspaceId),
        eq(onboardingStepAnswers.sessionId, session.id)
      )
    )
    .orderBy(onboardingStepAnswers.id);
  const revisions = await db
    .select({
      id: onboardingStepAnswerRevisions.id,
      stepKey: onboardingStepAnswerRevisions.stepKey,
      answer: onboardingStepAnswerRevisions.answer,
      source: onboardingStepAnswerRevisions.source,
      confidence: onboardingStepAnswerRevisions.confidence,
      missing: onboardingStepAnswerRevisions.missing,
      conflicts: onboardingStepAnswerRevisions.conflicts,
      status: onboardingStepAnswerRevisions.status,
      changedBy: onboardingStepAnswerRevisions.changedBy,
      createdAt: onboardingStepAnswerRevisions.createdAt,
    })
    .from(onboardingStepAnswerRevisions)
    .where(
      and(
        eq(onboardingStepAnswerRevisions.workspaceId, workspaceId),
        eq(onboardingStepAnswerRevisions.sessionId, session.id)
      )
    )
    .orderBy(desc(onboardingStepAnswerRevisions.createdAt));
  const revisionsByStep = new Map<string, typeof revisions>();
  for (const revision of revisions) {
    const current = revisionsByStep.get(revision.stepKey) ?? [];
    current.push(revision);
    revisionsByStep.set(revision.stepKey, current);
  }
  return rows.map(row => ({
    ...row,
    answer: JSON.parse(row.answer) as Record<string, string>,
    missing: JSON.parse(row.missing) as string[],
    conflicts: JSON.parse(row.conflicts) as string[],
    revisions: (revisionsByStep.get(row.stepKey) ?? []).map(revision => ({
      ...revision,
      answer: JSON.parse(revision.answer) as Record<string, string>,
      missing: JSON.parse(revision.missing) as string[],
      conflicts: JSON.parse(revision.conflicts) as string[],
    })),
  }));
}

async function persistOnboardingStepAnswers(
  workspaceId: number,
  profile: OnboardingProfile,
  updatedBy: number | undefined
) {
  const db = await getDb();
  const session = await getOnboardingSession(workspaceId);
  if (!db || !session) return;
  const now = new Date();
  for (const payload of buildOnboardingStepAnswers(profile)) {
    const quality = validateOnboardingAnswerMetadata(payload);
    if (!quality.valid) throw new Error(`ONBOARDING_ANSWER_METADATA_INVALID:${quality.errors.join(",")}`);
    const serializedAnswer = JSON.stringify(payload.answer);
    const existing = (
      await db
        .select({ id: onboardingStepAnswers.id, answer: onboardingStepAnswers.answer, status: onboardingStepAnswers.status })
        .from(onboardingStepAnswers)
        .where(
          and(
            eq(onboardingStepAnswers.sessionId, session.id),
            eq(onboardingStepAnswers.stepKey, payload.stepKey)
          )
        )
        .limit(1)
    )[0];
    const status = existing?.answer === serializedAnswer && existing.status === "confirmed"
      ? "confirmed"
      : "draft";
    const [savedAnswer] = await db
      .insert(onboardingStepAnswers)
      .values({
        sessionId: session.id,
        workspaceId,
        stepKey: payload.stepKey,
        answer: serializedAnswer,
        source: payload.source,
        confidence: payload.confidence,
        missing: JSON.stringify(payload.missing),
        conflicts: JSON.stringify(payload.conflicts),
        status,
        updatedBy,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [onboardingStepAnswers.sessionId, onboardingStepAnswers.stepKey],
        set: {
          answer: serializedAnswer,
          source: payload.source,
          confidence: payload.confidence,
          missing: JSON.stringify(payload.missing),
          conflicts: JSON.stringify(payload.conflicts),
          status,
          updatedBy,
          updatedAt: now,
        },
      })
      .returning({ id: onboardingStepAnswers.id });
    const answerId = existing?.id ?? savedAnswer?.id;
    if (answerId && (!existing || existing.answer !== serializedAnswer))
      await db.insert(onboardingStepAnswerRevisions).values({
        answerId,
        sessionId: session.id,
        workspaceId,
        stepKey: payload.stepKey,
        answer: serializedAnswer,
        source: payload.source,
        confidence: payload.confidence,
        missing: JSON.stringify(payload.missing),
        conflicts: JSON.stringify(payload.conflicts),
        status,
        changedBy: updatedBy,
      });
  }
}

export async function confirmOnboardingStep(
  workspaceId: number,
  stepKey: (typeof confirmableOnboardingStepKeys)[number],
  updatedBy: number
) {
  const db = await getDb();
  const session = await getOnboardingSession(workspaceId);
  if (!db || !session) throw new Error("ONBOARDING_SESSION_NOT_FOUND");
  const current = (
    await db
      .select({ conflicts: onboardingStepAnswers.conflicts })
      .from(onboardingStepAnswers)
      .where(
        and(
          eq(onboardingStepAnswers.workspaceId, workspaceId),
          eq(onboardingStepAnswers.sessionId, session.id),
          eq(onboardingStepAnswers.stepKey, stepKey)
        )
      )
      .limit(1)
  )[0];
  if (current && (JSON.parse(current.conflicts) as string[]).length > 0)
    throw new Error("ONBOARDING_CONFLICTS_UNRESOLVED");
  const [answer] = await db
    .update(onboardingStepAnswers)
    .set({ status: "confirmed", updatedBy, updatedAt: new Date() })
    .where(
      and(
        eq(onboardingStepAnswers.workspaceId, workspaceId),
        eq(onboardingStepAnswers.sessionId, session.id),
        eq(onboardingStepAnswers.stepKey, stepKey)
      )
    )
    .returning({
      id: onboardingStepAnswers.id,
      sessionId: onboardingStepAnswers.sessionId,
      workspaceId: onboardingStepAnswers.workspaceId,
      stepKey: onboardingStepAnswers.stepKey,
      answer: onboardingStepAnswers.answer,
      source: onboardingStepAnswers.source,
      confidence: onboardingStepAnswers.confidence,
      missing: onboardingStepAnswers.missing,
      conflicts: onboardingStepAnswers.conflicts,
    });
  if (!answer) throw new Error("ONBOARDING_STEP_NOT_FOUND");
  await db.insert(onboardingStepAnswerRevisions).values({
    answerId: answer.id,
    sessionId: answer.sessionId,
    workspaceId: answer.workspaceId,
    stepKey: answer.stepKey,
    answer: answer.answer,
    source: answer.source,
    confidence: answer.confidence,
    missing: answer.missing,
    conflicts: answer.conflicts,
    status: "confirmed",
    changedBy: updatedBy,
  });
  return answer;
}

export async function persistOnboardingStepAnswerProposal(input: {
  workspaceId: number;
  stepKey: (typeof confirmableOnboardingStepKeys)[number];
  answer: Record<string, string>;
  source: OnboardingAnswerSource;
  confidence: number;
  missing: string[];
  conflicts: string[];
  updatedBy: number;
}) {
  const db = await getDb();
  const session = await getOnboardingSession(input.workspaceId);
  if (!db || !session) throw new Error("ONBOARDING_SESSION_NOT_FOUND");
  const quality = validateOnboardingAnswerMetadata(input);
  if (!quality.valid)
    throw new Error(`ONBOARDING_ANSWER_METADATA_INVALID:${quality.errors.join(",")}`);
  const serializedAnswer = JSON.stringify(input.answer);
  const existing = (
    await db
      .select({ id: onboardingStepAnswers.id, answer: onboardingStepAnswers.answer })
      .from(onboardingStepAnswers)
      .where(
        and(
          eq(onboardingStepAnswers.sessionId, session.id),
          eq(onboardingStepAnswers.workspaceId, input.workspaceId),
          eq(onboardingStepAnswers.stepKey, input.stepKey)
        )
      )
      .limit(1)
  )[0];
  const now = new Date();
  const [saved] = await db
    .insert(onboardingStepAnswers)
    .values({
      sessionId: session.id,
      workspaceId: input.workspaceId,
      stepKey: input.stepKey,
      answer: serializedAnswer,
      source: input.source,
      confidence: input.confidence,
      missing: JSON.stringify(input.missing),
      conflicts: JSON.stringify(input.conflicts),
      status: "draft",
      updatedBy: input.updatedBy,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [onboardingStepAnswers.sessionId, onboardingStepAnswers.stepKey],
      set: {
        answer: serializedAnswer,
        source: input.source,
        confidence: input.confidence,
        missing: JSON.stringify(input.missing),
        conflicts: JSON.stringify(input.conflicts),
        status: "draft",
        updatedBy: input.updatedBy,
        updatedAt: now,
      },
    })
    .returning({ id: onboardingStepAnswers.id });
  const answerId = existing?.id ?? saved?.id;
  if (answerId && (!existing || existing.answer !== serializedAnswer))
    await db.insert(onboardingStepAnswerRevisions).values({
      answerId,
      sessionId: session.id,
      workspaceId: input.workspaceId,
      stepKey: input.stepKey,
      answer: serializedAnswer,
      source: input.source,
      confidence: input.confidence,
      missing: JSON.stringify(input.missing),
      conflicts: JSON.stringify(input.conflicts),
      status: "draft",
      changedBy: input.updatedBy,
    });
  return {
    id: answerId,
    sessionId: session.id,
    workspaceId: input.workspaceId,
    stepKey: input.stepKey,
    answer: input.answer,
    source: input.source,
    confidence: input.confidence,
    missing: input.missing,
    conflicts: input.conflicts,
    status: "draft" as const,
  };
}

export async function applyOnboardingFollowUpAnswer(input: {
  workspaceId: number;
  stepKey: (typeof confirmableOnboardingStepKeys)[number];
  field: string;
  value: string;
  updatedBy: number;
}) {
  const db = await getDb();
  const session = await getOnboardingSession(input.workspaceId);
  if (!db || !session) throw new Error("ONBOARDING_SESSION_NOT_FOUND");
  const allowedFields = onboardingFollowUpFieldKeys[input.stepKey] as readonly string[];
  if (!allowedFields.includes(input.field)) throw new Error("ONBOARDING_FOLLOW_UP_FIELD_INVALID");
  const [current] = await db
    .select()
    .from(onboardingStepAnswers)
    .where(
      and(
        eq(onboardingStepAnswers.workspaceId, input.workspaceId),
        eq(onboardingStepAnswers.sessionId, session.id),
        eq(onboardingStepAnswers.stepKey, input.stepKey)
      )
    )
    .limit(1);
  if (!current) throw new Error("ONBOARDING_STEP_NOT_FOUND");
  const answer = JSON.parse(current.answer) as Record<string, string>;
  const missing = JSON.parse(current.missing) as string[];
  const conflicts = JSON.parse(current.conflicts) as string[];
  const value = input.value.trim().slice(0, 8_000);
  if (!value) throw new Error("ONBOARDING_FOLLOW_UP_VALUE_REQUIRED");
  answer[input.field] = value;
  const deferred = value.toLocaleLowerCase() === "decidir depois" || value === "";
  const nextMissing = deferred
    ? Array.from(new Set([...missing, input.field]))
    : missing.filter(field => field !== input.field);
  const now = new Date();
  await db
    .update(onboardingStepAnswers)
    .set({
      answer: JSON.stringify(answer),
      source: "human_form",
      confidence: 100,
      missing: JSON.stringify(nextMissing),
      conflicts: JSON.stringify(conflicts),
      status: "draft",
      updatedBy: input.updatedBy,
      updatedAt: now,
    })
    .where(eq(onboardingStepAnswers.id, current.id));
  await db.insert(onboardingStepAnswerRevisions).values({
    answerId: current.id,
    sessionId: session.id,
    workspaceId: input.workspaceId,
    stepKey: input.stepKey,
    answer: JSON.stringify(answer),
    source: "human_form",
    confidence: 100,
    missing: JSON.stringify(nextMissing),
    conflicts: JSON.stringify(conflicts),
    status: "draft",
    changedBy: input.updatedBy,
  });
  return { stepKey: input.stepKey, field: input.field, value, missing: nextMissing, conflicts, status: "draft" as const };
}

export async function answerOnboardingConflict(input: {
  workspaceId: number;
  stepKey: (typeof confirmableOnboardingStepKeys)[number];
  conflictKey: string;
  value: string;
  resolvedBy: number;
}) {
  const db = await getDb();
  const session = await getOnboardingSession(input.workspaceId);
  if (!db || !session) throw new Error("ONBOARDING_SESSION_NOT_FOUND");
  const [current] = await db
    .select()
    .from(onboardingStepAnswers)
    .where(
      and(
        eq(onboardingStepAnswers.workspaceId, input.workspaceId),
        eq(onboardingStepAnswers.sessionId, session.id),
        eq(onboardingStepAnswers.stepKey, input.stepKey)
      )
    )
    .limit(1);
  if (!current) throw new Error("ONBOARDING_STEP_NOT_FOUND");
  const conflicts = JSON.parse(current.conflicts) as string[];
  if (!conflicts.includes(input.conflictKey)) throw new Error("ONBOARDING_CONFLICT_NOT_FOUND");
  const value = input.value.trim().slice(0, 2_000);
  if (!value) throw new Error("ONBOARDING_FOLLOW_UP_VALUE_REQUIRED");
  const deferred = value.toLocaleLowerCase() === "decidir depois";
  const remainingConflicts = deferred ? conflicts : conflicts.filter(item => item !== input.conflictKey);
  const now = new Date();
  await db
    .update(onboardingStepAnswers)
    .set({ conflicts: JSON.stringify(remainingConflicts), status: "draft", updatedBy: input.resolvedBy, updatedAt: now })
    .where(eq(onboardingStepAnswers.id, current.id));
  await db.insert(onboardingConflictResolutions).values({
    answerId: current.id,
    sessionId: session.id,
    workspaceId: input.workspaceId,
    stepKey: input.stepKey,
    conflictKey: input.conflictKey,
    resolution: deferred ? "deferred" : "follow_up",
    note: value,
    answerSnapshot: current.answer,
    resolvedBy: input.resolvedBy,
  });
  await db.insert(onboardingStepAnswerRevisions).values({
    answerId: current.id,
    sessionId: session.id,
    workspaceId: input.workspaceId,
    stepKey: input.stepKey,
    answer: current.answer,
    source: current.source,
    confidence: current.confidence,
    missing: current.missing,
    conflicts: JSON.stringify(remainingConflicts),
    status: "draft",
    changedBy: input.resolvedBy,
  });
  return { stepKey: input.stepKey, conflictKey: input.conflictKey, remainingConflicts, status: "draft" as const };
}

export type OnboardingConflictResolutionDecision = "accepted_current" | "dismissed";

export async function resolveOnboardingConflict(
  workspaceId: number,
  stepKey: string,
  conflictKey: string,
  resolution: OnboardingConflictResolutionDecision,
  note: string,
  resolvedBy: number
) {
  const db = await getDb();
  const session = await getOnboardingSession(workspaceId);
  if (!db || !session) throw new Error("ONBOARDING_SESSION_NOT_FOUND");
  const [answer] = await db
    .select({
      id: onboardingStepAnswers.id,
      sessionId: onboardingStepAnswers.sessionId,
      workspaceId: onboardingStepAnswers.workspaceId,
      stepKey: onboardingStepAnswers.stepKey,
      answer: onboardingStepAnswers.answer,
      source: onboardingStepAnswers.source,
      confidence: onboardingStepAnswers.confidence,
      missing: onboardingStepAnswers.missing,
      conflicts: onboardingStepAnswers.conflicts,
    })
    .from(onboardingStepAnswers)
    .where(
      and(
        eq(onboardingStepAnswers.workspaceId, workspaceId),
        eq(onboardingStepAnswers.sessionId, session.id),
        eq(onboardingStepAnswers.stepKey, stepKey)
      )
    )
    .limit(1);
  if (!answer) throw new Error("ONBOARDING_STEP_NOT_FOUND");
  const conflicts = JSON.parse(answer.conflicts) as string[];
  if (!conflicts.includes(conflictKey)) throw new Error("ONBOARDING_CONFLICT_NOT_FOUND");
  const remainingConflicts = conflicts.filter(item => item !== conflictKey);
  const now = new Date();
  await db
    .update(onboardingStepAnswers)
    .set({ conflicts: JSON.stringify(remainingConflicts), status: "draft", updatedBy: resolvedBy, updatedAt: now })
    .where(eq(onboardingStepAnswers.id, answer.id));
  await db.insert(onboardingConflictResolutions).values({
    answerId: answer.id,
    sessionId: answer.sessionId,
    workspaceId: answer.workspaceId,
    stepKey: answer.stepKey,
    conflictKey,
    resolution,
    note: note.trim(),
    answerSnapshot: answer.answer,
    resolvedBy,
  });
  await db.insert(onboardingStepAnswerRevisions).values({
    answerId: answer.id,
    sessionId: answer.sessionId,
    workspaceId: answer.workspaceId,
    stepKey: answer.stepKey,
    answer: answer.answer,
    source: answer.source,
    confidence: answer.confidence,
    missing: answer.missing,
    conflicts: JSON.stringify(remainingConflicts),
    status: "draft",
    changedBy: resolvedBy,
  });
  return { stepKey, conflictKey, resolution, remainingConflicts, status: "draft" as const };
}

export const automatedOnboardingSources = ["transcription", "llm"] as const;
export type AutomatedOnboardingSource = (typeof automatedOnboardingSources)[number];
export const ONBOARDING_GOVERNANCE_POLICY_VERSION = "2026-09-27.v1";
export const DEFAULT_ONBOARDING_RETENTION = {
  rawArtifactDays: 30,
  derivedDataDays: 180,
} as const;

export function validateOnboardingRetentionPolicy(input: {
  rawArtifactDays: number;
  derivedDataDays: number;
}) {
  const errors: string[] = [];
  if (!Number.isInteger(input.rawArtifactDays) || input.rawArtifactDays < 1 || input.rawArtifactDays > 90)
    errors.push("raw_artifact_days_out_of_range");
  if (!Number.isInteger(input.derivedDataDays) || input.derivedDataDays < 30 || input.derivedDataDays > 3650)
    errors.push("derived_data_days_out_of_range");
  if (input.rawArtifactDays > input.derivedDataDays)
    errors.push("raw_retention_exceeds_derived_retention");
  return { valid: errors.length === 0, errors };
}

export async function getOnboardingGovernance(workspaceId: number) {
  const db = await getDb();
  if (!db) {
    return {
      policyVersion: ONBOARDING_GOVERNANCE_POLICY_VERSION,
      retention: DEFAULT_ONBOARDING_RETENTION,
      consents: automatedOnboardingSources.map(source => ({ source, status: "revoked" as const, policyVersion: null })),
    };
  }
  const [policy] = await db
    .select()
    .from(onboardingRetentionPolicies)
    .where(eq(onboardingRetentionPolicies.workspaceId, workspaceId))
    .limit(1);
  const consentRows = await db
    .select({ source: onboardingSourceConsents.source, status: onboardingSourceConsents.status, policyVersion: onboardingSourceConsents.policyVersion, createdAt: onboardingSourceConsents.createdAt })
    .from(onboardingSourceConsents)
    .where(eq(onboardingSourceConsents.workspaceId, workspaceId))
    .orderBy(desc(onboardingSourceConsents.createdAt));
  const latest = new Map<string, (typeof consentRows)[number]>();
  for (const row of consentRows) if (!latest.has(row.source)) latest.set(row.source, row);
  return {
    policyVersion: ONBOARDING_GOVERNANCE_POLICY_VERSION,
    retention: policy
      ? { rawArtifactDays: policy.rawArtifactDays, derivedDataDays: policy.derivedDataDays, policyVersion: policy.policyVersion }
      : { ...DEFAULT_ONBOARDING_RETENTION, policyVersion: ONBOARDING_GOVERNANCE_POLICY_VERSION },
    consents: automatedOnboardingSources.map(source => ({
      source,
      status: latest.get(source)?.status === "granted" ? "granted" as const : "revoked" as const,
      policyVersion: latest.get(source)?.policyVersion ?? null,
    })),
  };
}

export async function setOnboardingSourceConsent(
  workspaceId: number,
  userId: number,
  source: AutomatedOnboardingSource,
  granted: boolean,
  policyVersion = ONBOARDING_GOVERNANCE_POLICY_VERSION
) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  await db.insert(onboardingSourceConsents).values({
    workspaceId,
    userId,
    source,
    purpose: "onboarding_source_processing",
    policyVersion,
    status: granted ? "granted" : "revoked",
  });
  return getOnboardingGovernance(workspaceId);
}

export async function assertOnboardingSourceConsent(
  workspaceId: number,
  source: AutomatedOnboardingSource
) {
  const governance = await getOnboardingGovernance(workspaceId);
  const consent = governance.consents.find(item => item.source === source);
  if (!consent || consent.status !== "granted")
    throw new Error(`ONBOARDING_SOURCE_CONSENT_REQUIRED:${source}`);
  return consent;
}

export async function saveOnboardingRetentionPolicy(
  workspaceId: number,
  updatedBy: number,
  input: { rawArtifactDays: number; derivedDataDays: number },
  policyVersion = ONBOARDING_GOVERNANCE_POLICY_VERSION
) {
  const validation = validateOnboardingRetentionPolicy(input);
  if (!validation.valid) throw new Error(`ONBOARDING_RETENTION_INVALID:${validation.errors.join(",")}`);
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  await db
    .insert(onboardingRetentionPolicies)
    .values({ ...input, workspaceId, policyVersion, updatedBy, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: onboardingRetentionPolicies.workspaceId,
      set: { ...input, policyVersion, updatedBy, updatedAt: new Date() },
    });
  return getOnboardingGovernance(workspaceId);
}

export type OnboardingAudioTranscriptionResult =
  | {
      ok: true;
      provider: string;
      model: string;
      language: string;
      text: string;
      segments: unknown[];
    }
  | { ok: false; errorCode: string };

export async function createOnboardingAudioAsset(input: {
  sessionId: number;
  workspaceId: number;
  stepKey: "identity" | "offering" | "operations" | "guardrails" | "voice";
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  durationMs?: number;
  sha256: string;
  createdByUserId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const session = (
    await db
      .select({ id: onboardingSessions.id })
      .from(onboardingSessions)
      .where(
        and(
          eq(onboardingSessions.id, input.sessionId),
          eq(onboardingSessions.workspaceId, input.workspaceId)
        )
      )
      .limit(1)
  )[0];
  if (!session) throw new Error("ONBOARDING_SESSION_NOT_FOUND");

  const existing = (
    await db
      .select()
      .from(onboardingAudioAssets)
      .where(
        and(
          eq(onboardingAudioAssets.sessionId, input.sessionId),
          eq(onboardingAudioAssets.sha256, input.sha256)
        )
      )
      .limit(1)
  )[0];
  if (existing) return existing;

  const governance = await getOnboardingGovernance(input.workspaceId);
  const expiresAt = new Date(
    Date.now() + governance.retention.rawArtifactDays * 24 * 60 * 60 * 1000
  );
  const inserted = await db
    .insert(onboardingAudioAssets)
    .values({
      ...input,
      expiresAt,
      transcriptStatus: "uploaded",
      updatedAt: new Date(),
    })
    .onConflictDoNothing({
      target: [onboardingAudioAssets.sessionId, onboardingAudioAssets.sha256],
    })
    .returning();
  return inserted[0] ?? (
    await db
      .select()
      .from(onboardingAudioAssets)
      .where(
        and(
          eq(onboardingAudioAssets.sessionId, input.sessionId),
          eq(onboardingAudioAssets.sha256, input.sha256)
        )
      )
      .limit(1)
  )[0];
}

export async function getOnboardingAudioAssetForWorkspace(
  workspaceId: number,
  assetId: number
) {
  const db = await getDb();
  if (!db) return undefined;
  return (
    await db
      .select()
      .from(onboardingAudioAssets)
      .where(
        and(
          eq(onboardingAudioAssets.id, assetId),
          eq(onboardingAudioAssets.workspaceId, workspaceId)
        )
      )
      .limit(1)
  )[0];
}

export async function getOnboardingAudioTranscription(
  workspaceId: number,
  assetId: number
) {
  const db = await getDb();
  if (!db) return undefined;
  return (
    await db
      .select()
      .from(onboardingTranscriptions)
      .where(
        and(
          eq(onboardingTranscriptions.assetId, assetId),
          eq(onboardingTranscriptions.workspaceId, workspaceId)
        )
      )
      .limit(1)
  )[0];
}

export async function claimOnboardingAudioTranscription(
  workspaceId: number,
  assetId: number
) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const asset = await getOnboardingAudioAssetForWorkspace(workspaceId, assetId);
  if (!asset) throw new Error("ONBOARDING_AUDIO_NOT_FOUND");
  if (asset.transcriptStatus === "completed")
    return { asset, claimed: false as const, reason: "completed" as const };
  if (
    asset.transcriptStatus === "processing" &&
    asset.updatedAt > new Date(Date.now() - 5 * 60 * 1000)
  )
    return { asset, claimed: false as const, reason: "processing" as const };

  const [claimed] = await db
    .update(onboardingAudioAssets)
    .set({ transcriptStatus: "processing", updatedAt: new Date() })
    .where(
      and(
        eq(onboardingAudioAssets.id, assetId),
        eq(onboardingAudioAssets.workspaceId, workspaceId),
        or(
          eq(onboardingAudioAssets.transcriptStatus, "uploaded"),
          eq(onboardingAudioAssets.transcriptStatus, "failed"),
          and(
            eq(onboardingAudioAssets.transcriptStatus, "processing"),
            lt(onboardingAudioAssets.updatedAt, new Date(Date.now() - 5 * 60 * 1000))
          )
        )
      )
    )
    .returning();
  return claimed
    ? { asset: claimed, claimed: true as const, reason: "claimed" as const }
    : { asset, claimed: false as const, reason: "processing" as const };
}

export async function persistOnboardingAudioTranscription(
  workspaceId: number,
  assetId: number,
  result: OnboardingAudioTranscriptionResult
) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const asset = await getOnboardingAudioAssetForWorkspace(workspaceId, assetId);
  if (!asset) throw new Error("ONBOARDING_AUDIO_NOT_FOUND");
  const now = new Date();
  const previous = await getOnboardingAudioTranscription(workspaceId, assetId);
  const retryCount = (previous?.retryCount ?? 0) + (result.ok ? 0 : 1);

  await db.transaction(async tx => {
    await tx
      .update(onboardingAudioAssets)
      .set({
        transcriptStatus: result.ok ? "completed" : "failed",
        updatedAt: now,
      })
      .where(
        and(
          eq(onboardingAudioAssets.id, assetId),
          eq(onboardingAudioAssets.workspaceId, workspaceId)
        )
      );
    await tx
      .insert(onboardingTranscriptions)
      .values({
        assetId,
        sessionId: asset.sessionId,
        workspaceId,
        status: result.ok ? "completed" : "failed",
        provider: result.ok ? result.provider : null,
        model: result.ok ? result.model : null,
        language: result.ok ? result.language : null,
        text: result.ok ? result.text : null,
        segments: result.ok ? result.segments : null,
        errorCode: result.ok ? null : result.errorCode,
        retryCount,
        completedAt: result.ok ? now : null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: onboardingTranscriptions.assetId,
        set: {
          status: result.ok ? "completed" : "failed",
          provider: result.ok ? result.provider : null,
          model: result.ok ? result.model : null,
          language: result.ok ? result.language : null,
          text: result.ok ? result.text : null,
          segments: result.ok ? result.segments : null,
          errorCode: result.ok ? null : result.errorCode,
          retryCount,
          completedAt: result.ok ? now : null,
          updatedAt: now,
        },
      });
  });
  return getOnboardingAudioTranscription(workspaceId, assetId);
}

function buildBusinessPrompt(profile: OnboardingProfile, version: number) {
  return `Você atende clientes da empresa ${profile.businessName || "da empresa configurada"}, do segmento ${profile.segment}. Este é o prompt operacional publicado v${version}.\n\nDescrição do negócio:\n${profile.description || "Não informada."}\n\nServiços, duração e preços:\n${profile.services || "Consultar a equipe antes de prometer preço ou prazo."}\n\nÁrea de atendimento:\n${profile.serviceArea || "Não informada."}\n\nHorários:\n${profile.businessHours || "Consultar disponibilidade real na agenda."}\n\nTom de voz:\n${profile.toneOfVoice || emptyOnboardingProfile.toneOfVoice}\n\nPalavras e condutas proibidas:\n${profile.forbiddenWords || "Não inventar informações, preços, horários ou confirmações."}\n\nPerguntas frequentes e respostas aprovadas:\n${profile.faq || "Não cadastradas."}\n\nPolítica de cancelamento, reagendamento e sinal:\n${profile.cancellationPolicy || "Escalar para atendimento humano quando não houver regra publicada."}\n\nSempre transferir para humano quando:\n${profile.humanHandoffRules || "o cliente pedir humano, houver reclamação, risco, dúvida fora do cadastro ou negociação especial."}\n\nCritérios de qualificação e follow-up:\n${profile.qualificationRules || "Identificar serviço, localização, urgência e próximo passo."}`;
}

async function getWorkspaceSetting(workspaceId: number, key: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(workspaceSettings)
    .where(
      and(
        eq(workspaceSettings.workspaceId, workspaceId),
        eq(workspaceSettings.key, key)
      )
    )
    .orderBy(desc(workspaceSettings.updatedAt), desc(workspaceSettings.id))
    .limit(1);
  return result[0];
}

async function upsertWorkspaceSetting(
  workspaceId: number,
  key: string,
  value: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const existing = await getWorkspaceSetting(workspaceId, key);
  if (existing)
    await db
      .update(workspaceSettings)
      .set({ value, updatedAt: new Date() })
      .where(eq(workspaceSettings.id, existing.id));
  else await db.insert(workspaceSettings).values({ workspaceId, key, value });
}

export async function getOnboardingProfile(workspaceId: number) {
  const workspace = await getActiveWorkspaceById(workspaceId);
  if (!workspace)
    return {
      profile: emptyOnboardingProfile,
      version: 0,
      prompt: "",
      published: false,
      checklist: getOnboardingChecklist(emptyOnboardingProfile, false),
      stepAnswers: [],
    };
  const profileSetting = await getWorkspaceSetting(
    workspace.id,
    "onboarding_profile"
  );
  const promptSetting = await getWorkspaceSetting(
    workspace.id,
    "ai_prompt_published"
  );
  const profile = {
    ...emptyOnboardingProfile,
    ...(profileSetting?.value
      ? (JSON.parse(profileSetting.value) as Partial<OnboardingProfile>)
      : {}),
  };
  const published = promptSetting?.value
    ? (JSON.parse(promptSetting.value) as { version: number; prompt: string })
    : undefined;
  const checklist = getOnboardingChecklist(profile, Boolean(published?.prompt));
  const stepAnswers = await listOnboardingStepAnswers(workspaceId);
  return {
    profile,
    version: published?.version ?? 0,
    prompt: published?.prompt ?? "",
    published: Boolean(published?.prompt),
    checklist,
    stepAnswers,
  };
}

export async function saveOnboardingProfile(
  workspaceId: number,
  input: OnboardingProfile,
  publish: boolean,
  updatedBy?: number,
  syncAnswers = true
) {
  if (publish) {
    await saveOnboardingProfile(workspaceId, input, false, updatedBy);
    if (!updatedBy) throw new Error("ONBOARDING_PUBLISH_ACTOR_REQUIRED");
    return publishOnboardingDraft(workspaceId, updatedBy);
  }
  const workspace = await getActiveWorkspaceById(workspaceId);
  if (!workspace) throw new Error("Workspace unavailable");
  const current = await getOnboardingProfile(workspaceId);
  const nextPublished = publish || current.published;
  const nextChecklist = getOnboardingChecklist(input, nextPublished);
  if (publish && !nextChecklist.requiredComplete) {
    const missing = nextChecklist.items
      .filter(item => item.required && !item.complete)
      .map(item => item.title)
      .join(", ");
    throw new Error(`ONBOARDING_INCOMPLETE:${missing}`);
  }
  await touchOnboardingSession(
    workspaceId,
    nextChecklist.nextStep?.id ?? null,
    nextChecklist.nextStep === null
  );
  const nextVersion = current.version + 1;
  await upsertWorkspaceSetting(
    workspace.id,
    "onboarding_profile",
    JSON.stringify(input)
  );
  if (syncAnswers) await persistOnboardingStepAnswers(workspaceId, input, updatedBy);
  if (publish) {
    const answers = await listOnboardingStepAnswers(workspaceId);
    const missing = requiredOnboardingStepKeys.filter(stepKey =>
      !answers.some(answer => answer.stepKey === stepKey && answer.status === "confirmed")
    );
    if (missing.length)
      throw new Error(`ONBOARDING_CONFIRMATION_REQUIRED:${missing.join(",")}`);
    const conflicted = answers
      .filter(answer => requiredOnboardingStepKeys.includes(answer.stepKey as (typeof requiredOnboardingStepKeys)[number]) && answer.conflicts.length > 0)
      .map(answer => answer.stepKey);
    if (conflicted.length)
      throw new Error(`ONBOARDING_CONFLICTS_UNRESOLVED:${conflicted.join(",")}`);
  }
  const prompt = buildBusinessPrompt(input, nextVersion);
  if (publish)
    await upsertWorkspaceSetting(
      workspace.id,
      "ai_prompt_published",
      JSON.stringify({
        version: nextVersion,
        prompt,
        publishedAt: new Date().toISOString(),
      })
    );
  const stepAnswers = await listOnboardingStepAnswers(workspaceId);
  return {
    profile: input,
    version: publish ? nextVersion : current.version,
    prompt: publish ? prompt : current.prompt,
    published: nextPublished,
    checklist: nextChecklist,
    stepAnswers,
  };
}

function profileFromConfirmedOnboardingAnswers(
  current: OnboardingProfile,
  answers: Awaited<ReturnType<typeof listOnboardingStepAnswers>>
) {
  const profile = { ...current };
  for (const answer of answers) {
    if (answer.status !== "confirmed") continue;
    for (const [key, value] of Object.entries(answer.answer)) {
      if (key in profile && typeof value === "string")
        profile[key as keyof OnboardingProfile] = value as never;
    }
  }
  return profile;
}

export async function listOnboardingPublishedVersions(workspaceId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: onboardingPublishedVersions.id,
      version: onboardingPublishedVersions.version,
      publishedBy: onboardingPublishedVersions.publishedBy,
      rollbackOfId: onboardingPublishedVersions.rollbackOfId,
      publishedAt: onboardingPublishedVersions.publishedAt,
    })
    .from(onboardingPublishedVersions)
    .where(eq(onboardingPublishedVersions.workspaceId, workspaceId))
    .orderBy(desc(onboardingPublishedVersions.version))
    .limit(20);
}

export async function publishOnboardingDraft(workspaceId: number, publishedBy: number) {
  const db = await getDb();
  const workspace = await getActiveWorkspaceById(workspaceId);
  if (!db || !workspace) throw new Error("Workspace unavailable");
  const current = await getOnboardingProfile(workspaceId);
  const answers = await listOnboardingStepAnswers(workspaceId);
  const incomplete = requiredOnboardingStepKeys.filter(stepKey => {
    const answer = answers.find(item => item.stepKey === stepKey);
    return !answer || answer.status !== "confirmed" || answer.missing.length > 0;
  });
  if (incomplete.length)
    throw new Error(`ONBOARDING_CONFIRMATION_REQUIRED:${incomplete.join(",")}`);
  const conflicted = answers.filter(answer => answer.conflicts.length > 0).map(answer => answer.stepKey);
  if (conflicted.length)
    throw new Error(`ONBOARDING_CONFLICTS_UNRESOLVED:${conflicted.join(",")}`);
  const profile = profileFromConfirmedOnboardingAnswers(current.profile, answers);
  const checklist = getOnboardingChecklist(profile, true);
  if (!checklist.requiredComplete) {
    const missing = checklist.items.filter(item => item.required && !item.complete).map(item => item.title).join(", ");
    throw new Error(`ONBOARDING_INCOMPLETE:${missing}`);
  }
  const latest = (
    await db
      .select({ id: onboardingPublishedVersions.id, version: onboardingPublishedVersions.version })
      .from(onboardingPublishedVersions)
      .where(eq(onboardingPublishedVersions.workspaceId, workspaceId))
      .orderBy(desc(onboardingPublishedVersions.version))
      .limit(1)
  )[0];
  const nextVersion = Math.max(current.version, latest?.version ?? 0) + 1;
  const prompt = buildBusinessPrompt(profile, nextVersion);
  const publishedAt = new Date();
  const [version] = await db.transaction(async tx => {
    const [created] = await tx
      .insert(onboardingPublishedVersions)
      .values({
        workspaceId,
        version: nextVersion,
        profile: JSON.stringify(profile),
        prompt,
        publishedBy,
        publishedAt,
      })
      .returning();
    const setting = (
      await tx
        .select({ id: workspaceSettings.id })
        .from(workspaceSettings)
        .where(and(eq(workspaceSettings.workspaceId, workspaceId), eq(workspaceSettings.key, "ai_prompt_published")))
        .orderBy(desc(workspaceSettings.updatedAt), desc(workspaceSettings.id))
        .limit(1)
    )[0];
    const value = JSON.stringify({ version: nextVersion, prompt, publishedAt: publishedAt.toISOString() });
    if (setting)
      await tx.update(workspaceSettings).set({ value, updatedAt: publishedAt }).where(eq(workspaceSettings.id, setting.id));
    else await tx.insert(workspaceSettings).values({ workspaceId, key: "ai_prompt_published", value, updatedAt: publishedAt });
    const profileSetting = (
      await tx
        .select({ id: workspaceSettings.id })
        .from(workspaceSettings)
        .where(and(eq(workspaceSettings.workspaceId, workspaceId), eq(workspaceSettings.key, "onboarding_profile")))
        .orderBy(desc(workspaceSettings.updatedAt), desc(workspaceSettings.id))
        .limit(1)
    )[0];
    const serializedProfile = JSON.stringify(profile);
    if (profileSetting)
      await tx.update(workspaceSettings).set({ value: serializedProfile, updatedAt: publishedAt }).where(eq(workspaceSettings.id, profileSetting.id));
    else await tx.insert(workspaceSettings).values({ workspaceId, key: "onboarding_profile", value: serializedProfile, updatedAt: publishedAt });
    return [created];
  });
  return {
    profile,
    version: version.version,
    prompt,
    published: true,
    checklist,
    stepAnswers: await listOnboardingStepAnswers(workspaceId),
  };
}

export async function rollbackOnboardingPublishedVersion(
  workspaceId: number,
  version: number,
  rolledBackBy: number
) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const [target] = await db
    .select()
    .from(onboardingPublishedVersions)
    .where(and(eq(onboardingPublishedVersions.workspaceId, workspaceId), eq(onboardingPublishedVersions.version, version)))
    .limit(1);
  if (!target) throw new Error("ONBOARDING_PUBLISHED_VERSION_NOT_FOUND");
  const profile = JSON.parse(target.profile) as OnboardingProfile;
  const latest = (
    await db
      .select({ version: onboardingPublishedVersions.version })
      .from(onboardingPublishedVersions)
      .where(eq(onboardingPublishedVersions.workspaceId, workspaceId))
      .orderBy(desc(onboardingPublishedVersions.version))
      .limit(1)
  )[0];
  const nextVersion = (latest?.version ?? 0) + 1;
  const prompt = buildBusinessPrompt(profile, nextVersion);
  const publishedAt = new Date();
  const [created] = await db.transaction(async tx => {
    const [inserted] = await tx.insert(onboardingPublishedVersions).values({
      workspaceId,
      version: nextVersion,
      profile: JSON.stringify(profile),
      prompt,
      publishedBy: rolledBackBy,
      rollbackOfId: target.id,
      publishedAt,
    }).returning();
    const setting = (
      await tx.select({ id: workspaceSettings.id }).from(workspaceSettings)
        .where(and(eq(workspaceSettings.workspaceId, workspaceId), eq(workspaceSettings.key, "ai_prompt_published")))
        .orderBy(desc(workspaceSettings.updatedAt), desc(workspaceSettings.id)).limit(1)
    )[0];
    const value = JSON.stringify({ version: nextVersion, prompt, publishedAt: publishedAt.toISOString(), rollbackOf: target.id });
    if (setting) await tx.update(workspaceSettings).set({ value, updatedAt: publishedAt }).where(eq(workspaceSettings.id, setting.id));
    else await tx.insert(workspaceSettings).values({ workspaceId, key: "ai_prompt_published", value, updatedAt: publishedAt });
    await tx.update(workspaceSettings).set({ value: JSON.stringify(profile), updatedAt: publishedAt })
      .where(and(eq(workspaceSettings.workspaceId, workspaceId), eq(workspaceSettings.key, "onboarding_profile")));
    return [inserted];
  });
  await persistOnboardingStepAnswers(workspaceId, profile, rolledBackBy);
  return { version: created.version, rollbackOf: target.version, prompt, profile, published: true };
}

export async function getPublishedAiPrompt(workspaceId: number) {
  const onboarding = await getOnboardingProfile(workspaceId);
  return {
    version: onboarding.version,
    prompt: onboarding.prompt,
    published: onboarding.published,
  };
}

export type NativeAgentConfig = {
  enabled: boolean;
  model: string;
  systemPrompt: string;
  maxSteps: number;
  apiSource: "environment";
  llm: AgentProviderSettings;
};

const PLATFORM_GLOBAL_AGENT_WORKSPACE_ID = 0;

async function readStoredNativeAgentConfig(workspaceId?: number) {
  const globalSetting = await getWorkspaceSetting(
    PLATFORM_GLOBAL_AGENT_WORKSPACE_ID,
    "platform_native_agent_config"
  );
  const workspaceSetting = workspaceId
    ? await getWorkspaceSetting(workspaceId, "native_agent_config")
    : undefined;
  const parse = (value?: string | null): Partial<NativeAgentConfig> => {
    if (!value) return {};
    try {
      return JSON.parse(value) as Partial<NativeAgentConfig>;
    } catch {
      return {};
    }
  };
  const globalStored = parse(globalSetting?.value);
  const workspaceStored = parse(workspaceSetting?.value);
  return {
    ...globalStored,
    ...workspaceStored,
    llm: mergeAgentProviderSettings(workspaceStored.llm ?? globalStored.llm),
  } as Partial<NativeAgentConfig>;
}

async function readNativeAgentConfig(
  workspace: { id: number } | undefined
): Promise<NativeAgentConfig> {
  const stored = await readStoredNativeAgentConfig(workspace?.id);
  const llm = mergeAgentProviderSettings(stored.llm);
  for (const provider of Object.values(llm.providers))
    provider.apiKey = maskProviderSecret(provider.apiKey);
  for (const route of Object.values(llm.routing))
    if (route.apiKey) route.apiKey = maskProviderSecret(route.apiKey);
  return {
    enabled: stored.enabled !== false,
    model: stored.model?.trim() || process.env.AGENT_MODEL || "gpt-5-mini",
    systemPrompt: stored.systemPrompt ?? "",
    maxSteps: Math.max(1, Math.min(8, Number(stored.maxSteps ?? 6))),
    apiSource: "environment",
    llm,
  };
}

export async function getNativeAgentConfig(
  workspaceId: number
): Promise<NativeAgentConfig> {
  return readNativeAgentConfig(await getActiveWorkspaceById(workspaceId));
}

export async function getPlatformNativeAgentConfig(
  workspaceId: number
): Promise<NativeAgentConfig> {
  const db = await getDb();
  const workspace = db
    ? (
        await db
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(eq(workspaces.id, workspaceId))
          .limit(1)
      )[0]
    : undefined;
  return readNativeAgentConfig(workspace);
}

export async function getPlatformGlobalNativeAgentConfig(): Promise<NativeAgentConfig> {
  return readNativeAgentConfig(undefined);
}

export async function getNativeAgentRuntimeConfig(
  workspaceId: number
): Promise<NativeAgentConfig> {
  const workspace = await getActiveWorkspaceById(workspaceId);
  const stored = await readStoredNativeAgentConfig(workspace?.id);
  return {
    enabled: stored.enabled !== false,
    model: stored.model?.trim() || process.env.AGENT_MODEL || "gpt-5-mini",
    systemPrompt: stored.systemPrompt ?? "",
    maxSteps: Math.max(1, Math.min(8, Number(stored.maxSteps ?? 6))),
    apiSource: "environment",
    llm: mergeAgentProviderSettings(stored.llm),
  };
}

export async function saveNativeAgentConfig(
  workspaceId: number,
  input: Partial<NativeAgentConfig>
) {
  const workspace = await getActiveWorkspaceById(workspaceId);
  if (!workspace) throw new Error("Workspace unavailable");
  const current = await getNativeAgentConfig(workspaceId);
  const next: NativeAgentConfig = {
    enabled: input.enabled ?? current.enabled,
    model: input.model?.trim() || current.model,
    systemPrompt: input.systemPrompt ?? current.systemPrompt,
    maxSteps: Math.max(
      1,
      Math.min(8, Number(input.maxSteps ?? current.maxSteps))
    ),
    apiSource: "environment",
    llm: mergeAgentProviderSettings(input.llm ?? current.llm),
  };
  const rawSetting = await getWorkspaceSetting(
    workspace.id,
    "native_agent_config"
  );
  let rawConfig: Partial<NativeAgentConfig> = {};
  if (rawSetting?.value) {
    try {
      rawConfig = JSON.parse(rawSetting.value) as Partial<NativeAgentConfig>;
    } catch {
      rawConfig = {};
    }
  }
  const stored = mergeAgentProviderSettings(rawConfig.llm);
  for (const providerId of Object.keys(next.llm.providers) as Array<
    keyof typeof next.llm.providers
  >) {
    const incoming = next.llm.providers[providerId];
    const previous = stored.providers[providerId];
    incoming.apiKey =
      incoming.apiKey && !incoming.apiKey.startsWith("••••")
        ? encryptProviderSecret(incoming.apiKey)
        : previous.apiKey;
  }
  for (const capability of Object.keys(next.llm.routing) as Array<
    keyof typeof next.llm.routing
  >) {
    const incoming = next.llm.routing[capability];
    const previous = stored.routing[capability];
    incoming.apiKey =
      incoming.apiKey && !incoming.apiKey.startsWith("••••")
        ? encryptProviderSecret(incoming.apiKey)
        : previous.apiKey;
  }
  await upsertWorkspaceSetting(
    workspace.id,
    "native_agent_config",
    JSON.stringify(next)
  );
  const response = { ...next, llm: mergeAgentProviderSettings(next.llm) };
  for (const provider of Object.values(response.llm.providers))
    provider.apiKey = maskProviderSecret(provider.apiKey);
  for (const route of Object.values(response.llm.routing))
    if (route.apiKey) route.apiKey = maskProviderSecret(route.apiKey);
  return response;
}

export async function savePlatformGlobalNativeAgentConfig(
  input: Pick<NativeAgentConfig, "enabled" | "model" | "systemPrompt" | "maxSteps" | "llm">
) {
  const current = await getNativeAgentRuntimeConfig(0);
  const next: NativeAgentConfig = {
    ...current,
    enabled: input.enabled,
    model: input.model.trim() || current.model,
    systemPrompt: input.systemPrompt,
    maxSteps: Math.max(1, Math.min(8, Number(input.maxSteps))),
    llm: mergeAgentProviderSettings(input.llm),
  };
  const rawSetting = await getWorkspaceSetting(
    PLATFORM_GLOBAL_AGENT_WORKSPACE_ID,
    "platform_native_agent_config"
  );
  let rawConfig: Partial<NativeAgentConfig> = {};
  if (rawSetting?.value) {
    try {
      rawConfig = JSON.parse(rawSetting.value) as Partial<NativeAgentConfig>;
    } catch {
      rawConfig = {};
    }
  }
  const stored = mergeAgentProviderSettings(rawConfig.llm);
  for (const providerId of Object.keys(next.llm.providers) as Array<keyof typeof next.llm.providers>) {
    const incoming = next.llm.providers[providerId];
    const previous = stored.providers[providerId];
    incoming.apiKey =
      incoming.apiKey && !incoming.apiKey.startsWith("••••")
        ? encryptProviderSecret(incoming.apiKey)
        : previous.apiKey;
  }
  for (const capability of Object.keys(next.llm.routing) as Array<keyof typeof next.llm.routing>) {
    const incoming = next.llm.routing[capability];
    const previous = stored.routing[capability];
    incoming.apiKey =
      incoming.apiKey && !incoming.apiKey.startsWith("••••")
        ? encryptProviderSecret(incoming.apiKey)
        : previous.apiKey;
  }
  await upsertWorkspaceSetting(
    PLATFORM_GLOBAL_AGENT_WORKSPACE_ID,
    "platform_native_agent_config",
    JSON.stringify(next)
  );
  return getPlatformGlobalNativeAgentConfig();
}

export async function getWorkspaceBySlug(slug: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.slug, slug))
    .limit(1);
  return result[0];
}

export async function getWorkspaceById(workspaceId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  return result[0];
}

export async function getActiveWorkspaceById(workspaceId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.active, 1)))
    .limit(1);
  return result[0];
}

export type WorkspaceUsageMetric =
  | "apiRequests"
  | "aiRequests"
  | "outboundMessages";

export type WorkspaceUsageDecision = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterMs: number;
};

export function workspaceUsageLimitsForPlan(
  plan: "starter" | "pro" | "business",
  metric: WorkspaceUsageMetric
) {
  const envKey =
    metric === "apiRequests"
      ? "FORTE_WORKSPACE_API_REQUESTS_PER_MINUTE"
      : metric === "aiRequests"
        ? "FORTE_WORKSPACE_AI_REQUESTS_PER_MINUTE"
        : "FORTE_WORKSPACE_OUTBOUND_MESSAGES_PER_MINUTE";
  const defaults = {
    starter: { apiRequests: 120, aiRequests: 60, outboundMessages: 120 },
    pro: { apiRequests: 600, aiRequests: 300, outboundMessages: 600 },
    business: { apiRequests: 1800, aiRequests: 900, outboundMessages: 1800 },
  } as const;
  const fallback = defaults[plan]?.[metric] ?? defaults.starter[metric];
  const parsed = Number(process.env[envKey] ?? fallback);
  const workspaceLimit = Number.isFinite(parsed)
    ? Math.max(0, Math.min(Math.floor(parsed), 10_000))
    : fallback;
  return {
    workspaceLimit,
    userLimit: Math.max(
      1,
      Math.ceil(workspaceLimit / (plan === "starter" ? 4 : 10))
    ),
  };
}

export async function consumeWorkspaceUsage(
  workspaceId: number,
  metric: WorkspaceUsageMetric
): Promise<WorkspaceUsageDecision> {
  const now = new Date();
  const bucketStart = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  const retryAfterMs = Math.max(
    1_000,
    bucketStart.getTime() + 60_000 - now.getTime()
  );
  const db = await getDb();
  const workspace = db ? await getActiveWorkspaceById(workspaceId) : undefined;
  const limit = workspaceUsageLimitsForPlan(
    workspace?.plan ?? "starter",
    metric
  ).workspaceLimit;
  if (!db) return { allowed: true, limit, remaining: limit, retryAfterMs };
  const column =
    metric === "apiRequests"
      ? workspaceUsageBuckets.apiRequests
      : metric === "aiRequests"
        ? workspaceUsageBuckets.aiRequests
        : workspaceUsageBuckets.outboundMessages;
  return db.transaction(async tx => {
    await tx
      .insert(workspaceUsageBuckets)
      .values({ workspaceId, bucketStart })
      .onConflictDoNothing({
        target: [
          workspaceUsageBuckets.workspaceId,
          workspaceUsageBuckets.bucketStart,
        ],
      });
    const updated = await tx
      .update(workspaceUsageBuckets)
      .set({ [metric]: sql`${column} + 1`, updatedAt: new Date() })
      .where(
        and(
          eq(workspaceUsageBuckets.workspaceId, workspaceId),
          eq(workspaceUsageBuckets.bucketStart, bucketStart),
          lt(column, limit)
        )
      )
      .returning({ count: column });
    const count = Number(updated[0]?.count ?? limit);
    if (!updated[0])
      return { allowed: false, limit, remaining: 0, retryAfterMs };
    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit - count),
      retryAfterMs,
    };
  });
}

export async function consumeWorkspaceUserUsage(
  workspaceId: number,
  userId: number,
  metric: WorkspaceUsageMetric
): Promise<WorkspaceUsageDecision> {
  const now = new Date();
  const bucketStart = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  const retryAfterMs = Math.max(
    1_000,
    bucketStart.getTime() + 60_000 - now.getTime()
  );
  const db = await getDb();
  const workspace = db ? await getActiveWorkspaceById(workspaceId) : undefined;
  const limit = workspaceUsageLimitsForPlan(
    workspace?.plan ?? "starter",
    metric
  ).userLimit;
  if (!db) return { allowed: true, limit, remaining: limit, retryAfterMs };
  const column =
    metric === "apiRequests"
      ? workspaceUserUsageBuckets.apiRequests
      : metric === "aiRequests"
        ? workspaceUserUsageBuckets.aiRequests
        : workspaceUserUsageBuckets.outboundMessages;
  return db.transaction(async tx => {
    await tx
      .insert(workspaceUserUsageBuckets)
      .values({ workspaceId, userId, bucketStart })
      .onConflictDoNothing({
        target: [
          workspaceUserUsageBuckets.workspaceId,
          workspaceUserUsageBuckets.userId,
          workspaceUserUsageBuckets.bucketStart,
        ],
      });
    const updated = await tx
      .update(workspaceUserUsageBuckets)
      .set({ [metric]: sql`${column} + 1`, updatedAt: new Date() })
      .where(
        and(
          eq(workspaceUserUsageBuckets.workspaceId, workspaceId),
          eq(workspaceUserUsageBuckets.userId, userId),
          eq(workspaceUserUsageBuckets.bucketStart, bucketStart),
          lt(column, limit)
        )
      )
      .returning({ count: column });
    const count = Number(updated[0]?.count ?? limit);
    if (!updated[0])
      return { allowed: false, limit, remaining: 0, retryAfterMs };
    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit - count),
      retryAfterMs,
    };
  });
}

export type WorkspaceUsageSnapshot = {
  plan: "starter" | "pro" | "business";
  bucketStart: Date;
  resetsAt: Date;
  workspace: Record<
    WorkspaceUsageMetric,
    { used: number; limit: number; remaining: number }
  >;
  users: Array<{
    userId: number;
    name: string | null;
    email: string | null;
    active: boolean;
    usage: Record<
      WorkspaceUsageMetric,
      { used: number; limit: number; remaining: number }
    >;
  }>;
};

export async function getWorkspaceUsageSnapshot(
  workspaceId: number
): Promise<WorkspaceUsageSnapshot> {
  const now = new Date();
  const bucketStart = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  const resetsAt = new Date(bucketStart.getTime() + 60_000);
  const workspace = await getActiveWorkspaceById(workspaceId);
  const plan = workspace?.plan ?? "starter";
  const metrics: WorkspaceUsageMetric[] = [
    "apiRequests",
    "aiRequests",
    "outboundMessages",
  ];
  const emptyUsage = (scope: "workspace" | "user") =>
    Object.fromEntries(
      metrics.map(metric => {
        const limits = workspaceUsageLimitsForPlan(plan, metric);
        const limit =
          scope === "workspace" ? limits.workspaceLimit : limits.userLimit;
        return [metric, { used: 0, limit, remaining: limit }];
      })
    ) as WorkspaceUsageSnapshot["workspace"];
  const db = await getDb();
  if (!db || !workspace)
    return {
      plan,
      bucketStart,
      resetsAt,
      workspace: emptyUsage("workspace"),
      users: [],
    };
  const workspaceRow = (
    await db
      .select()
      .from(workspaceUsageBuckets)
      .where(
        and(
          eq(workspaceUsageBuckets.workspaceId, workspaceId),
          eq(workspaceUsageBuckets.bucketStart, bucketStart)
        )
      )
      .limit(1)
  )[0];
  const userRows = await db
    .select({
      userId: workspaceUserUsageBuckets.userId,
      name: users.name,
      email: users.email,
      active: workspaceMembers.active,
      apiRequests: workspaceUserUsageBuckets.apiRequests,
      aiRequests: workspaceUserUsageBuckets.aiRequests,
      outboundMessages: workspaceUserUsageBuckets.outboundMessages,
    })
    .from(workspaceUserUsageBuckets)
    .leftJoin(users, eq(users.id, workspaceUserUsageBuckets.userId))
    .leftJoin(
      workspaceMembers,
      and(
        eq(workspaceMembers.userId, workspaceUserUsageBuckets.userId),
        eq(workspaceMembers.workspaceId, workspaceId)
      )
    )
    .where(
      and(
        eq(workspaceUserUsageBuckets.workspaceId, workspaceId),
        eq(workspaceUserUsageBuckets.bucketStart, bucketStart)
      )
    );
  const makeUsage = (
    scope: "workspace" | "user",
    row?: Partial<Record<WorkspaceUsageMetric, number>>
  ) =>
    Object.fromEntries(
      metrics.map(metric => {
        const limits = workspaceUsageLimitsForPlan(plan, metric);
        const limit =
          scope === "workspace" ? limits.workspaceLimit : limits.userLimit;
        const used = Math.max(0, Number(row?.[metric] ?? 0));
        return [metric, { used, limit, remaining: Math.max(0, limit - used) }];
      })
    ) as WorkspaceUsageSnapshot["workspace"];
  return {
    plan,
    bucketStart,
    resetsAt,
    workspace: makeUsage("workspace", workspaceRow),
    users: userRows.map(row => ({
      userId: row.userId,
      name: row.name,
      email: row.email,
      active: row.active === 1,
      usage: makeUsage("user", row),
    })),
  };
}

export async function cleanupWorkspaceUsageBuckets(
  retentionDays = Number(process.env.FORTE_USAGE_RETENTION_DAYS ?? 30)
) {
  const db = await getDb();
  if (!db) return { workspaceBuckets: 0, userBuckets: 0, skipped: true };
  const days = Number.isFinite(retentionDays)
    ? Math.max(1, Math.min(Math.floor(retentionDays), 365))
    : 30;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const [workspaceRows, userRows] = await Promise.all([
    db
      .delete(workspaceUsageBuckets)
      .where(lt(workspaceUsageBuckets.bucketStart, cutoff))
      .returning({ id: workspaceUsageBuckets.id }),
    db
      .delete(workspaceUserUsageBuckets)
      .where(lt(workspaceUserUsageBuckets.bucketStart, cutoff))
      .returning({ id: workspaceUserUsageBuckets.id }),
  ]);
  return {
    workspaceBuckets: workspaceRows.length,
    userBuckets: userRows.length,
    skipped: false,
    retentionDays: days,
  };
}

export type OnboardingAudioRetentionCleanupResult = {
  skipped: boolean;
  dryRun: boolean;
  limit: number;
  assetsExpired: number;
  transcriptionsExpired: number;
  workspaces: Record<string, { assets: number; transcriptions: number }>;
};

export async function cleanupOnboardingAudioRetention(options: {
  dryRun?: boolean;
  limit?: number;
  now?: Date;
} = {}): Promise<OnboardingAudioRetentionCleanupResult> {
  const db = await getDb();
  const dryRun = options.dryRun === true;
  const limit = Number.isFinite(options.limit)
    ? Math.max(1, Math.min(Math.floor(options.limit as number), 2_000))
    : 500;
  if (!db)
    return {
      skipped: true,
      dryRun,
      limit,
      assetsExpired: 0,
      transcriptionsExpired: 0,
      workspaces: {},
    };

  const now = options.now ?? new Date();
  const candidates = await db
    .select({
      id: onboardingTranscriptions.id,
      workspaceId: onboardingTranscriptions.workspaceId,
      updatedAt: onboardingTranscriptions.updatedAt,
    })
    .from(onboardingTranscriptions)
    .where(
      lt(
        onboardingTranscriptions.updatedAt,
        new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      )
    )
    .orderBy(asc(onboardingTranscriptions.id))
    .limit(limit);
  const policies = await db.select().from(onboardingRetentionPolicies);
  const derivedDaysByWorkspace = new Map(
    policies.map(policy => [policy.workspaceId, policy.derivedDataDays])
  );
  const expiredTranscriptions = candidates.filter(row => {
    const derivedDays = derivedDaysByWorkspace.get(row.workspaceId) ?? 180;
    return row.updatedAt < new Date(now.getTime() - derivedDays * 24 * 60 * 60 * 1000);
  });

  const expiredAssets = await db
    .select({ id: onboardingAudioAssets.id, workspaceId: onboardingAudioAssets.workspaceId })
    .from(onboardingAudioAssets)
    .where(lt(onboardingAudioAssets.expiresAt, now))
    .orderBy(asc(onboardingAudioAssets.id))
    .limit(limit);
  const workspaces: Record<string, { assets: number; transcriptions: number }> = {};
  const addWorkspaceCount = (workspaceId: number, kind: "assets" | "transcriptions") => {
    const key = String(workspaceId);
    workspaces[key] ??= { assets: 0, transcriptions: 0 };
    workspaces[key][kind] += 1;
  };
  expiredAssets.forEach(row => addWorkspaceCount(row.workspaceId, "assets"));
  expiredTranscriptions.forEach(row => addWorkspaceCount(row.workspaceId, "transcriptions"));

  if (!dryRun) {
    if (expiredTranscriptions.length > 0)
      await db.delete(onboardingTranscriptions).where(
        inArray(onboardingTranscriptions.id, expiredTranscriptions.map(row => row.id))
      );
    if (expiredAssets.length > 0)
      await db.delete(onboardingAudioAssets).where(
        inArray(onboardingAudioAssets.id, expiredAssets.map(row => row.id))
      );
  }
  return {
    skipped: false,
    dryRun,
    limit,
    assetsExpired: expiredAssets.length,
    transcriptionsExpired: expiredTranscriptions.length,
    workspaces,
  };
}

export async function resetWorkspaceDevelopmentData(workspaceId?: number) {
  const db = await getDb();
  const workspace = workspaceId
    ? await getActiveWorkspaceById(workspaceId)
    : await ensureDemoWorkspace();
  if (!db || !workspace) throw new Error("Workspace unavailable");
  return db.transaction(async tx => {
    await tx
      .delete(notifications)
      .where(eq(notifications.workspaceId, workspace.id));
    await tx.delete(auditLogs).where(eq(auditLogs.workspaceId, workspace.id));
    await tx
      .delete(onboardingTranscriptions)
      .where(eq(onboardingTranscriptions.workspaceId, workspace.id));
    await tx
      .delete(onboardingAudioAssets)
      .where(eq(onboardingAudioAssets.workspaceId, workspace.id));
    await tx
      .delete(contactNotes)
      .where(eq(contactNotes.workspaceId, workspace.id));
    await tx
      .delete(messages)
      .where(
        inArray(
          messages.conversationId,
          sql`(SELECT "id" FROM "conversations" WHERE "contactId" IN (SELECT "id" FROM "contacts" WHERE "workspaceId" = ${workspace.id}))`
        )
      );
    await tx
      .delete(domainEvents)
      .where(eq(domainEvents.workspaceId, workspace.id));
    await tx
      .delete(agentEffects)
      .where(eq(agentEffects.workspaceId, workspace.id));
    await tx
      .delete(webhookEvents)
      .where(eq(webhookEvents.workspaceId, workspace.id));
    await tx
      .delete(whatsappGroupParticipants)
      .where(
        inArray(
          whatsappGroupParticipants.groupId,
          sql`(SELECT "id" FROM "whatsappGroups" WHERE "workspaceId" = ${workspace.id})`
        )
      );
    await tx
      .delete(whatsappGroups)
      .where(eq(whatsappGroups.workspaceId, workspace.id));
    await tx
      .delete(apiIdempotency)
      .where(eq(apiIdempotency.workspaceId, workspace.id));
    await tx
      .delete(appointmentsTable)
      .where(eq(appointmentsTable.workspaceId, workspace.id));
    await tx.delete(quotes).where(eq(quotes.workspaceId, workspace.id));
    await tx
      .delete(professionalServices)
      .where(eq(professionalServices.workspaceId, workspace.id));
    await tx
      .delete(availability)
      .where(eq(availability.workspaceId, workspace.id));
    await tx
      .delete(conversations)
      .where(
        inArray(
          conversations.contactId,
          sql`(SELECT "id" FROM "contacts" WHERE "workspaceId" = ${workspace.id})`
        )
      );
    await tx.delete(contacts).where(eq(contacts.workspaceId, workspace.id));
    await tx.delete(services).where(eq(services.workspaceId, workspace.id));
    await tx
      .delete(professionals)
      .where(eq(professionals.workspaceId, workspace.id));
    await tx
      .delete(whatsappChannels)
      .where(eq(whatsappChannels.workspaceId, workspace.id));
    await tx
      .delete(workspaceUsageBuckets)
      .where(eq(workspaceUsageBuckets.workspaceId, workspace.id));
    await tx
      .delete(workspaceUserUsageBuckets)
      .where(eq(workspaceUserUsageBuckets.workspaceId, workspace.id));
    await tx
      .delete(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, workspace.id));
    return { workspaceId: workspace.id, reset: true };
  });
}

export async function listWorkspaceMembers(slug = DEMO_WORKSPACE_SLUG) {
  const db = await getDb();
  if (!db) return [];
  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) return [];
  return db
    .select({
      id: workspaceMembers.id,
      userId: workspaceMembers.userId,
      role: workspaceMembers.role,
      active: workspaceMembers.active,
      name: users.name,
      email: users.email,
    })
    .from(workspaceMembers)
    .leftJoin(users, eq(users.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, workspace.id));
}

const seedContacts = [
  {
    phone: "5511998421104",
    name: "Juliana Alves",
    city: "São Paulo",
    neighborhood: "Vila Mariana",
    service: "Instalação de chuveiro",
    urgency: "Alta" as const,
    stage: "Triagem",
    aiEnabled: 0,
    quoteCents: 38000,
    preview: "Consigo enviar as fotos ainda hoje.",
  },
  {
    phone: "5511987104522",
    name: "Marcos Ferreira",
    city: "São Paulo",
    neighborhood: "Moema",
    service: "Quadro elétrico",
    urgency: "Crítica" as const,
    stage: "Visita solicitada",
    aiEnabled: 1,
    quoteCents: 95000,
    preview: "A energia caiu novamente no apartamento.",
  },
  {
    phone: "5511976512088",
    name: "Renata Costa",
    city: "São Paulo",
    neighborhood: "Pinheiros",
    service: "Tomadas e iluminação",
    urgency: "Média" as const,
    stage: "Orçamento enviado",
    aiEnabled: 1,
    quoteCents: 62000,
    preview: "Vou analisar o orçamento com meu marido.",
  },
  {
    phone: "5511965407721",
    name: "Paulo Mendes",
    city: "São Paulo",
    neighborhood: "Aclimação",
    service: "Manutenção preventiva",
    urgency: "Baixa" as const,
    stage: "Agendado",
    aiEnabled: 1,
    quoteCents: 28000,
    preview: "Perfeito, nos vemos na quinta.",
  },
  {
    phone: "5511954420190",
    name: "Camila Souza",
    city: "São Paulo",
    neighborhood: "Saúde",
    service: "Ventilador de teto",
    urgency: "Média" as const,
    stage: "Sem retorno",
    aiEnabled: 0,
    quoteCents: 43000,
    preview: "Pode me chamar quando tiver disponibilidade.",
  },
];

const seedMessages = [
  [
    {
      senderType: "system" as const,
      direction: "system" as const,
      content: "Conversa iniciada pelo WhatsApp",
    },
    {
      senderType: "lead" as const,
      direction: "inbound" as const,
      content:
        "Oi Gabriel, preciso trocar meu chuveiro. Você atende na Vila Mariana?",
    },
    {
      senderType: "ai" as const,
      direction: "outbound" as const,
      content:
        "Olá, Juliana. Atendo sim. Para te orientar melhor, consegue enviar uma foto do ponto de instalação?",
    },
    {
      senderType: "lead" as const,
      direction: "inbound" as const,
      content: "Consigo enviar as fotos ainda hoje.",
    },
  ],
  [
    {
      senderType: "lead" as const,
      direction: "inbound" as const,
      content: "Bom dia, a energia caiu novamente no apartamento.",
    },
    {
      senderType: "ai" as const,
      direction: "outbound" as const,
      content:
        "Entendi, Marcos. Vou sinalizar como prioridade. Você está sem energia em todos os cômodos?",
    },
    {
      senderType: "lead" as const,
      direction: "inbound" as const,
      content: "Sim, e o disjuntor não permanece ligado.",
    },
  ],
  [
    {
      senderType: "lead" as const,
      direction: "inbound" as const,
      content: "Recebi o orçamento, obrigado.",
    },
    {
      senderType: "human" as const,
      direction: "outbound" as const,
      content:
        "Fico à disposição, Renata. Se quiser, posso explicar cada item por aqui.",
    },
    {
      senderType: "lead" as const,
      direction: "inbound" as const,
      content: "Vou analisar o orçamento com meu marido.",
    },
  ],
  [
    {
      senderType: "ai" as const,
      direction: "outbound" as const,
      content: "Sua manutenção ficou reservada para quinta-feira às 14:00.",
    },
    {
      senderType: "lead" as const,
      direction: "inbound" as const,
      content: "Perfeito, nos vemos na quinta.",
    },
  ],
  [
    {
      senderType: "lead" as const,
      direction: "inbound" as const,
      content: "Pode me chamar quando tiver disponibilidade.",
    },
    {
      senderType: "system" as const,
      direction: "system" as const,
      content: "IA pausada automaticamente após 3 dias sem resposta",
    },
  ],
];

export async function ensureDemoInbox() {
  const db = await getDb();
  if (!db || process.env.DEMO_MODE !== "true") return;
  const workspace = await ensureDemoWorkspace();
  if (!workspace) return;
  await db
    .update(contacts)
    .set({ workspaceId: workspace.id })
    .where(sql`${contacts.workspaceId} IS NULL`);
  const existing = await db.select({ id: contacts.id }).from(contacts).limit(1);
  if (existing.length > 0) return;

  for (let index = 0; index < seedContacts.length; index += 1) {
    const seed = seedContacts[index];
    await db.insert(contacts).values({
      workspaceId: workspace.id,
      externalPhone: seed.phone,
      name: seed.name,
      city: seed.city,
      neighborhood: seed.neighborhood,
      serviceRequested: seed.service,
      urgency: seed.urgency,
      stage: seed.stage,
      aiEnabled: seed.aiEnabled,
      quoteCents: seed.quoteCents,
      unreadCount: index < 2 ? (index === 0 ? 2 : 1) : 0,
      lastMessagePreview: seed.preview,
      lastMessageAt: new Date(),
    });
    const contact = await db
      .select()
      .from(contacts)
      .where(eq(contacts.externalPhone, seed.phone))
      .limit(1);
    const contactId = contact[0]?.id;
    if (!contactId) continue;
    await db.insert(conversations).values({
      contactId,
      humanControlled: seed.aiEnabled ? 0 : 1,
      unreadCount: index < 2 ? (index === 0 ? 2 : 1) : 0,
      lastMessageAt: new Date(),
    });
    const conversation = await db
      .select()
      .from(conversations)
      .where(eq(conversations.contactId, contactId))
      .limit(1);
    const conversationId = conversation[0]?.id;
    if (!conversationId) continue;
    for (const item of seedMessages[index]) {
      await db.insert(messages).values({
        conversationId,
        direction: item.direction,
        senderType: item.senderType,
        messageType: "text",
        content: item.content,
        status: item.senderType === "system" ? "received" : "sent",
      });
    }
  }
}

const seedServices = [
  {
    name: "Avaliação inicial",
    description: "Conversa de diagnóstico e definição do próximo passo.",
    durationMinutes: 45,
    priceCents: 0,
  },
  {
    name: "Atendimento padrão",
    description: "Serviço principal do negócio.",
    durationMinutes: 60,
    priceCents: 18000,
  },
  {
    name: "Retorno / manutenção",
    description: "Acompanhamento de cliente existente.",
    durationMinutes: 30,
    priceCents: 9000,
  },
];

export async function ensureDemoAgenda(workspaceId: number) {
  const db = await getDb();
  if (!db || process.env.DEMO_MODE !== "true") return;
  const workspace = (
    await db
      .select()
      .from(workspaces)
      .where(and(eq(workspaces.id, workspaceId), eq(workspaces.active, 1)))
      .limit(1)
  )[0];
  if (!workspace || workspace.slug !== DEMO_WORKSPACE_SLUG) return;
  await ensureDemoInbox();
  let workspaceServices = await db
    .select()
    .from(services)
    .where(eq(services.workspaceId, workspaceId));
  if (workspaceServices.length === 0) {
    for (const service of seedServices)
      await db
        .insert(services)
        .values({ workspaceId: workspaceId, ...service });
    workspaceServices = await db
      .select()
      .from(services)
      .where(eq(services.workspaceId, workspaceId));
  }
  let workspaceProfessionals = await db
    .select()
    .from(professionals)
    .where(eq(professionals.workspaceId, workspaceId));
  if (workspaceProfessionals.length === 0) {
    await db.insert(professionals).values({
      workspaceId: workspaceId,
      name: "Gabriel Barbosa",
      specialty: "Atendimento principal",
      color: "#56d68a",
    });
    workspaceProfessionals = await db
      .select()
      .from(professionals)
      .where(eq(professionals.workspaceId, workspaceId));
  }
  const existingAvailability = await db
    .select({ id: availability.id })
    .from(availability)
    .where(eq(availability.workspaceId, workspaceId))
    .limit(1);
  if (existingAvailability.length === 0 && workspaceProfessionals[0]) {
    for (const weekday of [1, 2, 3, 4, 5, 6]) {
      await db.insert(availability).values({
        workspaceId: workspaceId,
        professionalId: workspaceProfessionals[0].id,
        weekday,
        startMinute: 9 * 60,
        endMinute: 18 * 60,
      });
    }
  }
  const existingLinks = await db
    .select({ id: professionalServices.id })
    .from(professionalServices)
    .where(eq(professionalServices.workspaceId, workspaceId))
    .limit(1);
  if (existingLinks.length === 0) {
    for (const professional of workspaceProfessionals) {
      for (const service of workspaceServices) {
        await db.insert(professionalServices).values({
          workspaceId: workspaceId,
          professionalId: professional.id,
          serviceId: service.id,
          active: 1,
        });
      }
    }
  }
  const existingAppointments = await db
    .select({ id: appointmentsTable.id })
    .from(appointmentsTable)
    .where(eq(appointmentsTable.workspaceId, workspaceId))
    .limit(1);
  if (
    existingAppointments.length === 0 &&
    workspaceServices[1] &&
    workspaceProfessionals[0]
  ) {
    const paulo = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.workspaceId, workspaceId),
          eq(contacts.externalPhone, "5511965407721")
        )
      )
      .limit(1);
    const marcos = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.workspaceId, workspaceId),
          eq(contacts.externalPhone, "5511987104522")
        )
      )
      .limit(1);
    await db.insert(appointmentsTable).values([
      {
        workspaceId: workspaceId,
        contactId: paulo[0]?.id,
        serviceId: workspaceServices[1].id,
        professionalId: workspaceProfessionals[0].id,
        startsAt: new Date("2026-09-24T14:00:00-03:00"),
        endsAt: new Date("2026-09-24T15:00:00-03:00"),
        status: "confirmed",
        notes: "Manutenção preventiva.",
      },
      {
        workspaceId: workspaceId,
        contactId: marcos[0]?.id,
        serviceId: workspaceServices[1].id,
        professionalId: workspaceProfessionals[0].id,
        startsAt: new Date("2026-09-26T17:30:00-03:00"),
        endsAt: new Date("2026-09-26T18:30:00-03:00"),
        status: "requested",
        notes: "Confirmar disponibilidade pelo WhatsApp.",
      },
    ]);
  }
}

export type AgendaSnapshot = {
  timezone: string;
  services: {
    id: number;
    workspaceId: number;
    name: string;
    description: string | null;
    durationMinutes: number;
    priceCents: number;
    active: number;
    createdAt: Date;
    updatedAt: Date;
  }[];
  professionals: {
    id: number;
    workspaceId: number;
    name: string;
    specialty: string | null;
    color: string;
    active: number;
    createdAt: Date;
    updatedAt: Date;
  }[];
  appointments: {
    id: number;
    contactId: number | null;
    serviceId: number;
    professionalId: number;
    startsAt: Date;
    endsAt: Date;
    status:
      | "requested"
      | "confirmed"
      | "in_progress"
      | "completed"
      | "cancelled"
      | "no_show";
    notes: string | null;
    serviceName: string | null;
    professionalName: string | null;
    contactName: string | null;
  }[];
  availability: {
    id: number;
    workspaceId: number;
    professionalId: number;
    weekday: number;
    startMinute: number;
    endMinute: number;
    active: number;
  }[];
  serviceLinks: {
    id: number;
    workspaceId: number;
    professionalId: number;
    serviceId: number;
    active: number;
    createdAt: Date;
  }[];
};

export async function getAgendaSnapshot(
  workspaceId: number,
  professionalId?: number,
  includeWorkspaceAvailability = false
): Promise<AgendaSnapshot> {
  const db = await getDb();
  const emptySnapshot: AgendaSnapshot = {
    timezone: "America/Sao_Paulo",
    services: [],
    professionals: [],
    appointments: [],
    availability: [],
    serviceLinks: [],
  };
  if (!db) return emptySnapshot;
  const workspace = (
    await db
      .select({ timezone: workspaces.timezone, slug: workspaces.slug })
      .from(workspaces)
      .where(and(eq(workspaces.id, workspaceId), eq(workspaces.active, 1)))
      .limit(1)
  )[0];
  if (!workspace) return emptySnapshot;
  if (workspace.slug === DEMO_WORKSPACE_SLUG)
    await ensureDemoAgenda(workspaceId);
  const professionalFilter = professionalId
    ? and(
        eq(professionals.workspaceId, workspaceId),
        eq(professionals.id, professionalId)
      )
    : eq(professionals.workspaceId, workspaceId);
  const appointmentFilter = professionalId
    ? and(
        eq(appointmentsTable.workspaceId, workspaceId),
        eq(appointmentsTable.professionalId, professionalId)
      )
    : eq(appointmentsTable.workspaceId, workspaceId);
  const links = await db
    .select()
    .from(professionalServices)
    .where(
      and(
        eq(professionalServices.workspaceId, workspaceId),
        eq(professionalServices.active, 1)
      )
    );
  const [workspaceServices, workspaceProfessionals, workspaceAppointments] =
    await Promise.all([
      db
        .select()
        .from(services)
        .where(
          and(eq(services.workspaceId, workspaceId), eq(services.active, 1))
        ),
      db
        .select()
        .from(professionals)
        .where(
          and(
            eq(professionals.workspaceId, workspaceId),
            eq(professionals.active, 1),
            professionalFilter
          )
        ),
      db
        .select({
          id: appointmentsTable.id,
          contactId: appointmentsTable.contactId,
          serviceId: appointmentsTable.serviceId,
          professionalId: appointmentsTable.professionalId,
          startsAt: appointmentsTable.startsAt,
          endsAt: appointmentsTable.endsAt,
          status: appointmentsTable.status,
          notes: appointmentsTable.notes,
          serviceName: services.name,
          professionalName: professionals.name,
          contactName: contacts.name,
        })
        .from(appointmentsTable)
        .leftJoin(
          services,
          and(
            eq(services.id, appointmentsTable.serviceId),
            eq(services.workspaceId, workspaceId)
          )
        )
        .leftJoin(
          professionals,
          and(
            eq(professionals.id, appointmentsTable.professionalId),
            eq(professionals.workspaceId, workspaceId)
          )
        )
        .leftJoin(
          contacts,
          and(
            eq(contacts.id, appointmentsTable.contactId),
            eq(contacts.workspaceId, workspaceId)
          )
        )
        .where(appointmentFilter)
        .orderBy(appointmentsTable.startsAt, appointmentsTable.id),
    ]);
  const visibleServices = professionalId
    ? workspaceServices.filter(
        service =>
          links.length === 0 ||
          links.some(
            link =>
              link.serviceId === service.id &&
              link.professionalId === professionalId
          )
      )
    : workspaceServices;
  const professionalAvailability =
    professionalId || includeWorkspaceAvailability
      ? await db
          .select()
          .from(availability)
          .where(
            and(
              eq(availability.workspaceId, workspaceId),
              eq(availability.active, 1),
              ...(professionalId
                ? [eq(availability.professionalId, professionalId)]
                : [])
            )
          )
          .orderBy(availability.weekday)
      : [];
  return {
    timezone: workspace.timezone,
    services: visibleServices,
    professionals: workspaceProfessionals,
    appointments: workspaceAppointments,
    availability: professionalAvailability,
    serviceLinks: links,
  };
}

export async function createAgendaAppointment(
  workspaceId: number,
  input: {
    contactId?: number;
    serviceId: number;
    professionalId: number;
    startsAt: Date;
    endsAt: Date;
    notes?: string;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const workspace = (
    await db
      .select({
        id: workspaces.id,
        timezone: workspaces.timezone,
        slug: workspaces.slug,
      })
      .from(workspaces)
      .where(and(eq(workspaces.id, workspaceId), eq(workspaces.active, 1)))
      .limit(1)
  )[0];
  if (!workspace) throw new Error("Workspace unavailable");
  if (workspace.slug === DEMO_WORKSPACE_SLUG)
    await ensureDemoAgenda(workspaceId);
  if (input.endsAt <= input.startsAt)
    throw new ScheduleError(
      "invalid_period",
      "O horário final precisa ser maior que o inicial"
    );
  if (input.contactId) {
    const contact = (
      await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(
          and(
            eq(contacts.id, input.contactId),
            eq(contacts.workspaceId, workspaceId),
            isNull(contacts.groupId)
          )
        )
        .limit(1)
    )[0];
    if (!contact)
      throw new ScheduleError(
        "contact_unavailable",
        "Contato não encontrado neste workspace"
      );
  }
  const createdAppointment = await db.transaction(async tx => {
    await tx.execute(
      sql`SELECT "id" FROM "professionals" WHERE "id" = ${input.professionalId} AND "workspaceId" = ${workspaceId} AND "active" = 1 FOR UPDATE`
    );
    const professional = (
      await tx
        .select({ id: professionals.id })
        .from(professionals)
        .where(
          and(
            eq(professionals.id, input.professionalId),
            eq(professionals.workspaceId, workspaceId),
            eq(professionals.active, 1)
          )
        )
        .limit(1)
    )[0];
    if (!professional)
      throw new ScheduleError(
        "professional_unavailable",
        "Este profissional não está ativo neste workspace"
      );
    const service = (
      await tx
        .select({ id: services.id })
        .from(services)
        .where(
          and(
            eq(services.id, input.serviceId),
            eq(services.workspaceId, workspaceId),
            eq(services.active, 1)
          )
        )
        .limit(1)
    )[0];
    if (!service)
      throw new ScheduleError(
        "service_unavailable",
        "Este serviço não está ativo neste workspace"
      );
    const anyConfiguredLink = (
      await tx
        .select({ id: professionalServices.id })
        .from(professionalServices)
        .where(eq(professionalServices.workspaceId, workspaceId))
        .limit(1)
    )[0];
    if (anyConfiguredLink) {
      const matchingLink = (
        await tx
          .select({ id: professionalServices.id })
          .from(professionalServices)
          .where(
            and(
              eq(professionalServices.workspaceId, workspaceId),
              eq(professionalServices.professionalId, input.professionalId),
              eq(professionalServices.serviceId, input.serviceId),
              eq(professionalServices.active, 1)
            )
          )
          .limit(1)
      )[0];
      if (!matchingLink)
        throw new ScheduleError(
          "service_unavailable",
          "Este profissional não executa o serviço neste workspace"
        );
    }
    const windows = await tx
      .select({
        weekday: availability.weekday,
        startMinute: availability.startMinute,
        endMinute: availability.endMinute,
      })
      .from(availability)
      .where(
        and(
          eq(availability.workspaceId, workspaceId),
          eq(availability.professionalId, input.professionalId),
          eq(availability.active, 1)
        )
      );
    assertWithinWorkingHours(
      input.startsAt,
      input.endsAt,
      workspace.timezone,
      windows
    );
    const conflict = await tx
      .select({ id: appointmentsTable.id })
      .from(appointmentsTable)
      .where(
        and(
          eq(appointmentsTable.workspaceId, workspaceId),
          eq(appointmentsTable.professionalId, input.professionalId),
          ne(appointmentsTable.status, "cancelled"),
          lt(appointmentsTable.startsAt, input.endsAt),
          gt(appointmentsTable.endsAt, input.startsAt)
        )
      )
      .limit(1);
    if (conflict.length > 0)
      throw new ScheduleError(
        "appointment_conflict",
        "Horário indisponível: existe outro atendimento deste profissional neste intervalo"
      );
    const created = await tx
      .insert(appointmentsTable)
      .values({ ...input, workspaceId, status: "requested", source: "panel" })
      .returning();
    return created[0];
  });
  if (createdAppointment)
    await enqueueDomainEvent({
      workspaceId,
      event: "appointment.created",
      aggregateType: "appointment",
      aggregateId: createdAppointment.id,
      eventKey: `appointment.created:${createdAppointment.id}`,
      payload: {
        appointmentId: createdAppointment.id,
        contactId: createdAppointment.contactId,
        serviceId: createdAppointment.serviceId,
        professionalId: createdAppointment.professionalId,
        startsAt: createdAppointment.startsAt,
        endsAt: createdAppointment.endsAt,
        status: createdAppointment.status,
      },
    });
  return createdAppointment;
}

function inboxMessageInstanceFilter(instanceIds?: readonly string[] | null) {
  if (!instanceIds?.length) return undefined;
  return or(
    ...instanceIds.map(
      instanceId => sql`${messages.metadata}->>'instanceId' = ${instanceId}`
    )
  );
}

function inboxMessageWorkspaceOwnershipFilter(workspaceId: number) {
  return sql`(
    ${messages.provider}::text <> 'baileys'
    OR ${messages.metadata}->>'instanceId' IS NULL
    OR EXISTS (
      SELECT 1
      FROM "whatsappInstances" AS inbox_instance
      WHERE inbox_instance."workspaceId" = ${workspaceId}
        AND inbox_instance."provider"::text = 'baileys'
        AND inbox_instance."instanceId" = ${messages.metadata}->>'instanceId'
    )
  )`;
}

export async function listInboxContacts(
  workspaceId: number,
  viewerUserId?: number,
  instanceIds?: readonly string[] | null,
  includeGroups = false
) {
  const db = await getDb();
  if (!db) return [];
  const readRows = viewerUserId === undefined
    ? []
    : await db
        .select({
          conversationId: conversationReads.conversationId,
          lastReadMessageId: conversationReads.lastReadMessageId,
        })
        .from(conversationReads)
        .where(
          and(
            eq(conversationReads.workspaceId, workspaceId),
            eq(conversationReads.userId, viewerUserId)
          )
        );
  const readCursorByConversation = new Map(
    readRows.map(row => [row.conversationId, row.lastReadMessageId ?? 0])
  );
  const contactRows = await db
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.workspaceId, workspaceId),
        ...(includeGroups ? [] : [isNull(contacts.groupId)])
      )
    )
    .orderBy(desc(contacts.lastMessageAt), desc(contacts.id));
  const groupIds = contactRows
    .map(contact => contact.groupId)
    .filter((id): id is number => id !== null);
  const groupRows = groupIds.length
    ? await db
        .select({
          id: whatsappGroups.id,
          jid: whatsappGroups.jid,
          subject: whatsappGroups.subject,
          instanceId: whatsappGroups.instanceId,
        })
        .from(whatsappGroups)
        .where(
          and(
            eq(whatsappGroups.workspaceId, workspaceId),
            inArray(whatsappGroups.id, groupIds)
          )
        )
    : [];
  const groupById = new Map(groupRows.map(group => [group.id, group]));
  const groupParticipantRows = groupRows.length
    ? await db
        .select({
          groupId: whatsappGroupParticipants.groupId,
          jid: whatsappGroupParticipants.jid,
          jidAlt: whatsappGroupParticipants.jidAlt,
          name: whatsappGroupParticipants.name,
          isAdmin: whatsappGroupParticipants.isAdmin,
        })
        .from(whatsappGroupParticipants)
        .innerJoin(
          whatsappGroups,
          eq(whatsappGroupParticipants.groupId, whatsappGroups.id)
        )
        .where(
          and(
            eq(whatsappGroups.workspaceId, workspaceId),
            inArray(
              whatsappGroupParticipants.groupId,
              groupRows.map(group => group.id)
            )
          )
        )
        .orderBy(
          desc(whatsappGroupParticipants.isAdmin),
          asc(whatsappGroupParticipants.name),
          asc(whatsappGroupParticipants.jid)
        )
    : [];
  const participantsByGroupId = new Map<
    number,
    Array<{
      jid: string;
      jidAlt: string | null;
      name: string | null;
      isAdmin: number;
    }>
  >();
  for (const participant of groupParticipantRows) {
    const participants = participantsByGroupId.get(participant.groupId) ?? [];
    participants.push(participant);
    participantsByGroupId.set(participant.groupId, participants);
  }
  const messageRows = await db
    .select({
      contactId: conversations.contactId,
      conversationId: conversations.id,
      id: messages.id,
      direction: messages.direction,
      status: messages.status,
      content: messages.content,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .innerJoin(contacts, eq(conversations.contactId, contacts.id))
    .where(
      and(
        eq(contacts.workspaceId, workspaceId),
        inboxMessageWorkspaceOwnershipFilter(workspaceId),
        ...(inboxMessageInstanceFilter(instanceIds)
          ? [inboxMessageInstanceFilter(instanceIds)!]
          : [])
      )
    )
    .orderBy(asc(messages.createdAt), asc(messages.id));
  const activitiesByContact = new Map<number, ConversationActivity[]>();
  const lastMessageByContact = new Map<number, (typeof messageRows)[number]>();
  const unreadByContact = new Map<number, number>();
  for (const row of messageRows) {
    const activities = activitiesByContact.get(row.contactId) ?? [];
    activities.push(row);
    activitiesByContact.set(row.contactId, activities);
    lastMessageByContact.set(row.contactId, row);
  }
  const unreadRows =
    viewerUserId === undefined || !instanceIds?.length
      ? messageRows
      : await db
          .select({
            contactId: conversations.contactId,
            conversationId: conversations.id,
            id: messages.id,
            direction: messages.direction,
          })
          .from(messages)
          .innerJoin(conversations, eq(messages.conversationId, conversations.id))
          .innerJoin(contacts, eq(conversations.contactId, contacts.id))
          .where(
            and(
              eq(contacts.workspaceId, workspaceId),
              inboxMessageWorkspaceOwnershipFilter(workspaceId)
            )
          );
  for (const row of unreadRows) {
    if (
      viewerUserId !== undefined &&
      row.direction === "inbound" &&
      row.id > (readCursorByConversation.get(row.conversationId) ?? 0)
    ) {
      unreadByContact.set(
        row.contactId,
        (unreadByContact.get(row.contactId) ?? 0) + 1
      );
    }
  }
  return contactRows
    .filter(
      contact => !instanceIds?.length || activitiesByContact.has(contact.id)
    )
    .map(contact => {
      const activities = activitiesByContact.get(contact.id) ?? [];
      const filteredLastMessage = instanceIds?.length
        ? lastMessageByContact.get(contact.id)
        : undefined;
      const group = contact.groupId ? groupById.get(contact.groupId) : undefined;
      return {
        ...contact,
        isGroup: Boolean(contact.groupId),
        groupJid: group?.jid ?? null,
        groupSubject: group?.subject ?? null,
        groupInstanceId: group?.instanceId ?? null,
        groupParticipantCount: group
          ? (participantsByGroupId.get(group.id)?.length ?? 0)
          : 0,
        groupParticipants: group
          ? (participantsByGroupId.get(group.id) ?? []).slice(0, 20)
          : [],
        ...(filteredLastMessage
          ? {
              lastMessagePreview: filteredLastMessage.content,
              lastMessageAt: filteredLastMessage.createdAt,
            }
          : {}),
        unreadCount:
          viewerUserId === undefined
            ? contact.unreadCount
            : (unreadByContact.get(contact.id) ?? 0),
        ...deriveConversationState(activities),
      };
    });
}

export async function markConversationRead(
  workspaceId: number,
  userId: number,
  contactId: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => {
    const conversation = (
      await tx
        .select({ id: conversations.id })
        .from(conversations)
        .innerJoin(contacts, eq(contacts.id, conversations.contactId))
        .where(
          and(
            eq(conversations.contactId, contactId),
            eq(contacts.workspaceId, workspaceId)
          )
        )
        .limit(1)
    )[0];
    if (!conversation) return undefined;
    const latestMessage = (
      await tx
        .select({ id: messages.id })
        .from(messages)
        .where(eq(messages.conversationId, conversation.id))
        .orderBy(desc(messages.id))
        .limit(1)
    )[0];
    if (!latestMessage) return undefined;
    const readAt = new Date();
    const saved = await tx
      .insert(conversationReads)
      .values({
        workspaceId,
        conversationId: conversation.id,
        userId,
        lastReadMessageId: latestMessage.id,
        readAt,
        updatedAt: readAt,
      })
      .onConflictDoUpdate({
        target: [
          conversationReads.workspaceId,
          conversationReads.conversationId,
          conversationReads.userId,
        ],
        set: {
          lastReadMessageId: latestMessage.id,
          readAt,
          updatedAt: readAt,
        },
      })
      .returning();
    return saved[0];
  });
}

export async function getConversationByContact(
  workspaceId: number,
  contactId: number
) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(conversations)
    .innerJoin(contacts, eq(contacts.id, conversations.contactId))
    .where(
      and(
        eq(conversations.contactId, contactId),
        eq(contacts.workspaceId, workspaceId)
      )
    )
    .limit(1);
  return result[0]?.conversations;
}

export async function listMessagesForContact(
  workspaceId: number,
  contactId: number,
  options?: {
    limit?: number;
    since?: Date;
    instanceIds?: readonly string[] | null;
  }
) {
  const db = await getDb();
  if (!db) return [];
  const conversation = await getConversationByContact(workspaceId, contactId);
  if (!conversation) return [];
  const limit = Math.min(Math.max(options?.limit ?? 200, 1), 500);
  const rows = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversation.id),
        inboxMessageWorkspaceOwnershipFilter(workspaceId),
        ...(inboxMessageInstanceFilter(options?.instanceIds)
          ? [inboxMessageInstanceFilter(options?.instanceIds)!]
          : []),
        ...(options?.since ? [gte(messages.createdAt, options.since)] : [])
      )
    )
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(limit);
  const hydratedRows: typeof rows = [];
  for (let offset = 0; offset < rows.length; offset += 10) {
    const batch = await Promise.all(
      rows.slice(offset, offset + 10).map(async row => {
        const metadata =
          row.metadata && typeof row.metadata === "object"
            ? (row.metadata as Record<string, unknown>)
            : undefined;
        if (typeof metadata?.mediaStorageKey !== "string") return row;
        try {
          const mediaUrl = await resolvePrivateMediaUrl(metadata);
          if (!mediaUrl) return row;
          return { ...row, metadata: { ...metadata, mediaUrl } };
        } catch {
          // A media signing outage must not make authorized text history unavailable.
          return row;
        }
      })
    );
    hydratedRows.push(...batch);
  }
  return hydratedRows.reverse();
}

export async function setContactAi(
  workspaceId: number,
  contactId: number,
  enabled: boolean,
  actorUserId?: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const updated = await db
    .update(contacts)
    .set({ aiEnabled: enabled ? 1 : 0, updatedAt: new Date() })
    .where(
      and(
        eq(contacts.id, contactId),
        eq(contacts.workspaceId, workspaceId),
        isNull(contacts.groupId)
      )
    )
    .returning({ id: contacts.id });
  if (!updated[0]) throw new Error("Contact not found");
  const conversation = await getConversationByContact(workspaceId, contactId);
  if (conversation) {
    await db
      .update(conversations)
      .set({ humanControlled: enabled ? 0 : 1, updatedAt: new Date() })
      .where(eq(conversations.id, conversation.id));
  }
  await db.insert(auditLogs).values({
    workspaceId,
    actorUserId,
    contactId,
    action: enabled ? "ai_enabled" : "ai_paused",
    summary: enabled
      ? "IA reativada pelo operador"
      : "IA pausada pelo operador",
  });
}

export async function sendManualMessage(
  workspaceId: number,
  contactId: number,
  content: string,
  actorUserId?: number,
  messageType: "text" | "image" | "audio" | "video" | "document" = "text",
  messageMetadata?: Record<string, unknown>,
  instanceIds?: readonly string[] | null
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const contact = await getContactById(workspaceId, contactId);
  if (!contact) throw new Error("Contact not found");
  const conversation = await getConversationByContact(workspaceId, contactId);
  if (!conversation) throw new Error("Conversation not found");
  const routeFilter = inboxMessageInstanceFilter(instanceIds);
  let latestInbound = await db
    .select({ metadata: messages.metadata, provider: messages.provider })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversation.id),
        eq(messages.direction, "inbound"),
        inboxMessageWorkspaceOwnershipFilter(workspaceId),
        ...(routeFilter ? [routeFilter] : [])
      )
    )
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(1);
  if (!latestInbound[0])
    latestInbound = await db
      .select({ metadata: messages.metadata, provider: messages.provider })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversation.id),
          inboxMessageWorkspaceOwnershipFilter(workspaceId),
          ...(routeFilter ? [routeFilter] : [])
        )
      )
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(1);
  const defaultProvider = await getDefaultWhatsappProvider(workspaceId);
  const defaultPapiWebhook =
    defaultProvider === "papi" ? await getDefaultPapiWebhook(workspaceId) : undefined;
  const route = resolveReplyRoute({
    latestInbound: latestInbound[0],
    defaultProvider,
    defaultInstanceId: defaultPapiWebhook?.instanceId,
  });
  if (
    !route.instanceId &&
    route.provider === "baileys" &&
    instanceIds?.length === 1
  )
    route.instanceId = instanceIds[0];
  if (route.provider === "papi" && !route.instanceId)
    throw new Error(
      "Associe uma instância PAPI à origem da conversa ou configure uma instância padrão para mensagens legadas"
    );
  const createdAt = new Date();
  const metadata = {
    ...(messageMetadata ?? {}),
    ...(route.jid ? { jid: route.jid } : {}),
    ...(route.instanceId ? { instanceId: route.instanceId } : {}),
    ...(route.usedLegacyFallback ? { routingSource: "legacy_default" } : { routingSource: "inbound_origin" }),
  };
  await db.insert(messages).values({
    conversationId: conversation.id,
    direction: "outbound",
    senderType: "human",
    messageType,
    content:
      messageType === "text"
        ? content
        : String(messageMetadata?.fileName ?? `[${messageType}]`),
    metadata: Object.keys(metadata).length ? metadata : undefined,
    status: "queued",
    provider: route.provider,
    createdAt,
  });
  await db
    .update(contacts)
    .set({
      aiEnabled: 0,
      unreadCount: 0,
      lastMessagePreview:
        messageType === "text"
          ? content.slice(0, 500)
          : String(messageMetadata?.fileName ?? `[${messageType}]`),
      lastMessageAt: createdAt,
      updatedAt: createdAt,
    })
    .where(eq(contacts.id, contactId));
  await db
    .update(conversations)
    .set({
      humanControlled: 1,
      unreadCount: 0,
      lastMessageAt: createdAt,
      updatedAt: createdAt,
    })
    .where(eq(conversations.id, conversation.id));
  await db.insert(auditLogs).values({
    workspaceId,
    actorUserId,
    contactId,
    action: "manual_message_queued",
    summary: `Mensagem manual enfileirada para ${route.provider}`,
  });
  const result = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversation.id),
        eq(messages.createdAt, createdAt)
      )
    )
    .orderBy(desc(messages.id))
    .limit(1);
  return result[0];
}

export async function moveContactStage(
  workspaceId: number,
  contactId: number,
  stage: string,
  actorUserId?: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const updatedAt = new Date();
  const updated = await db
    .update(contacts)
    .set({ stage, updatedAt })
    .where(
      and(eq(contacts.id, contactId), eq(contacts.workspaceId, workspaceId))
    )
    .returning({ id: contacts.id });
  if (!updated[0]) throw new Error("Contact not found");
  await db.insert(auditLogs).values({
    workspaceId,
    actorUserId,
    contactId,
    action: "stage_changed",
    summary: `Lead movido para ${stage}`,
  });
  const contact = await getContactById(workspaceId, contactId);
  if (contact?.workspaceId) {
    await enqueueDomainEvent({
      workspaceId: contact.workspaceId,
      event: "stage.changed",
      aggregateType: "contact",
      aggregateId: contactId,
      eventKey: `stage.changed:${contactId}:${updatedAt.toISOString()}`,
      payload: { contactId, stage, actorUserId, changedAt: updatedAt },
    });
  }
}

export async function getContactById(workspaceId: number, contactId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(contacts)
    .where(
      and(eq(contacts.id, contactId), eq(contacts.workspaceId, workspaceId))
    )
    .limit(1);
  return result[0];
}

export async function listContactNotes(workspaceId: number, contactId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(contactNotes)
    .where(
      and(
        eq(contactNotes.contactId, contactId),
        eq(contactNotes.workspaceId, workspaceId)
      )
    )
    .orderBy(desc(contactNotes.createdAt), desc(contactNotes.id))
    .limit(50);
}

export async function addContactNote(
  workspaceId: number,
  contactId: number,
  content: string,
  actorUserId?: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const contact = await getContactById(workspaceId, contactId);
  if (!contact || !contact.workspaceId) throw new Error("Contact not found");
  const created = await db
    .insert(contactNotes)
    .values({
      workspaceId: contact.workspaceId,
      contactId,
      content: content.trim(),
      authorType: "human",
    })
    .returning();
  await db.insert(auditLogs).values({
    workspaceId,
    actorUserId,
    contactId,
    action: "note_created",
    summary: "Nota interna adicionada à ficha",
  });
  return created[0];
}

export async function getAuditLogForContact(
  workspaceId: number,
  contactId: number
) {
  const db = await getDb();
  if (!db) return [];
  const contact = await getContactById(workspaceId, contactId);
  if (!contact) return [];
  return db
    .select()
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.workspaceId, workspaceId),
        eq(auditLogs.contactId, contactId)
      )
    )
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(20);
}

export async function countContacts() {
  const db = await getDb();
  if (!db) return 0;
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(contacts)
    .where(isNull(contacts.groupId));
  return Number(result[0]?.count ?? 0);
}

export async function getDashboardSnapshot(workspaceId: number) {
  const db = await getDb();
  const workspace = (
    await db
      ?.select()
      .from(workspaces)
      .where(and(eq(workspaces.id, workspaceId), eq(workspaces.active, 1)))
      .limit(1)
  )?.[0];
  if (!db || !workspace)
    return {
      newContactsToday: 0,
      awaitingResponse: 0,
      aiPaused: 0,
      urgentOpen: 0,
      quotesPendingCents: 0,
      appointmentsToday: 0,
      receivedMonthCents: 0,
      pendingCents: 0,
      recentEvents: [],
      upcomingAppointments: [],
    };
  const workspaceContacts = await listInboxContacts(workspace.id);
  const workspaceAppointments = await db
    .select()
    .from(appointmentsTable)
    .where(eq(appointmentsTable.workspaceId, workspaceId))
    .orderBy(asc(appointmentsTable.startsAt));
  const contactIds = workspaceContacts.map(contact => contact.id);
  const recentEvents =
    contactIds.length === 0
      ? []
      : await db
          .select()
          .from(auditLogs)
          .where(
            and(
              eq(auditLogs.workspaceId, workspaceId),
              sql`${auditLogs.contactId} IN (${sql.join(
                contactIds.map(id => sql`${id}`),
                sql`, `
              )})`
            )
          )
          .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
          .limit(8);
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const activeAppointments = workspaceAppointments.filter(
    appointment => appointment.status !== "cancelled"
  );
  const pendingCents = workspaceContacts.reduce(
    (total, contact) => total + contact.quoteCents,
    0
  );
  return {
    newContactsToday: workspaceContacts.filter(
      contact => contact.createdAt >= startOfToday
    ).length,
    awaitingResponse: workspaceContacts.filter(
      contact => contact.awaitingResponse
    ).length,
    aiPaused: workspaceContacts.filter(contact => contact.aiEnabled === 0)
      .length,
    urgentOpen: workspaceContacts.filter(
      contact =>
        (contact.urgency === "Alta" || contact.urgency === "Crítica") &&
        contact.stage !== "Concluído"
    ).length,
    quotesPendingCents: pendingCents,
    appointmentsToday: activeAppointments.filter(
      appointment =>
        appointment.startsAt >= startOfToday &&
        appointment.startsAt <
          new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000)
    ).length,
    receivedMonthCents: 0,
    pendingCents,
    recentEvents,
    upcomingAppointments: activeAppointments
      .filter(appointment => appointment.startsAt >= now)
      .slice(0, 5),
  };
}

export async function listQuotes(workspaceId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ quote: quotes, contact: contacts })
    .from(quotes)
    .leftJoin(contacts, eq(quotes.contactId, contacts.id))
    .where(eq(quotes.workspaceId, workspaceId))
    .orderBy(desc(quotes.createdAt));
  return rows.map(({ quote, contact }) => ({
    ...quote,
    contactName: contact?.name ?? "Contato removido",
    contactInitials: (contact?.name ?? "CR")
      .split(" ")
      .map(part => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase(),
  }));
}

export async function createQuote(
  input: {
    contactId: number;
    serviceName: string;
    description?: string;
    quotedCents: number;
    receivedCents?: number;
    status?:
      | "orcamento"
      | "aguardando_aprovacao"
      | "aprovado"
      | "sinal_pendente"
      | "parcialmente_pago"
      | "pago"
      | "cancelado";
    dueDate?: Date;
    notes?: string;
  },
  workspaceId: number,
  actorUserId?: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const contact = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(
        eq(contacts.id, input.contactId),
        eq(contacts.workspaceId, workspaceId),
        isNull(contacts.groupId)
      )
    )
    .limit(1);
  if (!contact[0]) throw new Error("Contact not found");
  const now = new Date();
  const inserted = await db
    .insert(quotes)
    .values({
      workspaceId,
      contactId: input.contactId,
      serviceName: input.serviceName,
      description: input.description,
      quotedCents: input.quotedCents,
      receivedCents: input.receivedCents ?? 0,
      status: input.status ?? "orcamento",
      dueDate: input.dueDate,
      notes: input.notes,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  await db
    .update(contacts)
    .set({ quoteCents: input.quotedCents, updatedAt: now })
    .where(
      and(
        eq(contacts.id, input.contactId),
        eq(contacts.workspaceId, workspaceId)
      )
    );
  await db.insert(auditLogs).values({
    workspaceId,
    actorUserId,
    contactId: input.contactId,
    action: "quote_created",
    summary: `Orçamento criado: ${input.serviceName}`,
  });
  return inserted[0];
}

export async function updateQuotePayment(
  id: number,
  receivedCents: number,
  status:
    | "orcamento"
    | "aguardando_aprovacao"
    | "aprovado"
    | "sinal_pendente"
    | "parcialmente_pago"
    | "pago"
    | "cancelado",
  workspaceId: number,
  actorUserId?: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const existing = await db
    .select()
    .from(quotes)
    .where(and(eq(quotes.id, id), eq(quotes.workspaceId, workspaceId)))
    .limit(1);
  if (!existing[0]) throw new Error("Quote not found");
  const updated = await db
    .update(quotes)
    .set({ receivedCents, status, updatedAt: new Date() })
    .where(and(eq(quotes.id, id), eq(quotes.workspaceId, workspaceId)))
    .returning();
  await db.insert(auditLogs).values({
    workspaceId,
    actorUserId,
    contactId: existing[0].contactId,
    action: "quote_updated",
    summary: `Recebimento do orçamento atualizado para ${receivedCents} centavos`,
  });
  return updated[0];
}

export async function getApiIdempotency(workspaceId: number, key: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(apiIdempotency)
    .where(
      and(
        eq(apiIdempotency.workspaceId, workspaceId),
        eq(apiIdempotency.key, key)
      )
    )
    .limit(1);
  return result[0];
}

export async function claimApiIdempotency(input: {
  key: string;
  fingerprint: string;
  workspaceId: number;
  leaseMs?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const leaseUntil = new Date(
    Date.now() + Math.max(10_000, Math.min(input.leaseMs ?? 120_000, 900_000))
  );
  const inserted = await db
    .insert(apiIdempotency)
    .values({
      key: input.key,
      fingerprint: input.fingerprint,
      status: "processing",
      workspaceId: input.workspaceId,
      leaseUntil,
      updatedAt: new Date(),
    })
    .onConflictDoNothing({
      target: [apiIdempotency.workspaceId, apiIdempotency.key],
    })
    .returning();
  if (inserted[0]) return { claimed: true, record: inserted[0] };
  const existing = await getApiIdempotency(input.workspaceId, input.key);
  if (!existing) return { claimed: false, retry: true };
  if (existing.fingerprint !== input.fingerprint)
    return { claimed: false, conflict: true, record: existing };
  if (existing.status === "completed")
    return { claimed: false, completed: true, record: existing };
  const reclaimed = await db
    .update(apiIdempotency)
    .set({ status: "processing", leaseUntil, updatedAt: new Date() })
    .where(
      and(
        eq(apiIdempotency.workspaceId, input.workspaceId),
        eq(apiIdempotency.key, input.key),
        eq(apiIdempotency.fingerprint, input.fingerprint),
        or(
          eq(apiIdempotency.status, "failed"),
          and(
            eq(apiIdempotency.status, "processing"),
            or(
              isNull(apiIdempotency.leaseUntil),
              lt(apiIdempotency.leaseUntil, new Date())
            )
          )
        )
      )
    )
    .returning();
  if (reclaimed[0]) return { claimed: true, record: reclaimed[0] };
  return { claimed: false, inProgress: true, record: existing };
}

export async function completeApiIdempotency(input: {
  workspaceId: number;
  key: string;
  statusCode: number;
  responseBody: unknown;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db
    .update(apiIdempotency)
    .set({
      status: "completed",
      statusCode: input.statusCode,
      responseBody: JSON.stringify(input.responseBody),
      leaseUntil: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(apiIdempotency.workspaceId, input.workspaceId),
        eq(apiIdempotency.key, input.key)
      )
    );
}

export async function failApiIdempotency(workspaceId: number, key: string) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(apiIdempotency)
    .set({ status: "failed", leaseUntil: null, updatedAt: new Date() })
    .where(
      and(
        eq(apiIdempotency.workspaceId, workspaceId),
        eq(apiIdempotency.key, key)
      )
    );
}

export async function claimAgentEffect(input: {
  workspaceId: number;
  eventId: string;
  toolCallId: string;
  toolName: string;
  fingerprint: string;
  leaseMs?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const { leaseMs: _leaseMs, ...recordInput } = input;
  const leaseUntil = new Date(
    Date.now() + Math.max(10_000, Math.min(input.leaseMs ?? 120_000, 900_000))
  );
  const inserted = await db
    .insert(agentEffects)
    .values({
      ...recordInput,
      status: "processing",
      leaseUntil,
      updatedAt: new Date(),
    })
    .onConflictDoNothing({
      target: [
        agentEffects.workspaceId,
        agentEffects.eventId,
        agentEffects.toolCallId,
      ],
    })
    .returning();
  if (inserted[0]) return { claimed: true, record: inserted[0] };
  const existing = (
    await db
      .select()
      .from(agentEffects)
      .where(
        and(
          eq(agentEffects.workspaceId, input.workspaceId),
          eq(agentEffects.eventId, input.eventId),
          eq(agentEffects.toolCallId, input.toolCallId)
        )
      )
      .limit(1)
  )[0];
  if (!existing) return { claimed: false, retry: true };
  if (
    existing.fingerprint !== input.fingerprint ||
    existing.toolName !== input.toolName
  )
    return { claimed: false, conflict: true, record: existing };
  if (existing.status === "completed")
    return {
      claimed: false,
      completed: true,
      result: existing.result ? JSON.parse(existing.result) : null,
      record: existing,
    };
  const reclaimed = await db
    .update(agentEffects)
    .set({ status: "processing", leaseUntil, updatedAt: new Date() })
    .where(
      and(
        eq(agentEffects.workspaceId, input.workspaceId),
        eq(agentEffects.eventId, input.eventId),
        eq(agentEffects.toolCallId, input.toolCallId),
        or(
          eq(agentEffects.status, "failed"),
          and(
            eq(agentEffects.status, "processing"),
            or(
              isNull(agentEffects.leaseUntil),
              lt(agentEffects.leaseUntil, new Date())
            )
          )
        )
      )
    )
    .returning();
  if (reclaimed[0]) return { claimed: true, record: reclaimed[0] };
  return { claimed: false, inProgress: true, record: existing };
}

export async function completeAgentEffect(input: {
  workspaceId: number;
  eventId: string;
  toolCallId: string;
  result: unknown;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db
    .update(agentEffects)
    .set({
      status: "completed",
      result: JSON.stringify(input.result),
      leaseUntil: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(agentEffects.workspaceId, input.workspaceId),
        eq(agentEffects.eventId, input.eventId),
        eq(agentEffects.toolCallId, input.toolCallId)
      )
    );
}

export async function failAgentEffect(input: {
  workspaceId: number;
  eventId: string;
  toolCallId: string;
  result?: unknown;
}) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(agentEffects)
    .set({
      status: "failed",
      result:
        input.result === undefined ? undefined : JSON.stringify(input.result),
      leaseUntil: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(agentEffects.workspaceId, input.workspaceId),
        eq(agentEffects.eventId, input.eventId),
        eq(agentEffects.toolCallId, input.toolCallId)
      )
    );
}

export async function registerWebhookEvent(input: {
  eventId: string;
  provider: string;
  payload: unknown;
  workspaceId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const payload = JSON.stringify(input.payload);
  const inserted = await db
    .insert(webhookEvents)
    .values({
      eventId: input.eventId,
      provider: input.provider,
      payload,
      workspaceId: input.workspaceId,
      status: "received",
    })
    .onConflictDoNothing({
      target: [webhookEvents.workspaceId, webhookEvents.eventId],
    })
    .returning();
  if (inserted[0])
    return { duplicate: false, conflict: false, event: inserted[0] };
  const existing = await db
    .select()
    .from(webhookEvents)
    .where(
      and(
        eq(webhookEvents.workspaceId, input.workspaceId),
        eq(webhookEvents.eventId, input.eventId)
      )
    )
    .limit(1);
  if (existing[0]) {
    if (existing[0].payload !== payload)
      return { duplicate: true, conflict: true, event: existing[0] };
    if (existing[0].status === "failed") {
      const retried = await db
        .update(webhookEvents)
        .set({ status: "received", payload, processedAt: null })
        .where(
          and(
            eq(webhookEvents.id, existing[0].id),
            eq(webhookEvents.status, "failed")
          )
        )
        .returning();
      if (retried[0])
        return { duplicate: false, conflict: false, event: retried[0] };
    }
    return { duplicate: true, conflict: false, event: existing[0] };
  }
  throw new Error("Webhook event could not be registered");
}

export async function markWebhookEvent(
  workspaceId: number,
  eventId: string,
  status: "processed" | "failed"
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(webhookEvents)
    .set({ status, processedAt: new Date() })
    .where(
      and(
        eq(webhookEvents.workspaceId, workspaceId),
        eq(webhookEvents.eventId, eventId),
        eq(webhookEvents.status, "received")
      )
    );
}

export async function getCorePipelineSnapshot(workspaceId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [webhookRows, domainRows, messageRows, domainFailures, messageFailures] =
    await Promise.all([
      db
        .select({
          status: webhookEvents.status,
          count: sql<number>`count(*)`,
        })
        .from(webhookEvents)
        .where(eq(webhookEvents.workspaceId, workspaceId))
        .groupBy(webhookEvents.status),
      db
        .select({
          status: domainEvents.status,
          count: sql<number>`count(*)`,
        })
        .from(domainEvents)
        .where(eq(domainEvents.workspaceId, workspaceId))
        .groupBy(domainEvents.status),
      db
        .select({
          status: messages.status,
          direction: messages.direction,
          count: sql<number>`count(*)`,
        })
        .from(messages)
        .innerJoin(conversations, eq(conversations.id, messages.conversationId))
        .innerJoin(contacts, eq(contacts.id, conversations.contactId))
        .where(eq(contacts.workspaceId, workspaceId))
        .groupBy(messages.status, messages.direction),
      db
        .select({
          eventId: domainEvents.eventKey,
          status: domainEvents.status,
          lastError: domainEvents.lastError,
          attemptCount: domainEvents.attemptCount,
          updatedAt: domainEvents.updatedAt,
        })
        .from(domainEvents)
        .where(
          and(
            eq(domainEvents.workspaceId, workspaceId),
            sql`${domainEvents.lastError} is not null`
          )
        )
        .orderBy(desc(domainEvents.updatedAt), desc(domainEvents.id))
        .limit(10),
      db
        .select({
          id: messages.id,
          direction: messages.direction,
          status: messages.status,
          lastError: messages.lastError,
          attemptCount: messages.attemptCount,
          updatedAt: messages.createdAt,
        })
        .from(messages)
        .innerJoin(conversations, eq(conversations.id, messages.conversationId))
        .innerJoin(contacts, eq(contacts.id, conversations.contactId))
        .where(
          and(
            eq(contacts.workspaceId, workspaceId),
            sql`${messages.lastError} is not null`
          )
        )
        .orderBy(desc(messages.createdAt), desc(messages.id))
        .limit(10),
    ]);
  return {
    workspaceId,
    webhookEvents: webhookRows.map(row => ({ ...row, count: Number(row.count) })),
    domainEvents: domainRows.map(row => ({ ...row, count: Number(row.count) })),
    messages: messageRows.map(row => ({ ...row, count: Number(row.count) })),
    failures: [
      ...domainFailures.map(row => ({ ...row, kind: "domain_event" as const })),
      ...messageFailures.map(row => ({ ...row, kind: "message" as const })),
    ]
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, 10)
      .map(row => ({ ...row, updatedAt: row.updatedAt.toISOString() })),
  };
}

export async function ingestInboundWhatsApp(
  workspaceId: number,
  input: {
    eventId: string;
    phone: string;
    name?: string;
    content: string;
    messageType?:
      | "text"
      | "image"
      | "audio"
      | "video"
      | "document"
      | "sticker"
      | "location"
      | "contact"
      | "poll"
      | "list"
      | "button"
      | "react";
    metadata?: Record<string, unknown>;
    fromMe?: boolean;
    receivedAt?: Date;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const workspace = await getActiveWorkspaceById(workspaceId);
  if (!workspace) throw new Error("Workspace unavailable");
  const sourceMetadata = input.metadata ?? {};
  const isBaileys = sourceMetadata.provider === "baileys";
  const isHistorical = isBaileys && sourceMetadata.historySync === true;
  const instanceId =
    typeof sourceMetadata.instanceId === "string"
      ? sourceMetadata.instanceId.trim()
      : "";
  const normalizedJid = normalizeWhatsappJid(
    typeof sourceMetadata.jid === "string" ? sourceMetadata.jid : undefined
  );
  const isGroup = sourceMetadata.isGroup === true;
  const groupJid = normalizeWhatsappJid(
    typeof sourceMetadata.groupJid === "string"
      ? sourceMetadata.groupJid
      : normalizedJid
  );
  if (isBaileys) {
    if (!instanceId)
      throw new Error("Baileys message requires a registered instance");
    const ownedInstance = await db
      .select({ id: whatsappInstances.id })
      .from(whatsappInstances)
      .where(
        and(
          eq(whatsappInstances.workspaceId, workspace.id),
          eq(whatsappInstances.instanceId, instanceId),
          eq(whatsappInstances.provider, "baileys"),
          eq(whatsappInstances.active, 1)
        )
      )
      .limit(1);
    if (!ownedInstance[0])
      throw new Error("Baileys instance is not active or owned by this workspace");
  }
  if (
    isGroup &&
    (!isBaileys || !groupJid?.endsWith("@g.us") || !instanceId)
  )
    throw new Error("Baileys group requires an owned instance and exact group JID");
  const upsertType =
    sourceMetadata.upsertType === "notify" || sourceMetadata.upsertType === "append"
      ? sourceMetadata.upsertType
      : undefined;
  if (
    isBaileys &&
    !isHistorical &&
    ((upsertType !== undefined && upsertType !== "notify") ||
      (typeof sourceMetadata.requestId === "string" &&
        sourceMetadata.requestId.length > 0))
  )
    return { ignored: true, reason: "non_live_baileys_event" };
  const messageType = input.messageType ?? "text";
  if (
    isBaileys &&
    (!input.content.trim() ||
      (messageType === "text" &&
        (sourceMetadata.isPlaceholder === true ||
          input.content.trim() === "[mensagem recebida]")))
  )
    return { ignored: true, reason: "empty_or_unrecognized_baileys_payload" };
  const phone = normalizeContactPhone(
    typeof sourceMetadata.jid === "string" ? sourceMetadata.jid : input.phone
  );
  if (!phone) throw new Error("Phone is invalid after normalization");
  const metadata = await persistInboundMedia(workspace.id, input.eventId, {
    ...sourceMetadata,
    ...(normalizedJid ? { jid: normalizedJid } : {}),
  });
  const priorMessage = await db
    .select({
      messageId: messages.id,
      contactId: conversations.contactId,
      conversationId: conversations.id,
    })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .innerJoin(contacts, eq(contacts.id, conversations.contactId))
    .where(
      and(
        eq(messages.externalId, input.eventId),
        eq(contacts.workspaceId, workspace.id)
      )
    )
    .limit(1);
  if (priorMessage[0]) return { ...priorMessage[0], duplicate: true };
  const receivedAt = input.receivedAt ?? new Date();
  const fromMe = input.fromMe === true || metadata?.fromMe === true;
  let groupId: number | undefined;
  let groupSubject: string | undefined;
  if (isGroup) {
    const subject =
      (typeof input.metadata?.groupSubject === "string"
        ? input.metadata.groupSubject
        : input.name
      )
        ?.trim()
        .slice(0, 160) || `Grupo ${groupJid!.split("@")[0]}`;
    groupSubject = subject;
    const groupRows = await db
      .insert(whatsappGroups)
      .values({
        workspaceId: workspace.id,
        instanceId,
        jid: groupJid!,
        subject,
        updatedAt: receivedAt,
      })
      .onConflictDoUpdate({
        target: [
          whatsappGroups.workspaceId,
          whatsappGroups.instanceId,
          whatsappGroups.jid,
        ],
        set: { subject, updatedAt: receivedAt },
      })
      .returning({ id: whatsappGroups.id });
    groupId = groupRows[0]?.id;
    if (!groupId) throw new Error("WhatsApp group could not be created");
    const authorJid =
      typeof input.metadata?.authorJid === "string"
        ? input.metadata.authorJid
        : undefined;
    if (authorJid) {
      await db
        .insert(whatsappGroupParticipants)
        .values({
          groupId,
          jid: authorJid,
          jidAlt:
            typeof input.metadata?.authorJidAlt === "string"
              ? input.metadata.authorJidAlt
              : null,
          name:
            typeof input.metadata?.authorName === "string"
              ? input.metadata.authorName.slice(0, 160)
              : null,
          updatedAt: receivedAt,
        })
        .onConflictDoUpdate({
          target: [
            whatsappGroupParticipants.groupId,
            whatsappGroupParticipants.jid,
          ],
          set: {
            jidAlt:
              typeof input.metadata?.authorJidAlt === "string"
                ? input.metadata.authorJidAlt
                : null,
            name:
              typeof input.metadata?.authorName === "string"
                ? input.metadata.authorName.slice(0, 160)
                : null,
            updatedAt: receivedAt,
          },
        });
    }
  }
  const contactPredicate = groupId
    ? and(eq(contacts.groupId, groupId), eq(contacts.workspaceId, workspace.id))
    : and(
        eq(contacts.externalPhone, phone),
        eq(contacts.workspaceId, workspace.id),
        isNull(contacts.groupId)
      );
  let contact = (
    await db
      .select()
      .from(contacts)
      .where(contactPredicate)
      .limit(1)
  )[0];
  if (!contact) {
    await db
      .insert(contacts)
      .values({
        workspaceId: workspace.id,
        groupId: groupId ?? null,
        externalPhone: groupId ? `group:${groupId}` : phone,
        name: groupSubject ?? (input.name?.trim() || phone),
        pushName: groupId ? null : input.name?.trim().slice(0, 160) || null,
        nameSource: "auto",
        urgency: "Média",
        stage: "Novo contato",
        aiEnabled: (fromMe && !isHistorical) || groupId ? 0 : 1,
        quoteCents: 0,
        unreadCount: isHistorical || fromMe ? 0 : 1,
        lastMessagePreview: input.content.slice(0, 500),
        lastMessageAt: receivedAt,
      })
      .onConflictDoNothing();
    contact = (
      await db
        .select()
        .from(contacts)
        .where(contactPredicate)
        .limit(1)
    )[0];
    if (contact && !groupId) {
      await enqueueDomainEvent({
        workspaceId: workspace.id,
        event: "contact.created",
        aggregateType: "contact",
        aggregateId: contact.id,
        eventKey: `contact.created:${contact.id}`,
        payload: {
          contactId: contact.id,
          phone: contact.externalPhone,
          name: contact.name,
          stage: contact.stage,
        },
      });
    }
  } else if (!isHistorical) {
    await db
      .update(contacts)
      .set({
        name: sql`CASE WHEN ${contacts.nameSource} = 'manual' THEN ${contacts.name} ELSE ${groupSubject ?? (input.name?.trim() || contact.name)} END`,
        ...(!groupId && input.name?.trim()
          ? { pushName: input.name.trim().slice(0, 160) }
          : {}),
        ...((fromMe && !isHistorical) || groupId ? { aiEnabled: 0 } : {}),
        unreadCount: isHistorical || fromMe ? 0 : sql`${contacts.unreadCount} + 1`,
        lastMessagePreview: input.content.slice(0, 500),
        lastMessageAt: receivedAt,
        updatedAt: receivedAt,
      })
      .where(eq(contacts.id, contact.id));
  }
  if (!contact) throw new Error("Contact could not be created");
  let conversation = (
    await db
      .select()
      .from(conversations)
      .where(eq(conversations.contactId, contact.id))
      .limit(1)
  )[0];
  if (!conversation) {
    await db
      .insert(conversations)
      .values({
        contactId: contact.id,
        humanControlled: (fromMe && !isHistorical) || groupId ? 1 : 0,
        unreadCount: isHistorical || fromMe ? 0 : 1,
        lastMessageAt: receivedAt,
      })
      .onConflictDoNothing({ target: conversations.contactId });
    conversation = (
      await db
        .select()
        .from(conversations)
        .where(eq(conversations.contactId, contact.id))
        .limit(1)
    )[0];
  }
  if (!conversation) throw new Error("Conversation could not be created");
  const created = await db
    .insert(messages)
    .values({
      conversationId: conversation.id,
      externalId: input.eventId,
      direction: fromMe ? "outbound" : "inbound",
      senderType: fromMe ? "human" : "lead",
      messageType: input.messageType ?? "text",
      content: input.content,
      provider:
        metadata?.provider === "baileys"
          ? "baileys"
          : metadata?.provider === "meta_cloud_api"
            ? "meta_cloud_api"
            : await getDefaultWhatsappProvider(workspace.id),
      metadata,
      status: "received",
      createdAt: receivedAt,
    })
    .returning();
  if (created[0] && !fromMe && !groupId && !isHistorical) {
    await enqueueDomainEvent({
      workspaceId: workspace.id,
      event: "message.received",
      aggregateType: "message",
      aggregateId: created[0].id,
      eventKey: `message.received:${input.eventId}`,
      payload: {
        messageId: created[0].id,
        contactId: contact.id,
        conversationId: conversation.id,
        phone: contact.externalPhone,
        content: input.content,
        messageType: input.messageType ?? "text",
        metadata,
        receivedAt,
        ...(typeof metadata?.instanceId === "string"
          ? { instanceId: metadata.instanceId }
          : {}),
      },
    });
  }
  if (!isHistorical) {
    await db
      .update(conversations)
      .set({
        ...((fromMe || groupId) ? { humanControlled: 1 } : {}),
        unreadCount: fromMe ? 0 : sql`${conversations.unreadCount} + 1`,
        lastMessageAt: receivedAt,
        updatedAt: receivedAt,
      })
      .where(eq(conversations.id, conversation.id));
  }
  return {
    contactId: contact.id,
    conversationId: conversation.id,
    messageId: created[0]?.id,
    duplicate: false,
  };
}

export async function upsertApiContact(
  workspaceId: number,
  input: {
    phone: string;
    name?: string;
    city?: string;
    neighborhood?: string;
    serviceRequested?: string;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const workspace = await getActiveWorkspaceById(workspaceId);
  if (!workspace) throw new Error("Workspace unavailable");
  const phone = normalizeContactPhone(input.phone);
  if (!phone) throw new Error("Phone is invalid after normalization");
  const existing = (
    await db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.externalPhone, phone),
          eq(contacts.workspaceId, workspace.id)
        )
      )
      .limit(1)
  )[0];
  if (existing) {
    await db
      .update(contacts)
      .set({
        name: sql`CASE WHEN ${contacts.nameSource} = 'manual' THEN ${contacts.name} ELSE ${input.name?.trim() || existing.name} END`,
        ...(!existing.pushName && input.name?.trim()
          ? { pushName: input.name.trim().slice(0, 160) }
          : {}),
        city: input.city ?? existing.city,
        neighborhood: input.neighborhood ?? existing.neighborhood,
        serviceRequested: input.serviceRequested ?? existing.serviceRequested,
        updatedAt: new Date(),
      })
      .where(eq(contacts.id, existing.id));
    return (
      await db
        .select()
        .from(contacts)
        .where(eq(contacts.id, existing.id))
        .limit(1)
    )[0];
  }
  await db
    .insert(contacts)
    .values({
      workspaceId: workspace.id,
      externalPhone: phone,
      name: input.name?.trim() || phone,
      city: input.city,
      neighborhood: input.neighborhood,
      serviceRequested: input.serviceRequested,
      urgency: "Média",
      stage: "Novo contato",
      aiEnabled: 1,
      quoteCents: 0,
      unreadCount: 0,
    })
    .onConflictDoNothing();
  const created = (
    await db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.externalPhone, phone),
          eq(contacts.workspaceId, workspace.id)
        )
      )
      .limit(1)
  )[0];
  if (created) {
    await enqueueDomainEvent({
      workspaceId: workspace.id,
      event: "contact.created",
      aggregateType: "contact",
      aggregateId: created.id,
      eventKey: `contact.created:${created.id}`,
      payload: {
        contactId: created.id,
        phone: created.externalPhone,
        name: created.name,
        stage: created.stage,
      },
    });
  }
  return created;
}

export async function findQueuedBatchMessage(
  workspaceId: number,
  contactId: number,
  batchId: string,
  batchIndex: number
) {
  const db = await getDb();
  if (!db) return undefined;
  const conversation = await getConversationByContact(workspaceId, contactId);
  if (!conversation) return undefined;
  const found = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversation.id),
        sql`${messages.metadata}->>'batchId' = ${batchId}`,
        sql`${messages.metadata}->>'batchIndex' = ${String(batchIndex)}`
      )
    )
    .orderBy(desc(messages.id))
    .limit(1);
  return found[0];
}

export async function queueOutboundMessage(
  workspaceId: number,
  contactId: number,
  content: string,
  provider?: WhatsappProvider,
  senderType: "ai" | "human" = "human",
  messageType:
    | "text"
    | "image"
    | "audio"
    | "video"
    | "document"
    | "button"
    | "sticker"
    | "location"
    | "contact"
    | "poll"
    | "list"
    | "react"
    | "album"
    | "event" = "text",
  metadata?: Record<string, unknown>
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const selectedProvider =
    provider ?? (await getDefaultWhatsappProvider(workspaceId));
  const defaultPapiWebhook =
    selectedProvider === "papi"
      ? await getDefaultPapiWebhook(workspaceId)
      : undefined;
  const contact = await getContactById(workspaceId, contactId);
  if (!contact) throw new Error("Contact not found");
  if (
    selectedProvider === "papi" &&
    !metadata?.instanceId &&
    !defaultPapiWebhook?.instanceId
  )
    throw new Error(
      "PAPI instanceId não informado; associe uma instância em Canais conectados"
    );
  const channels = await listWhatsappChannels(workspaceId);
  if (
    channels.length > 0 &&
    !channels.some(channel => channel.provider === selectedProvider)
  )
    throw new Error("Provedor de WhatsApp não está ativo neste workspace");
  let conversation = await getConversationByContact(workspaceId, contactId);
  if (!conversation) {
    await db
      .insert(conversations)
      .values({ contactId, unreadCount: 0, lastMessageAt: new Date() })
      .onConflictDoNothing({ target: conversations.contactId });
    conversation = await getConversationByContact(workspaceId, contactId);
  }
  if (!conversation) throw new Error("Conversation not found");
  const createdAt = new Date();
  const latestInbound = await db
    .select({ metadata: messages.metadata })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversation.id),
        eq(messages.direction, "inbound")
      )
    )
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(1);
  const inboundJid =
    typeof latestInbound[0]?.metadata?.jid === "string"
      ? latestInbound[0].metadata.jid
      : undefined;
  const resolvedMetadata = {
    ...metadata,
    ...(!metadata?.jid && inboundJid ? { jid: inboundJid } : {}),
    ...(selectedProvider === "papi" &&
    !metadata?.instanceId &&
    defaultPapiWebhook?.instanceId
      ? { instanceId: defaultPapiWebhook.instanceId }
      : {}),
  };
  const created = await db
    .insert(messages)
    .values({
      conversationId: conversation.id,
      direction: "outbound",
      senderType,
      messageType,
      content,
      metadata: Object.keys(resolvedMetadata).length
        ? resolvedMetadata
        : undefined,
      status: "queued",
      provider: selectedProvider,
      createdAt,
    })
    .returning();
  await db
    .update(contacts)
    .set({
      ...(senderType === "human" ? { aiEnabled: 0, unreadCount: 0 } : {}),
      lastMessagePreview: content.slice(0, 500),
      lastMessageAt: createdAt,
      updatedAt: createdAt,
    })
    .where(eq(contacts.id, contactId));
  await db
    .update(conversations)
    .set({
      ...(senderType === "human" ? { humanControlled: 1, unreadCount: 0 } : {}),
      lastMessageAt: createdAt,
      updatedAt: createdAt,
    })
    .where(eq(conversations.id, conversation.id));
  await db.insert(auditLogs).values({
    workspaceId,
    contactId,
    action: "api_message_queued",
    summary: `${senderType === "ai" ? "Mensagem da IA" : "Mensagem humana"} enfileirada para o worker de WhatsApp`,
  });
  return created[0];
}

export async function recoverProcessingMessages() {
  const db = await getDb();
  if (!db) return 0;
  const recovered = await db
    .update(messages)
    .set({ status: "queued" })
    .where(eq(messages.status, "processing"))
    .returning({ id: messages.id });
  return recovered.length;
}

export async function processQueuedMessagesOnce(limit = 10, maxAttempts = 3) {
  const db = await getDb();
  if (!db) return { processed: 0, sent: 0, failed: 0, throttled: 0 };
  const pending = await db
    .select({
      message: messages,
      phone: contacts.externalPhone,
      contactId: contacts.id,
      workspaceId: contacts.workspaceId,
    })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .innerJoin(contacts, eq(contacts.id, conversations.contactId))
    .where(eq(messages.status, "queued"))
    .orderBy(asc(messages.createdAt), asc(messages.id))
    .limit(limit);

  let sent = 0;
  let failed = 0;
  let throttled = 0;
  for (const item of pending) {
    if (item.workspaceId) {
      const usage = await consumeWorkspaceUsage(
        item.workspaceId,
        "outboundMessages"
      );
      if (!usage.allowed) {
        throttled += 1;
        continue;
      }
    }
    const claimed = await db
      .update(messages)
      .set({
        status: "processing",
        attemptCount: sql`${messages.attemptCount} + 1`,
      })
      .where(
        and(eq(messages.id, item.message.id), eq(messages.status, "queued"))
      )
      .returning({ id: messages.id });
    if (claimed.length === 0) continue;
    try {
      const adapter = getWhatsappAdapter(item.message.provider);
      const instanceId =
        typeof item.message.metadata?.instanceId === "string"
          ? item.message.metadata.instanceId
          : undefined;
      const result = await adapter.sendMessage({
        idempotencyKey: `forte-message-${item.message.id}`,
        phone: item.phone,
        content: item.message.content,
        messageType: item.message.messageType,
        metadata: item.message.metadata ?? undefined,
        instanceId,
        apiKey:
          item.message.provider === "papi" && instanceId && item.workspaceId
            ? (await getPapiInstanceSecret(item.workspaceId, instanceId)) ||
              undefined
            : undefined,
        provider: item.message.provider,
      });
      await db
        .update(messages)
        .set({
          status: "sent",
          externalId: result.externalId,
          sentAt: new Date(),
          lastError: null,
        })
        .where(eq(messages.id, item.message.id));
      await db.insert(auditLogs).values({
        workspaceId: item.workspaceId!,
        contactId: item.contactId,
        action: "message_sent",
        summary: `Mensagem enviada pelo provedor ${item.message.provider}`,
      });
      sent += 1;
      if (item.workspaceId) {
        try {
          await enqueueDomainEvent({
            workspaceId: item.workspaceId,
            event: "message.sent",
            aggregateType: "message",
            aggregateId: item.message.id,
            eventKey: `message.sent:${item.message.id}`,
            payload: {
              messageId: item.message.id,
              contactId: item.contactId,
              provider: item.message.provider,
              externalId: result.externalId,
              sentAt: new Date(),
            },
          });
        } catch (eventError) {
          console.error(
            "[forte-worker] falha ao enfileirar message.sent",
            eventError
          );
        }
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha desconhecida no envio";
      const nextStatus =
        item.message.attemptCount + 1 >= maxAttempts ? "failed" : "queued";
      await db
        .update(messages)
        .set({ status: nextStatus, lastError: message })
        .where(eq(messages.id, item.message.id));
      failed += 1;
    }
  }
  return { processed: sent + failed, sent, failed, throttled };
}

export async function cancelAgendaAppointment(
  workspaceId: number,
  appointmentId: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const workspace = (
    await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(and(eq(workspaces.id, workspaceId), eq(workspaces.active, 1)))
      .limit(1)
  )[0];
  if (!workspace) return undefined;
  const appointment = (
    await db
      .select()
      .from(appointmentsTable)
      .where(
        and(
          eq(appointmentsTable.id, appointmentId),
          eq(appointmentsTable.workspaceId, workspaceId)
        )
      )
      .limit(1)
  )[0];
  if (!appointment) return undefined;
  const updatedAt = new Date();
  await db
    .update(appointmentsTable)
    .set({ status: "cancelled", updatedAt })
    .where(
      and(
        eq(appointmentsTable.id, appointmentId),
        eq(appointmentsTable.workspaceId, workspaceId)
      )
    );
  await enqueueDomainEvent({
    workspaceId,
    event: "appointment.cancelled",
    aggregateType: "appointment",
    aggregateId: appointmentId,
    eventKey: `appointment.cancelled:${appointmentId}:${updatedAt.toISOString()}`,
    payload: {
      appointmentId,
      contactId: appointment.contactId,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
      cancelledAt: updatedAt,
    },
  });
  return { ...appointment, status: "cancelled" as const };
}

export async function updateAgendaStatus(
  workspaceId: number,
  appointmentId: number,
  status: "confirmed" | "completed" | "no_show"
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const workspace = (
    await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(and(eq(workspaces.id, workspaceId), eq(workspaces.active, 1)))
      .limit(1)
  )[0];
  if (!workspace) return undefined;
  const appointment = (
    await db
      .select()
      .from(appointmentsTable)
      .where(
        and(
          eq(appointmentsTable.id, appointmentId),
          eq(appointmentsTable.workspaceId, workspaceId)
        )
      )
      .limit(1)
  )[0];
  if (!appointment) return undefined;
  const updated = await db
    .update(appointmentsTable)
    .set({ status, updatedAt: new Date() })
    .where(
      and(
        eq(appointmentsTable.id, appointmentId),
        eq(appointmentsTable.workspaceId, workspaceId)
      )
    )
    .returning();
  if (appointment.contactId)
    await db.insert(auditLogs).values({
      workspaceId,
      contactId: appointment.contactId,
      action: `appointment_${status}`,
      summary: `Agendamento ${appointmentId} atualizado para ${status}`,
    });
  return updated[0];
}

export async function rescheduleAgendaAppointment(
  workspaceId: number,
  appointmentId: number,
  startsAt: Date,
  endsAt: Date
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const workspace = (
    await db
      .select({ timezone: workspaces.timezone, active: workspaces.active })
      .from(workspaces)
      .where(and(eq(workspaces.id, workspaceId), eq(workspaces.active, 1)))
      .limit(1)
  )[0];
  if (!workspace) throw new Error("Workspace unavailable");
  if (endsAt <= startsAt)
    throw new ScheduleError(
      "invalid_period",
      "O horário final precisa ser maior que o inicial"
    );
  return db.transaction(async tx => {
    const appointment = (
      await tx
        .select()
        .from(appointmentsTable)
        .where(
          and(
            eq(appointmentsTable.id, appointmentId),
            eq(appointmentsTable.workspaceId, workspaceId)
          )
        )
        .limit(1)
    )[0];
    if (!appointment) return undefined;
    await tx.execute(
      sql`SELECT "id" FROM "professionals" WHERE "id" = ${appointment.professionalId} AND "workspaceId" = ${workspaceId} FOR UPDATE`
    );
    const windows = await tx
      .select({
        weekday: availability.weekday,
        startMinute: availability.startMinute,
        endMinute: availability.endMinute,
      })
      .from(availability)
      .where(
        and(
          eq(availability.workspaceId, workspaceId),
          eq(availability.professionalId, appointment.professionalId),
          eq(availability.active, 1)
        )
      );
    assertWithinWorkingHours(startsAt, endsAt, workspace.timezone, windows);

    const conflict = await tx
      .select({ id: appointmentsTable.id })
      .from(appointmentsTable)
      .where(
        and(
          eq(appointmentsTable.workspaceId, workspaceId),
          eq(appointmentsTable.professionalId, appointment.professionalId),
          ne(appointmentsTable.id, appointmentId),
          ne(appointmentsTable.status, "cancelled"),
          lt(appointmentsTable.startsAt, endsAt),
          gt(appointmentsTable.endsAt, startsAt)
        )
      )
      .limit(1);
    if (conflict.length > 0)
      throw new ScheduleError(
        "appointment_conflict",
        "Horário indisponível: existe outro atendimento deste profissional neste intervalo"
      );
    const updated = await tx
      .update(appointmentsTable)
      .set({ startsAt, endsAt, status: "requested", updatedAt: new Date() })
      .where(
        and(
          eq(appointmentsTable.id, appointmentId),
          eq(appointmentsTable.workspaceId, workspaceId)
        )
      )
      .returning();
    return updated[0];
  });
}

export async function leadMemoryOperation(
  workspaceId: number,
  input: {
    action: "buscar_lead" | "criar_lead" | "atualizar_lead" | "registrar_nota";
    phone: string;
    name?: string;
    city?: string;
    neighborhood?: string;
    serviceRequested?: string;
    fields?: {
      name?: string;
      city?: string;
      neighborhood?: string;
      serviceRequested?: string;
      urgency?: "Baixa" | "Média" | "Alta" | "Crítica";
      stage?: string;
      quoteCents?: number;
      aiEnabled?: boolean;
    };
    note?: string;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const workspace = await getActiveWorkspaceById(workspaceId);
  if (!workspace) throw new Error("Workspace unavailable");
  const phone = input.phone.replace(/[^0-9]/g, "");
  let contact = (
    await db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.externalPhone, phone),
          eq(contacts.workspaceId, workspace.id)
        )
      )
      .limit(1)
  )[0];

  if (input.action === "buscar_lead") {
    if (!contact) return { exists: false, lead: null, notes: [] };
    const notes = await db
      .select()
      .from(contactNotes)
      .where(eq(contactNotes.contactId, contact.id))
      .orderBy(desc(contactNotes.createdAt), desc(contactNotes.id))
      .limit(20);
    const audit = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.workspaceId, workspaceId),
          eq(auditLogs.contactId, contact.id)
        )
      )
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(20);
    return { exists: true, lead: contact, notes, audit };
  }

  if (input.action === "atualizar_lead" && !contact)
    return { exists: false, updated: false, lead: null };

  if (input.action === "criar_lead" || input.action === "atualizar_lead") {
    const fields = input.fields ?? {};
    contact = await upsertApiContact(workspaceId, {
      phone,
      name: fields.name ?? input.name,
      city: fields.city ?? input.city,
      neighborhood: fields.neighborhood ?? input.neighborhood,
      serviceRequested: fields.serviceRequested ?? input.serviceRequested,
    });
    if (!contact) throw new Error("Contact could not be created");
    if (
      fields.urgency ||
      fields.stage ||
      fields.quoteCents !== undefined ||
      fields.aiEnabled !== undefined
    ) {
      await db
        .update(contacts)
        .set({
          urgency: fields.urgency,
          stage: fields.stage,
          quoteCents: fields.quoteCents,
          aiEnabled:
            fields.aiEnabled === undefined
              ? undefined
              : fields.aiEnabled
                ? 1
                : 0,
          updatedAt: new Date(),
        })
        .where(eq(contacts.id, contact.id));
      contact = (
        await db
          .select()
          .from(contacts)
          .where(eq(contacts.id, contact.id))
          .limit(1)
      )[0];
    }
    return {
      exists: true,
      updated: input.action === "atualizar_lead",
      lead: contact,
    };
  }

  if (!contact) return { exists: false, noteCreated: false, lead: null };
  const note = input.note?.trim();
  if (!note) throw new Error("Note is required");
  await db.insert(contactNotes).values({
    workspaceId: workspace.id,
    contactId: contact.id,
    content: note,
    authorType: "ai",
  });
  await db.insert(auditLogs).values({
    workspaceId,
    contactId: contact.id,
    action: "lead_note_created",
    summary: note.slice(0, 500),
  });
  const created = await db
    .select()
    .from(contactNotes)
    .where(
      and(
        eq(contactNotes.contactId, contact.id),
        eq(contactNotes.content, note)
      )
    )
    .orderBy(desc(contactNotes.id))
    .limit(1);
  return { exists: true, noteCreated: true, lead: contact, note: created[0] };
}

export async function recoverProcessingDomainEvents() {
  const db = await getDb();
  if (!db) return 0;
  const recovered = await db
    .update(domainEvents)
    .set({
      status: "pending",
      workerId: null,
      claimedAt: null,
      leaseUntil: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(domainEvents.status, "processing"),
        or(
          isNull(domainEvents.leaseUntil),
          lt(domainEvents.leaseUntil, new Date())
        )
      )
    )
    .returning({ id: domainEvents.id });
  return recovered.length;
}

export async function processDomainEventsOnce(limit = 10, maxAttempts = 5) {
  const db = await getDb();
  if (!db) return { processed: 0, delivered: 0, failed: 0, skipped: true };
  const now = new Date();
  const pending = await db
    .select()
    .from(domainEvents)
    .where(
      or(
        and(
          eq(domainEvents.status, "pending"),
          lte(domainEvents.availableAt, now)
        ),
        and(
          eq(domainEvents.status, "processing"),
          or(isNull(domainEvents.leaseUntil), lt(domainEvents.leaseUntil, now))
        )
      )
    )
    .orderBy(asc(domainEvents.availableAt), asc(domainEvents.id))
    .limit(limit);

  let delivered = 0;
  let failed = 0;
  const debounceMsRaw = Number(process.env.AGENT_DEBOUNCE_MS ?? 1500);
  const debounceMs =
    Number.isFinite(debounceMsRaw) && debounceMsRaw >= 0
      ? Math.min(debounceMsRaw, 30_000)
      : 1500;
  for (const item of pending) {
    const leaseUntil = new Date(Date.now() + DOMAIN_EVENT_LEASE_MS);
    const claimed = await db
      .update(domainEvents)
      .set({
        status: "processing",
        workerId: DOMAIN_EVENT_WORKER_ID,
        claimedAt: now,
        leaseUntil,
        attemptCount: sql`${domainEvents.attemptCount} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(domainEvents.id, item.id),
          or(
            and(
              eq(domainEvents.status, "pending"),
              lte(domainEvents.availableAt, now)
            ),
            and(
              eq(domainEvents.status, "processing"),
              or(
                isNull(domainEvents.leaseUntil),
                lt(domainEvents.leaseUntil, now)
              )
            )
          )
        )
      )
      .returning({ id: domainEvents.id });
    if (claimed.length === 0) continue;

    try {
      const eventPayload = JSON.parse(item.payload) as Record<string, unknown>;
      if (item.eventType === "message.received") {
        const contactId = Number(eventPayload.contactId ?? 0);
        const conversationId = Number(eventPayload.conversationId ?? 0);
        const latestMessage =
          conversationId > 0
            ? (
                await db
                  .select({
                    id: messages.id,
                    createdAt: messages.createdAt,
                    content: messages.content,
                    messageType: messages.messageType,
                  })
                  .from(messages)
                  .where(
                    and(
                      eq(messages.conversationId, conversationId),
                      eq(messages.direction, "inbound")
                    )
                  )
                  .orderBy(desc(messages.createdAt), desc(messages.id))
                  .limit(1)
              )[0]
            : undefined;
        if (
          latestMessage &&
          latestMessage.id > Number(eventPayload.messageId ?? 0)
        ) {
          await db
            .update(domainEvents)
            .set({
              status: "delivered",
              workerId: null,
              claimedAt: null,
              leaseUntil: null,
              deliveredAt: new Date(),
              lastError: "debounced_by_newer_message",
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(domainEvents.id, item.id),
                eq(domainEvents.workerId, DOMAIN_EVENT_WORKER_ID)
              )
            );
          delivered += 1;
          continue;
        }
        if (latestMessage && debounceMs > 0) {
          const quietUntil = latestMessage.createdAt.getTime() + debounceMs;
          if (quietUntil > Date.now()) {
            await db
              .update(domainEvents)
              .set({
                status: "pending",
                workerId: null,
                claimedAt: null,
                leaseUntil: null,
                availableAt: new Date(quietUntil),
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(domainEvents.id, item.id),
                  eq(domainEvents.workerId, DOMAIN_EVENT_WORKER_ID)
                )
              );
            continue;
          }
        }
        const control =
          contactId > 0
            ? (
                await db
                  .select({
                    aiEnabled: contacts.aiEnabled,
                    humanControlled: conversations.humanControlled,
                  })
                  .from(contacts)
                  .leftJoin(
                    conversations,
                    eq(conversations.contactId, contacts.id)
                  )
                  .where(
                    and(
                      eq(contacts.id, contactId),
                      eq(contacts.workspaceId, item.workspaceId)
                    )
                  )
                  .limit(1)
              )[0]
            : undefined;
        if (
          control &&
          (control.aiEnabled !== 1 || control.humanControlled === 1)
        ) {
          await db
            .update(domainEvents)
            .set({
              status: "delivered",
              workerId: null,
              claimedAt: null,
              leaseUntil: null,
              deliveredAt: new Date(),
              lastError: "skipped_human_control",
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(domainEvents.id, item.id),
                eq(domainEvents.workerId, DOMAIN_EVENT_WORKER_ID)
              )
            );
          delivered += 1;
          continue;
        }
        if (conversationId > 0 && latestMessage) {
          const windowStart = new Date(
            latestMessage.createdAt.getTime() - Math.max(debounceMs, 1)
          );
          const grouped = await db
            .select({
              content: messages.content,
              messageType: messages.messageType,
              createdAt: messages.createdAt,
            })
            .from(messages)
            .where(
              and(
                eq(messages.conversationId, conversationId),
                eq(messages.direction, "inbound"),
                gte(messages.createdAt, windowStart)
              )
            )
            .orderBy(asc(messages.createdAt), asc(messages.id));
          eventPayload.messages = grouped.map(message => ({
            content: message.content,
            messageType: message.messageType,
            receivedAt: message.createdAt,
          }));
          eventPayload.content = grouped
            .map(message => message.content)
            .join("\n");
          eventPayload.debounceMs = debounceMs;
        }
      }
      if (item.eventType === "message.received") {
        const aiUsage = await consumeWorkspaceUsage(
          item.workspaceId,
          "aiRequests"
        );
        if (!aiUsage.allowed) {
          await db
            .update(domainEvents)
            .set({
              status: "pending",
              workerId: null,
              claimedAt: null,
              leaseUntil: null,
              availableAt: new Date(Date.now() + aiUsage.retryAfterMs),
              lastError: "workspace_ai_rate_limited",
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(domainEvents.id, item.id),
                eq(domainEvents.workerId, DOMAIN_EVENT_WORKER_ID)
              )
            );
          continue;
        }
        const config = await getNativeAgentRuntimeConfig(item.workspaceId);
        if (!config.enabled) {
          await db
            .update(domainEvents)
            .set({
              status: "delivered",
              workerId: null,
              claimedAt: null,
              leaseUntil: null,
              deliveredAt: new Date(),
              lastError: "native_agent_disabled",
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(domainEvents.id, item.id),
                eq(domainEvents.workerId, DOMAIN_EVENT_WORKER_ID)
              )
            );
          delivered += 1;
          continue;
        }
        const { runNativeAgent } = await import("./native-agent");
        await runNativeAgent(
          {
            eventId: item.eventKey,
            workspaceId: item.workspaceId,
            contactId: Number(eventPayload.contactId ?? 0),
            conversationId: Number(eventPayload.conversationId ?? 0),
            instanceId:
              typeof eventPayload.instanceId === "string"
                ? eventPayload.instanceId
                : undefined,
            content: String(eventPayload.content ?? ""),
            messageType: String(eventPayload.messageType ?? "text"),
            metadata:
              eventPayload.metadata && typeof eventPayload.metadata === "object"
                ? (eventPayload.metadata as Record<string, unknown>)
                : undefined,
            messages: Array.isArray(eventPayload.messages)
              ? (eventPayload.messages as Array<{
                  content: string;
                  messageType: string;
                  receivedAt: Date;
                }>)
              : undefined,
          },
          config
        );
      }
      await db
        .update(domainEvents)
        .set({
          status: "delivered",
          workerId: null,
          claimedAt: null,
          leaseUntil: null,
          deliveredAt: new Date(),
          lastError: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(domainEvents.id, item.id),
            eq(domainEvents.workerId, DOMAIN_EVENT_WORKER_ID)
          )
        );
      delivered += 1;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Falha desconhecida na entrega do evento";
      const attempt = item.attemptCount + 1;
      const terminal = attempt >= maxAttempts;
      const backoffMs = Math.min(60_000, 1_000 * 2 ** Math.max(0, attempt - 1));
      await db
        .update(domainEvents)
        .set({
          status: terminal ? "failed" : "pending",
          workerId: null,
          claimedAt: null,
          leaseUntil: null,
          availableAt: new Date(Date.now() + backoffMs),
          lastError: message,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(domainEvents.id, item.id),
            eq(domainEvents.workerId, DOMAIN_EVENT_WORKER_ID)
          )
        );
      failed += 1;
    }
  }
  return { processed: delivered + failed, delivered, failed, skipped: false };
}
export async function renameContact(
  workspaceId: number,
  contactId: number,
  rawName: string,
  actorUserId?: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const name = rawName.trim();
  if (name.length < 2 || name.length > 160)
    throw new Error("O nome deve ter entre 2 e 160 caracteres");
  const contact = await getContactById(workspaceId, contactId);
  if (!contact || contact.groupId) throw new Error("Lead não encontrado");
  const updatedAt = new Date();
  const saved = await db
    .update(contacts)
    .set({
      name,
      nameSource: "manual",
      nameUpdatedAt: updatedAt,
      nameUpdatedBy: actorUserId ?? null,
      updatedAt,
    })
    .where(
      and(
        eq(contacts.id, contactId),
        eq(contacts.workspaceId, workspaceId),
        isNull(contacts.groupId)
      )
    )
    .returning({ id: contacts.id });
  if (!saved[0]) throw new Error("Lead não encontrado");
  await db.insert(auditLogs).values({
    workspaceId,
    actorUserId,
    contactId,
    action: "contact_renamed",
    summary: `Nome alterado de “${contact.name}” para “${name}”`,
  });
  return getContactById(workspaceId, contactId);
}
