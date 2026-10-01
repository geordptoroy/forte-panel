import crypto from "node:crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME, SESSION_TTL_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  assertLoginAllowed,
  assertPasswordResetAllowed,
  assertSignupAllowed,
  recordLoginFailure,
  recordLoginSuccess,
  recordPasswordResetAttempt,
  recordSignupAttempt,
} from "./_core/request-security";
import { ScheduleError } from "./schedule";
import {
  InboxInstanceFilterError,
  normalizeInboxInstanceSelection,
} from "./inbox-instance-filter";
import {
  ensureDemoInbox,
  isDemoRuntimeAllowed,
  acceptWorkspaceInvite,
  assertOnboardingSourceConsent,
  createPublicSignup,
  createOnboardingAudioAsset,
  createLocalWorkspaceMember,
  createWorkspaceInvite,
  createProfessional,
  createAgendaAppointment,
  cancelAgendaAppointment,
  updateAgendaStatus,
  createQuote,
  confirmOnboardingStep,
  getAgendaSnapshot,
  getUserByEmail,
  getUserById,
  getUserByOpenId,
  getWorkspaceMembershipContext,
  revokeUserSessions,
  setLocalPassword,
  touchLastSignedIn,
  ensureBaileysChannel,
  listBaileysInstances,
  getBaileysInstance,
  createBaileysInstance as createBaileysInstanceRecord,
  updateBaileysInstanceName as updateBaileysInstanceRecordName,
  archiveBaileysInstance,
  consumeWorkspaceUserUsage,
  listWhatsappChannels,
  getAuditLogForContact,
  getDashboardSnapshot,
  getWorkspaceUsageSnapshot,
  getOnboardingSession,
  getOnboardingTelemetrySummary,
  listOnboardingPublishedVersions,
  getOnboardingProfile,
  getNativeAgentConfig,
  getNativeAgentRuntimeConfig,
  saveNativeAgentConfig,
  resetWorkspaceDevelopmentData,
  revokeWorkspaceInvite,
  listContactNotes,
  addContactNote,
  getContactById,
  getConversationByContact,
  listInboxContacts,
  listInboxAssignees,
  assignInboxContact,
  setInboxFollowUp,
  listProfessionals,
  listMessagesForContact,
  listQuotes,
  listQuotesForContact,
  listInAppNotifications,
  listWorkspaceInvites,
  issuePasswordResetToken,
  markAllInAppNotificationsRead,
  markConversationRead,
  markInAppNotificationRead,
  markWorkspaceInviteSent,
  moveContactStage,
  renameContact as renameInboxContact,
  PUBLIC_PRIVACY_VERSION,
  PUBLIC_TERMS_VERSION,
  resetPasswordWithToken,
  resolveOnboardingConflict,
  getOnboardingGovernance,
  getOnboardingAudioAssetForWorkspace,
  getOnboardingAudioTranscription,
  saveOnboardingRetentionPolicy,
  setOnboardingSourceConsent,
  sendManualMessage,
  pauseOnboardingSession,
  claimOnboardingAudioTranscription,
  answerOnboardingConflict,
  applyOnboardingFollowUpAnswer,
  persistOnboardingAudioTranscription,
  persistOnboardingStepAnswerProposal,
  publishOnboardingDraft,
  recordOnboardingTelemetry,
  rollbackOnboardingPublishedVersion,
  saveOnboardingProfile,
  simulateOnboardingMessage,
  startOnboardingSession,
  setContactAi,
  upsertApiContact,
  upsertUser,
  verifyLocalPassword,
  updateQuotePayment,
} from "./db";
import { sendInviteEmail, sendPasswordResetEmail } from "./_core/email";
import { storageGetSignedUrl, storagePut } from "./storage";
import {
  buildOnboardingAudioStorageKey,
  decodeOnboardingAudioBase64,
  ONBOARDING_AUDIO_MAX_BYTES,
  sha256ForOnboardingAudio,
  validateOnboardingAudioMetadata,
} from "./onboarding-audio";
import { transcribeAudioForWorkspace } from "./_core/voiceTranscription";
import { extractOnboardingStructuredProposal } from "./onboarding-structured";
import {
  interactiveMessageTypeSchema,
  validateInteractiveMessage,
} from "./interactive-messages";
import {
  invokeConfiguredLLM,
  type AgentCapability,
  type AgentProviderSettings,
} from "./llm-providers";
import {
  countWorkspaceMembers,
  createService,
  getNotificationPreferences,
  listProfessionalsDetailed,
  listServices,
  listWorkspaceAudit,
  listWorkspaceMembersDetailed,
  logWorkspaceAction,
  replaceAvailability,
  resolveWorkspaceAccess,
  saveNotificationPreferences,
  setMemberProfile,
  setProfessionalServices,
  setServiceProfessionals,
  updateOwnProfile,
  updateProfessional,
  updateService,
  type OperationalRole,
  type WorkspaceAccess,
  type WorkspaceMemberRole,
} from "./workspace";
import {
  getProfessionalPortalSnapshot,
  transitionAppointment,
  professionalCanExecuteService,
} from "./agenda";
import { listLLMModels } from "./_core/llm";
import { platformRouter } from "./platform-router";
import { getPlatformAdminAccess } from "./platform-admin";
import {
  createBaileysInstance,
  deleteBaileysInstance,
  isGatewayNotFound,
  connectBaileys,
  getBaileysProfile,
  requestBaileysPairingCode,
  disconnectBaileys,
  getBaileysQr,
  getBaileysStatus,
  updateBaileysInstanceName,
  updateBaileysInstanceSettings,
} from "./baileys-gateway";

const contactIdInput = z.object({ contactId: z.number().int().positive() });
const inboxInstanceFilterSchema = z.object({
  instanceIds: z
    .array(z.string().trim().min(1).max(160))
    .max(50)
    .nullable()
    .optional(),
});

async function resolveInboxInstanceSelection(
  workspaceId: number,
  requested: readonly string[] | null | undefined
) {
  await ensureLegacyBaileysInstance(workspaceId);
  const available = await listBaileysInstances(workspaceId);
  try {
    return normalizeInboxInstanceSelection(requested, available);
  } catch (error) {
    if (!(error instanceof InboxInstanceFilterError)) throw error;
    throw new TRPCError({
      code: error.reason === "empty" ? "BAD_REQUEST" : "FORBIDDEN",
      message: error.message,
    });
  }
}

type ContactRow = Awaited<ReturnType<typeof listInboxContacts>>[number];
type MappableContact = Omit<
  ContactRow,
  | "awaitingResponse"
  | "needsOperatorResponse"
  | "isGroup"
  | "groupJid"
  | "groupSubject"
  | "groupInstanceId"
  | "groupParticipantCount"
  | "groupParticipants"
> & {
  awaitingResponse?: boolean;
  needsOperatorResponse?: boolean;
  isGroup?: boolean;
  groupJid?: string | null;
  groupSubject?: string | null;
  groupInstanceId?: string | null;
  groupParticipantCount?: number;
  groupParticipants?: ContactRow["groupParticipants"];
};

const mapContact = (contact: MappableContact) => ({
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
  stage: contact.stage,
  aiEnabled: contact.aiEnabled === 1,
  unread: contact.unreadCount,
  awaitingResponse: contact.awaitingResponse ?? false,
  needsOperatorResponse: contact.needsOperatorResponse ?? false,
  lastMessage: contact.lastMessagePreview ?? "Sem mensagens",
  lastMessageAt:
    contact.lastMessageAt?.toISOString() ?? contact.updatedAt.toISOString(),
  quote: contact.quoteCents / 100,
  pending: contact.quoteCents / 100,
  assignedUserId: contact.assignedUserId ?? null,
  followUpAt: contact.followUpAt?.toISOString() ?? null,
  followUpNote: contact.followUpNote ?? null,
  followUpCompletedAt: contact.followUpCompletedAt?.toISOString() ?? null,
  followUpDue: Boolean(
    contact.followUpAt &&
      !contact.followUpCompletedAt &&
      contact.followUpAt.getTime() <= Date.now()
  ),
  daysNoReply: 0,
  initials: contact.name
    .split(" ")
    .map(part => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase(),
});

const serializeAppointment = <T extends { startsAt: Date; endsAt: Date }>(
  appointment: T
) => ({
  ...appointment,
  startsAt: appointment.startsAt.toISOString(),
  endsAt: appointment.endsAt.toISOString(),
});
const serializeAgendaAppointment = serializeAppointment;

function throwScheduleTrpcError(error: unknown): never {
  if (error instanceof ScheduleError) {
    if (
      error.reason === "contact_unavailable" ||
      error.reason === "service_unavailable" ||
      error.reason === "professional_unavailable"
    )
      throw new TRPCError({ code: "NOT_FOUND", message: error.message });
    if (error.reason === "invalid_period")
      throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
    throw new TRPCError({ code: "CONFLICT", message: error.message });
  }
  throw error;
}

/**
 * Builds a tRPC middleware that resolves the workspace access context once per
 * request, so authorization always reads the workspace membership instead of
 * the global user role.
 */
const withAccess = (
  requirement: (access: WorkspaceAccess) => boolean,
  message: string
) =>
  protectedProcedure.use(async ({ ctx, next }) => {
    const access = await resolveWorkspaceAccess(ctx.user, ctx.workspace);
    if (!access.memberActive)
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Seu acesso está desativado neste workspace",
      });
    if (!requirement(access))
      throw new TRPCError({ code: "FORBIDDEN", message });
    return next({ ctx: { access } });
  });

const requireManager = withAccess(
  access => access.canManageCatalog,
  "Somente proprietário, administrador ou gerente podem executar esta ação"
);

async function ensureLegacyBaileysInstance(workspaceId: number) {
  if (process.env.FORTE_API_WORKSPACE_ID?.trim() !== String(workspaceId)) return;
  if (!process.env.BAILEYS_BASE_URL || !process.env.BAILEYS_API_KEY) return;
  const instanceId = process.env.BAILEYS_INSTANCE_ID?.trim() || "default";
  if (await getBaileysInstance(workspaceId, instanceId)) return;
  let gatewayStatus: Awaited<ReturnType<typeof getBaileysStatus>>;
  try {
    gatewayStatus = await getBaileysStatus(instanceId);
  } catch (error) {
    if (isGatewayNotFound(error)) return;
    throw error;
  }
  if (!gatewayStatus.configured) return;
  const channel = await ensureBaileysChannel(workspaceId);
  await createBaileysInstanceRecord(
    workspaceId,
    channel.id,
    instanceId,
    gatewayStatus.instanceName
  );
}

