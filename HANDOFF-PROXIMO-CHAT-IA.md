# Handoff — Forte Panel

**Atualizado:** 2026-09-30
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

## Próxima fatia

**O3.4 — Orçamento com itens, validade e aprovação humana.** Manter uma fatia isolada, oportunidade tenant-scoped, proposta rastreável, aprovação humana e auditoria. Não introduzir Stripe/cobrança real nesta etapa. Preservar a pilha aberta, sem merge automático, e manter `CORE_ONLY_MODE` ativo.
