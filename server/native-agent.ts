import { invokeLLM, type Message, type Tool } from "./_core/llm";
import {
  createAgendaAppointment,
  getAgendaSnapshot,
  getContactById,
  getOnboardingProfile,
  leadMemoryOperation,
  listMessagesForContact,
  queueOutboundMessage,
  setContactAi,
} from "./db";

export type NativeAgentEvent = {
  eventId: string;
  workspaceId: number;
  contactId: number;
  conversationId: number;
  content: string;
  messageType?: string;
  messages?: Array<{ content: string; messageType: string; receivedAt: Date }>;
};

type AgentConfig = {
  enabled: boolean;
  model: string;
  systemPrompt: string;
  maxSteps: number;
};

const defaultModel = process.env.AGENT_MODEL ?? "gpt-5-mini";

const tools: Tool[] = [
  { type: "function", function: { name: "buscar_lead", description: "Consulta os dados, notas e histórico do lead pelo telefone.", parameters: { type: "object", properties: { phone: { type: "string" } }, required: ["phone"], additionalProperties: false } } },
  { type: "function", function: { name: "atualizar_lead", description: "Atualiza nome, cidade, bairro, serviço, urgência, etapa ou status da IA do lead.", parameters: { type: "object", properties: { phone: { type: "string" }, fields: { type: "object", properties: { name: { type: "string" }, city: { type: "string" }, neighborhood: { type: "string" }, serviceRequested: { type: "string" }, urgency: { type: "string", enum: ["Baixa", "Média", "Alta", "Crítica"] }, stage: { type: "string" }, quoteCents: { type: "number" }, aiEnabled: { type: "boolean" } }, additionalProperties: false } }, required: ["phone", "fields"], additionalProperties: false } } },
  { type: "function", function: { name: "registrar_nota", description: "Registra uma nota interna sobre o lead.", parameters: { type: "object", properties: { phone: { type: "string" }, note: { type: "string" } }, required: ["phone", "note"], additionalProperties: false } } },
  { type: "function", function: { name: "consultar_agenda", description: "Consulta serviços, profissionais, disponibilidade e próximos agendamentos do Forte Panel.", parameters: { type: "object", properties: {}, additionalProperties: false } } },
  { type: "function", function: { name: "criar_agendamento", description: "Cria um agendamento depois de confirmar serviço, profissional, data e horário com o cliente.", parameters: { type: "object", properties: { contactId: { type: "number" }, serviceId: { type: "number" }, professionalId: { type: "number" }, startsAt: { type: "string" }, endsAt: { type: "string" }, notes: { type: "string" } }, required: ["contactId", "serviceId", "professionalId", "startsAt", "endsAt"], additionalProperties: false } } },
  { type: "function", function: { name: "transferir_humano", description: "Pausa a IA e transfere a conversa para atendimento humano.", parameters: { type: "object", properties: { contactId: { type: "number" }, reason: { type: "string" } }, required: ["contactId", "reason"], additionalProperties: false } } },
];

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Argumentos da ferramenta inválidos");
  return value as Record<string, unknown>;
}
function asString(value: unknown, field: string) { if (typeof value !== "string" || !value.trim()) throw new Error(`${field} é obrigatório`); return value.trim(); }
function asNumber(value: unknown, field: string) { const n = Number(value); if (!Number.isFinite(n)) throw new Error(`${field} é obrigatório`); return n; }

function fallbackPrompt(profilePrompt: string) {
  return `${profilePrompt}\n\nVocê é o agente nativo do Forte Panel. Você atende pelo WhatsApp em português do Brasil. Use as ferramentas para consultar e alterar dados reais; nunca invente disponibilidade, preço, cadastro ou confirmação. Antes de criar agendamento, confirme explicitamente serviço, profissional, data e horário. Quando houver pedido de humano, reclamação, risco, negociação especial ou incerteza, use transferir_humano. Depois de executar uma ferramenta, responda de forma curta, clara e cordial.`;
}

export async function runNativeAgent(event: NativeAgentEvent, config: AgentConfig) {
  const contact = await getContactById(event.contactId);
  if (!contact) throw new Error("Contato do evento não encontrado");
  const thread = await listMessagesForContact(event.contactId);
  const onboarding = await getOnboardingProfile();
  const configuredPrompt = config.systemPrompt.trim() || onboarding.prompt;
  const system = fallbackPrompt(configuredPrompt || "Atenda o cliente com segurança e cordialidade.");
  const history: Message[] = thread.slice(-30).map((message) => ({
    role: message.senderType === "lead" ? "user" : message.senderType === "ai" ? "assistant" : "user",
    content: message.content,
  }));
  history.push({ role: "user", content: `Nova entrada (${event.messageType ?? "text"}) de ${contact.name} (${contact.externalPhone}):\n${event.content}` });
  let messages: Message[] = [{ role: "system", content: system }, ...history];
  const maxSteps = Math.max(1, Math.min(8, config.maxSteps || 6));
  for (let step = 0; step < maxSteps; step += 1) {
    const response = await invokeLLM({ model: config.model || defaultModel, messages, tools, toolChoice: "auto", maxTokens: 1800 });
    const assistant = response.choices[0]?.message;
    if (!assistant) throw new Error("O modelo não retornou resposta");
    messages.push({ role: "assistant", content: assistant.content ?? "", ...(assistant.tool_calls ? { tool_calls: assistant.tool_calls } : {}) });
    if (!assistant.tool_calls?.length) {
      const text = typeof assistant.content === "string" ? assistant.content.trim() : "";
      if (text) await queueOutboundMessage(event.contactId, text, undefined, "ai", "text", { agent: true, eventId: event.eventId, model: response.model });
      return { response: text, steps: step + 1, model: response.model };
    }
    for (const call of assistant.tool_calls) {
      const args = asObject(JSON.parse(call.function.arguments || "{}"));
      const result = await executeTool(call.function.name, args, event);
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  throw new Error("O agente excedeu o número máximo de etapas");
}

async function executeTool(name: string, args: Record<string, unknown>, event: NativeAgentEvent) {
  if (name === "buscar_lead") return leadMemoryOperation({ action: "buscar_lead", phone: asString(args.phone, "phone") });
  if (name === "atualizar_lead") return leadMemoryOperation({ action: "atualizar_lead", phone: asString(args.phone, "phone"), fields: asObject(args.fields) as Parameters<typeof leadMemoryOperation>[0]["fields"] });
  if (name === "registrar_nota") return leadMemoryOperation({ action: "registrar_nota", phone: asString(args.phone, "phone"), note: asString(args.note, "note") });
  if (name === "consultar_agenda") return getAgendaSnapshot();
  if (name === "criar_agendamento") {
    const appointment = await createAgendaAppointment({ contactId: asNumber(args.contactId ?? event.contactId, "contactId"), serviceId: asNumber(args.serviceId, "serviceId"), professionalId: asNumber(args.professionalId, "professionalId"), startsAt: new Date(asString(args.startsAt, "startsAt")), endsAt: new Date(asString(args.endsAt, "endsAt")), notes: typeof args.notes === "string" ? args.notes : undefined });
    return appointment ? { id: appointment.id, status: appointment.status, startsAt: appointment.startsAt, endsAt: appointment.endsAt } : { created: false };
  }
  if (name === "transferir_humano") {
    await setContactAi(asNumber(args.contactId ?? event.contactId, "contactId"), false);
    return { transferred: true, reason: asString(args.reason, "reason") };
  }
  throw new Error(`Ferramenta não disponível: ${name}`);
}

export { tools as nativeAgentTools };
