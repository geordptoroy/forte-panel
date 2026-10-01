import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { servicePriceTypes } from "../shared/service-price";
export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);
export const operationalRoleEnum = pgEnum("operational_role", [
  "human_attendant",
  "ai_attendant",
  "professional",
]);
export const workspacePlanEnum = pgEnum("workspace_plan", [
  "starter",
  "pro",
  "business",
]);
export const workspaceMemberRoleEnum = pgEnum("workspace_member_role", [
  "owner",
  "admin",
  "manager",
  "agent",
]);
export const workspaceInviteStatusEnum = pgEnum("workspace_invite_status", [
  "pending",
  "sent",
  "accepted",
  "expired",
  "revoked",
  "replaced",
]);
export const whatsappProviderEnum = pgEnum("whatsapp_provider", [
  "baileys",
]);
export const workspaceStatusEnum = pgEnum("workspace_status", [
  "onboarding",
  "active",
  "suspended",
]);
export const platformPermissionEnum = pgEnum("platform_permission", [
  "platform_admin",
  "platform_support_readonly",
  "platform_support_operator",
]);
export const supportSessionModeEnum = pgEnum("support_session_mode", [
  "read_only",
  "operator",
]);
export const supportSessionStatusEnum = pgEnum("support_session_status", [
  "active",
  "expired",
  "revoked",
]);
export const agentPromptStatusEnum = pgEnum("agent_prompt_status", [
  "draft",
  "published",
  "archived",
]);
export const agentSimulationStatusEnum = pgEnum("agent_simulation_status", [
  "queued",
  "completed",
  "failed",
]);
export const platformAuditResultEnum = pgEnum("platform_audit_result", [
  "success",
  "failure",
]);
export const platformAiConnectionCapabilityEnum = pgEnum(
  "platform_ai_connection_capability",
  [
    "whatsapp_reply",
    "audio_transcription",
    "image_analysis",
    "document_analysis",
    "admin_support",
  ]
);
export const workerHeartbeatStatusEnum = pgEnum("worker_heartbeat_status", [
  "healthy",
  "degraded",
]);
export const webhookStatusEnum = pgEnum("webhook_status", [
  "received",
  "processed",
  "failed",
]);
export const domainEventStatusEnum = pgEnum("domain_event_status", [
  "pending",
  "processing",
  "delivered",
  "failed",
]);
export const urgencyEnum = pgEnum("urgency", [
  "Baixa",
  "Média",
  "Alta",
  "Crítica",
]);
export const noteAuthorTypeEnum = pgEnum("note_author_type", [
  "human",
  "ai",
  "system",
]);
export const conversationStatusEnum = pgEnum("conversation_status", [
  "open",
  "resolved",
]);
export const messageDirectionEnum = pgEnum("message_direction", [
  "inbound",
  "outbound",
  "system",
]);
export const messageSenderTypeEnum = pgEnum("message_sender_type", [
  "lead",
  "ai",
  "human",
  "system",
]);
export const messageTypeEnum = pgEnum("message_type", [
  "text",
  "image",
  "audio",
  "video",
  "document",
  "button",
  "sticker",
  "location",
  "contact",
  "poll",
  "list",
  "carousel",
  "react",
  "album",
  "event",
]);
export const messageStatusEnum = pgEnum("message_status", [
  "received",
  "queued",
  "processing",
  "sent",
  "failed",
]);
export const appointmentStatusEnum = pgEnum("appointment_status", [
  "requested",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
]);
export const quoteStatusEnum = pgEnum("quote_status", [
  "orcamento",
  "aguardando_aprovacao",
  "aprovado",
  "sinal_pendente",
  "parcialmente_pago",
  "pago",
  "cancelado",
]);
export const quoteApprovalStatusEnum = pgEnum("quote_approval_status", [
  "draft",
  "pending",
  "approved",
  "rejected",
  "expired",
]);
export const quotePaymentStatusEnum = pgEnum("quote_payment_status", [
  "unpaid",
  "partially_paid",
  "paid",
  "cancelled",
]);
export const servicePriceTypeEnum = pgEnum("service_price_type", servicePriceTypes);

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    openId: varchar("openId", { length: 64 }).notNull().unique(),
    name: text("name"),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 32 }),
    loginMethod: varchar("loginMethod", { length: 64 }),
    role: userRoleEnum("role").default("user").notNull(),
    passwordHash: text("passwordHash"),
    operationalRole: operationalRoleEnum("operationalRole"),
    sessionVersion: integer("sessionVersion").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
    lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("users_single_admin_idx")
      .on(table.role)
      .where(sql`${table.role} = 'admin'`),
  ]
);

export const consentRecords = pgTable(
  "consentRecords",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    workspaceId: integer("workspaceId").notNull(),
    termsVersion: varchar("termsVersion", { length: 64 }).notNull(),
    privacyVersion: varchar("privacyVersion", { length: 64 }).notNull(),
    acceptedAt: timestamp("acceptedAt").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("consent_records_user_idx").on(table.userId, table.createdAt),
    index("consent_records_workspace_idx").on(
      table.workspaceId,
      table.createdAt
    ),
  ]
);

export const passwordResetTokens = pgTable(
  "passwordResetTokens",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expiresAt").notNull(),
    usedAt: timestamp("usedAt"),
    revokedAt: timestamp("revokedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("password_reset_tokens_user_idx").on(table.userId, table.createdAt),
    index("password_reset_tokens_expiry_idx").on(
      table.expiresAt,
      table.usedAt,
      table.revokedAt
    ),
  ]
);

export const onboardingSessions = pgTable(
  "onboardingSessions",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspaceId").notNull().unique(),
    ownerUserId: integer("ownerUserId").notNull(),
    status: varchar("status", { length: 24 }).notNull().default("active"),
    currentStep: varchar("currentStep", { length: 80 }).notNull().default("identity"),
    startedAt: timestamp("startedAt").defaultNow().notNull(),
    lastActivityAt: timestamp("lastActivityAt").defaultNow().notNull(),
    pausedAt: timestamp("pausedAt"),
    completedAt: timestamp("completedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [
    index("onboarding_sessions_status_idx").on(table.status, table.lastActivityAt),
  ]
);

export const onboardingStepAnswers = pgTable(
  "onboardingStepAnswers",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("sessionId").notNull(),
    workspaceId: integer("workspaceId").notNull(),
    stepKey: varchar("stepKey", { length: 80 }).notNull(),
    answer: text("answer").notNull(),
    source: varchar("source", { length: 24 }).notNull().default("human_form"),
    confidence: integer("confidence"),
    missing: text("missing").notNull().default("[]"),
    conflicts: text("conflicts").notNull().default("[]"),
    status: varchar("status", { length: 24 }).notNull().default("draft"),
    updatedBy: integer("updatedBy"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("onboarding_step_answers_session_step_idx").on(
      table.sessionId,
      table.stepKey
    ),
    index("onboarding_step_answers_workspace_idx").on(
      table.workspaceId,
      table.updatedAt
    ),
  ]
);

