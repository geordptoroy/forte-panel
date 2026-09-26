import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import {
  agentPromptDrafts,
  agentPromptVersions,
  agentSimulationRuns,
  auditLogs,
  contacts,
  conversations,
  messages,
  platformAdmins,
  platformAuditLogs,
  platformWorkspaceNotes,
  supportSessions,
  users,
  whatsappChannels,
  whatsappInstances,
  workerHeartbeats,
  workspaceMembers,
  workspaces,
} from "../drizzle/schema";
import {
  getActiveWorkspaceById,
  getDb,
  getPlatformNativeAgentConfig,
  getWorkspaceUsageSnapshot,
  listPapiInstances,
  saveNativeAgentConfig,
} from "./db";
import type { NativeAgentConfig } from "./db";
import {
  maskProviderSecret,
  type AgentProviderSettings,
} from "./llm-providers";

export type PlatformPermission =
  | "platform_admin"
  | "platform_support_readonly"
  | "platform_support_operator";
export type SupportSessionMode = "read_only" | "operator";
export type WorkspaceStatus = "onboarding" | "active" | "suspended";

export type PlatformAdminAccess = {
  id: number;
  userId: number;
  permission: PlatformPermission;
  active: boolean;
};

export type SafeAgentConfig = {
  enabled: boolean;
  model: string;
  systemPrompt: string;
  maxSteps: number;
  apiSource: "environment";
  llm: AgentProviderSettings;
};

const permissionCanMutate = (permission: PlatformPermission) =>
  permission === "platform_admin" || permission === "platform_support_operator";

export function canPlatformAdminMutate(
  permission: PlatformPermission,
  mode: SupportSessionMode = "operator"
) {
  return permissionCanMutate(permission) && mode === "operator";
}

export function configuredPlatformAdminOpenIds() {
  return new Set(
    (process.env.PLATFORM_ADMIN_OPEN_IDS ?? "")
      .split(",")
      .map(value => value.trim())
      .filter(Boolean)
  );
}

export async function getPlatformAdminAccess(
  userId: number
): Promise<PlatformAdminAccess | null> {
  const db = await getDb();
  if (!db || userId < 1) return null;
  const existing = await db
    .select({
      id: platformAdmins.id,
      userId: platformAdmins.userId,
      permission: platformAdmins.permission,
      active: platformAdmins.active,
    })
    .from(platformAdmins)
    .where(and(eq(platformAdmins.userId, userId), eq(platformAdmins.active, 1)))
    .limit(1);
  if (existing[0])
    return {
      ...existing[0],
      permission: existing[0].permission as PlatformPermission,
      active: existing[0].active === 1,
    };

  // Explicit configuration may bootstrap a row, but the legacy users.role field
  // is intentionally never consulted for platform access.
  const user = (
    await db
      .select({ id: users.id, openId: users.openId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
  )[0];
  if (!user || !configuredPlatformAdminOpenIds().has(user.openId)) return null;
  await db
    .insert(platformAdmins)
    .values({ userId: user.id, permission: "platform_admin" })
    .onConflictDoNothing({ target: platformAdmins.userId });
  const created = await db
    .select({
      id: platformAdmins.id,
      userId: platformAdmins.userId,
      permission: platformAdmins.permission,
      active: platformAdmins.active,
    })
    .from(platformAdmins)
    .where(and(eq(platformAdmins.userId, userId), eq(platformAdmins.active, 1)))
    .limit(1);
  return created[0]
    ? {
        ...created[0],
        permission: created[0].permission as PlatformPermission,
        active: created[0].active === 1,
      }
    : null;
}

function redactValue(value: unknown, key = ""): unknown {
  if (/password|secret|token|api.?key|jwt|authorization/i.test(key))
    return "[redacted]";
  if (Array.isArray(value)) return value.map(item => redactValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        redactValue(childValue, childKey),
      ])
    );
  }
  return value;
}

function jsonSnapshot(value: unknown) {
  if (value === undefined || value === null) return null;
  try {
    return JSON.stringify(redactValue(value));
  } catch {
    return JSON.stringify({ value: "[unserializable]" });
  }
}

