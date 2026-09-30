# Handoff — Forte Panel

**Atualizado:** 2026-09-30 — O3.7 validada no CI; O4.1 em revisão local
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

Validações locais: `pnpm check`, `pnpm build`, `git diff --check` e 14 testes focados passaram. CI PostgreSQL e PR ainda pendentes.

## Próxima fatia

**O4.1 — Contexto comercial seguro para o agente**, somente depois de publicar e validar a PR da O3.7. Preservar a pilha aberta, sem merge automático, e manter `CORE_ONLY_MODE` ativo.
