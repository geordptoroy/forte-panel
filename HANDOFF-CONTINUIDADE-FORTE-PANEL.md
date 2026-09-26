# Handoff de continuidade — Forte Panel

**Data do handoff:** 2026-09-25 21:02 (America/Sao_Paulo)
**Repositório:** `geordptoroy/forte-panel`
**Branch:** `main`
**HEAD atual:** `d026f05`
**Remote:** `https://github.com/geordptoroy/forte-panel.git`
**Usuário precisa poder entregar esta conversa a outra IA sem repetir contexto.**

---

## 1. Contexto do produto

O Forte Panel é um CRM/atendimento WhatsApp com:

- painel web em TypeScript/React;
- backend Express + tRPC;
- PostgreSQL com Drizzle;
- Redis;
- worker separado para mensagens/eventos;
- agente nativo conectado a provedores LLM;
- integração PAPI WhatsApp self-hosted hoje;
- integração futura PAPI Cloud;
- integração n8n e Meta prevista;
- login administrativo/proprietário único que deve ser preservado.

Decisão do usuário: continuar desenvolvendo localmente no Docker/WSL, mas estruturar o código para virar produto comercial hospedado posteriormente, inicialmente com Oracle Cloud Free Tier. PostgreSQL continua sendo o banco principal. PAPI Cloud será provider futuro reversível; self-hosted continua como padrão local.

**Não alterar o login administrativo/proprietário único sem pedido explícito.**

---

## 2. O que o usuário pediu nesta fase

O usuário pediu:

1. revisar a auditoria técnica completa;
2. unir a auditoria ao plano PAPI Cloud;
3. implementar as melhorias, não apenas documentá-las;
4. pular por enquanto o smoke test manual da PAPI Cloud;
5. continuar o desenvolvimento sem exigir ações manuais do usuário;
6. documentar tudo para que outra IA possa continuar.

Portanto, **não solicitar novamente smoke test agora**. O token Cloud ainda não está configurado e nenhuma instância Cloud deve ser criada neste momento.

---

## 3. Estado atual do Git

Commits recentes, do mais antigo para o atual:

```text
0651111 feat(integrations): prepare reversible papi cloud provider
c8f3111 feat(papi): persist instances per workspace
249c8fd feat(papi): connect channels UI to persisted instances
5e377bf feat(papi-cloud): add guarded instance provisioning
68e42cf docs: unify audit roadmap with papi cloud plan
3e6a311 fix(agent): preserve instance routing and bound llm latency
34259a3 feat(worker): add expiring domain event leases
b2fbd76 fix(api): claim idempotency keys atomically
dd34c28 feat(agent): add idempotent tool effect ledger
d026f05 docs: preserve full handoff history
```

No momento do handoff:

- branch `main` está sincronizada com `origin/main`;
- working tree estava limpo após o commit `b2fbd76`;
- não fazer reset, rebase destrutivo ou apagar volumes.

---

## 4. Arquivos de documentação importantes

- `AUDITORIA-TECNICA-E-ROADMAP.md` — auditoria completa, riscos P1/P2 e critério comercial.
- `PLANO-INTERMEDIARIO-FORTE-PANEL.md` — plano vivo, já unificado com PAPI Cloud e etapas concluídas.
- `FASE-1-SEGURANCA-CONTENCAO.md` — reforços da Fase 1 de segurança.
- `API_CONTRACT.md` — contrato da API.
- `infra/LOCAL_TEST.md` — execução local.
- `docker-compose.yaml` — Compose principal.
- `docker-compose.forte-panel-papi.yaml` — Compose alternativo Panel + PAPI.

Este documento é o handoff operacional. Ler primeiro este arquivo, depois o plano e a auditoria.

---

## 5. O que já foi implementado

### 5.1 Segurança e contenção

Já foram aplicados anteriormente:

- versão revogável de sessão;
- TTL de sessão menor;
- invalidação de sessões após alterações sensíveis;
- bloqueio de membros desativados em rotas protegidas relevantes;
- storage proxy com autenticação e validação anti-traversal;
- segredos de webhook mascarados no frontend;
- comparação de segredo de webhook em tempo constante;
- Redis com senha no Compose;
- serviços internos sem publicação pública desnecessária;
- runtime Docker não-root;
- imagem/CI com gates básicos;
- remoção de credenciais utilizáveis de exemplos rastreados.

