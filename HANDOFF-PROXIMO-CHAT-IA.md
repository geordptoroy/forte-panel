# Handoff — Forte Panel

**Atualizado:** 2026-09-30 — O4.4 validada no CI; O5.1 em andamento
**Repositório:** `geordptoroy/forte-panel`
**Ambiente desta execução:** Sandbox (`/home/ubuntu/forte-panel`). Revalidar branch, workspace, remotes e disponibilidade antes de reutilizar qualquer estado.

## Regras do usuário

Avançar uma fatia por vez; documentar cada fatia; preservar branches/PRs empilhadas; **nunca mesclar automaticamente**; manter `CORE_ONLY_MODE` até prova de produção PostgreSQL/WhatsApp; não usar nem pedir secrets reais. Stripe/cobrança fica para O7.

## Estado da pilha de revisão

- Branch: `feat/o3.3-canonical-opportunity-stage`, filha de `feat/o3.2-inbox-assignment-follow-up`.
- PRs #4–#8 permanecem abertos; PR [#9 — O3.3: canonical Opportunity stage history](https://github.com/geordptoroy/forte-panel/pull/9) está aberta sobre a branch/PR #8. Não mesclar automaticamente.
- O CI PostgreSQL da PR #9, run [`36710769990`](https://github.com/geordptoroy/forte-panel/actions/runs/36710769990), passou no código de `7dc0efc`: migration 0049 aplicada; **72 arquivos/285 testes passaram, zero skips**. A PR mostrou `SUCCESS` para esse head.
- O run #8 `36708180817` validou a migration 0048 e 72 arquivos/285 testes sem skips. O PR pai continua aberto.

## O3.3 — concluída em código e CI

Entrega detalhada: `O3.3-ENTREGA-FUNIL-CANONICO.md`.

- `Opportunity.stage` é canônico; `contacts.stage` é somente espelho de compatibilidade.
- Migration aditiva 0049 cria `opportunityStageHistory`, backfill idempotente e índices/checks.
- Lead, Opportunity, baseline e vínculo à Conversation são gravados na mesma transação.
- `moveContactStage` serializa por Opportunity e grava estágio, espelho, histórico, audit log e outbox atomicamente. Repetir o estágio atual é no-op; divergência do espelho é reparada sem falsa transição.
- Inbox, CRM/Kanban, Agenda, REST e `leadMemoryOperation` priorizam estágio canônico; grupos continuam fora do funil comercial.
- `PRODUCT_SCOPE.md`, `API_CONTRACT.md`, Fonte de Verdade, roadmap, plano intermediário, índice e handoffs foram atualizados.

## Validações

- Sandbox: `pnpm check`, `pnpm build` e `git diff --check` passaram; `pnpm test` teve 232 aprovações/53 ignorados (18 arquivos ignorados) por não haver `DATABASE_URL`. Build com aviso conhecido de chunk frontend acima de 500 kB.
- CI PostgreSQL: run #36710769990 aplicou as migrations e executou a suíte completa; 72/72 arquivos, 285/285 testes, sem skips.
- O resultado do CI é efêmero; não substitui banco persistente/staging, restore, smoke visual desktop/mobile ou prova física inbound/outbound Baileys. Uma atualização documental após o commit validado pode gerar outro run; confira o estado mais recente da PR antes da próxima execução.

## O3.4 — implementação local em revisão

A branch `feat/o3.4-quote-approval` foi criada sobre `89d7cff` / PR #9, sem tocar `main` ou mesclar a pilha. A entrega está registrada em `O3.4-ENTREGA-ORCAMENTOS-APROVACAO.md`. O código adiciona migration 0050, itens imutáveis, validade, estados separados de aprovação/recebimento, histórico append-only, projeção válida no Inbox/dashboard e recebimento monotônico. A PR #10 está aberta e o run PostgreSQL `36720148370` passou com a migration 0050.

Validações locais: `pnpm check`, `pnpm build`, `git diff --check` e 13 testes focados passaram. A suíte completa ainda encontra dependências ausentes no subprojeto `forte-whatsapp`. O CI PostgreSQL da PR #10 passou; staging persistente, smoke visual e revisão final continuam pendentes.

## O3.5 — implementação local em revisão

A branch `feat/o3.5-agenda-conflicts-status` foi criada sobre a O3.4 validada (`d8bbf52`). A entrega está registrada em `O3.5-ENTREGA-AGENDA-CONFLITOS-STATUS.md`. A agenda já tinha conflitos transacionais, profissionais, disponibilidade e status; esta fatia expôs o reagendamento via `agenda.reschedule`, restringiu a operação ao profissional autorizado e adicionou a ação na agenda diária. O reagendamento revalida jornada e conflito e volta para `requested`, exigindo nova confirmação.