export function validateAgentPromptInput(input: {
  systemPrompt: string;
  model: string;
}) {
  const candidate = `${input.systemPrompt}\n${input.model}`;
  const secretPatterns = [
    /\bsk-[A-Za-z0-9_-]{12,}/i,
    /\bBearer\s+[A-Za-z0-9._-]{12,}/i,
    /\b(?:api[_ -]?key|access[_ -]?token|webhook[_ -]?secret|jwt[_ -]?secret|senha)\s*[:=]\s*\S+/i,
    /\b(?:PAPI|META|OPENAI|GEMINI|NVIDIA)_(?:API_KEY|ACCESS_TOKEN|WEBHOOK_SECRET|PANEL_TOKEN)\b/i,
  ];
  if (secretPatterns.some(pattern => pattern.test(candidate))) {
    return {
      valid: false as const,
      reason: "Não coloque credenciais, tokens ou segredos no prompt do agente",
    };
  }
  if (input.systemPrompt.length > 30_000)
    return {
      valid: false as const,
      reason: "O prompt excede o limite de 30.000 caracteres",
    };
  return { valid: true as const };
}

export function buildLocalSimulationResponse(input: {
  workspaceName: string;
  prompt: string;
  message: string;
}) {
  const message = input.message.trim().replace(/\s+/g, " ").slice(0, 600);
  const tone = /cordial|acolhedor|amigável/i.test(input.prompt)
    ? "clara, cordial e objetiva"
    : "clara e objetiva";
  return `Prévia local, sem envio externo. Para a mensagem “${message}”, o agente do workspace ${input.workspaceName} responderia de forma ${tone}, seguindo as regras do rascunho e confirmando dados operacionais antes de prometer preço, prazo ou agendamento.`;
}

function safeProviderSettings(
  settings: AgentProviderSettings
): AgentProviderSettings {
  const providers = Object.fromEntries(
    Object.entries(settings.providers).map(([providerId, provider]) => {
      const apiKey = provider.apiKey?.startsWith("••••")
        ? provider.apiKey
        : maskProviderSecret(provider.apiKey ?? "");
      return [
        providerId,
        { enabled: provider.enabled, baseUrl: provider.baseUrl, apiKey },
      ];
    })
  ) as AgentProviderSettings["providers"];
  return { providers, routing: settings.routing };
}

export function safeAgentConfig(config: NativeAgentConfig): SafeAgentConfig {
  return {
    enabled: config.enabled,
    model: config.model,
    systemPrompt: config.systemPrompt,
    maxSteps: config.maxSteps,
    apiSource: "environment",
    llm: safeProviderSettings(config.llm),
  };
}

function parseSafeAgentConfig(
  value: string | null | undefined,
  fallback: SafeAgentConfig
): SafeAgentConfig {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value) as Partial<SafeAgentConfig>;
    return {
      ...fallback,
      ...parsed,
      llm: parsed.llm
        ? safeProviderSettings(parsed.llm as AgentProviderSettings)
        : fallback.llm,
    };
  } catch {
    return fallback;
  }
}

