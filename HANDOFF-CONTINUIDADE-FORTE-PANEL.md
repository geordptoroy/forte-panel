# Handoff de continuidade — Forte Panel

**Data do handoff:** 2026-09-25 21:02 (America/Sao_Paulo)
**Repositório:** `geordptoroy/forte-panel`
**Branch:** `main`
**HEAD de referência desta revisão:** `07ceefa` (remoção dos componentes antigos; consulte `git log -1` para o commit mais recente).
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
- a decisão histórica de login administrativo/proprietário único foi substituída em 2026-09-25 pela estratégia de produto público multi-conta, master + funcionários, registrada em `ESTRATEGIA-PRODUTO-PUBLICO-MULTICONTA.md`.

Decisão histórica: desenvolvimento local no Docker/WSL, pensando em produto comercial hospedado. A decisão vigente é construir o app completo para público final e começar por tenancy/login seguro; opções de hospedagem e cobrança são decisões posteriores. PostgreSQL continua como banco de negócio.

**A instrução antiga de não alterar o login proprietário único está revogada pelo pedido explícito de 2026-09-25.** Não iniciar alterações destrutivas nem apagar dados: planejar migrations e backfill compatíveis.

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
0d66201 docs: add branded interface improvement roadmap
23ebd08 docs: plan public multi-account product
07ceefa chore: remove automation integration
36a83ad docs: refresh handoff after integration removal
db54e6e fix(auth): secure workspace owner bootstrap and sessions
9a7c5c0 feat(auth): resolve active workspace in protected context
```

No momento do handoff:

- branch `main` está sincronizada com `origin/main`;
- working tree estava limpo após o commit `b2fbd76`;
- não fazer reset, rebase destrutivo ou apagar volumes.

---

## 4. Arquivos de documentação importantes

- `ESTRATEGIA-PRODUTO-PUBLICO-MULTICONTA.md` — estratégia vigente de produto público, master/funcionários, tenancy, fases e PAPI/Baileys futuro.
- `AUDITORIA-TECNICA-E-ROADMAP.md` — auditoria completa, riscos P1/P2 e critério comercial.
- `PLANO-INTERMEDIARIO-FORTE-PANEL.md` — plano vivo, já unificado com PAPI Cloud e etapas concluídas.
- `FASE-1-SEGURANCA-CONTENCAO.md` — reforços da Fase 1 de segurança.
- `API_CONTRACT.md` — contrato da API.
- `infra/LOCAL_TEST.md` — execução local.
- `docker-compose.yaml` — Compose principal.
- `docker-compose.forte-panel-papi.yaml` — Compose alternativo Panel + PAPI.

Este documento é o handoff operacional. Ler primeiro este arquivo, depois `ESTRATEGIA-PRODUTO-PUBLICO-MULTICONTA.md`, `todo.md`, o plano intermediário e a auditoria.

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

**Esta seção descreve a recomendação histórica na data do handoff e foi supersedida pela nova estratégia multi-conta no final deste documento.** O ledger idempotente do agente nativo foi implementado posteriormente e não é o próximo bloco isolado.

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

Depois disso, na ordem histórica:

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
- Construir o produto público multi-conta conforme `ESTRATEGIA-PRODUTO-PUBLICO-MULTICONTA.md`; não preservar a limitação de login único.
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

A regra histórica continua: não executar smoke test PAPI Cloud nem pedir token sem autorização; o usuário adiou essa operação. A proibição de alterar o login proprietário único foi revogada pela decisão multi-conta ao final deste handoff. Não remover volumes Docker.

---

## Nova decisão de produto — Onboarding Conversacional Assistido por IA

O usuário quer que o cliente final consiga configurar o produto sozinho por meio de um chat integrado. Esse chat deve entrevistar o responsável pela empresa e descobrir dados suficientes para formar o perfil da empresa e um system prompt de atendimento.

Nome técnico adotado no roadmap: **Onboarding Conversacional Assistido por IA**. Nomes comerciais possíveis: Configuração Inteligente, Assistente de Ativação, Setup Guiado por IA ou DNA da Empresa.

O fluxo seguro planejado é:

```text
chat de descoberta
→ perfil estruturado da empresa
→ rascunho de system prompt/políticas
→ revisão do proprietário
→ simulação
→ aprovação explícita
→ versão publicada do agente
```

Não salvar simplesmente texto livre produzido pela IA. Criar perfil estruturado, versionamento, revisão, rollback e limites do agente. A IA não pode publicar sem aprovação do proprietário. Segredos/API keys ficam fora do prompt. O cliente deve conseguir editar fatos, tom de voz, FAQs, serviços, regras de agenda e condições de transferência para humano.

A feature é uma fase de produto comercial posterior às correções de segurança/tenancy/confiabilidade, mas o MVP pode funcionar localmente usando o agente nativo atual, sem depender da PAPI Cloud.

Se “Jev” for uma ferramenta específica, confirmar qual produto/serviço o usuário quis dizer antes de criar dependência; o roadmap permanece vendor-neutral por enquanto.

---

## Nova decisão de produto — Roadmap de interface sem redesign

O usuário aprovou adicionar ao roadmap as melhorias de interface mantendo o branding atual. Não fazer uma troca radical de identidade. Preservar fundo escuro, superfícies/cards, paleta atual, badges, verde/âmbar/vermelho de status, tipografia e ícones lineares.

Frentes aprovadas:

1. **Clareza operacional:** navegação agrupada, dashboard orientado a ações, cards clicáveis, checklist inicial e estados de loading/erro/retry/empty consistentes.
2. **Inbox:** destacar IA ativa/humano assumiu/IA pausada, ações `Assumir conversa` e `Devolver para IA`, instância de entrada visível, timeline operacional do agente sem raciocínio privado e composer mobile acessível.
3. **Configuração comercial:** tela `Configuração Inteligente` integrada ao Onboarding Conversacional Assistido por IA, com progresso, perfil estruturado, revisão, simulação, aprovação, versões e rollback.
4. **Canais:** visão simples por padrão e detalhes avançados sob expansão; IDs, headers e detalhes técnicos não devem dominar a primeira camada.
5. **Qualidade:** componentes reutilizáveis, menos estilos inline, foco visível, `aria-label`, contraste, responsividade e code splitting.

Ordem recomendada:

```text
estados/loading/erro/vazio
→ dashboard orientado a ações
→ Inbox IA/humano
→ mobile/responsividade
→ Canais em duas camadas
→ checklist inicial
→ Configuração Inteligente conversacional
→ simulador/versionamento do agente
```

A futura implementação da interface deve ser incremental e compatível com o branding, agora dentro do modelo multi-conta master + funcionários descrito abaixo.


---

## Decisão vigente do produto — SaaS público multi-conta (2026-09-25)

Este registro é a orientação mais atual e prevalece sobre qualquer instrução anterior de login único/instalação única neste handoff, no plano e no escopo.

O usuário pediu construir o app completo para o público final:

- conta master cria uma empresa/workspace;
- master cria acessos individuais para funcionários com nome, identificador e senha inicial;
- papéis e permissões isolam as ações da equipe;
- conexão/instância WhatsApp é diferente do login e do workspace;
- primeiro marco público: uma conexão WhatsApp por empresa e UX sem configuração manual de secrets.

O repositório já tem login local, hash de senha, memberships e papéis internos que devem ser avaliados/reutilizados. O middleware tRPC agora resolve uma única membership/workspace ativo; mesmo usuários com papel global `admin` são negados sem essa membership. O login local e `workspace.current` usam esse contexto e parte das rotas de notificação já recebe o `workspaceId` correto.

**Implementação publicada antes desta etapa (commits `db54e6e`, `9a7c5c0` e `7ebc246`):** `sessionVersion` passou a ser incluída no JWT assinado; autenticação compara a claim ao banco. OAuth comum não ganha `owner` automaticamente. Middleware tRPC exige uma membership ativa única e nega usuário sem tenant mesmo se o papel global for `admin`. Login local, `workspace.current`, notificações iniciais, membros, catálogo, profissionais e disponibilidade usam agora o workspace do contexto explícito. Funcionários são criados com papel de plataforma `user`; admin é papel só da membership.

**Implementação adicional desta etapa:** agenda, dashboard, portal profissional, disponibilidade, validação de vínculos e criação/cancelamento/status/reagendamento agora recebem workspace explícito. Queries de agenda juntam contatos/serviços/profissionais pelo mesmo tenant; ferramentas do agente usam o workspace do evento. Os endpoints REST de agenda não inferem tenant: exigem `FORTE_API_WORKSPACE_ID`, com `503 api_workspace_not_configured` quando ausente/inválido. Essa configuração mantém a chave REST presa a um workspace por deployment; não representa API pública multiempresa. Os outros endpoints REST ainda aguardam migração tenant-aware.

**Validação desta etapa:** `pnpm check`, `pnpm test`, `pnpm build` e `git diff --check` passaram; 43 testes passaram e 19 foram ignorados. Os testes novos `workspace-domain-isolation.test.ts` e `agenda-workspace-isolation.test.ts`, além da suíte de agenda profissional, exigem PostgreSQL e foram ignorados porque este sandbox não tem `DATABASE_URL`. Os testes REST que passaram verificam fail-closed sem workspace válido. Nenhuma migration ou dado de banco foi alterado. Restam 29 referências servidor-side a `ensureDemoWorkspace`; isolamento multi-tenant end-to-end não está completo. A auditoria legada fica temporariamente vazia porque `auditLogs` ainda não armazena `workspaceId`; não atribuir histórico por ator sem backfill verificado.

**Próximo passo:** migrar CRM/contatos, conversas e mensagens, incluindo workers/webhooks e todos os joins/mutações. Depois migrar os demais endpoints REST e agentes/integrações para tenancy, desenhar backfill de `auditLogs` e executar as suites multiempresa em PostgreSQL. **Não habilitar cadastro público nem criar tenants operacionais adicionais antes da prova end-to-end de isolamento.**


### PAPI/Baileys: proposta para fase futura

O usuário informou que a PAPI em uso se apoia em Baileys e sugeriu usar a imagem/repositório `intrategica/papi-free:1.5.1` como base para construir uma API REST própria.

**Achado da revisão atual:** Compose atuais do Forte Panel já referenciam `intrategica/papi-free:1.5.2`; a tag 1.5.1 está publicada, mas é mais antiga. O Docker Hub lista a imagem, porém não expõe source repository nem licença em seus metadados públicos; busca por repo GitHub correspondente não localizou a fonte. Não concluir que inexista: pedir/obter do mantenedor o source, licença e permissão antes de fork, modificar ou redistribuir.

Alternativas futuras: fork da PAPI se a fonte e os direitos estiverem confirmados; caso contrário, continuar temporariamente com provider atual ou avaliar serviço REST separado escrito diretamente sobre Baileys. Baileys declara MIT para o projeto próprio, mas é independente/não oficial para WhatsApp Web; essa licença não cobre código, imagem ou direitos da PAPI. Manter adapter provider-neutro, PAPI como transição e Meta Cloud API como alternativa oficial.

O protótipo, se aprovado depois, exige storage durável e criptografado de credentials/Signal keys, QR efêmero e não logado, um socket ativo por sessão, lease/lock, callbacks assinados, idempotência, reconexão, health/alertas, rate limits, backup/restore e opção de rollback. A documentação oficial Baileys desaconselha `useMultiFileAuthState` em produção. Avaliar termos/risco de suspensão e deixar claro ao cliente que WhatsApp Web/Baileys não é a Business API oficial.

### Documentos canônicos atualizados

1. `ESTRATEGIA-PRODUTO-PUBLICO-MULTICONTA.md` — estratégia, decisões, fases, critérios de aceite e fontes.
2. `todo.md` — checklist vivo com tenancy e login como próxima fase.
3. `PRODUCT_SCOPE.md` — escopo comercial e arquitetura.
4. `PLANO-INTERMEDIARIO-FORTE-PANEL.md` — decisões e histórico de etapas.

A seção antiga do próximo passo técnico deve ser lida como histórico. Para validações, executar as suites no commit vigente; as contagens de testes registradas em handoffs antigos são históricas.
