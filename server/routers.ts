import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { ScheduleError } from "./schedule";
import {
  ensureDemoInbox,
  ensureDemoWorkspace,
  createLocalWorkspaceMember,
  createProfessional,
  createAgendaAppointment,
  cancelAgendaAppointment,
  updateAgendaStatus,
  createQuote,
  getAgendaSnapshot,
  getUserByEmail,
  getUserById,
  setLocalPassword,
  touchLastSignedIn,
  getDefaultWhatsappProvider,
  listWhatsappChannels,
  setDefaultWhatsappProvider,
  getAuditLogForContact,
  getDashboardSnapshot,
  getOnboardingProfile,
  getNativeAgentConfig,
  saveNativeAgentConfig,
  resetWorkspaceDevelopmentData,
  listContactNotes,
  addContactNote,
  getContactById,
  getConversationByContact,
  listInboxContacts,
  listProfessionals,
  listMessagesForContact,
  listQuotes,
  listInAppNotifications,
  markAllInAppNotificationsRead,
  markInAppNotificationRead,
  moveContactStage,
  sendManualMessage,
  saveOnboardingProfile,
  setContactAi,
  upsertApiContact,
  upsertUser,
  verifyLocalPassword,
  updateQuotePayment,
} from "./db";
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
import { getProfessionalPortalSnapshot, transitionAppointment, professionalCanExecuteService } from "./agenda";
import { listLLMModels } from "./_core/llm";

const contactIdInput = z.object({ contactId: z.number().int().positive() });

type ContactRow = Awaited<ReturnType<typeof listInboxContacts>>[number];

const mapContact = (contact: ContactRow) => ({
  id: String(contact.id),
  name: contact.name,
  phone: contact.externalPhone,
  city: contact.city ?? "",
  neighborhood: contact.neighborhood ?? "",
  service: contact.serviceRequested ?? "Não informado",
  urgency: contact.urgency,
  stage: contact.stage,
  aiEnabled: contact.aiEnabled === 1,
  unread: contact.unreadCount,
  lastMessage: contact.lastMessagePreview ?? "Sem mensagens",
  lastMessageAt: contact.lastMessageAt?.toISOString() ?? contact.updatedAt.toISOString(),
  quote: contact.quoteCents / 100,
  pending: contact.quoteCents / 100,
  daysNoReply: 0,
  initials: contact.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
});

const serializeAppointment = <T extends { startsAt: Date; endsAt: Date }>(appointment: T) => ({
  ...appointment,
  startsAt: appointment.startsAt.toISOString(),
  endsAt: appointment.endsAt.toISOString(),
});
const serializeAgendaAppointment = serializeAppointment;

