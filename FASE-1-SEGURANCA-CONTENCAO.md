# Fase 1 — Segurança e contenção

**Implementada em:** 2026-09-25  
**Projeto:** Forte Panel  
**Escopo:** sessões, membros desativados, webhooks PAPI, storage proxy, segredos de ambiente, Docker, Redis, imagem e CI.

## O que foi implementado

### Sessões

- O JWT agora tem validade padrão de **8 horas**, em vez de um ano.
- O token carrega `sessionVersion`.
- A tabela `users` ganhou `sessionVersion integer NOT NULL DEFAULT 0`.
- A autenticação compara a versão do token com a versão atual no banco.
- Trocar a senha revoga sessões anteriores.
- Desativar um membro incrementa a versão e revoga imediatamente os tokens dele.
- O cookie continua `HttpOnly`, `SameSite` e `Secure` quando a requisição é HTTPS.

### Membros desativados

Foi colocado um bloqueio no middleware de todas as rotas `protectedProcedure`. Um usuário com membership inativa não consegue continuar usando as rotas protegidas mesmo que tenha um JWT ainda não expirado.

### Webhooks PAPI

- Toda URL de webhook agora exige pelo menos uma destas autenticações:
  - `X-PAPI-Webhook-Secret`;
  - assinatura HMAC válida;
  - API key válida.
- O UUID na URL não é mais aceito como único segredo.
- Segredos existentes são mascarados na listagem.
- Um segredo novo é exibido somente na resposta da criação e na interface imediatamente após criar o webhook.
- Para substituir um segredo antigo, remova o webhook e crie outro.

**Header esperado:**

```http
X-PAPI-Webhook-Secret: <segredo-do-webhook>
```

A PAPI deve ser configurada para enviar esse header. Se a versão da PAPI não suportar headers customizados, use a autenticação HMAC/API key suportada pela instalação; não reative o comportamento antigo de URL sem autenticação.

### Storage proxy

`/manus-storage/*` agora exige sessão autenticada antes de solicitar URL assinada. Também rejeita chaves vazias, longas demais, com `..`, barra inicial ou quebra de linha.

Isso pode bloquear links antigos que eram públicos. Essa mudança é intencional: arquivos privados não devem ser obtidos apenas conhecendo o caminho.

### Docker e Redis

- `forte-panel` e `forte-panel-worker` não usam mais `:latest`; o Compose exige `FORTE_PANEL_IMAGE` explícita.
- Portas do PAPI e Panel foram vinculadas a `127.0.0.1`, evitando exposição direta na rede externa. Um reverse proxy deve ser o ponto público.
- Redis do Panel exige `REDIS_PANEL_PASSWORD`.
- Redis da PAPI exige `PAPI_REDIS_PASSWORD`.
- URLs internas do Panel incluem senha do Redis.
- Healthcheck do Redis do Panel usa autenticação.
- A imagem runtime roda como usuário não-root `forte` (UID 10001).

### CI

O workflow `.github/workflows/publish-image.yml` agora precisa passar por:

1. instalação congelada (`pnpm install --frozen-lockfile`);
2. typecheck;
3. testes;
4. build de produção;
5. verificação simples contra atribuições de segredos rastreados;
6. somente depois o build/push da imagem.

O Compose de produção deve apontar para tag imutável ou digest, por exemplo:

```env
FORTE_PANEL_IMAGE=ghcr.io/geordptoroy/forte-panel:sha-<commit>
```

## Migration

Foi criada:

```text
drizzle-pg/0011_session_version.sql
```

Ela adiciona:

```sql
ALTER TABLE "users" ADD COLUMN "sessionVersion" integer DEFAULT 0 NOT NULL;
```

A migration está registrada no journal do Drizzle.

## Variáveis novas obrigatórias

Adicione ao `.env` usado pelo Docker Compose — não ao Git:

```env
FORTE_PANEL_IMAGE=ghcr.io/geordptoroy/forte-panel:sha-<commit>
REDIS_PANEL_PASSWORD=<senha-aleatoria-forte>
PAPI_REDIS_PASSWORD=<senha-aleatoria-forte>
```

Gere valores seguros, por exemplo no WSL:

```bash
openssl rand -hex 32
```

Cada variável deve usar um valor diferente. Não reutilize `JWT_SECRET`, senha PostgreSQL ou segredo de webhook como senha Redis.

## Procedimento de atualização no WSL

### 1. Fazer backup do banco antes da migration

