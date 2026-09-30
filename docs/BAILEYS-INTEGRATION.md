# Integração WhatsApp via Baileys — Forte Panel

> Documento operacional e de contrato da integração entre o **Forte Panel**, o gateway **forte-whatsapp** e o WhatsApp Web através da biblioteca Baileys.

**Status:** CRUD multi-instância, Inbox tenant-scoped e conexão E2E com número real validados; integração de IA e smoke test no Docker do usuário seguem como próximas validações
**Última revisão:** 2026-09-28
**Escopo:** conexão de sessão, QR Code, código de pareamento por telefone, status, envio, recebimento, webhook, persistência, segurança e troubleshooting.

---

## 1. Objetivo

A integração permite que cada workspace do Forte Panel conecte uma sessão WhatsApp através de um gateway Baileys separado. O gateway mantém a sessão autenticada, recebe eventos do WhatsApp, envia mensagens e entrega eventos inbound ao Panel por webhook assinado.

O usuário não acessa diretamente as credenciais internas do gateway. O fluxo recomendado é:

1. Criar ou selecionar o workspace;
2. Criar/garantir o canal Baileys do workspace;
3. Definir o nome operacional da conexão;
4. Escolher **QR Code** ou **código de pareamento por telefone**;
5. Conectar o número no WhatsApp;
6. Confirmar o estado `connected`;
7. Só então ativar o pipeline Inbox → Agente → Outbound.

---

## 2. Arquitetura

```text
WhatsApp Web
    │
    │ Baileys / sessão persistente
    ▼
forte-whatsapp :3010
    │
    ├── HTTP protegido por Bearer API key
    │      ├── status
    │      ├── QR Code
    │      ├── conexão / desconexão / logout
    │      ├── pairing code
    │      └── envio de mensagens
    │
    └── WebhookOutbox persistente, assinado e com retry
             │
             ▼
Forte Panel :3000
    │
    ├── tRPC para a interface de conexão
    ├── API webhook `/api/v1/webhooks/providers/baileys`
    ├── normalização de evento
    ├── idempotência
    ├── criação/atualização do contato e conversa
    ├── Inbox
    ├── agente IA
    └── roteamento outbound
```

### Componentes principais

| Componente | Local | Responsabilidade |
|---|---|---|
| Gateway HTTP | `forte-whatsapp/src/server.ts` | Expõe o contrato operacional da instância |
| Gerenciador | `forte-whatsapp/src/instance-manager.ts` | Mantém socket Baileys, sessão, QR, pairing, envio e eventos |
| Outbox | `forte-whatsapp/src/webhook-outbox.ts` | Persiste eventos inbound, assina e reenvia com backoff |
| Adapter Panel | `server/integrations/whatsapp.ts` | Health check, envio e normalização de eventos |
| Gateway facade | `server/baileys-gateway.ts` | Traduz tRPC do Panel para HTTP do gateway |
| Rotas tRPC | `server/routers.ts` | Contrato usado pela UI |
| Registro de instância | `whatsappInstances` | Associação Baileys ao workspace, ID global, nome e arquivamento |
| Registry | `forte-whatsapp/src/instance-registry.ts` | Lista, inicia, renomeia e remove sessões independentes por ID |
| UI | `client/src/pages/WhatsappConnectionPage.tsx` | CRUD de instâncias, QR, pairing, ações de sessão e link para Inbox por instância |

---

## 3. Modelo multi-tenant e registry

O gateway é um processo interno que hospeda um registry de várias sessões. O Panel vincula cada ID físico ao workspace autenticado através de `whatsappInstances`:

```text
whatsappInstances
├── workspaceId
├── channelId
├── provider = baileys
├── instanceId (globalmente único para Baileys)
├── name
├── active / isDefault
└── status e timestamps operacionais
```

Cada `instanceId` tem um `InstanceManager` próprio e uma pasta de sessão independente em `WHATSAPP_SESSION_DIR/{instanceId}`. O metadata `.instance.json` persiste nome e autostart. A tabela de negócio é multi-tenant; o registry do gateway **não escolhe o workspace**.

### Criação, compatibilidade e ciclo de vida

- O Panel gera ID estável no servidor, cria o registro workspace-scoped e provisiona o gateway através da API interna Bearer.
- Novas instâncias não conectam até que o gestor pressione **Conectar e gerar QR**.
- Rename preserva ID e sessão. Desconexão temporária preserva a autenticação; logout exige novo pareamento; exclusão remove a sessão física e arquiva o registro de negócio, sem apagar histórico de mensagens.
- Ao iniciar, o registry carrega somente diretórios de sessão presentes; um ID `default` apagado não é recriado.
- Sessões antigas com diretório, mas sem metadata, são importadas como legacy. Se `FORTE_API_WORKSPACE_ID` e `BAILEYS_INSTANCE_ID` identificarem o vínculo antigo, a primeira listagem pode registrá-lo idempotentemente.
- Callbacks identificam o tenant através do `instanceId` ativo. IDs arquivados/inativos e workspaces inativos são rejeitados; o fallback legado só vale para o ID configurado e ainda não registrado.
- Outbound Baileys exige `instanceId` explícito; não cai numa sessão default global.