Ainda é necessário revisar historicamente segredos antigos e rotacionar todos os valores que tenham sido usados.

### 5.2 Instâncias PAPI persistentes

Foi criada a entidade `whatsappInstances`, com migration:

```text
drizzle-pg/0012_whatsapp_instances.sql
```

A instância tem, entre outros:

- workspace;
- `instanceId`;
- nome;
- deployment (`self_hosted` ou `cloud`);
- API key criptografada;
- webhook associado;
- status;
- ativo/inativo;
- instância padrão.

A API key persistida usa a criptografia existente de segredos do projeto.

A tela **Canais conectados** lista instâncias persistentes, mostra API key mascarada e permite selecionar instância padrão.

Webhooks antigos guardados em `workspaceSettings` sofrem backfill idempotente para `whatsappInstances`.

### 5.3 PAPI Cloud atrás de configuração explícita

Arquivo principal:

```text
server/integrations/papi-cloud.ts
```

Operações implementadas:

- criar instância Cloud;
- obter API key;
- rotacionar API key;
- configurar webhook;
- consultar status;
- remover instância durante rollback.

Rotas administrativas implementadas no router:

- status público da configuração Cloud;
- provisionamento Cloud;
- rotação de API key.

A criação Cloud faz:

```text
cria instância remota
→ obtém API key
→ cria webhook local
→ configura webhook remoto
→ salva instância e API key criptografada
```

Em erro, tenta remover webhook local e instância remota.

A Cloud continua desativada por padrão.

### 5.4 Roteamento correto por instanceId

O `instanceId` agora percorre o fluxo:

```text
webhook PAPI
→ metadata da mensagem
→ payload do evento message.received
→ NativeAgentEvent
→ metadata da resposta outbound
→ worker/API PAPI
```

Isso evita que a resposta do agente saia pela instância padrão errada quando a mensagem entrou por outra instância.

### 5.5 Timeout LLM

Chamadas LLM agora usam `AbortSignal.timeout`.

Variável:

```env
AGENT_LLM_TIMEOUT_MS=45000
```

Limites implementados:

- mínimo: 1 segundo;
- padrão: 45 segundos;
- máximo: 180 segundos.

### 5.6 Leases do worker

Migration:

```text
drizzle-pg/0013_domain_event_leases.sql
```

A tabela `domainEvents` recebeu:

- `workerId`;
- `claimedAt`;
- `leaseUntil`;
- índice de lease.

O worker agora:

- faz claim condicional de pending;
- pode recuperar processing apenas quando o lease expirou;
- usa identidade estável por processo;
- só finaliza/reagenda evento se ainda for proprietário;
- limpa lease ao finalizar.

Variáveis opcionais:

```env
WORKER_ID=forte-worker-1
EVENT_WORKER_LEASE_MS=120000
```

### 5.7 Claim atômico de idempotência HTTP

Migration:

```text
drizzle-pg/0014_api_idempotency_claim.sql
```

A tabela `apiIdempotency` recebeu:

- `status` (`processing`, `completed`, `failed`);
- `leaseUntil`;
- `updatedAt`.

O helper HTTP mutável agora usa:

```text
INSERT ... ON CONFLICT DO NOTHING
```

Apenas o request que faz o claim executa o efeito. Requisições concorrentes recebem:

```http
409 Conflict
Retry-After: 2
```

Com erro:

```json
{
  "error": "idempotency_in_progress"
}
```

Ao terminar, o body/status é salvo e uma repetição pode reproduzir o resultado.

Se o processo morrer, o lease expira e a próxima tentativa pode reassumir.

---

## 6. Migrations que precisam existir no banco

As migrations recentes são:

```text
0011_session_version.sql
0012_whatsapp_instances.sql
0013_domain_event_leases.sql
0014_api_idempotency_claim.sql
```

No ambiente local, aplicar pelo fluxo do projeto:

```bash
pnpm db:push
```

Depois recriar apenas os serviços necessários:

```bash
docker compose up -d --force-recreate forte-panel forte-panel-worker
```

Nunca usar para esta atualização:

```bash
docker compose down -v
```

Isso pode remover volumes e dados.

