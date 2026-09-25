#!/usr/bin/env python3
import copy
import json
import sys
import uuid
from pathlib import Path

if len(sys.argv) < 3:
    raise SystemExit('Uso: prepare-dev-n8n-workflow.py <workflow-atual.json> <workflow-dev.json>')

source = Path(sys.argv[1])
out = Path(sys.argv[2])
workflow = json.loads(source.read_text())

def new_id():
    return str(uuid.uuid4())

def node(name):
    return next((n for n in workflow['nodes'] if n.get('name') == name), None)

def remove_nodes(names):
    workflow['nodes'] = [n for n in workflow['nodes'] if n.get('name') not in names]
    for name in names:
        workflow['connections'].pop(name, None)
    for source_name, groups in list(workflow['connections'].items()):
        for connection_type, branches in list(groups.items()):
            if not isinstance(branches, list):
                continue
            groups[connection_type] = [
                [c for c in branch if c.get('node') not in names] if isinstance(branch, list) else branch
                for branch in branches
            ]

trigger = node('PAPI Trigger') or node('Forte Panel — Receber evento')
cleanup = node('Limpeza')
agent = node('AI Agent')
prepare = node('Preparar Envio')
if not trigger or not cleanup or not agent or not prepare:
    raise SystemExit('Workflow não contém Trigger, Limpeza, AI Agent ou Preparar Envio.')

trigger['name'] = 'Forte Panel — Receber evento'
trigger['type'] = 'n8n-nodes-forte-panel.fortePanelTrigger'
trigger['typeVersion'] = 1
trigger['parameters'] = {}
trigger.pop('credentials', None)
trigger.pop('webhookId', None)
trigger['position'] = [trigger.get('position', [-8896, 240])[0], trigger.get('position', [-8896, 240])[1]]

cleanup['parameters']['jsCode'] = r'''const envelope = $input.item.json || {};
const eventPayload = envelope.payload && typeof envelope.payload === 'object' ? envelope.payload : envelope;
const payload = eventPayload.payload && typeof eventPayload.payload === 'object' ? eventPayload.payload : eventPayload;
const firstMessage = Array.isArray(payload.messages) ? payload.messages[0] : null;
const content = String(payload.content ?? firstMessage?.content ?? '');
const messageType = String(payload.messageType ?? firstMessage?.messageType ?? 'text');
const phone = String(payload.phone ?? payload.remetente ?? '').replace(/\D/g, '');
const instanceId = String(payload.instanceId ?? payload.metadata?.instanceId ?? '');
const messageId = String(payload.messageId ?? envelope.eventId ?? '');
return [{ json: {
  ...payload,
  event: envelope.event,
  eventId: envelope.eventId ?? payload.eventId ?? messageId,
  remetente: phone,
  texto: content,
  content,
  pushName: String(payload.name ?? payload.pushName ?? ''),
  messageType,
  messageId,
  instanceId,
  fromMe: Boolean(payload.fromMe ?? payload.metadata?.fromMe),
  timestamp: payload.receivedAt ?? envelope.occurredAt ?? new Date().toISOString(),
  isGroup: Boolean(payload.metadata?.isGroup ?? payload.isGroup),
  contactId: payload.contactId ?? null,
  messages: Array.isArray(payload.messages) ? payload.messages : [{ content, messageType }],
} }];'''

# Direct connection from the Forte Panel trigger to the normalizer and then to human-control/AI.
workflow['connections'].pop('PAPI Trigger', None)
workflow['connections']['Forte Panel — Receber evento'] = {'main': [[{'node': 'Limpeza', 'type': 'main', 'index': 0}]]}

# The Panel has already persisted the event and applied human control. Do not post it back into the Panel.
remove_nodes({'Filtro entrada Inbox', 'Registrar entrada Forte Panel', 'Restaurar item após webhook'})
human = node('Human Control automático')
if human:
    workflow['connections']['Limpeza'] = {'main': [[{'node': human['name'], 'type': 'main', 'index': 0}]]}

