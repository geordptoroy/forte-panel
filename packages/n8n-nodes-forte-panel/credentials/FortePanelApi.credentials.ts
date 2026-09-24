import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export class FortePanelApi implements ICredentialType {
  name = 'fortePanelApi';
  displayName = 'Forte Panel API';
  documentationUrl = 'https://github.com/geordptoroy/forte-panel/blob/main/API_CONTRACT.md';
  authenticate = {
    type: 'generic' as const,
    properties: {
      headers: {
        Authorization: '=Bearer {{$credentials.apiKey}}',
      },
    },
  };
  properties: INodeProperties[] = [
    {
      displayName: 'Base URL',
      name: 'baseUrl',
      type: 'string',
      default: 'http://forte-panel:3000/api/v1',
      placeholder: 'https://panel.example.com/api/v1',
      description: 'URL base da API v1 do Forte Panel, sem barra no final.',
      required: true,
    },
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      description: 'Valor de FORTE_API_KEY configurado no servidor do Forte Panel.',
      required: true,
    },
  ];
}
