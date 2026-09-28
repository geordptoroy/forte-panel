# Handoff de continuidade — Forte Panel

**Data do handoff:** 2026-09-27 (America/Sao_Paulo)
**Repositório:** `geordptoroy/forte-panel`
**Branch histórica deste handoff:** `main` (não usar como indicação da branch de trabalho atual)
**HEAD de referência desta revisão:** commit desta atualização; consulte `git log -1` para o hash publicado mais recente.
**Remote:** `https://github.com/geordptoroy/forte-panel.git`
**Usuário precisa poder entregar esta conversa a outra IA sem repetir contexto.**

> **Precedência atualizada em 2026-09-27:** este arquivo preserva histórico e pode conter prioridades antigas de PAPI Cloud/singleton. Para a etapa ativa, ler primeiro `PROJECT_DOCUMENTATION_INDEX.md`, `todo.md` e `WHATSAPP-CONNECTION-FLOW-2026-09-27.md`. O foco atual é CRUD multi-instância Baileys + consumo; API REST empresarial fechada por padrão; Docker/WSL/Windows Terminal PowerShell no desenvolvimento do usuário; OCI é futura. Não apagar volumes, migrar produção ou iniciar etapas de IA/admin antes da revisão desta etapa.

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

---

## Atualização do handoff — 2026-09-26 09:52

O bloco seguinte da migração de tenancy foi concluído no código, sem abrir cadastro público nem tocar na PAPI Cloud.

### Implementado

- `listInboxContacts`, `getContactById`, conversas, mensagens, notas, auditoria derivada do contato, `setContactAi`, mensagem manual e mudança de estágio agora recebem `workspaceId` explícito.
- `upsertApiContact`, `leadMemoryOperation`, `ingestInboundWhatsApp`, `findQueuedBatchMessage` e `queueOutboundMessage` usam o workspace resolvido pelo chamador; consultas de contato/conversa filtram o tenant.
- Seleção de provider, canais ativos, webhook PAPI e segredo da instância passam a usar o workspace explícito nos fluxos autenticados.
- Rotas tRPC de Inbox/Canais e agente nativo propagam `ctx.workspace.workspaceId`/`event.workspaceId`.
- API REST de contatos, lead-memory, mensagens, batch, stage, canais e webhooks exige `FORTE_API_WORKSPACE_ID` válido. A validação de payload e Idempotency-Key permanece antes do `503` de workspace ausente, preservando o contrato existente.
- Webhooks inbound encaminham o workspace para ingestão e registro do evento; a rota PAPI resolve o webhook dentro do workspace configurado.

### Validação

```text
pnpm check       ✅
pnpm test        ✅ 43 testes aprovados; 19 ignorados por dependerem de PostgreSQL/configuração externa
pnpm build       ✅
git diff --check ✅
```

O build emite apenas o warning já existente de chunk frontend acima de 500 kB. Nenhuma migration ou dado foi alterado nesta etapa.

### Limitações e próximo bloco

- `auditLogs` ainda não possui `workspaceId`; a leitura é protegida pela existência do contato no tenant, mas a tabela precisa de coluna/backfill antes de reativar auditoria global.
- `webhookEvents`, `apiIdempotency` e alguns identificadores externos ainda têm unicidade histórica global; o próximo bloco deve criar constraints compostas por workspace com migration versionada e testes PostgreSQL concorrentes.
- Onboarding/configuração do agente, listagem/gestão de instâncias PAPI e demais helpers históricos ainda usam fallback demo e não devem ser expostos como cadastro multi-conta até a migração correspondente.
- Executar `workspace-domain-isolation.test.ts`, `agenda-workspace-isolation.test.ts` e a nova cobertura de CRM em PostgreSQL real antes de permitir tenants operacionais adicionais.

---

## Atualização do handoff — 2026-09-26 09:58

A etapa de configuração foi migrada para workspace explícito.

### Implementado

- Onboarding e prompt publicado usam o workspace recebido pelo tRPC/API REST.
- Configuração persistida e runtime do agente nativo usam o workspace do evento `domainEvent`, evitando que uma mensagem de uma empresa carregue prompt/configuração de outra.
- Listagem, criação, rotação, seleção e exclusão de instâncias/webhooks PAPI usam o workspace autenticado.
- O helper de armazenamento PAPI deixou de aceitar chamadas sem tenant e o fallback global de `PAPI_INSTANCE_ID` foi removido dos fluxos tenant-aware.
- As chaves de provedores de IA continuam server-side. Usuários e empresas não recebem a chave OpenAI/Gemini/NIM; o painel usa membership/sessão e autorização próprias.

### Validação

```text
pnpm check       ✅
pnpm test        ✅ 43 testes aprovados; 19 ignorados sem PostgreSQL
pnpm build       ✅
git diff --check ✅
```

### Decisão para o beta de até 10 testadores

Usar uma chave de provedor de IA no backend pode atender várias conversas simultâneas. Cada request é associado ao workspace/usuário no Forte Panel, e não a uma chave individual do provedor. O backend deve controlar rate limit por workspace, limite global, timeout, retries, custo/tokens e logs sem conteúdo sensível. Chaves separadas por empresa só serão necessárias quando houver cobrança direta por cliente, BYOK (bring your own key) ou isolamento financeiro/regulatório mais forte.

Antes de convidar os betas, ainda falta adicionar limites/cotas persistidos por workspace e provar isolamento em PostgreSQL real. Não expor `OPENAI_API_KEY`, `BUILT_IN_FORGE_API_KEY`, tokens PAPI ou tokens Meta no frontend.

---

## Atualização do handoff — 2026-09-26 10:03

Foi implementada a primeira camada de proteção operacional para o beta.

### Rate limit por workspace

- Nova tabela `workspaceUsageBuckets`, com buckets de 1 minuto por workspace.
- Estrutura preparada para `apiRequests`, `aiRequests` e `outboundMessages`; nesta etapa os contadores efetivamente consumidos são REST e IA, enquanto outbound fica reservado para a próxima camada de fila/cota.
- Contador usa update atômico condicionado ao limite, evitando que requisições concorrentes ultrapassem a cota.
- API REST vinculada a workspace aplica `FORTE_WORKSPACE_API_REQUESTS_PER_MINUTE` e responde `429 workspace_rate_limited` com `X-RateLimit-Limit`, `X-RateLimit-Remaining` e `Retry-After`.
- Worker aplica `FORTE_WORKSPACE_AI_REQUESTS_PER_MINUTE` antes de executar o agente. Ao atingir o limite, o evento retorna para `pending` com `availableAt` no próximo intervalo, sem ser descartado.
- Defaults atuais: 120 requisições REST/minuto por workspace e 60 execuções de IA/minuto por workspace. Valores são configuráveis no ambiente do servidor.
- Reset de desenvolvimento também remove os buckets do workspace demo.

Migration criada:

```text
0016_workspace_usage_buckets.sql
```

Teste criado: `server/workspace-usage.test.ts`. Ele exige PostgreSQL e valida que o limite de um workspace não consome a cota de outro.

Validação local:

```text
pnpm check       ✅
pnpm test        ✅ 43 aprovados; 20 ignorados, incluindo o teste PostgreSQL de uso
pnpm build       ✅
```

Antes de convidar os betas, definir valores de produção no ambiente e aplicar a migration. Para 10 pessoas usando uma mesma empresa, o limite é compartilhado pelo workspace, o que evita que um usuário consuma toda a capacidade sem controle individual.

---

## Atualização do handoff — 2026-09-26 10:11

A etapa seguinte de isolamento foi concluída no código: chaves de idempotência, webhooks e eventos de domínio agora são compostas por `workspaceId` + chave; auditoria passou a ter `workspaceId` obrigatório e voltou a ser listável somente no workspace atual.

### Alterações

- `apiIdempotency`: removeu unicidade global de `key`; reservas, recuperação, conclusão e falha filtram pelo workspace.
- `webhookEvents`: removeu unicidade global de `eventId`; registro e processamento filtram pelo workspace.
- `domainEvents`: removeu unicidade global de `eventKey`; enqueue e deduplicação usam `(workspaceId, eventKey)`.
- `auditLogs`: adicionou `workspaceId`, todos os writes de CRM/worker/agenda/rotas administrativas passaram a gravá-lo e as leituras usam o filtro tenant-aware.
- A migration faz backfill de auditoria por contato, depois membership única, e por último `forte-demo` para registros históricos sem vínculo determinístico. Idempotência/webhooks históricos sem workspace também são atribuídos ao workspace demo legado antes de `NOT NULL`.
- O teste PostgreSQL `server/workspace-key-isolation.test.ts` valida que duas empresas podem usar a mesma chave textual sem colisão.

Migration:

```text
0017_tenant_scoped_deduplication.sql
```

Aplicação em ambiente com PostgreSQL real: verificar primeiro que o workspace `forte-demo` existe; depois executar `pnpm exec drizzle-kit migrate` com `DATABASE_URL` configurado. Não executar `db:push` para substituir esta migration manual.

Validação local:

```text
pnpm check       ✅
pnpm test        ✅ 43 aprovados; 21 ignorados, incluindo testes que exigem PostgreSQL
pnpm build       ✅
git diff --check ✅
```

Limitação conhecida: o sandbox atual não possui `DATABASE_URL`, então backfill, constraints e testes de concorrência ainda precisam ser executados no PostgreSQL de desenvolvimento antes do beta.

---

## Atualização do handoff — 2026-09-26 10:14

A auditoria de secrets encontrou e corrigiu um ponto de risco: os webhooks PAPI persistidos em `workspaceSettings.papi_webhooks` mantinham a cópia do segredo em plaintext, embora a instância também tivesse uma cópia criptografada.

### Correção

- Segredos de webhook agora são criptografados com AES-256-GCM antes de serem gravados em `workspaceSettings`.
- A leitura descriptografa somente no backend e mantém compatibilidade com registros legados em plaintext, que serão regravados criptografados na próxima alteração do webhook.
- A configuração retornada ao frontend continua sem o segredo bruto: apenas `secretMasked` é retornado.
- O segredo completo continua sendo entregue somente na resposta única de criação/provisionamento, para ser copiado para a PAPI.
- Chaves de providers LLM e API keys PAPI já eram criptografadas em repouso e continuam sendo retornadas apenas mascaradas.

Teste criado: `server/secret-safety.test.ts`.

Validação desta etapa:

```text
pnpm check ✅
pnpm test -- server/secret-safety.test.ts server/api.contract.test.ts server/integrations/whatsapp.test.ts ✅ 46 aprovados; 21 ignorados
```

Atenção para o beta: definir `JWT_SECRET` forte e persistente no ambiente de produção. O fallback local de desenvolvimento não deve ser usado em produção, pois ele também participa da chave de criptografia dos secrets persistidos.

---

## Atualização do handoff — 2026-09-26 10:19

A proteção de consumo do beta foi ampliada: além do bucket por workspace, o sistema agora mantém um bucket por usuário e minuto para impedir que um operador consuma sozinho toda a cota da empresa.

### Política atual

- `starter`: 120 API/min, 60 execuções de IA/min, 120 mensagens outbound/min por workspace; cota individual = workspace dividido por 4.
- `pro`: 600 API/min, 300 IA/min, 600 outbound/min por workspace; cota individual = workspace dividido por 10.
- `business`: 1800 API/min, 900 IA/min, 1800 outbound/min por workspace; cota individual = workspace dividido por 10.
- Variáveis `FORTE_WORKSPACE_*_PER_MINUTE` continuam podendo sobrescrever o limite do deployment.
- O envio manual do Inbox consome a cota `outboundMessages` do usuário autenticado e retorna erro de limite quando esgotada.
- O contador individual usa update atômico condicionado ao limite e chave única `(workspaceId, userId, bucketStart)`.

Migration criada:

```text
0018_workspace_user_usage_buckets.sql
```

Validação local:

```text
pnpm check ✅
pnpm test  ✅ 48 aprovados; 21 ignorados por dependência de PostgreSQL
```

A aplicação das migrations 0016, 0017 e 0018 e o teste concorrente ainda precisam ocorrer no PostgreSQL real. O próximo trabalho será expor consumo/limites no painel e aplicar cota também ao outbound automático do worker.

---