async function recordPlatformAudit(input: {
  platformAdminId: number;
  workspaceId?: number | null;
  supportSessionId?: number | null;
  action: string;
  reason: string;
  summary: string;
  before?: unknown;
  after?: unknown;
  result?: "success" | "failure";
  requestId?: string | null;
  ipAddress?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const created = await db
    .insert(platformAuditLogs)
    .values({
      platformAdminId: input.platformAdminId,
      workspaceId: input.workspaceId ?? null,
      supportSessionId: input.supportSessionId ?? null,
      action: input.action,
      scope: input.workspaceId ? `workspace:${input.workspaceId}` : "platform",
      reason: input.reason.trim().slice(0, 500),
      summary: input.summary.trim().slice(0, 500),
      beforeData: jsonSnapshot(input.before),
      afterData: jsonSnapshot(input.after),
      result: input.result ?? "success",
      requestId: input.requestId ?? null,
      ipAddress: input.ipAddress ?? null,
    })
    .returning();
  return created[0];
}

function sessionView(session: typeof supportSessions.$inferSelect) {
  return {
    id: session.id,
    platformAdminId: session.platformAdminId,
    workspaceId: session.workspaceId,
    mode: session.mode as SupportSessionMode,
    status: session.status,
    scope: session.scope,
    reason: session.reason,
    startedAt: session.startedAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    revokedAt: session.revokedAt?.toISOString() ?? null,
  };
}

export async function startSupportSession(input: {
  platformAdminId: number;
  workspaceId: number;
  mode: SupportSessionMode;
  reason: string;
  expiresInMinutes: number;
}) {
  const db = await getDb();
  const workspace = await getActiveWorkspaceById(input.workspaceId);
  if (!db || !workspace) throw new Error("Workspace não encontrado ou inativo");
  const minutes = Math.max(5, Math.min(Math.floor(input.expiresInMinutes), 60));
  const now = new Date();
  const created = await db
    .insert(supportSessions)
    .values({
      platformAdminId: input.platformAdminId,
      workspaceId: workspace.id,
      mode: input.mode,
      status: "active",
      scope: "workspace",
      reason: input.reason.trim(),
      startedAt: now,
      expiresAt: new Date(now.getTime() + minutes * 60_000),
    })
    .returning();
  const session = created[0];
  if (!session) throw new Error("Não foi possível iniciar a sessão de suporte");
  await recordPlatformAudit({
    platformAdminId: input.platformAdminId,
    workspaceId: workspace.id,
    supportSessionId: session.id,
    action: "support_session_started",
    reason: input.reason,
    summary: `Sessão ${input.mode === "operator" ? "operadora" : "read-only"} iniciada`,
    after: { mode: input.mode, expiresAt: session.expiresAt },
  });
  return sessionView(session);
}

export async function getActiveSupportSession(input: {
  platformAdminId: number;
  sessionId: number;
  workspaceId: number;
  requireOperator?: boolean;
}) {
  const db = await getDb();
  if (!db) return null;
  const session = (
    await db
      .select()
      .from(supportSessions)
      .where(
        and(
          eq(supportSessions.id, input.sessionId),
          eq(supportSessions.platformAdminId, input.platformAdminId),
          eq(supportSessions.workspaceId, input.workspaceId),
          eq(supportSessions.status, "active")
        )
      )
      .limit(1)
  )[0];
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await db
      .update(supportSessions)
      .set({ status: "expired", updatedAt: new Date() })
      .where(eq(supportSessions.id, session.id));
    return null;
  }
  if (input.requireOperator && session.mode !== "operator") return null;
  return session;
}

export async function revokeSupportSession(input: {
  platformAdminId: number;
  sessionId: number;
  reason: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const session = (
    await db
      .select()
      .from(supportSessions)
      .where(
        and(
          eq(supportSessions.id, input.sessionId),
          eq(supportSessions.platformAdminId, input.platformAdminId)
        )
      )
      .limit(1)
  )[0];
  if (!session) throw new Error("Sessão de suporte não encontrada");
  const updated =
    (
      await db
        .update(supportSessions)
        .set({
          status: "revoked",
          revokedAt: new Date(),
          revokedByUserId: input.platformAdminId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(supportSessions.id, session.id),
            eq(supportSessions.status, "active")
          )
        )
        .returning()
    )[0] ?? session;
  await recordPlatformAudit({
    platformAdminId: input.platformAdminId,
    workspaceId: session.workspaceId,
    supportSessionId: session.id,
    action: "support_session_revoked",
    reason: input.reason,
    summary: "Sessão de suporte revogada",
    before: sessionView(session),
    after: sessionView(updated),
  });
  return sessionView(updated);
}

async function ownerForWorkspace(workspaceId: number) {
  const db = await getDb();
  if (!db) return null;
  const row = (
    await db
      .select({ userId: users.id, name: users.name, email: users.email })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.role, "owner"),
          eq(workspaceMembers.active, 1)
        )
      )
      .orderBy(asc(workspaceMembers.id))
      .limit(1)
  )[0];
  return row ?? null;
}

