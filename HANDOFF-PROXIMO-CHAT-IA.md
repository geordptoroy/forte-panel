# Handoff — Forte Panel

**Atualizado:** 2026-09-30
**Repositório:** `geordptoroy/forte-panel`
**Caminho observado:** `/home/ubuntu/forte-panel` — revalidar ambiente, branch, HEAD, status, remote, ferramentas e disponibilidade do PostgreSQL antes de reutilizar este workspace.

## Regras do usuário

Avançar uma fatia por vez; documentar cada fatia; usar branches/PRs para revisão; **nunca mesclar automaticamente**; manter `CORE_ONLY_MODE` até prova de produção; não usar nem pedir secrets reais. Assinaturas/cobrança estão adiadas para Wave O7.

## Estado do stack de revisão

- PR [#4](https://github.com/geordptoroy/forte-panel/pull/4): O1.2 → `main`, aberto.
- PR [#5](https://github.com/geordptoroy/forte-panel/pull/5): O1.3 → `feat/o1.2-operational-service-catalog`, aberto.
- PR [#6](https://github.com/geordptoroy/forte-panel/pull/6): O1.4–O2.4 → `feat/o1.3-attendance-rule-simulation`, aberto.
- PR [#7](https://github.com/geordptoroy/forte-panel/pull/7): O3.1 → `feat/o1.4-o2.4-operational-core`, aberto; branch `feat/o3.1-unified-leads`.

Todos permanecem sem merge. PR #7 é filho do PR #6; não apontá-lo diretamente para `main` enquanto os pais estiverem abertos.

## Última fatia — O3.1

Entrega: [`O3.1-ENTREGA-LEAD-UNIFICADO.md`](./O3.1-ENTREGA-LEAD-UNIFICADO.md).

- Modelo explícito: Contact como identidade, Lead por `(workspaceId, contactId)`, Opportunity por Lead e `Conversation.opportunityId`.
- `Opportunity.stage` é canônico; `contacts.stage` é espelho compatível sincronizado pelas mutações de estágio.
- Inbound individual Baileys aceito ao vivo faz upsert idempotente e associa a conversa; `fromMe`, grupo, histórico/backfill e eventos ignorados/inválidos não viram Lead comercial.
- Migration aditiva `0047_unified_leads_opportunities.sql`, com backfill dos contatos individuais e links existentes; aplicada com sucesso no PostgreSQL efêmero do GitHub CI.
- A Fonte de Verdade, `PRODUCT_SCOPE.md`, `API_CONTRACT.md`, roadmap, tracker e índice foram atualizados.

**Gates no Sandbox:** `pnpm check` passou; `pnpm test` — 53 arquivos passaram, 18 ignorados, 228 testes passaram e 52 ignorados; `pnpm build` passou com aviso existente de bundle frontend acima de 500 kB; `git diff --check` passou. Sem `DATABASE_URL` local, mas GitHub PostgreSQL CI aplicou 0047 e passou os 7 testes O3.1: PR #6 run `36664794193` passou 276 testes/70 arquivos; PR #7 run `36664802619` passou 280 testes/71 arquivos. O fixture legado dependente de demo foi isolado no PR #6 em `9e3e48d`; ambos os checks estão verdes. CI efêmero não substitui smoke em staging/produção nem prova física de WhatsApp; rotas continuam `not_ready` e `CORE_ONLY_MODE` permanece ligado.

## Próxima fatia — O3.2: Inbox operacional com assignment e follow-up

Consultar novamente `FORTE-PANEL-FONTE-DE-VERDADE.md`, `PRODUCT_SCOPE.md`, `ROADMAP-EXECUCAO-FORTE-PANEL.md`, `API_CONTRACT.md` e o código atual. Antes de alterar, revalidar a branch `feat/o3.1-unified-leads`, PRs #4–#7, HEAD, árvore de trabalho e PostgreSQL.

Escopo de início: mapear assignment/follow-up já existentes para evitar duplicar estado; definir uma próxima ação clara por Lead/Opportunity com ownership tenant-scoped, autorização e auditoria; expor e operar isso no Inbox. Adicionar migration somente se necessária, testes de isolamento e reconciliação, documentação/handoff e gates `check`, `test`, `build`, `git diff --check`. Se follow-up depender de execução em background, ler a skill `automation-and-scheduling` antes de escolher a arquitetura.

Preservar `CORE_ONLY_MODE`, não usar secrets reais e manter a entrega em branch/PR empilhado. Sem merge automático.