## Atualização do handoff — 2026-09-26 10:22

O painel operacional de consumo foi implementado na tela **Integrações**, protegido pela procedure administrativa de manager.

### Entregas

- Consulta `workspace.usage` tenant-aware.
- Resumo da janela atual para API, execuções de IA e mensagens outbound.
- Limites exibidos conforme o plano do workspace.
- Percentual usado, saldo restante e horário de renovação da janela.
- Lista dos operadores que tiveram consumo individual na janela, ordenada por mensagens outbound.
- Atualização automática da tela a cada 30 segundos.
- Nenhum segredo de integração é incluído no payload do painel.

Validação:

```text
pnpm check ✅
pnpm test  ✅ 48 aprovados; 21 ignorados
pnpm build  ✅
```

Próximo bloco: aplicar as migrations 0016/0017/0018 em PostgreSQL real, validar a consulta com dois workspaces e adicionar a mesma proteção de cota ao outbound automático do worker.

---

## Atualização do handoff — 2026-09-26 10:45

O outbound automático do worker passou a respeitar a cota do workspace antes de chamar o adapter PAPI/Meta.

### Comportamento

- Cada mensagem `queued` com workspace válido consome uma unidade de `outboundMessages` na janela atual.
- Quando a cota está cheia, a mensagem não é marcada como `processing`, não incrementa tentativa e continua `queued`.
- A próxima passagem do worker tenta novamente após a renovação da janela.
- O retorno de `processQueuedMessagesOnce` inclui `throttled`.
- O log do worker exibe `limitadas=N` quando mensagens foram adiadas por cota.
- O limite de execuções de IA no fluxo de `message.received` já estava protegido; agora o envio outbound também está coberto.

Validação:

```text
pnpm check ✅
pnpm test  ✅ 48 aprovados; 21 ignorados
pnpm build  ✅
```

Próximo bloco: aplicar as migrations 0016/0017/0018 no PostgreSQL real e validar concorrência entre workspaces, seguida de alertas para aproximação do limite.

---

## Atualização do handoff — 2026-09-26 10:53

Foi concluído o bloco de alertas operacionais e a consolidação documental do projeto.

### Alertas de consumo

- `processWorkspaceQuotaAlertsOnce` varre o bucket atual de cada workspace ativo.
- Owners, admins e managers ativos recebem alertas in-app.
- 70% gera `quota_warning` / “Consumo elevado”.
- 90% gera `quota_critical` / “Cota quase esgotada”.
- A chave inclui workspace, minuto, métrica e threshold; execuções repetidas não duplicam notificações.
- O worker executa a varredura uma vez por minuto e registra `alertasCota=N` quando cria notificações.
- O alerta aponta para `/integrations`, onde o manager vê o consumo detalhado.

### Documentação consolidada

Foi criado `BETA-OPERATIONS-CHECKLIST.md` com a arquitetura de API/chaves, tenancy, fluxo da IA, quotas, migrations, checklist de abertura do beta para até 10 testadores, riscos abertos e comandos de validação.

Foi criado `PROJECT_DOCUMENTATION_INDEX.md` com o mapa de todos os documentos do projeto e as regras para manter handoff, roadmap, contrato e operação sincronizados.

`API_CONTRACT.md` foi atualizado com a semântica de quotas, alertas, worker e remoção do fallback global de PAPI entre tenants.

Validação deste bloco:

```text
pnpm check ✅
pnpm test  ✅ 49 aprovados; 21 ignorados
```

O `pnpm build` final passou. Continua pendente apenas validar as migrations 0016–0018 e a concorrência no PostgreSQL real.

---

## Atualização do handoff — 2026-09-26 11:03

A validação que estava pendente foi executada em um PostgreSQL 16 local efêmero, sem Docker e sem tocar em volumes do projeto.

### Procedimento

- PostgreSQL 16 instalado localmente na sandbox.
- Banco `forte_test` e role `forte_test` criados somente para testes.
- `DATABASE_URL` apontado para `127.0.0.1`.
- `pnpm exec drizzle-kit migrate` aplicado com sucesso.
- Confirmadas as tabelas `workspaceUsageBuckets`, `workspaceUserUsageBuckets`, `apiIdempotency`, `webhookEvents`, `domainEvents`, `auditLogs` e `notifications`.
- Confirmados os índices compostos de workspace para idempotência, webhook, domain events, buckets e memberships.

### Resultado

```text
PostgreSQL 16.15
20 test files passed
72 tests passed
0 skipped
pnpm check ✅
pnpm build ✅
```

Foi criado `server/workspace-quota-alerts.test.ts`. O teste confirmou que:

1. 70% de consumo gera uma notificação para o manager correto;
2. uma segunda varredura não duplica o alerta;
3. outro workspace sem consumo não recebe a notificação.

Essa validação comprova o isolamento e as constraints no banco efêmero. Ainda é necessário repetir o procedimento no PostgreSQL de staging antes de convidar os beta testers.

---

## Atualização do handoff — 2026-09-26 11:24

Foi implementada a retenção dos buckets de consumo para evitar crescimento indefinido das tabelas.

- `cleanupWorkspaceUsageBuckets` remove buckets antigos de workspace e usuário.
- O padrão é 30 dias.
- O valor pode ser alterado com `FORTE_USAGE_RETENTION_DAYS`, limitado entre 1 e 365 dias.
- O worker executa a limpeza uma vez por dia e registra `bucketsRemovidos workspace=N usuarios=N` quando remove dados.
- A limpeza usa `bucketStart` como critério e preserva a janela atual e todo o período dentro da retenção.
- O teste PostgreSQL confirma que um bucket com 10 dias é removido usando retenção de 7 dias, enquanto o bucket atual permanece.

Validação desta etapa:

```text
21 test files passed
73 tests passed
pnpm check ✅
```

Próximo passo: repetir a política no staging real e avaliar retenção/alertas externos com dados do beta.

---

## Atualização do handoff — 2026-09-26 11:27

Foi concluído o bloco de observabilidade mínima para o beta.

### API

- `GET /api/v1/health` permanece como liveness, sem dependência de banco.
- `GET /api/v1/ready` foi adicionado como readiness.
- Readiness executa `select 1` e retorna `200` apenas com PostgreSQL funcional.
- Sem banco configurado ou com falha, retorna `503`, `status: "not_ready"` e somente o estado agregado da checagem.
- Nenhum detalhe de conexão ou segredo é retornado.

### Worker

- Heartbeat JSON periódico adicionado.
- Intervalo configurável por `WORKER_HEARTBEAT_MS`, padrão de 60 segundos.
- Eventos de operação permanecem identificáveis por `processadas`, `limitadas`, `alertasCota` e `bucketsRemovidos`.

### Validação

```text
21 test files passed
74 tests passed
pnpm check ✅
```

A primeira tentativa de teste com PostgreSQL falhou porque o banco havia sido encerrado antes da execução paralela; a repetição iniciou o PostgreSQL no mesmo comando e passou integralmente. O banco efêmero foi encerrado após a validação.

Próximo passo: configurar monitoramento no staging real para `/api/v1/ready` e para o heartbeat do worker.

---

## Atualização do handoff — 2026-09-26 11:31

O produto ganhou uma nova decisão P0 antes dos convites beta: implementar o **Console Administrativo da Plataforma**.

O console será separado dos papéis `owner/admin/manager/agent` de cada workspace. Seu objetivo é permitir que o operador do Forte Panel:

- liste e consulte contas/workspaces;
- acompanhe onboarding, canal, IA, quotas, fila e heartbeat;
- preste suporte read-only por sessão escopada;
- configure o agente individualmente por workspace;
- simule, publique, versiona e faça rollback de prompts;
- pause/reative IA ou suspenda/reative conta com motivo;
- registre notas e auditoria sem ver senhas ou segredos crus.

A especificação funcional e técnica completa está em `STATUS-COMPLETO-E-PLANO-BETA.md`. O módulo deve ser implementado antes de convidar os 10 testers, pois editar banco ou secrets manualmente não é uma operação segura de beta.

Estruturas previstas: `platformAdmins`, `supportSessions`, versões/rascunhos do agente, execuções de simulação e auditoria de plataforma. O suporte é read-only por padrão, com expiração, revogação e step-up para ações mutáveis.


---

## Atualização do handoff — 2026-09-26 16:23

### Nova decisão de produto: WhatsApp próprio sobre Baileys

O usuário decidiu substituir gradualmente a dependência da PAPI por um gateway próprio, mantendo a PAPI como provider legado durante a transição. A decisão veio após o bloqueio local por `Machine ID`/`machine mismatch` e a falta de suporte adequado para desenvolvimento e testes locais.

O gateway provisório chama-se **forte-whatsapp** e ficará no mesmo repositório/Compose, porém como serviço separado do processo do CRM. Isso mantém o produto unificado para o cliente, mas evita que uma falha de conexão WhatsApp derrube o Forte Panel.

#### Limites legais e técnicos

- Não copiar código proprietário da PAPI.
- Não remover/burlar a validação de licença da PAPI.
- Usar código original sobre Baileys, observando a licença MIT, seus avisos e os termos do WhatsApp.
- Não prometer estabilidade de produção antes de testar reconexão, logout, mídia, rate limits e mudanças do protocolo.
- Nenhuma credencial real, sessão ou segredo deve entrar no Git.

#### Primeiro bloco de implementação

```text
forte-whatsapp/
├── src/config.ts
├── src/index.ts
├── src/http/{server,auth,health,instances,messages,webhooks}.ts
├── src/baileys/{client,auth-state,events,message-parser}.ts
├── src/instances/{instance-manager,instance-store,instance-types}.ts
├── src/messages/{send-text,send-audio,send-buttons,normalize-phone}.ts
├── src/webhooks/{forte-webhook,normalize-inbound,signature}.ts
├── Dockerfile
├── package.json
└── README.md
```

O MVP inicial terá uma instância, QR/status, sessão persistente em volume Docker, envio/recebimento de texto, webhook assinado, API interna autenticada e health/readiness. Depois o provider `baileys` será adicionado ao `WhatsappAdapter` do Panel, sem reescrever Inbox, CRM, IA, agenda, quotas ou auditoria.

A PAPI Cloud não deve ser ativada nem receber token durante essa fase. A migração precisa ser reversível: PAPI e Meta Cloud permanecem disponíveis até o gateway próprio passar pelos testes de integração.


## Atualização de continuidade — 2026-09-26 23:36

A fonte de verdade documental foi consolidada em `CAPABILITY-MATRIX.md`, que separa capacidade implementada, teste automatizado e ambiente validado. O roadmap foi corrigido para não marcar como ausentes os gates já executados: CI PostgreSQL com migrations limpas, console platform admin, sessões de suporte, mutações auditadas, heartbeat, versionamento/rollback do agente e contrato HTTP do gateway WhatsApp.

Os gates que ainda dependem de coordenação externa permanecem explicitamente pendentes: URL e banco de staging persistente, execução do smoke/E2E manual, número WhatsApp de teste, store de sessão durável com restore, storage privado de mídia, alertas externos e backup/restauração.


---
## Atualização de continuidade — 2026-09-27 — preparação para beta controlado

Esta atualização fecha o bloco de interface operacional e publicação do build para continuidade por outra IA ou pelo ambiente Docker do usuário.

### Implementado nesta etapa

- Botão **Sair** no `PanelLayout`, conectado à procedure autenticada `auth.logout`.
- Remoção do componente de reset destrutivo da tela comum de Preferências. Reset, API keys, configuração de IA e prompt continuam exclusivos do `/platform-admin`.
- Card de conexão Baileys em Integrações com status, polling, QR Code, reconexão, desconexão temporária e encerramento de sessão.
- Procedures tRPC tenant-aware para `baileysStatus`, `baileysQr`, `connectBaileys` e `disconnectBaileys`; conexão/desconexão exigem papel manager.
- Script `scripts/start-docker.sh`, executável em uma linha, que faz pull e recria PostgreSQL, Redis, Panel, worker e gateway sem remover volumes.
- Roadmap, checklist beta e todo atualizados para refletir Baileys nativo como caminho operacional local.

### Validação executada

```text
pnpm check  ✅
pnpm build  ✅
pnpm test   ✅  62 testes aprovados / 31 ignorados por dependências externas
./scripts/start-docker.sh
git diff --check ✅
```

