import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  INodeProperties,
  IHttpRequestOptions,
  IDataObject,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { createIdempotencyKey } from './idempotency';

const fromAi = (name: string, description: string, type = 'string') => `={{ $fromAI('${name}', '${description.replace(/'/g, "\\'")}', '${type}') }}`;

const properties: INodeProperties[] = [
  {
    displayName: 'Ação',
    name: 'operation',
    type: 'string',
    default: fromAi('operation', 'Uma das ações disponíveis: buscar_lead, criar_lead, atualizar_lead, registrar_nota, availability, create_appointment, cancel_appointment, reschedule_appointment, published_prompt ou queue_message'),
    description: 'A operação que o agente deve escolher. Quando conectado ao AI Agent, o agente pode preencher este campo via $fromAI.',
  },
  {
    displayName: 'Telefone',
    name: 'phone',
    type: 'string',
    default: fromAi('phone', 'Número WhatsApp do lead em formato internacional, somente dígitos'),
    description: 'Usado pelas operações de CRM e envio.',
  },
  {
    displayName: 'Nome',
    name: 'name',
    type: 'string',
    default: fromAi('name', 'Nome do lead'),
  },
  {
    displayName: 'Campos do lead (JSON)',
    name: 'fields',
    type: 'json',
    default: fromAi('fields', 'Objeto JSON com city, neighborhood, serviceRequested, urgency, stage, quoteCents e aiEnabled', 'json'),
    description: 'Campos estruturados para criar ou atualizar o lead.',
  },
  {
    displayName: 'Nota',
    name: 'note',
    type: 'string',
    typeOptions: { rows: 3 },
    default: fromAi('note', 'Nota interna que deve ser salva na ficha do lead'),
  },
  {
    displayName: 'ID do Contato',
    name: 'contactId',
    type: 'number',
    default: fromAi('contactId', 'ID numérico do contato no Forte Panel', 'number'),
  },
  {
    displayName: 'ID do Serviço',
    name: 'serviceId',
    type: 'number',
    default: fromAi('serviceId', 'ID numérico do serviço da agenda', 'number'),
  },
  {
    displayName: 'ID do Profissional',
    name: 'professionalId',
    type: 'number',
    default: fromAi('professionalId', 'ID numérico do profissional da agenda', 'number'),
  },
  {
    displayName: 'Início',
    name: 'startsAt',
    type: 'dateTime',
    default: fromAi('startsAt', 'Data e hora inicial ISO do agendamento', 'string'),
  },
  {
    displayName: 'Fim',
    name: 'endsAt',
    type: 'dateTime',
    default: fromAi('endsAt', 'Data e hora final ISO do agendamento', 'string'),
  },
  {
    displayName: 'ID do Agendamento',
    name: 'appointmentId',
    type: 'number',
    default: fromAi('appointmentId', 'ID numérico do agendamento', 'number'),
  },
  {
    displayName: 'Observações',
    name: 'notes',
    type: 'string',
    default: fromAi('notes', 'Observações do agendamento'),
  },
  {
    displayName: 'Mensagem',
    name: 'content',
    type: 'string',
    typeOptions: { rows: 4 },
    default: fromAi('content', 'Texto da mensagem que deve ser enviada ao WhatsApp'),
  },
  {
    displayName: 'Provedor',
    name: 'provider',
    type: 'options',
    options: [
      { name: 'PAPI', value: 'papi' },
      { name: 'Meta Cloud API', value: 'meta_cloud_api' },
    ],
    default: 'papi',
  },
  {
    displayName: 'Tipo da mensagem',
    name: 'messageType',
    type: 'options',
    options: [
      { name: 'Texto', value: 'text' },
      { name: 'Áudio PTT', value: 'audio' },
      { name: 'Botões', value: 'button' },
    ],
    default: 'text',
    description: 'Áudio exige uma URL acessível ao serviço PAPI; botões usam metadata.buttons.',
  },
  {
    displayName: 'ID da instância PAPI',
    name: 'instanceId',
    type: 'string',
    default: fromAi('instanceId', 'ID da instância PAPI que recebeu a conversa'),
  },
  {
    displayName: 'Metadados (JSON)',
    name: 'metadata',
    type: 'json',
    default: fromAi('metadata', 'Para botões: {"buttons":[{"id":"agendar","displayText":"Agendar"}]}', 'json'),
  },
  {
    displayName: 'Idempotency Key',
    name: 'idempotencyKey',
    type: 'string',
    default: '',
    description: 'Opcional. Se vazio, o node cria uma chave determinística para a execução atual.',
  },
];

const fixedOperations: Record<string, string> = {
  'n8n-nodes-forte-panel.fortePanelBuscarLead': 'buscar_lead',
  'n8n-nodes-forte-panel.fortePanelCriarLead': 'criar_lead',
  'n8n-nodes-forte-panel.fortePanelAtualizarLead': 'atualizar_lead',
  'n8n-nodes-forte-panel.fortePanelRegistrarNota': 'registrar_nota',
  'n8n-nodes-forte-panel.fortePanelAvailability': 'availability',
  'n8n-nodes-forte-panel.fortePanelCreateAppointment': 'create_appointment',
  'n8n-nodes-forte-panel.fortePanelCancelAppointment': 'cancel_appointment',
  'n8n-nodes-forte-panel.fortePanelRescheduleAppointment': 'reschedule_appointment',
  'n8n-nodes-forte-panel.fortePanelPublishedPrompt': 'published_prompt',
  'n8n-nodes-forte-panel.fortePanelQueueMessage': 'queue_message',
};

