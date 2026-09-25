# Plano de evolução do Forte Panel como intermediador

Atualizado em **25/09/2026**.

## Objetivo

Transformar o Forte Panel no intermediador central entre os provedores de WhatsApp, o n8n e a operação humana:

```text
Provedor WhatsApp → Forte Panel → n8n → Forte Panel → Provedor WhatsApp
```

O Forte Panel será responsável por contato, conversa, histórico, idempotência, controle humano e envio. O n8n continuará, inicialmente, com interpretação da mensagem, IA e montagem da resposta.

O histórico local consolidado está disponível em `GET /api/v1/contacts/:id/messages`, com `limit` e `since` para paginação e sincronização incremental. Eventos PAPI `fromMe` são gravados como mensagens humanas e pausam a IA.

## O que foi feito nesta etapa

### Atendimento e interface

- A página anteriormente chamada **Inbox** passou a se chamar **Atendimento**.
- A navegação recebeu nomes mais claros em português:
  - Atendimento;
  - Clientes e contatos;
  - Funil de atendimento;
  - Agenda;
  - Minha agenda;
  - Canais conectados;
  - Configuração da empresa;
  - Preferências.
- O quadro de atendimento ganhou altura limitada ao viewport.
- A lista de conversas possui rolagem interna.
- O perfil do contato possui rolagem interna.
- O corpo do chat possui rolagem vertical própria.
- O composer permanece fixo no rodapé do quadro do chat.
- No celular, o quadro continua adaptável sem criar uma página infinita.

### Validação

- `git diff --check` passou.
- `pnpm build` passou, gerando o frontend e os bundles do servidor.
- O build ainda exibe apenas o aviso já existente sobre tamanho de chunk do frontend.

## Entrada PAPI → Forte Panel

### Entrada PAPI → Forte Panel

O primeiro endpoint já foi criado em:

```text
POST /api/v1/webhooks/providers/papi/:webhookId
```

Ele recebe o payload bruto, normaliza formatos com `data`, `payload`, `body`, `message` ou `messages[0]`, preserva identificadores e aplica o registro idempotente do webhook. A autenticação aceita `X-PAPI-Webhook-Secret` quando `PAPI_WEBHOOK_SECRET` está configurado; como alternativas de integração, também aceita a assinatura geral do webhook ou a chave da API do Forte Panel.

O backend já executa as seguintes etapas:

1. Normalizar o evento para o contrato interno do Forte Panel.
2. Preservar `messageId`, `instanceId`, `fromMe`, tipo, mídia e metadados.
3. Aplicar idempotência antes de criar mensagem.
4. Fazer upsert de contato e conversa.
5. Gravar a mensagem uma única vez.
6. Não gerar evento para o n8n quando a mensagem tiver `fromMe=true`.
7. Registrar mensagens do proprietário como saída humana, sem aumentar não lidas.
8. Aplicar o controle humano no despacho:
   - mensagem do proprietário (`fromMe=true`): já grava e não chama n8n;
   - IA pausada: o evento é consumido sem envio ao n8n;
   - IA ativa: o evento é enviado ao n8n.

O filtro de IA pausada versus IA ativa agora ocorre no worker de eventos de domínio, antes da chamada ao webhook do n8n. A entrada, a persistência e a proteção contra mensagens do proprietário estão preparadas.

### Associação da instância e configuração do webhook — concluído

Em **Canais conectados**, o administrador pode criar vários webhooks PAPI, cada um com nome, `instanceId`, URL individual e segredo próprio. A URL individual identifica a instância mesmo quando o payload não traz `instanceId`; o header opcional `X-PAPI-Webhook-Secret` também é aceito. Os registros ficam em `workspaceSettings`, sem migration adicional. O webhook marcado como padrão fornece apenas o fallback de `instanceId` para envios sem instância explícita; o envio continua direto aos endpoints PAPI (`send-text`, `send-buttons` etc.), nunca pelo webhook.

Quando PAPI e Panel estão na mesma rede Docker, a URL padrão é:

```text
http://forte-panel:3000/api/v1/webhooks/providers/papi/<id-do-webhook>
```

Para PAPI fora da rede Docker, defina `PANEL_PUBLIC_URL` ou `PAPI_WEBHOOK_URL` com uma URL HTTPS acessível pelo provedor antes de copiar a URL na tela.

## Etapas seguintes

### Node comunitário de entrada — concluído na versão 0.6.0

O pacote agora fornece o **Forte Panel — Receber evento**. Ele cria um webhook POST no n8n no caminho `forte-panel-event` e entrega o evento já normalizado pelo Panel. O node não acessa PAPI nem banco de dados e preserva headers, query e parâmetros em `_fortePanel`.

Para ativá-lo, configure `N8N_EVENTS_WEBHOOK_URL` com a URL de produção do node e, se desejar assinatura HMAC, configure `N8N_WEBHOOK_SECRET`.

### Node comunitário de saída

Implementado na versão **0.7.0** como **Forte Panel — Enviar mensagens**. O node recebe uma lista de até 50 mensagens e chama `/api/v1/messages/batch`. O loop, a idempotência, o registro individual e o envio pelo worker ficam no Forte Panel.

### Deduplicação

Implementada na migration `drizzle/0007_dedupe_contacts_conversations.sql`. Ela escolhe o menor ID como registro canônico, move notas, mensagens, agendamentos, orçamentos, auditoria e eventos, soma os contadores e remove os registros repetidos dentro de uma transação.

