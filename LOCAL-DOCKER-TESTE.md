# Teste local do Forte Panel com Docker

Este fluxo usa `docker-compose.yml` como Compose local principal, com PostgreSQL 16, Redis 7, painel, worker e gateway WhatsApp. `docker-compose.local.yml` permanece compatível para quem preferir selecionar o nome explícito. O banco e os volumes ficam isolados na rede Docker; as migrations são executadas pelo container do painel com `RUN_MIGRATIONS=true`.

## Pré-requisitos

- Docker Engine em execução.
- Docker Compose v2 (`docker compose version`).
- Acesso ao GitHub Container Registry para baixar as imagens `ghcr.io/geordptoroy/*`.

## Fluxo recomendado — sem apagar dados

Na raiz do repositório:

```bash
./scripts/docker-up-local.sh
```

Na primeira execução o script cria `.env` a partir de `.env.docker.example`, gera segredos locais aleatórios e preserva o arquivo com permissão `600`. Não faça commit de `.env`.

Acesse:

```text
http://localhost:3002
```

O e-mail do administrador local é `admin@fortepanel.local`. A senha aleatória é exibida somente no primeiro comando e permanece em `.env`.

Comandos úteis:

```bash
# acompanhar painel e worker
docker compose --env-file .env -f docker-compose.yml logs -f forte-panel forte-panel-worker

# status
docker compose --env-file .env -f docker-compose.yml ps

# parar sem apagar banco, Redis ou sessões WhatsApp
docker compose --env-file .env -f docker-compose.yml stop

# iniciar novamente sem baixar imagens
FORTE_PULL=0 ./scripts/docker-up-local.sh

# remover containers, mas preservar volumes
docker compose --env-file .env -f docker-compose.yml down
```

> O painel aplica migrations automaticamente na inicialização. Não use `db:push` para substituir migrations versionadas.

## Rate limit do login local

O login usa bloqueio progressivo por IP e e-mail, dentro de uma janela padrão de 15 minutos:

| Falhas acumuladas | Bloqueio padrão |
|---:|---:|
| 5 | 1 minuto |
| 10 | 3 minutos |
| 15 | 15 minutos |

Os valores são configuráveis no `.env` em milissegundos (`FORTE_LOGIN_RATE_LIMIT_*`). Depois de editar o `.env`, recrie o painel para carregar a configuração:

```powershell
docker compose --env-file .env -f docker-compose.yml up -d --force-recreate forte-panel
```

## Testar a publicação versionada

Depois de entrar no painel e completar/confirmar os quatro blocos obrigatórios:

1. Confirmar `identity`, `offering`, `operations` e `guardrails`.
2. Publicar o onboarding.
3. Verificar a versão publicada no histórico.
4. Alterar o draft.
5. Publicar novamente e confirmar a versão incremental.
6. Usar rollback em uma versão anterior e confirmar que o rollback cria uma nova versão.

Para executar os testes PostgreSQL diretamente contra o banco do Compose:

```bash
set -a; source .env; set +a
export DATABASE_URL="postgresql://${PANEL_POSTGRES_USER}:${PANEL_POSTGRES_PASSWORD}@localhost:${PANEL_POSTGRES_PORT:-5432}/${PANEL_POSTGRES_DB}"
DEMO_MODE=false pnpm test -- server/onboarding-publish.test.ts
DEMO_MODE=false pnpm test
```

O Compose local publica PostgreSQL somente em `127.0.0.1` e permite trocar a porta com `PANEL_POSTGRES_PORT`. Não exponha PostgreSQL publicamente.

## Reset total e destrutivo do Docker

O reset abaixo remove dados Docker globais não utilizados na máquina, incluindo volumes do Compose local, imagens, redes e cache de build. Isso apaga o PostgreSQL, Redis e sessões WhatsApp locais. Pode afetar outros projetos Docker parados/não utilizados.

```bash
FORTE_DOCKER_RESET_CONFIRM=APAGAR-TUDO ./scripts/docker-reset-all-local.sh
```

O script exige o token de confirmação e não deve ser executado automaticamente. Ele não desinstala o Docker e não apaga arquivos fora do armazenamento Docker.

Depois do reset, baixar e reinstalar a stack:

```bash
./scripts/docker-up-local.sh
```

Para forçar a reconstrução/atualização das imagens publicadas:

```bash
FORTE_PULL=1 ./scripts/docker-up-local.sh
```

## Diagnóstico de espaço

```bash
docker system df
docker system df -v
```

Para liberar apenas itens não utilizados, sem remover explicitamente os volumes do Compose:

```bash
docker system prune
```

Não use `--volumes` nessa limpeza moderada se quiser preservar dados locais.

## Limpeza documental

- `.env.docker.example`: variáveis esperadas sem segredos reais.
- `scripts/docker-init-local.sh`: cria `.env` local sem sobrescrever existente.
- `scripts/docker-up-local.sh`: baixa imagens, sobe a stack e deixa migrations automáticas rodarem.
- `scripts/docker-reset-all-local.sh`: reset global destrutivo com confirmação explícita.