As migrations `0038_baileys_global_instance_ids` e `0039_baileys_workspace_default_unique` protegem respectivamente a unicidade global dos IDs Baileys e o único default ativo por workspace. Aplicá-las primeiro no PostgreSQL local; ainda não foram aplicadas pelo sandbox desta revisão.

---

## 4. Configuração de ambiente

### 4.1 Panel

```env
BAILEYS_BASE_URL=http://forte-whatsapp:3010
BAILEYS_API_KEY=<chave-interna-do-gateway>
BAILEYS_WEBHOOK_SECRET=<segredo-do-webhook>
# Opcional: ID da sessão singleton antiga para importação compatível
BAILEYS_INSTANCE_ID=default
BAILEYS_REQUEST_TIMEOUT_MS=8000
```

### 4.2 Gateway

```env
WHATSAPP_API_KEY=<chave-interna-do-gateway>
WHATSAPP_SESSION_DIR=/app/sessions
WHATSAPP_SESSION_ENCRYPTION_KEY=32-bytes-em-hex-opcional
# Opcional: ID e nome de uma sessão antiga; o registry não cria esse ID sozinho
WHATSAPP_INSTANCE_ID=default
WHATSAPP_WEBHOOK_URL=http://forte-panel:3000/api/v1/webhooks/providers/baileys
WHATSAPP_WEBHOOK_SECRET=<segredo-do-webhook>
WHATSAPP_WEBHOOK_OUTBOX_DIR=/app/sessions/outbox
WHATSAPP_MAX_INSTANCES=10
WHATSAPP_WEBHOOK_MAX_ATTEMPTS=8
WHATSAPP_WEBHOOK_INITIAL_BACKOFF_MS=1000
WHATSAPP_WEBHOOK_MAX_BACKOFF_MS=60000
PORT=3010
```

### 4.3 Docker Compose

No Compose local:

- Panel e worker usam `BAILEYS_BASE_URL=http://forte-whatsapp:3010`;
- Gateway usa `WHATSAPP_API_KEY=${BAILEYS_API_KEY}`;
- Gateway usa `WHATSAPP_WEBHOOK_SECRET=${BAILEYS_WEBHOOK_SECRET}`;
- Sessões ficam no volume `forte_whatsapp_sessions`;
- O gateway publica a porta apenas em `127.0.0.1:3010` por padrão.

### Requisitos

- `WHATSAPP_API_KEY` deve ser igual a `BAILEYS_API_KEY`;
- `WHATSAPP_WEBHOOK_SECRET` deve ser igual a `BAILEYS_WEBHOOK_SECRET`;
- se `WHATSAPP_WEBHOOK_URL` estiver configurada, o segredo é obrigatório;
- a sessão não deve ser armazenada dentro do container sem volume persistente;
- a chave de criptografia deve ser preservada: perdê-la pode impedir a leitura da sessão.

---

## 5. Autenticação do gateway

Todos os endpoints operacionais exigem:

```http
Authorization: Bearer <WHATSAPP_API_KEY>
```

Sem a chave correta:

```json
{
  "error": "unauthorized"
}
```

Status HTTP esperado: `401`.

Os endpoints `/health` e `/ready` são públicos para health checks internos. Em uma exposição pública, devem ser protegidos por rede/firewall ou proxy.

---

## 6. Endpoints do gateway

A base local é:

```text
http://localhost:3010
```

A base interna do Panel é:

```text
http://forte-whatsapp:3010
```

O marcador `{instanceId}` deve ser URL-encoded.

### 6.1 Health

```http
GET /health
```

Sem autenticação.

Resposta `200`:

```json
{
  "status": "ok",
  "service": "forte-whatsapp"
}
```

Uso: verificar se o processo HTTP está vivo. Isso não significa que o WhatsApp está conectado.

---

### 6.2 Readiness

```http
GET /ready
```

O endpoint é público no gateway atual para permitir probes do Docker/orquestrador. Em exposição fora da rede interna, deve ser protegido por firewall ou proxy. Resposta `200` quando o processo está em estado aceitável:

```json
{
  "status": "ready",
  "instance": {
    "instanceId": "default",
    "status": "connected",
    "phone": "5511999999999",
    "updatedAt": "2026-09-27T22:00:00.000Z",
    "webhookOutboxPending": 0,
    "webhookLastError": null
  }
}
```