Os testes ignorados continuam sendo os que exigem PostgreSQL/configuração externa no processo local. O QR Code ainda precisa de validação em Docker/staging com um número WhatsApp de teste.

### Como atualizar no computador do usuário

Depois que este commit estiver no GitHub:

```powershell
cd C:\caminho\do\forte-panel
git pull origin main
./scripts/start-docker.sh
```

No PowerShell, se o script Bash não for executável diretamente, usar Git Bash/WSL ou executar o equivalente:

```powershell
docker compose --env-file .env pull
docker compose --env-file .env up -d --force-recreate
docker compose --env-file .env ps
```

Não executar `docker compose down -v`, pois isso apaga banco, Redis e sessão pareada do WhatsApp.

### Próximos gates reais

1. Atualizar o ambiente Docker local sem apagar volumes.
2. Abrir `http://localhost:3002`, entrar em **Integrações** e validar QR/status.
3. Confirmar inbound e outbound com número de teste.
4. Repetir migrations, isolamento e smoke/E2E em staging persistente.
5. Configurar backup off-host e executar restore em ambiente limpo.
6. Só depois convidar beta testers.


---
## Auditoria e plano de continuidade — 2026-09-27 01:11

Foi feita uma auditoria ampla do console administrativo, operação do workspace, UX mobile/performance e escopo SaaS/LGPD. O plano detalhado está em `PLANO-AUDITORIA-E-EXECUCAO-2026-09-27.md`.

### Achados críticos confirmados

- O botão de retorno do console aponta genericamente para `/dashboard`. Isso pode levar à conta normal ou falhar para platform-only; não representa o workspace que estava sob suporte.
- Workspace suspenso pode virar dead-end: o controle de suporte exige workspace ativo, dificultando iniciar nova sessão para reativar a conta.
- `/kanban` é referenciado pela sidebar e por cards, mas não possui `Route` no `App.tsx`; o usuário cai em NotFound.
- Não existe ticket/kanban de suporte administrativo. O Kanban existente é apenas pipeline de leads do workspace.
- Sessões e abas do console não são plenamente canônicas na URL; refresh/back/forward podem reabrir sessão antiga ou manter estado visual expirado.
- Dashboard, Atendimento e Funil medem entidades diferentes: mensagens, contatos, unread e stages. O Dashboard não lê mensagens/eventos inbound; o Funil pode ocultar stages inválidos; unread de contato e conversa pode divergir.
- A conexão QR fica abaixo da primeira dobra no mobile, sem expiração/stale/retry/foco de fluxo.
- O bundle inicial é monolítico e CTAs desaparecem no mobile; há scrolls aninhados no Inbox.
- Billing/quotes ainda contém caminhos com `ensureDemoWorkspace()` e procedures insuficientemente protegidas. Não criar teste de planos antes de corrigir tenancy.
- Não existe modelo comercial real de assinatura nem base de dados LGPD/consentimento/termos/privacidade.

### Ordem aprovada

1. Corrigir retorno do console, workspace suspenso, guards e `/kanban`.
2. Corrigir quotes/billing tenant-aware e adicionar testes negativos.
3. Corrigir e validar QR/Conexão WhatsApp em Docker real.
4. Definir e implementar KPIs, unread, status, stages e atualização cross-screen.
5. Corrigir mobile, scroll, foco, acessibilidade e code splitting.
6. Criar tickets/kanban de suporte.
7. Criar catálogo de serviços com preço fixo, a partir e orçamento.
8. Criar assinatura/consumo com planos em sandbox, sem cobrança real.
9. Implementar LGPD, termos, privacidade, cookies e consentimentos versionados.
10. Só então abrir landing/signup e ampliar o beta.

### Regra de continuidade

Não usar `ensureDemoWorkspace()` em novos fluxos tenant-aware, não esconder falhas de integração com números artificiais e não ativar cobrança real. O próximo bloco de código deve ser P0.1/P0.2/P0.3, com testes de platform-only, workspace suspenso e dois workspaces.


---
## Execução do bloco P0 — 2026-09-27

O bloco P0 foi implementado e validado no sandbox.

### Código alterado

- `client/src/pages/PlatformAdminPage.tsx`: o rodapé do console agora retorna para `/platform-admin`, nunca para `/dashboard`; a sessão administrativa sincroniza o `sessionId` na URL ao escalar para operador e limpa a URL ao iniciar novamente depois de expiração/erro.
- `server/db.ts`: adicionada `getWorkspaceById`, sem filtro de `active`, para uso exclusivo do controle-plane; quotes agora recebem `workspaceId` explícito, filtram contato/quote pelo tenant e atualizam quote somente dentro desse tenant.
- `server/platform-admin.ts`: `startSupportSession` passa a abrir sessão read-only/operator também para workspace suspenso, permitindo reativação pelo console após logout ou expiração.
- `client/src/App.tsx`: rota `/kanban` registrada; faturamento visualmente protegido por `manager`.
- `server/routers.ts`: `billing.quotes`, `createQuote` e `updatePayment` passaram de `protectedProcedure` para `requireManager` e usam `ctx.workspace.workspaceId`.

### Validação

- `pnpm check`: passou.
- `pnpm build`: passou; permanece o aviso conhecido de bundle inicial grande, reservado para P1 de performance.
- `pnpm test -- --runInBand`: 62 testes passaram e 31 ficaram skipped por dependência de PostgreSQL/staging sem `DATABASE_URL`; nenhuma falha ocorreu.
- `git diff --check`: passou.

### Limitação ainda pendente

A prova de dois tenants, workspace suspenso e billing cruzado ainda precisa rodar em PostgreSQL real/staging. O próximo passo é adicionar/ativar essa cobertura de integração e fazer validação browser do console, incluindo suspensão → logout → novo login → reativação.


---
## Execução P1.1 — Conexão WhatsApp/QR — 2026-09-27

A aba de integrações foi reorganizada para ser exclusivamente a área de **Conexão WhatsApp**. A seleção de múltiplos provedores foi retirada da experiência comum e o texto agora deixa explícito que há uma única instância por workspace. O bloco duplicado de configuração foi removido; a tela concentra conexão, QR e consumo do workspace.

O card de QR agora exibe `updatedAt`, contador de expiração de 60 segundos, estado de QR stale/expirado, retry manual, mensagens de erro, foco/rolagem para o QR quando ele chega e ações dimensionadas para mobile. O QR continua sendo consultado apenas enquanto o gateway informa estado `qr`; resposta 404 de QR transitório não vira erro fatal na interface.

No gateway, `POST /connect` passou a usar `reconnect()`, encerrando a sessão atual e iniciando outra para renovar um QR que não foi lido. Foi adicionada proteção para que a reconexão automática não seja disparada depois de uma desconexão manual. O proxy agora repassa `updatedAt` e aceita `phone`/`phoneNumber`.

Validação concluída: TypeScript do painel aprovado; build do painel aprovado com o alerta já conhecido de bundle inicial grande; TypeScript direto do gateway aprovado; testes HTTP, auth e sessão do gateway aprovados com 15 testes. O wrapper `pnpm --dir forte-whatsapp` tentou reinstalar dependências e foi bloqueado pelo policy de scripts ignorados, então a validação do gateway foi executada diretamente pelos binários locais, sem alterar dependências versionadas.

Ainda falta validação browser real com Docker e um número de teste. O próximo gate é confirmar o ciclo `desconectado → conectar → QR → atualizar QR → conectado → desconectar/logout`, inclusive em largura mobile.

---
## Auditoria de melhoria contínua e planejamento de cadastro por áudio e pagamentos — 2026-09-27

Esta etapa não alterou código de produto. Ela fez uma varredura nova do repositório e produziu um plano para três frentes pedidas: o que mais pode ser melhorado na base, como estruturar o funil de cadastro em que o lead responde por áudio sobre o próprio negócio, e como tratar pagamentos, já que a área de orçamento atual não oferece as escolhas necessárias.

### Documento criado

`PLANO-CADASTRO-AUDIO-E-PAGAMENTOS-2026-09-27.md` — contém os 26 achados com evidência de arquivo e linha, os 10 blocos do funil de cadastro com pergunta falada, campos estruturados e destino no modelo, o pipeline de conversão de áudio em dado validado, o checklist de operação do dono, o modelo completo de orçamento e pagamento, o faseamento de provedor e a ordem de execução B0–B8.

### Achados mais relevantes

1. `onboarding.profile`, `onboarding.save` e as telas `/onboarding`, `/ai-config`, `/ai-prompt` são exclusivos do operador da plataforma (`requirePlatformAdministrator` e `PlatformOnlyGuard`). O dono do negócio não configura a própria empresa e a IA, o que contraria o autoatendimento previsto em `PRODUCT_SCOPE.md`.
2. Não existe cadastro público, verificação de e-mail, convite, recuperação de senha nem consentimento versionado. O funil pedido depende dessa base de identidade.
3. `auth.localLogin` não tem limite de tentativas, atraso progressivo, lockout ou auditoria de falha.
4. O cookie usa `sameSite: "none"` em HTTPS e não há checagem de `Origin`/`Referer` nas mutações tRPC.
5. `messages_external_id_unique_idx` é único globalmente em `externalId`, apesar de a checagem de duplicidade no código ser por workspace: dois tenants podem colidir no banco.
6. `contacts.workspaceId` continua anulável; a migration `0017` já demonstrou o padrão correto de backfill e `SET NOT NULL`.
7. `contacts.quoteCents` é desnormalizado, nunca recalculado, e o Dashboard soma esse campo; `receivedMonthCents` está fixo em `0`.
8. `unreadCount` é incrementado no inbound e nunca limpo: não há marcação de leitura para contatos.
9. `listInboxContacts` não tem paginação.
10. `inbox.moveStage` aceita qualquer estágio; a lista canônica existe só no cliente de demonstração.
11. Workspace suspenso devolve a mensagem de membership ausente, confundindo suspensão com falta de vínculo.
12. `resetWorkspaceDevelopmentData` ainda cai em `ensureDemoWorkspace()` e apaga `workspaceSettings`, incluindo segredos criptografados.
13. `DEMO_MODE` é fail-open (`!== "false"`), então um staging sem a variável nasce com dados fictícios.
14. Há branding fixo de um cliente único no título do app, no Dashboard, na sidebar e nos seeds.
15. A sidebar mostra "Canais conectados" enquanto a tela já se chama "Conexão WhatsApp".
16. Existem duas `BillingPage`; a versão com dados fictícios em `PanelPages.tsx` continua importada e empacotada.
17. Faltam índices em `quotes(workspaceId, createdAt)` e `messages(conversationId, createdAt)`.
18. Não há lint, e `check`/`build` não rodam em pull request.
19. `pnpm.patchedDependencies` e `pnpm.overrides` estão no local que o pnpm 10 ignora; o patch de `wouter` provavelmente não é aplicado.
20. `template.json`, `ComponentShowcase.tsx`, `client/public/__manus__/debug-collector.js` e scripts `.py` de patch pontual continuam versionados.
21. A árvore `drizzle/` legada em MySQL convive com a canônica `drizzle-pg/`.
22. Não há README nem LICENSE, com 29 documentos e sobreposição de roadmap/handoff.
23. Não há correlation ID nem logging estruturado.
24. Nada de LGPD foi implementado (consentimento, exportação, exclusão, retenção de dados pessoais).
25. `.env.local.example` tem o bloco `BAILEYS_*` duplicado.
26. O bundle inicial permanece em um único chunk de 691,20 kB.

### Planejamento do cadastro por áudio

O áudio é entrada opcional e o dado estruturado confirmado pelo dono é a fonte de verdade. O funil tem 10 blocos (conta, identidade, oferta, execução, agenda, atendimento/IA, política comercial, recebimento, canal, revisão/publicação), com pergunta falada sugerida, campos estruturados obrigatórios e destino no modelo. A conversão passa por captura com `MediaRecorder`, upload em storage privado com URL assinada, transcrição pelo serviço já existente em `server/_core/voiceTranscription.ts` (hoje sem nenhuma rota ligada), estruturação por LLM com schema validado e confiança por campo, perguntas de acompanhamento apenas nos campos vazios ou incertos, pré-preenchimento em rascunho, revisão bloco a bloco e publicação versionada. Modelo proposto: `onboardingSessions`, `onboardingStepAnswers`, `onboardingAudioAssets`, `onboardingChecklistItems` e `consentRecords`. Guardas: consentimento de voz, retenção do áudio bruto, descarte de campos com termos sensíveis, PII mínima e formulário como fallback garantido.

