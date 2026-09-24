# Teste local da stack Forte Panel

## Objetivo

Validar primeiro o fluxo existente `PAPI -> n8n -> AI Agent -> PAPI`, enquanto o Forte Panel recebe os eventos normalizados e vira a fonte de verdade do CRM. Nenhuma mensagem real será enviada pelo Panel no modo demo.

## Ajustes no compose enviado

Antes de subir a stack, remover os serviços `easyappointments-db`, `easyappointments`, `clientverse-db`, `clientverse-php-fpm`, `clientverse-nginx` e `clientverse-mailpit`, além dos volumes correspondentes. Eles não fazem mais parte do produto.

Remapear o PAPI para evitar colisão com o Forte Panel local:

```yaml
pastorini_api:
  ports:
    - "3001:3000"
```

O n8n continua acessando o PAPI pela rede Docker usando `http://pastorini_api:3000`. O Forte Panel rodando no host pode ser acessado pelo n8n através de `http://host.docker.internal:3000`; no Linux, adicionar ao serviço n8n:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

O repositório agora contém `docker-compose.local.yml`, que adiciona `postgres_panel`, `redis_panel` e `forte-panel`. O `postgres_panel` é um terceiro PostgreSQL, separado de `postgres_papi` e `postgres_n8n`; o painel não acessa nenhum dos bancos existentes. O serviço do painel usa a imagem `ghcr.io/geordptoroy/forte-panel:latest`, publicada automaticamente pelo GitHub Actions, aplica as migrations PostgreSQL ao iniciar e entra na mesma rede Docker do PAPI/n8n.

## Comandos

Copie o exemplo de variáveis e revise a rede do compose principal:

```bash
cp .env.local.example .env.local
```

Como o pacote GHCR do repositório é privado, faça login uma única vez na máquina que vai executar a stack:

```bash
echo "$GITHUB_TOKEN" | docker login ghcr.io -u geordptoroy --password-stdin
```

Coloque o repositório ao lado do seu `docker-compose.yaml` principal:

```bash
git clone https://github.com/geordptoroy/forte-panel.git forte-panel
```

Depois, na pasta que contém o `docker-compose.yaml` principal, suba **toda a stack com um único comando**:

```bash
docker compose -p forte-local \
  --env-file forte-panel/.env.local \
  -f docker-compose.yaml \
  -f forte-panel/docker-compose.local.yml \
  up -d
```

O segundo arquivo funciona como override: adiciona `postgres_panel`, `redis_panel` e `forte-panel` ao mesmo projeto Compose. Não é necessário executar um segundo `docker compose`.

Alternativamente, para desenvolver o frontend fora do container:

```bash
pnpm install
pnpm dev
```

O n8n ficará em `http://localhost:5678`, o PAPI em `http://localhost:3001` e o Panel em `http://localhost:3000`.

## Variáveis mínimas do Panel local

```env
DEMO_MODE=true
FORTE_API_KEY=teste-panel-local
PAPI_BASE_URL=http://localhost:3001
PAPI_API_KEY=teste123
N8N_BASE_URL=http://localhost:5678
N8N_EVENTS_WEBHOOK_URL=http://n8n:5678/webhook/forte-panel-events
N8N_WEBHOOK_SECRET=troque-este-segredo-do-webhook
```

Quando o n8n fizer HTTP Request para o Panel a partir do container, use `http://host.docker.internal:3000/api/v1`, não `localhost:3000`.

## Ordem do primeiro teste

1. Confirmar `GET /api/v1/health`.
2. Importar o workflow n8n enviado.
3. Manter os nós PAPI de entrada e saída para validar o comportamento atual.
4. Inserir uma chamada HTTP após `Limpeza` para `POST /api/v1/webhooks/inbound/whatsapp` com `eventId`, telefone, nome, conteúdo, tipo e data.
5. Confirmar no Inbox que o contato e a mensagem persistiram.
6. Substituir a ferramenta Clientverse por `contacts/upsert`, `contacts/:id/stage` e `messages` do Panel.
7. Configurar o webhook de eventos do n8n, repetir uma entrada e confirmar que o evento chega com `X-Forte-Event-Id` e `X-Forte-Signature`.
8. Responder o webhook com HTTP 2xx e verificar no log do worker que a entrega foi concluída; respostas 4xx/5xx devem permanecer no outbox para retry com backoff.
9. Só depois validar a troca de canal para Meta Cloud API em um workspace separado e com credenciais próprias.

## Limites importantes

O PAPI e a Meta Cloud API devem ser tratados como canais alternativos. Não conectar o mesmo número aos dois ao mesmo tempo. A Meta Cloud API também exige configuração de aplicativo, WABA, Phone Number ID, token permanente e endpoint HTTPS para webhooks; por isso ela não é o primeiro teste local.