`ready` representa o processo operacional. Para considerar o canal pronto para atendimento, o Panel também verifica `instance.status === "connected"`.

---

### 6.3 Listar instâncias

```http
GET /api/instances
Authorization: Bearer <API_KEY>
```

Resposta:

```json
[
  {
    "instanceId": "default",
    "status": "connected",
    "phone": "5511999999999",
    "updatedAt": "2026-09-27T22:00:00.000Z",
    "webhookOutboxPending": 0,
    "webhookLastError": null
  }
]
```

O gateway retorna todas as sessões ativas carregadas pelo registry; uma lista vazia é válida e não recria uma sessão `default`.

---

### 6.3.1 Criar, renomear e excluir

```http
POST /api/instances
Authorization: Bearer <API_KEY>
Content-Type: application/json

{"instanceId":"ws123-uuid","name":"WhatsApp comercial"}
```

Retorna `201` com o snapshot. A criação grava metadados, mas não conecta automaticamente.

```http
PATCH /api/instances/{instanceId}
Authorization: Bearer <API_KEY>
Content-Type: application/json

{"name":"Atendimento"}
```

O rename preserva ID e sessão.

```http
DELETE /api/instances/{instanceId}
Authorization: Bearer <API_KEY>
```

O gateway encerra o vínculo WhatsApp e remove os arquivos da sessão. O Panel arquiva o registro de negócio e mantém as mensagens históricas.

---

### 6.4 Status da instância

```http
GET /api/instances/{instanceId}
Authorization: Bearer <API_KEY>
```

Resposta inclui:

| Campo | Tipo | Descrição |
|---|---|---|
| `instanceId` | string | Identificador físico |
| `status` | string | Estado atual |
| `phone` | string opcional | Número conectado |
| `qr` | string opcional | QR bruto interno; não exibir diretamente |
| `lastError` | string opcional | Último erro |
| `webhookOutboxPending` | number | Eventos pendentes |
| `webhookLastError` | string opcional | Último erro da outbox |
| `updatedAt` | ISO string | Última alteração |
| `webhookOutboxDeadLetter` | number | Eventos movidos para dead-letter por falha permanente |

Exemplo:

```json
{
  "instanceId": "default",
  "status": "qr",
  "qr": "2@...",
  "updatedAt": "2026-09-27T22:00:00.000Z",
  "webhookOutboxPending": 0,
  "webhookOutboxDeadLetter": 0
}
```

---

### 6.5 Obter QR Code como Data URL

```http
GET /api/instances/{instanceId}/qr
Authorization: Bearer <API_KEY>
```

Se houver QR:

```json
{
  "instanceId": "default",
  "imageDataUrl": "data:image/png;base64,..."
}
```

Se não houver QR disponível:

```http
404
```

```json
{
  "error": "qr_not_available"
}
```

O QR deve ser considerado temporário. A UI do Panel usa o `updatedAt` para exibir expiração aproximada e atualiza o dado por polling.

---

### 6.6 Iniciar/reiniciar conexão QR

```http
POST /api/instances/{instanceId}/connect
Authorization: Bearer <API_KEY>
```

Body: vazio.

Resposta `202`:

```json
{
  "instanceId": "default",
  "status": "connecting",
  "updatedAt": "2026-09-27T22:00:00.000Z"
}
```

O fluxo normal é:

1. `POST /connect`;
2. aguardar `status = qr`;
3. `GET /qr`;
4. escanear no celular;
5. aguardar `status = connected`.

A operação usa `reconnect()`, encerrando o socket anterior e iniciando a sessão novamente.

---

### 6.7 Solicitar código de pareamento por telefone

```http
POST /api/instances/{instanceId}/pairing-code
Authorization: Bearer <API_KEY>
Content-Type: application/json
```

Payload:

```json
{
  "phone": "5511999999999"
}
```

Regras:

- somente números são usados internamente;
- deve conter DDI;
- tamanho aceito: 8 a 15 dígitos;
- não pode ser solicitado quando a instância já está `connected`.

Resposta `200`:

```json
{
  "instanceId": "default",
  "code": "AB12-CD34"
}
```

Depois, no celular:

```text
WhatsApp → Configurações → Dispositivos conectados
→ Conectar aparelho → Conectar com número de telefone
```

A interface deve mostrar o código apenas para o operador autenticado e não deve gravá-lo em banco ou logs.

---

### 6.8 Desconectar temporariamente

```http
POST /api/instances/{instanceId}/disconnect
Authorization: Bearer <API_KEY>
```

Body: vazio.

Comportamento:

- encerra o socket;
- preserva os arquivos de autenticação;
- atualiza o status para `disconnected`;
- não deve apagar a sessão persistida;
- a reconexão futura pode reutilizar os credenciais salvos.