export class FortePanel implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Forte Panel',
    name: 'fortePanel',
    icon: 'file:forte-panel.svg',
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["operation"]}}',
    description: 'AI Tool oficial do Forte Panel para CRM, agenda, prompt publicado e fila de WhatsApp. Use esta ferramenta como fonte de verdade para consultar e atualizar leads, registrar notas, consultar disponibilidade, criar, cancelar ou reagendar agendamentos e enfileirar mensagens de texto, áudio ou botões.',
    defaults: { name: 'Forte Panel' },
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    usableAsTool: true,
    credentials: [{ name: 'fortePanelApi', required: true }],
    properties,
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const output: INodeExecutionData[] = [];
    const credentials = await this.getCredentials('fortePanelApi');
    const baseUrl = String(credentials.baseUrl).replace(/\/$/, '');

    for (let index = 0; index < items.length; index += 1) {
      try {
        const operation = fixedOperations[this.getNode().type] ?? String(this.getNodeParameter('operation', index));
        const phone = String(this.getNodeParameter('phone', index, '')).replace(/\D/g, '');
        const name = String(this.getNodeParameter('name', index, ''));
        const note = String(this.getNodeParameter('note', index, ''));
        const fieldsRaw = this.getNodeParameter('fields', index, '{}');
        const fields = typeof fieldsRaw === 'string' ? JSON.parse(fieldsRaw || '{}') : fieldsRaw;
        const idempotencyKey = String(this.getNodeParameter('idempotencyKey', index, '')) || `n8n-${this.getExecutionId()}-${index}-${operation}`;
        const request: IHttpRequestOptions = {
          method: 'GET',
          url: `${baseUrl}/onboarding/prompt`,
          headers: { 'Idempotency-Key': idempotencyKey },
          json: true,
        };

        if (operation === 'buscar_lead' || operation === 'criar_lead' || operation === 'atualizar_lead' || operation === 'registrar_nota') {
          request.method = 'POST';
          request.url = `${baseUrl}/lead-memory`;
          request.body = { action: operation, phone, name: name || undefined, fields, note: note || undefined };
        } else if (operation === 'availability') {
          request.url = `${baseUrl}/availability`;
          request.qs = { date: String(this.getNodeParameter('startsAt', index, '')), serviceId: this.getNodeParameter('serviceId', index, undefined), professionalId: this.getNodeParameter('professionalId', index, undefined) };
        } else if (operation === 'create_appointment') {
          request.method = 'POST';
          request.url = `${baseUrl}/appointments`;
          request.body = { contactId: this.getNodeParameter('contactId', index, undefined), serviceId: this.getNodeParameter('serviceId', index), professionalId: this.getNodeParameter('professionalId', index), startsAt: this.getNodeParameter('startsAt', index), endsAt: this.getNodeParameter('endsAt', index), notes: this.getNodeParameter('notes', index, '') };
        } else if (operation === 'cancel_appointment') {
          request.method = 'POST';
          request.url = `${baseUrl}/appointments/${this.getNodeParameter('appointmentId', index)}/cancel`;
        } else if (operation === 'reschedule_appointment') {
          request.method = 'POST';
          request.url = `${baseUrl}/appointments/${this.getNodeParameter('appointmentId', index)}/reschedule`;
          request.body = { startsAt: this.getNodeParameter('startsAt', index), endsAt: this.getNodeParameter('endsAt', index) };
        } else if (operation === 'queue_message') {
          request.method = 'POST';
          request.url = `${baseUrl}/messages`;
          const metadataRaw = this.getNodeParameter('metadata', index, '{}');
          const metadata = typeof metadataRaw === 'string' ? JSON.parse(metadataRaw || '{}') : metadataRaw;
          request.body = {
            contactId: this.getNodeParameter('contactId', index, undefined),
            phone: phone || undefined,
            name: name || undefined,
            content: this.getNodeParameter('content', index),
            provider: this.getNodeParameter('provider', index, 'papi'),
            senderType: 'ai',
            messageType: this.getNodeParameter('messageType', index, 'text'),
            instanceId: this.getNodeParameter('instanceId', index, '') || undefined,
            metadata,
          };
        } else if (operation !== 'published_prompt') {
          throw new NodeOperationError(this.getNode(), `Ação não reconhecida: ${operation}`);
        }

        if (request.method !== 'GET') {
          request.headers = {
            ...request.headers,
            'Idempotency-Key': createIdempotencyKey({
              executionId: this.getExecutionId(),
              operation,
              path: request.url.slice(baseUrl.length),
              body: request.body,
              suppliedKey: String(this.getNodeParameter('idempotencyKey', index, '') || ''),
            }),
          };
        }

        const response = await this.helpers.httpRequestWithAuthentication.call(this, 'fortePanelApi', request);
        output.push({ json: (typeof response === 'object' && response !== null ? response : { data: response }) as IDataObject });
      } catch (error) {
        if (this.continueOnFail()) output.push({ json: { success: false, error: error instanceof Error ? error.message : String(error) } });
        else throw new NodeOperationError(this.getNode(), error instanceof Error ? error.message : String(error), { itemIndex: index });
      }
    }

    return [output];
  }
}