Também foi adicionado índice único para uma conversa por contato. Os caminhos inbound, outbound e upsert agora usam `onConflictDoNothing` para suportar duas mensagens simultâneas sem criar contato ou conversa duplicados.

Antes de subir a nova versão, faça backup do banco e execute as migrations normais da aplicação. A migration não apaga dados de mensagens: ela apenas move as referências para o registro canônico.

### Debounce

Implementado no worker do Forte Panel. O worker aguarda o período de silêncio configurado antes de entregar `message.received` ao n8n. Mensagens que chegam juntas são agrupadas em `payload.messages` e também ficam disponíveis como um único `payload.content` separado por quebra de linha. A configuração padrão é de 1.500 ms:

```env
N8N_DEBOUNCE_MS=1500
```

O valor aceito vai de `0` a `30000` ms. O evento mais novo é o responsável pelo disparo; eventos anteriores são encerrados como `debounced_by_newer_message`, evitando chamadas duplicadas ao n8n.

### PAPI Cloud e WABA

A primeira implementação será para o adapter PAPI atualmente usado. Depois será feita a adaptação para PAPI Cloud e, por último, Meta WABA, usando o mesmo contrato interno.

## Decisões importantes

- Não remover o AI Agent nesta fase.
- Não mover o debounce antes de validar o caminho completo.
- Não apagar dados existentes ao corrigir o compose ou reinstalar o community node.
- Não depender de um endpoint de histórico completo não documentado pela PAPI Cloud; o histórico recebido por webhook será persistido no Panel e a sincronização inicial será tratada separadamente.

## Critérios de aceite

- Uma mensagem recebida cria ou atualiza exatamente um contato.
- Um contato possui exatamente uma conversa ativa.
- Controle humano impede o disparo ao n8n.
- Controle de IA dispara somente um evento idempotente ao n8n.
- O n8n envia uma lista de respostas para um único node comunitário.
- O Forte Panel registra e envia cada item sem duplicar mensagens.
- A tela de Atendimento não cresce indefinidamente; somente o chat rola.


## Decisão arquitetural — desenvolvimento local agora, PAPI Cloud depois

A stack continuará sendo desenvolvida e validada localmente em Docker. A PAPI self-hosted não será removida nesta etapa. O alvo de produção é uma VPS Oracle Cloud, inicialmente usando o Always Free quando houver capacidade e compatibilidade ARM64, com PostgreSQL mantido como banco principal do Forte Panel.

A PAPI Cloud será adotada posteriormente para retirar da VPS os containers `pastorini_api`, `postgres_papi`, `redis_papi`, sessões e mídia da PAPI. A migração será reversível: o adapter self-hosted permanece disponível até os testes de envio, webhook, múltiplas instâncias, mídia, retry e reconexão serem aprovados.

### Contrato futuro PAPI Cloud

A PAPI Cloud possui dois níveis de credencial e eles não podem ser misturados:

- **Token SaaS de perfil** (`x-panel-token`): administra instâncias, cria/remove instâncias, recupera ou rotaciona API keys.
- **API key da instância**: envia mensagens e consulta status/configuração nos endpoints `https://api.papi.api.br/api/instances/{id}`.

O token SaaS ficará exclusivamente no backend. A API key da instância será armazenada criptografada e vinculada a `workspaceId` + instância. O frontend receberá somente status, nome, identificador mascarado e últimos erros.

A URL Cloud documentada para administração é `https://papi.api.br/api/v1`; a URL de operação da instância é `https://api.papi.api.br/api/instances/{id}`. Essa distinção deve permanecer explícita no adapter e na configuração.

### Modelo de dados alvo

```text
workspace
  └── whatsappChannel
       └── providerDeployment (papi_self_hosted | papi_cloud | meta_cloud_api)
            ├── instanceId
            ├── encryptedInstanceApiKey
            ├── webhookId
            ├── status
            ├── active/default
            └── lastHealthError
```

A implementação atual usa settings para alguns webhooks; a próxima refatoração deve migrar credenciais e instâncias para entidades próprias, com índices e ownership por workspace. Não haverá credencial global compartilhada entre clientes.

### Próximo passo em execução

1. Isolar o adapter PAPI do restante do worker e tornar base URL, autenticação e endpoint configuráveis.
2. Preservar `instanceId` da entrada até o outbound.
3. Adicionar contrato de health/status por instância.
4. Preparar a tabela/entidade de credenciais por canal sem preencher token Cloud no frontend.
5. Manter a self-hosted como default de desenvolvimento.
6. Adicionar testes de contrato para as duas bases: self-hosted e Cloud.

### Critérios antes de ligar PAPI Cloud

- Confirmar com a PAPI o formato completo do payload de webhook.
- Confirmar assinatura/segredo de webhook e proteção contra replay.
- Confirmar retry, timeout, limite de rate e SLA aplicável ao plano.
- Confirmar se todos os endpoints usados pelo Panel aceitam `x-api-key` de instância.
- Testar texto, imagem, áudio, documento, botão, status e mensagens `fromMe`.
- Testar duas instâncias Cloud no mesmo workspace e dois workspaces separados.
- Testar rotação de API key sem expor a chave antiga.
- Validar ARM64 da aplicação local antes do deploy Oracle.

### Regras preservadas

- O login administrativo/proprietário único não será substituído.
- PostgreSQL continuará sendo o banco principal.
- Nenhum banco ou volume será apagado durante a migração.
- O desenvolvimento local continuará usando Docker.
- A PAPI Cloud só será ativada por configuração explícita e reversível.
