import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  addPlatformWorkspaceNote,
  canPlatformAdminMutate,
  createPlatformBaileysInstance,
  createPlatformAiConnection,
  deletePlatformAiConnection,
  disconnectPlatformBaileysInstance,
  getActiveSupportSession,
  getPlatformGlobalAgentSnapshot,
  getPlatformAdminAccess,
  getPlatformSupportSnapshot,
  listPlatformSupportContacts,
  getPlatformSupportThread,
  sendPlatformSupportMessage,
  ensurePlatformSupportWorkspace,
  getPlatformAgentSnapshot,
  getPlatformWorkspaceDetail,
  recordPlatformAudit,
  isExternalProviderCallAllowedForSimulation,
  listPlatformAuditLogs,
  listPlatformAiConnections,
  listPlatformGlobalAuditLogs,
  listPlatformInstancePromptBindings,
  listPlatformWorkspaces,
  listPlatformWorkspaceNotes,
  publishPlatformAgentDraft,
  revokeSupportSession,
  resetPlatformWorkspace,
  rollbackPlatformAgentVersion,
  savePlatformAgentDraft,
  savePlatformGlobalAiPolicy,
  savePlatformInstancePromptBinding,
  setPlatformWorkspaceAi,
  setPlatformWorkspaceStatus,
  simulatePlatformAgent,
  testPlatformAiConnection,
  startSupportSession,
  validateAgentPromptInput,
  type PlatformPermission,
  type SupportSessionMode,
} from "./platform-admin";
import { authenticatedProcedure, router } from "./_core/trpc";
import {
  getBaileysInstance,
  listBaileysInstances,
  archiveBaileysInstance,
  updateBaileysInstanceName as updateBaileysInstanceRecordName,
  markConversationRead,
  setContactAi,
  renameContact as renameInboxContact,
  getContactById,
} from "./db";
import {
  connectBaileys,
  getBaileysQr,
  getBaileysStatus,
  requestBaileysPairingCode,
  deleteBaileysInstance as deleteBaileysGatewayInstance,
  getBaileysProfile,
  updateBaileysInstanceName,
  updateBaileysInstanceSettings,
} from "./baileys-gateway";
import { interactiveMetadataSchema, interactiveMessageTypeSchema } from "./interactive-messages";

const requirePlatform = authenticatedProcedure.use(async ({ ctx, next }) => {
  const platformAdmin = await getPlatformAdminAccess(ctx.user.id);
  if (!platformAdmin)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Esta área é exclusiva da operação da plataforma",
    });
  return next({ ctx: { platformAdmin } });
});

const requirePlatformOperator = requirePlatform.use(async ({ ctx, next }) => {
  if (
    !canPlatformAdminMutate(ctx.platformAdmin.permission as PlatformPermission)
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Sua permissão de suporte é somente leitura",
    });
  }
  return next();
});

const reasonInput = z
  .string()
  .trim()
  .min(3, "Informe o motivo da ação")
  .max(500);
const workspaceIdInput = z.number().int().positive();
const supportSessionInput = z.object({
  workspaceId: workspaceIdInput,
  sessionId: z.number().int().positive(),
});

async function requireSession(
  input: { workspaceId: number; sessionId: number },
  platformAdminId: number,
  requireOperator = false
) {
  const session = await getActiveSupportSession({
    platformAdminId,
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    requireOperator,
  });
  if (!session) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Sessão de suporte ausente, expirada, revogada ou fora do workspace",
    });
  }
  return session;
}

