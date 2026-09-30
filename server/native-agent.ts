import crypto from "node:crypto";
import { type Message, type Tool } from "./_core/llm";
import {
  createAgendaAppointment,
  getAgendaSnapshot,
  getActiveQuoteSummaryByContact,
  getCanonicalContactStage,
  getContactById,
  getOnboardingProfile,
  leadMemoryOperation,
  listMessagesForContact,
  listContactNotes,
  queueOutboundMessage,
  recordAgentRun,
  completeAgentEffect,
  createAgentEffectProposal,
  failAgentEffect,
  setContactAi,
} from "./db";
import {
  capabilityForMessageType,
  invokeConfiguredLLM,
  type AgentProviderSettings,
} from "./llm-providers";
import { resolvePrivateMediaUrl } from "./media-storage";

export type NativeAgentEvent = {
  eventId: string;
  workspaceId: number;
  contactId: number;
  conversationId: number;
  instanceId?: string;
  content: string;
  messageType?: string;
  metadata?: Record<string, unknown>;
  messages?: Array<{ content: string; messageType: string; receivedAt: Date }>;
};

type AgentConfig = {
  enabled: boolean;
  model: string;
  systemPrompt: string;
  maxSteps: number;
  llm: AgentProviderSettings;
};

const defaultModel = process.env.AGENT_MODEL ?? "gpt-5-mini";