Validações locais: `pnpm check`, `pnpm build`, `git diff --check` e 10 testes focados passaram; 3 testes de isolamento foram ignorados por dependerem de PostgreSQL. A PR #11 está aberta e o CI PostgreSQL `36723304885` passou; staging persistente e revisão final continuam pendentes.

## O3.6 — implementação local em revisão

A branch `feat/o3.6-receipts-ledger` foi criada sobre a O3.5 validada (`6089b3a`). A entrega está registrada em `O3.6-ENTREGA-RECEBIMENTOS-LEDGER-RECIBO.md`. A migration 0051 cria lançamentos de recebimento e recibos tenant-scoped; `billing.registerPayment` valida aprovação, valor, método, data, limite do orçamento, registra o agregado compatível e emite recibo na mesma transação. A UI agora suporta valores parciais e métodos manuais.

Validações locais: `pnpm check`, `pnpm build`, `git diff --check` e 14 testes focados passaram. A PR #12 está aberta e o CI PostgreSQL `36729522644` passou após a correção da FK composta da migration 0051. Não introduzir gateway, Stripe ou cobrança real.

## O3.7 — implementação local em revisão

A branch `feat/o3.7-daily-decisions-dashboard` foi criada sobre a O3.6 validada (`2887bac`). A entrega está registrada em `O3.7-ENTREGA-DASHBOARD-DECISOES-DIA.md`. O snapshot agora calcula decisões do dia, receita recebida no mês a partir do ledger, pendência de orçamentos e saúde tenant-scoped do canal/worker. A UI exibe links diretos para Inbox, Funil, Faturamento e Agenda sem executar efeitos externos.

Validações locais: `pnpm check`, `pnpm build`, `git diff --check` e 15 testes focados passaram. A PR #13 está aberta e o CI PostgreSQL `36730266465` passou; staging persistente e revisão final continuam pendentes.

## O4.1 — implementação local em revisão

A branch `feat/o4.1-agent-commercial-context` foi criada sobre a O3.7 validada (`cc09653`). A entrega está registrada em `O4.1-ENTREGA-CONTEXTO-COMERCIAL-AGENTE.md`. O agente ganhou `consultar_contexto_comercial`, uma ferramenta somente leitura que deriva o contato e o workspace do evento, consulta etapa canônica, dados comerciais, orçamento aprovado ativo e notas recentes, sem aceitar identificadores de tenancy do modelo.

Validações locais: `pnpm check`, `pnpm build`, `git diff --check` e 14 testes focados passaram. A PR #14 está aberta e o CI PostgreSQL `36730874541` passou; staging persistente e revisão final continuam pendentes.

## Próxima fatia

**O4.2 — Ferramentas somente leitura e confirmação mutável**, preservando a pilha aberta, sem merge automático, e mantendo `CORE_ONLY_MODE` ativo.

A branch `feat/o4.2-agent-confirmation-gate` foi criada sobre a O4.1 validada (`699ad1b`). A entrega está registrada em `O4.2-ENTREGA-CONFIRMACAO-MUTAVEL-AGENTE.md`. Mutações do agente agora viram propostas `pending_confirmation`; manager/owner pode listar, confirmar ou rejeitar com motivo, e a execução confirmada mantém tenancy e idempotência.

Validações locais: `pnpm check`, `pnpm build`, `git diff --check` e 14 testes focados passaram. A PR #15 está aberta e o CI PostgreSQL `36731684085` passou; staging persistente e revisão final continuam pendentes.

## O4.3 — implementação local em revisão

Criar kill switch tenant-scoped para pausar o agente antes do processamento de eventos, preservar transferência humana e registrar motivo/auditoria. Não remover os controles por contato nem permitir que o modelo reative o agente.

A branch `feat/o4.3-agent-kill-switch` foi criada sobre a O4.2 validada (`f00c7cb`). A entrega está registrada em `O4.3-ENTREGA-KILL-SWITCH-HUMANO.md`. O kill switch persiste em `workspaceSettings`, exige manager/owner, registra auditoria e devolve eventos de mensagem para `pending` durante a pausa, sem invocar o modelo ou perder a mensagem.

Validações locais: `pnpm check`, `pnpm build`, `git diff --check` e 15 testes focados passaram. A PR #16 está aberta e o CI PostgreSQL `36732396958` passou; staging persistente e revisão final continuam pendentes.

## O4.4 — implementação local em revisão

