import { and, asc, desc, eq, gte, ilike, isNull, ne, or, sql } from "drizzle-orm";
import crypto from "node:crypto";
import {
  agentPromptDrafts,
  agentPromptVersions,
  agentRuns,
  agentSimulationRuns,
  auditLogs,
  contacts,
  conversations,
  domainEvents,
  messages,
  webhookEvents,
  platformAdmins,
  platformAiConnections,
  platformAuditLogs,
  platformIncidents,
  platformSupportTickets,
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
  getPlatformGlobalNativeAgentConfig,
  getPlatformNativeAgentConfig,
  getNativeAgentRuntimeConfig,
  getWorkspaceById,
  ensureBaileysChannel,
  createBaileysInstance,
  getBaileysInstance,
  resetWorkspaceDevelopmentData,
  getWorkspaceUsageSnapshot,
  getOnboardingGovernance,
  saveOnboardingRetentionPolicy,
  listBaileysInstances,
  getAgendaSnapshot,
  createProfessional,
  createAgendaAppointment,
  cancelAgendaAppointment,
  rescheduleAgendaAppointment,
  updateAgendaStatus,
  listInboxContacts,
  getContactById,
  getConversationByContact,
  listMessagesForContact,
  getAuditLogForContact,
  listContactNotes,
  sendManualMessage,
  markConversationRead,
  saveNativeAgentConfig,
  savePlatformGlobalNativeAgentConfig,
  getWorkspaceSetting,
  upsertWorkspaceSetting,
} from "./db";
import {
  createService,
  listProfessionalsDetailed,
  listServices,
  replaceAvailability,
  setProfessionalServices,
  updateProfessional,
  updateService,
} from "./workspace";
import type { NativeAgentConfig } from "./db";
import {
  createBaileysInstance as createBaileysGatewayInstance,
  deleteBaileysInstance as deleteBaileysGatewayInstance,
  disconnectBaileys as disconnectBaileysGateway,
} from "./baileys-gateway";
import { ENV } from "./_core/env";
import {
  encryptProviderSecret,
  invokeConfiguredLLM,
  maskProviderSecret,
  type AgentProviderSettings,
} from "./llm-providers";
import { validateLlmTarget } from "./llm-url-security";
import { validateInteractiveMessage } from "./interactive-messages";
import { buildSaaSBillingBoundary } from "./saas-billing";

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
export const PLATFORM_SUPPORT_WORKSPACE_SLUG = "forte-platform-support";
export const PLATFORM_SUPPORT_WORKSPACE_NAME = "Suporte Forte Platform";
export function isPlatformSupportWorkspace(workspace: { slug?: string } | null | undefined) {
  return workspace?.slug === PLATFORM_SUPPORT_WORKSPACE_SLUG;
}

export async function ensurePlatformSupportWorkspace() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const existing = (
    await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.slug, PLATFORM_SUPPORT_WORKSPACE_SLUG))
      .limit(1)
  )[0];
  if (existing) {
    await ensureBaileysChannel(existing.id);
    return existing;
  }
  const created = (
    await db
      .insert(workspaces)
      .values({
        name: PLATFORM_SUPPORT_WORKSPACE_NAME,
        slug: PLATFORM_SUPPORT_WORKSPACE_SLUG,
        segment: "platform_support",
        plan: "business",
        status: "active",
      })
      .returning()
  )[0];
  if (!created) throw new Error("Não foi possível criar o workspace de suporte");
  await ensureBaileysChannel(created.id);
  return created;
}

const permissionCanMutate = (permission: PlatformPermission) =>
  permission === "platform_admin" || permission === "platform_support_operator";

export function canPlatformAdminMutate(
  permission: PlatformPermission,
  mode: SupportSessionMode = "operator"
) {
  return permissionCanMutate(permission) && mode === "operator";
}