Resposta `200`: snapshot atualizado.

---

### 6.9 Encerrar sessão/logout

```http
POST /api/instances/{instanceId}/logout
Authorization: Bearer <API_KEY>
```

Body: vazio.

Comportamento:

- encerra a sessão no WhatsApp;
- marca `logged_out`;
- exige novo QR ou pairing code para conectar novamente;
- deve ser usado quando o operador deseja remover o vínculo do aparelho.

Resposta `200`: snapshot atualizado.

---

### 6.10 Enviar mensagem genérica

```http
POST /api/instances/{instanceId}/send
Authorization: Bearer <API_KEY>
Content-Type: application/json
Idempotency-Key: forte-message-<id>
```

Payload mínimo de texto:

```json
{
  "phone": "5511999999999",
  "messageType": "text",
  "content": "Olá! Como podemos ajudar?",
  "metadata": {
    "workspaceId": 123,
    "conversationId": 456
  }
}
```

Para preservar um JID Baileys, o campo `phone` pode ser o JID:

```json
{
  "phone": "1234567890@lid",
  "messageType": "text",
  "content": "Resposta para este contato",
  "metadata": {
    "jid": "1234567890@lid"
  }
}
```

Resposta:

```json
{
  "success": true,
  "externalId": "3EB0...",
  "status": "sent",
  "messageType": "text"
}
```

Tipos suportados pelo adapter atual:

- `text`
- `image`
- `audio`
- `video`
- `document`
- outros tipos que cheguem como `payload` Baileys, desde que o objeto seja aceito pelo socket.

Exemplo de mídia via conteúdo Data URL:

```json
{
  "phone": "5511999999999",
  "messageType": "image",
  "content": "data:image/png;base64,...",
  "metadata": {
    "mediaMimeType": "image/png",
    "fileName": "imagem.png",
    "caption": "Veja este arquivo"
  }
}
```

Para payload nativo:

```json
{
  "phone": "5511999999999",
  "messageType": "payload",
  "content": "",
  "payload": {
    "text": "Mensagem nativa"
  },
  "metadata": {}
}
```

---

### 6.11 Atalho de texto

```http
POST /api/instances/{instanceId}/send-text
Authorization: Bearer <API_KEY>
Content-Type: application/json
```

Payload:

```json
{
  "phone": "5511999999999",
  "text": "Mensagem de teste"
}
```

Resposta:

```json
{
  "success": true,
  "externalId": "3EB0...",
  "status": "sent"
}
```

---

## 7. Estados da instância

| Estado | Significado | Ação da UI |
|---|---|---|
| `idle` | Processo pronto, sem conexão ativa | Mostrar botão de conexão |
| `connecting` | Socket sendo iniciado | Desabilitar ações duplicadas |
| `qr` | QR disponível para leitura | Buscar QR e exibir expiração |
| `pairing` | Código de telefone solicitado | Mostrar código e instruções |
| `connected` | WhatsApp conectado | Liberar envio e mostrar desconectar |
| `disconnected` | Socket encerrado, credenciais podem existir | Permitir reconexão |
| `logged_out` | Sessão removida no WhatsApp | Exigir nova autenticação |
| `error` | Falha ao iniciar ou manter conexão | Mostrar erro e permitir retry |

### Regras de transição principais

```text
idle → connecting → qr → connected
idle → connecting → pairing → connected
disconnected → connecting
connected → disconnected
connected → logged_out
connecting/qr/pairing → error
```

---

## 8. Endpoints tRPC do Panel

A UI não chama o gateway diretamente. Cada procedure aplica autenticação, workspace ativo e RBAC; o gateway só recebe chamadas server-to-server.

### Consultas

- `workspace.baileysInstances` — lista as instâncias ativas do workspace e faz import legacy idempotente somente se o ID/sessão antigos existirem.
- `workspace.baileysStatus({ instanceId })` — status físico de uma instância pertencente ao workspace.
- `workspace.baileysQr({ instanceId })` — Data URL do QR atual ou `null`; nunca listar QR de outro tenant.
- `inbox.instances` — lista as instâncias Baileys ativas do workspace autenticado, após garantir o vínculo legacy compatível.
- `inbox.contacts({ instanceIds: null | string[] })` e `inbox.thread({ contactId, instanceIds })` — filtram a prévia e o histórico no backend; não dependem de filtragem apenas visual.

### Mutações gerenciais