A branch `feat/o4.4-agent-outcome-metrics` foi criada sobre a O4.3 validada (`cce35a3`). A entrega está registrada em `O4.4-ENTREGA-METRICAS-AGENTE.md`. A migration 0052 cria `agentRuns`; o endpoint `agent.metrics` mede desfecho, transferência, confirmação pendente, falha, tokens e latência. Recebimentos são exibidos como total do workspace não atribuído ao agente, sem misturar quota técnica, custo de provider e cobrança SaaS.

Validações locais: `pnpm check`, `pnpm build`, `git diff --check` e 7 testes focados passaram. A PR #17 está aberta e o CI PostgreSQL `36733294007` passou; staging persistente e revisão final continuam pendentes.

## O5.1 — implementação local em revisão

A branch `feat/o5.1-workspace-accounts-lifecycle` foi criada sobre a O4.4 validada (`9fa98fd`). A entrega está registrada em `O5.1-ENTREGA-CONTAS-PRODUCAO.md`. O lifecycle e health existentes foram preservados; a migration 0053 adiciona incidentes administrativos, e `setWorkspacePlan`, `incidents`, `openIncident` e `resolveIncident` tornam plano e incidentes auditáveis no control-plane.

Validações locais: `pnpm check`, `pnpm build`, `git diff --check` e 14 testes focados passaram. CI PostgreSQL e PR ainda pendentes.

## O5.2 em revisão — suporte, tickets e sessões auditadas

A branch `feat/o5.2-support-tickets-audited-sessions` adiciona a migration `0054_platform_support_tickets.sql`, operações tenant-scoped de abertura/fechamento de tickets e os tickets no detalhe do workspace. A abertura exige sessão ativa; o fechamento exige sessão ativa em modo `operator`; ambos geram `platformAuditLogs`. `pnpm check`, `pnpm build`, `git diff --check` e a validação JSON da migration passaram. A suíte ampla local teve 51 arquivos/206 testes passando e falhas pré-existentes de dependências ausentes no pacote `forte-whatsapp` (`baileys`, `pino`, `qrcode`) e no patch pinned.

## O5.3 em revisão — health operacional

O CI PostgreSQL da O5.2 passou no run `36735198506`. A branch `feat/o5.3-operational-health-snapshot` adiciona `platform.health`, snapshot somente leitura com gateway, worker, filas, storage e providers. O retorno é sanitizado: não expõe payloads, URLs privadas, chaves ou erros brutos. `pnpm check`, `pnpm build` e `git diff --check` passaram; o build mantém o aviso conhecido de chunk frontend acima de 500 kB. Não ligar `CORE_ONLY_MODE` nem executar chamadas externas de health nesta fatia.

## O5.4 em revisão — quotas, retenção e lifecycle

O CI PostgreSQL da O5.3 passou no run `36735603600`. A branch `feat/o5.4-quotas-retention-lifecycle` adiciona `platform.workspaceGovernance` e `platform.setWorkspaceRetention`. A governança reúne lifecycle, plano técnico, quotas atuais por workspace/usuário, retenção de uso e onboarding, explicitando billing separado. A alteração exige sessão operator, valida limites e audita before/after. `pnpm check`, `pnpm build`, `git diff --check` e 16 testes focados passaram. Não adicionar cobrança, exclusão destrutiva ou downgrade automático nesta fatia.

## O6.1 em revisão — provas negativas de tenancy e papéis

O CI PostgreSQL da O5.4 passou no run `36735977815`. A branch `feat/o6.1-tenancy-role-negative-proofs` adiciona `server/o6-tenancy-roles-negative.test.ts`: matriz de permissões, sessão sem travessia de workspace/identidade e uso sem vazamento entre buckets. Localmente passaram 6 testes; 5 testes de integração foram pulados por ausência de DATABASE_URL. `pnpm check` e `git diff --check` passaram. O CI da PR precisa executar os cenários PostgreSQL.

## O6.2 em revisão — backup, restore e retenção

O CI PostgreSQL da O6.1 passou no run `36736288990`, incluindo as provas negativas de tenancy e papéis. A branch `feat/o6.2-backup-restore-retention-proof` adiciona `scripts/backup-restore.test.ts` e inclui `scripts/**/*.test.ts` no Vitest. A suíte executa o script real em diretórios temporários, valida manifesto/hash/pg_restore/tar, rejeita dump adulterado e bloqueia restore sem `CONFIRM_RESTORE=YES`. Localmente 3 testes passaram; retenção PostgreSQL foi pulada sem DATABASE_URL. `pnpm check`, `pnpm build` e `git diff --check` passaram. Não criar backup real nem executar restore destrutivo nesta fatia.

