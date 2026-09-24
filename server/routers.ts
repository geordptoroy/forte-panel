import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import {
  ensureDemoInbox,
  ensureDemoWorkspace,
  createAgendaAppointment,
  getAgendaSnapshot,
  getAuditLogForContact,
  getContactById,
  getConversationByContact,
  listInboxContacts,
  listWorkspaceMembers,
  listMessagesForContact,
  moveContactStage,
  sendManualMessage,
  setContactAi,
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
    current: publicProcedure.query(async () => {
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
    members: publicProcedure.query(async () => {
      const members = await listWorkspaceMembers();
      return members.map((member) => ({
        id: member.id,
        name: member.name ?? "Membro sem nome",
        email: member.email ?? "Sem e-mail",
        role: member.role,
        active: member.active === 1,
      }));
    }),
  }),

  agenda: router({
    snapshot: publicProcedure.query(async () => {
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
    create: publicProcedure.input(z.object({
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
    contacts: publicProcedure.query(async () => {
      const items = await listInboxContacts();
      return items.map(mapContact);
    }),
    thread: publicProcedure.input(contactIdInput).query(async ({ input }) => {
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
    toggleAi: publicProcedure.input(contactIdInput.extend({ enabled: z.boolean() })).mutation(async ({ input }) => {
      await setContactAi(input.contactId, input.enabled);
      const contact = await getContactById(input.contactId);
      return contact ? mapContact(contact) : null;
    }),
    sendMessage: publicProcedure.input(contactIdInput.extend({ content: z.string().trim().min(1).max(4000) })).mutation(async ({ input }) => {
      const message = await sendManualMessage(input.contactId, input.content);
      return message ? { id: String(message.id), content: message.content, createdAt: message.createdAt.toISOString(), sender: message.senderType } : null;
    }),
    moveStage: publicProcedure.input(contactIdInput.extend({ stage: z.string().min(1).max(80) })).mutation(async ({ input }) => {
      await moveContactStage(input.contactId, input.stage);
      const contact = await getContactById(input.contactId);
      return contact ? mapContact(contact) : null;
    }),
    seed: publicProcedure.mutation(async () => {
      await ensureDemoInbox();
      return { success: true } as const;
    }),
  }),
});

export type AppRouter = typeof appRouter;
