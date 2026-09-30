# Handoff — Forte Panel

**Atualizado:** 2026-09-30
**Repositório:** `geordptoroy/forte-panel`
**Ambiente desta execução:** Sandbox (`/home/ubuntu/forte-panel`). Revalidar branch, workspace, remotes e disponibilidade antes de reutilizar qualquer estado.

## Regras do usuário

Avançar uma fatia por vez; documentar cada fatia; preservar branches/PRs empilhadas; **nunca mesclar automaticamente**; manter `CORE_ONLY_MODE` até prova de produção PostgreSQL/WhatsApp; não usar nem pedir secrets reais. Stripe/cobrança fica para O7.

## Estado da pilha de revisão

- Branch local atual: `feat/o3.3-canonical-opportunity-stage`, filha de `feat/o3.2-inbox-assignment-follow-up`.
- PRs #4–#8 permanecem abertos; #8 é a base/PR pai da O3.3. Não fazer merge automático.
- PR #9 ainda não foi aberta neste checkpoint: terminar diff-check, commit, push e abrir PR #9 com base `feat/o3.2-inbox-assignment-follow-up`.
- O PR #8 teve CI PostgreSQL verde no run `36708180817` (migrations aplicadas; 72 arquivos/285 testes, sem skips). Não inferir o status atual dos demais PRs a partir desse run.

## O3.3 — implementação atual

Entrega detalhada: `O3.3-ENTREGA-FUNIL-CANONICO.md`.

- `Opportunity.stage` é o estado comercial canônico. `contacts.stage` permanece apenas como espelho de compatibilidade.
- Migration aditiva `drizzle-pg/0049_opportunity_stage_history.sql`, registrada no journal, cria `opportunityStageHistory`, inclui baseline idempotente para oportunidades existentes e índices/checks.
- O helper cria/atualiza Lead, Opportunity, baseline e vínculo à Conversation na mesma transação. `moveContactStage` serializa por Opportunity e grava atualização canônica + espelho + histórico + audit log + evento `stage.changed` na outbox dentro da mesma transação. No-op não cria evento/histórico; espelho divergente é reparado sem registrar falsa transição.
- Inbox, Kanban/CRM, Agenda, respostas REST e `leadMemoryOperation` priorizam o estágio canônico; grupos continuam fora do funil comercial.
- O teste PostgreSQL de `server/inbox-instance-filter.integration.test.ts` cobre transições, no-op, reparo do espelho, auditoria/outbox, baselines WhatsApp/API e isolamento entre workspaces.
- `PRODUCT_SCOPE.md`, `API_CONTRACT.md`, Fonte de Verdade, roadmap, plano intermediário, índice e checklist foram atualizados.

## Validação executada no Sandbox

- `pnpm check`: passou.
- `pnpm test`: 54 arquivos passaram, 18 foram ignorados; 232 testes passaram e 53 foram ignorados. O arquivo de integração Inbox (8 testes PostgreSQL) foi ignorado localmente por ausência de `DATABASE_URL`.
- `pnpm build`: passou; aviso conhecido de chunk frontend acima de 500 kB.
- `git diff --check`: passou após as atualizações finais da fatia.
- Migration 0049 e seus testes ainda não foram aplicados/executados contra PostgreSQL nesta sessão; aguardar o CI da PR #9. CI efêmero não substitui banco persistente/staging, restore, smoke visual ou WhatsApp físico.

## Próximos passos imediatos

1. Executar `git diff --check`, revisar o diff/documentação e confirmar a branch limpa apenas fora dos arquivos da fatia.
2. Commitar O3.3, publicar `feat/o3.3-canonical-opportunity-stage` e abrir PR #9 sobre `feat/o3.2-inbox-assignment-follow-up`.
3. Aguardar o CI PostgreSQL executar migration 0049 e os testes; corrigir falhas se houver. Atualizar este handoff com commit, URL e run finais.
4. Manter todos os PRs sem merge automático e `CORE_ONLY_MODE` ativo.
5. Só após CI verde da O3.3, iniciar a próxima fatia isolada: **O3.4 — Orçamento com itens, validade e aprovação humana**, sem billing/Stripe.
