# Plano de evolução do Forte Panel como intermediador

Atualizado em **25/09/2026**.

## Objetivo

Transformar o Forte Panel no intermediador central entre os provedores de WhatsApp, o n8n e a operação humana:

```text
Provedor WhatsApp → Forte Panel → n8n → Forte Panel → Provedor WhatsApp
```

O Forte Panel será responsável por contato, conversa, histórico, idempotência, controle humano e envio. O n8n continuará, inicialmente, com interpretação da mensagem, IA e montagem da resposta.

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
POST /api/v1/webhooks/providers/papi
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

Permanece no n8n por enquanto. Depois que a entrada e saída estiverem estáveis, será avaliado o debounce no Forte Panel.

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