export const onboardingStepAnswerRevisions = pgTable(
  "onboardingStepAnswerRevisions",
  {
    id: serial("id").primaryKey(),
    answerId: integer("answerId").notNull(),
    sessionId: integer("sessionId").notNull(),
    workspaceId: integer("workspaceId").notNull(),
    stepKey: varchar("stepKey", { length: 80 }).notNull(),
    answer: text("answer").notNull(),
    source: varchar("source", { length: 24 }).notNull().default("human_form"),
    confidence: integer("confidence"),
    missing: text("missing").notNull().default("[]"),
    conflicts: text("conflicts").notNull().default("[]"),
    status: varchar("status", { length: 24 }).notNull().default("draft"),
    changedBy: integer("changedBy"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("onboarding_step_answer_revisions_answer_idx").on(
      table.answerId,
      table.createdAt
    ),
    index("onboarding_step_answer_revisions_workspace_idx").on(
      table.workspaceId,
      table.stepKey,
      table.createdAt
    ),
  ]
);

export const onboardingConflictResolutions = pgTable(
  "onboardingConflictResolutions",
  {
    id: serial("id").primaryKey(),
    answerId: integer("answerId").notNull(),
    sessionId: integer("sessionId").notNull(),
    workspaceId: integer("workspaceId").notNull(),
    stepKey: varchar("stepKey", { length: 80 }).notNull(),
    conflictKey: varchar("conflictKey", { length: 160 }).notNull(),
    resolution: varchar("resolution", { length: 32 }).notNull(),
    note: text("note").notNull(),
    answerSnapshot: text("answerSnapshot").notNull(),
    resolvedBy: integer("resolvedBy").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("onboarding_conflict_resolutions_answer_idx").on(
      table.answerId,
      table.createdAt
    ),
    index("onboarding_conflict_resolutions_workspace_idx").on(
      table.workspaceId,
      table.stepKey,
      table.createdAt
    ),
  ]
);

export const onboardingSourceConsents = pgTable(
  "onboardingSourceConsents",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspaceId").notNull(),
    userId: integer("userId").notNull(),
    source: varchar("source", { length: 24 }).notNull(),
    purpose: varchar("purpose", { length: 80 }).notNull(),
    policyVersion: varchar("policyVersion", { length: 64 }).notNull(),
    status: varchar("status", { length: 16 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("onboarding_source_consents_workspace_idx").on(
      table.workspaceId,
      table.source,
      table.createdAt
    ),
  ]
);

export const onboardingRetentionPolicies = pgTable(
  "onboardingRetentionPolicies",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspaceId").notNull().unique(),
    rawArtifactDays: integer("rawArtifactDays").notNull().default(30),
    derivedDataDays: integer("derivedDataDays").notNull().default(180),
    policyVersion: varchar("policyVersion", { length: 64 }).notNull(),
    updatedBy: integer("updatedBy").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [
    index("onboarding_retention_policies_workspace_idx").on(table.workspaceId),
  ],
);

export const onboardingAudioAssets = pgTable(
  "onboardingAudioAssets",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("sessionId").notNull(),
    workspaceId: integer("workspaceId").notNull(),
    stepKey: varchar("stepKey", { length: 80 }).notNull(),
    storageKey: varchar("storageKey", { length: 512 }).notNull().unique(),
    mimeType: varchar("mimeType", { length: 120 }).notNull(),
    sizeBytes: integer("sizeBytes").notNull(),
    durationMs: integer("durationMs"),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    transcriptStatus: varchar("transcriptStatus", { length: 24 }).notNull().default("uploaded"),
    expiresAt: timestamp("expiresAt").notNull(),
    createdByUserId: integer("createdByUserId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("onboarding_audio_assets_session_hash_idx").on(
      table.sessionId,
      table.sha256
    ),
    index("onboarding_audio_assets_workspace_idx").on(
      table.workspaceId,
      table.createdAt
    ),
    index("onboarding_audio_assets_session_idx").on(
      table.sessionId,
      table.stepKey,
      table.createdAt
    ),
  ]
);

export const onboardingTranscriptions = pgTable(
  "onboardingTranscriptions",
  {
    id: serial("id").primaryKey(),
    assetId: integer("assetId").notNull().unique(),
    sessionId: integer("sessionId").notNull(),
    workspaceId: integer("workspaceId").notNull(),
    status: varchar("status", { length: 24 }).notNull().default("pending"),
    provider: varchar("provider", { length: 80 }),
    model: varchar("model", { length: 80 }),
    language: varchar("language", { length: 16 }),
    text: text("text"),
    segments: jsonb("segments").$type<unknown[]>(),
    errorCode: varchar("errorCode", { length: 48 }),
    retryCount: integer("retryCount").notNull().default(0),
    completedAt: timestamp("completedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [
    index("onboarding_transcriptions_workspace_idx").on(
      table.workspaceId,
      table.createdAt
    ),
    index("onboarding_transcriptions_asset_idx").on(table.assetId),
  ]
);

export const onboardingTelemetryEvents = pgTable(
  "onboardingTelemetryEvents",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspaceId").notNull(),
    sessionId: integer("sessionId").notNull(),
    eventType: varchar("eventType", { length: 64 }).notNull(),
    stepKey: varchar("stepKey", { length: 80 }),
    source: varchar("source", { length: 24 }),
    durationMs: integer("durationMs"),
    inputTokens: integer("inputTokens"),
    outputTokens: integer("outputTokens"),
    totalTokens: integer("totalTokens"),
    correction: integer("correction").default(0).notNull(),
    metadata: jsonb("metadata").$type<Record<string, string | number | boolean | null>>(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("onboarding_telemetry_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt
    ),
    index("onboarding_telemetry_session_event_idx").on(
      table.sessionId,
      table.eventType,
      table.createdAt
    ),
  ]
);

export const onboardingPublishedVersions = pgTable(
  "onboardingPublishedVersions",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspaceId").notNull(),
    version: integer("version").notNull(),
    profile: text("profile").notNull(),
    prompt: text("prompt").notNull(),
    publishedBy: integer("publishedBy").notNull(),
    rollbackOfId: integer("rollbackOfId"),
    publishedAt: timestamp("publishedAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("onboarding_published_versions_workspace_version_idx").on(
      table.workspaceId,
      table.version
    ),
    index("onboarding_published_versions_workspace_published_idx").on(
      table.workspaceId,
      table.publishedAt
    ),
  ]
);

export const workspaces = pgTable("workspaces", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  segment: varchar("segment", { length: 80 }).default("servicos").notNull(),
  plan: workspacePlanEnum("plan").default("starter").notNull(),
  timezone: varchar("timezone", { length: 64 })
    .default("America/Sao_Paulo")
    .notNull(),
  status: workspaceStatusEnum("status").default("active").notNull(),
  active: integer("active").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const platformIncidents = pgTable(
  "platformIncidents",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspaceId").notNull(),
    severity: varchar("severity", { length: 20 }).default("medium").notNull(),
    status: varchar("status", { length: 20 }).default("open").notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    details: text("details").notNull(),
    openedByPlatformAdminId: integer("openedByPlatformAdminId").notNull(),
    resolvedByPlatformAdminId: integer("resolvedByPlatformAdminId"),
    resolvedAt: timestamp("resolvedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [
    index("platform_incidents_workspace_status_idx").on(table.workspaceId, table.status, table.createdAt),
  ]
);

/** Platform operators are intentionally separate from workspace roles. */
export const platformSupportTickets = pgTable(
  "platformSupportTickets",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspaceId").notNull(),
    supportSessionId: integer("supportSessionId").notNull(),
    openedByPlatformAdminId: integer("openedByPlatformAdminId").notNull(),
    assignedToPlatformAdminId: integer("assignedToPlatformAdminId"),
    status: varchar("status", { length: 20 }).default("open").notNull(),
    priority: varchar("priority", { length: 20 }).default("normal").notNull(),
    subject: varchar("subject", { length: 180 }).notNull(),
    description: text("description").notNull(),
    resolution: text("resolution"),
    closedAt: timestamp("closedAt"),
    closedByPlatformAdminId: integer("closedByPlatformAdminId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [
    index("platform_support_tickets_workspace_status_idx").on(table.workspaceId, table.status, table.createdAt),
    index("platform_support_tickets_session_idx").on(table.supportSessionId, table.createdAt),
  ]
);
/** Platform operators are intentionally separate from workspace roles. */
export const platformAdmins = pgTable(
  "platformAdmins",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    permission: platformPermissionEnum("permission")
      .default("platform_admin")
      .notNull(),
    active: integer("active").default(1).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("platform_admins_user_unique_idx").on(table.userId),
    index("platform_admins_active_idx").on(table.active, table.permission),
  ]
);

export const supportSessions = pgTable(
  "supportSessions",
  {
    id: serial("id").primaryKey(),
    platformAdminId: integer("platformAdminId").notNull(),
    workspaceId: integer("workspaceId").notNull(),
    mode: supportSessionModeEnum("mode").default("read_only").notNull(),
    status: supportSessionStatusEnum("status").default("active").notNull(),
    scope: varchar("scope", { length: 80 }).default("workspace").notNull(),
    reason: varchar("reason", { length: 500 }).notNull(),
    startedAt: timestamp("startedAt").defaultNow().notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    revokedAt: timestamp("revokedAt"),
    revokedByUserId: integer("revokedByUserId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [
    index("support_sessions_workspace_status_idx").on(
      table.workspaceId,
      table.status,
      table.expiresAt
    ),
    index("support_sessions_admin_idx").on(
      table.platformAdminId,
      table.status,
      table.expiresAt
    ),
  ]
);

export const agentPromptVersions = pgTable(
  "agentPromptVersions",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspaceId").notNull(),
    version: integer("version").notNull(),
    status: agentPromptStatusEnum("status").default("published").notNull(),
    prompt: text("prompt").notNull(),
    configuration: text("configuration").notNull(),
    reason: varchar("reason", { length: 500 }).notNull(),
    createdByPlatformAdminId: integer("createdByPlatformAdminId").notNull(),
    rollbackOfId: integer("rollbackOfId"),
    publishedAt: timestamp("publishedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("agent_prompt_versions_workspace_version_unique_idx").on(
      table.workspaceId,
      table.version
    ),
    index("agent_prompt_versions_workspace_status_idx").on(
      table.workspaceId,
      table.status,
      table.version
    ),
  ]
);

export const agentPromptDrafts = pgTable(
  "agentPromptDrafts",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspaceId").notNull(),
    status: agentPromptStatusEnum("status").default("draft").notNull(),
    prompt: text("prompt").notNull(),
    configuration: text("configuration").notNull(),
    createdByPlatformAdminId: integer("createdByPlatformAdminId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("agent_prompt_drafts_workspace_unique_idx").on(
      table.workspaceId
    ),
    index("agent_prompt_drafts_status_idx").on(table.status, table.updatedAt),
  ]
);