const providerConfigInput = z.object({
  enabled: z.boolean(),
  baseUrl: z.string().trim().max(500),
  apiKey: z.string().max(4_000),
});
const routingConfigInput = z.object({
  provider: z.enum(["nvidia_nim", "google_gemini", "openai_compatible"]),
  model: z.string().trim().min(1).max(200),
  baseUrl: z.string().trim().max(500).optional(),
  apiKey: z.string().max(4_000).optional(),
});
const globalLlmInput = z.object({
  providers: z.object({
    nvidia_nim: providerConfigInput,
    google_gemini: providerConfigInput,
    openai_compatible: providerConfigInput,
  }),
  routing: z.object({
    text: routingConfigInput,
    vision: routingConfigInput,
    audio: routingConfigInput,
    document: routingConfigInput,
  }),
});
const aiConnectionCapability = z.enum([
  "whatsapp_reply",
  "audio_transcription",
  "image_analysis",
  "document_analysis",
  "admin_support",
]);
const aiProvider = z.enum(["nvidia_nim", "google_gemini", "openai_compatible"]);
export const platformRouter = router({
  supportBaileysInstances: requirePlatform.query(async () => {
    const workspace = await ensurePlatformSupportWorkspace();
    return listBaileysInstances(workspace.id);
  }),
  supportCreateBaileysInstance: requirePlatformOperator
    .input(z.object({ name: z.string().trim().min(2).max(120) }))
    .mutation(async ({ input, ctx }) => {
      const workspace = await ensurePlatformSupportWorkspace();
      return createPlatformBaileysInstance({ platformAdminId: ctx.platformAdmin.id, workspaceId: workspace.id, supportSessionId: null, name: input.name, reason: "Criação de instância própria do suporte" });
    }),
  supportBaileysStatus: requirePlatform
    .input(z.object({ instanceId: z.string().min(1).max(160) }))
    .query(async ({ input }) => {
      const workspace = await ensurePlatformSupportWorkspace();
      const instance = await getBaileysInstance(workspace.id, input.instanceId);
      if (!instance) throw new TRPCError({ code: "NOT_FOUND", message: "Instância não encontrada" });
      return getBaileysStatus(instance.instanceId);
    }),
  supportBaileysProfile: requirePlatform
    .input(z.object({ instanceId: z.string().min(1).max(160) }))
    .query(async ({ input }) => {
      const workspace = await ensurePlatformSupportWorkspace();
      const instance = await getBaileysInstance(workspace.id, input.instanceId);
      if (!instance) throw new TRPCError({ code: "NOT_FOUND", message: "Instância não encontrada" });
      return getBaileysProfile(instance.instanceId);
    }),
  supportBaileysQr: requirePlatform
    .input(z.object({ instanceId: z.string().min(1).max(160) }))
    .query(async ({ input }) => {
      const workspace = await ensurePlatformSupportWorkspace();
      const instance = await getBaileysInstance(workspace.id, input.instanceId);
      if (!instance) throw new TRPCError({ code: "NOT_FOUND", message: "Instância não encontrada" });
      return getBaileysQr(instance.instanceId);
    }),
  supportConnectBaileys: requirePlatformOperator
    .input(z.object({ instanceId: z.string().min(1).max(160) }))
    .mutation(async ({ input }) => {
      const workspace = await ensurePlatformSupportWorkspace();
      const instance = await getBaileysInstance(workspace.id, input.instanceId);
      if (!instance) throw new TRPCError({ code: "NOT_FOUND", message: "Instância não encontrada" });
      return connectBaileys(instance.instanceId);
    }),
  supportRequestBaileysPairingCode: requirePlatformOperator
    .input(z.object({ instanceId: z.string().min(1).max(160), phone: z.string().min(8).max(24) }))
    .mutation(async ({ input }) => { const workspace = await ensurePlatformSupportWorkspace(); const instance = await getBaileysInstance(workspace.id, input.instanceId); if (!instance) throw new TRPCError({ code: "NOT_FOUND", message: "Instância não encontrada" }); return requestBaileysPairingCode(instance.instanceId, input.phone); }),
  supportDisconnectBaileys: requirePlatformOperator
    .input(z.object({ instanceId: z.string().min(1).max(160), logout: z.boolean().default(false) }))
    .mutation(async ({ input, ctx }) => { const workspace = await ensurePlatformSupportWorkspace(); return disconnectPlatformBaileysInstance({ platformAdminId: ctx.platformAdmin.id, workspaceId: workspace.id, supportSessionId: null, instanceId: input.instanceId, logout: input.logout, reason: "Desconexão de instância própria do suporte" }); }),
  supportRenameBaileysInstance: requirePlatformOperator
    .input(z.object({ instanceId: z.string().min(1).max(160), name: z.string().trim().min(2).max(120) }))
    .mutation(async ({ input }) => { const workspace = await ensurePlatformSupportWorkspace(); const instance = await getBaileysInstance(workspace.id, input.instanceId); if (!instance) throw new TRPCError({ code: "NOT_FOUND", message: "Instância não encontrada" }); await updateBaileysInstanceName(instance.instanceId, input.name); const updated = await updateBaileysInstanceRecordName(workspace.id, input.instanceId, input.name); return updated ?? { instanceId: input.instanceId, name: input.name }; }),
  supportUpdateBaileysInstanceSettings: requirePlatformOperator
    .input(z.object({ instanceId: z.string().min(1).max(160), settings: z.object({ rejectCalls: z.boolean(), rejectGroups: z.boolean(), logCalls: z.boolean(), ignoreStatusUpdates: z.boolean() }).strict() }))
    .mutation(async ({ input }) => { const workspace = await ensurePlatformSupportWorkspace(); const instance = await getBaileysInstance(workspace.id, input.instanceId); if (!instance) throw new TRPCError({ code: "NOT_FOUND", message: "Instância não encontrada" }); await updateBaileysInstanceSettings(instance.instanceId, input.settings); return getBaileysStatus(instance.instanceId); }),
  supportDeleteBaileysInstance: requirePlatformOperator
    .input(z.object({ instanceId: z.string().min(1).max(160), confirmDeletion: z.literal(true) }))
    .mutation(async ({ input }) => { const workspace = await ensurePlatformSupportWorkspace(); await deleteBaileysGatewayInstance(input.instanceId).catch(() => undefined); await archiveBaileysInstance(workspace.id, input.instanceId); return { success: true, instanceId: input.instanceId } as const; }),
  supportInbox: router({
    instances: requirePlatform.query(async () => {
      const snapshot = await getPlatformSupportSnapshot();
      return snapshot.instances;
    }),
    contacts: requirePlatform
      .input(
        z
          .object({
            instanceIds: z.array(z.string().min(1).max(160)).max(50).nullable().optional(),
            includeGroups: z.boolean().optional(),
          })
          .optional()
      )
      .query(() => listPlatformSupportContacts()),
    thread: requirePlatform
      .input(
        z.object({
          contactId: z.number().int().positive(),
          instanceIds: z.array(z.string().min(1).max(160)).max(50).nullable().optional(),
        })
      )
      .query(({ input }) =>
        getPlatformSupportThread(input.contactId, input.instanceIds ?? null)
      ),
    renameContact: requirePlatformOperator
      .input(z.object({ contactId: z.number().int().positive(), name: z.string().trim().min(2).max(160) }))
      .mutation(async ({ input, ctx }) => {
        const workspace = await ensurePlatformSupportWorkspace();
        const existing = await getContactById(workspace.id, input.contactId);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Lead não encontrado" });
        if (existing.groupId) throw new TRPCError({ code: "BAD_REQUEST", message: "O nome do grupo vem do WhatsApp" });
        const contact = await renameInboxContact(workspace.id, input.contactId, input.name, ctx.platformAdmin.userId);
        return contact ? (await listPlatformSupportContacts()).find(item => item.id === String(input.contactId)) ?? null : null;
      }),
    toggleAi: requirePlatformOperator
      .input(z.object({ contactId: z.number().int().positive(), enabled: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        const workspace = await ensurePlatformSupportWorkspace();
        await setContactAi(workspace.id, input.contactId, input.enabled, ctx.platformAdmin.userId);
        return (await listPlatformSupportContacts()).find(item => item.id === String(input.contactId)) ?? null;
      }),
    sendMessage: requirePlatformOperator
      .input(
        z.object({
          contactId: z.number().int().positive(),
          content: z.string().trim().min(1).max(12_000_000),
          messageType: z.enum(["text", "image", "audio", "video", "document"]).default("text"),
          metadata: z.record(z.string(), z.unknown()).optional(),
          instanceIds: z.array(z.string().min(1).max(160)).max(50).nullable().optional(),
        })
      )
      .mutation(({ input, ctx }) =>
        sendPlatformSupportMessage({
          ...input,
          platformAdminId: ctx.platformAdmin.id,
          actorUserId: ctx.platformAdmin.userId,
        })
      ),
    markRead: requirePlatform
      .input(z.object({ contactId: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const workspace = await ensurePlatformSupportWorkspace();
        const marked = await markConversationRead(workspace.id, ctx.platformAdmin.userId, input.contactId);
        if (!marked) throw new TRPCError({ code: "NOT_FOUND", message: "Conversa não encontrada" });
        return { conversationId: marked.conversationId, lastReadMessageId: marked.lastReadMessageId, readAt: marked.readAt.toISOString() };
      }),
  }),
  access: requirePlatform.query(({ ctx }) => ({
    id: ctx.platformAdmin.id,
    permission: ctx.platformAdmin.permission,
    canMutate: canPlatformAdminMutate(
      ctx.platformAdmin.permission as PlatformPermission
    ),
  })),

  overview: requirePlatform.query(() => listPlatformWorkspaces()),

  aiConnections: requirePlatform.query(() => listPlatformAiConnections()),

  createAiConnection: requirePlatformOperator
    .input(z.object({
      name: z.string().trim().min(2).max(120),
      capability: aiConnectionCapability,
      provider: aiProvider,
      baseUrl: z.string().trim().url().max(500),
      model: z.string().trim().min(1).max(200),
      apiKey: z.string().trim().min(1).max(4_000),
    }))
    .mutation(({ input, ctx }) => createPlatformAiConnection({ ...input, platformAdminId: ctx.platformAdmin.id })),

  testAiConnection: requirePlatformOperator
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input, ctx }) => testPlatformAiConnection({ ...input, platformAdminId: ctx.platformAdmin.id })),

  deleteAiConnection: requirePlatformOperator
    .input(z.object({ id: z.number().int().positive(), reason: reasonInput }))
    .mutation(({ input, ctx }) => deletePlatformAiConnection({ ...input, platformAdminId: ctx.platformAdmin.id })),

  globalAiConfig: requirePlatform.query(() => getPlatformGlobalAgentSnapshot()),

  globalAudit: requirePlatform
    .input(z.object({ limit: z.number().int().min(1).max(200).default(100) }).optional())
    .query(({ input }) => listPlatformGlobalAuditLogs(input?.limit ?? 100)),

  saveGlobalAiConfig: requirePlatformOperator
    .input(
      z.object({
        reason: reasonInput,
        enabled: z.boolean(),
        model: z.string().trim().min(1).max(200),
        systemPrompt: z.string().max(30_000),
        maxSteps: z.number().int().min(1).max(8),
        llm: globalLlmInput,
      })
    )
    .mutation(async ({ input, ctx }) => {
      const valid = validateAgentPromptInput(input);
      if (!valid.valid)
        throw new TRPCError({ code: "BAD_REQUEST", message: valid.reason });
      return savePlatformGlobalAiPolicy({
        ...input,
        platformAdminId: ctx.platformAdmin.id,
      });
    }),

  workspaces: requirePlatform
    .input(
      z.object({ search: z.string().trim().max(160).default("") }).optional()
    )
    .query(({ input }) => listPlatformWorkspaces(input?.search ?? "")),

  workspaceDetail: requirePlatform
    .input(supportSessionInput)
    .query(async ({ input, ctx }) => {
      const session = await requireSession(input, ctx.platformAdmin.id);
      const detail = await getPlatformWorkspaceDetail(input.workspaceId);
      if (!detail)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Workspace não encontrado",
        });
      return {
        ...detail,
        session: {
          id: session.id,
          mode: session.mode,
          status: session.status,
          expiresAt: session.expiresAt.toISOString(),
          scope: session.scope,
        },
      };
    }),

  startSupportSession: requirePlatform
    .input(
      z.object({
        workspaceId: workspaceIdInput,
        mode: z.enum(["read_only", "operator"]),
        reason: reasonInput,
        expiresInMinutes: z.number().int().min(5).max(60).default(30),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (
        input.mode === "operator" &&
        !canPlatformAdminMutate(
          ctx.platformAdmin.permission as PlatformPermission
        )
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Sua permissão não pode iniciar suporte mutável",
        });
      }
      return startSupportSession({
        ...input,
        platformAdminId: ctx.platformAdmin.id,
        mode: input.mode as SupportSessionMode,
      });
    }),

  revokeSupportSession: requirePlatform
    .input(
      z.object({ sessionId: z.number().int().positive(), reason: reasonInput })
    )
    .mutation(({ input, ctx }) =>
      revokeSupportSession({ ...input, platformAdminId: ctx.platformAdmin.id })
    ),

  requestBaileysPairingCode: requirePlatformOperator
    .input(
      supportSessionInput.extend({
        instanceId: z.string().trim().min(1).max(160),
        phone: z.string().trim().min(8).max(24),
        reason: reasonInput,
      })
    )
    .mutation(async ({ input, ctx }) => {
      const session = await requireSession(input, ctx.platformAdmin.id, true);
      const instance = await getBaileysInstance(
        input.workspaceId,
        input.instanceId
      );
      if (!instance) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Instância Baileys não encontrada neste workspace",
        });
      }
      const result = await requestBaileysPairingCode(
        instance.instanceId,
        input.phone
      );
      await recordPlatformAudit({
        platformAdminId: ctx.platformAdmin.id,
        workspaceId: input.workspaceId,
        supportSessionId: session.id,
        action: "baileys_pairing_code_requested",
        reason: input.reason,
        summary: `Código de pareamento solicitado para ${instance.name}`,
        before: { instanceId: instance.instanceId, status: instance.status },
        after: { instanceId: instance.instanceId, phone: input.phone.slice(-4) },
      });
      return result;
    }),

  createBaileysInstance: requirePlatformOperator
    .input(
      supportSessionInput.extend({
        name: z.string().trim().min(2).max(120),
        reason: reasonInput,
      })
    )
    .mutation(async ({ input, ctx }) => {
      const session = await requireSession(input, ctx.platformAdmin.id, true);
      return createPlatformBaileysInstance({
        platformAdminId: ctx.platformAdmin.id,
        workspaceId: input.workspaceId,
        supportSessionId: session.id,
        name: input.name,
        reason: input.reason,
      });
    }),

  supportWorkspace: requirePlatform.query(() => getPlatformSupportSnapshot()),

  supportAgent: requirePlatform.query(async () => {
    const workspace = await ensurePlatformSupportWorkspace();
    return getPlatformAgentSnapshot(workspace.id);
  }),

  supportPromptBindings: requirePlatform.query(() => listPlatformInstancePromptBindings()),

  saveSupportPromptBinding: requirePlatformOperator
    .input(
      z.object({
        instanceId: z.string().trim().min(1).max(160),
        enabled: z.boolean().default(false),
        model: z.string().trim().min(1).max(200),
        systemPrompt: z.string().max(30_000),
        maxSteps: z.number().int().min(1).max(8),
        reason: reasonInput,
      })
    )
    .mutation(async ({ input, ctx }) => {
      const workspace = await ensurePlatformSupportWorkspace();
      const instance = await getBaileysInstance(workspace.id, input.instanceId);
      if (!instance)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Instância de suporte não encontrada",
        });
      return savePlatformInstancePromptBinding({
        ...input,
        platformAdminId: ctx.platformAdmin.id,
        workspaceId: workspace.id,
      });
    }),

  saveSupportPrompt: requirePlatformOperator
    .input(
      z.object({
        enabled: z.boolean(),
        model: z.string().trim().min(1).max(200),
        systemPrompt: z.string().max(30_000),
        maxSteps: z.number().int().min(1).max(8),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const workspace = await ensurePlatformSupportWorkspace();
      return savePlatformAgentDraft({
        platformAdminId: ctx.platformAdmin.id,
        workspaceId: workspace.id,
        reason: "Atualização do prompt próprio do suporte da plataforma",
        draft: input,
      });
    }),

  publishSupportPrompt: requirePlatformOperator.mutation(async ({ ctx }) => {
    const workspace = await ensurePlatformSupportWorkspace();
    return publishPlatformAgentDraft({
      platformAdminId: ctx.platformAdmin.id,
      workspaceId: workspace.id,
      reason: "Publicação do prompt próprio do suporte da plataforma",
    });
  }),

  supportContacts: requirePlatform.query(() => listPlatformSupportContacts()),

  supportThread: requirePlatform
    .input(z.object({ contactId: z.number().int().positive() }))
    .query(({ input }) => getPlatformSupportThread(input.contactId)),

  createSupportInstance: requirePlatformOperator
    .input(z.object({ name: z.string().trim().min(2).max(120) }))
    .mutation(async ({ input, ctx }) => {
      const workspace = await ensurePlatformSupportWorkspace();
      return createPlatformBaileysInstance({
        platformAdminId: ctx.platformAdmin.id,
        workspaceId: workspace.id,
        supportSessionId: null,
        name: input.name,
        reason: "Criação de instância própria do suporte da plataforma",
      });
    }),

  requestSupportPairingCode: requirePlatformOperator
    .input(
      z.object({
        instanceId: z.string().trim().min(1).max(160),
        phone: z.string().trim().min(8).max(24),
      })
    )
    .mutation(async ({ input }) => {
      const workspace = await ensurePlatformSupportWorkspace();
      const instance = await getBaileysInstance(workspace.id, input.instanceId);
      if (!instance)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Instância de suporte não encontrada",
        });
      return requestBaileysPairingCode(instance.instanceId, input.phone);
    }),
  supportStatus: requirePlatform
    .input(z.object({ instanceId: z.string().trim().min(1).max(160) }))
    .query(async ({ input }) => {
      const workspace = await ensurePlatformSupportWorkspace();
      const instance = await getBaileysInstance(workspace.id, input.instanceId);
      if (!instance)
        throw new TRPCError({ code: "NOT_FOUND", message: "Instância de suporte não encontrada" });
      return getBaileysStatus(instance.instanceId);
    }),
  supportQr: requirePlatform
    .input(z.object({ instanceId: z.string().trim().min(1).max(160) }))
    .query(async ({ input }) => {
      const workspace = await ensurePlatformSupportWorkspace();
      const instance = await getBaileysInstance(workspace.id, input.instanceId);
      if (!instance)
        throw new TRPCError({ code: "NOT_FOUND", message: "Instância de suporte não encontrada" });
      return getBaileysQr(instance.instanceId);
    }),
  connectSupportInstance: requirePlatformOperator
    .input(z.object({ instanceId: z.string().trim().min(1).max(160) }))
    .mutation(async ({ input }) => {
      const workspace = await ensurePlatformSupportWorkspace();
      const instance = await getBaileysInstance(workspace.id, input.instanceId);
      if (!instance)
        throw new TRPCError({ code: "NOT_FOUND", message: "Instância de suporte não encontrada" });
      return connectBaileys(instance.instanceId);
    }),

  disconnectSupportInstance: requirePlatformOperator
    .input(
      z.object({
        instanceId: z.string().trim().min(1).max(160),
        logout: z.boolean().default(false),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const workspace = await ensurePlatformSupportWorkspace();
      const instance = await getBaileysInstance(workspace.id, input.instanceId);
      if (!instance)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Instância de suporte não encontrada",
        });
      return disconnectPlatformBaileysInstance({
        platformAdminId: ctx.platformAdmin.id,
        workspaceId: workspace.id,
        supportSessionId: null,
        instanceId: instance.instanceId,
        logout: input.logout,
        reason: "Desconexão de instância própria do suporte da plataforma",
      });
    }),

  sendSupportMessage: requirePlatformOperator
    .input(
      z.object({
        contactId: z.number().int().positive(),
        content: z.string().trim().min(1).max(12_000_000),
        messageType: z.union([z.literal("text"), interactiveMessageTypeSchema]).default("text"),
        metadata: interactiveMetadataSchema.optional(),
        instanceId: z.string().trim().min(1).max(160).optional(),
      })
    )
    .mutation(({ input, ctx }) =>
      sendPlatformSupportMessage({
        ...input,
        platformAdminId: ctx.platformAdmin.id,
        actorUserId: ctx.platformAdmin.userId,
      })
    ),

  disconnectBaileysInstance: requirePlatformOperator
    .input(
      supportSessionInput.extend({
        instanceId: z.string().trim().min(1).max(160),
        logout: z.boolean().default(false),
        reason: reasonInput,
      })
    )
    .mutation(async ({ input, ctx }) => {
      const session = await requireSession(input, ctx.platformAdmin.id, true);
      const instance = await getBaileysInstance(
        input.workspaceId,
        input.instanceId
      );
      if (!instance) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Instância Baileys não encontrada neste workspace",
        });
      }
      return disconnectPlatformBaileysInstance({
        platformAdminId: ctx.platformAdmin.id,
        workspaceId: input.workspaceId,
        supportSessionId: session.id,
        instanceId: instance.instanceId,
        logout: input.logout,
        reason: input.reason,
      });
    }),

  notes: requirePlatform
    .input(supportSessionInput)
    .query(async ({ input, ctx }) => {
      await requireSession(input, ctx.platformAdmin.id);
      return listPlatformWorkspaceNotes(input.workspaceId);
    }),

  audit: requirePlatform
    .input(
      supportSessionInput.extend({
        limit: z.number().int().min(1).max(200).default(100),
      })
    )
    .query(async ({ input, ctx }) => {
      await requireSession(input, ctx.platformAdmin.id);
      return listPlatformAuditLogs(input.workspaceId, input.limit);
    }),

  createNote: requirePlatformOperator
    .input(
      supportSessionInput.extend({
        body: z.string().trim().min(2).max(4000),
        reason: reasonInput,
      })
    )
    .mutation(async ({ input, ctx }) => {
      const session = await requireSession(input, ctx.platformAdmin.id, true);
      return addPlatformWorkspaceNote({
        platformAdminId: ctx.platformAdmin.id,
        workspaceId: input.workspaceId,
        supportSessionId: session.id,
        body: input.body,
        reason: input.reason,
      });
    }),

  agent: requirePlatform
    .input(supportSessionInput)
    .query(async ({ input, ctx }) => {
      await requireSession(input, ctx.platformAdmin.id);
      return getPlatformAgentSnapshot(input.workspaceId);
    }),

  saveAgentDraft: requirePlatformOperator
    .input(
      supportSessionInput.extend({
        reason: reasonInput,
        enabled: z.boolean(),
        model: z.string().trim().min(1).max(200),
        systemPrompt: z.string().max(30_000),
        maxSteps: z.number().int().min(1).max(8),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireSession(input, ctx.platformAdmin.id, true);
      return savePlatformAgentDraft({
        platformAdminId: ctx.platformAdmin.id,
        workspaceId: input.workspaceId,
        reason: input.reason,
        draft: {
          enabled: input.enabled,
          model: input.model,
          systemPrompt: input.systemPrompt,
          maxSteps: input.maxSteps,
        },
      });
    }),

  publishAgentDraft: requirePlatformOperator
    .input(supportSessionInput.extend({ reason: reasonInput }))
    .mutation(async ({ input, ctx }) => {
      await requireSession(input, ctx.platformAdmin.id, true);
      return publishPlatformAgentDraft({
        platformAdminId: ctx.platformAdmin.id,
        workspaceId: input.workspaceId,
        reason: input.reason,
      });
    }),

  rollbackAgent: requirePlatformOperator
    .input(
      supportSessionInput.extend({
        versionId: z.number().int().positive(),
        reason: reasonInput,
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireSession(input, ctx.platformAdmin.id, true);
      return rollbackPlatformAgentVersion({
        platformAdminId: ctx.platformAdmin.id,
        workspaceId: input.workspaceId,
        versionId: input.versionId,
        reason: input.reason,
      });
    }),

  simulateAgent: requirePlatformOperator
    .input(
      supportSessionInput.extend({
        message: z.string().trim().min(1).max(4000),
        reason: reasonInput,
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireSession(input, ctx.platformAdmin.id, true);
      return {
        ...(await simulatePlatformAgent({
          platformAdminId: ctx.platformAdmin.id,
          workspaceId: input.workspaceId,
          message: input.message,
          reason: input.reason,
        })),
        providerCallAllowed: isExternalProviderCallAllowedForSimulation(),
      };
    }),

  setWorkspaceAi: requirePlatformOperator
    .input(
      supportSessionInput.extend({ enabled: z.boolean(), reason: reasonInput })
    )
    .mutation(async ({ input, ctx }) => {
      await requireSession(input, ctx.platformAdmin.id, true);
      return setPlatformWorkspaceAi({
        platformAdminId: ctx.platformAdmin.id,
        workspaceId: input.workspaceId,
        enabled: input.enabled,
        reason: input.reason,
      });
    }),

  setWorkspaceStatus: requirePlatformOperator
    .input(
      supportSessionInput.extend({
        status: z.enum(["onboarding", "active", "suspended"]),
        reason: reasonInput,
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireSession(input, ctx.platformAdmin.id, true);
      return setPlatformWorkspaceStatus({
        platformAdminId: ctx.platformAdmin.id,
        workspaceId: input.workspaceId,
        status: input.status,
        reason: input.reason,
      });
    }),

  resetWorkspace: requirePlatformOperator
    .input(
      supportSessionInput.extend({
        confirmation: z.literal("APAGAR DADOS DO WORKSPACE"),
        reason: reasonInput,
      })
    )
    .mutation(async ({ input, ctx }) => {
      const session = await requireSession(input, ctx.platformAdmin.id, true);
      return resetPlatformWorkspace({
        platformAdminId: ctx.platformAdmin.id,
        workspaceId: input.workspaceId,
        supportSessionId: session.id,
        reason: input.reason,
      });
    }),
});
