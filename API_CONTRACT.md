# Forte Panel — API v1

## Objetivo

A API versionada permite que sites e integrações autorizadas operem o CRM sem acessar o banco. O Forte Panel continua sendo a fonte de verdade para contatos, agenda, funil e auditoria.

## Provedores WhatsApp

O domínio usa um contrato único `WhatsappAdapter`. O workspace pode manter um canal PAPI, um canal Meta Cloud API oficial ou os dois simultaneamente. Cada mensagem enfileirada registra o provedor escolhido; o worker selecionará o adapter correspondente sem alterar Inbox, contatos ou agenda.

O adapter PAPI usa `PAPI_BASE_URL` e `PAPI_API_KEY`. O adapter Meta usa `META_GRAPH_API_VERSION`, `META_WHATSAPP_ACCESS_TOKEN` e `META_WHATSAPP_PHONE_NUMBER_ID`, sempre no servidor. A documentação oficial da Meta confirma que a Cloud API envia mensagens e recebe webhooks de mensagens e status [Cloud API Get Started](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started) e [Webhooks overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview).

## Autenticação

As requisições privadas usam `Authorization: Bearer <FORTE_API_KEY>`. A chave fica somente em sistemas de servidor autorizados e nunca no bundle do navegador. Em produção, a chave deverá ser criada por workspace e armazenada com hash; o primeiro adaptador usa uma chave de ambiente para preparar o contrato sem expor credenciais.

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
| `POST` | `/api/v1/lead-memory` | Buscar, criar, atualizar lead ou registrar nota no CRM |
| `GET` | `/api/v1/availability` | Consultar serviços, profissionais ativos e horários futuros reais |
| `POST` | `/api/v1/appointments` | Criar reserva com checagem de conflito |
| `POST` | `/api/v1/messages` | Enfileirar texto, áudio PTT ou botões para o worker e registrar no histórico |
| `PATCH` | `/api/v1/contacts/:id/stage` | Mover contato no funil com auditoria |
| `POST` | `/api/v1/appointments/:id/cancel` | Cancelar reserva |
| `POST` | `/api/v1/appointments/:id/reschedule` | Reagendar reserva com checagem de conflito |
| `POST` | `/api/v1/webhooks/inbound/whatsapp` | Receber evento normalizado do provider WhatsApp |

## Agenda, serviços e profissionais

`GET /api/v1/availability` devolve a agenda operacional real do workspace. O retorno inclui `timezone`, `services`, `professionals` e `appointments`, sempre considerando apenas serviços e profissionais ativos.

Os parâmetros opcionais `serviceId` e `professionalId` restringem a consulta. Quando um `serviceId` é informado, a lista de profissionais traz somente quem executa aquele serviço, segundo a tabela `professionalServices`. Sem essa tabela, todos os profissionais ativos permanecem disponíveis como compatibilidade.

Cada profissional traz `serviceIds` e `weeklyAvailability` (faixas com `weekday`, `startMinute` e `endMinute`); cada serviço traz `professionalIds`. `weekday` segue a convenção JavaScript (`0` domingo, `1` segunda, …, `6` sábado), e minutos são contados desde a meia-noite no fuso horário informado em `timezone`. Isso permite ao agente sugerir horários dentro da jornada configurada.

`appointments` mostra apenas horários ainda não encerrados e não cancelados, com `startsAt`, `endsAt`, `status`, `serviceName`, `professionalName` e `contactName`. O agente deve usar o `professionalId` retornado por essa consulta ao chamar `POST /api/v1/appointments`. O servidor valida novamente no momento da reserva: recusa serviço sem vínculo (`409 service_not_linked`), período inválido (`400 invalid_period`), profissional inativo (`409 professional_unavailable`), profissional sem jornada cadastrada (`409 schedule_not_configured`), horário fora da janela semanal (`409 outside_working_hours`) e sobreposição com outro agendamento não cancelado (`409 appointment_conflict`). As mesmas verificações são executadas em reagendamentos. Reservas para o mesmo profissional são serializadas no banco durante a validação do horário, evitando que duas requisições concorrentes ocupem o mesmo intervalo. Intervalos adjacentes são aceitos; atravessar a meia-noite não é permitido pelo formato atual de jornada.

## Webhook de entrada