async function workspaceHealth(workspaceId: number) {
  const db = await getDb();
  if (!db)
    return {
      channel: "unknown",
      ai: "unknown",
      worker: "unknown",
      outboundQueue: 0,
      recentFailures: 0,
    };
  const [instances, queueRows, failureRows, workers, config] =
    await Promise.all([
      db
        .select({
          status: whatsappInstances.status,
          active: whatsappInstances.active,
          lastHealthError: whatsappInstances.lastHealthError,
        })
        .from(whatsappInstances)
        .where(eq(whatsappInstances.workspaceId, workspaceId)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(messages)
        .innerJoin(conversations, eq(conversations.id, messages.conversationId))
        .innerJoin(contacts, eq(contacts.id, conversations.contactId))
        .where(
          and(
            eq(contacts.workspaceId, workspaceId),
            eq(messages.status, "queued")
          )
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(messages)
        .innerJoin(conversations, eq(conversations.id, messages.conversationId))
        .innerJoin(contacts, eq(contacts.id, conversations.contactId))
        .where(
          and(
            eq(contacts.workspaceId, workspaceId),
            eq(messages.status, "failed")
          )
        ),
      db
        .select()
        .from(workerHeartbeats)
        .where(eq(workerHeartbeats.service, "forte-panel-worker"))
        .limit(1),
      getPlatformNativeAgentConfig(workspaceId),
    ]);
  const worker = workers[0];
  const workerStale = worker
    ? Date.now() - worker.observedAt.getTime() >
      Math.max(worker.intervalMs * 3, 180_000)
    : true;
  const hasHealthyInstance = instances.some(
    instance =>
      instance.active === 1 &&
      ["connected", "ready", "configured", "online"].includes(instance.status)
  );
  const hasDegradedInstance = instances.some(
    instance => instance.active === 1 && instance.lastHealthError
  );
  return {
    channel: hasHealthyInstance
      ? "healthy"
      : hasDegradedInstance
        ? "degraded"
        : instances.length > 0
          ? "configured"
          : "not_configured",
    ai: config.enabled ? "enabled" : "paused",
    worker: !worker
      ? "unknown"
      : workerStale
        ? "stale"
        : worker.lastError
          ? "degraded"
          : "healthy",
    outboundQueue: Number(queueRows[0]?.count ?? 0),
    recentFailures: Number(failureRows[0]?.count ?? 0),
  };
}

async function workspaceListItem(workspace: typeof workspaces.$inferSelect) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [memberRows, channelRows, owner, health] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspace.id),
          eq(workspaceMembers.active, 1)
        )
      ),
    db
      .select({
        provider: whatsappChannels.provider,
        active: whatsappChannels.active,
      })
      .from(whatsappChannels)
      .where(eq(whatsappChannels.workspaceId, workspace.id)),
    ownerForWorkspace(workspace.id),
    workspaceHealth(workspace.id),
  ]);
  const usage = await getWorkspaceUsageSnapshot(workspace.id);
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    segment: workspace.segment,
    plan: workspace.plan,
    status: workspace.status as WorkspaceStatus,
    active: workspace.active === 1,
    createdAt: workspace.createdAt.toISOString(),
    updatedAt: workspace.updatedAt.toISOString(),
    memberCount: Number(memberRows[0]?.count ?? 0),
    owner,
    channelCount: channelRows.filter(channel => channel.active === 1).length,
    channelProviders: Array.from(
      new Set(channelRows.map(channel => channel.provider))
    ),
    health,
    usage: usage.workspace,
  };
}

export async function listPlatformWorkspaces(search = "") {
  const db = await getDb();
  if (!db)
    return {
      items: [],
      summary: {
        total: 0,
        active: 0,
        onboarding: 0,
        suspended: 0,
        degraded: 0,
        nearQuota: 0,
      },
    };
  const term = search.trim();
  const rows = await db
    .select()
    .from(workspaces)
    .where(
      term
        ? or(
            ilike(workspaces.name, `%${term}%`),
            ilike(workspaces.slug, `%${term}%`)
          )
        : undefined
    )
    .orderBy(desc(workspaces.updatedAt), desc(workspaces.id))
    .limit(200);
  const items = await Promise.all(rows.map(workspaceListItem));
  return {
    items,
    summary: {
      total: items.length,
      active: items.filter(item => item.status === "active").length,
      onboarding: items.filter(item => item.status === "onboarding").length,
      suspended: items.filter(item => item.status === "suspended").length,
      degraded: items.filter(
        item =>
          ["degraded", "stale"].includes(item.health.worker) ||
          item.health.channel === "degraded" ||
          item.health.recentFailures > 0
      ).length,
      nearQuota: items.filter(item =>
        Object.values(item.usage).some(
          metric => metric.limit > 0 && metric.used / metric.limit >= 0.7
        )
      ).length,
    },
  };
}

async function getWorkspaceMembersForPlatform(workspaceId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: workspaceMembers.id,
      userId: users.id,
      name: users.name,
      email: users.email,
      role: workspaceMembers.role,
      active: workspaceMembers.active,
      lastSignedIn: users.lastSignedIn,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, workspaceId))
    .orderBy(asc(workspaceMembers.id));
  return rows.map(row => ({
    ...row,
    active: row.active === 1,
    lastSignedIn: row.lastSignedIn?.toISOString() ?? null,
  }));
}

