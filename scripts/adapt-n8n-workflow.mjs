import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const inputPath = process.argv[2];
if (!inputPath) throw new Error('Uso: node scripts/adapt-n8n-workflow.mjs <workflow-export.json> [workflow-adaptado.json]');
const outputPath = process.argv[3] ?? path.resolve('infra/n8n/forte-panel-workflow.json');
const workflow = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const findNode = (name) => workflow.nodes.find((node) => node.name === name);
const id = () => crypto.randomUUID();
const toCommunityQueueNode = (node, { phoneExpression, contactIdExpression, nameExpression, contentExpression, messageTypeExpression, instanceIdExpression, metadataExpression, idemExpression, credentials }) => {
  node.type = 'n8n-nodes-forte-panel.fortePanelQueueMessage';
  node.typeVersion = 1;
  node.parameters = {
    operation: 'queue_message',
    phone: phoneExpression,
    contactId: contactIdExpression,
    name: nameExpression,
    content: contentExpression,
    provider: 'papi',
    messageType: messageTypeExpression,
    instanceId: instanceIdExpression,
    metadata: metadataExpression,
    idempotencyKey: idemExpression,
  };
  node.retryOnFail = true;
  node.maxTries = 3;
  node.waitBetweenTries = 1000;
  node.credentials = credentials;
};

const legacyMemory = findNode('Lead Memory Tool');
const panelTool = findNode('Forte Panel');
if (!panelTool) throw new Error('Node Forte Panel não encontrado no workflow exportado.');

if (legacyMemory) {
// The old memory tool had its own private Postgres subworkflow. The Panel is now the single source of CRM state.
workflow.nodes = workflow.nodes.filter((node) => node.name !== 'Lead Memory Tool');
delete workflow.connections['Lead Memory Tool'];
for (const [source, groups] of Object.entries(workflow.connections)) {
  for (const [connectionType, outputs] of Object.entries(groups)) {
    if (!Array.isArray(outputs)) continue;
    groups[connectionType] = outputs.map((output) => Array.isArray(output)
      ? output.filter((connection) => connection.node !== 'Lead Memory Tool')
      : output);
  }
}

const agent = findNode('AI Agent');
let prompt = agent.parameters.options.systemMessage;
const memorySection = /\nLead Memory Tool\n[\s\S]*?\nForte Panel Tool\n/;
if (!memorySection.test(prompt)) throw new Error('Seção Lead Memory Tool do system prompt mudou; adaptação automática cancelada.');
prompt = prompt.replace(memorySection, `\nMemória estruturada no Forte Panel\n\nO CRM do Forte Panel é a fonte única de memória estruturada e de estado operacional do lead. Não existe uma ferramenta de memória separada.\n\nUse buscar_lead quando precisar consultar o histórico estruturado; use atualizar_lead somente quando houver fatos novos confirmados; use registrar_nota apenas para contexto operacional importante que não tenha campo próprio. As conversas recentes ficam no Postgres Chat Memory.\n\nO Forte Panel mantém contatos, estágio, serviço, urgência, localização, orçamento, notas e agendamentos associados ao contato. Não registre appointmentId em nota/memória: o agendamento já fica vinculado ao contato no banco do painel. Não use Postgres, Clientverse ou memória externa para substituir o CRM.\n\nForte Panel Tool\n`);
const oldRulesStart = prompt.indexOf('2. MENSAGEM DO LEAD E CONTEXTO INTERNO');
const oldMemoryStart = prompt.indexOf('6. LEAD MEMORY TOOL');
const toolStart = prompt.indexOf('7. FORTE PANEL TOOL');
if (oldMemoryStart < 0 || toolStart < 0 || oldMemoryStart > toolStart) throw new Error('Não foi possível localizar a seção 6 de memória para substituição.');
prompt = prompt.slice(0, oldMemoryStart) + `6. MEMÓRIA ESTRUTURADA NO CRM\n\nO Forte Panel Tool é a única fonte oficial de estado estruturado do lead.\n\nConsultar\n\nQuando precisar de dados anteriores não presentes na conversa, use buscar_lead uma vez com o telefone real em formato internacional (somente dígitos):\n\n{\n  "operation": "buscar_lead",\n  "phone": "TELEFONE_REAL"\n}\n\nAtualizar\n\nUse atualizar_lead somente quando surgir informação nova, confirmada ou realmente alterada. Os campos aceitos incluem name, city, neighborhood, serviceRequested, urgency, stage, quoteCents e aiEnabled. Não envie valores vazios para substituir dados existentes. Não trate pushName do WhatsApp como nome confirmado.\n\nRegistre uma nota curta somente para contexto operacional que seja útil a um humano e não tenha campo próprio. Não registre cada mensagem, transcrição completa, raciocínio interno ou contexto auxiliar de datas. Agendamentos são consultados e alterados pelas operações próprias e já ficam associados ao contato.\n\n` + prompt.slice(toolStart);
prompt = prompt.replace(/\n12\. ENVIO DE MENSAGENS\n[\s\S]*?\n13\. COMANDOS DE CONTROLE HUMANO/, `\n12. ENVIO DE MENSAGENS\n\nA resposta final do AI Agent passa pelo node “Preparar Envio” e pelos nodes HTTP que chamam POST /api/v1/messages. O worker do Forte Panel grava a mensagem no histórico e envia pelo PAPI; áudio PTT e botões também são suportados.\n\nNão use queue_message para a mesma resposta, pois isso duplicaria o envio. Use queue_message somente se essa chamada substituir os nodes de saída do workflow; nunca use os dois caminhos na mesma interação.\n\n13. COMANDOS DE CONTROLE HUMANO`);
prompt = prompt.replace(/atualize a Lead Memory Tool com o appointmentId real;/g, 'não registre appointmentId em nota; o agendamento já fica vinculado ao contato;');
prompt = prompt.replace(/Não chame Lead Memory Tool e Forte Panel Tool para executar a mesma operação\./g, 'Não chame o Forte Panel Tool duas vezes para executar a mesma operação.');
prompt = prompt.replace(/Use Lead Memory Tool apenas para estado estruturado\./g, 'Use o Forte Panel Tool como fonte única do CRM e do estado estruturado.');
prompt = prompt.replace(/Não use queue_message para duplicar a resposta enviada pelos nodes PAPI\./g, 'Não use queue_message junto com os nodes HTTP de saída, para não duplicar a resposta.');
prompt = prompt.replace(/salvar “o cliente informou que precisa trocar uma tomada” na Lead Memory Tool;/g, 'atualizar serviceRequested ou registrar uma nota operacional no Forte Panel quando o fato for útil e estiver confirmado;');
prompt = prompt.replace(/Lead Memory Tool/g, 'Forte Panel Tool');
if (/Lead Memory Tool/.test(prompt)) throw new Error('Ainda restaram referências à Lead Memory Tool no prompt.');
agent.parameters.options.systemMessage = prompt;
}