export function configuredPlatformAdminOpenIds() {
  const configured = new Set(
    (process.env.PLATFORM_ADMIN_OPEN_IDS ?? "")
      .split(",")
      .map(value => value.trim())
      .filter(Boolean)
  );
  for (const account of ENV.localPlatformAdminAccounts) configured.add(account.openId);
  return configured;
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
    /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*_(?:API_KEY|ACCESS_TOKEN|WEBHOOK_SECRET|PANEL_TOKEN)\b/i,
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
  const routing = Object.fromEntries(
    Object.entries(settings.routing).map(([capability, route]) => [
      capability,
      {
        ...route,
        ...(route.apiKey
          ? {
              apiKey: route.apiKey.startsWith("••••")
                ? route.apiKey
                : maskProviderSecret(route.apiKey),
            }
          : {}),
        ...(route.fallback
          ? {
              fallback: route.fallback.map(fallback => ({
                ...fallback,
                ...(fallback.apiKey
                  ? {
                      apiKey: fallback.apiKey.startsWith("••••")
                        ? fallback.apiKey
                        : maskProviderSecret(fallback.apiKey),
                    }
                  : {}),
              })),
            }
          : {}),
      },
    ])
  ) as AgentProviderSettings["routing"];
  return { providers, routing };
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

export async function getPlatformGlobalAgentSnapshot() {
  return safeAgentConfig(await getPlatformGlobalNativeAgentConfig());
}

const PLATFORM_INSTANCE_PROMPT_BINDINGS_KEY = "platform_instance_prompt_bindings";
const PLATFORM_GLOBAL_CONFIG_WORKSPACE_ID = 0;

export type PlatformInstancePromptBinding = {
  instanceId: string;
  systemPrompt: string;
  model: string;
  maxSteps: number;
  enabled: boolean;
  version: number;
  updatedAt: string;
};

async function readPlatformInstancePromptBindings(): Promise<PlatformInstancePromptBinding[]> {
  const setting = await getWorkspaceSetting(
    PLATFORM_GLOBAL_CONFIG_WORKSPACE_ID,
    PLATFORM_INSTANCE_PROMPT_BINDINGS_KEY
  );
  if (!setting?.value) return [];
  try {
    const parsed = JSON.parse(setting.value) as unknown;
    return Array.isArray(parsed) ? (parsed as PlatformInstancePromptBinding[]) : [];
  } catch {
    return [];
  }
}

export async function listPlatformInstancePromptBindings() {
  return readPlatformInstancePromptBindings();
}

export async function savePlatformInstancePromptBinding(input: {
  platformAdminId: number;
  workspaceId: number;
  instanceId: string;
  systemPrompt: string;
  model: string;
  maxSteps: number;
  enabled: boolean;
  reason: string;
}) {
  const validation = validateAgentPromptInput({
    systemPrompt: input.systemPrompt,
    model: input.model,
  });
  if (!validation.valid) throw new Error(validation.reason);
  const current = await readPlatformInstancePromptBindings();
  const previous = current.find(item => item.instanceId === input.instanceId);
  const binding: PlatformInstancePromptBinding = {
    instanceId: input.instanceId,
    systemPrompt: input.systemPrompt,
    model: input.model.trim(),
    maxSteps: Math.max(1, Math.min(8, input.maxSteps)),
    enabled: false,
    version: (previous?.version ?? 0) + 1,
    updatedAt: new Date().toISOString(),
  };
  const next = [
    ...current.filter(item => item.instanceId !== input.instanceId),
    binding,
  ];
  await upsertWorkspaceSetting(
    PLATFORM_GLOBAL_CONFIG_WORKSPACE_ID,
    PLATFORM_INSTANCE_PROMPT_BINDINGS_KEY,
    JSON.stringify(next)
  );
  await recordPlatformAudit({
    platformAdminId: input.platformAdminId,
    workspaceId: input.workspaceId,
    action: "platform_instance_prompt_binding_updated",
    reason: input.reason,
    summary: `Prompt global v${binding.version} pareado à instância ${input.instanceId}`,
    before: previous ?? null,
    after: { ...binding, automaticReplies: "not_activated" },
  });
  return binding;
}

export async function simulatePlatformInstanceAgent(input: {
  platformAdminId: number;
  instanceId: string;
  message: string;
  reason: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const workspace = await ensurePlatformSupportWorkspace();
  const instance = await getBaileysInstance(workspace.id, input.instanceId);
  if (!instance) throw new Error("Instância de suporte não encontrada");
  const binding = (await readPlatformInstancePromptBindings()).find(
    item => item.instanceId === instance.instanceId
  );
  const config = await getNativeAgentRuntimeConfig(
    workspace.id,
    instance.instanceId
  );
  const validation = validateAgentPromptInput({
    systemPrompt: config.systemPrompt,
    model: config.model,
  });
  if (!validation.valid) throw new Error(validation.reason);
  const output = buildLocalSimulationResponse({
    workspaceName: `${workspace.name} / ${instance.name}`,
    prompt: config.systemPrompt,
    message: input.message,
  });
  const created = (
    await db
      .insert(agentSimulationRuns)
      .values({
        workspaceId: workspace.id,
        platformAdminId: input.platformAdminId,
        draftId: null,
        versionId: null,
        input: input.message.trim(),
        output,
        status: "completed",
        providerCalled: 0,
      })
      .returning()
  )[0];
  if (!created) throw new Error("Não foi possível registrar o teste da instância");
  await recordPlatformAudit({
    platformAdminId: input.platformAdminId,
    workspaceId: workspace.id,
    action: "agent_instance_simulation_run",
    reason: input.reason,
    summary: `Teste local do agente na instância ${instance.name}`,
    after: {
      simulationId: created.id,
      instanceId: instance.instanceId,
      model: config.model,
      enabled: config.enabled,
      providerCalled: false,
    },
  });
  return {
    id: created.id,
    mode: "simulation_only" as const,
    status: created.status,
    input: created.input,
    output: created.output,
    providerCalled: false,
    instance: {
      instanceId: instance.instanceId,
      name: instance.name,
      status: instance.status,
    },
    enabled: config.enabled,
    model: config.model,
    promptSource: binding ? "instance" : "global",
    bindingVersion: binding?.version ?? null,
    createdAt: created.createdAt.toISOString(),
  };
}

export async function savePlatformGlobalAiPolicy(input: {
  platformAdminId: number;
  reason: string;
  enabled: boolean;
  model: string;
  systemPrompt: string;
  maxSteps: number;
  llm: AgentProviderSettings;
}) {
  const targets = new Map<string, { provider: keyof AgentProviderSettings["providers"]; url: string }>();
  const addTarget = (
    provider: keyof AgentProviderSettings["providers"],
    url?: string
  ) => {
    const normalizedUrl = url?.trim();
    if (normalizedUrl) targets.set(`${provider}:${normalizedUrl}`, { provider, url: normalizedUrl });
  };
  for (const [provider, config] of Object.entries(input.llm.providers))
    addTarget(provider as keyof AgentProviderSettings["providers"], config.baseUrl);
  for (const route of Object.values(input.llm.routing)) {
    addTarget(route.provider, route.baseUrl);
    for (const fallback of route.fallback ?? [])
      addTarget(fallback.provider, fallback.baseUrl);
  }
  await Promise.all(
    Array.from(targets.values()).map(({ provider, url }) =>
      validateLlmTarget(provider, url)
    )
  );
  const before = await getPlatformGlobalNativeAgentConfig();
  const saved = await savePlatformGlobalNativeAgentConfig({
    enabled: input.enabled,
    model: input.model,
    systemPrompt: input.systemPrompt,
    maxSteps: input.maxSteps,
    llm: input.llm,
  });
  await recordPlatformAudit({
    platformAdminId: input.platformAdminId,
    action: "platform_global_ai_policy_updated",
    reason: input.reason,
    summary: `Política global da IA ${input.enabled ? "ativada" : "pausada"}; modelo ${input.model}`,
    before,
    after: saved,
  });
  return safeAgentConfig(saved);
}

export type PlatformAiCapability =
  | "whatsapp_reply"
  | "audio_transcription"
  | "image_analysis"
  | "document_analysis"
  | "admin_support";
export type PlatformAiProvider =
  | "nvidia_nim"
  | "google_gemini"
  | "openai_compatible";

function safeAiConnection(row: typeof platformAiConnections.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    capability: row.capability as PlatformAiCapability,
    provider: row.provider as PlatformAiProvider,
    baseUrl: row.baseUrl,
    model: row.model,
    apiKey: maskProviderSecret(row.encryptedApiKey),
    active: row.active === 1,
    status: row.status,
    lastTestedAt: row.lastTestedAt,
    lastError: row.lastError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function assertAiBaseUrl(
  provider: PlatformAiProvider,
  value: string
) {
  const url = await validateLlmTarget(provider, value);
  return url.toString().replace(/\/+$/, "");
}

export async function listPlatformAiConnections() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const rows = await db
    .select()
    .from(platformAiConnections)
    .orderBy(asc(platformAiConnections.capability), asc(platformAiConnections.name));
  return rows.map(safeAiConnection);
}

export async function createPlatformAiConnection(input: {
  platformAdminId: number;
  name: string;
  capability: PlatformAiCapability;
  provider: PlatformAiProvider;
  baseUrl: string;
  model: string;
  apiKey: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const name = input.name.trim();
  const model = input.model.trim();
  const apiKey = input.apiKey.trim();
  if (!name || !model || !apiKey) throw new Error("Preencha nome, modelo e API key");
  const baseUrl = await assertAiBaseUrl(input.provider, input.baseUrl.trim());
  const inserted = await db
    .insert(platformAiConnections)
    .values({
      name,
      capability: input.capability,
      provider: input.provider,
      baseUrl,
      model,
      encryptedApiKey: encryptProviderSecret(apiKey),
      createdBy: input.platformAdminId,
    })
    .returning();
  const row = inserted[0];
  if (!row) throw new Error("Não foi possível criar a conexão de IA");
  const safe = safeAiConnection(row);
  await recordPlatformAudit({
    platformAdminId: input.platformAdminId,
    action: "platform_ai_connection_created",
    reason: `Cadastro da conexão ${name}`,
    summary: `Conexão de IA criada para ${input.capability}`,
    after: safe,
  });
  return safe;
}

export async function deletePlatformAiConnection(input: {
  platformAdminId: number;
  id: number;
  reason: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const existing = (await db.select().from(platformAiConnections).where(eq(platformAiConnections.id, input.id)).limit(1))[0];
  if (!existing) return false;
  await db.delete(platformAiConnections).where(eq(platformAiConnections.id, input.id));
  await recordPlatformAudit({
    platformAdminId: input.platformAdminId,
    action: "platform_ai_connection_deleted",
    reason: input.reason,
    summary: `Conexão de IA ${existing.name} excluída`,
    before: safeAiConnection(existing),
  });
  return true;
}

function capabilityToAgentCapability(capability: PlatformAiCapability): "text" | "vision" | "audio" | "document" {
  if (capability === "audio_transcription") return "audio";
  if (capability === "image_analysis") return "vision";
  if (capability === "document_analysis") return "document";
  return "text";
}

export async function testPlatformAiConnection(input: { platformAdminId: number; id: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const row = (await db.select().from(platformAiConnections).where(eq(platformAiConnections.id, input.id)).limit(1))[0];
  if (!row) throw new Error("Conexão de IA não encontrada");
  const capability = capabilityToAgentCapability(row.capability as PlatformAiCapability);
  const provider = row.provider as PlatformAiProvider;
  const startedAt = Date.now();
  try {
    const settings: AgentProviderSettings = {
      providers: {
        nvidia_nim: { enabled: provider === "nvidia_nim", baseUrl: row.baseUrl, apiKey: row.encryptedApiKey },
        google_gemini: { enabled: provider === "google_gemini", baseUrl: row.baseUrl, apiKey: row.encryptedApiKey },
        openai_compatible: { enabled: provider === "openai_compatible", baseUrl: row.baseUrl, apiKey: row.encryptedApiKey },
      },
      routing: {
        text: { provider, model: row.model },
        vision: { provider, model: row.model },
        audio: { provider, model: row.model },
        document: { provider, model: row.model },
      },
    };
    await invokeConfiguredLLM(settings, capability, {
      model: row.model,
      messages: [{ role: "user", content: "Responda apenas com OK." }],
      maxTokens: 5,
    });
    await db.update(platformAiConnections).set({ status: "validated", lastTestedAt: new Date(), lastError: null, updatedAt: new Date() }).where(eq(platformAiConnections.id, row.id));
    const result = { ready: true, latencyMs: Date.now() - startedAt, message: "Conexão validada com sucesso." };
    await recordPlatformAudit({ platformAdminId: input.platformAdminId, action: "platform_ai_connection_tested", reason: `Teste da conexão ${row.name}`, summary: `${row.name} respondeu corretamente`, after: result });
    return result;
  } catch (error) {
    const message = (error instanceof Error ? error.message : "Falha desconhecida").replace(/Bearer\s+\S+/gi, "Bearer [redacted]").slice(0, 500);
    await db.update(platformAiConnections).set({ status: "error", lastTestedAt: new Date(), lastError: message, updatedAt: new Date() }).where(eq(platformAiConnections.id, row.id));
    return { ready: false, latencyMs: Date.now() - startedAt, message };
  }
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

export async function recordPlatformAudit(input: {
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

export async function resetPlatformWorkspace(input: {
  platformAdminId: number;
  workspaceId: number;
  supportSessionId: number;
  reason: string;
}) {
  const result = await resetWorkspaceDevelopmentData(input.workspaceId);
  await recordPlatformAudit({
    platformAdminId: input.platformAdminId,
    workspaceId: input.workspaceId,
    supportSessionId: input.supportSessionId,
    action: "workspace_development_reset",
    reason: input.reason,
    summary: "Dados operacionais do workspace apagados pelo console administrativo",
    after: result,
  });
  return result;
}

export async function createPlatformBaileysInstance(input: {
  platformAdminId: number;
  workspaceId: number;
  supportSessionId: number | null;
  name: string;
  reason: string;
}) {
  const workspace = await getWorkspaceById(input.workspaceId);
  if (!workspace) throw new Error("Workspace não encontrado");
  const channel = await ensureBaileysChannel(input.workspaceId);
  const instanceId = `ws${input.workspaceId}-${crypto.randomUUID()}`;
  await createBaileysGatewayInstance(instanceId, input.name);
  try {
    const instance = await createBaileysInstance(
      input.workspaceId,
      channel.id,
      instanceId,
      input.name
    );
    await recordPlatformAudit({
      platformAdminId: input.platformAdminId,
      workspaceId: input.workspaceId,
      supportSessionId: input.supportSessionId,
      action: "baileys_instance_created",
      reason: input.reason,
      summary: `Instância Baileys ${instance.name} criada pelo suporte`,
      after: { instanceId: instance.instanceId, name: instance.name },
    });
    return instance;
  } catch (error) {
    await deleteBaileysGatewayInstance(instanceId).catch(() => undefined);
    throw error;
  }
}

export async function disconnectPlatformBaileysInstance(input: {
  platformAdminId: number;
  workspaceId: number;
  supportSessionId: number | null;
  instanceId: string;
  logout: boolean;
  reason: string;
}) {
  const instance = await getBaileysInstance(input.workspaceId, input.instanceId);
  if (!instance) throw new Error("Instância Baileys não encontrada neste workspace");
  const status = await disconnectBaileysGateway(instance.instanceId, input.logout);
  await recordPlatformAudit({
    platformAdminId: input.platformAdminId,
    workspaceId: input.workspaceId,
    supportSessionId: input.supportSessionId,
    action: input.logout ? "baileys_instance_logged_out" : "baileys_instance_disconnected",
    reason: input.reason,
    summary: `${input.logout ? "Logout" : "Desconexão"} da instância ${instance.name}`,
    before: { instanceId: instance.instanceId, status: instance.status },
    after: { instanceId: instance.instanceId, status: status.status ?? "unknown" },
  });
  return status;
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
  const workspace = await getWorkspaceById(input.workspaceId);
  if (!db || !workspace) throw new Error("Workspace não encontrado");
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
        ? and(
            ne(workspaces.slug, PLATFORM_SUPPORT_WORKSPACE_SLUG),
            or(
              ilike(workspaces.name, `%${term}%`),
              ilike(workspaces.slug, `%${term}%`)
            )
          )
        : ne(workspaces.slug, PLATFORM_SUPPORT_WORKSPACE_SLUG)
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

function mapPlatformSupportContact(contact: any) {
  return {
    id: String(contact.id),
    name: contact.name,
    phone: contact.groupId ? "" : contact.externalPhone,
    isGroup: contact.groupId !== null,
    groupJid: contact.groupJid ?? null,
    groupSubject: contact.groupSubject ?? null,
    groupInstanceId: contact.groupInstanceId ?? null,
    groupParticipantCount: contact.groupParticipantCount ?? 0,
    groupParticipants: contact.groupParticipants ?? [],
    pushName: contact.pushName,
    nameSource: contact.nameSource,
    city: contact.city ?? "",
    neighborhood: contact.neighborhood ?? "",
    service: contact.serviceRequested ?? "Não informado",
    urgency: contact.urgency,
    stage: contact.opportunityStage ?? contact.stage,
    aiEnabled: contact.aiEnabled === 1,
    unread: contact.unreadCount,
    awaitingResponse: contact.awaitingResponse ?? false,
    needsOperatorResponse: contact.needsOperatorResponse ?? false,
    lastMessage: contact.lastMessagePreview ?? "Sem mensagens",
    lastMessageAt:
      contact.lastMessageAt?.toISOString() ?? contact.updatedAt.toISOString(),
    quote: contact.quoteCents / 100,
    pending: contact.quoteCents / 100,
    daysNoReply: 0,
    initials: contact.name
      .split(" ")
      .map((part: string) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase(),
  };
}

export type PlatformHealthState = "healthy" | "degraded" | "stale" | "not_configured" | "unknown";
export async function getPlatformOperationalHealth() {
  const db = await getDb();
  const checkedAt = new Date().toISOString();
  if (!db) return { checkedAt, overall: "unknown" as PlatformHealthState, components: { gateway: { status: "unknown", configuredInstances: 0, activeInstances: 0, degradedInstances: 0 }, worker: { status: "unknown", service: "forte-panel-worker", observedAt: null, lastError: false }, queues: { status: "unknown", outbound: 0, webhooks: 0, domainEvents: 0 }, storage: { status: "unknown", configured: false, privateMediaEnabled: false }, providers: { status: "unknown", active: 0, healthy: 0, degraded: 0, pending: 0 }, agent: { status: "unknown", runs30d: 0, failures30d: 0, fallbackRuns30d: 0 } } };
  const agentWindowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [instances, workerRows, outboundRows, webhookRows, domainRows, storageRows, providerRows, agentRows] = await Promise.all([
    db.select({ status: whatsappInstances.status, active: whatsappInstances.active, lastHealthError: whatsappInstances.lastHealthError }).from(whatsappInstances),
    db.select().from(workerHeartbeats).where(eq(workerHeartbeats.service, "forte-panel-worker")).limit(1),
    db.select({ count: sql<number>`count(*)::int` }).from(messages).where(eq(messages.status, "queued")),
    db.select({ count: sql<number>`count(*)::int` }).from(webhookEvents).where(eq(webhookEvents.status, "received")),
    db.select({ count: sql<number>`count(*)::int` }).from(domainEvents).where(or(eq(domainEvents.status, "pending"), eq(domainEvents.status, "processing"))),
    db.select({ active: whatsappChannels.active }).from(whatsappChannels),
    db.select({ active: platformAiConnections.active, status: platformAiConnections.status }).from(platformAiConnections),
    db.select({
      runs: sql<number>`count(*)::int`,
      failures: sql<number>`count(*) filter (where ${agentRuns.outcome} = 'failed')::int`,
      fallbackRuns: sql<number>`count(*) filter (where ${agentRuns.providerAttempts} > 1)::int`,
    }).from(agentRuns).where(gte(agentRuns.createdAt, agentWindowStart)),
  ]);
  const worker = workerRows[0];
  const workerStale = !worker || Date.now() - worker.observedAt.getTime() > Math.max(worker.intervalMs * 3, 180_000);
  const activeInstances = instances.filter(row => row.active === 1);
  const configuredInstances = activeInstances.filter(row => row.status !== "unknown").length;
  const degradedInstances = activeInstances.filter(row => Boolean(row.lastHealthError) || ["error", "disconnected", "logged_out"].includes(row.status)).length;
  const healthyInstances = activeInstances.filter(row => ["connected", "ready", "online"].includes(row.status)).length;
  const gatewayStatus: PlatformHealthState = activeInstances.length === 0 ? "not_configured" : degradedInstances > 0 ? "degraded" : healthyInstances > 0 ? "healthy" : "unknown";
  const queueCounts = { outbound: Number(outboundRows[0]?.count ?? 0), webhooks: Number(webhookRows[0]?.count ?? 0), domainEvents: Number(domainRows[0]?.count ?? 0) };
  const queuesStatus: PlatformHealthState = queueCounts.outbound + queueCounts.webhooks + queueCounts.domainEvents > 100 ? "degraded" : "healthy";
  const storageConfigured = Boolean(process.env.BUILT_IN_FORGE_API_URL && process.env.BUILT_IN_FORGE_API_KEY);
  const privateMediaEnabled = process.env.FORTE_MEDIA_PRIVATE_STORAGE_ENABLED === "true";
  const storageStatus: PlatformHealthState = storageConfigured ? "healthy" : "not_configured";
  const providers = { active: providerRows.filter(row => row.active === 1).length, healthy: providerRows.filter(row => row.active === 1 && row.status === "validated").length, degraded: providerRows.filter(row => row.active === 1 && row.status === "error").length, pending: providerRows.filter(row => row.active === 1 && row.status === "pending").length };
  const providersStatus: PlatformHealthState = providers.degraded > 0 ? "degraded" : providers.pending > 0 ? "unknown" : providers.active === 0 ? "not_configured" : "healthy";
  const agent = { runs30d: Number(agentRows[0]?.runs ?? 0), failures30d: Number(agentRows[0]?.failures ?? 0), fallbackRuns30d: Number(agentRows[0]?.fallbackRuns ?? 0) };
  const agentStatus: PlatformHealthState = agent.runs30d === 0 ? "not_configured" : agent.failures30d > 0 ? "degraded" : "healthy";
  const statuses = [gatewayStatus, workerStale ? "stale" : worker?.lastError ? "degraded" : "healthy", queuesStatus, storageStatus, providersStatus, agentStatus];
  const overall: PlatformHealthState = statuses.includes("degraded") ? "degraded" : statuses.includes("stale") ? "stale" : statuses.includes("unknown") ? "unknown" : statuses.includes("not_configured") ? "not_configured" : "healthy";
  return { checkedAt, overall, components: { gateway: { status: gatewayStatus, configuredInstances, activeInstances: activeInstances.length, degradedInstances }, worker: { status: workerStale ? "stale" : worker?.lastError ? "degraded" : "healthy", service: "forte-panel-worker", observedAt: worker?.observedAt.toISOString() ?? null, lastError: Boolean(worker?.lastError) }, queues: { status: queuesStatus, ...queueCounts }, storage: { status: storageStatus, configured: storageConfigured, privateMediaEnabled }, providers: { status: providersStatus, ...providers }, agent: { status: agentStatus, ...agent } } };
}
export async function getPlatformSupportSnapshot() {
  const workspace = await ensurePlatformSupportWorkspace();
  const [instances, agent, services, professionals, agenda] = await Promise.all([
    listBaileysInstances(workspace.id),
    getPlatformAgentSnapshot(workspace.id),
    listServices(workspace.id, { includeInactive: true }),
    listProfessionalsDetailed(workspace.id, { includeInactive: true }),
    getAgendaSnapshot(workspace.id),
  ]);
  return {
    workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug },
    instances,
    agent,
    catalog: {
      services: services.map(service => ({
        id: service.id,
        name: service.name,
        description: service.description,
        active: service.active === 1,
        durationMinutes: service.durationMinutes,
        priceCents: service.priceCents,
        priceType: service.priceType,
      })),
      professionals: professionals.map(professional => ({
        id: professional.id,
        name: professional.name,
        specialty: professional.specialty,
        active: professional.active === 1,
        serviceIds: professional.serviceIds,
        availability: professional.availability,
      })),
    },
    agenda: {
      timezone: agenda.timezone,
      appointments: agenda.appointments.map(appointment => ({
        id: appointment.id,
        startsAt: appointment.startsAt,
        endsAt: appointment.endsAt,
        status: appointment.status,
        serviceName: appointment.serviceName,
        professionalName: appointment.professionalName,
        contactName: appointment.contactName,
      })),
    },
  };
}

export async function createPlatformSupportService(input: { platformAdminId: number; name: string; description?: string; durationMinutes?: number; priceCents?: number; priceType?: "fixed" | "starting_at" | "quote"; reason: string }) {
  const workspace = await ensurePlatformSupportWorkspace();
  const service = await createService(workspace.id, input);
  await recordPlatformAudit({ platformAdminId: input.platformAdminId, workspaceId: workspace.id, action: "support_service_created", reason: input.reason, summary: `Serviço interno ${service.name} criado`, after: { id: service.id, name: service.name } });
  return service;
}
export async function updatePlatformSupportService(input: { platformAdminId: number; serviceId: number; name?: string; description?: string | null; durationMinutes?: number; priceCents?: number; priceType?: "fixed" | "starting_at" | "quote"; active?: boolean; reason: string }) {
  const workspace = await ensurePlatformSupportWorkspace();
  const updated = await updateService(workspace.id, input.serviceId, input);
  if (!updated) throw new Error("Serviço não encontrado no workspace interno");
  await recordPlatformAudit({ platformAdminId: input.platformAdminId, workspaceId: workspace.id, action: "support_service_updated", reason: input.reason, summary: `Serviço interno ${updated.name} atualizado`, after: { id: updated.id, active: updated.active } });
  return updated;
}
export async function createPlatformSupportProfessional(input: { platformAdminId: number; name: string; specialty?: string; color?: string; reason: string }) {
  const workspace = await ensurePlatformSupportWorkspace();
  const professional = await createProfessional(workspace.id, input);
  await recordPlatformAudit({ platformAdminId: input.platformAdminId, workspaceId: workspace.id, action: "support_professional_created", reason: input.reason, summary: `Profissional interno ${professional.name} criado`, after: { id: professional.id, name: professional.name } });
  return professional;
}
export async function updatePlatformSupportProfessional(input: { platformAdminId: number; professionalId: number; name?: string; specialty?: string | null; color?: string; active?: boolean; reason: string }) {
  const workspace = await ensurePlatformSupportWorkspace();
  const updated = await updateProfessional(workspace.id, input.professionalId, input);
  if (!updated) throw new Error("Profissional não encontrado no workspace interno");
  await recordPlatformAudit({ platformAdminId: input.platformAdminId, workspaceId: workspace.id, action: "support_professional_updated", reason: input.reason, summary: `Profissional interno ${updated.name} atualizado`, after: { id: updated.id, active: updated.active } });
  return updated;
}
export async function setPlatformSupportProfessionalServices(input: { platformAdminId: number; professionalId: number; serviceIds: number[]; reason: string }) {
  const workspace = await ensurePlatformSupportWorkspace();
  const serviceIds = await setProfessionalServices(workspace.id, input.professionalId, input.serviceIds);
  await recordPlatformAudit({ platformAdminId: input.platformAdminId, workspaceId: workspace.id, action: "support_professional_services_updated", reason: input.reason, summary: `Vínculos do profissional interno ${input.professionalId} atualizados`, after: { professionalId: input.professionalId, serviceIds } });
  return { professionalId: input.professionalId, serviceIds };
}
export async function setPlatformSupportAvailability(input: { platformAdminId: number; professionalId: number; entries: { weekday: number; startMinute: number; endMinute: number }[]; reason: string }) {
  const workspace = await ensurePlatformSupportWorkspace();
  const entries = await replaceAvailability(workspace.id, input.professionalId, input.entries);
  await recordPlatformAudit({ platformAdminId: input.platformAdminId, workspaceId: workspace.id, action: "support_professional_availability_updated", reason: input.reason, summary: `Disponibilidade do profissional interno ${input.professionalId} atualizada`, after: { professionalId: input.professionalId, entries } });
  return { professionalId: input.professionalId, entries };
}
export async function createPlatformSupportAppointment(input: { platformAdminId: number; contactId?: number; serviceId: number; professionalId: number; startsAt: Date; endsAt: Date; notes?: string; reason: string }) {
  const workspace = await ensurePlatformSupportWorkspace();
  const appointment = await createAgendaAppointment(workspace.id, input);
  await recordPlatformAudit({ platformAdminId: input.platformAdminId, workspaceId: workspace.id, action: "support_appointment_created", reason: input.reason, summary: `Agendamento interno ${appointment.id} criado`, after: { id: appointment.id, startsAt: appointment.startsAt, endsAt: appointment.endsAt } });
  return { id: appointment.id, status: appointment.status };
}
export async function updatePlatformSupportAppointmentStatus(input: { platformAdminId: number; appointmentId: number; status: "confirmed" | "completed" | "no_show"; reason: string }) {
  const workspace = await ensurePlatformSupportWorkspace();
  const appointment = await updateAgendaStatus(workspace.id, input.appointmentId, input.status);
  if (!appointment) throw new Error("Agendamento não encontrado no workspace interno");
  await recordPlatformAudit({ platformAdminId: input.platformAdminId, workspaceId: workspace.id, action: `support_appointment_${input.status}`, reason: input.reason, summary: `Agendamento interno ${appointment.id} atualizado para ${input.status}` });
  return { id: appointment.id, status: appointment.status };
}
export async function reschedulePlatformSupportAppointment(input: { platformAdminId: number; appointmentId: number; startsAt: Date; endsAt: Date; reason: string }) {
  const workspace = await ensurePlatformSupportWorkspace();
  const appointment = await rescheduleAgendaAppointment(workspace.id, input.appointmentId, input.startsAt, input.endsAt);
  if (!appointment) throw new Error("Agendamento não encontrado no workspace interno");
  await recordPlatformAudit({ platformAdminId: input.platformAdminId, workspaceId: workspace.id, action: "support_appointment_rescheduled", reason: input.reason, summary: `Agendamento interno ${appointment.id} reagendado`, after: { startsAt: appointment.startsAt, endsAt: appointment.endsAt } });
  return { id: appointment.id, status: appointment.status, startsAt: appointment.startsAt, endsAt: appointment.endsAt };
}
export async function cancelPlatformSupportAppointment(input: { platformAdminId: number; appointmentId: number; reason: string }) {
  const workspace = await ensurePlatformSupportWorkspace();
  const appointment = await cancelAgendaAppointment(workspace.id, input.appointmentId);
  if (!appointment) throw new Error("Agendamento não encontrado no workspace interno");
  await recordPlatformAudit({ platformAdminId: input.platformAdminId, workspaceId: workspace.id, action: "support_appointment_cancelled", reason: input.reason, summary: `Agendamento interno ${appointment.id} cancelado` });
  return { id: appointment.id, status: appointment.status };
}
export async function listPlatformSupportContacts(
  instanceIds: readonly string[] | null = null
) {
  const workspace = await ensurePlatformSupportWorkspace();
  const contacts = await listInboxContacts(workspace.id, 0, instanceIds, true);
  return contacts.map(mapPlatformSupportContact);
}

export async function getPlatformSupportThread(
  contactId: number,
  instanceIds: readonly string[] | null = null
) {
  const workspace = await ensurePlatformSupportWorkspace();
  const contact = await getContactById(workspace.id, contactId);
  if (!contact) return null;
  const [conversation, items, audit, notes, contacts] = await Promise.all([
    getConversationByContact(workspace.id, contactId),
    listMessagesForContact(workspace.id, contactId, { instanceIds }),
    getAuditLogForContact(workspace.id, contactId),
    listContactNotes(workspace.id, contactId),
    listInboxContacts(workspace.id, 0, instanceIds, true),
  ]);
  const contactView = contacts.find(item => item.id === contactId) ?? contact;
  return {
    contact: mapPlatformSupportContact(contactView),
    conversation,
    messages: items.map(message => ({
      id: String(message.id),
      sender: message.senderType,
      text: message.content,
      messageType: message.messageType,
      metadata: message.metadata,
      time: message.createdAt.toISOString(),
      status: message.status,
    })),
    audit,
    notes,
  };
}

export async function sendPlatformSupportMessage(input: {
  platformAdminId: number;
  actorUserId: number;
  contactId: number;
  content: string;
  messageType?:
    | "text"
    | "image"
    | "audio"
    | "video"
    | "document"
    | "button"
    | "list"
    | "poll"
    | "carousel";
  metadata?: Record<string, unknown>;
  instanceIds?: readonly string[] | null;
}) {
  const workspace = await ensurePlatformSupportWorkspace();
  const contact = await getContactById(workspace.id, input.contactId);
  if (!contact) throw new Error("Contato não encontrado no Inbox de suporte");
  const instanceIds = input.instanceIds ?? [];
  if (instanceIds.length !== 1)
    throw new Error("Selecione exatamente uma instância para enviar a mensagem");
  const instance = await getBaileysInstance(workspace.id, instanceIds[0]);
  if (!instance) throw new Error("Instância de envio não encontrada");
  if (input.messageType === "button" || input.messageType === "list" || input.messageType === "poll" || input.messageType === "carousel")
    validateInteractiveMessage({
      messageType: input.messageType,
      content: input.content,
      metadata: input.metadata,
    });
  const message = await sendManualMessage(
    workspace.id,
    input.contactId,
    input.content,
    input.actorUserId,
    input.messageType ?? "text",
    {
      ...(input.metadata ?? {}),
      sentViaInstanceId: instance.instanceId,
      sentViaInstanceName: instance.name,
    },
    instanceIds
  );
  await recordPlatformAudit({
    platformAdminId: input.platformAdminId,
    workspaceId: workspace.id,
    action: "platform_support_message_sent",
    reason: "Atendimento pelo Inbox do Console Admin",
    summary: `Mensagem enviada para ${contact.name}`,
    after: { contactId: input.contactId, instanceIds, instanceName: instance.name },
  });
  return message
    ? {
        id: String(message.id),
        content: message.content,
        createdAt: message.createdAt.toISOString(),
      }
    : null;
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

export async function listPlatformGlobalAuditLogs(limit = 100) {
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
    .leftJoin(platformAdmins, eq(platformAdmins.id, platformAuditLogs.platformAdminId))
    .leftJoin(users, eq(users.id, platformAdmins.userId))
    .where(isNull(platformAuditLogs.workspaceId))
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
  const workspace = await getActiveWorkspaceById(input.workspaceId);
  const next = draftToSafeConfig(current, {
    ...input.draft,
    enabled: isPlatformSupportWorkspace(workspace) ? false : input.draft.enabled,
  });
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
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const snapshot = await getPlatformAgentSnapshot(input.workspaceId);
  if (snapshot.draft) {
    const latestSimulation = (
      await db
        .select({ createdAt: agentSimulationRuns.createdAt })
        .from(agentSimulationRuns)
        .where(
          and(
            eq(agentSimulationRuns.workspaceId, input.workspaceId),
            eq(agentSimulationRuns.draftId, snapshot.draft.id),
            eq(agentSimulationRuns.status, "completed")
          )
        )
        .orderBy(desc(agentSimulationRuns.createdAt), desc(agentSimulationRuns.id))
        .limit(1)
    )[0];
    if (!latestSimulation || latestSimulation.createdAt < new Date(snapshot.draft.updatedAt)) {
      throw new Error("Execute uma simulação concluída depois do último salvamento do rascunho antes de publicar");
    }
  }
  const config = snapshot.draft?.config ?? snapshot.current;
  const workspace = await getActiveWorkspaceById(input.workspaceId);
  return publishVersion({
    ...input,
    config: isPlatformSupportWorkspace(workspace) ? { ...config, enabled: false } : config,
  });
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
    mode: "simulation_only" as const,
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

export async function getPlatformWorkspaceGovernance(workspaceId: number) {
  const db = await getDb();
  if (!db) return null;
  const workspace = (await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1))[0];
  if (!workspace) return null;
  const [usage, onboarding] = await Promise.all([getWorkspaceUsageSnapshot(workspaceId), getOnboardingGovernance(workspaceId)]);
  const usageRetentionRaw = Number(process.env.FORTE_USAGE_RETENTION_DAYS ?? 30);
  const usageRetentionDays = Number.isFinite(usageRetentionRaw) ? Math.max(1, Math.min(Math.floor(usageRetentionRaw), 365)) : 30;
  return {
    workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug, plan: workspace.plan, status: workspace.status, active: workspace.active === 1 },
    quotas: { plan: usage.plan, bucketStart: usage.bucketStart.toISOString(), resetsAt: usage.resetsAt.toISOString(), workspace: usage.workspace, users: usage.users },
    retention: { usageDays: usageRetentionDays, onboarding: onboarding.retention, policyVersion: onboarding.policyVersion },
    billing: buildSaaSBillingBoundary(workspace.plan, usage.workspace),
  };
}
export async function setPlatformWorkspaceRetention(input: { platformAdminId: number; workspaceId: number; supportSessionId: number; rawArtifactDays: number; derivedDataDays: number; reason: string }) {
  const session = await getActiveSupportSession({ platformAdminId: input.platformAdminId, workspaceId: input.workspaceId, sessionId: input.supportSessionId, requireOperator: true });
  if (!session) throw new Error("Sessão operadora ausente, expirada, revogada ou fora do workspace");
  const before = await getOnboardingGovernance(input.workspaceId);
  const after = await saveOnboardingRetentionPolicy(input.workspaceId, input.platformAdminId, { rawArtifactDays: input.rawArtifactDays, derivedDataDays: input.derivedDataDays });
  await recordPlatformAudit({ platformAdminId: input.platformAdminId, workspaceId: input.workspaceId, supportSessionId: input.supportSessionId, action: "workspace_retention_policy_changed", reason: input.reason, summary: "Política de retenção do onboarding atualizada", before: { retention: before.retention }, after: { retention: after.retention } });
  return after;
}
export async function setPlatformWorkspaceStatus(input: {
  platformAdminId: number;
  workspaceId: number;
  supportSessionId: number;
  status: WorkspaceStatus;
  reason: string;
}) {
  const session = await getActiveSupportSession({
    platformAdminId: input.platformAdminId,
    workspaceId: input.workspaceId,
    sessionId: input.supportSessionId,
    requireOperator: true,
  });
  if (!session) throw new Error("Sessão operadora ausente, expirada, revogada ou fora do workspace");
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
  if (workspace.slug === PLATFORM_SUPPORT_WORKSPACE_SLUG)
    throw new Error("O workspace interno do Console Admin não pode ser movido pelo Kanban");
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
    supportSessionId: session.id,
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

export async function setPlatformWorkspacePlan(input: {
  platformAdminId: number;
  workspaceId: number;
  supportSessionId: number;
  plan: "starter" | "pro" | "business";
  reason: string;
}) {
  const session = await getActiveSupportSession({
    platformAdminId: input.platformAdminId,
    workspaceId: input.workspaceId,
    sessionId: input.supportSessionId,
    requireOperator: true,
  });
  if (!session) throw new Error("Sessão operadora ausente, expirada, revogada ou fora do workspace");
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const workspace = (await db.select().from(workspaces).where(eq(workspaces.id, input.workspaceId)).limit(1))[0];
  if (!workspace) throw new Error("Workspace não encontrado");
  const updated = (await db.update(workspaces).set({ plan: input.plan, updatedAt: new Date() }).where(eq(workspaces.id, input.workspaceId)).returning())[0];
  await recordPlatformAudit({ platformAdminId: input.platformAdminId, workspaceId: input.workspaceId, supportSessionId: session.id, action: "workspace_plan_changed", reason: input.reason, summary: `Plano alterado de ${workspace.plan} para ${input.plan}`, before: { plan: workspace.plan }, after: { plan: updated.plan } });
  return { id: updated.id, plan: updated.plan };
}

export async function listPlatformSupportTickets(workspaceId?: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(platformSupportTickets)
    .where(workspaceId ? eq(platformSupportTickets.workspaceId, workspaceId) : undefined)
    .orderBy(desc(platformSupportTickets.createdAt), desc(platformSupportTickets.id)).limit(100);
}
export async function openPlatformSupportTicket(input: { platformAdminId: number; workspaceId: number; supportSessionId: number; priority: "low" | "normal" | "high" | "urgent"; subject: string; description: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const session = await getActiveSupportSession({ platformAdminId: input.platformAdminId, workspaceId: input.workspaceId, sessionId: input.supportSessionId });
  if (!session) throw new Error("Sessão de suporte ausente, expirada, revogada ou fora do workspace");
  const ticket = (await db.insert(platformSupportTickets).values({ workspaceId: input.workspaceId, supportSessionId: input.supportSessionId, openedByPlatformAdminId: input.platformAdminId, priority: input.priority, subject: input.subject.trim(), description: input.description.trim(), status: "open" }).returning())[0];
  if (!ticket) throw new Error("Não foi possível abrir o ticket");
  await recordPlatformAudit({ platformAdminId: input.platformAdminId, workspaceId: input.workspaceId, supportSessionId: input.supportSessionId, action: "support_ticket_opened", reason: input.subject, summary: `Ticket #${ticket.id} aberto: ${ticket.subject}`, after: { ticketId: ticket.id, priority: ticket.priority, status: ticket.status } });
  return ticket;
}
export async function closePlatformSupportTicket(input: { platformAdminId: number; ticketId: number; supportSessionId: number; resolution: string; reason: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const current = (await db.select().from(platformSupportTickets).where(and(eq(platformSupportTickets.id, input.ticketId), eq(platformSupportTickets.supportSessionId, input.supportSessionId))).limit(1))[0];
  if (!current) throw new Error("Ticket não encontrado nesta sessão de suporte");
  const session = await getActiveSupportSession({ platformAdminId: input.platformAdminId, workspaceId: current.workspaceId, sessionId: input.supportSessionId, requireOperator: true });
  if (!session) throw new Error("Sessão operadora ausente, expirada, revogada ou fora do workspace");
  const ticket = (await db.update(platformSupportTickets).set({ status: "closed", resolution: input.resolution.trim(), closedAt: new Date(), closedByPlatformAdminId: input.platformAdminId, updatedAt: new Date() }).where(and(eq(platformSupportTickets.id, current.id), eq(platformSupportTickets.status, "open"))).returning())[0];
  if (!ticket) throw new Error("Ticket já está fechado");
  await recordPlatformAudit({ platformAdminId: input.platformAdminId, workspaceId: current.workspaceId, supportSessionId: input.supportSessionId, action: "support_ticket_closed", reason: input.reason, summary: `Ticket #${ticket.id} fechado`, before: { status: current.status }, after: { status: ticket.status, resolutionLength: ticket.resolution?.length ?? 0 } });
  return ticket;
}
export async function listPlatformIncidents(workspaceId?: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(platformIncidents).where(workspaceId ? eq(platformIncidents.workspaceId, workspaceId) : undefined).orderBy(desc(platformIncidents.createdAt), desc(platformIncidents.id)).limit(100);
}

export async function getPlatformIncidentWorkspaceId(incidentId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const incident = (await db
    .select({ workspaceId: platformIncidents.workspaceId })
    .from(platformIncidents)
    .where(eq(platformIncidents.id, incidentId))
    .limit(1))[0];
  return incident?.workspaceId ?? null;
}

export async function openPlatformIncident(input: { platformAdminId: number; workspaceId: number; supportSessionId: number; severity: "low" | "medium" | "high" | "critical"; title: string; details: string }) {
  const session = await getActiveSupportSession({ platformAdminId: input.platformAdminId, workspaceId: input.workspaceId, sessionId: input.supportSessionId, requireOperator: true });
  if (!session) throw new Error("Sessão operadora ausente, expirada, revogada ou fora do workspace");
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const incident = (await db.insert(platformIncidents).values({ workspaceId: input.workspaceId, severity: input.severity, title: input.title, details: input.details, openedByPlatformAdminId: input.platformAdminId }).returning())[0];
  await recordPlatformAudit({ platformAdminId: input.platformAdminId, workspaceId: input.workspaceId, supportSessionId: session.id, action: "workspace_incident_opened", reason: input.title, summary: `${input.severity}: ${input.title}`, after: { incidentId: incident.id, status: incident.status } });
  return incident;
}

export async function resolvePlatformIncident(input: { platformAdminId: number; incidentId: number; supportSessionId: number; reason: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const current = (await db.select().from(platformIncidents).where(eq(platformIncidents.id, input.incidentId)).limit(1))[0];
  if (!current) throw new Error("Incidente não encontrado");
  const session = await getActiveSupportSession({ platformAdminId: input.platformAdminId, workspaceId: current.workspaceId, sessionId: input.supportSessionId, requireOperator: true });
  if (!session) throw new Error("Sessão operadora ausente, expirada, revogada ou fora do workspace");
  const incident = (await db.update(platformIncidents).set({ status: "resolved", resolvedByPlatformAdminId: input.platformAdminId, resolvedAt: new Date(), updatedAt: new Date() }).where(eq(platformIncidents.id, input.incidentId)).returning())[0];
  await recordPlatformAudit({ platformAdminId: input.platformAdminId, workspaceId: current.workspaceId, supportSessionId: session.id, action: "workspace_incident_resolved", reason: input.reason, summary: `Incidente #${current.id} resolvido`, before: { status: current.status }, after: { status: incident.status } });
  return incident;
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
    incidents,
    tickets,
  ] = await Promise.all([
    workspaceListItem(workspace),
    getWorkspaceMembersForPlatform(workspaceId),
    listBaileysInstances(workspaceId),
    listPlatformWorkspaceNotes(workspaceId),
    listPlatformAuditLogs(workspaceId),
    listWorkspaceAuditSafe(workspaceId),
    getPlatformAgentSnapshot(workspaceId),
    listPlatformIncidents(workspaceId),
    listPlatformSupportTickets(workspaceId),
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
    incidents,
    tickets,
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
