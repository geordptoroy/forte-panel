# Handoff — Forte Panel

**Atualizado:** 2026-09-30
**Repositório:** `geordptoroy/forte-panel`
**Caminho observado:** `/home/ubuntu/forte-panel` — revalidar ambiente, branch, HEAD, status, remote, ferramentas e `DATABASE_URL` antes de reutilizar o workspace.

## Contexto e regras do usuário

O objetivo é transformar o Forte Panel de beta/demo em SaaS público multiempresa para negócios que operam por WhatsApp. Executar uma fatia por vez; documentar cada fatia; manter branches/PRs para revisão; **nunca mesclar automaticamente**; manter `CORE_ONLY_MODE` até prova de produção; não usar nem pedir secrets reais. Stripe/subscription está adiado para O7.1/O7.2.

## Estado de GitHub verificado

- PR [#4](https://github.com/geordptoroy/forte-panel/pull/4): O1.2 → `main`, aberto.
- PR [#5](https://github.com/geordptoroy/forte-panel/pull/5): O1.3 → `feat/o1.2-operational-service-catalog`, aberto.
- PR [#6](https://github.com/geordptoroy/forte-panel/pull/6): O1.4–O2.4 → `feat/o1.3-attendance-rule-simulation`, aberto e empilhado. Commit de implementação `c1cd9d6` (`feat: harden onboarding and WhatsApp operations`). Nenhum desses PRs foi mesclado.
- Não mesclar um PR filho diretamente em `main` enquanto os pais permanecerem abertos. Para O3.1, partir da branch O1.4–O2.4 e abrir outro PR empilhado sobre ela.

## Último bloco fechado — O1.4 a O2.4

Entrega detalhada: `O1.4-O2.4-ENTREGA-ONBOARDING-WHATSAPP.md`.

- O1.4: etapa de onboarding retomável, autosave serializado e estados seguros de loading/erro.
- O2.1: backoff exponencial limitado; logout manual é final.
- O2.2: lease de webhook recuperável e token fencing; migration aditiva manual `0046` registrada no journal.
- O2.3: recibos outbound monotônicos e limitados por workspace/instância/externalId.
- O2.4: upload autenticado privado até 8 MiB; o worker cria URL assinada HTTPS curta somente no envio.

Validação no Sandbox: `pnpm check`; `pnpm test` — 225 aprovados, 51 ignorados em 70 arquivos; `pnpm build` com aviso existente de bundle frontend >500 kB; `npm --prefix forte-whatsapp run check`; `npm --prefix forte-whatsapp test` — 72 aprovados; `npm --prefix forte-whatsapp run build`; `git diff --check`.

**Ainda não provado:** testes PostgreSQL condicionais (sem `DATABASE_URL`), aplicação/rollback das migrations 0045/0046, reconexão/QR/inbound/outbound em número real de teste, entrega física de mídias/recibos, restore e browser desktop/mobile. Não declarar staging/produção pronta. O release permanece `not_ready`/`CORE_ONLY_MODE`.

## Próxima fatia — O3.1: Lead unificado entre contato, conversa e oportunidade

Fontes a consultar novamente: `FORTE-PANEL-FONTE-DE-VERDADE.md`, `PRODUCT_SCOPE.md`, `ROADMAP-EXECUCAO-FORTE-PANEL.md`, `PROJECT_DOCUMENTATION_INDEX.md` e este handoff. A Fonte de Verdade prevalece se houver material histórico divergente.

Auditoria feita: `contacts` hoje contém `stage` e funciona como lead implícito; não existem tabelas explícitas `leads` nem `opportunities`. `conversations` tem vínculo único por contato. A ingestão Baileys valida ownership da instância, deduplica pelo `eventId`, cria/atualiza contato, conversa e mensagem; histórico/backfill, grupos, `fromMe` e placeholders não devem virar novo inbound comercial.

Implementar nesta fatia:

1. Modelo explícito e tenant-scoped para Lead relacionado ao Contact existente e a uma Opportunity com stage; preservar os registros atuais via migration aditiva e backfill sem editar migrations históricas.
2. Inbound Baileys deve criar ou atualizar Lead/Opportunity de forma idempotente, em retry e corrida concorrente, usando a identidade de contato do workspace; não criar duplicatas por evento.
3. Conectar a Conversation à Opportunity (ou ao Lead que a possui) e expor a relação/stage nas consultas usadas pelo Inbox/CRM; manter compatibilidade do stage legado sem duas fontes divergentes.
4. Não converter grupos, histórico/backfill, `fromMe`, evento ignorado ou payload inválido em lead comercial.
5. Testes para isolamento entre workspaces, deduplicação, reentrada, link Contact–Lead–Conversation–Opportunity e projeção/sincronização do stage. Se PostgreSQL continuar indisponível, deixar o teste de integração condicional e registrar explicitamente o bloqueio.
6. Atualizar API/contratos, Fonte de Verdade, `PRODUCT_SCOPE.md` se necessário, roadmap, `todo.md`, índice e handoffs; criar migration `0047` aditiva se o schema exigir.

Abrir branch `feat/o3.1-unified-leads` a partir de `feat/o1.4-o2.4-operational-core`; publicar PR empilhado sobre essa branch. Não mesclar PR #6 ou o novo PR automaticamente. Executar `pnpm check`, `pnpm test`, `pnpm build`, gates do gateway se tocados e `git diff --check` antes de publicar.