function throwScheduleTrpcError(error: unknown): never {
  if (error instanceof ScheduleError) {
    if (error.reason === "invalid_period") throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
    if (error.reason === "professional_unavailable") throw new TRPCError({ code: "NOT_FOUND", message: error.message });
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
  message: string,
) => protectedProcedure.use(async ({ ctx, next }) => {
  const access = await resolveWorkspaceAccess(ctx.user);
  if (!access.memberActive) throw new TRPCError({ code: "FORBIDDEN", message: "Seu acesso está desativado neste workspace" });
  if (!requirement(access)) throw new TRPCError({ code: "FORBIDDEN", message });
  return next({ ctx: { access } });
});

const requireManager = withAccess((access) => access.canManageCatalog, "Somente proprietário, administrador ou gerente podem executar esta ação");
const requireAdministrator = withAccess((access) => access.canManageTeam, "Somente proprietário ou administrador podem executar esta ação");
const requireActiveMember = withAccess(() => true, "Seu acesso está desativado neste workspace");

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    access: protectedProcedure.query(async ({ ctx }) => {
      const access = await resolveWorkspaceAccess(ctx.user);
      return {
        userId: access.userId,
        role: access.role,
        operationalRole: access.operationalRole,
        professionalId: access.professionalId,
        professionalName: access.professionalName,
        memberActive: access.memberActive,
        canManageTeam: access.canManageTeam,
        canManageCatalog: access.canManageCatalog,
        canSeeFullAgenda: access.canSeeFullAgenda,
        restrictedToOwnAgenda: access.restrictedToOwnAgenda,
      };
    }),
    updateProfile: protectedProcedure.input(z.object({
      name: z.string().trim().min(2).max(160),
      email: z.string().email(),
      phone: z.string().trim().max(32).optional(),
    })).mutation(async ({ input, ctx }) => {
      const updated = await updateOwnProfile(ctx.user.id, input);
      if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível atualizar o perfil" });
      await logWorkspaceAction({ actorUserId: ctx.user.id, action: "profile_updated", summary: "Perfil do operador atualizado" });
      return { id: updated.id, name: updated.name, email: updated.email, phone: updated.phone };
    }),
    changePassword: protectedProcedure.input(z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8).max(128),
    })).mutation(async ({ input, ctx }) => {
      const account = await getUserById(ctx.user.id);
      if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Conta não encontrada" });
      if (account.passwordHash && !verifyLocalPassword(input.currentPassword, account.passwordHash)) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha atual incorreta" });
      }
      await setLocalPassword(ctx.user.id, input.newPassword);
      await logWorkspaceAction({ actorUserId: ctx.user.id, action: "password_changed", summary: "Senha do operador atualizada" });
      return { success: true } as const;
    }),
    localLogin: publicProcedure
      .input(z.object({ email: z.string().email(), password: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        if (!ENV.localAuthEnabled || !ENV.localAdminPassword) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Login local não configurado" });
        }
        const email = input.email.trim().toLowerCase();
        let account = await getUserByEmail(email);
        const isEnvAdmin = email === ENV.localAdminEmail.trim().toLowerCase() && input.password === ENV.localAdminPassword;
        if (isEnvAdmin) {
          await upsertUser({ openId: "local_admin", name: "Administrador", email: ENV.localAdminEmail, loginMethod: "local", role: "admin", lastSignedIn: new Date() });
          account = await getUserByEmail(email);
        } else if (!account || !verifyLocalPassword(input.password, account.passwordHash)) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "E-mail ou senha inválidos" });
        }
        if (!account) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Conta local não pôde ser carregada" });
        const access = await resolveWorkspaceAccess(account);
        if (!access.memberActive) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Seu acesso está desativado. Fale com o administrador." });
        }
        const token = await sdk.signSession({ openId: account.openId, appId: "local", name: account.name ?? email });
        ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: 1000 * 60 * 60 * 24 * 365 });
        await touchLastSignedIn(account.id);
        await logWorkspaceAction({ actorUserId: account.id, action: "login_success", summary: `Login local de ${email}` });
        return { success: true, role: access.role, operationalRole: access.operationalRole } as const;
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  workspace: router({
    current: protectedProcedure.query(async () => {
      const workspace = await ensureDemoWorkspace();
      if (!workspace) return null;
      return {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        segment: workspace.segment,
        plan: workspace.plan,
        timezone: workspace.timezone,
      };
    }),
    // The member roster is administrative data: an executor must not be able to
    // enumerate colleagues, e-mails or account status through a direct URL.
    members: requireManager.query(async () => {
      const members = await listWorkspaceMembersDetailed();
      return members.map((member) => ({
        id: member.id,
        userId: member.userId,
        name: member.name ?? "Membro sem nome",
        email: member.email ?? "Sem e-mail",
        role: member.role as WorkspaceMemberRole,
        operationalRole: (member.operationalRole as OperationalRole | null) ?? "human_attendant",
        professionalId: member.professionalId,
        professionalName: member.professionalName,
        active: member.active === 1,
        lastSignedIn: member.lastSignedIn?.toISOString() ?? null,
      }));
    }),
    updateMember: requireAdministrator.input(z.object({
      memberId: z.number().int().positive(),
      role: z.enum(["owner", "admin", "manager", "agent"]).optional(),
      operationalRole: z.enum(["human_attendant", "ai_attendant", "professional"]).optional(),
      professionalId: z.number().int().positive().nullable().optional(),
      active: z.boolean().optional(),
    })).mutation(async ({ input, ctx }) => {
      const member = await setMemberProfile(input.memberId, input);
      if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Membro não encontrado" });
      await logWorkspaceAction({
        actorUserId: ctx.user.id,
        action: "member_updated",
        summary: `Membro ${input.memberId} atualizado (papel ${member.role}, ativo ${member.active === 1})`,
      });
      return { id: member.id, role: member.role, active: member.active === 1, professionalId: member.professionalId };
    }),
    audit: requireManager.input(z.object({ limit: z.number().int().min(1).max(200).default(60) }).optional()).query(async ({ input }) => {
      const rows = await listWorkspaceAudit(input?.limit ?? 60);
      return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
    }),
    inAppNotifications: requireActiveMember.query(async ({ ctx }) => {
      const workspace = await ensureDemoWorkspace();
      if (!workspace) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Workspace indisponível" });
      const result = await listInAppNotifications(workspace.id, ctx.user.id, 30);
      return {
        unreadCount: result.unreadCount,
        items: result.items.map((item) => ({ ...item, createdAt: item.createdAt.toISOString(), readAt: item.readAt?.toISOString() ?? null })),
      };
    }),
    markNotificationRead: requireActiveMember.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      const workspace = await ensureDemoWorkspace();
      if (!workspace) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Workspace indisponível" });
      return { updated: await markInAppNotificationRead(workspace.id, ctx.user.id, input.id) };
    }),
    markAllNotificationsRead: requireActiveMember.mutation(async ({ ctx }) => {
      const workspace = await ensureDemoWorkspace();
      if (!workspace) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Workspace indisponível" });
      return { markedRead: await markAllInAppNotificationsRead(workspace.id, ctx.user.id) };
    }),
    notifyPreferences: requireManager.query(async () => {
      const workspace = await ensureDemoWorkspace();
      if (!workspace) return null;
      return getNotificationPreferences(workspace.id);
    }),
    saveNotifyPreferences: requireManager.input(z.object({
      newLead: z.boolean(),
      appointmentCreated: z.boolean(),
      appointmentConfirmed: z.boolean(),
      dailySummary: z.boolean(),
    })).mutation(async ({ input, ctx }) => {
      const workspace = await ensureDemoWorkspace();
      if (!workspace) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Workspace indisponível" });
      const saved = await saveNotificationPreferences(workspace.id, input);
      await logWorkspaceAction({ actorUserId: ctx.user.id, action: "notifications_updated", summary: "Preferências de notificação atualizadas" });
      return saved;
    }),
    summary: protectedProcedure.query(async () => ({
      membersActive: await countWorkspaceMembers(),
    })),
    professionals: protectedProcedure.query(async () => (await listProfessionals()).map((professional) => ({
      id: professional.id,
      name: professional.name,
      specialty: professional.specialty,
      color: professional.color,
    }))),
    professionalsDetailed: requireManager.query(async () => {
      const rows = await listProfessionalsDetailed({ includeInactive: true });
      return rows.map((row) => ({
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
    createProfessional: requireManager.input(z.object({
      name: z.string().trim().min(2).max(160),
      specialty: z.string().max(120).optional(),
      color: z.string().max(20).optional(),
    })).mutation(async ({ input, ctx }) => {
      const professional = await createProfessional(input);
      if (!professional) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível cadastrar o profissional" });
      await logWorkspaceAction({ actorUserId: ctx.user.id, action: "professional_created", summary: `Profissional ${professional.name} cadastrado` });
      return { id: professional.id, name: professional.name, specialty: professional.specialty, color: professional.color, active: true };
    }),
    updateProfessional: requireManager.input(z.object({
      professionalId: z.number().int().positive(),
      name: z.string().trim().min(2).max(160).optional(),
      specialty: z.string().max(120).nullable().optional(),
      color: z.string().max(20).optional(),
      active: z.boolean().optional(),
    })).mutation(async ({ input, ctx }) => {
      const { professionalId, ...changes } = input;
      const professional = await updateProfessional(professionalId, changes);
      if (!professional) throw new TRPCError({ code: "NOT_FOUND", message: "Profissional não encontrado neste workspace" });
      await logWorkspaceAction({ actorUserId: ctx.user.id, action: "professional_updated", summary: `Profissional ${professional.name} atualizado` });
      return { id: professional.id, name: professional.name, specialty: professional.specialty, color: professional.color, active: professional.active === 1 };
    }),
    setProfessionalServices: requireManager.input(z.object({
      professionalId: z.number().int().positive(),
      serviceIds: z.array(z.number().int().positive()).max(200),
    })).mutation(async ({ input, ctx }) => {
      const serviceIds = await setProfessionalServices(input.professionalId, input.serviceIds);
      await logWorkspaceAction({ actorUserId: ctx.user.id, action: "professional_services_updated", summary: `Serviços do profissional ${input.professionalId} atualizados (${serviceIds.length})` });
      return { professionalId: input.professionalId, serviceIds };
    }),
    setProfessionalAvailability: requireManager.input(z.object({
      professionalId: z.number().int().positive(),
      entries: z.array(z.object({
        weekday: z.number().int().min(0).max(6),
        startMinute: z.number().int().min(0).max(1440),
        endMinute: z.number().int().min(1).max(1440),
      })).max(50),
    })).mutation(async ({ input, ctx }) => {
      const invalid = input.entries.find((entry) => entry.endMinute <= entry.startMinute);
      if (invalid) throw new TRPCError({ code: "BAD_REQUEST", message: "O horário final precisa ser maior que o inicial" });
      const entries = await replaceAvailability(input.professionalId, input.entries);
      await logWorkspaceAction({ actorUserId: ctx.user.id, action: "professional_availability_updated", summary: `Agenda semanal do profissional ${input.professionalId} atualizada (${entries.length} faixas)` });
      return { professionalId: input.professionalId, entries };
    }),
    services: protectedProcedure.query(async () => (await listServices({ includeInactive: true })).map((service) => ({
      id: service.id,
      name: service.name,
      description: service.description,
      durationMinutes: service.durationMinutes,
      priceCents: service.priceCents,
      active: service.active === 1,
      professionalIds: service.professionalIds,
    }))),
    createService: requireManager.input(z.object({
      name: z.string().trim().min(2).max(160),
      description: z.string().max(4000).optional(),
      durationMinutes: z.number().int().min(5).max(1440).default(60),
      priceCents: z.number().int().min(0).max(100_000_000).default(0),
    })).mutation(async ({ input, ctx }) => {
      const service = await createService(input);
      if (!service) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível criar o serviço" });
      await logWorkspaceAction({ actorUserId: ctx.user.id, action: "service_created", summary: `Serviço ${service.name} criado` });
      return { id: service.id, name: service.name, active: service.active === 1 };
    }),
    updateService: requireManager.input(z.object({
      serviceId: z.number().int().positive(),
      name: z.string().trim().min(2).max(160).optional(),
      description: z.string().max(4000).nullable().optional(),
      durationMinutes: z.number().int().min(5).max(1440).optional(),
      priceCents: z.number().int().min(0).max(100_000_000).optional(),
      active: z.boolean().optional(),
    })).mutation(async ({ input, ctx }) => {
      const { serviceId, ...changes } = input;
      const service = await updateService(serviceId, changes);
      if (!service) throw new TRPCError({ code: "NOT_FOUND", message: "Serviço não encontrado neste workspace" });
      await logWorkspaceAction({ actorUserId: ctx.user.id, action: "service_updated", summary: `Serviço ${service.name} atualizado` });
      return { id: service.id, name: service.name, active: service.active === 1 };
    }),
    setServiceProfessionals: requireManager.input(z.object({
      serviceId: z.number().int().positive(),
      professionalIds: z.array(z.number().int().positive()).max(200),
    })).mutation(async ({ input, ctx }) => {
      const professionalIds = await setServiceProfessionals(input.serviceId, input.professionalIds);
      await logWorkspaceAction({ actorUserId: ctx.user.id, action: "service_professionals_updated", summary: `Profissionais do serviço ${input.serviceId} atualizados (${professionalIds.length})` });
      return { serviceId: input.serviceId, professionalIds };
    }),
    createMember: requireAdministrator.input(z.object({
      name: z.string().trim().min(2).max(160),
      email: z.string().email(),
      password: z.string().min(8).max(128),
      role: z.enum(["owner", "admin", "manager", "agent"]),
      operationalRole: z.enum(["human_attendant", "ai_attendant", "professional"]),
      professionalId: z.number().int().positive().optional(),
    })).mutation(async ({ input, ctx }) => {
      try {
        const user = await createLocalWorkspaceMember(input, ctx.user.id);
        return { id: user.id, name: user.name, email: user.email, role: input.role, operationalRole: input.operationalRole, professionalId: input.professionalId ?? null };
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Não foi possível criar a conta" });
      }
    }),
    channels: protectedProcedure.query(async () => {
      const channels = await listWhatsappChannels();
      return channels.map((channel) => ({
        id: channel.id,
        provider: channel.provider,
        name: channel.name,
        phoneNumber: channel.phoneNumber,
        configured: channel.provider === "papi"
          ? Boolean(process.env.PAPI_BASE_URL && process.env.PAPI_API_KEY)
          : Boolean(process.env.META_WHATSAPP_ACCESS_TOKEN && process.env.META_WHATSAPP_PHONE_NUMBER_ID),
        active: channel.active === 1,
      }));
    }),
    defaultChannel: protectedProcedure.query(() => getDefaultWhatsappProvider()),
    setDefaultChannel: protectedProcedure.input(z.object({ provider: z.enum(["papi", "meta_cloud_api"]) })).mutation(({ input }) => {
      const configured = input.provider === "papi"
        ? Boolean(process.env.PAPI_BASE_URL && process.env.PAPI_API_KEY)
        : Boolean(process.env.META_WHATSAPP_ACCESS_TOKEN && process.env.META_WHATSAPP_PHONE_NUMBER_ID);
      if (!configured) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Configure as credenciais deste canal antes de selecioná-lo." });
      return setDefaultWhatsappProvider(input.provider);
    }),
  }),

  dashboard: router({
    snapshot: protectedProcedure.query(async () => {
      const snapshot = await getDashboardSnapshot();
      return {
        ...snapshot,
        recentEvents: snapshot.recentEvents.map((event) => ({ ...event, createdAt: event.createdAt.toISOString() })),
        upcomingAppointments: snapshot.upcomingAppointments.map((appointment) => serializeAgendaAppointment(appointment)),
      };
    }),
  }),

  onboarding: router({
    profile: protectedProcedure.query(() => getOnboardingProfile()),
    save: protectedProcedure.input(z.object({
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
    })).mutation(({ input }) => saveOnboardingProfile(input.profile, input.publish)),
  }),

  agent: router({
    config: protectedProcedure.query(async () => {
      const config = await getNativeAgentConfig();
      return {
        ...config,
        credentials: {
          llmConfigured: Boolean(ENV.forgeApiKey),
          llmSource: "Variáveis do ambiente do servidor",
          papiConfigured: Boolean(process.env.PAPI_BASE_URL && process.env.PAPI_API_KEY),
          papiSource: "Variáveis do ambiente do servidor",
        },
        providers: Object.fromEntries(Object.entries(config.llm.providers).map(([id, provider]) => [id, { enabled: provider.enabled, baseUrl: provider.baseUrl, configured: Boolean(provider.apiKey), maskedKey: provider.apiKey }])),
      };
    }),
    save: requireAdministrator.input(z.object({
      enabled: z.boolean(),
      model: z.string().trim().min(1).max(120),
      systemPrompt: z.string().max(30000),
      maxSteps: z.number().int().min(1).max(8),
      llm: z.object({
        providers: z.object({
          nvidia_nim: z.object({ enabled: z.boolean(), baseUrl: z.string().max(500), apiKey: z.string().max(500) }),
          google_gemini: z.object({ enabled: z.boolean(), baseUrl: z.string().max(500), apiKey: z.string().max(500) }),
          openai_compatible: z.object({ enabled: z.boolean(), baseUrl: z.string().max(500), apiKey: z.string().max(500) }),
        }),
        routing: z.object({
          text: z.object({ provider: z.enum(["nvidia_nim", "google_gemini", "openai_compatible"]), model: z.string().max(200) }),
          vision: z.object({ provider: z.enum(["nvidia_nim", "google_gemini", "openai_compatible"]), model: z.string().max(200) }),
          audio: z.object({ provider: z.enum(["nvidia_nim", "google_gemini", "openai_compatible"]), model: z.string().max(200) }),
          document: z.object({ provider: z.enum(["nvidia_nim", "google_gemini", "openai_compatible"]), model: z.string().max(200) }),
        }),
      }),
    })).mutation(async ({ input, ctx }) => {
      const result = await saveNativeAgentConfig(input);
      await logWorkspaceAction({ actorUserId: ctx.user.id, action: "native_agent_config_updated", summary: `Agente nativo ${result.enabled ? "ativado" : "pausado"}; modelo ${result.model}` });
      return result;
    }),
    models: protectedProcedure.query(async () => {
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
    resetWorkspace: requireAdministrator.input(z.object({ confirmation: z.literal("APAGAR DADOS DO FORTE PANEL") })).mutation(async ({ ctx }) => {
      const result = await resetWorkspaceDevelopmentData();
      await logWorkspaceAction({ actorUserId: ctx.user.id, action: "development_workspace_reset", summary: "Dados operacionais do Forte Panel apagados pelo administrador" });
      return result;
    }),
  }),

  billing: router({
    quotes: protectedProcedure.query(async () => {
      const items = await listQuotes();
      return items.map((item) => ({ ...item, dueDate: item.dueDate?.toISOString() ?? null, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() }));
    }),
    createQuote: protectedProcedure.input(z.object({
      contactId: z.number().int().positive(),
      serviceName: z.string().trim().min(1).max(160),
      description: z.string().max(4000).optional(),
      quotedCents: z.number().int().nonnegative(),
      receivedCents: z.number().int().nonnegative().default(0),
      status: z.enum(["orcamento", "aguardando_aprovacao", "aprovado", "sinal_pendente", "parcialmente_pago", "pago", "cancelado"]).default("orcamento"),
      dueDate: z.coerce.date().optional(),
      notes: z.string().max(1000).optional(),
    })).mutation(({ input, ctx }) => createQuote(input, ctx.user.id)),
    updatePayment: protectedProcedure.input(z.object({
      id: z.number().int().positive(),
      receivedCents: z.number().int().nonnegative(),
      status: z.enum(["orcamento", "aguardando_aprovacao", "aprovado", "sinal_pendente", "parcialmente_pago", "pago", "cancelado"]),
    })).mutation(({ input, ctx }) => updateQuotePayment(input.id, input.receivedCents, input.status, ctx.user.id)),
  }),

  agenda: router({
    snapshot: protectedProcedure.query(async ({ ctx }) => {
      const access = await resolveWorkspaceAccess(ctx.user);
      if (!access.memberActive) throw new TRPCError({ code: "FORBIDDEN", message: "Seu acesso está desativado neste workspace" });
      const professionalId = access.canSeeFullAgenda ? undefined : access.professionalId ?? undefined;
      const snapshot = await getAgendaSnapshot(professionalId);
      return {
        timezone: snapshot.timezone,
        services: snapshot.services,
        professionals: snapshot.professionals,
        appointments: snapshot.appointments.map(serializeAgendaAppointment),
        availability: "availability" in snapshot ? snapshot.availability : [],
        restrictedToOwnAgenda: access.restrictedToOwnAgenda,
      };
    }),
    create: protectedProcedure.input(z.object({
      contactId: z.number().int().positive().optional(),
      serviceId: z.number().int().positive(),
      professionalId: z.number().int().positive(),
      startsAt: z.coerce.date(),
      endsAt: z.coerce.date(),
      notes: z.string().max(500).optional(),
    })).mutation(async ({ input, ctx }) => {
      const access = await resolveWorkspaceAccess(ctx.user);
      if (!access.memberActive) throw new TRPCError({ code: "FORBIDDEN", message: "Seu acesso está desativado neste workspace" });
      if (!access.canSeeFullAgenda && input.professionalId !== access.professionalId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Você só pode agendar atendimentos vinculados a você" });
      }
      if (input.endsAt <= input.startsAt) throw new TRPCError({ code: "BAD_REQUEST", message: "O horário final precisa ser maior que o inicial" });
      const allowed = await professionalCanExecuteService(input.professionalId, input.serviceId);
      if (!allowed) throw new TRPCError({ code: "BAD_REQUEST", message: "Este profissional não executa o serviço selecionado" });
      let appointment;
      try {
        appointment = await createAgendaAppointment(input);
      } catch (error) {
        throwScheduleTrpcError(error);
      }
      if (!appointment) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível criar o agendamento" });
      await logWorkspaceAction({ actorUserId: ctx.user.id, action: "appointment_created", summary: `Agendamento ${appointment.id} criado para ${input.startsAt.toISOString()}` });
      return { id: appointment.id, status: appointment.status };
    }),
    updateStatus: protectedProcedure.input(z.object({
      id: z.number().int().positive(),
      status: z.enum(["confirmed", "in_progress", "completed", "no_show"]),
    })).mutation(async ({ input, ctx }) => {
      const access = await resolveWorkspaceAccess(ctx.user);
      if (!access.memberActive) throw new TRPCError({ code: "FORBIDDEN", message: "Seu acesso está desativado neste workspace" });
      const restriction = access.canSeeFullAgenda ? undefined : access.professionalId ?? -1;
      const updated = await transitionAppointment({ appointmentId: input.id, status: input.status, actorUserId: ctx.user.id, restrictToProfessionalId: restriction });
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado para o seu acesso" });
      await logWorkspaceAction({ actorUserId: ctx.user.id, action: `appointment_${input.status}`, summary: `Agendamento ${input.id} atualizado para ${input.status}` });
      return { id: updated.id, status: updated.status };
    }),
    cancel: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      const access = await resolveWorkspaceAccess(ctx.user);
      if (!access.memberActive) throw new TRPCError({ code: "FORBIDDEN", message: "Seu acesso está desativado neste workspace" });
      if (access.canSeeFullAgenda) {
        const updated = await cancelAgendaAppointment(input.id);
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado" });
        await logWorkspaceAction({ actorUserId: ctx.user.id, action: "appointment_cancelled", summary: `Agendamento ${input.id} cancelado` });
        return { id: updated.id, status: updated.status };
      }
      const updated = await transitionAppointment({ appointmentId: input.id, status: "cancelled", actorUserId: ctx.user.id, restrictToProfessionalId: access.professionalId ?? -1 });
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado para o seu acesso" });
      await logWorkspaceAction({ actorUserId: ctx.user.id, action: "appointment_cancelled", summary: `Agendamento ${input.id} cancelado pelo profissional` });
      return { id: updated.id, status: updated.status };
    }),
    updateMyStatus: protectedProcedure.input(z.object({
      id: z.number().int().positive(),
      status: z.enum(["confirmed", "in_progress", "completed", "no_show"]),
    })).mutation(async ({ input, ctx }) => {
      const access = await resolveWorkspaceAccess(ctx.user);
      if (!access.memberActive) throw new TRPCError({ code: "FORBIDDEN", message: "Seu acesso está desativado neste workspace" });
      if (!access.professionalId) throw new TRPCError({ code: "FORBIDDEN", message: "Seu usuário não está vinculado a um profissional" });
      const updated = await transitionAppointment({ appointmentId: input.id, status: input.status, actorUserId: ctx.user.id, restrictToProfessionalId: access.professionalId });
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Este atendimento não pertence à sua agenda" });
      await logWorkspaceAction({ actorUserId: ctx.user.id, action: `appointment_${input.status}`, summary: `Profissional atualizou o atendimento ${input.id} para ${input.status}` });
      return { id: updated.id, status: updated.status };
    }),
  }),

  professional: router({
    myAgenda: protectedProcedure.query(async ({ ctx }) => {
      const access = await resolveWorkspaceAccess(ctx.user);
      if (!access.professionalId) {
        return {
          linked: false as const,
          timezone: (await ensureDemoWorkspace())?.timezone ?? "America/Sao_Paulo",
          professionalId: null,
          professionalName: null,
          professionalSpecialty: null,
          professionalColor: null,
          todayCount: 0, weekCount: 0, monthCount: 0, pendingCount: 0, completedCount: 0,
          nextAppointment: null, today: [], upcoming: [], week: [], month: [], clients: [],
        };
      }
      const snapshot = await getProfessionalPortalSnapshot(access.professionalId);
      return {
        linked: true as const,
        ...snapshot,
        today: snapshot.today.map(serializeAgendaAppointment),
        upcoming: snapshot.upcoming.map(serializeAgendaAppointment),
        week: snapshot.week.map(serializeAgendaAppointment),
        month: snapshot.month.map(serializeAgendaAppointment),
        nextAppointment: snapshot.nextAppointment ? serializeAgendaAppointment(snapshot.nextAppointment) : null,
        clients: snapshot.clients.map((client) => ({ ...client, lastAppointmentAt: client.lastAppointmentAt.toISOString() })),
      };
    }),
    myAvailability: protectedProcedure.query(async ({ ctx }) => {
      const access = await resolveWorkspaceAccess(ctx.user);
      if (!access.professionalId) return { linked: false as const, entries: [] };
      const professionalsList = await listProfessionalsDetailed({ includeInactive: true });
      const professional = professionalsList.find((item) => item.id === access.professionalId);
      const ownAvailability = (await getAgendaSnapshot(access.professionalId)).availability ?? [];
      return {
        linked: true as const,
        professionalId: access.professionalId,
        entries: ownAvailability.map((entry: { weekday: number; startMinute: number; endMinute: number }) => ({ weekday: entry.weekday, startMinute: entry.startMinute, endMinute: entry.endMinute })),
        serviceIds: professional?.serviceIds ?? [],
      };
    }),
    updateMyAvailability: protectedProcedure.input(z.object({
      entries: z.array(z.object({
        weekday: z.number().int().min(0).max(6),
        startMinute: z.number().int().min(0).max(1440),
        endMinute: z.number().int().min(1).max(1440),
      })).max(50),
    })).mutation(async ({ input, ctx }) => {
      const access = await resolveWorkspaceAccess(ctx.user);
      if (!access.professionalId) throw new TRPCError({ code: "FORBIDDEN", message: "Seu usuário não está vinculado a um profissional" });
      const invalid = input.entries.find((entry) => entry.endMinute <= entry.startMinute);
      if (invalid) throw new TRPCError({ code: "BAD_REQUEST", message: "O horário final precisa ser maior que o inicial" });
      const entries = await replaceAvailability(access.professionalId, input.entries);
      await logWorkspaceAction({ actorUserId: ctx.user.id, action: "own_availability_updated", summary: `Profissional atualizou a própria disponibilidade (${entries.length} faixas)` });
      return { entries };
    }),
  }),

  inbox: router({
    contacts: protectedProcedure.query(async () => {
      const items = await listInboxContacts();
      return items.map(mapContact);
    }),
    createContact: protectedProcedure.input(z.object({
      name: z.string().trim().min(2).max(160),
      phone: z.string().trim().min(8).max(32),
      serviceRequested: z.string().trim().max(180).optional(),
      city: z.string().trim().max(100).optional(),
      neighborhood: z.string().trim().max(100).optional(),
    })).mutation(async ({ input }) => {
      const contact = await upsertApiContact(input);
      return contact ? mapContact(contact) : null;
    }),
    thread: protectedProcedure.input(contactIdInput).query(async ({ input }) => {
      const contact = await getContactById(input.contactId);
      if (!contact) return null;
      const [conversation, items, audit] = await Promise.all([
        getConversationByContact(input.contactId),
        listMessagesForContact(input.contactId),
        getAuditLogForContact(input.contactId),
      ]);
      const notes = await listContactNotes(input.contactId);
      return {
        contact: mapContact(contact),
        conversation,
        messages: items.map((message) => ({
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
    }),
    addNote: protectedProcedure.input(contactIdInput.extend({ content: z.string().trim().min(2).max(2000) })).mutation(async ({ input, ctx }) => {
      return addContactNote(input.contactId, input.content, ctx.user.id);
    }),
    toggleAi: protectedProcedure.input(contactIdInput.extend({ enabled: z.boolean() })).mutation(async ({ input }) => {
      await setContactAi(input.contactId, input.enabled);
      const contact = await getContactById(input.contactId);
      return contact ? mapContact(contact) : null;
    }),
    sendMessage: protectedProcedure.input(contactIdInput.extend({ content: z.string().trim().min(1).max(4000) })).mutation(async ({ input }) => {
      const message = await sendManualMessage(input.contactId, input.content);
      return message ? { id: String(message.id), content: message.content, createdAt: message.createdAt.toISOString(), sender: message.senderType } : null;
    }),
    moveStage: protectedProcedure.input(contactIdInput.extend({ stage: z.string().min(1).max(80) })).mutation(async ({ input }) => {
      await moveContactStage(input.contactId, input.stage);
      const contact = await getContactById(input.contactId);
      return contact ? mapContact(contact) : null;
    }),
    seed: protectedProcedure.mutation(async () => {
      await ensureDemoInbox();
      return { success: true } as const;
    }),
  }),
});

export type AppRouter = typeof appRouter;