## O6.3 em revisão — browser desktop/mobile e acessibilidade

O CI PostgreSQL da O6.2 passou no run `36736764694`. A branch `feat/o6.3-browser-accessibility-proof` adiciona `client/src/browser-accessibility.contract.test.ts`, cobrindo CORE_ONLY_MODE, redirecionamento de rotas beta, landmarks/labels, dialogs/alerts/progressbar, foco visível e media queries; botões de navegação do Console recebem `type="button"`. Localmente passaram 15 testes frontend; `pnpm check`, `pnpm build` e `git diff --check` passaram. Não declarar smoke browser real/Lighthouse como concluído: staging autenticado desktop/mobile continua pendente e CORE_ONLY_MODE permanece ativo.

## O7.1 em revisão — fronteira de billing SaaS

O CI PostgreSQL da O6.3 passou no run `36737154671`. A branch `feat/o7.1-saas-billing-boundary` adiciona `server/saas-billing.ts`, testes de contrato e a rota read-only `platform.saasBillingBoundary`; `workspaceGovernance.billing` agora usa a mesma fronteira. Plano técnico/quota, custo de provider (`agent_outcome_metrics`), receita operacional (quotes/payments) e cobrança SaaS ficam separados. Billing SaaS permanece `not_configured`, sem preço, moeda ou checkout. 15 testes focados, `pnpm check`, `pnpm build` e `git diff --check` passaram. Não integrar pagamento nesta fatia.

## O7.2 em revisão — lifecycle da assinatura SaaS

O CI PostgreSQL da O7.1 passou no run `36737881060`. A branch `feat/o7.2-saas-subscription-lifecycle` adiciona a máquina de estados pura `server/saas-subscription-lifecycle.ts` e seus contratos: trial de 14 dias, ativação, upgrade, downgrade, past_due, cancelamento no fim do período, retenção, cancelamento imediato e restart explícito. Cada transição exige motivo e retorna before/after; execução fica `not_configured` e exige provider. A rota read-only `platform.saasSubscriptionLifecycle` publica o catálogo. 17 testes focados, `pnpm check`, `pnpm build` e `git diff --check` passaram. Não persistir assinatura nem ligar checkout nesta fatia sem provider aprovado.

## O7.3 em revisão — release público controlado

O CI PostgreSQL da O7.2 passou no run `36738425579`. A branch `feat/o7.3-controlled-public-release` adiciona `server/controlled-release.ts`, contratos fail-closed e a rota read-only `platform.controlledReleasePolicy`. Readiness, integração PostgreSQL, isolamento negativo, backup/restore, E2E WhatsApp, observabilidade externa, revisão legal, billing SaaS e desligamento deliberado do CORE_ONLY_MODE são gates explícitos; qualquer evidência ausente bloqueia cadastro público. 21 testes passaram e 1 teste de heartbeat foi pulado localmente por falta de DATABASE_URL; `pnpm check`, `pnpm build` e `git diff --check` passaram. Não declarar release público, não executar staging e não desligar CORE_ONLY_MODE nesta fatia.

## Validação Docker/WhatsApp local — estado para o próximo chat

O usuário executou a stack `docker-compose.local.yml` na máquina Windows com Docker `29.8.0` e Compose `v5.5.1`. Foi necessário `docker compose down -v --remove-orphans`, autorizado pelo usuário, porque o volume PostgreSQL tinha uma senha antiga incompatível com o `.env`; as migrations então passaram. Panel, worker, PostgreSQL, Redis e gateway ficaram ativos. `/api/v1/ready` retornou banco `ok`; gateway `/health` retornou `ok` e `/ready` retornou `ready`. O WhatsApp foi pareado com sucesso, sincronizou histórico, uma mensagem inbound chegou ao Inbox e uma mensagem outbound enviada pelo Panel chegou ao telefone. O worker manteve heartbeat com `lastError: null`.

Pendente honesto: o gateway mostrou `webhookOutboxPending: 5` e `webhookLastError: webhook_http_400`; os logs indicam itens históricos da sincronização inicial em retry. Não declarar webhook totalmente aprovado, não apagar a sessão pareada e não enviar dados sensíveis ao próximo chat. Próximo teste: listar somente nomes de arquivos em `/app/sessions/outbox`, aguardar/consultar `/ready`, reiniciar apenas `forte-whatsapp` sem remover volumes, confirmar reconexão sem novo QR e repetir inbound/outbound controlados. Entrega detalhada em `O7.3-VALIDACAO-DOCKER-WHATSAPP-LOCAL.md`.