export async function listPlatformAuditLogs(workspaceId: number, limit = 100) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: platformAuditLogs.id,
      action: platformAuditLogs.action,
      summary: platformAuditLogs.summary,
      reason: platformAuditLogs.reason,
      scope: platformAuditLogs.scope,
      result: platformAuditLogs.result,
      actorName: users.name,
      createdAt: platformAuditLogs.createdAt,
    })
    .from(platformAuditLogs)
    .leftJoin(
      platformAdmins,
      eq(platformAdmins.id, platformAuditLogs.platformAdminId)
    )
    .leftJoin(users, eq(users.id, platformAdmins.userId))
    .where(eq(platformAuditLogs.workspaceId, workspaceId))
    .orderBy(desc(platformAuditLogs.createdAt), desc(platformAuditLogs.id))
    .limit(Math.min(Math.max(limit, 1), 200));
  return rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

async function listWorkspaceAuditSafe(workspaceId: number, limit = 100) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      summary: auditLogs.summary,
      createdAt: auditLogs.createdAt,
      actorName: users.name,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .where(eq(auditLogs.workspaceId, workspaceId))
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(Math.min(Math.max(limit, 1), 200));
  return rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

export async function getPlatformAgentSnapshot(workspaceId: number) {
  const db = await getDb();
  const current = safeAgentConfig(await getPlatformNativeAgentConfig(workspaceId));
  if (!db) return { current, draft: null, versions: [], simulations: [] };
  const [draftRow, versionRows, simulationRows] = await Promise.all([
    db
      .select()
      .from(agentPromptDrafts)
      .where(eq(agentPromptDrafts.workspaceId, workspaceId))
      .limit(1),
    db
      .select()
      .from(agentPromptVersions)
      .where(eq(agentPromptVersions.workspaceId, workspaceId))
      .orderBy(desc(agentPromptVersions.version), desc(agentPromptVersions.id))
      .limit(50),
    db
      .select()
      .from(agentSimulationRuns)
      .where(eq(agentSimulationRuns.workspaceId, workspaceId))
      .orderBy(
        desc(agentSimulationRuns.createdAt),
        desc(agentSimulationRuns.id)
      )
      .limit(20),
  ]);
  const draft = draftRow[0]
    ? {
        id: draftRow[0].id,
        status: draftRow[0].status,
        prompt: draftRow[0].prompt,
        config: parseSafeAgentConfig(draftRow[0].configuration, current),
        updatedAt: draftRow[0].updatedAt.toISOString(),
      }
    : null;
  return {
    current,
    draft,
    versions: versionRows.map(version => ({
      id: version.id,
      version: version.version,
      status: version.status,
      prompt: version.prompt,
      config: parseSafeAgentConfig(version.configuration, current),
      reason: version.reason,
      createdAt: version.createdAt.toISOString(),
      publishedAt: version.publishedAt?.toISOString() ?? null,
    })),
    simulations: simulationRows.map(run => ({
      id: run.id,
      status: run.status,
      input: run.input,
      output: run.output,
      providerCalled: run.providerCalled === 1,
      createdAt: run.createdAt.toISOString(),
    })),
  };
}

export type PlatformAgentDraftInput = Pick<
  SafeAgentConfig,
  "enabled" | "model" | "systemPrompt" | "maxSteps"
>;

function draftToSafeConfig(
  current: SafeAgentConfig,
  input: PlatformAgentDraftInput
): SafeAgentConfig {
  return {
    ...current,
    enabled: input.enabled,
    model: input.model.trim(),
    systemPrompt: input.systemPrompt,
    maxSteps: Math.max(1, Math.min(8, Math.floor(input.maxSteps))),
  };
}