const agentNode = findNode('AI Agent');
if (!agentNode) throw new Error('Node AI Agent não encontrado no workflow exportado.');
agentNode.parameters.options.systemMessage = agentNode.parameters.options.systemMessage
  .replace(/nodes HTTP que chamam POST \/api\/v1\/messages/g, 'community nodes Forte Panel que usam queue_message')
  .replace(/nodes HTTP de saída/g, 'nodes community de saída');

const cleanup = findNode('Limpeza');
const sendPreparation = findNode('Preparar Envio');
if (!cleanup || !sendPreparation) throw new Error('Node Limpeza ou Preparar Envio não encontrado.');
if (typeof cleanup.parameters.jsCode === 'string') {
  cleanup.parameters.jsCode = cleanup.parameters.jsCode
    .replace('const item = $input.item.json;', 'const item = $input.item.json;\nconst payload = item.data ?? item.body?.data ?? item.body ?? item;\nconst parsed = item._parsed ?? payload._parsed ?? {};')
    .replace(/item\.data\?\./g, 'payload?.')
    .replace(/item\._parsed\?\./g, 'parsed?.')
    .replace(/item\.instanceId/g, '(item.instanceId ?? payload.instanceId)')
    .replace(/item\._meta\?\./g, 'item._meta?.');
}
const cleanupPosition = cleanup.position ?? [0, 0];
const triggerId = id();
const httpInboundId = id();
const restoreId = id();

