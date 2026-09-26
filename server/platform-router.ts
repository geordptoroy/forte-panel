import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  addPlatformWorkspaceNote,
  canPlatformAdminMutate,
  getActiveSupportSession,
  getPlatformAdminAccess,
  getPlatformAgentSnapshot,
  getPlatformWorkspaceDetail,
  isExternalProviderCallAllowedForSimulation,
  listPlatformAuditLogs,
  listPlatformWorkspaces,
  listPlatformWorkspaceNotes,
  publishPlatformAgentDraft,
  revokeSupportSession,
  rollbackPlatformAgentVersion,
  savePlatformAgentDraft,
  setPlatformWorkspaceAi,
  setPlatformWorkspaceStatus,
  simulatePlatformAgent,
  startSupportSession,
  type PlatformPermission,
  type SupportSessionMode,
} from "./platform-admin";
import { authenticatedProcedure, router } from "./_core/trpc";

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

export const platformRouter = router({
  access: requirePlatform.query(({ ctx }) => ({
    id: ctx.platformAdmin.id,
    permission: ctx.platformAdmin.permission,
    canMutate: canPlatformAdminMutate(
      ctx.platformAdmin.permission as PlatformPermission
    ),
  })),

  overview: requirePlatform.query(() => listPlatformWorkspaces()),

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
});