- `workspace.createBaileysInstance({ name })` — cria ID no backend, registro e instância do gateway.
- `workspace.renameBaileysInstance({ instanceId, name })` — renomeia sem trocar a sessão.
- `workspace.connectBaileys({ instanceId })` — começa/reinicia a conexão e solicita QR.
- `workspace.requestBaileysPairingCode({ instanceId, phone })` — obtém código temporário para número de 8–15 dígitos.
- `workspace.disconnectBaileys({ instanceId, logout })` — desconecta temporariamente (`false`) ou encerra a sessão no WhatsApp (`true`).
- `workspace.deleteBaileysInstance({ instanceId, confirmDeletion: true })` — exige confirmação; remove sessão física e arquiva vínculo, preservando mensagens históricas.

IDs devem ser fornecidos em cada operação. A UI exige perfil de gerente/owner/admin para alterações. Nenhuma procedure retorna `BAILEYS_API_KEY`, `WHATSAPP_API_KEY` ou `BAILEYS_WEBHOOK_SECRET`.

### Filtro de instâncias da Inbox

- `instanceIds: null` (ou omitido) significa **Todas**; um array com um ID ou vários IDs aplica o filtro explicitamente.
- O servidor valida cada ID contra as instâncias Baileys ativas do workspace autenticado. Array vazio, ID inexistente ou ID de outro workspace falham fechados; o cliente não amplia silenciosamente a consulta.
- A consulta de mensagens também valida no banco que qualquer `instanceId` Baileys conhecido pertence ao workspace do contato autenticado. Registros históricos sem `instanceId` continuam visíveis apenas em **Todas**; um filtro específico não os atribui artificialmente a uma instância. Um `instanceId` conhecido de outro workspace nunca aparece, nem mesmo em **Todas**.
- Instâncias arquivadas deixam de ser selecionáveis, mas seu histórico do próprio workspace permanece em **Todas**.
- As respostas manuais seguem a instância selecionada com atividade mais recente. O cursor de leitura continua sendo por conversa compartilhada: abrir um filtro específico não avança o cursor global; marcar como lida acontece ao voltar para **Todas**.
- O botão de áudio no composer envia **upload de arquivo de áudio** (até 8 MB, MIME `audio/*`). Gravação pelo microfone não faz parte desta fatia; os controles existentes para imagem, vídeo e documento permanecem.

---

## 9. Webhook inbound do gateway para o Panel

### Endpoint

```http
POST /api/v1/webhooks/providers/baileys
```

O gateway envia para `WHATSAPP_WEBHOOK_URL`.

### Autenticação

Uma das formas válidas:

```http
X-Webhook-Secret: <BAILEYS_WEBHOOK_SECRET>
```

ou assinatura HMAC conforme a implementação do Panel/outbox:

```http
X-Webhook-Signature: sha256=<digest>
```

O digest é calculado sobre o JSON exato do corpo:

```text
sha256 = HMAC-SHA256(JSON.stringify(req.body), WEBHOOK_SIGNING_SECRET)
```

No envio padrão do `WebhookOutbox`, o gateway também envia `X-Webhook-Secret` com `WHATSAPP_WEBHOOK_SECRET` e calcula a assinatura usando o mesmo segredo. O Panel aceita esse segredo configurado em `BAILEYS_WEBHOOK_SECRET`, a assinatura configurada em `WEBHOOK_SIGNING_SECRET`, ou a API key autorizada pelo ambiente interno.

O payload assinado é o JSON enviado no corpo. O receptor deve validar a assinatura antes de processar.

### Payload de mensagem inbound

```json
{
  "eventId": "3EB0ABCDE",
  "instanceId": "default",
  "phone": "5511999999999",
  "jid": "5511999999999@s.whatsapp.net",
  "name": "Cliente",
  "content": "Olá, gostaria de um orçamento",
  "messageType": "text",
  "fromMe": false,
  "receivedAt": "2026-09-27T22:00:00.000Z",
  "metadata": {
    "provider": "baileys",
    "messageId": "3EB0ABCDE",
    "jid": "5511999999999@s.whatsapp.net"
  }
}
```

### Payload de mídia

O gateway adiciona metadados quando consegue baixar a mídia:

```json
{
  "eventId": "media-event-1",
  "instanceId": "default",
  "phone": "5511999999999",
  "jid": "5511999999999@s.whatsapp.net",
  "content": "Legenda da imagem",
  "messageType": "image",
  "receivedAt": "2026-09-27T22:00:00.000Z",
  "metadata": {
    "provider": "baileys",
    "mediaData": "data:image/jpeg;base64,...",
    "mediaMimeType": "image/jpeg",
    "fileName": "foto.jpg",
    "fileLength": 123456
  }
}
```

### Respostas do Panel

Aceito:

```http
202 Accepted
```

```json
{
  "accepted": true,
  "duplicate": false,
  "eventId": "3EB0ABCDE",
  "data": {}
}
```

Evento repetido idempotente:

```http
200 OK
```

```json
{
  "accepted": true,
  "duplicate": true,
  "eventId": "3EB0ABCDE"
}
```

Payload inválido:

