# Forte Panel — API v1

## Objetivo

A API versionada permite que n8n, sites, anúncios e integrações externas operem o CRM sem acessar o banco. O Forte Panel continua sendo a fonte de verdade para contatos, agenda, funil e auditoria.

## Provedores WhatsApp

O domínio usa um contrato único `WhatsappAdapter`. O workspace pode manter um canal PAPI, um canal Meta Cloud API oficial ou os dois simultaneamente. Cada mensagem enfileirada registra o provedor escolhido; o worker selecionará o adapter correspondente sem alterar Inbox, contatos ou agenda.

O adapter PAPI usa `PAPI_BASE_URL` e `PAPI_API_KEY`. O adapter Meta usa `META_GRAPH_API_VERSION`, `META_WHATSAPP_ACCESS_TOKEN` e `META_WHATSAPP_PHONE_NUMBER_ID`, sempre no servidor. A documentação oficial da Meta confirma que a Cloud API envia mensagens e recebe webhooks de mensagens e status [Cloud API Get Started](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started) e [Webhooks overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview).

## Autenticação

As requisições privadas usam `Authorization: Bearer <FORTE_API_KEY>`. A chave fica somente no n8n/servidor e nunca no bundle do navegador. Em produção, a chave deverá ser criada por workspace e armazenada com hash; o primeiro adaptador usa uma chave de ambiente para preparar o contrato sem expor credenciais.

## Idempotência

Toda operação mutável aceita `Idempotency-Key`. A mesma chave não pode executar duas vezes a mesma ação. O servidor guarda a resposta associada à chave e devolve a resposta original em retries.

## Endpoints da primeira versão

| Método | Endpoint | Uso |
|---|---|---|
| `GET` | `/api/v1/health` | Healthcheck sem credencial |
| `GET` | `/api/v1/channels` | Listar canais WhatsApp ativos do workspace |
| `GET` | `/api/v1/onboarding/prompt` | Buscar o prompt operacional publicado da empresa |
| `POST` | `/api/v1/contacts/upsert` | Criar ou atualizar lead por telefone |
| `GET` | `/api/v1/contacts/:id` | Consultar contexto operacional do contato |
| `POST` | `/api/v1/lead-memory` | Buscar, criar, atualizar lead ou registrar nota para o n8n |
| `POST` | `/api/v1/appointments` | Criar reserva com checagem de conflito |
| `POST` | `/api/v1/messages` | Enfileirar mensagem para o worker de WhatsApp |
| `PATCH` | `/api/v1/contacts/:id/stage` | Mover contato no funil com auditoria |
| `POST` | `/api/v1/appointments/:id/cancel` | Cancelar reserva |
| `POST` | `/api/v1/appointments/:id/reschedule` | Reagendar reserva com checagem de conflito |
| `POST` | `/api/v1/webhooks/inbound/whatsapp` | Receber evento normalizado do PAPI/n8n |

## Webhook de entrada

O evento deve conter `eventId`, `phone`, `name`, `content`, `messageType` e `receivedAt`. O `eventId` funciona como chave de idempotência do canal. O endpoint poderá exigir `X-Webhook-Signature` com HMAC quando `WEBHOOK_SIGNING_SECRET` estiver configurado.

### Substituição da Lead Memory Tool

O workflow n8n pode substituir a antiga ferramenta de memória/CRM por uma chamada HTTP para `POST /api/v1/lead-memory`. O corpo usa `action` com `buscar_lead`, `criar_lead`, `atualizar_lead` ou `registrar_nota`, mais `phone`, `fields` e `note` conforme a ação. Buscar é somente leitura; as outras ações usam `Idempotency-Key`. O retorno mantém `success`, `acao`, `telefone`, `resultado` e `mensagem` para facilitar a troca do nó sem alterar o agente.

Mensagens enviadas por `POST /messages` entram com status `queued` e não são declaradas como entregues antes do worker confirmar o envio no provedor. O worker separado consome a fila, usa o adapter registrado na mensagem, recupera jobs presos após reinício e tenta novamente até `WORKER_MAX_ATTEMPTS` antes de marcar `failed`.

O n8n pode consultar `GET /onboarding/prompt` no início de uma execução para usar somente a versão publicada pelo administrador. O endpoint nunca devolve um rascunho não publicado.

```json
{
  "eventId": "papi-msg-123",
  "phone": "5511999999999",
  "name": "Cliente novo",
  "content": "Olá, gostaria de agendar",
  "messageType": "text",
  "receivedAt": "2026-09-24T12:00:00.000Z"
}
```

## Eventos publicados pelo worker

Quando `N8N_EVENTS_WEBHOOK_URL` está configurada, o worker publica `message.received`, `message.sent`, `contact.created`, `stage.changed`, `appointment.created` e `appointment.cancelled` como eventos JSON para o n8n. O outbox PostgreSQL mantém a entrega pendente, em processamento, entregue ou falha definitiva; cada tentativa possui contador, erro e `availableAt` para backoff exponencial.

Cada requisição inclui `X-Forte-Event-Id`, `Idempotency-Key` com o mesmo identificador do evento e, quando `N8N_WEBHOOK_SECRET` está configurado, `X-Forte-Signature: sha256=<HMAC-SHA256 do corpo bruto>`. O timeout é controlado por `N8N_WEBHOOK_TIMEOUT_MS`; após `EVENT_WORKER_MAX_ATTEMPTS`, o evento permanece como `failed` para reprocessamento operacional.

## Erros

A API usa respostas JSON com `error`, `message` e, quando aplicável, `requestId`. Os códigos esperados são `400` para payload inválido, `401` para credencial ausente ou incorreta, `409` para conflito de agenda/idempotência incompatível, `422` para regra de negócio e `500` para falha inesperada.