export const agentSimulationRuns = pgTable(
  "agentSimulationRuns",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspaceId").notNull(),
    platformAdminId: integer("platformAdminId").notNull(),
    draftId: integer("draftId"),
    versionId: integer("versionId"),
    status: agentSimulationStatusEnum("status").default("queued").notNull(),
    input: text("input").notNull(),
    output: text("output"),
    providerCalled: integer("providerCalled").default(0).notNull(),
    error: text("error"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [
    index("agent_simulation_runs_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt
    ),
  ]
);

export const platformAuditLogs = pgTable(
  "platformAuditLogs",
  {
    id: serial("id").primaryKey(),
    platformAdminId: integer("platformAdminId").notNull(),
    workspaceId: integer("workspaceId"),
    supportSessionId: integer("supportSessionId"),
    action: varchar("action", { length: 120 }).notNull(),
    scope: varchar("scope", { length: 120 }).notNull(),
    reason: varchar("reason", { length: 500 }).notNull(),
    summary: varchar("summary", { length: 500 }).notNull(),
    beforeData: text("beforeData"),
    afterData: text("afterData"),
    result: platformAuditResultEnum("result").default("success").notNull(),
    requestId: varchar("requestId", { length: 160 }),
    ipAddress: varchar("ipAddress", { length: 64 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("platform_audit_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt,
      table.id
    ),
    index("platform_audit_admin_created_idx").on(
      table.platformAdminId,
      table.createdAt,
      table.id
    ),
  ]
);

export const platformWorkspaceNotes = pgTable(
  "platformWorkspaceNotes",
  {
    id: serial("id").primaryKey(),
    platformAdminId: integer("platformAdminId").notNull(),
    workspaceId: integer("workspaceId").notNull(),
    supportSessionId: integer("supportSessionId").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [
    index("platform_workspace_notes_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt,
      table.id
    ),
  ]
);

export const workerHeartbeats = pgTable(
  "workerHeartbeats",
  {
    id: serial("id").primaryKey(),
    service: varchar("service", { length: 120 }).notNull(),
    status: workerHeartbeatStatusEnum("status").default("healthy").notNull(),
    ticks: integer("ticks").default(0).notNull(),
    intervalMs: integer("intervalMs").notNull(),
    lastError: varchar("lastError", { length: 180 }),
    observedAt: timestamp("observedAt").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("worker_heartbeats_service_unique_idx").on(table.service),
    index("worker_heartbeats_observed_idx").on(table.observedAt),
  ]
);

export const workspaceMembers = pgTable(
  "workspaceMembers",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspaceId").notNull(),
    userId: integer("userId").notNull(),
    role: workspaceMemberRoleEnum("role").default("agent").notNull(),
    jobTitle: varchar("jobTitle", { length: 160 }),
    professionalId: integer("professionalId"),
    canRegisterPayments: integer("canRegisterPayments").default(0).notNull(),
    active: integer("active").default(1).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("workspace_members_unique_idx").on(
      table.workspaceId,
      table.userId
    ),
    index("workspace_members_professional_idx").on(
      table.workspaceId,
      table.professionalId
    ),
  ]
);
export const workspaceInvites = pgTable(
  "workspaceInvites",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspaceId").notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    inviteeName: varchar("inviteeName", { length: 160 }),
    role: workspaceMemberRoleEnum("role").default("agent").notNull(),
    operationalRole: operationalRoleEnum("operationalRole")
      .default("human_attendant")
      .notNull(),
    jobTitle: varchar("jobTitle", { length: 160 }),
    professionalId: integer("professionalId"),
    canRegisterPayments: integer("canRegisterPayments").default(0).notNull(),
    scope: varchar("scope", { length: 80 }).default("workspace").notNull(),
    tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(),
    status: workspaceInviteStatusEnum("status").default("pending").notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    invitedByUserId: integer("invitedByUserId").notNull(),
    acceptedByUserId: integer("acceptedByUserId"),
    acceptedAt: timestamp("acceptedAt"),
    revokedAt: timestamp("revokedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("workspace_invites_pending_email_unique_idx")
      .on(table.workspaceId, table.email)
      .where(sql`${table.status} IN ('pending', 'sent')`),
    index("workspace_invites_workspace_status_idx").on(
      table.workspaceId,
      table.status,
      table.expiresAt
    ),
  ]
);

export const workspaceSettings = pgTable("workspaceSettings", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull(),
  key: varchar("key", { length: 100 }).notNull(),
  value: text("value"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export const platformAiConnections = pgTable(
  "platformAiConnections",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    capability: platformAiConnectionCapabilityEnum("capability").notNull(),
    provider: varchar("provider", { length: 80 }).notNull(),
    baseUrl: varchar("baseUrl", { length: 500 }).notNull(),
    model: varchar("model", { length: 200 }).notNull(),
    encryptedApiKey: text("encryptedApiKey").notNull(),
    active: integer("active").default(1).notNull(),
    status: varchar("status", { length: 40 }).default("pending").notNull(),
    lastTestedAt: timestamp("lastTestedAt"),
    lastError: text("lastError"),
    createdBy: integer("createdBy"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [
    index("platform_ai_connections_capability_idx").on(table.capability, table.active),
    uniqueIndex("platform_ai_connections_name_unique_idx").on(table.name),
    uniqueIndex("platform_ai_connections_active_capability_unique_idx")
      .on(table.capability)
      .where(sql`${table.active} = 1`),
  ]
);
export const workspaceUsageBuckets = pgTable(
  "workspaceUsageBuckets",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspaceId").notNull(),
    bucketStart: timestamp("bucketStart").notNull(),
    apiRequests: integer("apiRequests").default(0).notNull(),
    aiRequests: integer("aiRequests").default(0).notNull(),
    outboundMessages: integer("outboundMessages").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("workspace_usage_buckets_unique_idx").on(
      table.workspaceId,
      table.bucketStart
    ),
    index("workspace_usage_buckets_created_idx").on(table.createdAt),
  ]
);

export const workspaceUserUsageBuckets = pgTable(
  "workspaceUserUsageBuckets",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspaceId").notNull(),
    userId: integer("userId").notNull(),
    bucketStart: timestamp("bucketStart").notNull(),
    apiRequests: integer("apiRequests").default(0).notNull(),
    aiRequests: integer("aiRequests").default(0).notNull(),
    outboundMessages: integer("outboundMessages").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("workspace_user_usage_buckets_unique_idx").on(
      table.workspaceId,
      table.userId,
      table.bucketStart
    ),
    index("workspace_user_usage_buckets_created_idx").on(table.createdAt),
  ]
);

export const whatsappChannels = pgTable(
  "whatsappChannels",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspaceId").notNull(),
    provider: whatsappProviderEnum("provider").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    phoneNumber: varchar("phoneNumber", { length: 32 }),
    phoneNumberId: varchar("phoneNumberId", { length: 100 }),
    credentialsRef: varchar("credentialsRef", { length: 160 }),
    active: integer("active").default(1).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [
    check(
      "whatsapp_channels_operational_provider_check",
      sql`${table.provider} = 'baileys'`
    ),
  ]
);

export const whatsappInstances = pgTable(
  "whatsappInstances",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspaceId").notNull(),
    channelId: integer("channelId"),
    provider: whatsappProviderEnum("provider").default("baileys").notNull(),
    deployment: varchar("deployment", { length: 32 })
      .default("self_hosted")
      .notNull(),
    instanceId: varchar("instanceId", { length: 160 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    encryptedApiKey: text("encryptedApiKey"),
    webhookId: varchar("webhookId", { length: 120 }),
    encryptedWebhookSecret: text("encryptedWebhookSecret"),
    status: varchar("status", { length: 40 }).default("unknown").notNull(),
    active: integer("active").default(1).notNull(),
    isDefault: integer("isDefault").default(0).notNull(),
    lastHealthError: text("lastHealthError"),
    lastSeenAt: timestamp("lastSeenAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("whatsapp_instances_workspace_instance_unique_idx").on(
      table.workspaceId,
      table.instanceId
    ),
    uniqueIndex("whatsapp_instances_baileys_instance_global_unique_idx")
      .on(table.instanceId)
      .where(sql`${table.provider} = 'baileys'`),
    uniqueIndex("whatsapp_instances_baileys_workspace_default_unique_idx")
      .on(table.workspaceId)
      .where(
        sql`${table.provider} = 'baileys' AND ${table.active} = 1 AND ${table.isDefault} = 1`
      ),
    index("whatsapp_instances_workspace_idx").on(
      table.workspaceId,
      table.active,
      table.isDefault
    ),
    check(
      "whatsapp_instances_operational_provider_check",
      sql`${table.provider} = 'baileys'`
    ),
  ]
);

export const apiIdempotency = pgTable(
  "apiIdempotency",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspaceId").notNull(),
    key: varchar("key", { length: 180 }).notNull(),
    fingerprint: varchar("fingerprint", { length: 128 }).notNull(),
    status: varchar("status", { length: 20 }).default("completed").notNull(),
    statusCode: integer("statusCode").default(200).notNull(),
    responseBody: text("responseBody"),
    leaseUntil: timestamp("leaseUntil"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("api_idempotency_workspace_key_unique_idx").on(
      table.workspaceId,
      table.key
    ),
  ]
);

export const agentEffects = pgTable(
  "agentEffects",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspaceId").notNull(),
    eventId: varchar("eventId", { length: 180 }).notNull(),
    toolCallId: varchar("toolCallId", { length: 180 }).notNull(),
    toolName: varchar("toolName", { length: 100 }).notNull(),
    fingerprint: varchar("fingerprint", { length: 128 }).notNull(),
    status: varchar("status", { length: 20 }).default("processing").notNull(),
    result: text("result"),
    leaseUntil: timestamp("leaseUntil"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("agent_effects_event_tool_unique_idx").on(
      table.workspaceId,
      table.eventId,
      table.toolCallId
    ),
    index("agent_effects_lease_idx").on(
      table.status,
      table.leaseUntil,
      table.id
    ),
  ]
);

export const agentRuns = pgTable(
  "agentRuns",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspaceId").notNull(),
    eventId: varchar("eventId", { length: 180 }).notNull(),
    contactId: integer("contactId").notNull(),
    provider: varchar("provider", { length: 80 }),
    capability: varchar("capability", { length: 32 }),
    model: varchar("model", { length: 180 }),
    outcome: varchar("outcome", { length: 40 }).notNull(),
    providerAttempts: integer("providerAttempts").default(0).notNull(),
    failureCode: varchar("failureCode", { length: 80 }),
    transcriptionProvider: varchar("transcriptionProvider", { length: 80 }),
    transcriptionAttempts: integer("transcriptionAttempts").default(0).notNull(),
    mediaAnalysisProvider: varchar("mediaAnalysisProvider", { length: 80 }),
    mediaAnalysisAttempts: integer("mediaAnalysisAttempts").default(0).notNull(),
    steps: integer("steps").default(0).notNull(),
    toolCalls: integer("toolCalls").default(0).notNull(),
    transferred: integer("transferred").default(0).notNull(),
    pendingConfirmation: integer("pendingConfirmation").default(0).notNull(),
    inputTokens: integer("inputTokens"),
    outputTokens: integer("outputTokens"),
    totalTokens: integer("totalTokens"),
    latencyMs: integer("latencyMs").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("agent_runs_workspace_event_unique_idx").on(table.workspaceId, table.eventId),
    index("agent_runs_workspace_created_idx").on(table.workspaceId, table.createdAt),
  ]
);

export const webhookEvents = pgTable(
  "webhookEvents",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspaceId").notNull(),
    eventId: varchar("eventId", { length: 180 }).notNull(),
    provider: varchar("provider", { length: 60 }).default("whatsapp").notNull(),
    instanceId: varchar("instanceId", { length: 160 }),
    webhookNonce: varchar("webhookNonce", { length: 180 }),
    webhookTimestamp: timestamp("webhookTimestamp"),
    payload: text("payload").notNull(),
    status: webhookStatusEnum("status").default("received").notNull(),
    leaseToken: varchar("leaseToken", { length: 64 }),
    leaseUntil: timestamp("leaseUntil"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    processedAt: timestamp("processedAt"),
  },
  table => [
    uniqueIndex("webhook_events_workspace_event_unique_idx").on(
      table.workspaceId,
      table.eventId
    ),
    uniqueIndex("webhook_events_workspace_provider_nonce_unique_idx").on(
      table.workspaceId,
      table.provider,
      table.webhookNonce
    ),
    index("webhook_events_status_lease_idx").on(table.status, table.leaseUntil),
  ]
);

export const securityRateLimitBuckets = pgTable(
  "securityRateLimitBuckets",
  {
    id: serial("id").primaryKey(),
    bucketType: varchar("bucketType", { length: 40 }).notNull(),
    scopeKey: varchar("scopeKey", { length: 320 }).notNull(),
    failures: integer("failures").default(0).notNull(),
    firstFailureAt: timestamp("firstFailureAt").notNull(),
    blockedUntil: timestamp("blockedUntil"),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("security_rate_limit_bucket_unique_idx").on(
      table.bucketType,
      table.scopeKey
    ),
    index("security_rate_limit_bucket_updated_idx").on(table.updatedAt),
  ]
);

export const domainEvents = pgTable(
  "domainEvents",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspaceId").notNull(),
    eventKey: varchar("eventKey", { length: 180 }).notNull(),
    eventType: varchar("eventType", { length: 80 }).notNull(),
    aggregateType: varchar("aggregateType", { length: 80 }).notNull(),
    aggregateId: integer("aggregateId"),
    payload: text("payload").notNull(),
    status: domainEventStatusEnum("status").default("pending").notNull(),
    attemptCount: integer("attemptCount").default(0).notNull(),
    workerId: varchar("workerId", { length: 120 }),
    claimedAt: timestamp("claimedAt"),
    leaseUntil: timestamp("leaseUntil"),
    availableAt: timestamp("availableAt").defaultNow().notNull(),
    lastError: text("lastError"),
    deliveredAt: timestamp("deliveredAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("domain_events_workspace_key_unique_idx").on(
      table.workspaceId,
      table.eventKey
    ),
    index("domain_events_pending_idx").on(
      table.status,
      table.availableAt,
      table.id
    ),
    index("domain_events_lease_idx").on(
      table.status,
      table.leaseUntil,
      table.id
    ),
    index("domain_events_workspace_idx").on(table.workspaceId, table.createdAt),
  ]
);

export const whatsappGroups = pgTable(
  "whatsappGroups",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspaceId").notNull(),
    instanceId: varchar("instanceId", { length: 160 }).notNull(),
    jid: varchar("jid", { length: 180 }).notNull(),
    subject: varchar("subject", { length: 160 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("whatsapp_groups_workspace_instance_jid_unique_idx").on(
      table.workspaceId,
      table.instanceId,
      table.jid
    ),
    index("whatsapp_groups_workspace_instance_idx").on(
      table.workspaceId,
      table.instanceId,
      table.updatedAt
    ),
  ]
);

export const whatsappGroupParticipants = pgTable(
  "whatsappGroupParticipants",
  {
    id: serial("id").primaryKey(),
    groupId: integer("groupId").notNull(),
    jid: varchar("jid", { length: 180 }).notNull(),
    jidAlt: varchar("jidAlt", { length: 180 }),
    name: varchar("name", { length: 160 }),
    isAdmin: integer("isAdmin").default(0).notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("whatsapp_group_participants_group_jid_unique_idx").on(
      table.groupId,
      table.jid
    ),
    index("whatsapp_group_participants_group_idx").on(
      table.groupId,
      table.updatedAt
    ),
  ]
);

export const contacts = pgTable(
  "contacts",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspaceId"),
    groupId: integer("groupId"),
    externalPhone: varchar("externalPhone", { length: 32 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    pushName: varchar("pushName", { length: 160 }),
    nameSource: varchar("nameSource", { length: 16 }).default("auto").notNull(),
    nameUpdatedAt: timestamp("nameUpdatedAt"),
    nameUpdatedBy: integer("nameUpdatedBy"),
    city: varchar("city", { length: 100 }),
    neighborhood: varchar("neighborhood", { length: 100 }),
    serviceRequested: varchar("serviceRequested", { length: 180 }),
    urgency: urgencyEnum("urgency").default("Média").notNull(),
    stage: varchar("stage", { length: 80 }).default("Novo contato").notNull(),
    aiEnabled: integer("aiEnabled").default(1).notNull(),
    quoteCents: integer("quoteCents").default(0).notNull(),
    unreadCount: integer("unreadCount").default(0).notNull(),
    lastMessagePreview: varchar("lastMessagePreview", { length: 500 }),
    lastMessageAt: timestamp("lastMessageAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("contacts_workspace_phone_unique_idx").on(
      table.workspaceId,
      table.externalPhone
    ).where(sql`${table.groupId} IS NULL`),
    uniqueIndex("contacts_whatsapp_group_unique_idx")
      .on(table.groupId)
      .where(sql`${table.groupId} IS NOT NULL`),
  ]
);

export const contactNotes = pgTable("contactNotes", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull(),
  contactId: integer("contactId").notNull(),
  content: text("content").notNull(),
  authorType: noteAuthorTypeEnum("authorType").default("ai").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const leads = pgTable(
  "leads",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspaceId")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    contactId: integer("contactId")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    source: varchar("source", { length: 32 }).default("whatsapp").notNull(),
    lastActivityAt: timestamp("lastActivityAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("leads_workspace_contact_unique_idx").on(
      table.workspaceId,
      table.contactId
    ),
    index("leads_workspace_updated_idx").on(
      table.workspaceId,
      table.updatedAt
    ),
  ]
);

export const opportunities = pgTable(
  "opportunities",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspaceId")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    leadId: integer("leadId")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    stage: varchar("stage", { length: 80 }).default("Novo contato").notNull(),
    assignedMemberId: integer("assignedMemberId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("opportunities_workspace_lead_unique_idx").on(
      table.workspaceId,
      table.leadId
    ),
    index("opportunities_workspace_assignee_updated_idx").on(
      table.workspaceId,
      table.assignedMemberId,
      table.updatedAt
    ),
    index("opportunities_workspace_stage_updated_idx").on(
      table.workspaceId,
      table.stage,
      table.updatedAt
    ),
  ]
);

export const opportunityStageHistory = pgTable(
  "opportunityStageHistory",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspaceId")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    opportunityId: integer("opportunityId")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    fromStage: varchar("fromStage", { length: 80 }),
    toStage: varchar("toStage", { length: 80 }).notNull(),
    source: varchar("source", { length: 24 }).notNull(),
    actorUserId: integer("actorUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("opportunity_stage_history_timeline_idx").on(
      table.workspaceId,
      table.opportunityId,
      table.createdAt,
      table.id
    ),
    uniqueIndex("opportunity_stage_history_baseline_unique_idx")
      .on(table.workspaceId, table.opportunityId)
      .where(sql`${table.fromStage} IS NULL`),
    check(
      "opportunity_stage_history_source_check",
      sql`${table.source} in ('whatsapp', 'api', 'crm', 'inbox', 'lead_memory', 'migration')`
    ),
    check(
      "opportunity_stage_history_change_check",
      sql`${table.fromStage} IS NULL OR ${table.fromStage} <> ${table.toStage}`
    ),
  ]
);

export const conversations = pgTable(
  "conversations",
  {
    id: serial("id").primaryKey(),
    contactId: integer("contactId").notNull(),
    opportunityId: integer("opportunityId").references(
      () => opportunities.id,
      { onDelete: "set null" }
    ),
    status: conversationStatusEnum("status").default("open").notNull(),
    humanControlled: integer("humanControlled").default(0).notNull(),
    lastMessageAt: timestamp("lastMessageAt"),
    unreadCount: integer("unreadCount").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("conversations_contact_unique_idx").on(table.contactId),
    uniqueIndex("conversations_opportunity_unique_idx")
      .on(table.opportunityId)
      .where(sql`${table.opportunityId} IS NOT NULL`),
  ]
);

export const opportunityFollowUps = pgTable(
  "opportunityFollowUps",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspaceId").notNull(),
    opportunityId: integer("opportunityId").notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    dueAt: timestamp("dueAt").notNull(),
    status: varchar("status", { length: 16 }).default("open").notNull(),
    createdByUserId: integer("createdByUserId").notNull(),
    completedByUserId: integer("completedByUserId"),
    completedAt: timestamp("completedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("opportunity_follow_ups_one_open_unique_idx")
      .on(table.workspaceId, table.opportunityId)
      .where(sql`${table.status} = 'open'`),
    index("opportunity_follow_ups_open_due_idx")
      .on(table.workspaceId, table.dueAt, table.opportunityId)
      .where(sql`${table.status} = 'open'`),
    index("opportunity_follow_ups_history_idx").on(
      table.workspaceId,
      table.opportunityId,
      table.createdAt
    ),
    check(
      "opportunity_follow_ups_status_check",
      sql`${table.status} in ('open', 'completed')`
    ),
  ]
);

/** Per-operator read cursor; the shared unread counters remain legacy data. */
export const conversationReads = pgTable(
  "conversationReads",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspaceId").notNull(),
    conversationId: integer("conversationId").notNull(),
    userId: integer("userId").notNull(),
    lastReadMessageId: integer("lastReadMessageId"),
    readAt: timestamp("readAt").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("conversation_reads_user_unique_idx").on(
      table.workspaceId,
      table.conversationId,
      table.userId
    ),
    index("conversation_reads_workspace_user_idx").on(
      table.workspaceId,
      table.userId,
      table.updatedAt
    ),
  ]
);

export const messages = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversationId").notNull(),
    externalId: varchar("externalId", { length: 180 }),
    direction: messageDirectionEnum("direction").notNull(),
    senderType: messageSenderTypeEnum("senderType").notNull(),
    messageType: messageTypeEnum("messageType").default("text").notNull(),
    content: text("content").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    status: messageStatusEnum("status").default("received").notNull(),
    provider: whatsappProviderEnum("provider").default("baileys").notNull(),
    attemptCount: integer("attemptCount").default(0).notNull(),
    lastError: text("lastError"),
    sentAt: timestamp("sentAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("messages_external_id_unique_idx")
      .on(table.externalId)
      .where(sql`${table.externalId} IS NOT NULL`),
    check(
      "messages_operational_provider_check",
      sql`${table.provider} = 'baileys'`
    ),
  ]
);

export const services = pgTable(
  "services",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspaceId").notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    description: text("description"),
    durationMinutes: integer("durationMinutes").default(60).notNull(),
    priceCents: integer("priceCents").default(0).notNull(),
    priceType: servicePriceTypeEnum("priceType").default("fixed").notNull(),
    active: integer("active").default(1).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [index("services_workspace_idx").on(table.workspaceId, table.active)]
);

export const professionals = pgTable(
  "professionals",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspaceId").notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    specialty: varchar("specialty", { length: 120 }),
    color: varchar("color", { length: 20 }).default("#56d68a").notNull(),
    active: integer("active").default(1).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [
    index("professionals_workspace_idx").on(table.workspaceId, table.active),
  ]
);

export const professionalServices = pgTable(
  "professionalServices",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspaceId").notNull(),
    professionalId: integer("professionalId").notNull(),
    serviceId: integer("serviceId").notNull(),
    active: integer("active").default(1).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("professional_services_unique_idx").on(
      table.workspaceId,
      table.professionalId,
      table.serviceId
    ),
  ]
);

