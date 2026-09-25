# Forte Panel como uma única AI Tool no n8n

## Decisão

O agente deve ter uma única tool chamada **Forte Panel**. Ela substitui a antiga tool do CRM e a tool da agenda. A tool não acessa bancos internos: chama exclusivamente `/api/v1` com `Authorization: Bearer` e usa idempotência nas mutações.

O pacote está em `packages/n8n-nodes-forte-panel` e já compila com `npm run build`.

## Teste local sem publicar no npm

Na máquina que executa o n8n, dentro do pacote:

```bash
npm install
npm run build
npm pack
```

Isso gera `n8n-nodes-forte-panel-0.1.0.tgz`. Instale o tarball no ambiente do n8n conforme a forma de execução:

```bash
npm install ./n8n-nodes-forte-panel-0.1.0.tgz
```

Em Docker, a instalação deve ocorrer em uma imagem customizada do n8n ou no diretório de community nodes persistido por volume. Depois da instalação, reinicie o n8n para que o node apareça.

### Imagem Docker recomendada

A imagem `infra/n8n/Dockerfile` já instala o pacote compilado. A partir da raiz deste repositório:

```bash
docker build -f infra/n8n/Dockerfile -t forte-n8n:local .
```

No serviço `n8n` do seu `docker-compose.yml`, troque a imagem por `forte-n8n:local` e adicione:

```yaml
environment:
  N8N_CUSTOM_EXTENSIONS: /opt/n8n-custom-nodes/node_modules/n8n-nodes-forte-panel
  N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE: "true"
```

Depois recrie somente o n8n:

```bash
docker compose up -d --no-deps --force-recreate n8n
docker compose logs -f n8n
```

Se o n8n estiver em outro diretório, faça o build apontando o contexto para a cópia local do repositório Forte Panel. O pacote não deve ser instalado no container `forte-panel`; ele é um plugin do container n8n.

## Configuração no workflow

### Trigger de entrada do Forte Panel

O pacote também fornece o node **Forte Panel — Receber evento**. Ele cria um webhook POST do n8n e entrega ao fluxo o evento já normalizado pelo Forte Panel.

No n8n, depois de adicionar o node e ativar o workflow, copie a URL de produção exibida pelo node e configure no Forte Panel:

```env
N8N_EVENTS_WEBHOOK_URL=https://seu-n8n/webhook/forte-panel-event
N8N_WEBHOOK_SECRET=um-segredo-compartilhado
```

O Forte Panel enviará `X-Forte-Signature`, `X-Forte-Event-Id` e `Idempotency-Key`. O payload entregue ao fluxo terá `event`, `eventId`, `workspaceId`, `aggregateType`, `aggregateId`, `payload` e `occurredAt`. O node também preserva headers, query e parâmetros em `_fortePanel` para diagnóstico.

Mensagens com controle humano ativo não devem ser despachadas para esse webhook. Mensagens recebidas com `fromMe=true` também são registradas como saída humana e não devem retornar ao agente.

### Envio de lote pelo Forte Panel

O node **Forte Panel — Enviar mensagens** substitui o loop de nodes HTTP do n8n. Ele recebe uma lista de até 50 objetos e chama:

```text
POST /api/v1/messages/batch
```

O Panel registra cada item como mensagem outbound, aplica idempotência do lote e deixa o worker enviar pela PAPI. Um item pode informar `phone`, `contactId`, `content`, `messageType`, `metadata`, `provider` e `instanceId`. Os valores padrão podem ser definidos no próprio node.

## Deduplicação de contatos e conversas

Antes de atualizar a aplicação, faça backup do PostgreSQL. A migration `drizzle/0007_dedupe_contacts_conversations.sql` consolida contatos pelo par workspace + telefone, move as referências relacionadas e consolida conversas pelo contato. Depois dela, o banco impede mais de uma conversa para o mesmo contato.

Em ambientes que executam migrations pelo Drizzle, use o comando de migration já adotado pela stack. Em execução manual, rode o SQL dentro de uma transação no banco correto:

```bash
psql "$DATABASE_URL" -f drizzle/0007_dedupe_contacts_conversations.sql
```

1. Importe `infra/n8n/forte-panel-workflow.json` (gerado a partir do export original já fornecido).
2. Crie a credencial **Forte Panel API** para o node AI Tool, com Base URL `http://forte-panel:3000/api/v1` e a mesma chave configurada em `FORTE_API_KEY` no servidor.
3. Nos cinco nodes **HTTP Request** adicionados/substituídos para a API, associe uma credencial **HTTP Bearer Auth** com o mesmo valor de `FORTE_API_KEY`.
4. O fluxo repassa `instanceId` de cada mensagem recebida; configure `PAPI_INSTANCE_ID` no servidor apenas como fallback para mensagens manuais originadas no próprio painel.
5. O workflow grava eventos inbound no Forte Panel antes de chamar o AI Agent. A `Lead Memory Tool` antiga foi removida; mantenha a conexão única do node **Forte Panel** no conector `Tools`.
6. Os nodes de texto, áudio e botões enfileiram pela API do Panel. O status `queued` indica aceite da fila, não entrega final.
7. Após importar, valide uma mensagem de texto em uma conversa de teste antes de habilitar a produção; depois teste áudio PTT e botões com uma URL de mídia que seja acessível ao container PAPI.

## Descrição recomendada para o agente

```text
Use a tool Forte Panel como única fonte de verdade do CRM e da agenda.
Nunca use Clientverse, Easy!Appointments, tabelas internas do n8n ou bancos do PAPI.

Para um lead, use buscar_lead antes de criar ou atualizar quando o telefone ainda não estiver identificado.
Use criar_lead ou atualizar_lead para persistir dados estruturados; use registrar_nota para observações internas.
Consulte availability antes de propor horários e use create_appointment somente depois da confirmação explícita do cliente.
Para cancelamento ou reagendamento, confirme a intenção e use a ação correspondente.
Use published_prompt para carregar as regras publicadas da empresa.
Use queue_message para enviar uma mensagem somente quando a resposta estiver pronta; status queued significa aceito pela fila, não entregue.
Não invente preço, disponibilidade, política ou confirmação.
``` 

## Limites do worker

Atualmente o worker suporta texto, áudio (PTT) e botões na PAPI. Imagem, vídeo e documento podem ser recebidos e armazenados no histórico; o envio outbound desses tipos ainda não é exposto pela API do worker. A Meta Cloud API também está limitada a texto nesta implementação.