const requireAdministrator = withAccess(
  access => access.canManageTeam,
  "Somente proprietário ou administrador podem executar esta ação"
);
const requireOnboardingEditor = protectedProcedure.use(async ({ ctx, next }) => {
  const platformAdmin = await getPlatformAdminAccess(ctx.user.id);
  if (platformAdmin) return next({ ctx: { platformAdmin } });
  const access = await resolveWorkspaceAccess(ctx.user, ctx.workspace);
  if (!access.memberActive || !access.canManageTeam)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Somente proprietário ou administrador podem configurar o onboarding",
    });
  return next({ ctx: { access } });
});
const requirePlatformAdministrator = protectedProcedure.use(async ({ ctx, next }) => {
  const platformAdmin = await getPlatformAdminAccess(ctx.user.id);
  if (!platformAdmin)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Somente o painel administrativo de suporte pode executar esta ação",
    });
  return next({ ctx: { platformAdmin } });
});
const requireActiveMember = withAccess(
  () => true,
  "Seu acesso está desativado neste workspace"
);
const requireInbox = withAccess(
  access => access.canUseInbox,
  "Seu perfil não possui acesso à Inbox deste workspace"
);
const requireInboxMessaging = withAccess(
  access => access.canSendMessages,
  "Seu perfil não pode enviar mensagens neste workspace"
);
const requireFinancial = withAccess(
  access => access.canRegisterPayments,
  "Seu perfil não possui permissão para consultar ou registrar recebimentos"
);

