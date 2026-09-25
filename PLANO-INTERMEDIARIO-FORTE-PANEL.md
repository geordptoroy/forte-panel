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

## Próxima etapa em implementação

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
8. Preservar a decisão de controle humano para a próxima etapa de despacho:
   - mensagem do proprietário (`fromMe=true`): já grava e não chama n8n;
   - IA pausada: será filtrada antes do disparo ao n8n;
   - IA ativa: será disparada ao n8n.

O filtro de IA pausada versus IA ativa ainda depende da etapa de despacho do evento de domínio, que será conectada ao Trigger comunitário na próxima fase. A entrada, a persistência e a proteção contra mensagens do proprietário já estão preparadas.

## Etapas seguintes

### Node comunitário de entrada

Criar o **Forte Panel Trigger** para entregar ao n8n o evento já normalizado pelo Panel. O n8n não deverá mais conhecer o payload bruto da PAPI.

### Node comunitário de saída

Criar o **Forte Panel Send** para receber uma lista de mensagens e enviar o lote ao Panel. O loop, a idempotência e o registro individual ficarão no backend.

### Deduplicação

- Consolidar contatos já duplicados por workspace e telefone.
- Consolidar conversas repetidas do mesmo contato.
- Garantir upsert transacional.
- Adicionar proteção única para conversa por contato, depois de uma migration segura dos dados atuais.

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