```http
400 Bad Request
```

Conflito do mesmo `eventId` com outro payload:

```http
409 Conflict
```

Falha interna:

```http
500 Internal Server Error
```

---

### 9.1 Normalização de texto, takeover manual e prevenção de loop

- Baileys pode envolver mensagens em `ephemeralMessage`, wrappers view-once, documentos com legenda ou wrappers de edição. O gateway remove esses wrappers antes de classificar o tipo, dando prioridade a `conversation` e `extendedTextMessage.text`; o texto simples `oi` continua `messageType: "text"` e `content: "oi"`, não `[mídia recebida]`.
- Placeholders de imagem/áudio/vídeo/documento só substituem conteúdo quando a mensagem não contém texto nem legenda. A mídia e seu MIME/nome/tamanho seguem em metadata quando disponíveis.
- O fluxo de atendimento encaminha apenas `messages.upsert` com `type: "notify"` e sem `requestId`. Eventos `append` e backfill são ignorados para não transformar sincronização antiga em conversas novas. `messaging-history.set/status` registra somente contagens, tipo e progresso; não persiste conteúdo e não equivale a importação automática do histórico.
- Texto desconhecido vazio é identificado por `isPlaceholder` e ignorado antes de criar lead/conversa; placeholder de mídia é aceito porque seu `messageType` identifica a mídia real. O backend exige que a instância Baileys esteja ativa e pertença ao workspace antes de qualquer persistência de mídia.
- O callback pode responder `202` com `accepted: true, ignored: true` para backfill/payload placeholder; esse ACK conclui a outbox sem afirmar que a mensagem entrou no Inbox.
- O logger Pino redige o objeto inteiro `histNotification` do logger interno Baileys, pois ele pode conter referências/chaves criptografadas de mídia; o observer da aplicação mantém somente contagens/tipo/progresso.
- Eventos Baileys incluem `fromMe`. Uma mensagem manual enviada pelo próprio número é persistida como `direction: "outbound"` / `senderType: "human"`, desativa `aiEnabled`, marca `humanControlled` e limpa unread; ela não emite `message.received` para o agente.
- Mensagens originadas no Panel são reconhecidas pelo ID Baileys ou por uma assinatura pendente e limitada de destino/tipo/conteúdo normalizado, inclusive para mídia e mensagens interativas; falha de envio cancela a assinatura pendente. Assim, ecos não reingressam como takeover manual, enquanto mensagens `fromMe` sem correspondência seguem o fluxo de takeover.

## 10. Outbox, retry e durabilidade

O `WebhookOutbox` foi criado para impedir perda silenciosa de mensagens inbound quando o Panel está temporariamente indisponível.

### Fluxo

1. O gateway recebe a mensagem do WhatsApp;
2. cria o payload com `eventId`;
3. grava um envelope atômico no diretório da outbox;
4. tenta enviar o webhook;
5. em falha, agenda nova tentativa;
6. ao reiniciar, reprocessa arquivos pendentes.

### Idempotência outbound

Toda chamada autenticada de `POST /api/instances/:instanceId/send` ou `send-text` exige `Idempotency-Key`. O gateway persiste um ledger por instância em `send-ledger/`, antes de chamar o socket. Uma chave concluída devolve o mesmo `externalId` sem chamar o provedor novamente; a mesma chave com payload diferente retorna conflito. Se o resultado externo ficar inconclusivo por timeout ou crash, o registro permanece `started` e novas tentativas falham fechadas com `idempotency_in_progress`, em vez de arriscar uma segunda mensagem.

### Envelope persistido

```json
{
  "payload": {
    "eventId": "3EB0ABCDE"
  },
  "attempts": 2,
  "nextAttemptAt": "2026-09-27T22:00:05.000Z",
  "lastError": "HTTP 503",
  "createdAt": "2026-09-27T22:00:00.000Z"
}
```

### Backoff

Configuração padrão:

- máximo de tentativas: `8`;
- atraso inicial: `1000 ms`;
- atraso máximo: `60000 ms`;
- varredura periódica: `5000 ms`.

O `eventId` funciona como chave de idempotência e deve permanecer estável durante retries.

---

## 11. Persistência da sessão

A sessão fica em:

```text
WHATSAPP_SESSION_DIR/<instanceId>
```

No Compose:

```text
/app/sessions/<instanceId>
```

O volume deve ser persistente:

```yaml
volumes:
  - forte_whatsapp_sessions:/app/sessions
```

Se `WHATSAPP_SESSION_ENCRYPTION_KEY` estiver definida, os arquivos de credenciais e chaves são armazenados criptografados com AES-256-GCM.

### Não fazer