const tools: Tool[] = [
  {
    type: "function",
    function: {
      name: "consultar_contexto_comercial",
      description:
        "Consulta o contexto comercial real e aprovado do contato atual: etapa canônica, serviço solicitado, urgência, orçamento aprovado e notas internas recentes. Use antes de responder sobre preço, etapa ou próximos passos.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "buscar_lead",
      description:
        "Consulta os dados, notas e histórico do lead pelo telefone.",
      parameters: {
        type: "object",
        properties: { phone: { type: "string" } },
        required: ["phone"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "atualizar_lead",
      description:
        "Atualiza nome, cidade, bairro, serviço, urgência, etapa ou status da IA do lead.",
      parameters: {
        type: "object",
        properties: {
          phone: { type: "string" },
          fields: {
            type: "object",
            properties: {
              name: { type: "string" },
              city: { type: "string" },
              neighborhood: { type: "string" },
              serviceRequested: { type: "string" },
              urgency: {
                type: "string",
                enum: ["Baixa", "Média", "Alta", "Crítica"],
              },
              stage: { type: "string" },
              quoteCents: { type: "number" },
              aiEnabled: { type: "boolean" },
            },
            additionalProperties: false,
          },
        },
        required: ["phone", "fields"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "registrar_nota",
      description: "Registra uma nota interna sobre o lead.",
      parameters: {
        type: "object",
        properties: { phone: { type: "string" }, note: { type: "string" } },
        required: ["phone", "note"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_agenda",
      description:
        "Consulta serviços ativos do catálogo operacional, preço fixo/a partir de/sob consulta, duração, profissionais vinculados, jornada semanal e próximos agendamentos do Forte Panel. A jornada não garante uma vaga; verifique os agendamentos do horário exato.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "criar_agendamento",
      description:
        "Cria um agendamento depois de confirmar serviço, profissional, data e horário com o cliente.",
      parameters: {
        type: "object",
        properties: {
          contactId: { type: "number" },
          serviceId: { type: "number" },
          professionalId: { type: "number" },
          startsAt: { type: "string" },
          endsAt: { type: "string" },
          notes: { type: "string" },
        },
        required: [
          "contactId",
          "serviceId",
          "professionalId",
          "startsAt",
          "endsAt",
        ],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "transferir_humano",
      description: "Pausa a IA e transfere a conversa para atendimento humano.",
      parameters: {
        type: "object",
        properties: {
          contactId: { type: "number" },
          reason: { type: "string" },
        },
        required: ["contactId", "reason"],
        additionalProperties: false,
      },
    },
  },
];

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Argumentos da ferramenta inválidos");
  return value as Record<string, unknown>;
}
function asString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`${field} é obrigatório`);
  return value.trim();
}
function asNumber(value: unknown, field: string) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${field} é obrigatório`);
  return n;
}

function fallbackPrompt(profilePrompt: string) {
  return `${profilePrompt}\n\nVocê é o agente nativo do Forte Panel. Você atende pelo WhatsApp em português do Brasil. Use as ferramentas para consultar e alterar dados reais; nunca invente disponibilidade, preço, cadastro ou confirmação. Antes de criar agendamento, confirme explicitamente serviço, profissional, data e horário. Quando houver pedido de humano, reclamação, risco, negociação especial ou incerteza, use transferir_humano. Depois de executar uma ferramenta, responda de forma curta, clara e cordial.`;
}

async function runNativeAgentCore(
  event: NativeAgentEvent,
  config: AgentConfig
) {
  const contact = await getContactById(event.workspaceId, event.contactId);
  if (!contact) throw new Error("Contato do evento não encontrado");
  const thread = await listMessagesForContact(
    event.workspaceId,
    event.contactId
  );
  const onboarding = await getOnboardingProfile(event.workspaceId);
  const configuredPrompt = config.systemPrompt.trim() || onboarding.prompt;
  const system = fallbackPrompt(
    configuredPrompt || "Atenda o cliente com segurança e cordialidade."
  );
  const history: Message[] = thread.slice(-30).map(message => ({
    role:
      message.senderType === "lead"
        ? "user"
        : message.senderType === "ai"
          ? "assistant"
          : "user",
    content: message.content,
  }));
  const mediaData =
    typeof event.metadata?.mediaData === "string"
      ? event.metadata.mediaData
      : await resolvePrivateMediaUrl(event.metadata);
  const mediaMimeType =
    typeof event.metadata?.mediaMimeType === "string"
      ? event.metadata.mediaMimeType
      : undefined;
  const entryText = `Nova entrada (${event.messageType ?? "text"}) de ${contact.name} (${contact.externalPhone}):\n${event.content}`;
  const entryContent: Message["content"] =
    mediaData && event.messageType === "image"
      ? [
          { type: "text", text: entryText },
          { type: "image_url", image_url: { url: mediaData, detail: "auto" } },
        ]
      : mediaData &&
          ["audio", "document", "video"].includes(event.messageType ?? "")
        ? [
            { type: "text", text: entryText },
            {
              type: "file_url",
              file_url: {
                url: mediaData,
                ...(mediaMimeType
                  ? {
                      mime_type: mediaMimeType as
                        | "audio/mpeg"
                        | "audio/wav"
                        | "application/pdf"
                        | "audio/mp4"
                        | "video/mp4",
                    }
                  : {}),
              },
            },
          ]
        : entryText;
  history.push({ role: "user", content: entryContent });
  let messages: Message[] = [{ role: "system", content: system }, ...history];
  const maxSteps = Math.max(1, Math.min(8, config.maxSteps || 6));
  const startedAt = Date.now();
  let toolCalls = 0;
  let transferred = false;
  let pendingConfirmation = false;
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  for (let step = 0; step < maxSteps; step += 1) {
    const response = await invokeConfiguredLLM(
      config.llm,
      capabilityForMessageType(event.messageType),
      {
        model: config.model || defaultModel,
        messages,
        tools,
        toolChoice: "auto",
        maxTokens: 1800,
      }
    );
    inputTokens += response.usage?.prompt_tokens ?? 0;
    outputTokens += response.usage?.completion_tokens ?? 0;
    totalTokens += response.usage?.total_tokens ?? 0;
    const assistant = response.choices[0]?.message;
    if (!assistant) throw new Error("O modelo não retornou resposta");
    messages.push({
      role: "assistant",
      content: assistant.content ?? "",
      ...(assistant.tool_calls ? { tool_calls: assistant.tool_calls } : {}),
    });
    if (!assistant.tool_calls?.length) {
      const text =
        typeof assistant.content === "string" ? assistant.content.trim() : "";
      if (text)
        await queueOutboundMessage(
          event.workspaceId,
          event.contactId,
          text,
          undefined,
          "ai",
          "text",
          {
            agent: true,
            eventId: event.eventId,
            model: response.model,
            ...(event.instanceId ? { instanceId: event.instanceId } : {}),
          }
        );
      return { response: text, steps: step + 1, model: response.model, toolCalls, transferred, pendingConfirmation, inputTokens, outputTokens, totalTokens, latencyMs: Date.now() - startedAt };
    }
    for (const call of assistant.tool_calls) {
      toolCalls += 1;
      const args = asObject(JSON.parse(call.function.arguments || "{}"));
      const result = await executeTool(
        call.function.name,
        args,
        event,
        call.id
      );
      const flags = result as { transferred?: boolean; pendingConfirmation?: boolean };
      transferred ||= flags.transferred === true;
      pendingConfirmation ||= flags.pendingConfirmation === true;
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
  }
  throw new Error("O agente excedeu o número máximo de etapas");
}

export async function runNativeAgent(event: NativeAgentEvent, config: AgentConfig) {
  const startedAt = Date.now();
  try {
    const result = await runNativeAgentCore(event, config);
    await recordAgentRun({
      workspaceId: event.workspaceId,
      eventId: event.eventId,
      contactId: event.contactId,
      model: result.model,
      outcome: result.pendingConfirmation ? "pending_confirmation" : result.transferred ? "transferred" : "resolved",
      steps: result.steps,
      toolCalls: result.toolCalls,
      transferred: result.transferred,
      pendingConfirmation: result.pendingConfirmation,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      totalTokens: result.totalTokens,
      latencyMs: result.latencyMs,
    });
    return result;
  } catch (error) {
    await recordAgentRun({ workspaceId: event.workspaceId, eventId: event.eventId, contactId: event.contactId, outcome: "failed", steps: 0, toolCalls: 0, transferred: false, pendingConfirmation: false, latencyMs: Date.now() - startedAt });
    throw error;
  }
}

const mutatingTools = new Set([
  "atualizar_lead",
  "registrar_nota",
  "criar_agendamento",
  "transferir_humano",
]);

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  event: NativeAgentEvent,
  toolCallId: string
) {
  if (!mutatingTools.has(name)) return executeToolEffect(name, args, event);
  const fingerprint = crypto
    .createHash("sha256")
    .update(JSON.stringify({ name, args }))
    .digest("hex");
  const proposal = await createAgentEffectProposal({
    workspaceId: event.workspaceId,
    eventId: event.eventId,
    toolCallId,
    toolName: name,
    fingerprint,
    proposal: {
      kind: "human_confirmation_required",
      action: name,
      args,
      event: {
        eventId: event.eventId,
        workspaceId: event.workspaceId,
        contactId: event.contactId,
        conversationId: event.conversationId,
        instanceId: event.instanceId,
      },
    },
  });
  if (!proposal) throw new Error("Não foi possível registrar a confirmação");
  return {
    pendingConfirmation: true,
    confirmationId: proposal.id,
    action: name,
    message: "A ação foi preparada e aguarda confirmação humana.",
  };
}

export async function confirmNativeAgentEffect(input: {
  workspaceId: number;
  effect: { id: number; eventId: string; toolCallId: string; toolName: string; result: string | null };
  actorUserId: number;
}) {
  if (!input.effect.result) throw new Error("Proposta do agente sem payload");
  const proposal = JSON.parse(input.effect.result) as {
    args: Record<string, unknown>;
    event: NativeAgentEvent;
  };
  const event = { ...proposal.event, workspaceId: input.workspaceId };
  try {
    const result = await executeToolEffect(input.effect.toolName, proposal.args, event);
    await completeAgentEffect({ workspaceId: input.workspaceId, eventId: input.effect.eventId, toolCallId: input.effect.toolCallId, result: { ...result, confirmedByUserId: input.actorUserId } });
    return result;
  } catch (error) {
    await failAgentEffect({ workspaceId: input.workspaceId, eventId: input.effect.eventId, toolCallId: input.effect.toolCallId, result: { error: error instanceof Error ? error.message : "Falha na ferramenta" } });
    throw error;
  }
}

async function executeToolEffect(
  name: string,
  args: Record<string, unknown>,
  event: NativeAgentEvent
) {
  if (name === "consultar_contexto_comercial") {
    const currentContact = await getContactById(event.workspaceId, event.contactId);
    if (!currentContact) throw new Error("Contato do evento não encontrado");
    const [stage, quoteSummary, notes] = await Promise.all([
      getCanonicalContactStage(event.workspaceId, event.contactId),
      getActiveQuoteSummaryByContact(event.workspaceId, [event.contactId]),
      listContactNotes(event.workspaceId, event.contactId),
    ]);
    const approvedQuote = quoteSummary.get(event.contactId);
    return {
      source: "workspace_commercial_context",
      contact: {
        id: currentContact.id,
        name: currentContact.name,
        city: currentContact.city,
        neighborhood: currentContact.neighborhood,
        serviceRequested: currentContact.serviceRequested,
        urgency: currentContact.urgency,
      },
      opportunity: { stage: stage ?? null },
      approvedQuote: approvedQuote
        ? {
            quoteId: approvedQuote.quoteId,
            quotedCents: approvedQuote.quotedCents,
            receivedCents: approvedQuote.receivedCents,
            pendingCents: approvedQuote.pendingCents,
          }
        : null,
      recentNotes: notes.slice(0, 5).map(note => ({
        content: note.content,
        createdAt: note.createdAt,
      })),
      guardrail:
        "Dados somente leitura do workspace do contato; não trate observação livre como preço, disponibilidade ou confirmação.",
    };
  }
  if (name === "buscar_lead")
    return leadMemoryOperation(event.workspaceId, {
      action: "buscar_lead",
      phone: asString(args.phone, "phone"),
    });
  if (name === "atualizar_lead")
    return leadMemoryOperation(event.workspaceId, {
      action: "atualizar_lead",
      phone: asString(args.phone, "phone"),
      fields: asObject(args.fields) as Parameters<
        typeof leadMemoryOperation
      >[1]["fields"],
    });
  if (name === "registrar_nota")
    return leadMemoryOperation(event.workspaceId, {
      action: "registrar_nota",
      phone: asString(args.phone, "phone"),
      note: asString(args.note, "note"),
    });
  if (name === "consultar_agenda") return getAgendaSnapshot(event.workspaceId);
  if (name === "criar_agendamento") {
    const appointment = await createAgendaAppointment(event.workspaceId, {
      contactId: asNumber(args.contactId ?? event.contactId, "contactId"),
      serviceId: asNumber(args.serviceId, "serviceId"),
      professionalId: asNumber(args.professionalId, "professionalId"),
      startsAt: new Date(asString(args.startsAt, "startsAt")),
      endsAt: new Date(asString(args.endsAt, "endsAt")),
      notes: typeof args.notes === "string" ? args.notes : undefined,
    });
    return appointment
      ? {
          id: appointment.id,
          status: appointment.status,
          startsAt: appointment.startsAt,
          endsAt: appointment.endsAt,
        }
      : { created: false };
  }
  if (name === "transferir_humano") {
    await setContactAi(
      event.workspaceId,
      asNumber(args.contactId ?? event.contactId, "contactId"),
      false
    );
    return { transferred: true, reason: asString(args.reason, "reason") };
  }
  throw new Error(`Ferramenta não disponível: ${name}`);
}

export { tools as nativeAgentTools };