const filterNode = {
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 3 },
      conditions: [{
        id: id(),
        leftValue: '={{ $json.eventKind }}',
        rightValue: 'lead_message',
        operator: { type: 'string', operation: 'equals' },
      }],
      combinator: 'and',
    },
    options: {},
  },
  id: triggerId,
  name: 'Filtro entrada Inbox',
  type: 'n8n-nodes-base.if',
  typeVersion: 2.3,
  position: [cleanupPosition[0] + 220, cleanupPosition[1] - 190],
};
const inboundNode = {
  parameters: {
    method: 'POST',
    url: 'http://forte-panel:3000/api/v1/webhooks/inbound/whatsapp',
    authentication: 'genericCredentialType',
    genericAuthType: 'httpBearerAuth',
    sendHeaders: true,
    headerParameters: {
      parameters: [{
        name: 'Idempotency-Key',
        value: "={{ (String($json.instanceId || 'papi').slice(0,40) + ':' + String($json.messageId || [($json.timestamp || ''), ($json.remetente || ''), $itemIndex].join(':'))).slice(0,180) }}",
      }],
    },
    sendBody: true,
    contentType: 'json',
    specifyBody: 'json',
    jsonBody: `={{ (() => { const raw = $json.timestamp; const n = Number(raw); const receivedAt = Number.isFinite(n) && n > 0 ? new Date(n * (n < 1e12 ? 1000 : 1)).toISOString() : new Date(raw || Date.now()).toISOString(); const fallbackId = [raw || '', $json.remetente || '', $itemIndex].join(':') || $execution.id; const metadata = Object.fromEntries(Object.entries({ instanceId: $json.instanceId, mediaUrl: $json.mediaUrl, mediaMimeType: $json.mediaMimeType, fileName: $json.fileName, fileLength: Number($json.fileLength) || undefined, buttonId: $json.buttonId, buttonText: $json.buttonText, isGroup: $json.isGroup }).filter(([, value]) => value !== null && value !== undefined && value !== '')); return JSON.stringify({\n  eventId: (String($json.instanceId || 'papi').slice(0,40) + ':' + String($json.messageId || fallbackId)).slice(0,180),\n  name: String($json.pushName || '').trim() || undefined,\n  phone: String($json.remetente || '').replace(/\\D/g, ''),\n  content: String($json.texto || $json.mediaCaption || $json.buttonText || ($json.messageType === 'audio' ? '[Áudio recebido]' : $json.messageType === 'image' ? '[Imagem recebida]' : $json.messageType === 'video' ? '[Vídeo recebido]' : $json.messageType === 'document' ? '[Documento recebido]' : '[Mensagem recebida]')),\n  messageType: ['text','image','audio','video','document'].includes($json.messageType) ? $json.messageType : 'text',\n  receivedAt,\n  metadata\n}); })() }}`,
    options: {
      response: { response: { responseFormat: 'json', neverError: false, fullResponse: false } },
      timeout: 15000,
    },
  },
  id: httpInboundId,
  name: 'Registrar entrada Forte Panel',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [cleanupPosition[0] + 440, cleanupPosition[1] - 190],
  retryOnFail: true,
  maxTries: 3,
  waitBetweenTries: 1000,
};
const restoreNode = {
  parameters: {
    mode: 'runOnceForAllItems',
    jsCode: "const original = $('Limpeza').first().json; const response = $input.first()?.json || {}; const data = response.data || {}; return [{ json: { ...original, contactId: data.contactId || original.contactId || null, contactName: data.name || original.pushName || '' } }];",
  },
  id: restoreId,
  name: 'Restaurar item após webhook',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [cleanupPosition[0] + 660, cleanupPosition[1] - 190],
};
const generatedNames = [filterNode.name, inboundNode.name, restoreNode.name];
workflow.nodes = workflow.nodes.filter((node) => !generatedNames.includes(node.name));
for (const generatedName of generatedNames) delete workflow.connections[generatedName];
workflow.nodes.push(filterNode, inboundNode, restoreNode);
const humanControl = 'Human Control automático';
if (!findNode(humanControl)) throw new Error('Node Human Control automático não encontrado.');
workflow.connections['Limpeza'].main[0] = [{ node: filterNode.name, type: 'main', index: 0 }];
workflow.connections[filterNode.name] = {
  main: [[{ node: inboundNode.name, type: 'main', index: 0 }], [{ node: humanControl, type: 'main', index: 0 }]],
};
workflow.connections[inboundNode.name] = { main: [[{ node: restoreNode.name, type: 'main', index: 0 }]] };
workflow.connections[restoreNode.name] = { main: [[{ node: humanControl, type: 'main', index: 0 }]] };