O evento deve conter `eventId`, `phone`, `content` e `receivedAt`; `name`, `messageType` e `metadata` são opcionais. Toda requisição exige `Idempotency-Key` igual ao `eventId`; o `eventId` deve ser único por instância/canal. Ele também é gravado em `messages.externalId` sob índice único, impedindo duplicação no histórico mesmo se um processamento anterior falhar depois da gravação. A mesma chave com outro payload retorna conflito. Eventos com status `failed` podem ser reprocessados; eventos em `received` ou `processed` são tratados como duplicados. O endpoint poderá exigir `X-Webhook-Signature` com HMAC quando `WEBHOOK_SIGNING_SECRET` estiver configurado.

### Operações de memória comercial

Use o Forte Panel como fonte única para CRM, anotações e agenda; não mantenha uma segunda base privada de estado do lead. A API disponível para clientes autorizados é `POST /api/v1/lead-memory`, que aceita `buscar_lead`, `criar_lead`, `atualizar_lead` ou `registrar_nota` com `phone`, `fields` e `note` conforme a ação. Buscar é somente leitura; as outras ações usam `Idempotency-Key`.

Mensagens enviadas por `POST /api/v1/messages` entram com status `queued` e não são declaradas como entregues antes do worker confirmar o envio. Toda mutação exige `Idempotency-Key`; retries iguais retornam a resposta original e o mesmo key com body diferente conflita. O payload aceita `contactId` ou `phone`, `provider`, `senderType: "ai" | "human"` (padrão `human`), `messageType` e `instanceId`. Para PAPI, o fluxo repassa o `instanceId` recebido pelo webhook, ou o servidor usa `PAPI_INSTANCE_ID` como fallback. Mensagens `ai` não desligam `aiEnabled` nem ativam `humanControlled`; mensagens `human` mantêm o comportamento de takeover do painel.

PAPI suporta estes formatos no worker:

| `messageType` | `content` | `metadata` | Operação PAPI |
|---|---|---|---|
| `text` (padrão) | Texto da mensagem | Opcional | `POST /api/instances/:instanceId/send-text` |
| `audio` | URL acessível ao serviço PAPI | `{ "ptt": true }` (padrão) | `POST /api/instances/:instanceId/send-audio` |
| `button` | Texto do corpo | `buttons` (1–3 objetos `{ "id", "displayText" }`), `footer?`, `headerType?` | `POST /api/instances/:instanceId/send-buttons` |

O adapter usa o cabeçalho `x-api-key`, conforme o contrato da API PAPI. Outros tipos não textuais não são aceitos pela Meta Cloud API neste worker e retornam `422` no enqueue. O worker recupera jobs presos após reinício e tenta novamente até `WORKER_MAX_ATTEMPTS` antes de marcar `failed`. A chave idempotente protege a fila do painel; a confirmação final de entrega depende da resposta do provedor.

```json
{
  "eventId": "papi-msg-123",
  "phone": "5511999999999",
  "content": "Olá, gostaria de agendar",
  "messageType": "text",
  "metadata": { "instanceId": "ID_DA_INSTANCIA" },
  "receivedAt": "2026-09-24T12:00:00.000Z"
}
```

## Notificações internas

As preferências em `workspaceSettings.notification_preferences` alimentam uma caixa pessoal exibida pela campainha do painel. `contact.created`, `appointment.created` e `appointment.confirmed` criam notificações dentro da mesma transação que registra o evento de domínio. Cada item tem deduplicação por `(workspaceId, userId, eventKey)` e guarda título, texto, rota interna, data de criação e data de leitura. A leitura e a contagem de não lidas são isoladas por usuário e workspace.

Novos leads notificam gestores e atendentes humanos ativos. Agendamentos criados ou confirmados notificam gestores e o profissional vinculado àquela reserva; outros atendentes e executores não veem o evento. Somente gestores consultam e alteram as preferências globais. A campainha atualiza automaticamente a cada 30 segundos, abre o destino interno do alerta e oferece marcação individual ou em lote como lido.

Quando `dailySummary` está ativo, o worker gera no máximo um resumo por workspace e dia local, a partir das 18h no fuso cadastrado. O resumo conta agendamentos não cancelados iniciados naquele dia e novos leads criados naquele dia, e é entregue apenas a gestores ativos. A chave diária é única por workspace, usuário e data, tornando seguras execuções repetidas do worker.

## Erros

A API usa respostas JSON com `error`, `message` e, quando aplicável, `requestId`. Os códigos esperados são `400` para payload inválido, `401` para credencial ausente ou incorreta, `409` para conflito de agenda/idempotência incompatível, `422` para regra de negócio e `500` para falha inesperada.
