# Teste local por imagem publicada — Forte Panel

**Objectivo:** testar a candidata localmente no Docker Desktop sem compilar imagens no PC.

**SHA da candidata no início deste procedimento:**

```text
06cc98e5ffeb5e6c1ca9c40e58cced8983488bfa
```

> **Estado:** este SHA passou o workflow autorizado `37149496087` e tem as duas imagens GHCR publicadas. Os comandos abaixo continuam fail-closed: verificam/puxam as imagens antes de apagar dados. Se a tag não existir, o reset é abortado.

## 1. Limites de acesso

O agente não tem acesso às pastas, `.env`, Docker Desktop ou credenciais do PC local. Os comandos devem ser executados pelo utilizador numa consola PowerShell na pasta do clone local.

O teste não usa WhatsApp real nem deve apagar uma sessão real. Use um ambiente local descartável e um número de teste somente se houver autorização específica.

## 2. Pré-requisitos no PC

```powershell
cd C:\caminho\para\forte-panel

git status --short --branch
docker info
docker compose version
```

O clone local precisa conter a versão candidata. Como o SHA acima ainda não foi enviado/publicado a partir desta sessão, `git fetch` no PC não o encontrará até existir um push autorizado ou até o repositório ser transferido por outro meio.

## 3. Configurar as imagens pinadas

No `.env` local, não no repositório, definir:

```dotenv
FORTE_PANEL_IMAGE=ghcr.io/geordptoroy/forte-panel:sha-06cc98e
FORTE_WHATSAPP_IMAGE=ghcr.io/geordptoroy/forte-whatsapp:sha-06cc98e
```

Confirmar que o `.env` contém também, com valores apenas locais:

```dotenv
NODE_ENV=production
DEMO_MODE=false
WORKSPACE_BOOTSTRAP_ENABLED=false
LOCAL_AUTH_ENABLED=true
LOCAL_ADMIN_EMAIL=admin@fortepanel.local
LOCAL_ADMIN_PASSWORD=<senha-local-forte>
JWT_SECRET=<segredo-local-forte>
PANEL_POSTGRES_PASSWORD=<senha-local-postgres>
BAILEYS_API_KEY=<chave-local-baileys>
BAILEYS_WEBHOOK_SECRET=<segredo-local-baileys>
BAILEYS_INSTANCE_ID=default
WHATSAPP_SESSION_ENCRYPTION_KEY=<32-bytes-em-base64-ou-hex-conforme-o-contrato-local>
```

Não copiar segredos de produção para este ficheiro.

## 4. Pré-verificar as imagens — antes do reset

```powershell
$ErrorActionPreference = "Stop"
$panelImage = "ghcr.io/geordptoroy/forte-panel:sha-06cc98e"
# O tag curto do Gateway deve usar exactamente o mesmo SHA do commit:
$whatsappImage = "ghcr.io/geordptoroy/forte-whatsapp:sha-06cc98e"

docker manifest inspect $panelImage
docker manifest inspect $whatsappImage
```

Se qualquer comando falhar com `manifest unknown`, **parar**. Não executar reset e não usar `:latest` para declarar teste deste SHA.

## 5. Reset recomendado — apenas da stack Forte Panel

Este é o reset suportado e preserva outros projectos Docker do PC:

```powershell
.\scripts\start-docker.ps1 `
  -ComposeFile docker-compose.local.yml `
  -EnvFile .env `
  -Reset `
  -ResetConfirmation APAGAR-TUDO
```

O script agora:

1. valida o Docker;
2. faz pull das imagens pinadas;
3. só se o pull passar, remove containers, volumes, redes e imagens da stack Forte Panel;
4. recria a stack sem build local;
5. mostra `docker compose ps`.

O reset elimina os dados locais do PostgreSQL, Redis e sessão/outbox Baileys da stack Forte Panel.

## 6. Reset global — usar somente se for mesmo intencional

O comando abaixo remove **containers parados, imagens não usadas, volumes não usados, redes não usadas e cache de build de todos os projectos Docker do PC**:

```powershell
$ErrorActionPreference = "Stop"
docker system prune --all --volumes --force
docker builder prune --all --force
```

Isto pode destruir dados de outros projectos. O agente recomenda o reset da stack da secção 5, mesmo que o Docker Desktop não tenha cartão configurado.

Depois do reset global, voltar à secção 4 e executar a secção 5 para puxar as imagens exactas.

## 7. Smoke local sem WhatsApp real

Depois de a stack estar saudável:

```powershell
docker compose --env-file .env --file docker-compose.local.yml ps
docker compose --env-file .env --file docker-compose.local.yml logs --no-color --tail=200 forte-panel forte-panel-worker forte-whatsapp

Invoke-WebRequest http://localhost:3002/api/v1/health
Invoke-WebRequest http://localhost:3002/api/v1/ready
Invoke-WebRequest http://localhost:3010/health
```

Critérios mínimos:

- Panel `/api/v1/health`: HTTP 200 e `status=ok`;
- Panel `/api/v1/ready`: HTTP 200 e `status=ready`;
- Gateway `/health`: HTTP 200;
- nenhum log com segredo, QR, cookie ou corpo de mensagem;
- `DEMO_MODE=false`;
- nenhum pareamento ou envio de WhatsApp sem autorização adicional.

## 8. Limpeza após o teste

Para parar sem apagar dados:

```powershell
docker compose --env-file .env --file docker-compose.local.yml down
```

Para apagar apenas os dados da execução descartável:

```powershell
.\scripts\start-docker.ps1 `
  -ComposeFile docker-compose.local.yml `
  -EnvFile .env `
  -Reset `
  -ResetConfirmation APAGAR-TUDO
```

## 9. Estado de publicação

- Commit publicado na branch candidata: `06cc98e5ffeb5e6c1ca9c40e58cced8983488bfa`.
- Workflow: `37149496087`.
- Gate de verificação: verde, sem testes skipped.
- Imagens Panel e Gateway: publicadas com tag `sha-06cc98e`.
- `main`: não alterada.

Se qualquer `docker manifest inspect` falhar no PC, parar antes do reset e confirmar autenticação/visibilidade do GHCR.