### Planejamento financeiro

Hoje o faturamento é um contador manual por orçamento. O plano foi corrigido para tratar isso como controle operacional interno: cria `quoteItems`, condição comercial, `quotePayments` como registro manual imutável, `paymentReceipts` e `workspacePaymentSettings` para enviar a chave Pix. O empresário ou funcionário informa valor, data e meio (Pix, maquininha, dinheiro, transferência ou outro) depois/antes do procedimento; o Forte Panel não cobra o cliente final, não oferece gateway, checkout, boleto, link, integração com maquininha ou confirmação automática de liquidação. A cobrança do próprio SaaS continua separada e documento fiscal fica fora do escopo.

### Validação executada nesta etapa

- `pnpm install --frozen-lockfile`: concluído, com o aviso de que o pnpm 10 ignora `pnpm.patchedDependencies`/`pnpm.overrides` e de que os scripts de build de `@tailwindcss/oxide` e `esbuild` foram ignorados.
- `pnpm check`: aprovado, sem erro de tipo.
- `pnpm test`: 62 testes aprovados e 31 ignorados (16 arquivos aprovados, 11 ignorados); os ignorados dependem de `DATABASE_URL`.
- `pnpm build`: aprovado, com o aviso conhecido de chunk inicial de 691,20 kB.

### Próximo passo

Fechar P0 vigente e provar dois tenants, workspace suspenso e billing em PostgreSQL/staging (B0), depois atacar B1 de segurança de identidade (rate limit, origem, unread/leitura, índices, deduplicação por tenant e `contacts.workspaceId NOT NULL`), antes de começar B2 de cadastro e B3 de onboarding estruturado.


### Reconciliamento da auditoria anexada — 2026-09-27

A auditoria recebida após o primeiro plano acrescentou uma distinção reutilizável: **onboarding do negócio** (empresário configura catálogo, equipe, agenda e IA) é diferente do **lead intake conversacional** (cliente final responde no WhatsApp). O `OnboardingPage` atual pertence ao primeiro fluxo; o segundo precisa de `leadIntakeSessions`, perguntas versionadas, respostas com proveniência, consentimento, mídia, transcrição e handoff.

Foram incorporados ao plano os achados adicionais: consentimento `consent_pending` antes de STT/LLM; validação de áudio real do Baileys em vez de aceitar placeholder; remoção de data URL do `metadata` produtivo; entidade de mídia com hash/retenção/ownership; `instanceId` relacional e validação de channel/secret/workspace; pipeline assíncrono com status; outbox/idempotência para retries concorrentes; handoff com `controlVersion`/fencing token para cancelar resposta de IA quando humano assumir; questionário versionado uma pergunta por turno; auditoria de ouvir/baixar/corrigir/exportar/excluir; e fallback textual/humano acionável.

### Correção de escopo financeiro

A orientação do produto foi corrigida: o cliente do empresário **não será cobrado pela plataforma**. O Forte Panel não terá gateway, checkout, boleto, link de pagamento, integração com maquininha, cobrança automática ou armazenamento de cartão nesta fase. O empresário ou seus funcionários recebem diretamente na loja, por maquininha, Pix, dinheiro ou outro meio e apenas lançam manualmente o recebimento no painel. A plataforma pode enviar a chave Pix do workspace pelo WhatsApp; ela não confirma automaticamente a liquidação. O modelo financeiro agora é operacional: condição combinada, chave Pix, registro manual, recibo/extrato e auditoria.

A mesma auditoria de CRM acrescentou: impedir `auditLogs` quando a mutação cross-tenant não alterou linha; normalizar telefone/JID; responder pela instância de origem; formalizar caixa compartilhada versus ACL; separar `awaiting_response` de unread; exibir estados queued/processing/sent/failed; corrigir `daysNoReply` e timezone dos KPIs; registrar histórico/SLA de stages; e definir ciclo de vida/proveniência de lead. Esses itens foram adicionados ao B1/B2 e ao `todo.md`.


### Guia recebido do DeepSeek e decisão de produto — 2026-09-27

O guia de 72 perguntas foi considerado correto como mapa de descoberta, mas inadequado como formulário linear de criação de conta. A decisão é usar o [`GUIA-LEVANTAMENTO-ONBOARDING-ASSISTIDO-IA.md`](./GUIA-LEVANTAMENTO-ONBOARDING-ASSISTIDO-IA.md): núcleo P0 curto em 10 blocos, perguntas condicionais por segmento, aprofundamento progressivo e retomada. O prestador escolhe áudio ou texto e pode alternar entre os dois; formulário textual sempre permanece como fallback.

A pipeline prevista é captura → transcrição → extração em JSON validado → identificação de lacunas/conflitos → rascunho de prompt → resumo com exemplos → correção/aceite humano → publicação versionada → simulação → ativação. A IA pode fazer o trabalho pesado de redação, mas não inventa preço, prazo, serviço, disponibilidade, política ou promessa. O prompt publicado terá versão, origem dos fatos, autor, data e rollback.

O administrador da plataforma terá acesso de suporte a respostas originais, transcrições, fatos extraídos e versões do prompt somente com workspace autorizado, motivo, masking e auditoria. Poderá sugerir correções e montar rascunhos para o prestador aprovar; não poderá publicar silenciosamente no lugar do cliente. A execução foi ordenada como P0 fundação, P1 onboarding textual, P2 áudio e P3 console de suporte/LGPD.


### Ajuste de UX da revisão do prompt — 2026-09-27

Correção de produto: não mostrar um prompt completo longo como etapa 10 do cadastro. Depois de cada resposta/bloco, a IA deve mostrar somente a regra curta daquela área, com um exemplo e ações rápidas para confirmar, corrigir ou deixar para depois. No fim, mostrar um resumo curto das decisões, lacunas e conflitos; o prompt consolidado completo fica disponível apenas por link/accordion opcional. A publicação continua exigindo confirmação, mas a leitura integral não é obrigatória.


### Roteamento de resposta pela origem da conversa — 2026-09-27

O próximo slice técnico foi concluído: `sendManualMessage` agora lê o provider e os metadados da mensagem inbound mais recente, preserva `instanceId` e JID, e grava `routingSource=inbound_origin`. O `defaultPapiWebhook` só é consultado quando a conversa é legada e não possui origem registrada; nesse caso a mensagem fica marcada como `routingSource=legacy_default`. Metadados enviados pelo operador não podem sobrescrever a rota validada. Foram adicionados testes puros para provider/instância/JID e para o fallback legado.


### Normalização de telefone e JID — 2026-09-27

O slice seguinte foi concluído com helpers compartilhados em `server/_core/phone.ts`. Inbound e `upsertApiContact` normalizam a chave antes do lookup/insert, evitando duplicidade entre `+55 (11) 99999-9999`, `55 11 99999-9999` e o JID equivalente. Identidades `@lid` e `@g.us` ficam distintas (`lid:`/`group:`), enquanto o JID normalizado permanece no metadata para roteamento. Os adapters PAPI/Baileys/Meta usam a regra compartilhada e PAPI preserva o JID no destinatário quando disponível. Foram adicionados 4 testes de normalização; a migração/deduplicação de registros históricos deve ser feita em staging.


### Auditoria de duplicidades de contatos — 2026-09-27

Foi criado `scripts/audit-contact-duplicates.ts`, em modo somente leitura. Uso: `pnpm exec tsx scripts/audit-contact-duplicates.ts --workspace=<id> --json`. O comando consulta apenas `contacts`, agrupa por workspace e chave canônica, reporta IDs, telefones e nomes envolvidos e não mescla, exclui ou atualiza nada. Também não cruza automaticamente LID/grupo com telefone comum.

A consolidação histórica permanece pendente e deve ocorrer em staging: revisar cada grupo, escolher o contato canônico, migrar referências de conversas/mensagens/notas/orçamentos/agendamentos com transação e backup, validar contagens e só então executar uma migração aprovada. Nunca rodar uma mesclagem automática em produção.


### Contrato de estado da Inbox — 2026-09-27

Foi definido em `server/_core/conversation-state.ts` que `unread` e `awaitingResponse` são estados diferentes. `unread` representa mensagem inbound ainda não lida pelo operador. `awaitingResponse` representa a última atividade outbound com status `sent`, indicando que o negócio respondeu e aguarda o lead. A última inbound indica necessidade de resposta do operador; outbound `queued`, `processing` ou `failed` não conta como resposta entregue.

Foram adicionados quatro testes cobrindo outbound aceito, inbound novo, outbound falho e desempate por ID no mesmo timestamp. A integração nas consultas da Inbox/Dashboard e a leitura transacional por usuário ainda são o próximo slice, pois exigem decidir a persistência da leitura e evitar divergência entre `contacts.unreadCount` e `conversations.unreadCount`.


### Decisão sobre cadastro público e login administrativo — 2026-09-27

O cadastro público inicial do cliente será **e-mail + senha**, criando o owner e um workspace com status `onboarding`. Isso é separado do `platform_admin`: `LOCAL_ADMIN_EMAIL`, `LOCAL_ADMIN_PASSWORD`, `PLATFORM_ADMIN_OPEN_IDS`/`OWNER_OPEN_ID` permanecem apenas como bootstrap operacional do Forte Panel e, em produção, devem vir de secret manager e ser rotacionáveis. Não haverá senha global compartilhada entre clientes.

Confirmação de e-mail será construída para uma fase posterior, atrás de `EMAIL_VERIFICATION_ENABLED=false`, e permanecerá desligada até configurar domínio, remetente, secrets e provedor de envio. Google OAuth e outros provedores também ficam planejados atrás de feature flag desligada; não devem bloquear o signup inicial por e-mail/senha. O cadastro público ainda não foi aberto: faltam implementação, consentimento, recuperação, validação de staging e gates de segurança.

A próxima fatia de código, após esta decisão, continua sendo integrar `awaitingResponse` nas consultas da Inbox/Dashboard e separar a leitura transacional por operador. Depois disso vem o signup público inicial.


### Integração do estado da Inbox e decisão de cadastro — 2026-09-27

O contrato `awaitingResponse` foi integrado ao backend: `listInboxContacts` busca as atividades por workspace e deriva o estado pela última mensagem; `getDashboardSnapshot` deixou de usar `unreadCount` como proxy e passa a contar apenas conversas cuja última outbound está `sent`. A API agora expõe `awaitingResponse` e `needsOperatorResponse`, e o rótulo do KPI foi corrigido para “Última resposta enviada”. `unread` continua sendo somente a contagem de inbound não lida; leitura transacional por operador ainda falta.

Também foi formalizado que o cadastro público inicial será e-mail + senha para owner/workspace em `onboarding`. O `platform_admin` permanece separado, com bootstrap por secrets de deployment. Confirmação de e-mail (`EMAIL_VERIFICATION_ENABLED=false`) e Google OAuth ficam planejados e desligados até configurar os provedores. O cadastro público não foi aberto neste slice.


### Convites de funcionários e permissões — 2026-09-27

A abordagem aprovada é convite individual por workspace: owner/admin envia link one-time com token armazenado somente como hash; o funcionário aceita pelo e-mail convidado, cria a própria senha e recebe membership com papel/perfil pré-definidos. Convites podem expirar, ser reenviados (invalidando o anterior), revogados e auditados.

A autorização será RBAC + escopo/assignment, aplicada no servidor: owner/admin/manager/agent/professional não são apenas rótulos de UI. Atendente vê o histórico e os dados necessários para responder clientes, além de serviços/preços publicados e agenda operacional, mas não recebe faturamento consolidado, margem, secrets, chave Pix em claro, prompt administrativo, exportação ampla ou gestão de equipe por padrão. Inbox completa só será liberada por decisão explícita do workspace; o padrão recomendado é fila/assignment. A matriz detalhada está em `GUIA-CONVITES-E-PERMISSOES.md`.