export const appRouter = router({
  system: systemRouter,
  platform: platformRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    access: protectedProcedure.query(async ({ ctx }) => {
      const access = await resolveWorkspaceAccess(ctx.user, ctx.workspace);
      const platformAdmin = await getPlatformAdminAccess(ctx.user.id);
      return {
        userId: access.userId,
        workspaceId: access.workspaceId,
        role: access.role,
        operationalRole: access.operationalRole,
        professionalId: access.professionalId,
        professionalName: access.professionalName,
        memberActive: access.memberActive,
        canManageTeam: access.canManageTeam,
        canManageCatalog: access.canManageCatalog,
        canUseInbox: access.canUseInbox,
        canSendMessages: access.canSendMessages,
        canManageInbox: access.canManageInbox,
        canRegisterPayments: access.canRegisterPayments,
        canSeeFullAgenda: access.canSeeFullAgenda,
        restrictedToOwnAgenda: access.restrictedToOwnAgenda,
        platform: Boolean(platformAdmin),
      };
    }),
    updateProfile: protectedProcedure
      .input(
        z.object({
          name: z.string().trim().min(2).max(160),
          email: z.string().email(),
          phone: z.string().trim().max(32).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const updated = await updateOwnProfile(ctx.user.id, input);
        if (!updated)
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Não foi possível atualizar o perfil",
          });
        await logWorkspaceAction({
          workspaceId: ctx.workspace.workspaceId,
          actorUserId: ctx.user.id,
          action: "profile_updated",
          summary: "Perfil do operador atualizado",
        });
        return {
          id: updated.id,
          name: updated.name,
          email: updated.email,
          phone: updated.phone,
        };
      }),
    changePassword: protectedProcedure
      .input(
        z.object({
          currentPassword: z.string().min(1),
          newPassword: z.string().min(8).max(128),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const account = await getUserById(ctx.user.id);
        if (!account)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Conta não encontrada",
          });
        if (
          account.passwordHash &&
          !verifyLocalPassword(input.currentPassword, account.passwordHash)
        ) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Senha atual incorreta",
          });
        }
        await setLocalPassword(ctx.user.id, input.newPassword);
        await revokeUserSessions(ctx.user.id);
        await logWorkspaceAction({
          workspaceId: ctx.workspace.workspaceId,
          actorUserId: ctx.user.id,
          action: "password_changed",
          summary: "Senha do operador atualizada",
        });
        return { success: true } as const;
      }),
    localLogin: publicProcedure
      .input(
        z.object({ email: z.string().email(), password: z.string().min(1) })
      )
      .mutation(async ({ input, ctx }) => {
        if (!ENV.localAuthEnabled) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Login local não configurado",
          });
        }
        const email = input.email.trim().toLowerCase();
        assertLoginAllowed(ctx.req, email);
        let account = await getUserByEmail(email);
        const configuredPlatformAccount = ENV.localPlatformAdminAccounts.find(
          candidate =>
            candidate.email === email && candidate.password === input.password
        );
        if (configuredPlatformAccount) {
          await upsertUser({
            openId: configuredPlatformAccount.openId,
            name: configuredPlatformAccount.name,
            email: configuredPlatformAccount.email,
            loginMethod: "local",
            role: "admin",
            lastSignedIn: new Date(),
          });
          account = await getUserByOpenId(configuredPlatformAccount.openId);
        } else if (
          !account ||
          !verifyLocalPassword(input.password, account.passwordHash)
        ) {
          recordLoginFailure(ctx.req, email);
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "E-mail ou senha inválidos",
          });
        }
        if (!account)
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Conta local não pôde ser carregada",
          });
        recordLoginSuccess(ctx.req, email);
        const membership = await getWorkspaceMembershipContext(account.id);
        const platformAdmin = await getPlatformAdminAccess(account.id);
        if (platformAdmin) {
          const token = await sdk.signSession({
            openId: account.openId,
            appId: "local",
            name: account.name ?? email,
            sessionVersion: account.sessionVersion,
          });
          ctx.res.cookie(COOKIE_NAME, token, {
            ...getSessionCookieOptions(ctx.req),
            maxAge: SESSION_TTL_MS,
          });
          await touchLastSignedIn(account.id);
          return {
            success: true,
            platform: true,
            role: null,
            operationalRole: null,
          } as const;
        }
        if (!membership && !platformAdmin) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Sua conta não possui exatamente um workspace ativo",
          });
        }
        const token = await sdk.signSession({
          openId: account.openId,
          appId: "local",
          name: account.name ?? email,
          sessionVersion: account.sessionVersion,
        });
        ctx.res.cookie(COOKIE_NAME, token, {
          ...getSessionCookieOptions(ctx.req),
          maxAge: SESSION_TTL_MS,
        });
        await touchLastSignedIn(account.id);
        if (membership) {
          const access = await resolveWorkspaceAccess(account, membership);
          await logWorkspaceAction({
            workspaceId: membership.workspaceId,
            actorUserId: account.id,
            action: "login_success",
            summary: `Login local de ${email}`,
          });
          return {
            success: true,
            platform: Boolean(platformAdmin),
            role: access.role,
            operationalRole: access.operationalRole,
          } as const;
        }
        return {
          success: true,
          platform: false,
          role: null,
          operationalRole: null,
        } as const;
      }),
    signup: publicProcedure
      .input(
        z.object({
          name: z.string().trim().min(2).max(160),
          email: z.string().email(),
          password: z.string().min(8).max(128),
          workspaceName: z.string().trim().min(2).max(160),
          acceptTerms: z.literal(true),
          acceptPrivacy: z.literal(true),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (!ENV.localAuthEnabled) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Cadastro local não configurado",
          });
        }
        const email = input.email.trim().toLowerCase();
        assertSignupAllowed(ctx.req, email);
        recordSignupAttempt(ctx.req, email);
        try {
          const result = await createPublicSignup({
            name: input.name,
            email,
            password: input.password,
            workspaceName: input.workspaceName,
          });
          const token = await sdk.signSession({
            openId: result.user.openId,
            appId: "local",
            name: result.user.name ?? email,
            sessionVersion: result.user.sessionVersion,
          });
          ctx.res.cookie(COOKIE_NAME, token, {
            ...getSessionCookieOptions(ctx.req),
            maxAge: SESSION_TTL_MS,
          });
          return {
            success: true,
            workspaceId: result.workspace.id,
            role: "owner" as const,
            operationalRole: "human_attendant" as const,
            termsVersion: PUBLIC_TERMS_VERSION,
            privacyVersion: PUBLIC_PRIVACY_VERSION,
          } as const;
        } catch (error) {
          if (error instanceof Error && /já existe uma conta/i.test(error.message))
            throw new TRPCError({ code: "CONFLICT", message: error.message });
          throw error;
        }
      }),
    requestPasswordReset: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ input, ctx }) => {
        if (!ENV.localAuthEnabled) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Recuperação local não configurada",
          });
        }
        const email = input.email.trim().toLowerCase();
        assertPasswordResetAllowed(ctx.req, email);
        recordPasswordResetAttempt(ctx.req, email);
        // The configured transactional provider consumes the internal token;
        // the public response intentionally never reveals whether the email exists.
        const issued = await issuePasswordResetToken(email);
        if (issued) {
          try {
            await sendPasswordResetEmail({
              to: issued.email,
              name: issued.name,
              token: issued.token,
              expiresAt: issued.expiresAt,
            });
          } catch (error) {
            console.error("[auth] password reset email delivery failed", error);
          }
        }
        return { success: true } as const;
      }),
    resetPassword: publicProcedure
      .input(
        z.object({
          token: z.string().min(40).max(100),
          password: z.string().min(8).max(128),
        })
      )
      .mutation(async ({ input }) => {
        if (!ENV.localAuthEnabled) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Recuperação local não configurada",
          });
        }
        try {
          await resetPasswordWithToken(input.token, input.password);
          return { success: true } as const;
        } catch {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Token de recuperação inválido ou expirado",
          });
        }
      }),
    acceptInvite: publicProcedure
      .input(
        z.object({
          token: z.string().min(40).max(100),
          name: z.string().trim().min(2).max(160),
          password: z.string().min(8).max(128),
        })
      )
      .mutation(async ({ input, ctx }) => {
        try {
          const result = await acceptWorkspaceInvite(input.token, {
            name: input.name,
            password: input.password,
          });
          const sessionToken = await sdk.signSession({
            openId: result.user.openId,
            appId: "local",
            name: result.user.name ?? result.user.email ?? input.name,
            sessionVersion: result.user.sessionVersion,
          });
          ctx.res.cookie(COOKIE_NAME, sessionToken, {
            ...getSessionCookieOptions(ctx.req),
            maxAge: SESSION_TTL_MS,
          });
          return {
            success: true,
            email: result.user.email,
            workspaceId: result.workspaceId,
            role: result.role,
            operationalRole: result.operationalRole,
          } as const;
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              error instanceof Error ? error.message : "Convite inválido",
          });
        }
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, cookieOptions);
      return { success: true } as const;
    }),
  }),

  workspace: router({
    current: protectedProcedure.query(async ({ ctx }) => {
      const workspace = ctx.workspace;
      return {
        id: workspace.workspaceId,
        name: workspace.workspaceName,
        slug: workspace.workspaceSlug,
        segment: workspace.segment,
        plan: workspace.plan,
        timezone: workspace.timezone,
      };
    }),
    invites: router({
      list: requireAdministrator.query(async ({ ctx }) => {
        const rows = await listWorkspaceInvites(ctx.workspace.workspaceId);
        return rows.map(row => ({
          ...row,
          expiresAt: row.expiresAt.toISOString(),
          acceptedAt: row.acceptedAt?.toISOString() ?? null,
          revokedAt: row.revokedAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
        }));
      }),
      create: requireAdministrator
        .input(
          z.object({
            email: z.string().email(),
            inviteeName: z.string().trim().min(2).max(160).optional(),
            role: z.enum(["admin", "manager", "agent"]),
            operationalRole: z.enum([
              "human_attendant",
              "ai_attendant",
              "professional",
            ]),
            professionalId: z.number().int().positive().nullable().optional(),
            jobTitle: z.string().trim().max(160).optional(),
            canRegisterPayments: z.boolean().optional(),
            scope: z.string().trim().max(80).optional(),
          })
        )
        .mutation(async ({ input, ctx }) => {
          const result = await createWorkspaceInvite(
            ctx.workspace.workspaceId,
            ctx.user.id,
            input
          );
          let delivery: "sent" | "manual" = "manual";
          try {
            const status = await sendInviteEmail({
              to: result.invite.email,
              name: result.invite.inviteeName,
              token: result.token,
              expiresAt: result.invite.expiresAt,
              workspaceName: ctx.workspace.workspaceName,
              role: input.role,
            });
            if (status === "sent") {
              await markWorkspaceInviteSent(result.invite.id);
              delivery = "sent";
            }
          } catch (error) {
            console.error("[workspace] invite email delivery failed", error);
          }
          const { tokenHash: _tokenHash, ...invite } = result.invite;
          return {
            invite: {
              ...invite,
              expiresAt: invite.expiresAt.toISOString(),
              createdAt: invite.createdAt.toISOString(),
            },
            token: result.token,
            delivery,
          };
        }),
      revoke: requireAdministrator
        .input(z.object({ inviteId: z.number().int().positive() }))
        .mutation(async ({ input, ctx }) => {
          const revoked = await revokeWorkspaceInvite(
            ctx.workspace.workspaceId,
            input.inviteId,
            ctx.user.id
          );
          if (!revoked)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Convite não encontrado ou já encerrado",
            });
          return { success: true } as const;
        }),
    }),
    // The member roster is administrative data: an executor must not be able to
    // enumerate colleagues, e-mails or account status through a direct URL.
    members: requireManager.query(async ({ ctx }) => {
      const members = await listWorkspaceMembersDetailed(
        ctx.workspace.workspaceId
      );
      return members.map(member => ({
        id: member.id,
        userId: member.userId,
        name: member.name ?? "Membro sem nome",
        email: member.email ?? "Sem e-mail",
        role: member.role as WorkspaceMemberRole,
        operationalRole:
          (member.operationalRole as OperationalRole | null) ??
          "human_attendant",
        professionalId: member.professionalId,
        professionalName: member.professionalName,
        jobTitle: member.jobTitle,
        canRegisterPayments: member.canRegisterPayments === 1,
        active: member.active === 1,
        lastSignedIn: member.lastSignedIn?.toISOString() ?? null,
      }));
    }),
    updateMember: requireAdministrator
      .input(
        z.object({
          memberId: z.number().int().positive(),
          role: z.enum(["owner", "admin", "manager", "agent"]).optional(),
          operationalRole: z
            .enum(["human_attendant", "ai_attendant", "professional"])
            .optional(),
          professionalId: z.number().int().positive().nullable().optional(),
          jobTitle: z.string().trim().max(160).nullable().optional(),
          canRegisterPayments: z.boolean().optional(),
          active: z.boolean().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const member = await setMemberProfile(
          ctx.workspace.workspaceId,
          input.memberId,
          input
        );
        if (!member)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Membro não encontrado",
          });
        await logWorkspaceAction({
          workspaceId: ctx.workspace.workspaceId,
          actorUserId: ctx.user.id,
          action: "member_updated",
          summary: `Membro ${input.memberId} atualizado (papel ${member.role}, ativo ${member.active === 1})`,
        });
        return {
          id: member.id,
          role: member.role,
          active: member.active === 1,
          professionalId: member.professionalId,
        };
      }),
    audit: requireManager
      .input(
        z
          .object({ limit: z.number().int().min(1).max(200).default(60) })
          .optional()
      )
      .query(async ({ input, ctx }) => {
        const rows = await listWorkspaceAudit(
          ctx.workspace.workspaceId,
          input?.limit ?? 60
        );
        return rows.map(row => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
        }));
      }),
    inAppNotifications: requireActiveMember.query(async ({ ctx }) => {
      const result = await listInAppNotifications(
        ctx.workspace.workspaceId,
        ctx.user.id,
        30
      );
      return {
        unreadCount: result.unreadCount,
        items: result.items.map(item => ({
          ...item,
          createdAt: item.createdAt.toISOString(),
          readAt: item.readAt?.toISOString() ?? null,
        })),
      };
    }),
    markNotificationRead: requireActiveMember
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        return {
          updated: await markInAppNotificationRead(
            ctx.workspace.workspaceId,
            ctx.user.id,
            input.id
          ),
        };
      }),
    markAllNotificationsRead: requireActiveMember.mutation(async ({ ctx }) => {
      return {
        markedRead: await markAllInAppNotificationsRead(
          ctx.workspace.workspaceId,
          ctx.user.id
        ),
      };
    }),
    notifyPreferences: requireManager.query(async ({ ctx }) => {
      return getNotificationPreferences(ctx.workspace.workspaceId);
    }),
    saveNotifyPreferences: requireManager
      .input(
        z.object({
          newLead: z.boolean(),
          appointmentCreated: z.boolean(),
          appointmentConfirmed: z.boolean(),
          dailySummary: z.boolean(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const saved = await saveNotificationPreferences(
          ctx.workspace.workspaceId,
          input
        );
        await logWorkspaceAction({
          workspaceId: ctx.workspace.workspaceId,
          actorUserId: ctx.user.id,
          action: "notifications_updated",
          summary: "Preferências de notificação atualizadas",
        });
        return saved;
      }),
    summary: protectedProcedure.query(async ({ ctx }) => ({
      membersActive: await countWorkspaceMembers(ctx.workspace.workspaceId),
    })),
    usage: requireManager.query(async ({ ctx }) => {
      const snapshot = await getWorkspaceUsageSnapshot(
        ctx.workspace.workspaceId
      );
      return {
        ...snapshot,
        bucketStart: snapshot.bucketStart.toISOString(),
        resetsAt: snapshot.resetsAt.toISOString(),
      };
    }),
    professionals: protectedProcedure.query(async ({ ctx }) =>
      (await listProfessionals(ctx.workspace.workspaceId)).map(
        professional => ({
          id: professional.id,
          name: professional.name,
          specialty: professional.specialty,
          color: professional.color,
        })
      )
    ),
    professionalsDetailed: requireManager.query(async ({ ctx }) => {
      const rows = await listProfessionalsDetailed(ctx.workspace.workspaceId, {
        includeInactive: true,
      });
      return rows.map(row => ({
        id: row.id,
        name: row.name,
        specialty: row.specialty,
        color: row.color,
        active: row.active === 1,
        serviceIds: row.serviceIds,
        availability: row.availability,
        linkedMembers: row.linkedMembers,
      }));
    }),
    createProfessional: requireManager
      .input(
        z.object({
          name: z.string().trim().min(2).max(160),
          specialty: z.string().max(120).optional(),
          color: z.string().max(20).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const professional = await createProfessional(
          ctx.workspace.workspaceId,
          input
        );
        if (!professional)
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Não foi possível cadastrar o profissional",
          });
        await logWorkspaceAction({
          workspaceId: ctx.workspace.workspaceId,
          actorUserId: ctx.user.id,
          action: "professional_created",
          summary: `Profissional ${professional.name} cadastrado`,
        });
        return {
          id: professional.id,
          name: professional.name,
          specialty: professional.specialty,
          color: professional.color,
          active: true,
        };
      }),
    updateProfessional: requireManager
      .input(
        z.object({
          professionalId: z.number().int().positive(),
          name: z.string().trim().min(2).max(160).optional(),
          specialty: z.string().max(120).nullable().optional(),
          color: z.string().max(20).optional(),
          active: z.boolean().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { professionalId, ...changes } = input;
        const professional = await updateProfessional(
          ctx.workspace.workspaceId,
          professionalId,
          changes
        );
        if (!professional)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Profissional não encontrado neste workspace",
          });
        await logWorkspaceAction({
          workspaceId: ctx.workspace.workspaceId,
          actorUserId: ctx.user.id,
          action: "professional_updated",
          summary: `Profissional ${professional.name} atualizado`,
        });
        return {
          id: professional.id,
          name: professional.name,
          specialty: professional.specialty,
          color: professional.color,
          active: professional.active === 1,
        };
      }),
    setProfessionalServices: requireManager
      .input(
        z.object({
          professionalId: z.number().int().positive(),
          serviceIds: z.array(z.number().int().positive()).max(200),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const serviceIds = await setProfessionalServices(
          ctx.workspace.workspaceId,
          input.professionalId,
          input.serviceIds
        );
        await logWorkspaceAction({
          workspaceId: ctx.workspace.workspaceId,
          actorUserId: ctx.user.id,
          action: "professional_services_updated",
          summary: `Serviços do profissional ${input.professionalId} atualizados (${serviceIds.length})`,
        });
        return { professionalId: input.professionalId, serviceIds };
      }),
    setProfessionalAvailability: requireManager
      .input(
        z.object({
          professionalId: z.number().int().positive(),
          entries: z
            .array(
              z.object({
                weekday: z.number().int().min(0).max(6),
                startMinute: z.number().int().min(0).max(1440),
                endMinute: z.number().int().min(1).max(1440),
              })
            )
            .max(50),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const invalid = input.entries.find(
          entry => entry.endMinute <= entry.startMinute
        );
        if (invalid)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "O horário final precisa ser maior que o inicial",
          });
        const entries = await replaceAvailability(
          ctx.workspace.workspaceId,
          input.professionalId,
          input.entries
        );
        await logWorkspaceAction({
          workspaceId: ctx.workspace.workspaceId,
          actorUserId: ctx.user.id,
          action: "professional_availability_updated",
          summary: `Agenda semanal do profissional ${input.professionalId} atualizada (${entries.length} faixas)`,
        });
        return { professionalId: input.professionalId, entries };
      }),
    services: protectedProcedure.query(async ({ ctx }) =>
      (
        await listServices(ctx.workspace.workspaceId, { includeInactive: true })
      ).map(service => ({
        id: service.id,
        name: service.name,
        description: service.description,
        durationMinutes: service.durationMinutes,
        priceCents: service.priceCents,
        active: service.active === 1,
        professionalIds: service.professionalIds,
      }))
    ),
    createService: requireManager
      .input(
        z.object({
          name: z.string().trim().min(2).max(160),
          description: z.string().max(4000).optional(),
          durationMinutes: z.number().int().min(5).max(1440).default(60),
          priceCents: z.number().int().min(0).max(100_000_000).default(0),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const service = await createService(ctx.workspace.workspaceId, input);
        if (!service)
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Não foi possível criar o serviço",
          });
        await logWorkspaceAction({
          workspaceId: ctx.workspace.workspaceId,
          actorUserId: ctx.user.id,
          action: "service_created",
          summary: `Serviço ${service.name} criado`,
        });
        return {
          id: service.id,
          name: service.name,
          active: service.active === 1,
        };
      }),
    updateService: requireManager
      .input(
        z.object({
          serviceId: z.number().int().positive(),
          name: z.string().trim().min(2).max(160).optional(),
          description: z.string().max(4000).nullable().optional(),
          durationMinutes: z.number().int().min(5).max(1440).optional(),
          priceCents: z.number().int().min(0).max(100_000_000).optional(),
          active: z.boolean().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { serviceId, ...changes } = input;
        const service = await updateService(
          ctx.workspace.workspaceId,
          serviceId,
          changes
        );
        if (!service)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Serviço não encontrado neste workspace",
          });
        await logWorkspaceAction({
          workspaceId: ctx.workspace.workspaceId,
          actorUserId: ctx.user.id,
          action: "service_updated",
          summary: `Serviço ${service.name} atualizado`,
        });
        return {
          id: service.id,
          name: service.name,
          active: service.active === 1,
        };
      }),
    setServiceProfessionals: requireManager
      .input(
        z.object({
          serviceId: z.number().int().positive(),
          professionalIds: z.array(z.number().int().positive()).max(200),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const professionalIds = await setServiceProfessionals(
          ctx.workspace.workspaceId,
          input.serviceId,
          input.professionalIds
        );
        await logWorkspaceAction({
          workspaceId: ctx.workspace.workspaceId,
          actorUserId: ctx.user.id,
          action: "service_professionals_updated",
          summary: `Profissionais do serviço ${input.serviceId} atualizados (${professionalIds.length})`,
        });
        return { serviceId: input.serviceId, professionalIds };
      }),
    createMember: requireAdministrator
      .input(
        z.object({
          name: z.string().trim().min(2).max(160),
          email: z.string().email(),
          password: z.string().min(8).max(128),
          role: z.enum(["owner", "admin", "manager", "agent"]),
          operationalRole: z.enum([
            "human_attendant",
            "ai_attendant",
            "professional",
          ]),
          professionalId: z.number().int().positive().optional(),
          jobTitle: z.string().trim().max(160).optional(),
          canRegisterPayments: z.boolean().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        try {
          const user = await createLocalWorkspaceMember(
            ctx.workspace.workspaceId,
            input,
            ctx.user.id
          );
          return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: input.role,
            operationalRole: input.operationalRole,
            professionalId: input.professionalId ?? null,
            jobTitle: input.jobTitle,
            canRegisterPayments: input.canRegisterPayments,
          };
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              error instanceof Error
                ? error.message
                : "Não foi possível criar a conta",
          });
        }
      }),
    channels: protectedProcedure.query(async ({ ctx }) => {
      const channels = await listWhatsappChannels(ctx.workspace.workspaceId);
      return channels.map(channel => ({
        id: channel.id,
        provider: channel.provider,
        name: channel.name,
        phoneNumber: channel.phoneNumber,
        configured: Boolean(
          channel.provider === "baileys" &&
            process.env.BAILEYS_BASE_URL &&
            process.env.BAILEYS_API_KEY
        ),
        active: channel.active === 1,
      }));
    }),
    baileysInstances: protectedProcedure.query(async ({ ctx }) => {
      await ensureLegacyBaileysInstance(ctx.workspace.workspaceId);
      return listBaileysInstances(ctx.workspace.workspaceId);
    }),
    createBaileysInstance: requireManager
      .input(z.object({ name: z.string().trim().min(2).max(120) }))
      .mutation(async ({ input, ctx }) => {
        const workspaceId = ctx.workspace.workspaceId;
        const channel = await ensureBaileysChannel(workspaceId);
        const instanceId = `ws${workspaceId}-${crypto.randomUUID()}`;
        await createBaileysInstance(instanceId, input.name);
        try {
          return await createBaileysInstanceRecord(
            workspaceId,
            channel.id,
            instanceId,
            input.name
          );
        } catch (error) {
          await deleteBaileysInstance(instanceId).catch(() => undefined);
          throw error;
        }
      }),
    renameBaileysInstance: requireManager
      .input(
        z.object({
          instanceId: z.string().min(1).max(160),
          name: z.string().trim().min(2).max(120),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const current = await getBaileysInstance(
          ctx.workspace.workspaceId,
          input.instanceId
        );
        if (!current)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Instância WhatsApp não encontrada neste workspace",
          });
        await updateBaileysInstanceName(input.instanceId, input.name);
        try {
          const updated = await updateBaileysInstanceRecordName(
            ctx.workspace.workspaceId,
            input.instanceId,
            input.name
          );
          if (!updated)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Instância WhatsApp não encontrada neste workspace",
            });
          return updated;
        } catch (error) {
          await updateBaileysInstanceName(input.instanceId, current.name).catch(
            () => undefined
          );
          throw error;
        }
      }),
    updateBaileysInstanceSettings: requireManager
      .input(
        z.object({
          instanceId: z.string().trim().min(1).max(160),
          settings: z
            .object({
              rejectCalls: z.boolean(),
              rejectGroups: z.boolean(),
              logCalls: z.boolean(),
              ignoreStatusUpdates: z.boolean(),
            })
            .strict(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const instance = await getBaileysInstance(
          ctx.workspace.workspaceId,
          input.instanceId
        );
        if (!instance)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Instância WhatsApp não encontrada neste workspace",
          });
        await updateBaileysInstanceSettings(input.instanceId, input.settings);
        return getBaileysStatus(input.instanceId);
      }),
    deleteBaileysInstance: requireManager
      .input(
        z.object({
          instanceId: z.string().min(1).max(160),
          confirmDeletion: z.literal(true),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const workspaceId = ctx.workspace.workspaceId;
        const current = await getBaileysInstance(workspaceId, input.instanceId);
        if (!current)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Instância WhatsApp não encontrada neste workspace",
          });
        try {
          await deleteBaileysInstance(input.instanceId);
        } catch (error) {
          if (!isGatewayNotFound(error)) throw error;
        }
        const archived = await archiveBaileysInstance(
          workspaceId,
          input.instanceId
        );
        if (!archived)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Instância já foi removida",
          });
        return { success: true, instanceId: input.instanceId } as const;
      }),
    baileysStatus: protectedProcedure
      .input(z.object({ instanceId: z.string().min(1).max(160) }))
      .query(async ({ input, ctx }) => {
        const instance = await getBaileysInstance(
          ctx.workspace.workspaceId,
          input.instanceId
        );
        if (!instance)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Instância WhatsApp não encontrada neste workspace",
          });
        return getBaileysStatus(instance.instanceId);
      }),
    baileysProfile: protectedProcedure
      .input(z.object({ instanceId: z.string().min(1).max(160) }))
      .query(async ({ input, ctx }) => {
        const instance = await getBaileysInstance(
          ctx.workspace.workspaceId,
          input.instanceId
        );
        if (!instance)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Instância WhatsApp não encontrada neste workspace",
          });
        return getBaileysProfile(instance.instanceId);
      }),
    baileysQr: protectedProcedure
      .input(z.object({ instanceId: z.string().min(1).max(160) }))
      .query(async ({ input, ctx }) => {
        const instance = await getBaileysInstance(
          ctx.workspace.workspaceId,
          input.instanceId
        );
        if (!instance)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Instância WhatsApp não encontrada neste workspace",
          });
        return getBaileysQr(instance.instanceId);
      }),
    connectBaileys: requireManager
      .input(z.object({ instanceId: z.string().min(1).max(160) }))
      .mutation(async ({ input, ctx }) => {
        const instance = await getBaileysInstance(
          ctx.workspace.workspaceId,
          input.instanceId
        );
        if (!instance)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Instância WhatsApp não encontrada neste workspace",
          });
        return connectBaileys(instance.instanceId);
      }),
    requestBaileysPairingCode: requireManager
      .input(
        z.object({
          instanceId: z.string().min(1).max(160),
          phone: z.string().min(8).max(24),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const instance = await getBaileysInstance(
          ctx.workspace.workspaceId,
          input.instanceId
        );
        if (!instance)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Instância WhatsApp não encontrada neste workspace",
          });
        return requestBaileysPairingCode(instance.instanceId, input.phone);
      }),
    disconnectBaileys: requireManager
      .input(
        z.object({
          instanceId: z.string().min(1).max(160),
          logout: z.boolean().default(false),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const instance = await getBaileysInstance(
          ctx.workspace.workspaceId,
          input.instanceId
        );
        if (!instance)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Instância WhatsApp não encontrada neste workspace",
          });
        return disconnectBaileys(instance.instanceId, input.logout);
      }),
  }),

  dashboard: router({
    snapshot: protectedProcedure.query(async ({ ctx }) => {
      const snapshot = await getDashboardSnapshot(ctx.workspace.workspaceId);
      return {
        ...snapshot,
        recentEvents: snapshot.recentEvents.map(event => ({
          ...event,
          createdAt: event.createdAt.toISOString(),
        })),
        upcomingAppointments: snapshot.upcomingAppointments.map(appointment =>
          serializeAgendaAppointment(appointment)
        ),
      };
    }),
  }),

  onboarding: router({
    session: requireOnboardingEditor.query(({ ctx }) =>
      getOnboardingSession(ctx.workspace.workspaceId)
    ),
    start: requireOnboardingEditor.mutation(async ({ ctx }) => {
      const session = await startOnboardingSession(ctx.workspace.workspaceId, ctx.user.id);
      await logWorkspaceAction({
        workspaceId: ctx.workspace.workspaceId,
        actorUserId: ctx.user.id,
        action: "onboarding_started",
        summary: "Sessão de onboarding iniciada ou retomada",
      });
      return session;
    }),
    defer: requireOnboardingEditor.mutation(async ({ ctx }) => {
      const session = await pauseOnboardingSession(ctx.workspace.workspaceId);
      await logWorkspaceAction({
        workspaceId: ctx.workspace.workspaceId,
        actorUserId: ctx.user.id,
        action: "onboarding_deferred",
        summary: "Onboarding pausado pelo operador",
      });
      return session;
    }),
    profile: requireOnboardingEditor.query(({ ctx }) =>
      getOnboardingProfile(ctx.workspace.workspaceId)
    ),
    metrics: requireOnboardingEditor
      .input(z.object({ windowDays: z.number().int().min(1).max(90).default(30) }).optional())
      .query(({ input, ctx }) =>
        getOnboardingTelemetrySummary(ctx.workspace.workspaceId, input?.windowDays ?? 30)
      ),
    versions: requireOnboardingEditor.query(({ ctx }) =>
      listOnboardingPublishedVersions(ctx.workspace.workspaceId)
    ),
    rollback: requireOnboardingEditor
      .input(z.object({ version: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        try {
          const result = await rollbackOnboardingPublishedVersion(
            ctx.workspace.workspaceId,
            input.version,
            ctx.user.id
          );
          await logWorkspaceAction({
            workspaceId: ctx.workspace.workspaceId,
            actorUserId: ctx.user.id,
            action: "onboarding_published_rollback",
            summary: `Rollback da versão ${input.version} publicado como versão ${result.version}`,
          });
          return result;
        } catch (error) {
          if (error instanceof Error && error.message === "ONBOARDING_PUBLISHED_VERSION_NOT_FOUND")
            throw new TRPCError({ code: "NOT_FOUND", message: "Versão publicada não encontrada neste workspace." });
          throw error;
        }
      }),
    governance: requireOnboardingEditor.query(({ ctx }) =>
      getOnboardingGovernance(ctx.workspace.workspaceId)
    ),
    setSourceConsent: requireOnboardingEditor
      .input(z.object({
        source: z.enum(["transcription", "llm"]),
        granted: z.boolean(),
        policyVersion: z.string().trim().min(1).max(64),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await setOnboardingSourceConsent(
          ctx.workspace.workspaceId,
          ctx.user.id,
          input.source,
          input.granted,
          input.policyVersion
        );
        await logWorkspaceAction({
          workspaceId: ctx.workspace.workspaceId,
          actorUserId: ctx.user.id,
          action: input.granted ? "onboarding_source_consent_granted" : "onboarding_source_consent_revoked",
          summary: `${input.granted ? "Consentimento concedido" : "Consentimento revogado"}: ${input.source}`,
        });
        return result;
      }),
    saveRetentionPolicy: requireOnboardingEditor
      .input(z.object({
        rawArtifactDays: z.number().int().min(1).max(90),
        derivedDataDays: z.number().int().min(30).max(3650),
        policyVersion: z.string().trim().min(1).max(64),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          const result = await saveOnboardingRetentionPolicy(
            ctx.workspace.workspaceId,
            ctx.user.id,
            { rawArtifactDays: input.rawArtifactDays, derivedDataDays: input.derivedDataDays },
            input.policyVersion
          );
          await logWorkspaceAction({
            workspaceId: ctx.workspace.workspaceId,
            actorUserId: ctx.user.id,
            action: "onboarding_retention_policy_updated",
            summary: `Retenção atualizada: bruto ${input.rawArtifactDays}d / derivado ${input.derivedDataDays}d`,
          });
          return result;
        } catch (error) {
          if (error instanceof Error && error.message.startsWith("ONBOARDING_RETENTION_INVALID:"))
            throw new TRPCError({ code: "BAD_REQUEST", message: "A política de retenção está fora dos limites permitidos." });
          throw error;
        }
      }),
    confirmStep: requireOnboardingEditor
      .input(z.object({ stepKey: z.enum(["identity", "offering", "operations", "guardrails", "voice"]) }))
      .mutation(async ({ input, ctx }) => {
        try {
          const result = await confirmOnboardingStep(
            ctx.workspace.workspaceId,
            input.stepKey,
            ctx.user.id
          );
          await logWorkspaceAction({
            workspaceId: ctx.workspace.workspaceId,
            actorUserId: ctx.user.id,
            action: "onboarding_step_confirmed",
            summary: `Bloco de onboarding confirmado: ${input.stepKey}`,
          });
          return result;
        } catch (error) {
          if (error instanceof Error && error.message === "ONBOARDING_CONFLICTS_UNRESOLVED")
            throw new TRPCError({ code: "BAD_REQUEST", message: "Resolva os conflitos deste bloco antes de confirmar." });
          throw error;
        }
      }),
    resolveConflict: requireOnboardingEditor
      .input(z.object({
        stepKey: z.enum(["identity", "offering", "operations", "guardrails", "voice"]),
        conflictKey: z.string().trim().min(1).max(160),
        resolution: z.enum(["accepted_current", "dismissed"]),
        note: z.string().trim().min(1).max(1000),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          const result = await resolveOnboardingConflict(
            ctx.workspace.workspaceId,
            input.stepKey,
            input.conflictKey,
            input.resolution,
            input.note,
            ctx.user.id
          );
          await logWorkspaceAction({
            workspaceId: ctx.workspace.workspaceId,
            actorUserId: ctx.user.id,
            action: "onboarding_conflict_resolved",
            summary: `Conflito resolvido no bloco ${input.stepKey}: ${input.resolution}`,
          });
          return result;
        } catch (error) {
          if (error instanceof Error && error.message === "ONBOARDING_CONFLICT_NOT_FOUND")
            throw new TRPCError({ code: "BAD_REQUEST", message: "Este conflito já foi resolvido ou não existe mais." });
          throw error;
        }
      }),
    answerFollowUp: requireOnboardingEditor
      .input(z.object({
        stepKey: z.enum(["identity", "offering", "operations", "guardrails", "voice"]),
        field: z.string().trim().min(1).max(80),
        value: z.string().max(8_000),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          const result = await applyOnboardingFollowUpAnswer({
            workspaceId: ctx.workspace.workspaceId,
            stepKey: input.stepKey,
            field: input.field,
            value: input.value,
            updatedBy: ctx.user.id,
          });
          await logWorkspaceAction({
            workspaceId: ctx.workspace.workspaceId,
            actorUserId: ctx.user.id,
            action: "onboarding_follow_up_answered",
            summary: `Pergunta de acompanhamento respondida no bloco ${input.stepKey}`,
          });
          const session = await getOnboardingSession(ctx.workspace.workspaceId);
          if (session)
            await recordOnboardingTelemetry({
              workspaceId: ctx.workspace.workspaceId,
              sessionId: session.id,
              eventType: "follow_up_answered",
              stepKey: input.stepKey,
              source: "human_form",
            });
          return result;
        } catch (error) {
          if (error instanceof Error && error.message === "ONBOARDING_FOLLOW_UP_FIELD_INVALID")
            throw new TRPCError({ code: "BAD_REQUEST", message: "Este campo não pertence ao bloco selecionado." });
          if (error instanceof Error && error.message === "ONBOARDING_FOLLOW_UP_VALUE_REQUIRED")
            throw new TRPCError({ code: "BAD_REQUEST", message: "Informe uma resposta ou escreva ‘decidir depois’." });
          throw error;
        }
      }),
    answerConflict: requireOnboardingEditor
      .input(z.object({
        stepKey: z.enum(["identity", "offering", "operations", "guardrails", "voice"]),
        conflictKey: z.string().trim().min(1).max(160),
        value: z.string().trim().min(1).max(2_000),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          const result = await answerOnboardingConflict({
            workspaceId: ctx.workspace.workspaceId,
            stepKey: input.stepKey,
            conflictKey: input.conflictKey,
            value: input.value,
            resolvedBy: ctx.user.id,
          });
          await logWorkspaceAction({
            workspaceId: ctx.workspace.workspaceId,
            actorUserId: ctx.user.id,
            action: "onboarding_conflict_follow_up_answered",
            summary: `Esclarecimento de conflito registrado no bloco ${input.stepKey}`,
          });
          const session = await getOnboardingSession(ctx.workspace.workspaceId);
          if (session)
            await recordOnboardingTelemetry({
              workspaceId: ctx.workspace.workspaceId,
              sessionId: session.id,
              eventType: "conflict_follow_up_answered",
              stepKey: input.stepKey,
              source: "human_form",
            });
          return result;
        } catch (error) {
          if (error instanceof Error && error.message === "ONBOARDING_CONFLICT_NOT_FOUND")
            throw new TRPCError({ code: "BAD_REQUEST", message: "Este conflito já foi resolvido ou não existe mais." });
          throw error;
        }
      }),
    autosave: requireOnboardingEditor
      .input(
        z.object({
          profile: z.object({
            businessName: z.string().max(160),
            segment: z.string().max(80),
            description: z.string().max(4000),
            services: z.string().max(8000),
            serviceArea: z.string().max(2000),
            businessHours: z.string().max(2000),
            toneOfVoice: z.string().max(500),
            forbiddenWords: z.string().max(2000),
            faq: z.string().max(8000),
            cancellationPolicy: z.string().max(2000),
            humanHandoffRules: z.string().max(2000),
            qualificationRules: z.string().max(2000),
          }),
        })
      )
      .mutation(({ input, ctx }) =>
        saveOnboardingProfile(ctx.workspace.workspaceId, input.profile, false, ctx.user.id)
      ),
    save: requireOnboardingEditor
      .input(
        z.object({
          profile: z.object({
            businessName: z.string().max(160),
            segment: z.string().max(80),
            description: z.string().max(4000),
            services: z.string().max(8000),
            serviceArea: z.string().max(2000),
            businessHours: z.string().max(2000),
            toneOfVoice: z.string().max(500),
            forbiddenWords: z.string().max(2000),
            faq: z.string().max(8000),
            cancellationPolicy: z.string().max(2000),
            humanHandoffRules: z.string().max(2000),
            qualificationRules: z.string().max(2000),
          }),
          publish: z.boolean().default(false),
        })
      )
      .mutation(async ({ input, ctx }) => {
        try {
          const result = input.publish
              ? await (async () => {
                await saveOnboardingProfile(ctx.workspace.workspaceId, input.profile, false, ctx.user.id, false);
                return publishOnboardingDraft(ctx.workspace.workspaceId, ctx.user.id);
              })()
            : await saveOnboardingProfile(ctx.workspace.workspaceId, input.profile, false, ctx.user.id);
          await logWorkspaceAction({
            workspaceId: ctx.workspace.workspaceId,
            actorUserId: ctx.user.id,
            action: input.publish ? "onboarding_published" : "onboarding_saved",
            summary: input.publish
              ? `Onboarding publicado na versão ${result.version}`
              : "Rascunho de onboarding salvo",
          });
          return result;
        } catch (error) {
          if (error instanceof Error && error.message.startsWith("ONBOARDING_INCOMPLETE:"))
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Complete antes de publicar: ${error.message.slice("ONBOARDING_INCOMPLETE:".length)}`,
            });
          if (error instanceof Error && error.message.startsWith("ONBOARDING_CONFIRMATION_REQUIRED:"))
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Revise e confirme cada bloco obrigatório antes de publicar.",
            });
          if (error instanceof Error && error.message.startsWith("ONBOARDING_CONFLICTS_UNRESOLVED:"))
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Resolva os conflitos dos blocos obrigatórios antes de publicar.",
            });
          throw error;
        }
      }),
    simulate: requireOnboardingEditor
      .input(z.object({
        profile: z.object({
          businessName: z.string().max(160),
          segment: z.string().max(80),
          description: z.string().max(4000),
          services: z.string().max(8000),
          serviceArea: z.string().max(2000),
          businessHours: z.string().max(2000),
          toneOfVoice: z.string().max(500),
          forbiddenWords: z.string().max(2000),
          faq: z.string().max(8000),
          cancellationPolicy: z.string().max(2000),
          humanHandoffRules: z.string().max(2000),
          qualificationRules: z.string().max(2000),
        }),
        message: z.string().trim().min(1).max(2000),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          const result = await simulateOnboardingMessage({
            workspaceId: ctx.workspace.workspaceId,
            profile: input.profile,
            message: input.message,
          });
          await logWorkspaceAction({
            workspaceId: ctx.workspace.workspaceId,
            actorUserId: ctx.user.id,
            action: "onboarding_simulation_run",
            summary: "Simulação do onboarding executada sem provider externo",
          });
          return result;
        } catch (error) {
          if (error instanceof Error && error.message === "ONBOARDING_SIMULATION_MESSAGE_REQUIRED")
            throw new TRPCError({ code: "BAD_REQUEST", message: "Informe uma mensagem para simular." });
          throw error;
        }
      }),
    extractProposal: requireOnboardingEditor
      .input(
        z.object({
          stepKey: z.enum(["identity", "offering", "operations", "guardrails", "voice"]),
          text: z.string().trim().min(1).max(12_000),
          language: z.string().trim().min(2).max(16).default("pt-BR"),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const workspaceId = ctx.workspace.workspaceId;
        try {
          await assertOnboardingSourceConsent(workspaceId, "llm");
        } catch (error) {
          if (error instanceof Error && error.message.startsWith("ONBOARDING_SOURCE_CONSENT_REQUIRED:"))
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Conceda o consentimento para processamento por IA antes de estruturar a resposta.",
            });
          throw error;
        }
        try {
          const proposal = await extractOnboardingStructuredProposal(input);
          const saved = await persistOnboardingStepAnswerProposal({
            workspaceId,
            stepKey: input.stepKey,
            answer: proposal.answer,
            source: "llm",
            confidence: proposal.confidence,
            missing: proposal.missing,
            conflicts: proposal.conflicts,
            updatedBy: ctx.user.id,
          });
          await logWorkspaceAction({
            workspaceId,
            actorUserId: ctx.user.id,
            action: "onboarding_structured_proposal_created",
            summary: `Proposta estruturada criada como rascunho para o bloco ${input.stepKey}`,
          });
          const session = await getOnboardingSession(workspaceId);
          if (session)
            await recordOnboardingTelemetry({
              workspaceId,
              sessionId: session.id,
              eventType: "llm_proposal_created",
              stepKey: input.stepKey,
              source: "llm",
              inputTokens: proposal.llm.inputTokens,
              outputTokens: proposal.llm.outputTokens,
              totalTokens: proposal.llm.totalTokens,
              metadata: { model: proposal.llm.model },
            });
          return saved;
        } catch (error) {
          if (error instanceof Error && error.message === "ONBOARDING_PROPOSAL_TEXT_REQUIRED")
            throw new TRPCError({ code: "BAD_REQUEST", message: "Informe uma correção antes de estruturar a resposta." });
          throw new TRPCError({ code: "BAD_GATEWAY", message: "Não foi possível estruturar a resposta agora. Revise o texto ou use o formulário." });
        }
      }),
  }),

  voice: router({
    upload: requireOnboardingEditor
      .input(
        z.object({
          sessionId: z.number().int().positive(),
          stepKey: z.enum(["identity", "offering", "operations", "guardrails", "voice"]),
          mimeType: z.string().trim().min(1).max(120),
          durationMs: z.number().int().positive().max(120_000).optional(),
          correction: z.boolean().default(false),
          audioBase64: z.string().min(1).max(23_000_000),
        })
      )
      .mutation(async ({ input, ctx }) => {
        try {
          await assertOnboardingSourceConsent(ctx.workspace.workspaceId, "transcription");
        } catch (error) {
          if (error instanceof Error && error.message.startsWith("ONBOARDING_SOURCE_CONSENT_REQUIRED:"))
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Conceda o consentimento para transcrição antes de enviar um áudio.",
            });
          throw error;
        }

        const validation = validateOnboardingAudioMetadata({
          mimeType: input.mimeType,
          durationMs: input.durationMs,
        });
        if (!validation.valid)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Formato ou duração do áudio não suportado.",
          });
        if (input.correction && (!input.durationMs || input.durationMs > 30_000))
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "A correção curta deve ter no máximo 30 segundos.",
          });

        let audioBuffer: Buffer;
        try {
          audioBuffer = decodeOnboardingAudioBase64(input.audioBase64, validation.mimeType);
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          const userMessage = message === "ONBOARDING_AUDIO_TOO_LARGE"
            ? `O áudio ultrapassa o limite de ${Math.floor(ONBOARDING_AUDIO_MAX_BYTES / (1024 * 1024))} MB.`
            : "O arquivo de áudio é inválido ou está vazio.";
          throw new TRPCError({ code: "BAD_REQUEST", message: userMessage });
        }

        const session = await getOnboardingSession(ctx.workspace.workspaceId);
        if (!session || session.id !== input.sessionId)
          throw new TRPCError({ code: "NOT_FOUND", message: "Sessão de onboarding não encontrada." });

        const storageKey = buildOnboardingAudioStorageKey(
          ctx.workspace.workspaceId,
          session.id,
          validation.mimeType
        );
        let uploaded: { key: string };
        try {
          uploaded = await storagePut(storageKey, audioBuffer, validation.mimeType);
        } catch {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Não foi possível guardar o áudio com segurança. Tente novamente.",
          });
        }

        const asset = await createOnboardingAudioAsset({
          sessionId: session.id,
          workspaceId: ctx.workspace.workspaceId,
          stepKey: input.stepKey,
          storageKey: uploaded.key,
          mimeType: validation.mimeType,
          sizeBytes: audioBuffer.length,
          durationMs: input.durationMs,
          sha256: sha256ForOnboardingAudio(audioBuffer),
          createdByUserId: ctx.user.id,
        });
        if (!asset)
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível registrar o áudio." });

        await logWorkspaceAction({
          workspaceId: ctx.workspace.workspaceId,
          actorUserId: ctx.user.id,
          action: input.correction
            ? "onboarding_audio_correction_uploaded"
            : "onboarding_audio_uploaded",
          summary: `${input.correction ? "Correção curta recebida" : "Áudio recebido"} para o bloco ${input.stepKey}`,
        });
        await recordOnboardingTelemetry({
          workspaceId: ctx.workspace.workspaceId,
          sessionId: session.id,
          eventType: "audio_uploaded",
          stepKey: input.stepKey,
          source: "transcription",
          durationMs: input.durationMs ?? null,
          correction: input.correction,
          metadata: { sizeBytes: audioBuffer.length, mimeType: validation.mimeType },
        });
        return {
          assetId: asset.id,
          sessionId: asset.sessionId,
          stepKey: asset.stepKey,
          mimeType: asset.mimeType,
          sizeBytes: asset.sizeBytes,
          durationMs: asset.durationMs,
          transcriptStatus: asset.transcriptStatus,
          expiresAt: asset.expiresAt,
        };
      }),
    transcribe: requireOnboardingEditor
      .input(
        z.object({
          assetId: z.number().int().positive(),
          language: z.string().trim().min(2).max(16).default("pt"),
          prompt: z.string().trim().max(500).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const workspaceId = ctx.workspace.workspaceId;
        try {
          await assertOnboardingSourceConsent(workspaceId, "transcription");
        } catch (error) {
          if (error instanceof Error && error.message.startsWith("ONBOARDING_SOURCE_CONSENT_REQUIRED:"))
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Conceda o consentimento para transcrição antes de processar o áudio.",
            });
          throw error;
        }

        const asset = await getOnboardingAudioAssetForWorkspace(workspaceId, input.assetId);
        if (!asset)
          throw new TRPCError({ code: "NOT_FOUND", message: "Áudio não encontrado neste workspace." });
        const existing = await getOnboardingAudioTranscription(workspaceId, input.assetId);
        if (asset.transcriptStatus === "completed" && existing?.status === "completed")
          return {
            assetId: asset.id,
            status: "completed" as const,
            language: existing.language,
            text: existing.text ?? "",
            segments: existing.segments ?? [],
          };

        const claim = await claimOnboardingAudioTranscription(workspaceId, input.assetId);
        if (!claim.claimed) {
          if (claim.reason === "completed" && existing?.status === "completed")
            return {
              assetId: asset.id,
              status: "completed" as const,
              language: existing.language,
              text: existing.text ?? "",
              segments: existing.segments ?? [],
            };
          throw new TRPCError({
            code: "CONFLICT",
            message: "Este áudio já está sendo processado. Aguarde alguns segundos e tente novamente.",
          });
        }

        try {
          const signedUrl = await storageGetSignedUrl(claim.asset.storageKey);
          const result = await transcribeAudioForWorkspace(workspaceId, {
            audioUrl: signedUrl,
            language: input.language,
            prompt: input.prompt,
          });
          if ("error" in result) {
            await persistOnboardingAudioTranscription(workspaceId, input.assetId, {
              ok: false,
              errorCode: result.code,
            });
            await recordOnboardingTelemetry({
              workspaceId,
              sessionId: claim.asset.sessionId,
              eventType: "audio_transcription_failed",
              stepKey: claim.asset.stepKey,
              source: "transcription",
              durationMs: claim.asset.durationMs,
              metadata: { errorCode: result.code },
            });
            if (result.code === "CONSENT_REQUIRED")
              throw new TRPCError({ code: "BAD_REQUEST", message: "O consentimento para transcrição não está ativo." });
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Não foi possível transcrever este áudio. Você pode tentar novamente ou responder por texto.",
            });
          }

          const transcription = await persistOnboardingAudioTranscription(workspaceId, input.assetId, {
            ok: true,
            provider: "builtin_whisper",
            model: "whisper-1",
            language: result.language,
            text: result.text,
            segments: result.segments,
          });
          await logWorkspaceAction({
            workspaceId,
            actorUserId: ctx.user.id,
            action: "onboarding_audio_transcribed",
            summary: `Áudio transcrito para o bloco ${claim.asset.stepKey}`,
          });
          await recordOnboardingTelemetry({
            workspaceId,
            sessionId: claim.asset.sessionId,
            eventType: "audio_transcribed",
            stepKey: claim.asset.stepKey,
            source: "transcription",
            durationMs: claim.asset.durationMs,
            metadata: { provider: "builtin_whisper", model: "whisper-1" },
          });
          return {
            assetId: claim.asset.id,
            status: "completed" as const,
            language: transcription?.language ?? result.language,
            text: transcription?.text ?? result.text,
            segments: transcription?.segments ?? result.segments,
            duration: result.duration,
          };
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          await persistOnboardingAudioTranscription(workspaceId, input.assetId, {
            ok: false,
            errorCode: "SERVICE_ERROR",
          });
          if (claim?.asset)
            await recordOnboardingTelemetry({
              workspaceId,
              sessionId: claim.asset.sessionId,
              eventType: "audio_transcription_failed",
              stepKey: claim.asset.stepKey,
              source: "transcription",
              durationMs: claim.asset.durationMs,
              metadata: { errorCode: "SERVICE_ERROR" },
            });
          throw new TRPCError({
            code: "BAD_GATEWAY",
            message: "O serviço de transcrição está indisponível. Tente novamente ou responda por texto.",
          });
        }
      }),
  }),

  agent: router({
    config: requirePlatformAdministrator.query(async ({ ctx }) => {
      const config = await getNativeAgentConfig(ctx.workspace.workspaceId);
      return {
        ...config,
        credentials: {
          llmConfigured: Boolean(ENV.forgeApiKey),
          llmSource: "Variáveis do ambiente do servidor",
        },
        providers: Object.fromEntries(
          Object.entries(config.llm.providers).map(([id, provider]) => [
            id,
            {
              enabled: provider.enabled,
              baseUrl: provider.baseUrl,
              configured: Boolean(provider.apiKey),
              maskedKey: provider.apiKey,
            },
          ])
        ),
      };
    }),
    save: requirePlatformAdministrator
      .input(
        z.object({
          enabled: z.boolean(),
          model: z.string().trim().min(1).max(120),
          systemPrompt: z.string().max(30000),
          maxSteps: z.number().int().min(1).max(8),
          llm: z.object({
            providers: z.object({
              nvidia_nim: z.object({
                enabled: z.boolean(),
                baseUrl: z.string().max(500),
                apiKey: z.string().max(500),
              }),
              google_gemini: z.object({
                enabled: z.boolean(),
                baseUrl: z.string().max(500),
                apiKey: z.string().max(500),
              }),
              openai_compatible: z.object({
                enabled: z.boolean(),
                baseUrl: z.string().max(500),
                apiKey: z.string().max(500),
              }),
            }),
            routing: z.object({
              text: z.object({
                provider: z.enum([
                  "nvidia_nim",
                  "google_gemini",
                  "openai_compatible",
                ]),
                model: z.string().max(200),
                baseUrl: z.string().max(500).optional(),
                apiKey: z.string().max(500).optional(),
              }),
              vision: z.object({
                provider: z.enum([
                  "nvidia_nim",
                  "google_gemini",
                  "openai_compatible",
                ]),
                model: z.string().max(200),
                baseUrl: z.string().max(500).optional(),
                apiKey: z.string().max(500).optional(),
              }),
              audio: z.object({
                provider: z.enum([
                  "nvidia_nim",
                  "google_gemini",
                  "openai_compatible",
                ]),
                model: z.string().max(200),
                baseUrl: z.string().max(500).optional(),
                apiKey: z.string().max(500).optional(),
              }),
              document: z.object({
                provider: z.enum([
                  "nvidia_nim",
                  "google_gemini",
                  "openai_compatible",
                ]),
                model: z.string().max(200),
                baseUrl: z.string().max(500).optional(),
                apiKey: z.string().max(500).optional(),
              }),
            }),
          }),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const result = await saveNativeAgentConfig(
          ctx.workspace.workspaceId,
          input
        );
        await logWorkspaceAction({
          workspaceId: ctx.workspace.workspaceId,
          actorUserId: ctx.user.id,
          action: "native_agent_config_updated",
          summary: `Agente nativo ${result.enabled ? "ativado" : "pausado"}; modelo ${result.model}`,
        });
        return result;
      }),
    testConnection: requirePlatformAdministrator
      .input(
        z.object({
          capability: z.enum(["text", "vision", "audio", "document"]),
          provider: z.enum([
            "nvidia_nim",
            "google_gemini",
            "openai_compatible",
          ]),
          baseUrl: z.string().trim().max(500),
          apiKey: z.string().max(500),
          model: z.string().trim().max(200),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const startedAt = Date.now();
        const runtime = await getNativeAgentRuntimeConfig(
          ctx.workspace.workspaceId
        );
        const route = runtime.llm.routing[input.capability];
        const storedApiKey =
          route.apiKey || runtime.llm.providers[input.provider].apiKey;
        const settings: AgentProviderSettings = {
          ...runtime.llm,
          routing: {
            ...runtime.llm.routing,
            [input.capability]: {
              ...route,
              provider: input.provider,
              baseUrl: input.baseUrl || route.baseUrl,
              apiKey: input.apiKey.startsWith("••••")
                ? storedApiKey
                : input.apiKey,
              model: input.model || route.model,
            },
          },
        };
        if (!settings.routing[input.capability].baseUrl)
          return { ready: false, message: "Informe a URL da API." };
        if (!settings.routing[input.capability].apiKey)
          return { ready: false, message: "Informe a API key." };
        if (!settings.routing[input.capability].model)
          return { ready: false, message: "Informe o modelo." };
        try {
          const result = await invokeConfiguredLLM(
            settings,
            input.capability as AgentCapability,
            {
              model: settings.routing[input.capability].model,
              messages: [
                {
                  role: "user",
                  content: "Responda apenas com OK.",
                },
              ],
              maxTokens: 5,
            }
          );
          return {
            ready: true,
            model: result.model || settings.routing[input.capability].model,
            latencyMs: Date.now() - startedAt,
            message: "Conexão confirmada. A API respondeu corretamente.",
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Falha desconhecida";
          return {
            ready: false,
            latencyMs: Date.now() - startedAt,
            message: message
              .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
              .slice(0, 240),
          };
        }
      }),
    models: requirePlatformAdministrator.query(async () => {
      if (!ENV.forgeApiKey) return { data: [], configured: false };
      try {
        const response = await listLLMModels();
        return { data: response.data, configured: true };
      } catch {
        return { data: [], configured: false };
      }
    }),
  }),

  development: router({
    resetWorkspace: requirePlatformAdministrator
      .input(
        z.object({ confirmation: z.literal("APAGAR DADOS DO FORTE PANEL") })
      )
      .mutation(async ({ ctx }) => {
        const result = await resetWorkspaceDevelopmentData();
        await logWorkspaceAction({
          workspaceId: ctx.workspace.workspaceId,
          actorUserId: ctx.user.id,
          action: "development_workspace_reset",
          summary:
            "Dados operacionais do Forte Panel apagados pelo administrador",
        });
        return result;
      }),
  }),

  billing: router({
    quotes: requireFinancial.query(async ({ ctx }) => {
      const items = await listQuotes(ctx.workspace.workspaceId);
      return items.map(item => ({
        ...item,
        dueDate: item.dueDate?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      }));
    }),
    createQuote: requireManager
      .input(
        z.object({
          contactId: z.number().int().positive(),
          serviceName: z.string().trim().min(1).max(160),
          description: z.string().max(4000).optional(),
          quotedCents: z.number().int().nonnegative(),
          receivedCents: z.number().int().nonnegative().default(0),
          status: z
            .enum([
              "orcamento",
              "aguardando_aprovacao",
              "aprovado",
              "sinal_pendente",
              "parcialmente_pago",
              "pago",
              "cancelado",
            ])
            .default("orcamento"),
          dueDate: z.coerce.date().optional(),
          notes: z.string().max(1000).optional(),
        })
      )
      .mutation(({ input, ctx }) =>
        createQuote(input, ctx.workspace.workspaceId, ctx.user.id)
      ),
    updatePayment: requireFinancial
      .input(
        z.object({
          id: z.number().int().positive(),
          receivedCents: z.number().int().nonnegative(),
          status: z.enum([
            "orcamento",
            "aguardando_aprovacao",
            "aprovado",
            "sinal_pendente",
            "parcialmente_pago",
            "pago",
            "cancelado",
          ]),
        })
      )
      .mutation(({ input, ctx }) =>
        updateQuotePayment(
          input.id,
          input.receivedCents,
          input.status,
          ctx.workspace.workspaceId,
          ctx.user.id
        )
      ),
  }),

  agenda: router({
    snapshot: protectedProcedure.query(async ({ ctx }) => {
      const access = await resolveWorkspaceAccess(ctx.user, ctx.workspace);
      if (!access.memberActive)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Seu acesso está desativado neste workspace",
        });
      const professionalId = access.canSeeFullAgenda
        ? undefined
        : (access.professionalId ?? undefined);
      const snapshot = await getAgendaSnapshot(
        ctx.workspace.workspaceId,
        professionalId
      );
      return {
        timezone: snapshot.timezone,
        services: snapshot.services,
        professionals: snapshot.professionals,
        appointments: snapshot.appointments.map(serializeAgendaAppointment),
        availability: "availability" in snapshot ? snapshot.availability : [],
        restrictedToOwnAgenda: access.restrictedToOwnAgenda,
      };
    }),
    create: protectedProcedure
      .input(
        z.object({
          contactId: z.number().int().positive().optional(),
          serviceId: z.number().int().positive(),
          professionalId: z.number().int().positive(),
          startsAt: z.coerce.date(),
          endsAt: z.coerce.date(),
          notes: z.string().max(500).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const access = await resolveWorkspaceAccess(ctx.user, ctx.workspace);
        if (!access.memberActive)
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Seu acesso está desativado neste workspace",
          });
        if (
          !access.canSeeFullAgenda &&
          input.professionalId !== access.professionalId
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Você só pode agendar atendimentos vinculados a você",
          });
        }
        if (input.endsAt <= input.startsAt)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "O horário final precisa ser maior que o inicial",
          });
        const allowed = await professionalCanExecuteService(
          ctx.workspace.workspaceId,
          input.professionalId,
          input.serviceId
        );
        if (!allowed)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Este profissional não executa o serviço selecionado",
          });
        let appointment;
        try {
          appointment = await createAgendaAppointment(
            ctx.workspace.workspaceId,
            input
          );
        } catch (error) {
          throwScheduleTrpcError(error);
        }
        if (!appointment)
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Não foi possível criar o agendamento",
          });
        await logWorkspaceAction({
          workspaceId: ctx.workspace.workspaceId,
          actorUserId: ctx.user.id,
          action: "appointment_created",
          summary: `Agendamento ${appointment.id} criado para ${input.startsAt.toISOString()}`,
        });
        return { id: appointment.id, status: appointment.status };
      }),
    updateStatus: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          status: z.enum(["confirmed", "in_progress", "completed", "no_show"]),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const access = await resolveWorkspaceAccess(ctx.user, ctx.workspace);
        if (!access.memberActive)
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Seu acesso está desativado neste workspace",
          });
        const restriction = access.canSeeFullAgenda
          ? undefined
          : (access.professionalId ?? -1);
        const updated = await transitionAppointment({
          workspaceId: ctx.workspace.workspaceId,
          appointmentId: input.id,
          status: input.status,
          actorUserId: ctx.user.id,
          restrictToProfessionalId: restriction,
        });
        if (!updated)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Agendamento não encontrado para o seu acesso",
          });
        await logWorkspaceAction({
          workspaceId: ctx.workspace.workspaceId,
          actorUserId: ctx.user.id,
          action: `appointment_${input.status}`,
          summary: `Agendamento ${input.id} atualizado para ${input.status}`,
        });
        return { id: updated.id, status: updated.status };
      }),
    cancel: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const access = await resolveWorkspaceAccess(ctx.user, ctx.workspace);
        if (!access.memberActive)
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Seu acesso está desativado neste workspace",
          });
        if (access.canSeeFullAgenda) {
          const updated = await cancelAgendaAppointment(
            ctx.workspace.workspaceId,
            input.id
          );
          if (!updated)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Agendamento não encontrado",
            });
          await logWorkspaceAction({
            workspaceId: ctx.workspace.workspaceId,
            actorUserId: ctx.user.id,
            action: "appointment_cancelled",
            summary: `Agendamento ${input.id} cancelado`,
          });
          return { id: updated.id, status: updated.status };
        }
        const updated = await transitionAppointment({
          workspaceId: ctx.workspace.workspaceId,
          appointmentId: input.id,
          status: "cancelled",
          actorUserId: ctx.user.id,
          restrictToProfessionalId: access.professionalId ?? -1,
        });
        if (!updated)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Agendamento não encontrado para o seu acesso",
          });
        await logWorkspaceAction({
          workspaceId: ctx.workspace.workspaceId,
          actorUserId: ctx.user.id,
          action: "appointment_cancelled",
          summary: `Agendamento ${input.id} cancelado pelo profissional`,
        });
        return { id: updated.id, status: updated.status };
      }),
    updateMyStatus: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          status: z.enum(["confirmed", "in_progress", "completed", "no_show"]),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const access = await resolveWorkspaceAccess(ctx.user, ctx.workspace);
        if (!access.memberActive)
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Seu acesso está desativado neste workspace",
          });
        if (!access.professionalId)
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Seu usuário não está vinculado a um profissional",
          });
        const updated = await transitionAppointment({
          workspaceId: ctx.workspace.workspaceId,
          appointmentId: input.id,
          status: input.status,
          actorUserId: ctx.user.id,
          restrictToProfessionalId: access.professionalId,
        });
        if (!updated)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Este atendimento não pertence à sua agenda",
          });
        await logWorkspaceAction({
          workspaceId: ctx.workspace.workspaceId,
          actorUserId: ctx.user.id,
          action: `appointment_${input.status}`,
          summary: `Profissional atualizou o atendimento ${input.id} para ${input.status}`,
        });
        return { id: updated.id, status: updated.status };
      }),
  }),

  professional: router({
    myAgenda: protectedProcedure.query(async ({ ctx }) => {
      const access = await resolveWorkspaceAccess(ctx.user, ctx.workspace);
      if (!access.professionalId) {
        return {
          linked: false as const,
          timezone: ctx.workspace.timezone,
          professionalId: null,
          professionalName: null,
          professionalSpecialty: null,
          professionalColor: null,
          todayCount: 0,
          weekCount: 0,
          monthCount: 0,
          pendingCount: 0,
          completedCount: 0,
          nextAppointment: null,
          today: [],
          upcoming: [],
          week: [],
          month: [],
          clients: [],
        };
      }
      const snapshot = await getProfessionalPortalSnapshot(
        ctx.workspace.workspaceId,
        access.professionalId
      );
      return {
        linked: true as const,
        ...snapshot,
        today: snapshot.today.map(serializeAgendaAppointment),
        upcoming: snapshot.upcoming.map(serializeAgendaAppointment),
        week: snapshot.week.map(serializeAgendaAppointment),
        month: snapshot.month.map(serializeAgendaAppointment),
        nextAppointment: snapshot.nextAppointment
          ? serializeAgendaAppointment(snapshot.nextAppointment)
          : null,
        clients: snapshot.clients.map(client => ({
          ...client,
          lastAppointmentAt: client.lastAppointmentAt.toISOString(),
        })),
      };
    }),
    myAvailability: protectedProcedure.query(async ({ ctx }) => {
      const access = await resolveWorkspaceAccess(ctx.user, ctx.workspace);
      if (!access.professionalId)
        return { linked: false as const, entries: [] };
      const professionalsList = await listProfessionalsDetailed(
        ctx.workspace.workspaceId,
        { includeInactive: true }
      );
      const professional = professionalsList.find(
        item => item.id === access.professionalId
      );
      const ownAvailability =
        (
          await getAgendaSnapshot(
            ctx.workspace.workspaceId,
            access.professionalId
          )
        ).availability ?? [];
      return {
        linked: true as const,
        professionalId: access.professionalId,
        entries: ownAvailability.map(
          (entry: {
            weekday: number;
            startMinute: number;
            endMinute: number;
          }) => ({
            weekday: entry.weekday,
            startMinute: entry.startMinute,
            endMinute: entry.endMinute,
          })
        ),
        serviceIds: professional?.serviceIds ?? [],
      };
    }),
    updateMyAvailability: protectedProcedure
      .input(
        z.object({
          entries: z
            .array(
              z.object({
                weekday: z.number().int().min(0).max(6),
                startMinute: z.number().int().min(0).max(1440),
                endMinute: z.number().int().min(1).max(1440),
              })
            )
            .max(50),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const access = await resolveWorkspaceAccess(ctx.user, ctx.workspace);
        if (!access.professionalId)
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Seu usuário não está vinculado a um profissional",
          });
        const invalid = input.entries.find(
          entry => entry.endMinute <= entry.startMinute
        );
        if (invalid)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "O horário final precisa ser maior que o inicial",
          });
        const entries = await replaceAvailability(
          ctx.workspace.workspaceId,
          access.professionalId,
          input.entries
        );
        await logWorkspaceAction({
          workspaceId: ctx.workspace.workspaceId,
          actorUserId: ctx.user.id,
          action: "own_availability_updated",
          summary: `Profissional atualizou a própria disponibilidade (${entries.length} faixas)`,
        });
        return { entries };
      }),
  }),

  inbox: router({
    instances: requireInbox.query(async ({ ctx }) => {
      await ensureLegacyBaileysInstance(ctx.workspace.workspaceId);
      return listBaileysInstances(ctx.workspace.workspaceId);
    }),
    contacts: requireInbox
      .input(
        inboxInstanceFilterSchema
          .extend({
            includeGroups: z.boolean().optional(),
            assignment: z.enum(["all", "mine", "unassigned"]).default("all"),
          })
          .optional()
      )
      .query(async ({ ctx, input }) => {
        const instanceIds = await resolveInboxInstanceSelection(
          ctx.workspace.workspaceId,
          input?.instanceIds
        );
        const items = await listInboxContacts(
          ctx.workspace.workspaceId,
          ctx.user.id,
          instanceIds,
          input?.includeGroups === true,
          input?.assignment ?? "all"
        );
        return items.map(mapContact);
      }),
    assignees: requireInbox.query(async ({ ctx }) =>
      listInboxAssignees(ctx.workspace.workspaceId)
    ),
    assign: requireInbox
      .input(contactIdInput.extend({ assignedUserId: z.number().int().positive().nullable() }))
      .mutation(async ({ input, ctx }) => {
        const updated = await assignInboxContact(
          ctx.workspace.workspaceId,
          input.contactId,
          input.assignedUserId,
          ctx.user.id
        );
        return updated ? mapContact(updated) : null;
      }),
    followUp: requireInbox
      .input(
        contactIdInput.extend({
          followUpAt: z.coerce.date().nullable().optional(),
          note: z.string().trim().max(500).nullable().optional(),
          completed: z.boolean().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const updated = await setInboxFollowUp(
          ctx.workspace.workspaceId,
          input.contactId,
          {
            followUpAt: input.followUpAt,
            note: input.note,
            completed: input.completed,
          },
          ctx.user.id
        );
        return updated ? mapContact(updated) : null;
      }),
    renameContact: requireInbox
      .input(contactIdInput.extend({ name: z.string().trim().min(2).max(160) }))
      .mutation(async ({ input, ctx }) => {
        const existing = await getContactById(
          ctx.workspace.workspaceId,
          input.contactId
        );
        if (!existing)
          throw new TRPCError({ code: "NOT_FOUND", message: "Lead não encontrado" });
        if (existing.groupId)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "O nome do grupo vem do WhatsApp; edite apenas leads individuais.",
          });
        const contact = await renameInboxContact(
          ctx.workspace.workspaceId,
          input.contactId,
          input.name,
          ctx.user.id
        );
        return contact ? mapContact(contact) : null;
      }),
    createContact: requireInbox
      .input(
        z.object({
          name: z.string().trim().min(2).max(160),
          phone: z.string().trim().min(8).max(32),
          serviceRequested: z.string().trim().max(180).optional(),
          city: z.string().trim().max(100).optional(),
          neighborhood: z.string().trim().max(100).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const contact = await upsertApiContact(
          ctx.workspace.workspaceId,
          input
        );
        return contact ? mapContact(contact) : null;
      }),
    thread: requireInbox
      .input(contactIdInput.extend(inboxInstanceFilterSchema.shape))
      .query(async ({ input, ctx }) => {
        const instanceIds = await resolveInboxInstanceSelection(
          ctx.workspace.workspaceId,
          input.instanceIds
        );
        const contact = await getContactById(
          ctx.workspace.workspaceId,
          input.contactId
        );
        if (!contact) return null;
        const [conversation, items, audit, quotes] = await Promise.all([
          getConversationByContact(ctx.workspace.workspaceId, input.contactId),
          listMessagesForContact(ctx.workspace.workspaceId, input.contactId, {
            instanceIds,
          }),
          getAuditLogForContact(ctx.workspace.workspaceId, input.contactId),
          listQuotesForContact(ctx.workspace.workspaceId, input.contactId),
        ]);
        if (instanceIds && items.length === 0) return null;
        const notes = await listContactNotes(
          ctx.workspace.workspaceId,
          input.contactId
        );
        return {
          contact: mapContact(contact),
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
          quotes,
        };
      }),
    addNote: requireInbox
      .input(
        contactIdInput.extend({ content: z.string().trim().min(2).max(2000) })
      )
      .mutation(async ({ input, ctx }) => {
        return addContactNote(
          ctx.workspace.workspaceId,
          input.contactId,
          input.content,
          ctx.user.id
        );
      }),
    toggleAi: requireInbox
      .input(contactIdInput.extend({ enabled: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        const existing = await getContactById(
          ctx.workspace.workspaceId,
          input.contactId
        );
        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Contato não encontrado neste workspace",
          });
        }
        await setContactAi(
          ctx.workspace.workspaceId,
          input.contactId,
          input.enabled,
          ctx.user.id
        );
        const contact = await getContactById(
          ctx.workspace.workspaceId,
          input.contactId
        );
        return contact ? mapContact(contact) : null;
      }),
    sendMessage: requireInboxMessaging
      .input(
        contactIdInput.extend({
          content: z.string().trim().min(1).max(12_000_000),
          messageType: z
            .union([z.literal("text"), z.enum(["image", "audio", "video", "document"]), interactiveMessageTypeSchema])
            .default("text"),
          metadata: z.record(z.string(), z.unknown()).optional(),
          instanceIds: inboxInstanceFilterSchema.shape.instanceIds,
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (input.messageType === "button" || input.messageType === "list" || input.messageType === "poll" || input.messageType === "carousel")
          validateInteractiveMessage({
            messageType: input.messageType,
            content: input.content,
            metadata: input.metadata,
          });
        const usage = await consumeWorkspaceUserUsage(
          ctx.workspace.workspaceId,
          ctx.user.id,
          "outboundMessages"
        );
        if (!usage.allowed)
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Seu limite de mensagens por minuto foi atingido",
          });
        const message = await sendManualMessage(
          ctx.workspace.workspaceId,
          input.contactId,
          input.content,
          ctx.user.id,
          input.messageType,
          input.metadata,
          await resolveInboxInstanceSelection(
            ctx.workspace.workspaceId,
            input.instanceIds
          )
        );
        return message
          ? {
              id: String(message.id),
              content: message.content,
              createdAt: message.createdAt.toISOString(),
              sender: message.senderType,
            }
          : null;
      }),
    moveStage: requireInbox
      .input(contactIdInput.extend({ stage: z.string().min(1).max(80) }))
      .mutation(async ({ input, ctx }) => {
        const existing = await getContactById(
          ctx.workspace.workspaceId,
          input.contactId
        );
        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Contato não encontrado neste workspace",
          });
        }
        await moveContactStage(
          ctx.workspace.workspaceId,
          input.contactId,
          input.stage,
          ctx.user.id
        );
        const contact = await getContactById(
          ctx.workspace.workspaceId,
          input.contactId
        );
        return contact ? mapContact(contact) : null;
      }),
    markRead: requireInbox
      .input(contactIdInput)
      .mutation(async ({ input, ctx }) => {
        const marked = await markConversationRead(
          ctx.workspace.workspaceId,
          ctx.user.id,
          input.contactId
        );
        if (!marked)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Conversa não encontrada neste workspace",
          });
        return {
          conversationId: marked.conversationId,
          lastReadMessageId: marked.lastReadMessageId,
          readAt: marked.readAt.toISOString(),
        };
      }),
    seed: requireInbox.mutation(async () => {
      if (!isDemoRuntimeAllowed())
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Seed de demonstração disponível somente em ambiente QA/dev autorizado",
        });
      await ensureDemoInbox();
      return { success: true } as const;
    }),
  }),
});

export type AppRouter = typeof appRouter;