# Remove direct PAPI presence/trigger nodes. Outbound presence is not needed while Panel owns dispatch.
remove_nodes({'UpdatePresence utility', 'UpdatePresence utility1', 'Wait1', 'Wait2', 'PAPI Trigger'})

# Replace the per-item loop and three output nodes with one batch node.
remove_nodes({'Loop Over Items', 'Switch3', 'SendText message1', 'SendAudio message', 'SendButtons message1', 'SendText message', 'SendAudio message'})

send_name = 'Forte Panel — Enviar mensagens'
send_node = {
  'parameters': {
    'messages': "={{ $input.all().map(item => ({ content: String(item.json.content || ''), messageType: item.json.type === 'button' ? 'button' : (item.json.type === 'audio' ? 'audio' : 'text'), phone: String($('Limpeza').first().json.remetente || ''), contactId: $('Limpeza').first().json.contactId || undefined, name: String($('Limpeza').first().json.pushName || ''), provider: 'papi', instanceId: String($('Limpeza').first().json.instanceId || ''), metadata: item.json.type === 'button' ? { buttons: item.json.buttons } : (item.json.type === 'audio' ? { ptt: true } : {}) })) ) }}",
    'phone': "={{ String($('Limpeza').first().json.remetente || '') }}",
    'contactId': "={{ Number($('Limpeza').first().json.contactId || 0) || undefined }}",
    'name': "={{ String($('Limpeza').first().json.pushName || '') }}",
    'provider': 'papi',
    'instanceId': "={{ String($('Limpeza').first().json.instanceId || '') }}",
    'batchId': "={{ String($('Limpeza').first().json.messageId || $execution.id) + ':out:v3' }}",
  },
  'type': 'n8n-nodes-forte-panel.fortePanelSend',
  'typeVersion': 1,
  'position': [prepare.get('position', [0, 0])[0] + 260, prepare.get('position', [0, 0])[1]],
  'id': new_id(),
  'name': send_name,
  'retryOnFail': True,
  'maxTries': 3,
  'waitBetweenTries': 1000,
  'credentials': (node('Forte Panel') or {}).get('credentials', {}),
}
workflow['nodes'].append(send_node)
for source_name, groups in workflow['connections'].items():
    for connection_type, branches in groups.items():
        if isinstance(branches, list):
            groups[connection_type] = [
                [c for c in branch if c.get('node') not in {'Forte Panel — Enviar mensagens'}] if isinstance(branch, list) else branch
                for branch in branches
            ]
workflow['connections']['Preparar Envio'] = {'main': [[{'node': send_name, 'type': 'main', 'index': 0}]]}
workflow['connections'].pop(send_name, None)

# The AI prompt must describe the current development architecture.
prompt = agent.get('parameters', {}).get('options', {}).get('systemMessage', '')
prompt = prompt.replace('nodes HTTP de saída', 'node Forte Panel — Enviar mensagens')
prompt = prompt.replace('nodes HTTP que chamam POST /api/v1/messages', 'node Forte Panel — Enviar mensagens')
prompt = prompt.replace('Use queue_message para enviar uma mensagem somente quando a resposta estiver pronta', 'Use o node Forte Panel — Enviar mensagens para enviar a lista final de mensagens quando a resposta estiver pronta')
agent['parameters']['options']['systemMessage'] = prompt

# Keep only the current community trigger and remove stale direct PAPI credentials from node metadata.
workflow['meta'] = {**workflow.get('meta', {}), 'fortePanelDevelopmentState': 'panel-trigger-panel-send', 'generatedBy': 'scripts/prepare-dev-n8n-workflow.py'}
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(workflow, ensure_ascii=False, indent=2) + '\n')
print(f'workflow gerado: {out}')
print(f'nodes: {len(workflow["nodes"])}; connections: {len(workflow["connections"])}')
