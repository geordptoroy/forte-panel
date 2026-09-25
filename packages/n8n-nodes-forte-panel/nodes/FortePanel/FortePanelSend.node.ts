import type { IDataObject, IExecuteFunctions, INodeExecutionData, INodeProperties, INodeType, INodeTypeDescription, IHttpRequestOptions } from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { createIdempotencyKey } from './idempotency';

const properties: INodeProperties[] = [
  {
    displayName: 'Mensagens (JSON)',
    name: 'messages',
    type: 'json',
    default: '={{ $json.messages || $json.respostas || [] }}',
    description: 'Lista de objetos. Cada item pode ter content, messageType, metadata, phone, contactId, name, provider e instanceId.',
  },
  { displayName: 'Telefone padrão', name: 'phone', type: 'string', default: '', description: 'Usado quando o item não informa phone ou contactId.' },
  { displayName: 'ID do contato padrão', name: 'contactId', type: 'number', default: '', description: 'Usado quando o item não informa contactId.' },
  { displayName: 'Nome padrão', name: 'name', type: 'string', default: '' },
  {
    displayName: 'Provedor padrão', name: 'provider', type: 'options', options: [
      { name: 'PAPI', value: 'papi' }, { name: 'Meta Cloud API', value: 'meta_cloud_api' },
    ], default: 'papi',
  },
  { displayName: 'ID da instância PAPI padrão', name: 'instanceId', type: 'string', default: '' },
  { displayName: 'Chave do lote', name: 'batchId', type: 'string', default: '', description: 'Opcional. A mesma chave permite repetir a execução sem criar um novo lote.' },
];

export class FortePanelSend implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Forte Panel — Enviar mensagens',
    name: 'fortePanelSend',
    icon: 'file:forte-panel.svg',
    group: ['transform'],
    version: 1,
    subtitle: 'Lote de mensagens',
    description: 'Envia uma lista de mensagens ao Forte Panel. O Panel faz o loop, registra cada item e encaminha pelo provedor configurado.',
    defaults: { name: 'Forte Panel — Enviar mensagens' },
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    credentials: [{ name: 'fortePanelApi', required: true }],
    properties,
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const output: INodeExecutionData[] = [];
    const credentials = await this.getCredentials('fortePanelApi');
    const baseUrl = String(credentials.baseUrl).replace(/\/$/, '');
    const items = this.getInputData();
    for (let index = 0; index < items.length; index += 1) {
      try {
        const raw = this.getNodeParameter('messages', index, '[]');
        const messages = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw;
        if (!Array.isArray(messages) || messages.length < 1 || messages.length > 50) throw new NodeOperationError(this.getNode(), 'Mensagens deve ser uma lista com 1 a 50 itens.');
        const defaults = {
          phone: String(this.getNodeParameter('phone', index, '')).replace(/\D/g, '') || undefined,
          contactId: this.getNodeParameter('contactId', index, undefined) || undefined,
          name: String(this.getNodeParameter('name', index, '')) || undefined,
          provider: String(this.getNodeParameter('provider', index, 'papi')),
          instanceId: String(this.getNodeParameter('instanceId', index, '')).trim() || undefined,
        };
        const batchId = String(this.getNodeParameter('batchId', index, '')).trim();
        const body = { messages: messages.map((message: Record<string, unknown>) => ({ ...defaults, ...message, phone: message.phone ? String(message.phone).replace(/\D/g, '') : defaults.phone })), ...(batchId ? { batchId } : {}) };
        const request: IHttpRequestOptions = {
          method: 'POST', url: `${baseUrl}/messages/batch`, json: true, body,
          headers: { 'Idempotency-Key': createIdempotencyKey({ executionId: this.getExecutionId(), operation: 'messages_batch', path: '/messages/batch', body, suppliedKey: batchId }) },
        };
        const response = await this.helpers.httpRequestWithAuthentication.call(this, 'fortePanelApi', request);
        output.push({ json: (typeof response === 'object' && response !== null ? response : { data: response }) as IDataObject });
      } catch (error) {
        const caught = error as Record<string, any>;
        const response = caught.response ?? caught.cause?.response ?? caught.errorResponse ?? caught;
        const responseBody = response?.body ?? response?.data ?? caught.description ?? caught.cause?.description;
        const status = response?.statusCode ?? response?.status ?? caught.httpCode ?? caught.statusCode;
        const detail = responseBody === undefined ? '' : ` — API: ${typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody)}`;
        const statusText = status ? ` (HTTP ${status})` : '';
        const message = `${error instanceof Error ? error.message : String(error)}${statusText}${detail}`;
        if (this.continueOnFail()) output.push({ json: { success: false, error: message } });
        else throw new NodeOperationError(this.getNode(), message, { itemIndex: index });
      }
    }
    return [output];
  }
}