---

## 7. Configuração de ambiente

### Self-hosted local, configuração esperada

```env
PAPI_DEPLOYMENT=self_hosted
PAPI_CLOUD_PROVISIONING_ENABLED=false
```

### Cloud futura, ainda não ativar

```env
PAPI_DEPLOYMENT=cloud
PAPI_CLOUD_PROVISIONING_ENABLED=true
PAPI_CLOUD_PANEL_TOKEN=token-do-backend
```

URLs documentadas:

```env
PAPI_CLOUD_API_URL=https://api.papi.api.br
PAPI_CLOUD_MANAGEMENT_URL=https://papi.api.br
```

O token Cloud não está configurado na sandbox atual. Não pedir para o usuário colar o token no chat; ele deve configurar diretamente no `.env`/secret manager.

### Variáveis do worker

```env
WORKER_ID=forte-worker-1
EVENT_WORKER_LEASE_MS=120000
AGENT_LLM_TIMEOUT_MS=45000
```

### Segredos obrigatórios do Compose

O Compose exige, entre outros:

```env
PAPI_POSTGRES_PASSWORD=...
PAPI_LICENSE_KEY=...
PAPI_API_KEY=...
PAPI_WEBHOOK_SECRET=...
FORTE_API_KEY=...
PAPI_REDIS_PASSWORD=...
```

Os arquivos `.env.stack.example` e `.env.forte-panel-papi.example` são exemplos. Não inserir credenciais reais neles.

---

## 8. Validações já executadas

Nos últimos commits, passaram repetidamente:

```bash
pnpm check
pnpm test
pnpm build
git diff --check
```

Resultado típico atual:

```text
39 testes aprovados
13 testes ignorados por dependências externas
TypeScript passou
Build passou
```

Os testes ignorados incluem suites que dependem de banco/configuração externa. Ainda não existe suíte PostgreSQL real de concorrência.

Warnings conhecidos:

- pnpm informa configuração antiga no campo `pnpm` do package.json;
- Vite avisa que o bundle inicial ultrapassa 500 kB.

Esses warnings são roadmap, não bloquearam o build.

---

## 9. Smoke test PAPI Cloud

O usuário decidiu **adiar o smoke test manual**.

Não fazer agora:

- criar instância Cloud;
- configurar token Cloud;
- trocar `PAPI_DEPLOYMENT` para `cloud`;
- executar chamadas externas na PAPI.

Quando o usuário liberar essa etapa no futuro, o teste deve validar:

1. criação de instância;
2. obtenção de API key;
3. webhook configurado;
4. status/QR;
5. recebimento de mensagem;
6. envio de resposta pelo Panel;
7. `fromMe`;
8. rotação de API key;
9. retry/assinatura do webhook;
10. saída pela mesma `instanceId`.

---

## 10. Auditoria: riscos ainda pendentes

A auditoria completa está em `AUDITORIA-TECNICA-E-ROADMAP.md`. Não marcar como produção comercial ainda.

### P1 pendentes

1. Rotacionar segredos usados/expostos e revisar histórico Git.
2. Validar autenticação obrigatória dos webhooks por instância, rotação e auditoria de tentativas inválidas.
3. Confirmar ownership completo do storage proxy por workspace.
4. Finalizar access token curto + refresh rotativo, se necessário.
5. Remover dependências de workspace global/demo e derivar workspace da membership real.
6. Criar testes PostgreSQL para claim idempotente concorrente.
7. Tornar mutações de negócio + eventos uma transação/outbox real.
8. Adicionar ledger idempotente para tool calls do agente.
9. Adicionar fencing token/versão para corrida entre LLM e handoff humano.
10. Implementar comandos autenticados `#humano`, `#assumir`, `#pausar`, `#retomar`, `#bot`, `#voltar`.
11. Transportar mídia real para LLM ou encaminhar para humano quando não houver capacidade.
12. Converter falha de tool em resultado estruturado/fallback seguro.
13. Corrigir duplicação/papéis/status do histórico do agente.
14. Confirmar dispatch n8n para todos eventos relevantes.
15. Completar Meta inbound/challenge/assinatura ou remover promessa de suporte.
16. Adicionar health/readiness, logs estruturados, correlation ID, métricas e alertas.
17. CI com PostgreSQL, integração, E2E, scan e smoke automatizado.

