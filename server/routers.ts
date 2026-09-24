import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
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
  getWorkspaceMemberForUser,
  getDefaultWhatsappProvider,
  listWhatsappChannels,
  setDefaultWhatsappProvider,
  getAuditLogForContact,
  getDashboardSnapshot,
  getOnboardingProfile,
  listContactNotes,
  addContactNote,
  getContactById,
  getConversationByContact,
  listInboxContacts,
  listWorkspaceMembers,
  listProfessionals,
  listMessagesForContact,
  listQuotes,
  moveContactStage,
  sendManualMessage,
  saveOnboardingProfile,
  setContactAi,
  upsertApiContact,
  upsertUser,
  verifyLocalPassword,
  updateQuotePayment,
} from "./db";

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

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    access: protectedProcedure.query(async ({ ctx }) => {
      const member = await getWorkspaceMemberForUser(ctx.user.id);
      return {
        userId: ctx.user.id,
        role: member?.role ?? (ctx.user.role === "admin" ? "owner" : "agent"),
        operationalRole: ctx.user.operationalRole ?? "human_attendant",
        professionalId: member?.professionalId ?? null,
      };
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
        const token = await sdk.signSession({ openId: account.openId, appId: "local", name: account.name ?? email });
        ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: 1000 * 60 * 60 * 24 * 365 });
        return { success: true } as const;
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
    members: protectedProcedure.query(async () => {
      const members = await listWorkspaceMembers();
      return members.map((member) => ({
        id: member.id,
        name: member.name ?? "Membro sem nome",
        email: member.email ?? "Sem e-mail",
        role: member.role,
        active: member.active === 1,
      }));
    }),
    professionals: protectedProcedure.query(async () => (await listProfessionals()).map((professional) => ({
      id: professional.id,
      name: professional.name,
      specialty: professional.specialty,
      color: professional.color,
    }))),
    createProfessional: protectedProcedure.input(z.object({
      name: z.string().trim().min(2).max(160),
      specialty: z.string().max(120).optional(),
      color: z.string().max(20).optional(),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Somente administradores podem cadastrar profissionais" });
      const professional = await createProfessional(input);
      return { id: professional.id, name: professional.name, specialty: professional.specialty, color: professional.color };
    }),
    createMember: protectedProcedure.input(z.object({
      name: z.string().trim().min(2).max(160),
      email: z.string().email(),
      password: z.string().min(8).max(128),
      role: z.enum(["admin", "manager", "agent"]),
      operationalRole: z.enum(["human_attendant", "ai_attendant", "professional"]),
      professionalId: z.number().int().positive().optional(),
    })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Somente administradores podem criar contas" });
      const user = await createLocalWorkspaceMember(input);
      return { id: user.id, name: user.name, email: user.email, role: input.role, operationalRole: input.operationalRole, professionalId: input.professionalId ?? null };
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
        upcomingAppointments: snapshot.upcomingAppointments.map((appointment) => ({ ...appointment, startsAt: appointment.startsAt.toISOString(), endsAt: appointment.endsAt.toISOString() })),
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
      const member = await getWorkspaceMemberForUser(ctx.user.id);
      const professionalId = ctx.user.role === "admin" || member?.role === "owner" || member?.role === "admin" || member?.role === "manager" ? undefined : member?.professionalId ?? undefined;
      const snapshot = await getAgendaSnapshot(professionalId);
      return {
        timezone: snapshot.timezone,
        services: snapshot.services,
        professionals: snapshot.professionals,
        appointments: snapshot.appointments.map((appointment) => ({
          ...appointment,
          startsAt: appointment.startsAt.toISOString(),
          endsAt: appointment.endsAt.toISOString(),
        })),
      };
    }),
    create: protectedProcedure.input(z.object({
      contactId: z.number().int().positive().optional(),
      serviceId: z.number().int().positive(),
      professionalId: z.number().int().positive(),
      startsAt: z.coerce.date(),
      endsAt: z.coerce.date(),
      notes: z.string().max(500).optional(),
    })).mutation(async ({ input }) => {
      const appointment = await createAgendaAppointment(input);
      return appointment ? { id: appointment.id, status: appointment.status } : null;
    }),
    updateStatus: protectedProcedure.input(z.object({ id: z.number().int().positive(), status: z.enum(["confirmed", "completed", "no_show"]) })).mutation(({ input }) => updateAgendaStatus(input.id, input.status)),
    cancel: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ input }) => cancelAgendaAppointment(input.id)),
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