Próximos itens: implementar `workspaceInvites`/aceite/revogação, capacidades server-side, escopos de Inbox e testes negativos por papel. Confirmação de e-mail e Google OAuth continuam planejados e desligados até configuração de provedores.


### Fundação backend de convites de funcionários — 2026-09-27

Foi implementada a migration `0024_workspace_invites` e as procedures tenant-aware para criar, listar, revogar e aceitar convites. O convite guarda somente `tokenHash`, expira em 72 horas, invalida convites pendentes anteriores para o mesmo e-mail/workspace, registra auditoria e cria a conta local com senha própria e membership no papel concedido. O aceite é transacional, rejeita convite expirado/revogado/aceito e nunca promove o funcionário a `platform_admin`.

As rotas protegidas `workspace.invites.list/create/revoke` exigem owner/admin; `auth.acceptInvite` é pública e recebe token, nome e senha. O token bruto retorna somente na criação para a futura UI/link; a resposta não expõe o hash armazenado. Ainda falta tela de gestão de convites, envio de e-mail, link público de aceite e matriz completa de capabilities/assignment.


### UI de convites e aceite público — 2026-09-27

A tela `TeamPage` foi migrada de criação direta com senha para convite: owner/admin escolhe e-mail, nome, papel e perfil operacional; a procedure cria o convite e a tela mostra o link uma única vez, copiando-o quando o navegador permite. A tela lista convites, status e permite revogar pendentes.

Foi criada `InviteAcceptPage` em `/invite/:token`: o funcionário informa nome e cria a própria senha; o token é enviado a `auth.acceptInvite`, e, após sucesso, a pessoa é direcionada ao login. O login foi atualizado para mencionar cadastro ou convite. O envio automático de e-mail continua desligado por decisão de produto; o link é manual/controlado nesta fase.

Validação pendente deste slice: typecheck, suíte completa e build. Próximas extensões: recuperação de senha, signup público do owner, assignment de Inbox e envio transacional quando o provedor estiver configurado.


### Auditoria de clareza e facilidade — 2026-09-27

Foi criada `GUIA-UX-CLAREZA-E-FACILIDADE.md` com a revisão de produto para clientes leigos e funcionários. A maior melhoria recomendada é um checklist de primeiro acesso com um único próximo passo, progresso, autosave, “fazer depois” e retomada. A navegação deve separar configurar negócio, atender clientes, acompanhar resultados e administrar equipe.

Também foram priorizados: linguagem de negócio no lugar de provider/webhook/prompt; estados vazios e erros com explicação e ação; ajuda contextual por campo; navegação inicial por papel; preview curto e simulação antes de publicar; clareza de que recebimento manual não é gateway nem confirmação bancária; separação visual entre original, transcrição, fatos, regra redigida, regra confirmada e prompt publicado.

Essa auditoria é de produto/UX e não alterou comportamento de código neste slice. O próximo bloco funcional continua sendo capabilities/escopos server-side e leitura transacional da Inbox; o checklist de primeiro acesso entra como P0 de UX antes do onboarding público completo.


---
## Atualização do handoff — 2026-09-27 12:17 — leitura transacional da Inbox

O bloco seguinte ao contrato `awaitingResponse` foi implementado. A Inbox não usa mais os contadores globais `contacts.unreadCount`/`conversations.unreadCount` para representar a leitura individual do operador autenticado.

### Implementado

- Migration `drizzle-pg/0025_conversation_reads.sql` e registro no journal PostgreSQL.
- Tabela `conversationReads` com cursor por `workspaceId + conversationId + userId`, `lastReadMessageId`, `readAt` e `updatedAt`.
- `listInboxContacts(workspaceId, viewerUserId)` calcula `unreadCount` contando apenas mensagens inbound posteriores ao cursor daquele operador.
- `markConversationRead` grava o maior ID de mensagem da conversa dentro de uma transação e valida a conversa pelo workspace do contato.
- Procedure `inbox.markRead`, com `NOT_FOUND` para conversa inexistente ou fora do tenant.
- A thread aberta no painel marca a conversa como lida uma vez por última mensagem; se uma nova inbound chegar, um novo cursor é necessário e o badge reaparece.
- O contador da Inbox no shell agora também funciona para membros não-gerentes que possuem a capability de operação.
- Capabilities server-side explícitas `canUseInbox`, `canSendMessages` e `canManageInbox` foram adicionadas ao contexto e ao contrato `auth.access`. Como assignment/fila ainda não existe, a política atual continua sendo caixa compartilhada para todo membro ativo.
- Procedures da Inbox passaram a usar guards de capability em vez de `protectedProcedure` diretamente.
- Teste PostgreSQL `server/inbox-read-state.test.ts` cobre leitura independente por dois operadores, isolamento entre workspaces e mensagens novas após a leitura; o teste de contrato cobre input inválido de `markRead`.

### Validação

```text
pnpm check ✅
pnpm test ✅ — 87 aprovados, 32 ignorados por dependências externas/PostgreSQL
pnpm build ✅ — warning conhecido de bundle inicial acima de 500 kB
git diff --check ✅
```

O teste de integração ainda está corretamente ignorado neste sandbox sem `DATABASE_URL`; é necessário aplicar a migration e executá-lo em PostgreSQL/staging antes de considerar o gate de isolamento concluído.

### Próximo passo

Implementar o signup público inicial e recuperação de senha preparada, mantendo confirmação de e-mail e OAuth atrás de feature flags desligadas, ou antecipar assignment/fila se a decisão de caixa compartilhada mudar. A matriz completa de escopos por equipe/profissional continua pendente e não deve ser presumida pela capability-base deste bloco.


---
## Atualização do handoff — 2026-09-27 12:29 — signup público inicial

Foi implementado o primeiro fluxo público de identidade do cliente do Forte Panel, separado do bootstrap de `platform_admin`.

### Implementado

- Migration `drizzle-pg/0026_consent_records.sql` e registro no journal.
- Tabela `consentRecords` com `termsVersion`, `privacyVersion`, usuário, workspace e timestamp de aceite.
- `createPublicSignup` executa em transação única: verifica e-mail globalmente, cria workspace com slug seguro e aleatório, cria owner local com hash `scrypt`, cria membership `owner`, registra consentimento e auditoria.
- O workspace nasce com `status = onboarding`, `plan = starter`, timezone `America/Sao_Paulo` e ainda fica ativo para o owner acessar o painel.
- Procedure pública `auth.signup`, protegida por `LOCAL_AUTH_ENABLED`, com nome, e-mail, senha, empresa e aceite obrigatório dos dois documentos.
- Signup gera sessão automaticamente; login posterior deixou de exigir `LOCAL_ADMIN_PASSWORD`, mantendo esse segredo apenas para o administrador de plataforma configurado por ambiente.
- Rate limit independente de signup por IP/e-mail: 3 tentativas em 15 minutos bloqueiam por 30 minutos.
- Tela pública `/signup`, link na tela de login e consentimentos versionados (`2026-09-27.v1`).
- Testes puros de slug, consentimento e rate limit; teste PostgreSQL transacional cobre owner, workspace, membership, hash, consentimento e e-mail duplicado.

### Validação

```text
pnpm check ✅
pnpm test ✅ — 90 aprovados, 34 ignorados por dependências externas/PostgreSQL
pnpm build ✅ — warning conhecido de bundle inicial acima de 500 kB
`git diff --check` ✅
```

O teste PostgreSQL de signup ainda fica skipped sem `DATABASE_URL`. O cadastro também não deve ser aberto amplamente antes de staging/produção aplicar as migrations, configurar `LOCAL_AUTH_ENABLED=true`, revisar termos/privacidade e concluir recuperação de senha. Confirmação de e-mail e OAuth continuam desligados por decisão de produto.

### Limite conhecido e próximo bloco

A tela `/onboarding` e as procedures de configuração histórica ainda estão guardadas para `platform_admin`; portanto o owner recém-cadastrado entra no dashboard, mas a migração do onboarding de negócio para owner/admin continua pendente. O próximo bloco deve preparar recuperação de senha one-time e, em seguida, mover onboarding/configuração para o owner sem reabrir segredos de plataforma.


---
## Atualização do handoff — 2026-09-27 12:34 — recuperação de senha one-time

Foi implementada a base completa de recuperação de senha sem expor token, hash ou existência de conta pela API pública.

### Implementado

- Migration `drizzle-pg/0027_password_reset_tokens.sql` e journal atualizado.
- Tabela `passwordResetTokens` com hash SHA-256 único, expiração de 30 minutos, `usedAt`, `revokedAt` e índices de consulta.
- `auth.requestPasswordReset` aceita e-mail normalizado, aplica rate limit independente e sempre retorna `{ success: true }` quando o recurso está habilitado, sem revelar se a conta existe.
- `auth.resetPassword` aceita apenas token com formato válido e senha forte; respostas de token inválido, usado, revogado ou expirado são genéricas.
- Solicitar novo token revoga tokens pendentes anteriores para a mesma conta.
- Consumo do token acontece em transação com lock; após sucesso, a senha é atualizada com `scrypt`, tokens anteriores são revogados, `sessionVersion` é incrementado e sessões existentes deixam de ser válidas.
- Auditoria `password_reset_completed` é criada para cada workspace ativo do usuário.
- Telas `/forgot-password` e `/reset-password`; login agora oferece o link de recuperação.
- Rate limit de recuperação: 5 solicitações em 15 minutos por IP/e-mail, bloqueio de 30 minutos.
- Testes PostgreSQL cobrem revogação do token anterior, uso único, troca de senha e invalidação de sessões; os testes puros cobrem o limite de abuso.

### Validação

```text
pnpm check ✅
pnpm test ✅ — 92 aprovados, 35 ignorados por dependências externas/PostgreSQL
pnpm build ✅ — warning conhecido de bundle inicial acima de 500 kB
`git diff --check` ✅
```

A entrega automática por e-mail ainda não está conectada: o backend não retorna o token e a tela informa que o provedor precisa estar configurado. Para produção, conectar um provider transacional que consuma internamente o token e gere `/reset-password?token=...`; não imprimir o token em logs nem devolvê-lo em `requestPasswordReset`.

### Próximo passo

Conectar o provider de e-mail/entrega transacional atrás de configuração segura e mover o onboarding/configuração histórica de `platform_admin` para owner/admin. O signup e o reset não devem ser abertos em produção antes da validação PostgreSQL/staging e revisão legal.


---
## Atualização do handoff — 2026-09-27 12:42 — adapter de e-mail preparado sem envio

A decisão desta etapa foi **preparar sem envio agora**. Foi adicionado um adapter provider-agnostic em `server/_core/email.ts`, com montagem do assunto/texto e URL `/reset-password?token=...`, sem dependência de fornecedor e sem chamada de rede.

### Configuração