### Atualização operacional — reconexão confirmada

O gateway `forte-whatsapp` foi reiniciado isoladamente, sem remover volumes. Após 15 segundos, a mesma sessão voltou como `connected`, sem novo QR Code, e o usuário confirmou novo ciclo inbound/outbound funcionando. A outbox continua com 5 arquivos pendentes e `webhookLastError: webhook_http_400`; a reconexão não limpou os eventos históricos. Portanto, marcar reconexão e continuidade WhatsApp como aprovadas, mas manter o webhook histórico pendente até investigar os 400.


## Atualização 2026-09-30 — O7.16 até O7.27

A execução avançou na branch atual `feat/o7.15-storage-reconciliation-observability`, sem merge automático e mantendo `CORE_ONLY_MODE` ativo.

### Fatias concluídas em código

- **O7.16:** métricas de reconciliação de storage redigidas e persistidas em `auditLogs`.
- **Restore rehearsal:** `RESTORE-REHEARSAL-PLAN.md` criado e runbook O7.12 atualizado.
- **O7.17:** anti-replay de webhooks com timestamp, nonce, janela, deduplicação persistente e migration PostgreSQL `0055_webhook_anti_replay.sql`.
- **O7.18:** rate limiting distribuído PostgreSQL com migration `0056_security_rate_limit_buckets.sql`; fallback local não é usado em fail-closed.
- **O7.19:** segredo de webhook por instância, rotação criptografada e atualização dinâmica no gateway.
- **O7.20:** revogação de sessões no logout e validação por `sessionVersion`.
- **O7.21:** política fail-closed para autenticação, rate limit e revogação.
- **O7.22:** retenção operacional diária de webhooks, domain events e buckets de segurança; dry-run default, estados não terminais protegidos e remoção destrutiva transacional.
- **O7.23:** runner de reconciliação de mídia no worker, provider abstrato, métricas redigidas e no-op seguro sem provider real.
- **O7.24:** `pnpm check:production-config`, verificação fail-closed de produção adicionada ao CI PostgreSQL e publicação; zero skips obrigatório no job PostgreSQL.
- **O7.25:** `pnpm verify:restore-rehearsal BACKUP_DIR`, validação offline de dump PostgreSQL, sessão Baileys e inventário de mídia hashado.
- **O7.26:** `pnpm report:restore-rehearsal EVIDENCE.json REPORT.json`, relatório redigido com RPO/RTO e decisões `approved`, `inconclusive` ou `blocked`; não existe aprovação parcial.
- **O7.27:** `pnpm check:restore-rehearsal-isolation EVIDENCE.json`, gate de `CORE_ONLY_MODE`, tráfego bloqueado, outbound desligado, endpoints não produtivos, sessão separada, rollback e readiness.

### Arquivos principais novos

- `scripts/validate-production-config.ts`
- `scripts/verify-restore-rehearsal.ts`
- `scripts/build-restore-rehearsal-report.ts`
- `scripts/validate-restore-rehearsal-isolation.ts`
- `server/webhook-anti-replay.ts`
- `server/distributed-rate-limit.ts`
- `server/storage-reconciliation-runner.ts`
- `server/storage-reconciliation-audit.ts`
- `server/_core/security-mode.ts`
- `drizzle-pg/0055_webhook_anti_replay.sql`
- `drizzle-pg/0056_security_rate_limit_buckets.sql`

### Validação desta pilha

Typecheck, testes focados, Prettier e `git diff --check` passaram nas fatias. O Sandbox não possui `DATABASE_URL`; os testes PostgreSQL permanecem dependentes do workflow `PostgreSQL integration`. Nenhum restore destrutivo, provider real de mídia, endpoint real ou segredo real foi usado.

O workflow PostgreSQL falha se reportar skips; o workflow de publicação executa `check:production-config` com valores sintéticos. A cadeia real de CI deve ser reexecutada após este commit.

### Próximo passo recomendado

Integrar os comandos O7.25–O7.27 em um orquestrador único de preflight do rehearsal, na ordem: verificar pacote, validar isolamento, preparar/validar evidências, gerar relatório e bloquear fail-closed antes de qualquer restore. Depois executar os gates externos na máquina do usuário: PostgreSQL/Docker, provider de mídia, Redis isolado, sessão Baileys separada, browser smoke e WhatsApp físico.

Não declarar MVP SaaS público nem desligar `CORE_ONLY_MODE`. Não mesclar PRs automaticamente. Para continuar, primeiro revalidar branch, status, remoto e o hash do commit deste handoff.