const panelCredentials = panelTool.credentials;
const outgoingNodeConfig = {
  phoneExpression: `={{ String($('Limpeza').first().json.remetente || '').replace(/[^0-9]/g, '') }}`,
  contactIdExpression: `={{ Number($('Restaurar item após webhook').first().json.contactId || 0) || undefined }}`,
  nameExpression: `={{ String($('Limpeza').first().json.pushName || '') }}`,
  contentExpression: `={{ String($('Preparar Envio').item.json.content || '') }}`,
  messageTypeExpression: `={{ $('Preparar Envio').item.json.type === 'button' ? 'button' : ($('Preparar Envio').item.json.type === 'audio' ? 'audio' : 'text') }}`,
  instanceIdExpression: `={{ String($('Limpeza').first().json.instanceId || '') }}`,
  metadataExpression: `={{ JSON.stringify($('Preparar Envio').item.json.type === 'button' ? { buttons: $('Preparar Envio').item.json.buttons } : ($('Preparar Envio').item.json.type === 'audio' ? { ptt: true } : { ptt: false })) }}`,
  credentials: panelCredentials,
};
const loopKey = `={{ String($('Limpeza').first().json.instanceId || 'papi').slice(0,40) + ':' + String($('Limpeza').first().json.messageId || $execution.id).slice(0,100) + ':out:v2:' + String($('Preparar Envio').item.json.outboundIndex || 0) }}`;
for (const name of ['SendText message1', 'SendAudio message', 'SendButtons message1']) {
  const node = findNode(name);
  if (!node) throw new Error(`Node ${name} não encontrado.`);
  toCommunityQueueNode(node, { ...outgoingNodeConfig, idemExpression: loopKey });
}
const prepareCode = sendPreparation.parameters.jsCode;
if (!prepareCode.includes('const resultado = [];')) throw new Error('Código Preparar Envio mudou; adaptação cancelada.');
sendPreparation.parameters.jsCode = prepareCode
  .replace('slice(0, 4)', 'slice(0, 3)')
  .replace("  timestamp: limpeza.timestamp || entrada.timestamp || Date.now(),", "  timestamp: limpeza.timestamp || entrada.timestamp || Date.now(),\n  inboundMessageId: limpeza.messageId || entrada.messageId || '',")
  .replace("const resultado = [];", "const resultado = [];\nlet outboundIndex = 0;")
  .replace("const item = { ...base, type: tipo === 'audio' ? 'audio' : tipo === 'button' ? 'button' : 'text', content: parte };", "const item = { ...base, type: tipo === 'audio' ? 'audio' : tipo === 'button' ? 'button' : 'text', content: parte, outboundIndex: outboundIndex++ };")
  .replace(/\n\s*inboundMessageId: limpeza\.messageId \|\| entrada\.messageId \|\| '',\n\s*inboundMessageId: limpeza\.messageId \|\| entrada\.messageId \|\| '',/g, "\n  inboundMessageId: limpeza.messageId || entrada.messageId || '',")
  .replace(/\nlet outboundIndex = 0;\nlet outboundIndex = 0;/g, '\nlet outboundIndex = 0;');

const fallback = findNode('SendText message');
if (!fallback) throw new Error('Node SendText message (fallback) não encontrado.');
const fallbackKey = `={{ String($('Limpeza').first().json.instanceId || 'papi').slice(0,40) + ':' + String($('Limpeza').first().json.messageId || $execution.id).slice(0,100) + ':fallback:v2' }}`;
toCommunityQueueNode(fallback, {
  phoneExpression: `={{ String($('Limpeza').first().json.remetente || '').replace(/[^0-9]/g, '') }}`,
  contactIdExpression: `={{ Number($('Restaurar item após webhook').first().json.contactId || 0) || undefined }}`,
  nameExpression: `={{ String($('Limpeza').first().json.pushName || '') }}`,
  contentExpression: `={{ String($('Preparar Envio').first().json.content || $json.mensagens?.[0]?.content || '') }}`,
  messageTypeExpression: 'text',
  instanceIdExpression: `={{ String($('Limpeza').first().json.instanceId || '') }}`,
  metadataExpression: '{"ptt":false}',
  idemExpression: fallbackKey,
  credentials: panelCredentials,
});

// The existing Forte Panel source node remains connected to the AI Agent; only the legacy tool link is removed above.

const dir = path.dirname(outputPath);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(workflow, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, nodeCount: workflow.nodes.length, legacyMemoryRemoved: true, fortePanelToolKept: true, inboundApiAdded: true, outboundCommunityNodes: ['SendText message', 'SendText message1', 'SendAudio message', 'SendButtons message1'] }, null, 2));