- `EMAIL_DELIVERY_ENABLED=false` por padrão.
- `EMAIL_PROVIDER=none` por padrão; valores previstos: `smtp`, `resend`, `postmark` e `sendgrid`.
- `EMAIL_FROM` e `PUBLIC_APP_URL` documentados.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` e `SMTP_PASSWORD` reservados para a opção SMTP, sem valores reais no repositório.
- Providers desconhecidos são normalizados para `none` e nunca ficam prontos por acidente.
- A camada de preparação não é uma entrega: o reset público continua sem devolver token e nenhum segredo é impresso em logs.

### Validação

```text
pnpm check ✅
pnpm test — 94 aprovados, 35 ignorados; adapter ✅
`git diff --check` ✅
```

O próximo bloco é mover onboarding/configuração histórica de `platform_admin` para owner/admin. A ativação do e-mail ficará para quando o provider, domínio, remetente e secrets forem escolhidos e configurados; a integração efetiva deve consumir o token internamente, chamar o provider e manter a resposta pública genérica.


---
## Atualização do handoff — 2026-09-27 12:54 — onboarding textual para owner/admin

O onboarding textual da empresa deixou de ser exclusivo do `platform_admin`.

### Implementado

- Novo guard server-side `requireOnboardingEditor`: aceita `owner`/`admin` com `canManageTeam` no workspace ou `platform_admin` de suporte.
- `onboarding.profile` e `onboarding.save` agora usam esse guard.
- Salvamento e publicação geram auditoria `onboarding_saved`/`onboarding_published` com o usuário que executou a ação.
- Nova `OnboardingGuard` no frontend; a rota `/onboarding` permite owner/admin e continua permitindo suporte de plataforma.
- Sidebar exibe **Configurar empresa** somente para perfis com `canManageTeam` e visão completa de agenda.
- `/ai-config`, `/ai-prompt` e operações sensíveis de agente continuam atrás de `PlatformOnlyGuard`/`requirePlatformAdministrator`; não foram abertos por engano.
- Teste de autorização confirma que usuário globalmente `admin`, mas sem membership, não acessa onboarding.

### Validação

```text
pnpm check ✅
pnpm test ✅ — 95 aprovados, 35 ignorados por dependências externas/PostgreSQL
`git diff --check` ✅
```

A próxima extensão é revisar o onboarding estruturado (checklist, catálogo, canal e publicação) e decidir se alguma configuração não sensível de IA deve ganhar capability própria; secrets, prompt administrativo e reset da plataforma permanecem fora do workspace owner/admin.


---
## Atualização do handoff — 2026-09-27 12:57 — checklist estruturado do onboarding

Foi entregue a primeira fatia estruturada do onboarding sem criar ainda o funil de áudio/sessões.

### Implementado

- `getOnboardingChecklist` deriva seis etapas dos fatos já persistidos no perfil: identidade, oferta, área/horários, limites do atendimento, tom/FAQ e revisão/publicação.
- A resposta de `onboarding.profile` agora inclui itens, contagem, percentual, `requiredComplete`, `readyToPublish` e `nextStep`.
- `onboarding.save({ publish: true })` bloqueia server-side publicação se identidade, oferta, operações ou limites do atendimento estiverem incompletos; rascunho continua permitido.
- Erro de publicação incompleta chega ao usuário como mensagem de negócio, sem erro interno.
- A tela mostra percentual, barra de progresso, próximo passo único e status de cada etapa.
- A publicação continua sendo a única ação que altera o prompt operacional; salvar rascunho não publica.
- Testes puros cobrem falha fechada com campos faltantes e publicação somente após fatos obrigatórios completos.

### Limite consciente

Ainda não foram modelados `onboardingSessions`, respostas por bloco, áudio, autosave, “fazer depois”, retomada ou checklist persistente independente do perfil. Também não foram abertos secrets, prompt administrativo ou configuração nativa da IA para owner/admin.

### Validação

```text
pnpm check ✅
pnpm test direcionado ✅ — 97 aprovados, 35 ignorados
```

Próximo corte: autosave/retomada do onboarding ou modelagem da primeira sessão estruturada, escolhendo um deles antes de adicionar áudio e LLM.


---
## Atualização do handoff — 2026-09-27 13:00 — autosave e retomada do onboarding

Foi implementado autosave do rascunho atual com retomada automática ao reabrir a tela.

### Implementado

- Nova procedure `onboarding.autosave`, usando o mesmo guard owner/admin/platform support do onboarding.
- Autosave salva somente `publish: false`; nunca publica prompt nem cria auditoria de negócio a cada tecla.
- Frontend espera 1,2 segundo após a última alteração antes de enviar o rascunho.
- Estados visíveis: alterações pendentes, salvando, rascunho salvo e falha com fallback para salvar manualmente.
- Ao retornar à tela, `onboarding.profile` carrega o último rascunho salvo e o checklist/progresso continuam disponíveis.
- Salvar manualmente ou publicar continua gerando a auditoria correspondente; autosave não gera ruído de auditoria.

### Validação

```text
pnpm check ✅
pnpm test direcionado ✅ — 97 aprovados, 35 ignorados
`git diff --check` ✅
```

“Fazer depois” e retomada entre múltiplas sessões/blocos ainda não possuem modelo explícito; esta etapa retoma o último perfil salvo no workspace.


---
## Atualização do handoff — 2026-09-27 13:03 — sessão persistente do onboarding

Foi criada a primeira entidade explícita de sessão do onboarding para sustentar pausa e retomada.

### Implementado

- Migration `0028_onboarding_sessions` e tabela tenant-aware com uma sessão por workspace.
- Estados persistidos: `active`, `paused` e `completed`.
- Cursor `currentStep`, `lastActivityAt`, `pausedAt`, `completedAt` e usuário que iniciou/retomou.
- Procedures protegidas por `requireOnboardingEditor`:
  - `onboarding.session`;
  - `onboarding.start`;
  - `onboarding.defer`.
- A tela inicia ou retoma automaticamente a sessão ao abrir.
- Botão **Fazer depois** pausa a sessão e retorna ao dashboard.
- Salvamento/autosave avança o cursor para o próximo item; publicação completa marca a sessão como `completed`.
- Eventos de iniciar/retomar e pausar ficam auditados, sem expor dados sensíveis.
- Usuário sem membership não pode criar sessão mesmo que o role global seja admin.

### Limite consciente

A sessão ainda aponta para o perfil estruturado existente; respostas por bloco (`onboardingStepAnswers`), múltiplas sessões, áudio e “fazer depois” com lembrete no dashboard continuam fora desta fatia.

### Validação

```text
pnpm check ✅
pnpm test direcionado ✅ — 98 aprovados, 35 ignorados
`git diff --check` ✅
journal JSON ✅
```

Próximo corte: mostrar no dashboard o cartão de retomada ou modelar respostas por bloco; não adicionar áudio/LLM antes de escolher o formato das respostas.


---
## Atualização do handoff — 2026-09-27 13:13 — cartão de retomada no dashboard

O dashboard agora consulta a sessão de onboarding somente para perfis administrativos (`canManageTeam` ou suporte de plataforma).

- Sessões `active` e `paused` aparecem em um cartão **Retome de onde parou**.
- O cartão mostra o status e o título do `currentStep`.
- O CTA leva diretamente para `/onboarding`, onde o rascunho é carregado e a sessão é retomada.
- Sessões `completed` não ocupam espaço no dashboard.
- Atendentes e profissionais não recebem a query protegida nem veem o cartão.

Validação do slice: `pnpm check`, `pnpm test` (98 aprovados, 35 ignorados) e `git diff --check` passaram.


---
## Atualização do handoff — 2026-09-27 13:16 — respostas estruturadas por bloco

Foi criada a fundação de `onboardingStepAnswers` sem remover o perfil JSON compatível.

A migration `0029_onboarding_step_answers` vincula cada resposta a `sessionId`, `workspaceId` e `stepKey`, guardando `answer` como JSON textual, `source`, `status`, `updatedBy` e timestamps. O perfil atual é projetado deterministicamente em cinco blocos: `identity`, `offering`, `operations`, `guardrails` e `voice`.

Autosave e salvamento manual fazem upsert desses blocos; publicação marca as respostas como `confirmed`, enquanto rascunhos permanecem `draft`. `onboarding.profile` também retorna `stepAnswers` para a próxima UI bloco a bloco. A chave única por sessão/bloco impede duplicação.

A fonte de compatibilidade continua sendo `onboarding_profile`; não há ainda editor separado por bloco, ingestão de áudio ou extração por LLM. Testes cobrem a ordem e o conteúdo do mapeamento, além da autorização tenant-aware.


---
## Atualização do handoff — 2026-09-27 13:21 — revisão humana por bloco

A tela de onboarding agora apresenta `stepAnswers` em uma revisão visual bloco a bloco. Cada bloco mostra os fatos estruturados e os quatro blocos obrigatórios podem ser confirmados individualmente.

A nova procedure `onboarding.confirmStep` registra usuário, workspace e auditoria. O autosave preserva `confirmed` quando o conteúdo do bloco não mudou; qualquer edição rebaixa somente aquele bloco para `draft`. A publicação exige tanto os fatos obrigatórios completos quanto a confirmação humana de identidade, oferta, operações e guardrails. O botão de publicar permanece desabilitado no frontend até cumprir os dois critérios, e o backend repete a validação.

A publicação não confirma automaticamente blocos. Isso mantém a separação entre fato extraído/rascunho, fato revisado pelo dono e regra operacional publicada.


---
## Atualização do handoff — 2026-09-27 13:35 — histórico de revisões e bloco opcional

Foi adicionada a migration `0030_onboarding_step_answer_revisions` para manter histórico imutável das alterações em cada resposta estruturada. O histórico registra bloco, sessão, workspace, conteúdo, status, usuário e timestamp.

A leitura de `onboarding.profile` agora retorna as revisões agregadas por bloco. A UI exibe até as cinco mais recentes em cada card. Criação/alteração do conteúdo gera revisão; confirmação humana também gera uma revisão `confirmed`, além da auditoria de ação.

O bloco `voice` agora pode ser confirmado explicitamente, mas continua opcional para publicação. O gate de publicação segue exigindo somente `identity`, `offering`, `operations` e `guardrails` confirmados.

Validação: `pnpm check`, `pnpm test` (99 aprovados, 35 ignorados), `pnpm build`, journal JSON e `git diff --check` passaram.


---
## Atualização do handoff — 2026-09-27 — metadados de qualidade dos blocos

A migration `0031_onboarding_answer_quality` adiciona aos registros atuais e ao histórico os campos `source`, `confidence`, `missing` e `conflicts`.

O formulário atual grava `source=human_form` e `confidence=100` como provenance da entrada humana. `missing` é derivado por campo vazio e `conflicts` inicia vazio, sem fingir que existe inferência de áudio/LLM. Os metadados acompanham as revisões e aparecem no card de revisão.

O contrato agora está preparado para futuras fontes (`transcription`, `llm`, importação) sem permitir que confiança ou ausência substituam a confirmação humana. A publicação continua bloqueada por falta de fatos obrigatórios ou confirmação dos blocos essenciais.


---
## Atualização do handoff — 2026-09-27 — política de qualidade e conflitos

Foi fechada a política de qualidade antes de conectar fontes automáticas. As fontes permitidas agora são `human_form`, `transcription`, `llm` e `import`. A confiança é opcional, mas deve ser inteira entre 0 e 100; entradas de formulário humano exigem confiança 100. Ausências e conflitos precisam ser arrays de strings válidos.

A confirmação de um bloco é recusada enquanto houver conflitos. A publicação também bloqueia conflitos nos blocos obrigatórios, mesmo que o usuário tente chamar a API diretamente. O erro é traduzido para uma mensagem acionável no router. Testes cobrem fonte desconhecida, confiança fora do intervalo, confiança humana inconsistente e campos inválidos.


---
## Atualização do handoff — 2026-09-27 — resolução de conflitos

Foi criada a migration `0032_onboarding_conflict_resolutions`. Owner/admin com acesso ao onboarding podem resolver um conflito usando `accepted_current` ou `dismissed`, sempre com nota obrigatória.

Cada decisão preserva o snapshot anterior do bloco, o conflito original, a decisão, a nota, o usuário e o timestamp. O bloco é rebaixado para `draft`, recebe uma nova revisão e precisa ser confirmado novamente. A procedure é tenant-aware e registra também uma ação de workspace. Conflitos inexistentes ou já resolvidos retornam erro acionável.

A UI exibe as ações diretamente no card do bloco. O gate de publicação continua impedindo publicação enquanto conflitos obrigatórios permanecerem abertos.


---
## Atualização do handoff — 2026-09-27 — governança antes de fontes automáticas

Foi criada a migration `0033_onboarding_governance` com `onboardingSourceConsents` e `onboardingRetentionPolicies`. Owner/admin podem consultar a governança, conceder/revogar consentimento para `transcription` e `llm` e configurar retenção.

Limites atuais: dados brutos de 1–90 dias; dados derivados de 30–3650 dias; retenção bruta não pode superar a derivada. A versão de política padrão é `2026-09-27.v1`. Consentimentos são event-sourced por workspace/source e a leitura usa o evento mais recente.

O helper `assertOnboardingSourceConsent` já está disponível para qualquer futura rotina de transcrição/LLM. Nenhuma rotina automática foi conectada ainda. A política de retenção está persistida, mas ainda não existe worker de limpeza; não declarar os dados automaticamente apagados até essa próxima etapa.

Validação: `pnpm check`, `pnpm test` (101 aprovados, 35 ignorados), `pnpm build`, journal e `git diff --check` passaram.


---
## Atualização do handoff — 2026-09-27 — gate de consentimento para transcrição

O adaptador `server/_core/voiceTranscription.ts` agora exporta `transcribeAudioForWorkspace(workspaceId, options)`. Antes de qualquer `fetch` para o provedor remoto, ele exige consentimento vigente para a fonte `transcription` via `assertOnboardingSourceConsent`.

O comportamento é fail-closed: sem consentimento ou com falha de verificação de infraestrutura, retorna `CONSENT_REQUIRED` e não envia a URL de áudio ao provedor. Foi adicionado teste unitário que verifica explicitamente a ausência de chamada remota.

Ainda não foi criada uma procedure pública `voice.transcribe`: o repositório ainda não possui endpoint de upload privado/URL assinada nem modelo de `onboardingAudioAssets`/`transcriptions`. Não expor uma rota que aceite URL arbitrária evita SSRF, vazamento entre workspaces e processamento sem retenção definida. Próxima fatia segura: modelar os artefatos tenant-aware, implementar upload privado com ownership e só então adicionar a procedure usando `transcribeAudioForWorkspace`.


---
## Atualização do handoff — 2026-09-27 — assets de áudio e transcrição tenant-aware

A próxima fatia segura depois do gate de consentimento foi implementada. O repositório agora possui a migration `drizzle-pg/0034_onboarding_audio_assets.sql`, que cria `onboardingAudioAssets` e `onboardingTranscriptions`. O asset é vinculado a `workspaceId`, `sessionId` e `stepKey`, guarda hash SHA-256, MIME, tamanho, duração, status de transcrição e expiração calculada pela política de retenção do workspace. A transcrição fica separada para permitir retry, status e histórico de resultado sem sobrescrever o arquivo bruto.

As procedures tRPC são `voice.upload` e `voice.transcribe`, ambas protegidas por `requireOnboardingEditor`. O upload exige consentimento vigente para `transcription`, sessão pertencente ao workspace ativo, MIME de áudio suportado, duração de até 120 segundos e tamanho real de até 16 MB. O cliente não informa uma URL de storage: envia somente base64 limitado, o backend valida/decodifica e grava com `storagePut` em uma chave opaca sob o workspace/sessão. A resposta retorna apenas o `assetId` e metadados operacionais, não o `storageKey`.

A transcrição recebe apenas `assetId`, verifica ownership por workspace, exige consentimento novamente, obtém a URL assinada internamente e chama `transcribeAudioForWorkspace`. O claim condicional impede duas execuções simultâneas; assets presos em `processing` por mais de cinco minutos podem ser reassumidos. Texto, idioma, segmentos, provider/modelo, status e códigos de erro são persistidos. Falhas deixam o asset em `failed` para retry e respostas/auditoria não carregam conteúdo bruto ou a URL assinada. O reset de desenvolvimento autorizado limpa os registros novos; a camada de storage não expõe remoção de objetos, então expiração física continua pendente.

Foram adicionados `server/onboarding-audio.ts`, testes unitários de limites/MIME/base64/hash/chave opaca e `server/onboarding-audio-db.test.ts`, que valida isolamento entre workspaces, deduplicação por sessão/hash, claim único e persistência do resultado em PostgreSQL quando o banco estiver disponível.

Validação no sandbox: `pnpm check` passou; `pnpm test` passou com 106 testes aprovados e 37 skipped por dependências externas/PostgreSQL; `pnpm build` passou com o warning conhecido de bundle inicial acima de 500 kB; `git diff --check` e journal JSON passaram. Não há PostgreSQL local nem `DATABASE_URL` nesta sandbox, portanto a migration e o teste de integração ainda precisam ser aplicados/executados em CI/staging.

Próximo bloco recomendado: adicionar captura `MediaRecorder` na `OnboardingPage`, player/status/retry e integração com `voice.upload`; em seguida criar rotina/worker de expiração com dry-run e auditoria, e só depois estruturar transcrições em JSON por bloco com revisão/confiança antes de tocar `onboardingStepAnswers`. O formulário textual continua sendo o fallback obrigatório. Não abrir lead intake público nem ativar processamento sem consentimento.


---
## Atualização do handoff — 2026-09-27 — captura e preview de voz no onboarding

A próxima fatia recomendada foi executada em `client/src/pages/OnboardingPage.tsx`. A tela agora tem um cartão de entrada por voz com seleção do bloco (`identity`, `offering`, `operations`, `guardrails` ou `voice`), gravação via `MediaRecorder`, limite visual de 2 minutos, preview local, descarte/regravação, envio e transcrição.

O microfone fica desabilitado enquanto o consentimento `transcription` não estiver concedido. A captura negocia `audio/webm;codecs=opus`, `audio/webm`, `audio/mp4` ou `audio/ogg;codecs=opus`, normaliza o MIME, encerra automaticamente aos 120 segundos e para todas as tracks ao terminar. O blob fica apenas no browser até o operador clicar em **Enviar e transcrever**. O upload usa `voice.upload` com o `sessionId` atual; no sucesso, a UI chama `voice.transcribe` somente com o `assetId` retornado.

A UI diferencia `recording`, `recorded`, `uploading`, `transcribing`, `completed` e `error`. Em erro, a gravação permanece disponível para retry e o formulário textual continua explicitamente indicado como fallback. A transcrição aparece como rascunho revisável e pode ser inserida no FAQ, marcando o perfil como sujo para autosave; ela não confirma bloco nem publica prompt automaticamente. URLs locais e tracks são limpas no unmount/descarte.

Validação após a alteração: `pnpm check` passou; `pnpm test` passou com 106 aprovados e 37 skipped por dependências externas/PostgreSQL; `pnpm build` passou; `git diff --check` passou. O bundle inicial cresceu para aproximadamente 738 kB e mantém o warning de code splitting acima de 500 kB.

Próximo bloco recomendado: rotina/worker de expiração física de assets e limpeza de transcrições derivadas conforme `rawArtifactDays`/`derivedDataDays`, com dry-run e auditoria. Depois, permitir correção por texto/áudio curto e extração estruturada para `onboardingStepAnswers` somente após revisão/confiança. Não ativar expansão pública de áudio antes da execução da migration 0034 e da suíte PostgreSQL em CI/staging.


---
## Atualização do handoff — 2026-09-27 — retenção automática de áudio

A retenção configurável de onboarding deixou de ser apenas metadado. `server/db.ts` agora expõe `cleanupOnboardingAudioRetention({ dryRun, limit, now })`. Assets brutos expirados são identificados por `onboardingAudioAssets.expiresAt`; transcrições derivadas são candidatas após 30 dias e só são removidas quando ultrapassam `derivedDataDays` da política do workspace, com fallback de 180 dias. O resultado informa `assetsExpired`, `transcriptionsExpired` e contagens por workspace.

`server/worker.ts` executa essa limpeza uma vez por dia (intervalo ajustável por `FORTE_ONBOARDING_RETENTION_SWEEP_MS`, mínimo de 60 segundos para operação controlada). `FORTE_ONBOARDING_RETENTION_DRY_RUN=true` faz simulação sem deletar linhas. O padrão é executar a limpeza real. Cada workspace afetado recebe auditoria `onboarding_audio_retention_cleanup` ou `onboarding_audio_retention_dry_run`, sem `actorUserId`, e o worker registra os totais agregados.

A rotina é tenant-aware e usa lote máximo de 500 por ciclo, com teto de 2.000 quando chamada diretamente. Não há delete físico implementado porque `server/storage.ts`/Forge não expõem endpoint de remoção documentado; remover a linha revoga a referência privada e impede que o produto sirva o objeto. Não inventar uma API destrutiva do storage. Se o lifecycle físico for requisito de produção, configurar/validar a política de retenção no provedor ou substituir o adapter de storage com operação autorizada.

A suíte adicionou `server/onboarding-audio-retention.test.ts`, que valida dry-run sem deleção, políticas diferentes por workspace e preservação do segundo tenant. Nesta sandbox sem `DATABASE_URL`, os dois testes PostgreSQL são skipped; o typecheck e os 106 testes unitários aprovados passaram. Antes do beta, executar migrations e a suíte completa no CI/staging, verificar auditoria do worker e confirmar o lifecycle do bucket.

Próximo passo recomendado: permitir correção por texto/áudio curto e extração estruturada para `onboardingStepAnswers`, mantendo revisão/confiança e sem publicação automática.


---
## Atualização do handoff — 2026-09-27 — correção e proposta estruturada

A próxima fatia do onboarding assistido foi implementada. `OnboardingPage` transforma a transcrição concluída em textarea editável e permite enviar uma proposta estruturada explicitamente. O operador também pode iniciar `Regravar correção curta`; a gravação usa o mesmo fluxo privado e fica limitada a 30 segundos no cliente e no servidor (`voice.upload` recebe `correction=true`). O upload/transcrição continuam consent-gated e a UI não confirma nem publica automaticamente.

`server/onboarding-structured.ts` define os campos permitidos por bloco (`identity`, `offering`, `operations`, `guardrails`, `voice`) e chama `invokeLLM` somente no servidor com saída JSON Schema estrita. O prompt instrui a não inventar preço, prazo, disponibilidade, serviço, política ou promessa. A normalização filtra campos fora do bloco, deriva `missing`, limita `conflicts`, valida confiança entre 0 e 100 e falha fechado para resposta inválida.

A procedure `onboarding.extractProposal` exige consentimento `llm`, recebe `stepKey`, texto revisado e idioma, persiste a proposta com `source=llm`, `status=draft`, confiança, missing/conflicts e uma nova linha em `onboardingStepAnswerRevisions`. O upsert é tenant-aware por sessão/workspace/bloco. Mesmo que existisse uma resposta confirmada, a nova proposta fica em draft e exige confirmação posterior; não existe publicação silenciosa.

Foram adicionados testes unitários de campos permitidos, missing derivado e falha de confiança/shape. No sandbox: 109 testes passaram, 39 foram skipped por PostgreSQL/dependências externas; `pnpm check`, `pnpm build`, journal JSON e `git diff --check` passaram. A validação real da procedure LLM e os testes PostgreSQL devem rodar em CI/staging com consentimento e credenciais configurados; não enviar conteúdo de cliente para o LLM sem o consentimento `llm` vigente.

Próximo passo recomendado: adicionar perguntas de acompanhamento explícitas para cada campo `missing`/`conflicts`, medir correção/custo/abandono e só depois criar publicação versionada do rascunho estruturado.


---
## Atualização do handoff — 2026-09-27 — perguntas de acompanhamento

O ciclo de revisão agora possui follow-up explícito. `server/onboarding-followups.ts` mantém o catálogo de campos por bloco e constrói perguntas determinísticas, sempre orientando a não inventar e permitindo `decidir depois`.

A procedure `onboarding.answerFollowUp` recebe `stepKey`, `field` e `value`, valida que o campo pertence ao bloco, atualiza a resposta atual como `source=human_form`, `confidence=100`, status `draft`, remove o campo de `missing` quando há valor e grava uma revisão em `onboardingStepAnswerRevisions`. Campo vazio falha fechado; `decidir depois` mantém o campo ausente.

A procedure `onboarding.answerConflict` recebe `stepKey`, `conflictKey` e o esclarecimento. O backend grava snapshot e nota em `onboardingConflictResolutions` com `resolution=follow_up`, cria revisão e remove o conflito somente quando a resposta não é `decidir depois`. Nesse caso, a resolução é `deferred` e o conflito continua aberto, preservando o bloqueio de confirmação/publicação.

A `OnboardingPage` renderiza textarea/input e ações nos cards de revisão humana; a aplicação invalida o perfil e não publica automaticamente. Foram adicionados testes unitários do catálogo/perguntas. No sandbox: 112 testes aprovados, 39 skipped por PostgreSQL/dependências externas; `pnpm check`, `pnpm build`, journal JSON e `git diff --check` passaram.

Próximo passo recomendado: medir custo, duração, taxa de correção e abandono; depois criar publicação versionada do rascunho somente após todos os blocos obrigatórios estarem confirmados.


---
## Atualização do handoff — 2026-09-27 — telemetria de onboarding

A observabilidade do funil foi implementada com `onboardingTelemetryEvents` e migration `0035_onboarding_telemetry`. Os eventos carregam `workspaceId`, `sessionId`, tipo, bloco opcional, fonte, duração, tokens, flag de correção e metadata operacional. Não armazenam texto de resposta, transcrição, prompt, áudio ou conteúdo sensível.

Eventos conectados: `session_started`, `session_paused`, `session_completed`, `audio_uploaded`, `audio_transcribed`, `audio_transcription_failed`, `llm_proposal_created`, `follow_up_answered` e `conflict_follow_up_answered`. A chamada LLM devolve modelo e tokens de uso para telemetria; quando o provider não devolve usage, os tokens ficam nulos, sem estimativa inventada.

`onboarding.metrics` é uma query protegida por workspace com janela de 1 a 90 dias. Retorna sessões iniciadas/concluídas, abandono estimado para a sessão corrente ativa/pausada sem atividade há 7 dias, correções de áudio, follow-ups, conflitos, duração total de áudio, chamadas/tokens LLM e duração média das sessões concluídas. A tela exibe o resumo e identifica tokens como proxy de custo. O catálogo real de preço por modelo ainda não foi configurado, portanto não há custo monetário inventado.

Próximo passo recomendado: validar a migration em PostgreSQL/staging com dados sintéticos, observar a telemetria por uma janela real e só então implementar publicação versionada do rascunho confirmado.


---
## Atualização do handoff — 2026-09-27 — publicação versionada

A publicação versionada do onboarding foi implementada com `onboardingPublishedVersions` e migration `0036_onboarding_published_versions`. Cada linha armazena snapshot JSON do perfil, prompt final, versão incremental por workspace, autor, data e `rollbackOfId` opcional. Versões anteriores nunca são sobrescritas.

`publishOnboardingDraft(workspaceId, publishedBy)` lê os blocos persistidos e falha fechado quando qualquer bloco obrigatório não está `confirmed`, possui `missing` ou possui conflito. Também valida o checklist de fatos obrigatórios. O prompt publicado é montado a partir dos blocos confirmados, não apenas da cópia local do formulário. O setting legado `ai_prompt_published` é atualizado dentro da mesma transação do snapshot versionado.

A procedure `onboarding.save` agora salva alterações visuais como draft e, quando `publish=true`, preserva os blocos confirmados antes de executar o gate. `onboarding.versions` lista o histórico protegido. `onboarding.rollback` publica uma nova versão baseada no snapshot escolhido, registra a origem, atualiza o perfil e reconstitui respostas sem apagar histórico.

A tela mostra as versões e informa que rollback cria nova versão. O teste `server/onboarding-publish.test.ts` cobre bloqueio antes de confirmação, publicação v1 e rollback v2; ele é condicional e ficou skipped no sandbox sem PostgreSQL. Antes de staging, aplicar migrations 0035 e 0036 e executar esse teste contra um banco efêmero.

Próximo passo recomendado: aplicar as migrations em PostgreSQL/staging, validar o fluxo com dados sintéticos e revisar autorização/observabilidade antes de ampliar o onboarding para usuários beta.


---
## Atualização do handoff — 2026-09-27 — ambiente Docker local para validação

Foi preparado o fluxo local reproduzível em `LOCAL-DOCKER-TESTE.md`. O Compose canônico para a máquina agora é `docker-compose.yml` (com `docker-compose.local.yml` mantido como compatibilidade), com PostgreSQL 16, Redis 7, painel, worker e gateway WhatsApp. O PostgreSQL agora publica somente em `127.0.0.1:${PANEL_POSTGRES_PORT:-5432}` para que os testes de integração possam rodar pelo host sem exposição pública.

Novos artefatos: `.env.docker.example`, `scripts/docker-init-local.sh`, `scripts/docker-up-local.sh` e `scripts/docker-reset-all-local.sh`. O init gera `.env` com segredos aleatórios locais sem sobrescrever arquivo existente; o up baixa as imagens e sobe a stack; o reset exige `FORTE_DOCKER_RESET_CONFIRM=APAGAR-TUDO` e remove containers, volumes, imagens, redes e cache Docker não utilizados globalmente. O reset não foi executado nesta sessão.

O painel aplica as migrations versionadas automaticamente no primeiro start (`RUN_MIGRATIONS=true`). Após subir a stack, usar `DATABASE_URL` apontando para `localhost:${PANEL_POSTGRES_PORT}` e executar `server/onboarding-publish.test.ts` e a suíte completa. A sandbox desta tarefa não possui Docker/PostgreSQL utilizável, portanto a validação real continua pendente para a máquina do usuário.

---

## 12. Handoff da validação da Inbox — 2026-09-28 13:13 BRT

**Nenhuma alteração de código foi feita nesta etapa.** Este registro apenas consolida os testes manuais do usuário e prepara a próxima IA.

### Evidências confirmadas pelo usuário

- O envio de texto funcionou fisicamente para o WhatsApp destinatário, mas a Inbox não reproduziu exatamente o conteúdo enviado; o caso observado foi um `oi` que apareceu de forma incorreta como conteúdo genérico de mídia.
- O envio de imagem pela Inbox funcionou e a imagem apareceu no WhatsApp destinatário.
- O recebimento de imagem e áudio na Inbox funcionou.
- Falta um botão/controle de áudio no composer da Inbox.
- A IA não foi pausada/desligada quando o usuário enviou uma mensagem pelo número conectado à instância; investigar a distinção entre mensagem inbound do contato, mensagem `fromMe`, takeover humano e `humanControlled`.
- Ainda falta comprovar visualmente e por teste de isolamento que a Inbox mostra somente mensagens das instâncias Baileys pertencentes ao workspace autenticado.
- O usuário solicitou filtro de instâncias na Inbox com seleção múltipla: uma instância, várias instâncias ou todas.

### Estado técnico de referência

- Repositório: `geordptoroy/forte-panel`.
- Branch: `main`.
- Commit funcional de referência: `c23d495 feat: activate inbox with baileys message coverage`.
- A Inbox está liberada no modo Core e aparece na sidebar como **Atendimento**.
- A rota `/inbox` está no allowlist do `CORE_ONLY_MODE`; as demais páginas continuam congeladas.
- O commit funcional ampliou a normalização/ingestão para sticker, localização, contato, enquete, lista, botão e reação, além de manter mídia e metadados Baileys.

### Prioridade imediata

1. Reproduzir o caso do `oi` ponta a ponta e comparar o payload em cada etapa: Baileys → WebhookOutbox → API webhook → normalização → banco → `inbox.thread` → `MessageBubble`. Não mascarar falhas com o fallback `[mídia recebida]`.
2. Confirmar que texto simples usa `conversation`/`extendedTextMessage.text` e que o `messageType` não é promovido para mídia por heurística incorreta.
3. Adicionar o botão de áudio ao composer sem quebrar texto, imagem, vídeo e documento; definir se será upload de arquivo de áudio e/ou gravação, documentando a decisão antes de implementar.
4. Auditar o controle da IA: `fromMe`, `aiEnabled`, `humanControlled`, `markRead` e `sendMessage`. Especificar quando uma mensagem manual deve pausar a IA e quando uma mensagem enviada pelo próprio número conectado deve ser ignorada para evitar loop.
5. Implementar filtro de instâncias workspace-scoped na Inbox. A seleção deve aceitar exatamente: uma instância, múltiplas instâncias ou todas; o estado `Todas` deve ser explícito e não pode misturar instâncias de outro workspace.
6. Persistir/consultar a origem por `instanceId` de forma confiável no contato/conversa/mensagem, incluindo mensagens legadas sem origem. Definir comportamento de fallback antes de alterar UI.
7. Adicionar testes negativos de isolamento entre dois workspaces e testes de filtro com uma, várias e todas as instâncias.

### Restrições

- Não apagar volumes, sessões Baileys ou dados do usuário.
- Não alterar PAPI/Meta, Console Admin ou páginas congeladas nesta próxima fatia.
- Trabalhar somente na Inbox, contratos Baileys relacionados, testes e documentação necessária.
- Antes de publicar, executar `pnpm check`, typecheck do gateway, testes direcionados, `pnpm build` e `git diff --check`.
- Não afirmar que o filtro por instância está seguro apenas porque o frontend filtra: a query e o backend precisam aplicar o escopo do workspace.


## 13. Implementação Inbox/Baileys pós-validação — 2026-09-28 13:48 BRT

### Alterações concluídas nesta fatia

- A causa da divergência de `oi` estava no gateway: a leitura anterior classificava apenas campos no nível externo e substituía wrappers Baileys por fallback de mídia. `normalizeBaileysMessage` agora desempacota wrappers temporários/view-once/edição e preserva `conversation`/`extendedTextMessage.text`; texto simples continua texto. Legendas e tipo de mídia são preservados; placeholders permanecem apenas para mídia sem texto/legenda.
- O InstanceManager agora envia eventos `fromMe`. Mensagem manual do número conectado é persistida como outbound humano, pausa `aiEnabled`, marca `humanControlled`, zera unread e não cria `message.received` para o agente. Envios já originados no Panel são reconhecidos por ID/fingerprint limitado para impedir loop; eventos próprios sem correspondência seguem como takeover manual.
- A Inbox recebe filtros explícitos **Todas**, uma instância ou várias. O backend valida IDs no workspace ativo e limita também a query de contatos/previews, thread, histórico e roteamento do envio. Em **Todas**, IDs Baileys conhecidos precisam constar no registry do mesmo workspace; IDs de outro tenant são excluídos. Mensagens legadas sem `instanceId` permanecem apenas em **Todas**; instâncias arquivadas são consultáveis pelo histórico em **Todas**.
- O cursor de leitura permanece compartilhado por conversa; abrir uma seleção filtrada não avança esse cursor global. O filtro possui estados loading/empty/error e retry. O composer ganhou upload separado para áudio `audio/*`, limite de 8 MB; gravação por microfone ficou fora desta fatia, preservando os controles existentes de imagem/vídeo/documento.
- Contrato documentado em `docs/BAILEYS-INTEGRATION.md`. Nenhuma alteração foi feita em Console Admin, PAPI/Meta ou páginas congeladas.

### Evidência e validação

- Fixtures unitárias cobrem `oi` em wrappers Baileys, legenda de imagem, áudio sem legenda, assinatura de eco para todos os tipos de mensagem suportados, botão interativo, ID correlacionado, cancelamento de envio falho e distinção entre eco Panel e mensagem manual; o adapter preserva o envelope Gateway → Panel.
- Fixtures de integração executadas em PostgreSQL local efêmero confirmam uma instância, múltiplas instâncias e **Todas**; incluem contato concorrente de workspace B, mensagem cujo `instanceId` aponta para B dentro de A (não aparece nem em **Todas**), fallback de mensagem legada e takeover `fromMe` para contato novo e existente.
- `pnpm check`: aprovado.
- `pnpm exec tsc --noEmit -p forte-whatsapp/tsconfig.json`: aprovado.
- `pnpm test` com PostgreSQL local e migrations do repositório aplicadas ao banco descartável do sandbox: **59 arquivos / 231 testes aprovados, zero ignorados**.
- `npm test --prefix forte-whatsapp`: **9 arquivos / 55 testes aprovados**.
- `pnpm build`: aprovado. Permanece o aviso existente de chunk frontend acima de 500 kB (bundle JS de 941,14 kB).
- `git diff --check`: aprovado após a revisão e as atualizações documentais finais.

### Limites ainda pendentes

- O PostgreSQL usado foi criado somente no sandbox descartável; isso não valida o PostgreSQL do WSL do usuário nem staging/produção.
- O commit de implementação `e9d800d` foi enviado a `main`. A [publicação de imagens `dev` (workflow 36454030781)](https://github.com/geordptoroy/forte-panel/actions/runs/36454030781) concluiu `verify` e publicou as imagens Forte Panel e forte-whatsapp; o [PostgreSQL integration (workflow 36454030684)](https://github.com/geordptoroy/forte-panel/actions/runs/36454030684) também passou.
- Não foi pareado número WhatsApp real nesta etapa. Envio/recebimento E2E manual real de texto/imagem/áudio, comportamento visual no navegador e validação no PostgreSQL persistente de staging permanecem pendentes.
- Não declarar a integração real pronta até concluir esses gates; as fixtures reproduzíveis cobrem a regressão de código, não substituem E2E com número dedicado.