```bash
docker exec postgres_panel pg_dump \
  -U forte_panel -d forte_panel \
  -Fc -f /tmp/forte-panel-before-security.dump

docker cp postgres_panel:/tmp/forte-panel-before-security.dump \
  ./backup/forte-panel-before-security.dump
```

Confirme que o arquivo de backup existe antes de continuar.

### 2. Atualizar o repositório

```bash
git pull --ff-only origin main
```

### 3. Preencher o `.env`

Use o arquivo `.env.stack.example` ou `.env.forte-panel-papi.example` como referência, mas mantenha o arquivo real fora do Git:

```bash
cp .env.stack.example .env
# edite .env e substitua todos os placeholders
chmod 600 .env
```

Não copie valores reais antigos automaticamente. Rotacione os segredos.

### 4. Validar o Compose sem subir serviços

```bash
docker compose --env-file .env -f docker-compose.yaml config >/tmp/forte-panel-compose.rendered.yaml
```

Verifique especialmente:

```bash
rg -n 'latest|PASSWORD: ""|JWT_SECRET: ""|FORTE_PANEL_IMAGE|REDIS_PANEL_PASSWORD' \
  /tmp/forte-panel-compose.rendered.yaml
```

O resultado renderizado não deve conter `latest`, senha vazia ou placeholder.

### 5. Baixar e subir a imagem imutável

```bash
docker compose --env-file .env -f docker-compose.yaml pull forte-panel forte-panel-worker

docker compose --env-file .env -f docker-compose.yaml up -d \
  postgres_panel redis_panel postgres_papi redis_papi pastorini_api

docker compose --env-file .env -f docker-compose.yaml up -d \
  forte-panel forte-panel-worker
```

### 6. Verificar migration e saúde

```bash
docker compose --env-file .env -f docker-compose.yaml ps
docker compose --env-file .env -f docker-compose.yaml logs --tail=200 forte-panel

docker compose --env-file .env -f docker-compose.yaml logs --tail=200 forte-panel-worker
```

Teste login, logout, uma rota protegida, storage autenticado e um webhook PAPI com header correto. Teste também que um webhook sem header retorna `401` ou `403`.

## Rotação obrigatória de segredos

A implementação não consegue invalidar credenciais que já foram copiadas. Antes de produção, rotacione:

- `JWT_SECRET`;
- `LOCAL_ADMIN_PASSWORD`;
- `PANEL_POSTGRES_PASSWORD`;
- `PAPI_POSTGRES_PASSWORD`;
- `PAPI_API_KEY`;
- `PAPI_WEBHOOK_SECRET`;
- `WEBHOOK_SIGNING_SECRET`;
- `BUILT_IN_FORGE_API_KEY`;
- `META_WHATSAPP_ACCESS_TOKEN`;
- segredos individuais dos webhooks PAPI.

Depois da rotação, recrie webhooks PAPI para emitir segredos individuais novos e configure o header em cada instância.

## Compatibilidade e impactos conhecidos

1. **Webhooks antigos sem header deixam de funcionar.** Configure o header antes de trocar o tráfego.
2. **Sessões existentes podem expirar/rejeitar após a migration ou rotação.** Faça login novamente.
3. **Usuários desativados perdem acesso imediatamente.** Isso é esperado.
4. **Links públicos de storage antigos podem retornar 401.** Gere novos links dentro de uma sessão autenticada.
5. **Portas agora escutam em localhost.** Para acesso de outra máquina, use reverse proxy/TLS; não altere para `0.0.0.0` sem firewall.
6. **Redis exige senha.** Os serviços devem ser recriados para receber a nova configuração, mas os volumes não devem ser removidos.
7. **Não execute `docker compose down -v`.** Isso removeria volumes e dados.

## Verificações executadas nesta implementação

- `pnpm check`: passou.
- `pnpm test`: **39 testes passaram; 13 foram ignorados** por dependerem de banco/configuração.
- `pnpm build`: passou.
- `git diff --check`: passou.
- A validação `docker compose config` precisa ser executada no WSL do usuário porque o CLI Docker não está disponível neste sandbox.
- A migration está criada e registrada.
- Os dois Compose foram alinhados com imagem imutável, Redis protegido e portas locais.
- O pipeline passou a exigir validações antes do publish.

Ainda recomendado para a próxima etapa: testes de integração com PostgreSQL real, teste de concorrência de idempotência, scan de imagem e configuração de Row-Level Security/membership por workspace.
