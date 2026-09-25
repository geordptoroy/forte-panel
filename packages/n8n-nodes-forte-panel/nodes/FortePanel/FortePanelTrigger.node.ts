import type { IDataObject, INodeExecutionData, INodeType, INodeTypeDescription, IWebhookFunctions, IWebhookResponseData } from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

export class FortePanelTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Forte Panel — Receber evento',
    name: 'fortePanelTrigger',
    icon: 'file:forte-panel.svg',
    group: ['trigger'],
    version: 1,
    subtitle: 'Webhook de mensagens',
    description: 'Recebe do Forte Panel mensagens já normalizadas. O Forte Panel aplica idempotência, contato, conversa e controle humano antes de chamar este webhook.',
    defaults: { name: 'Forte Panel — Receber evento' },
    inputs: [],
    outputs: [NodeConnectionTypes.Main],
    webhooks: [
      {
        name: 'default',
        httpMethod: 'POST',
        path: 'forte-panel-event',
        responseMode: 'onReceived',
        responseData: 'firstEntryJson',
      },
    ],
    properties: [],
  };

  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const body = this.getBodyData() as IDataObject;
    const headers = this.getHeaderData() as IDataObject;
    const query = this.getQueryData() as IDataObject;
    const params = this.getParamsData() as IDataObject;
    const item: INodeExecutionData = {
      json: {
        ...body,
        _fortePanel: {
          receivedAt: new Date().toISOString(),
          headers,
          query,
          params,
        },
      },
    };
    return {
      workflowData: [[item]],
      webhookResponse: {
        accepted: true,
        eventId: typeof body.eventId === 'string' ? body.eventId : undefined,
      },
    };
  }
}