- não apagar o volume durante uma simples desconexão;
- não trocar a chave de criptografia sem migração;
- não copiar a sessão para logs ou tickets;
- não expor o QR bruto em API pública;
- não compartilhar `BAILEYS_API_KEY` ou `BAILEYS_WEBHOOK_SECRET` no frontend.

---

## 12. Fluxos funcionais recomendados

### 12.1 QR Code

```text
Panel: connectBaileys
  → Gateway: POST /connect
  → Gateway: status=connecting
  → Baileys: connection.update qr
  → Gateway: status=qr
  → Panel: baileysQr
  → Usuário escaneia
  → Baileys: connection.update open
  → Gateway: status=connected
  → Panel invalida status e libera operação
```

### 12.2 Código de telefone

```text
Panel: requestBaileysPairingCode(phone)
  → Gateway: POST /pairing-code
  → Baileys: requestPairingCode(phone)
  → Gateway: status=pairing + code
  → Usuário digita o código no WhatsApp
  → Baileys: connection.update open
  → Gateway: status=connected
```

### 12.3 Desconectar sem logout

```text
Panel: disconnectBaileys({ logout: false })
  → Gateway: POST /disconnect
  → socket.end()
  → sessão persistida permanece
  → status=disconnected
```

### 12.4 Logout

```text
Panel: disconnectBaileys({ logout: true })
  → Gateway: POST /logout
  → socket.logout()
  → status=logged_out
  → nova autenticação exigida
```

---

## 13. Diagnóstico operacional

### Gateway está vivo, mas não conectado

```powershell
curl.exe -i http://localhost:3010/health
curl.exe -i http://localhost:3010/ready -H "Authorization: Bearer $env:BAILEYS_API_KEY"
```

`health=200` apenas confirma processo vivo. Consulte `/ready` para o estado da sessão.

### Ver status interno com Docker

```powershell
docker logs --tail 200 forte_whatsapp
```

### Ver logs do Panel

```powershell
docker logs --tail 200 forte_panel
```

### Verificar se os serviços estão na mesma rede

```powershell
docker compose --env-file .env -f docker-compose.local.yml ps
docker network inspect forte_panel_whatsapp-network
```

### Instância não encontrada neste workspace

O endpoint de UI valida a associação `(workspaceId, instanceId)` antes de consultar o gateway. Confira se o registro Baileys está ativo no workspace atual, se as migrations 0038/0039 foram aplicadas, se o gateway foi atualizado e se a instância não foi excluída. Não use o ID de outro workspace nem um fallback `default` global.

### Botão desconectar não muda o status

Verificar:

1. se o container Panel aponta para o gateway correto;
2. se `BAILEYS_API_KEY` coincide com `WHATSAPP_API_KEY`;
3. se o gateway recebeu `POST /disconnect`;
4. se o frontend atualizou `workspace.baileysStatus`;
5. se o status não voltou automaticamente por uma reconexão inesperada.

O gateway agora força `disconnected` também quando o socket já não existe em memória.

### QR não aparece

- confirmar `status=qr` no `/api/instances/{instanceId}`;
- confirmar que `/qr` não responde `404`;
- gerar um novo QR com `/connect`;
- conferir relógio do host e expiração da UI;
- não manter dois processos usando o mesmo volume: o lock de sessão impede isso.

### Inbound não chega ao Inbox

Verificar:

1. `WHATSAPP_WEBHOOK_URL`;
2. `WHATSAPP_WEBHOOK_SECRET`;
3. rota `/api/v1/webhooks/providers/baileys`;
4. `FORTE_API_WORKSPACE_ID`;
5. `webhookOutboxPending` e `webhookLastError`;
6. logs do gateway e Panel;
7. se o evento é de grupo, pois grupos são ignorados no MVP;
8. se há telefone e conteúdo válidos.

---

## 14. Checklist de teste manual

### Infraestrutura

- [ ] `forte_postgres_panel` saudável;
- [ ] `forte_redis_panel` saudável;
- [ ] migrations concluídas com sucesso;
- [ ] `forte_panel` ativo;
- [ ] `forte_whatsapp` ativo;
- [ ] `/health` retorna 200;
- [ ] `/ready` responde com snapshot.

### Workspace

- [ ] criar/selecionar workspace;
- [ ] abrir `/whatsapp-connection`;
- [ ] criar duas instâncias e confirmar IDs diferentes;
- [ ] renomear cada uma e recarregar para confirmar persistência;
- [ ] confirmar que status/QR de um ID não aparecem no outro workspace;
- [ ] excluir com confirmação e verificar que somente a sessão alvo desaparece, não o histórico;
- [ ] validar import idempotente apenas para sessão física legacy vinculada por env.

### QR

- [ ] criar a instância;
- [ ] clicar **Conectar e gerar QR**;
- [ ] escanear;
- [ ] confirmar `connected`;
- [ ] recarregar página;
- [ ] clicar desconectar;
- [ ] confirmar `disconnected`;
- [ ] reconectar sem logout;
- [ ] clicar logout;
- [ ] confirmar `logged_out`.