### P2 pendentes

- FKs e CHECK constraints;
- unique atômico em `workspaceSettings`;
- backoff de outbound;
- reconciliação inbound;
- atomicidade de messages batch;
- persistência de channel/instance na conversa/mensagem;
- loading/error/empty states uniformes;
- acessibilidade/mobile;
- code splitting;
- Compose único por ambiente;
- backup off-host e restore testado;
- limites de recursos e rotação de logs;
- shutdown gracioso.

---

## 11. Próximo passo recomendado para a IA que continuar

O próximo bloco de código recomendado é o **ledger idempotente do agente nativo**:

1. criar tabela `agentEffects` ou equivalente;
2. chave única `(eventId, toolCallId)`;
3. registrar `processing`, `completed`, `failed`, `unknown`;
4. antes de executar tool, fazer claim atômico;
5. usar chaves determinísticas em mutações;
6. não repetir `criar_agendamento`, `registrar_nota`, `atualizar_lead` ou `transferir_humano` após retry;
7. guardar resultado estruturado da tool;
8. adicionar fencing token de conversa antes de enfileirar resposta AI;
9. revalidar `humanControlled` imediatamente antes do outbound;
10. escrever testes unitários do ledger e integração futura PostgreSQL.

Depois disso:

- parser de comandos de controle humano;
- tenancy real por membership;
- outbox transacional completo;
- testes PostgreSQL concorrentes;
- observabilidade e CI.

---

## 12. Regras de continuidade

- Responder ao usuário em português do Brasil.
- Não pedir smoke test Cloud novamente neste momento.
- Não exigir que o usuário programe.
- Fazer alterações diretamente no repositório e publicar commits.
- Não expor, imprimir ou pedir credenciais no chat.
- Não alterar/remover o login proprietário único.
- Não apagar volumes Docker.
- Validar `pnpm check`, `pnpm test`, `pnpm build` e `git diff --check` após cada etapa.
- Atualizar este handoff e `PLANO-INTERMEDIARIO-FORTE-PANEL.md` depois de cada bloco relevante.
- Usar migrations versionadas em `drizzle-pg` e registrar em `drizzle-pg/meta/_journal.json`.
- Antes de declarar produção comercial, cumprir os critérios da auditoria.

---

## 13. Comandos úteis

```bash
cd /home/ubuntu/forte-panel
git status
git log -8 --oneline
pnpm check
pnpm test
pnpm build
pnpm db:push
git diff --check
```

Atualização Docker sem apagar dados:

```bash
git pull origin main
docker compose up -d --build forte-panel forte-panel-worker
```

Ou, quando a imagem publicada por SHA estiver validada:

```bash
docker compose pull forte-panel forte-panel-worker
docker compose up -d forte-panel forte-panel-worker
```

Verificação:

```bash
docker compose ps
docker compose logs --tail=100 forte-panel
docker compose logs --tail=100 forte-panel-worker
```

**Fim do handoff.**

---

## Atualização do handoff — 2026-09-25 21:06

A etapa seguinte ao claim de idempotência HTTP implementou o ledger das tools do agente:

```text
0015_agent_effects.sql
```

A tabela `agentEffects` usa chave única `workspaceId + eventId + toolCallId` e registra fingerprint, status, resultado e lease.

Tools mutáveis protegidas: `atualizar_lead`, `registrar_nota`, `criar_agendamento` e `transferir_humano`.

Tools somente leitura sem efeito persistente: `buscar_lead` e `consultar_agenda`.

O agente faz claim antes da tool, devolve resultado salvo quando já concluída e não executa novamente enquanto outro lease estiver ativo. O reset de dados de desenvolvimento apaga `agentEffects` do workspace.

Validação: `pnpm check`, `pnpm test` (39 passaram; 13 ignorados), `pnpm build`, journal JSON e diff check passaram.

Próximo bloco recomendado: teste PostgreSQL real de concorrência, estado `unknown` para crash após mutação, fencing de conversa contra handoff humano e parser dos comandos de controle humano.

A regra continua: não executar smoke test PAPI Cloud nem pedir token neste momento; o usuário adiou essa operação. Não alterar login proprietário único e não remover volumes Docker.
