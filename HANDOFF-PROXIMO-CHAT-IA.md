# Handoff — Forte Panel

**Atualizado:** 2026-09-30
**Repositório:** `geordptoroy/forte-panel`
**Ambiente desta execução:** Sandbox (`/home/ubuntu/forte-panel`). Revalidar branch, workspace, remotes e disponibilidade antes de reutilizar qualquer estado.

## Regras do usuário

Avançar uma fatia por vez; documentar cada fatia; usar branches/PRs para revisão; **nunca mesclar automaticamente**; manter `CORE_ONLY_MODE` até prova de produção; não usar nem pedir secrets reais. Assinaturas/cobrança estão adiadas para Wave O7.

## Estado de revisão

- Branch atual: `feat/o3.2-inbox-assignment-follow-up`; implementação/teste corrigido no commit `d1b5ca8`.
- [PR #8 — O3.2 Inbox operacional](https://github.com/geordptoroy/forte-panel/pull/8) está aberto, empilhado sobre [PR #7 — O3.1 Lead unificado](https://github.com/geordptoroy/forte-panel/pull/7). Nenhum PR foi mesclado.
- CI PostgreSQL do PR #8: run `36708180817` passou; aplicou migrations e executou 72 arquivos/285 testes sem skips. O primeiro run (`36707960513`) falhou por um fixture do próprio teste usando o contato B sob o workspace A; corrigido em `d1b5ca8`.
- PRs anteriores #4–#7 permanecem abertos conforme a política de revisão; não mesclar automaticamente.

## O3.2 implementada em código

Migration aditiva `0048_opportunity_assignment_followup.sql` adiciona responsável da Opportunity e histórico da próxima ação. Só owner/admin/manager pode atribuir a uma membership ativa do mesmo workspace; desativar membro limpa atribuições. Cada Opportunity pode ter uma próxima ação aberta com título e prazo futuro, persistida, auditada, reagendável e concluível. O Inbox projeta responsável e estado/prazo. Nenhuma mensagem é enviada e nenhum scheduler/worker é chamado.

Registro completo: `O3.2-ENTREGA-INBOX-OPERACIONAL.md`. Contrato de API, Product Scope, fonte de verdade, roadmap, índice e checklist também foram atualizados.

## Validação observada

- `pnpm check`: passou.
- `pnpm test`: 54 arquivos passaram, 18 foram ignorados; 232 testes passaram e 53 foram ignorados. Os testes DB condicionais, inclusive O3.2, são executados no workflow PostgreSQL; não há `DATABASE_URL` local neste Sandbox.
- `pnpm build`: passou; aviso preexistente de bundle frontend acima de 500 kB.
- `git diff --check`: passou.
- A migration 0048 foi aplicada no PostgreSQL efêmero do CI; este resultado não equivale a banco persistente/staging ou smoke físico Baileys.

## Limites de release

A execução PostgreSQL efêmera de CI não substitui staging persistente, restore, smoke visual em desktop/mobile ou prova real inbound/outbound com Baileys. Rotas continuam `not_ready`; manter `CORE_ONLY_MODE`.

## Próxima fatia: O3.3 — funil canônico sem duplicação de estado

1. Revalidar os PRs e descobrir se algum pai foi atualizado ou fechado; preservar branches empilhadas e não fazer merge automático.
2. Mapear todas as leituras/escritas de stage em `contacts.stage`, `opportunities.stage`, Inbox, Kanban, CRM/REST e `leadMemoryOperation`.
3. Tornar `Opportunity.stage` a fonte canônica; centralizar mutações em um serviço tenant-scoped com auditoria e sincronização compatível, sem criar estados concorrentes.
4. Adicionar migration/backfill idempotente e testes PostgreSQL para estados existentes, isolamento entre workspaces e todas as rotas de stage.
5. Rodar `pnpm check`, `pnpm test`, `pnpm build` e `git diff --check`; registrar resultado e pendências, abrir PR empilhado sobre O3.2 e aguardar revisão sem mesclar.