### Pairing code

- [ ] abrir configuração;
- [ ] escolher código por telefone;
- [ ] informar DDI;
- [ ] receber código;
- [ ] inserir no WhatsApp;
- [ ] confirmar `connected`;
- [ ] não registrar código em logs.

### Pipeline

- [ ] enviar mensagem de outro número;
- [ ] confirmar webhook inbound;
- [ ] confirmar contato/conversa;
- [ ] confirmar mensagem no Inbox;
- [ ] confirmar agente/worker;
- [ ] confirmar envio outbound;
- [ ] confirmar `externalId`;
- [ ] repetir evento e confirmar idempotência.

---

## 15. Próximas etapas aprovadas para revisão

1. Aplicar migrations e validar CRUD/QR/consumo no Docker local WSL com número de teste.
2. Depois da revisão do usuário, preparar o Console Admin de URLs, keys e modelos/capacidades (separado por papel, segredo criptografado e mascarado).
3. Validar envio/recebimento por modalidade com roteamento por `instanceId`.
4. Só depois conectar o agente de resposta, começando por prompt fictício e modo simulado; envio automático exige validação própria.

Não iniciar os passos 2–4 antes de aprovação da etapa atual.

---

## 16. Contrato resumido

| Necessidade | Endpoint |
|---|---|
| Processo vivo | `GET /health` |
| Gateway pronto | `GET /ready` |
| Status | `GET /api/instances/{id}` |
| QR | `GET /api/instances/{id}/qr` |
| Iniciar QR | `POST /api/instances/{id}/connect` |
| Código por telefone | `POST /api/instances/{id}/pairing-code` |
| Desconectar | `POST /api/instances/{id}/disconnect` |
| Logout | `POST /api/instances/{id}/logout` |
| Enviar texto | `POST /api/instances/{id}/send-text` |
| Enviar genérico | `POST /api/instances/{id}/send` |
| Receber evento | `POST /api/v1/webhooks/providers/baileys` |

Este documento registra o contrato técnico ativo do gateway. A sequência de produto e os gates de revisão ficam em `WHATSAPP-CONNECTION-FLOW-2026-09-27.md`; a API empresarial REST continua fechada por padrão conforme `API_CONTRACT.md`.


## Inbox operacional — 28/09/2026

A Inbox foi liberada como a segunda área operacional do modo Core, sem reativar as demais páginas congeladas. A rota é `/inbox` e permanece protegida pela autenticação/RBAC existente.

O fluxo contempla recebimento e persistência de texto, imagem, áudio, vídeo, documento e sticker; preservação de payload para localização, contato, enquete, lista, botão e reação; identificação por telefone/JID, `pushName`, `instanceId` e `messageId`; download de mídia recebida pelo gateway; e envio por texto e anexos roteado pelo `instanceId` da origem.

A interface manteve o desenho existente da Inbox; o cabeçalho redundante foi ocultado nessa rota porque a identificação já é feita pela sidebar. O smoke test visual e o teste com mensagens reais no Docker do usuário continuam sendo a validação final do ambiente local.


## 14. Histórico inicial após conexão

O evento `messaging-history.set` é encaminhado pelo gateway para a outbox assinada com `historySync=true` no nível superior do envelope. O normalizador do Panel promove essa marca para `metadata.historySync=true` antes do ingest. Cada mensagem recebe um `eventId` determinístico derivado do `instanceId` e da chave Baileys, e o Panel valida novamente a ownership da instância antes de persistir.

A aba **Conexões WhatsApp** expõe o link **Abrir Inbox** em cada instância. O link usa `/inbox?instanceId=<id>`; a Inbox valida o ID contra `inbox.instances` e encaminha o filtro para `inbox.contacts`, `inbox.thread` e `inbox.sendMessage`, mantendo o isolamento por workspace no backend.

O histórico inicial é deliberadamente separado do fluxo live:

- usa a deduplicação existente por `messages.externalId`;
- não baixa blobs de mídia durante o batch inicial;
- não incrementa unread;
- não altera takeover/human control ou pausa a IA em conversas existentes;
- não cria `message.received` para o worker/agente;
- não sobrescreve preview/última mensagem atual de uma conversa existente com conteúdo antigo;
- preserva a proveniência `historySync` no metadata.

O progresso de `messaging-history.set`/`messaging-history.status` ainda é observado em logs. Persistência de progresso, busca incremental via `fetchMessageHistory`, retry específico e importação de mídia histórica são etapas posteriores. O WhatsApp/Baileys pode fornecer apenas o histórico disponível para o dispositivo; a integração não promete importação integral.
