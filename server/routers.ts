import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  ensureDemoInbox,
  ensureDemoWorkspace,
  createAgendaAppointment,
  createQuote,
  getAgendaSnapshot,
  getDefaultWhatsappProvider,
  listWhatsappChannels,
  setDefaultWhatsappProvider,
  getAuditLogForContact,
  getDashboardSnapshot,
  getOnboardingProfile,
  getContactById,
  getConversationByContact,
  listInboxContacts,
  listWorkspaceMembers,
  listMessagesForContact,
  listQuotes,
  moveContactStage,
  sendManualMessage,
  saveOnboardingProfile,
  setContactAi,
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
    channels: protectedProcedure.query(async () => {
      const channels = await listWhatsappChannels();
      return channels.map((channel) => ({
        id: channel.id,
        provider: channel.provider,
        name: channel.name,
        phoneNumber: channel.phoneNumber,
        configured: Boolean(channel.phoneNumberId || channel.credentialsRef),
        active: channel.active === 1,
      }));
    }),
    defaultChannel: protectedProcedure.query(() => getDefaultWhatsappProvider()),
    setDefaultChannel: protectedProcedure.input(z.object({ provider: z.enum(["papi", "meta_cloud_api"]) })).mutation(({ input }) => setDefaultWhatsappProvider(input.provider)),
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
    snapshot: protectedProcedure.query(async () => {
      const snapshot = await getAgendaSnapshot();
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
  }),

  inbox: router({
    contacts: protectedProcedure.query(async () => {
      const items = await listInboxContacts();
      return items.map(mapContact);
    }),
    thread: protectedProcedure.input(contactIdInput).query(async ({ input }) => {
      const contact = await getContactById(input.contactId);
      if (!contact) return null;
      const [conversation, items, audit] = await Promise.all([
        getConversationByContact(input.contactId),
        listMessagesForContact(input.contactId),
        getAuditLogForContact(input.contactId),
      ]);
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
      };
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