export async function savePlatformAgentDraft(input: {
  platformAdminId: number;
  workspaceId: number;
  draft: PlatformAgentDraftInput;
  reason: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const current = safeAgentConfig(
    await getPlatformNativeAgentConfig(input.workspaceId)
  );
  const validation = validateAgentPromptInput({
    systemPrompt: input.draft.systemPrompt,
    model: input.draft.model,
  });
  if (!validation.valid) throw new Error(validation.reason);
  const next = draftToSafeConfig(current, input.draft);
  const existing = (
    await db
      .select()
      .from(agentPromptDrafts)
      .where(eq(agentPromptDrafts.workspaceId, input.workspaceId))
      .limit(1)
  )[0];
  const now = new Date();
  const values = {
    workspaceId: input.workspaceId,
    prompt: next.systemPrompt,
    configuration: JSON.stringify(next),
    status: "draft" as const,
    updatedAt: now,
  };
  const saved = existing
    ? (
        await db
          .update(agentPromptDrafts)
          .set(values)
          .where(
            and(
              eq(agentPromptDrafts.id, existing.id),
              eq(agentPromptDrafts.workspaceId, input.workspaceId)
            )
          )
          .returning()
      )[0]
    : (
        await db
          .insert(agentPromptDrafts)
          .values({
            ...values,
            createdByPlatformAdminId: input.platformAdminId,
            createdAt: now,
          })
          .returning()
      )[0];
  if (!saved) throw new Error("Não foi possível salvar o rascunho do agente");
  await recordPlatformAudit({
    platformAdminId: input.platformAdminId,
    workspaceId: input.workspaceId,
    action: "agent_draft_saved",
    reason: input.reason,
    summary: "Rascunho do agente atualizado",
    after: {
      enabled: next.enabled,
      model: next.model,
      maxSteps: next.maxSteps,
      promptLength: next.systemPrompt.length,
    },
  });
  return {
    id: saved.id,
    status: saved.status,
    prompt: saved.prompt,
    config: next,
    updatedAt: saved.updatedAt.toISOString(),
  };
}

async function publishVersion(input: {
  platformAdminId: number;
  workspaceId: number;
  config: SafeAgentConfig;
  reason: string;
  rollbackOfId?: number | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const validation = validateAgentPromptInput({
    systemPrompt: input.config.systemPrompt,
    model: input.config.model,
  });
  if (!validation.valid) throw new Error(validation.reason);
  await saveNativeAgentConfig(input.workspaceId, input.config);
  const maxVersionRow = (
    await db
      .select({
        max: sql<number>`coalesce(max(${agentPromptVersions.version}), 0)::int`,
      })
      .from(agentPromptVersions)
      .where(eq(agentPromptVersions.workspaceId, input.workspaceId))
  )[0];
  const version = Number(maxVersionRow?.max ?? 0) + 1;
  const now = new Date();
  await db
    .update(agentPromptVersions)
    .set({ status: "archived", updatedAt: now })
    .where(
      and(
        eq(agentPromptVersions.workspaceId, input.workspaceId),
        eq(agentPromptVersions.status, "published")
      )
    );
  const created = (
    await db
      .insert(agentPromptVersions)
      .values({
        workspaceId: input.workspaceId,
        version,
        status: "published",
        prompt: input.config.systemPrompt,
        configuration: JSON.stringify(safeAgentConfig(input.config)),
        reason: input.reason.trim(),
        createdByPlatformAdminId: input.platformAdminId,
        rollbackOfId: input.rollbackOfId ?? null,
        publishedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
  )[0];
  if (!created) throw new Error("Não foi possível publicar a versão do agente");
  await db
    .update(agentPromptDrafts)
    .set({ status: "published", updatedAt: now })
    .where(eq(agentPromptDrafts.workspaceId, input.workspaceId));
  await recordPlatformAudit({
    platformAdminId: input.platformAdminId,
    workspaceId: input.workspaceId,
    action: input.rollbackOfId
      ? "agent_version_rollback"
      : "agent_version_published",
    reason: input.reason,
    summary: `${input.rollbackOfId ? "Rollback para" : "Versão"} do agente v${version} publicada`,
    after: {
      version,
      enabled: input.config.enabled,
      model: input.config.model,
      promptLength: input.config.systemPrompt.length,
      rollbackOfId: input.rollbackOfId ?? null,
    },
  });
  return {
    id: created.id,
    version,
    status: created.status,
    prompt: created.prompt,
    config: safeAgentConfig(input.config),
    reason: created.reason,
    createdAt: created.createdAt.toISOString(),
    publishedAt: created.publishedAt?.toISOString() ?? null,
  };
}

export async function publishPlatformAgentDraft(input: {
  platformAdminId: number;
  workspaceId: number;
  reason: string;
}) {
  const snapshot = await getPlatformAgentSnapshot(input.workspaceId);
  const config = snapshot.draft?.config ?? snapshot.current;
  return publishVersion({ ...input, config });
}

export async function rollbackPlatformAgentVersion(input: {
  platformAdminId: number;
  workspaceId: number;
  versionId: number;
  reason: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const target = (
    await db
      .select()
      .from(agentPromptVersions)
      .where(
        and(
          eq(agentPromptVersions.id, input.versionId),
          eq(agentPromptVersions.workspaceId, input.workspaceId)
        )
      )
      .limit(1)
  )[0];
  if (!target)
    throw new Error("Versão do agente não encontrada neste workspace");
  const current = safeAgentConfig(
    await getPlatformNativeAgentConfig(input.workspaceId)
  );
  const config = parseSafeAgentConfig(target.configuration, {
    ...current,
    systemPrompt: target.prompt,
  });
  return publishVersion({ ...input, config, rollbackOfId: target.id });
}

export async function simulatePlatformAgent(input: {
  platformAdminId: number;
  workspaceId: number;
  message: string;
  reason: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const workspace = await getActiveWorkspaceById(input.workspaceId);
  if (!workspace) throw new Error("Workspace não encontrado ou inativo");
  const snapshot = await getPlatformAgentSnapshot(input.workspaceId);
  const config = snapshot.draft?.config ?? snapshot.current;
  const validation = validateAgentPromptInput({
    systemPrompt: config.systemPrompt,
    model: config.model,
  });
  if (!validation.valid) throw new Error(validation.reason);
  const output = buildLocalSimulationResponse({
    workspaceName: workspace.name,
    prompt: config.systemPrompt,
    message: input.message,
  });
  const created = (
    await db
      .insert(agentSimulationRuns)
      .values({
        workspaceId: input.workspaceId,
        platformAdminId: input.platformAdminId,
        draftId: snapshot.draft?.id ?? null,
        versionId: null,
        input: input.message.trim(),
        output,
        status: "completed",
        providerCalled: 0,
      })
      .returning()
  )[0];
  if (!created) throw new Error("Não foi possível registrar a simulação");
  await recordPlatformAudit({
    platformAdminId: input.platformAdminId,
    workspaceId: input.workspaceId,
    action: "agent_simulation_run",
    reason: input.reason,
    summary: "Simulação local executada sem provider externo",
    after: { simulationId: created.id, providerCalled: false },
  });
  return {
    id: created.id,
    status: created.status,
    input: created.input,
    output: created.output,
    providerCalled: false,
    createdAt: created.createdAt.toISOString(),
  };
}

export async function addPlatformWorkspaceNote(input: {
  platformAdminId: number;
  workspaceId: number;
  supportSessionId: number;
  body: string;
  reason: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const created = (
    await db
      .insert(platformWorkspaceNotes)
      .values({
        platformAdminId: input.platformAdminId,
        workspaceId: input.workspaceId,
        supportSessionId: input.supportSessionId,
        body: input.body.trim(),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning()
  )[0];
  if (!created) throw new Error("Não foi possível registrar a nota interna");
  await recordPlatformAudit({
    platformAdminId: input.platformAdminId,
    workspaceId: input.workspaceId,
    supportSessionId: input.supportSessionId,
    action: "internal_note_created",
    reason: input.reason,
    summary: "Nota interna de suporte registrada",
    after: { noteId: created.id, bodyLength: input.body.trim().length },
  });
  return {
    id: created.id,
    body: created.body,
    createdAt: created.createdAt.toISOString(),
  };
}

export async function listPlatformWorkspaceNotes(workspaceId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: platformWorkspaceNotes.id,
      body: platformWorkspaceNotes.body,
      authorName: users.name,
      createdAt: platformWorkspaceNotes.createdAt,
    })
    .from(platformWorkspaceNotes)
    .leftJoin(
      platformAdmins,
      eq(platformAdmins.id, platformWorkspaceNotes.platformAdminId)
    )
    .leftJoin(users, eq(users.id, platformAdmins.userId))
    .where(eq(platformWorkspaceNotes.workspaceId, workspaceId))
    .orderBy(
      desc(platformWorkspaceNotes.createdAt),
      desc(platformWorkspaceNotes.id)
    )
    .limit(100);
  return rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

export async function setPlatformWorkspaceStatus(input: {
  platformAdminId: number;
  workspaceId: number;
  status: WorkspaceStatus;
  reason: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const workspace = (
    await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, input.workspaceId))
      .limit(1)
  )[0];
  if (!workspace) throw new Error("Workspace não encontrado");
  const active = input.status === "suspended" ? 0 : 1;
  const updated = (
    await db
      .update(workspaces)
      .set({ status: input.status, active, updatedAt: new Date() })
      .where(eq(workspaces.id, input.workspaceId))
      .returning()
  )[0];
  if (!updated) throw new Error("Não foi possível atualizar o workspace");
  await recordPlatformAudit({
    platformAdminId: input.platformAdminId,
    workspaceId: input.workspaceId,
    action: `workspace_${input.status}`,
    reason: input.reason,
    summary: `Workspace ${input.status === "suspended" ? "suspenso" : input.status === "onboarding" ? "marcado em onboarding" : "reativado"}`,
    before: { status: workspace.status, active: workspace.active === 1 },
    after: { status: updated.status, active: updated.active === 1 },
  });
  return {
    id: updated.id,
    status: updated.status as WorkspaceStatus,
    active: updated.active === 1,
  };
}

export async function setPlatformWorkspaceAi(input: {
  platformAdminId: number;
  workspaceId: number;
  enabled: boolean;
  reason: string;
}) {
  const before = safeAgentConfig(await getPlatformNativeAgentConfig(input.workspaceId));
  const updated = await saveNativeAgentConfig(input.workspaceId, {
    enabled: input.enabled,
  });
  await recordPlatformAudit({
    platformAdminId: input.platformAdminId,
    workspaceId: input.workspaceId,
    action: input.enabled ? "workspace_ai_reactivated" : "workspace_ai_paused",
    reason: input.reason,
    summary: input.enabled
      ? "IA do workspace reativada"
      : "IA do workspace pausada",
    before: { enabled: before.enabled },
    after: { enabled: updated.enabled },
  });
  return { enabled: updated.enabled };
}

export async function getPlatformWorkspaceDetail(workspaceId: number) {
  const db = await getDb();
  const workspace = (
    await db
      ?.select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1)
  )?.[0];
  if (!db || !workspace) return null;
  const [
    summary,
    members,
    instances,
    notes,
    platformAudit,
    workspaceAudit,
    agent,
  ] = await Promise.all([
    workspaceListItem(workspace),
    getWorkspaceMembersForPlatform(workspaceId),
    listPapiInstances(workspaceId),
    listPlatformWorkspaceNotes(workspaceId),
    listPlatformAuditLogs(workspaceId),
    listWorkspaceAuditSafe(workspaceId),
    getPlatformAgentSnapshot(workspaceId),
  ]);
  const channels = (
    await db
      .select({
        id: whatsappChannels.id,
        provider: whatsappChannels.provider,
        name: whatsappChannels.name,
        phoneNumber: whatsappChannels.phoneNumber,
        active: whatsappChannels.active,
      })
      .from(whatsappChannels)
      .where(eq(whatsappChannels.workspaceId, workspaceId))
  ).map(channel => ({
    ...channel,
    active: channel.active === 1,
    phoneNumber: channel.phoneNumber
      ? `${channel.phoneNumber.slice(0, 3)}•••${channel.phoneNumber.slice(-2)}`
      : null,
  }));
  return {
    workspace: summary,
    members,
    channels,
    instances,
    notes,
    platformAudit,
    workspaceAudit,
    agent,
  };
}

export async function recordWorkerHeartbeat(input: {
  service: string;
  ticks: number;
  intervalMs: number;
  lastError: string | null;
}) {
  const db = await getDb();
  if (!db) return;
  const now = new Date();
  await db
    .insert(workerHeartbeats)
    .values({
      service: input.service,
      status: input.lastError ? "degraded" : "healthy",
      ticks: input.ticks,
      intervalMs: input.intervalMs,
      lastError: input.lastError,
      observedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: workerHeartbeats.service,
      set: {
        status: input.lastError ? "degraded" : "healthy",
        ticks: input.ticks,
        intervalMs: input.intervalMs,
        lastError: input.lastError,
        observedAt: now,
        updatedAt: now,
      },
    });
}

export async function createPlatformBootstrapRow(
  userId: number,
  permission: PlatformPermission = "platform_admin"
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return (
    (
      await db
        .insert(platformAdmins)
        .values({ userId, permission })
        .onConflictDoNothing({ target: platformAdmins.userId })
        .returning()
    )[0] ?? null
  );
}

export function isExternalProviderCallAllowedForSimulation() {
  return false;
}