export const availability = pgTable(
  "availability",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspaceId").notNull(),
    professionalId: integer("professionalId").notNull(),
    weekday: integer("weekday").notNull(),
    startMinute: integer("startMinute").notNull(),
    endMinute: integer("endMinute").notNull(),
    active: integer("active").default(1).notNull(),
  },
  table => [
    index("availability_professional_idx").on(
      table.workspaceId,
      table.professionalId,
      table.weekday
    ),
  ]
);

export const appointmentsTable = pgTable(
  "appointments",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspaceId").notNull(),
    contactId: integer("contactId"),
    serviceId: integer("serviceId").notNull(),
    professionalId: integer("professionalId").notNull(),
    startsAt: timestamp("startsAt").notNull(),
    endsAt: timestamp("endsAt").notNull(),
    status: appointmentStatusEnum("status").default("requested").notNull(),
    notes: varchar("notes", { length: 500 }),
    source: varchar("source", { length: 40 }).default("panel").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [
    index("appointments_workspace_idx").on(table.workspaceId, table.startsAt),
    index("appointments_professional_idx").on(
      table.professionalId,
      table.startsAt
    ),
  ]
);

export const quotes = pgTable("quotes", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull(),
  contactId: integer("contactId").notNull(),
  opportunityId: integer("opportunityId"),
  serviceName: varchar("serviceName", { length: 160 }).notNull(),
  description: text("description"),
  quotedCents: integer("quotedCents").default(0).notNull(),
  receivedCents: integer("receivedCents").default(0).notNull(),
  status: quoteStatusEnum("status").default("orcamento").notNull(),
  approvalStatus: quoteApprovalStatusEnum("approvalStatus").default("draft").notNull(),
  paymentStatus: quotePaymentStatusEnum("paymentStatus").default("unpaid").notNull(),
  validUntil: timestamp("validUntil"),
  approvedAt: timestamp("approvedAt"),
  approvedByUserId: integer("approvedByUserId"),
  rejectedAt: timestamp("rejectedAt"),
  rejectedByUserId: integer("rejectedByUserId"),
  dueDate: timestamp("dueDate"),
  notes: varchar("notes", { length: 1000 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export const quoteItems = pgTable(
  "quoteItems",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspaceId").notNull(),
    quoteId: integer("quoteId").notNull(),
    position: integer("position").default(0).notNull(),
    serviceName: varchar("serviceName", { length: 160 }).notNull(),
    description: text("description"),
    quantity: integer("quantity").default(1).notNull(),
    unitPriceCents: integer("unitPriceCents").default(0).notNull(),
    totalCents: integer("totalCents").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("quote_items_workspace_quote_position_unique_idx").on(
      table.workspaceId,
      table.quoteId,
      table.position
    ),
    index("quote_items_workspace_quote_idx").on(table.workspaceId, table.quoteId),
  ]
);
export const quoteApprovalHistory = pgTable(
  "quoteApprovalHistory",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspaceId").notNull(),
    quoteId: integer("quoteId").notNull(),
    fromStatus: quoteApprovalStatusEnum("fromStatus"),
    toStatus: quoteApprovalStatusEnum("toStatus").notNull(),
    actorUserId: integer("actorUserId"),
    note: varchar("note", { length: 1000 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("quote_approval_history_workspace_quote_idx").on(
      table.workspaceId,
      table.quoteId,
      table.createdAt,
      table.id
    ),
  ]
);

export const quotePayments = pgTable(
  "quotePayments",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspaceId").notNull(),
    quoteId: integer("quoteId").notNull(),
    amountCents: integer("amountCents").notNull(),
    method: varchar("method", { length: 30 }).notNull(),
    receivedAt: timestamp("receivedAt").notNull(),
    notes: varchar("notes", { length: 500 }),
    actorUserId: integer("actorUserId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("quote_payments_workspace_id_unique_idx").on(
      table.workspaceId,
      table.id
    ),
    index("quote_payments_workspace_quote_idx").on(
      table.workspaceId,
      table.quoteId,
      table.receivedAt,
      table.id
    ),
  ]
);

export const quoteReceipts = pgTable(
  "quoteReceipts",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspaceId").notNull(),
    quoteId: integer("quoteId").notNull(),
    paymentId: integer("paymentId").notNull(),
    receiptNumber: varchar("receiptNumber", { length: 80 }).notNull(),
    issuedAt: timestamp("issuedAt").notNull(),
    issuedByUserId: integer("issuedByUserId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("quote_receipts_workspace_number_unique_idx").on(
      table.workspaceId,
      table.receiptNumber
    ),
    uniqueIndex("quote_receipts_workspace_payment_unique_idx").on(
      table.workspaceId,
      table.paymentId
    ),
    index("quote_receipts_workspace_quote_idx").on(
      table.workspaceId,
      table.quoteId,
      table.issuedAt
    ),
  ]
);

export const auditLogs = pgTable("auditLogs", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspaceId").notNull(),
  actorUserId: integer("actorUserId"),
  contactId: integer("contactId"),
  action: varchar("action", { length: 100 }).notNull(),
  summary: varchar("summary", { length: 500 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspaceId").notNull(),
    userId: integer("userId").notNull(),
    eventKey: varchar("eventKey", { length: 255 }).notNull(),
    type: varchar("type", { length: 60 }).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    body: text("body").notNull(),
    href: varchar("href", { length: 255 }).notNull(),
    readAt: timestamp("readAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("notifications_user_event_unique_idx").on(
      table.workspaceId,
      table.userId,
      table.eventKey
    ),
    index("notifications_user_created_idx").on(
      table.workspaceId,
      table.userId,
      table.createdAt,
      table.id
    ),
    index("notifications_user_unread_idx").on(
      table.workspaceId,
      table.userId,
      table.readAt
    ),
  ]
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type ConsentRecord = typeof consentRecords.$inferSelect;
export type InsertConsentRecord = typeof consentRecords.$inferInsert;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = typeof passwordResetTokens.$inferInsert;
export type OnboardingSession = typeof onboardingSessions.$inferSelect;
export type InsertOnboardingSession = typeof onboardingSessions.$inferInsert;
export type OnboardingStepAnswer = typeof onboardingStepAnswers.$inferSelect;
export type InsertOnboardingStepAnswer = typeof onboardingStepAnswers.$inferInsert;
export type OnboardingStepAnswerRevision = typeof onboardingStepAnswerRevisions.$inferSelect;
export type InsertOnboardingStepAnswerRevision = typeof onboardingStepAnswerRevisions.$inferInsert;
export type OnboardingConflictResolution = typeof onboardingConflictResolutions.$inferSelect;
export type InsertOnboardingConflictResolution = typeof onboardingConflictResolutions.$inferInsert;
export type OnboardingSourceConsent = typeof onboardingSourceConsents.$inferSelect;
export type InsertOnboardingSourceConsent = typeof onboardingSourceConsents.$inferInsert;
export type OnboardingRetentionPolicy = typeof onboardingRetentionPolicies.$inferSelect;
export type InsertOnboardingRetentionPolicy = typeof onboardingRetentionPolicies.$inferInsert;
export type OnboardingAudioAsset = typeof onboardingAudioAssets.$inferSelect;
export type InsertOnboardingAudioAsset = typeof onboardingAudioAssets.$inferInsert;
export type OnboardingTranscription = typeof onboardingTranscriptions.$inferSelect;
export type InsertOnboardingTranscription = typeof onboardingTranscriptions.$inferInsert;
export type OnboardingTelemetryEvent = typeof onboardingTelemetryEvents.$inferSelect;
export type InsertOnboardingTelemetryEvent = typeof onboardingTelemetryEvents.$inferInsert;
export type OnboardingPublishedVersion = typeof onboardingPublishedVersions.$inferSelect;
export type InsertOnboardingPublishedVersion = typeof onboardingPublishedVersions.$inferInsert;
export type Workspace = typeof workspaces.$inferSelect;
export type InsertWorkspace = typeof workspaces.$inferInsert;
export type PlatformAdmin = typeof platformAdmins.$inferSelect;
export type InsertPlatformAdmin = typeof platformAdmins.$inferInsert;
export type PlatformSupportTicket = typeof platformSupportTickets.$inferSelect;
export type InsertPlatformSupportTicket = typeof platformSupportTickets.$inferInsert;
export type SupportSession = typeof supportSessions.$inferSelect;
export type InsertSupportSession = typeof supportSessions.$inferInsert;
export type AgentPromptVersion = typeof agentPromptVersions.$inferSelect;
export type InsertAgentPromptVersion = typeof agentPromptVersions.$inferInsert;
export type AgentPromptDraft = typeof agentPromptDrafts.$inferSelect;
export type InsertAgentPromptDraft = typeof agentPromptDrafts.$inferInsert;
export type AgentSimulationRun = typeof agentSimulationRuns.$inferSelect;
export type InsertAgentSimulationRun = typeof agentSimulationRuns.$inferInsert;
export type PlatformAuditLog = typeof platformAuditLogs.$inferSelect;
export type InsertPlatformAuditLog = typeof platformAuditLogs.$inferInsert;
export type PlatformWorkspaceNote = typeof platformWorkspaceNotes.$inferSelect;
export type InsertPlatformWorkspaceNote =
  typeof platformWorkspaceNotes.$inferInsert;
export type WorkerHeartbeat = typeof workerHeartbeats.$inferSelect;
export type InsertWorkerHeartbeat = typeof workerHeartbeats.$inferInsert;
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type InsertWorkspaceMember = typeof workspaceMembers.$inferInsert;
export type WorkspaceInvite = typeof workspaceInvites.$inferSelect;
export type InsertWorkspaceInvite = typeof workspaceInvites.$inferInsert;
export type WorkspaceSetting = typeof workspaceSettings.$inferSelect;
export type InsertWorkspaceSetting = typeof workspaceSettings.$inferInsert;
export type ApiIdempotency = typeof apiIdempotency.$inferSelect;
export type InsertApiIdempotency = typeof apiIdempotency.$inferInsert;
export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type InsertWebhookEvent = typeof webhookEvents.$inferInsert;
export type DomainEvent = typeof domainEvents.$inferSelect;
export type InsertDomainEvent = typeof domainEvents.$inferInsert;
export type WhatsappChannel = typeof whatsappChannels.$inferSelect;
export type InsertWhatsappChannel = typeof whatsappChannels.$inferInsert;
export type Contact = typeof contacts.$inferSelect;
export type InsertContact = typeof contacts.$inferInsert;
export type ContactNote = typeof contactNotes.$inferSelect;
export type InsertContactNote = typeof contactNotes.$inferInsert;
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;
export type ConversationRead = typeof conversationReads.$inferSelect;
export type InsertConversationRead = typeof conversationReads.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;
export type Service = typeof services.$inferSelect;
export type InsertService = typeof services.$inferInsert;
export type Professional = typeof professionals.$inferSelect;
export type InsertProfessional = typeof professionals.$inferInsert;
export type ProfessionalService = typeof professionalServices.$inferSelect;
export type InsertProfessionalService =
  typeof professionalServices.$inferInsert;
export type Availability = typeof availability.$inferSelect;
export type InsertAvailability = typeof availability.$inferInsert;
export type Appointment = typeof appointmentsTable.$inferSelect;
export type InsertAppointment = typeof appointmentsTable.$inferInsert;
export type Quote = typeof quotes.$inferSelect;
export type InsertQuote = typeof quotes.$inferInsert;
export type QuoteItem = typeof quoteItems.$inferSelect;
export type InsertQuoteItem = typeof quoteItems.$inferInsert;
export type QuoteApprovalHistory = typeof quoteApprovalHistory.$inferSelect;
export type InsertQuoteApprovalHistory = typeof quoteApprovalHistory.$inferInsert;
export type QuotePayment = typeof quotePayments.$inferSelect;
export type InsertQuotePayment = typeof quotePayments.$inferInsert;
export type QuoteReceipt = typeof quoteReceipts.$inferSelect;
export type InsertQuoteReceipt = typeof quoteReceipts.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;
