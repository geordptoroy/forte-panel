import { DynamicTool } from '@langchain/core/tools';
import type { IDataObject, IHttpRequestOptions, IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription, ISupplyDataFunctions, SupplyData } from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';
import { createIdempotencyKey } from './idempotency';

function asString(value: unknown): string {
  return value === undefined || value === null ? '' : String(value);
}

async function callPanel(ctx: ISupplyDataFunctions, input: string, invocationIndex = 0): Promise<string> {
  const credentials = await ctx.getCredentials('fortePanelApi');
  const baseUrl = asString(credentials.baseUrl).replace(/\/$/, '');
  let args: Record<string, unknown>;
  const rawInput = input as unknown;
  if (rawInput && typeof rawInput === 'object') {
    args = rawInput as Record<string, unknown>;
  } else {
    const text = asString(rawInput).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    try {
      args = JSON.parse(text) as Record<string, unknown>;
    } catch {
      args = { operation: text };
    }
  }
  const nested = [args.input, args.arguments, args.tool_input].find((value) => value && typeof value === 'object') as Record<string, unknown> | undefined;
  if (nested) args = { ...args, ...nested };

  const operation = asString(args.operation || args.action || 'published_prompt');
  const phone = asString(args.phone ?? args.telefone ?? args.remetente ?? args.phoneNumber).replace(/\D/g, '');
  const contactId = Number(args.contactId);
  const fields = (args.fields && typeof args.fields === 'object' ? args.fields : {
    name: args.name ?? args.nome,
    city: args.city ?? args.cidade,
    neighborhood: args.neighborhood ?? args.bairro,
    serviceRequested: args.serviceRequested ?? args.servico ?? args.service,
    urgency: args.urgency,
    stage: args.stage,
    quoteCents: args.quoteCents,
    aiEnabled: args.aiEnabled,
  }) as IDataObject;
  const request: IHttpRequestOptions = { method: 'GET', url: `${baseUrl}/onboarding/prompt`, json: true };

  if (['buscar_lead', 'criar_lead', 'atualizar_lead', 'registrar_nota'].includes(operation)) {
    request.method = 'POST';
    request.url = `${baseUrl}/lead-memory`;
    request.body = {
      action: operation,
      phone,
      name: asString(args.name ?? args.nome) || undefined,
      fields,
      note: asString(args.note ?? args.nota) || undefined,
    };
  } else if (operation === 'availability') {
    request.url = `${baseUrl}/availability`;
    request.qs = { date: asString(args.startsAt), serviceId: args.serviceId as IDataObject, professionalId: args.professionalId as IDataObject };
  } else if (operation === 'create_appointment') {
    request.method = 'POST';
    request.url = `${baseUrl}/appointments`;
    request.body = {
      contactId: args.contactId as number,
      serviceId: args.serviceId as number,
      professionalId: args.professionalId as number,
      startsAt: asString(args.startsAt),
      endsAt: asString(args.endsAt),
      notes: asString(args.notes),
    };
  } else if (operation === 'cancel_appointment') {
    request.method = 'POST';
    request.url = `${baseUrl}/appointments/${asString(args.appointmentId)}/cancel`;
  } else if (operation === 'reschedule_appointment') {
    request.method = 'POST';
    request.url = `${baseUrl}/appointments/${asString(args.appointmentId)}/reschedule`;
    request.body = { startsAt: asString(args.startsAt), endsAt: asString(args.endsAt) };
  } else if (operation === 'queue_message') {
    request.method = 'POST';
    request.url = `${baseUrl}/messages`;
    request.body = {
      contactId: Number.isInteger(contactId) && contactId > 0 ? contactId : undefined,
      phone: asString(args.phone) || undefined,
      name: asString(args.name) || undefined,
      content: asString(args.content),
      provider: asString(args.provider || 'papi'),
      senderType: asString(args.senderType || 'ai'),
      messageType: asString(args.messageType || 'text'),
      instanceId: asString(args.instanceId) || undefined,
      metadata: args.metadata && typeof args.metadata === 'object' ? args.metadata : undefined,
    };
  } else if (operation !== 'published_prompt') {
    throw new Error(`Ação não reconhecida: ${operation}`);
  }

  if (request.method !== 'GET') {
    request.headers = {
      ...request.headers,
      'Idempotency-Key': createIdempotencyKey({
        executionId: `${ctx.getExecutionId()}-${invocationIndex}`,
        operation,
        path: request.url.slice(baseUrl.length),
        body: request.body,
        suppliedKey: asString(args.idempotencyKey),
      }),
    };
  }

  const response = await ctx.helpers.httpRequestWithAuthentication.call(ctx, 'fortePanelApi', request);
  return typeof response === 'string' ? response : JSON.stringify(response);
}

export class FortePanelAiTool implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Forte Panel Tool',
    name: 'fortePanelTool',
    icon: 'file:forte-panel.svg',
    group: ['transform'],
    version: 1,
    description: 'Ferramenta nativa do AI Agent para consultar e atualizar o Forte Panel. Envie um JSON com operation e os campos necessários.',
    defaults: { name: 'Forte Panel Tool' },
    inputs: [],
    outputs: [NodeConnectionTypes.AiTool],
    outputNames: ['Tool'],
    credentials: [{ name: 'fortePanelApi', required: true }],
    properties: [],
  };

  async supplyData(this: ISupplyDataFunctions): Promise<SupplyData> {
    let invocationIndex = 0;
    return {
      response: new DynamicTool({
        name: 'fortePanel',
        description: 'Use esta ferramenta para operar o Forte Panel. Input JSON: {operation:"buscar_lead|criar_lead|atualizar_lead|registrar_nota|availability|create_appointment|cancel_appointment|reschedule_appointment|published_prompt|queue_message", phone?, name?, fields?, note?, contactId?, serviceId?, professionalId?, startsAt?, endsAt?, appointmentId?, notes?, content?, provider?, senderType?, messageType?, instanceId?, metadata?, idempotencyKey?}. Para botões use messageType="button" e metadata.buttons com objetos {id,displayText}; para áudio use messageType="audio" e content com URL. queue_message assume senderType="ai" e não ativa controle humano.',
        func: async (input: string) => callPanel(this, input, invocationIndex++),
      }),
    };
  }

  /**
   * n8n 2.x validates executable nodes before running a workflow, even when
   * the node is connected through the ai_tool sub-node connection. Keep a
   * direct execution path for manual runs and compatibility with that
   * validator; the AI Agent normally uses supplyData above.
   */
  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const input = this.getInputData();
    const output: INodeExecutionData[] = [];
    for (let index = 0; index < input.length; index += 1) {
      const value = input[index]?.json ?? {};
      const response = await callPanel(this as unknown as ISupplyDataFunctions, JSON.stringify(value), index);
      output.push({ json: { response }, pairedItem: { item: index } });
    }
    return [output];
  }
}
