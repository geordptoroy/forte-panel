

## 30. Interatividade nativa Baileys concluída — 2026-09-29

A camada de mensagens interativas foi fechada no código, sem depender de teste manual para descobrir a integração:

- **Botões** continuam com 1–3 opções.
- **Listas** agora são montadas no `instance-manager` com `sections`, `rows`, `buttonText`, título e rodapé.
- **Enquetes** agora usam o formato nativo `{ poll: { name, values, selectableCount } }` do Baileys.
- **Carousel** aceita o `InteractiveMessage.carouselMessage` nativo via relay do socket, com validação para impedir payload arbitrário sem a estrutura nativa.
- O Inbox ganhou composer para botões, listas e enquetes; carousel pode ser enviado pelo editor JSON do `InteractiveMessage` documentado pelo Baileys.
- O histórico reconhece carousel e o renderiza como mensagem estruturada.
- Foi criada a migration `0044_carousel_message_type.sql`.

Validação automatizada: typecheck e build do Panel, 6 testes focados do backend, 64 testes do gateway Baileys, build TypeScript do gateway e `git diff --check`.

## 31. O1.2 — Catálogo operacional conectado ao onboarding — 2026-09-29

O onboarding agora lê e grava no catálogo existente de serviços, profissionais, vínculos e disponibilidade. O preço possui os modos `fixed`, `starting_at` e `quote`; a migration aditiva `0045_service_price_mode.sql` mantém os registros anteriores como `fixed`. A tela administrativa edita os modos de preço; o onboarding cadastra serviço, duração, preço e vínculo opcional, permite cadastrar profissionais e registrar a jornada semanal. A nota livre do perfil é complementar, com opções seguras para “usar o catálogo” e “decidir depois”.

`consultar_agenda` e `GET /api/v1/availability` expõem `priceType`; o prompt publicado usa catálogo e agenda atuais, não trata jornada como vaga, não estima preço sob consulta e só afirma agendamento confirmado após sucesso da ferramenta. Vínculos estrangeiros de profissional são rejeitados pelo helper tenant-scoped.

Validação no Sandbox: `pnpm check`, `pnpm build` e `git diff --check` passaram; `pnpm test` passou com 212 testes aprovados e 48 ignorados (incluindo os que requerem PostgreSQL). Não houve prova manual no PostgreSQL persistente nem publicação de onboarding; o estado de release continua `not_ready`. A geração automática Drizzle está bloqueada por colisão preexistente nos snapshots 0041/0043; a migration 0045 foi registrada manualmente, seguindo o padrão do SQL 0044.

**Próxima fatia:** O1.3 — regras de atendimento e revisão de exemplos. Preservar publicação humana, estados de revisão e o gate de produto; não desativar `CORE_ONLY_MODE` nesta etapa.

**Commit de implementação:** `6bd2442` — `feat: connect onboarding to operational service catalog` (branch `feat/o1.2-operational-service-catalog`).
**PR:** [#4](https://github.com/geordptoroy/forte-panel/pull/4), aberto contra `main`, não mesclado.


## 32. O1.3 — Regras de atendimento e revisão de exemplos — 2026-09-29
A etapa Revisão agora apresenta três cenários seguros fixos (serviço/preço não confirmado, horário específico e pedido de atendimento humano). Com consentimento `llm`, o responsável pode simular respostas do rascunho atual; a simulação não consulta catálogo nem agenda, não executa ações e não armazena o texto gerado. As saídas são temporárias, limitadas e só podem ser copiadas ao FAQ como rascunho.
A confirmação de revisão é registrada em `workspace_settings` com hash do perfil-candidato, modo, data e responsável. O servidor bloqueia a publicação se o hash não corresponder exatamente ao candidato atual; editar o candidato torna a revisão obsoleta. Os quatro blocos obrigatórios, estados `draft/missing/conflict`, consentimentos, versionamento e rollback permanecem intactos. Um rollback explicitamente acionado registra a versão restaurada como revisão atual.
Validação no Sandbox: `pnpm check` passou; `pnpm test` passou com 214 testes aprovados e 48 ignorados (inclui testes condicionais a PostgreSQL); `pnpm build` passou, com o aviso do bundle frontend acima de 500 kB; `git diff --check` passou. Os testes persistidos de publicação/revisão não executaram por ausência de PostgreSQL/DATABASE_URL. Nenhuma migration foi criada. O release catalog continua `not_ready`; `/onboarding` não foi liberado.
**Próxima fatia:** O1.4 — retomada, autosave, missing/conflict e estados vazios. Não ampliar para Stripe, WhatsApp ou release gate nesta etapa.
**Entrega:** `O1.3-ENTREGA-REGRAS-E-REVISAO-EXEMPLOS.md`. Commit `6f5a812` na branch `feat/o1.3-attendance-rule-simulation`; PR [#5](https://github.com/geordptoroy/forte-panel/pull/5), empilhado sobre o PR [#4](https://github.com/geordptoroy/forte-panel/pull/4) da O1.2. Ambos permanecem sem merge.


## 33. O1.4–O2.4 — Onboarding retomável e núcleo WhatsApp resiliente — 2026-09-30

As cinco fatias O1.4, O2.1, O2.2, O2.3 e O2.4 foram fechadas em código: retomada/autosave com revisão serializada; backoff limitado e logout final; leases recuperáveis com fencing; reconciliação monotônica `sent → delivered → read`; upload privado autenticado até 8 MiB e URL HTTPS assinada no envio. A documentação detalhada está em `O1.4-O2.4-ENTREGA-ONBOARDING-WHATSAPP.md`. Também alinhei `PRODUCT_SCOPE.md` com a decisão canônica Baileys-only e corrigi o gate de mídia obsoleto na Fonte de Verdade.

Validação no Sandbox: `pnpm check`; `pnpm test` — 225 aprovados, 51 ignorados em 70 arquivos; `pnpm build` (aviso existente de bundle frontend >500 kB); `npm --prefix forte-whatsapp run check`; `npm --prefix forte-whatsapp test` — 72 aprovados; `npm --prefix forte-whatsapp run build`; `git diff --check`. Os testes condicionais a PostgreSQL foram ignorados porque `DATABASE_URL` não está disponível. Migrations 0045/0046 aguardam aplicação em PostgreSQL persistente; nenhuma prova de QR, entrega física, restore ou upload real foi feita. `CORE_ONLY_MODE` permanece ativo.

**Commit de implementação:** `c1cd9d6` — `feat: harden onboarding and WhatsApp operations`.
**PR:** [#6](https://github.com/geordptoroy/forte-panel/pull/6), branch `feat/o1.4-o2.4-operational-core`, base `feat/o1.3-attendance-rule-simulation`; aberto, sem merge. #4 e #5 também continuam abertos; não mesclar automaticamente uma fatia empilhada.

**Próxima fatia:** O3.1 — Lead unificado entre contato, conversa e oportunidade. O schema atual ainda representa o lead como `contacts.stage`, sem tabelas explícitas `leads`/`opportunities`; a ingestão cria contato/conversa/mensagem e ignora grupos para IA. Implementar relações tenant-scoped e idempotentes, sem promover histórico, `fromMe`, grupo ou evento ignorado a novo lead.


## 34. O3.1 — Lead unificado entre contato, conversa e oportunidade — 2026-09-30

A branch `feat/o3.1-unified-leads` foi criada e reempilhada sobre o head atualizado do PR #6 (`feat/o1.4-o2.4-operational-core`); head atual de implementação `805940b` (`feat: unify WhatsApp leads and opportunities`). PR [#7](https://github.com/geordptoroy/forte-panel/pull/7) está aberto como filho do PR #6; nenhum PR foi mesclado. O modelo introduz Lead por `(workspaceId, contactId)`, Opportunity por Lead e `Conversation.opportunityId`; o stage da Opportunity é canônico e `contacts.stage` é espelho sincronizado. A migration aditiva 0047 faz backfill de contatos individuais e liga conversas existentes. Inbound individual aceito ao vivo cria/atualiza o registro de forma idempotente; `fromMe`, grupos, histórico/backfill, inválidos e ignorados não viram Lead comercial.

Validação local no Sandbox: `pnpm check` passou; `pnpm test` — 53 arquivos passaram, 18 foram ignorados; 228 testes passaram e 52 foram ignorados; `pnpm build` passou com o aviso existente de bundle frontend acima de 500 kB; `git diff --check` passou. O PostgreSQL CI aplicou 0047 e passou os 7 testes de `server/inbox-instance-filter.integration.test.ts`. A fixture antiga de `professional-isolation.test.ts` foi isolada no commit `9e3e48d` do PR #6. Reruns finais passaram: PR #6 `36664794193` — 70 arquivos/276 testes; PR #7 `36664802619` — 71 arquivos/280 testes. CI efêmero não substitui staging/produção: rotas seguem `not_ready` e `CORE_ONLY_MODE` continua ligado. Entrega detalhada: `O3.1-ENTREGA-LEAD-UNIFICADO.md`. Próxima fatia: **O3.2 — Inbox operacional com assignment e follow-up**.


## 35. O3.2 — Inbox operacional: assignment e próxima ação — 2026-09-30

A branch `feat/o3.2-inbox-assignment-follow-up` adiciona assignment tenant-scoped em Opportunity e uma próxima ação aberta por Opportunity, persistida em `opportunityFollowUps`, com prazo, auditoria, reagendamento e conclusão. Só owner/admin/manager atribui; somente membership ativa do mesmo workspace pode ser responsável. A desativação limpa a atribuição. O Inbox mostra owner e estado/prazo; a próxima ação não chama scheduler nem envia mensagem. A migration aditiva 0048 registra a nova coluna/tabela e índices. O contrato tRPC e as decisões de produto foram documentados.

Gates locais: `pnpm check`, `pnpm test` (54 arquivos aprovados/18 ignorados; 232 testes aprovados/53 ignorados por ausência de PostgreSQL), `pnpm build` e `git diff --check` passaram; build mantém o aviso existente do bundle frontend >500 kB. O primeiro PostgreSQL run do PR #8 (`36707960513`) aplicou migrations mas falhou num fixture que consultava o contato do workspace B pelo workspace A; o fixture foi corrigido no commit `d1b5ca8`. O rerun `36708180817` passou a suíte completa com 72 arquivos/285 testes e zero skips, aplicando 0048.

PR [#8](https://github.com/geordptoroy/forte-panel/pull/8) está aberto e empilhado sobre o PR #7; nenhum merge foi feito. CI PostgreSQL é efêmero e não substitui staging persistente, restore, smoke desktop/mobile ou prova real Baileys; manter `CORE_ONLY_MODE` e rotas `not_ready`. Entrega: `O3.2-ENTREGA-INBOX-OPERACIONAL.md`. Próxima fatia: O3.3 — funil canônico sem duplicação de estado.


## 36. O3.3 — Funil canônico sem duplicação de estado — 2026-09-30

A branch `feat/o3.3-canonical-opportunity-stage` implementa `Opportunity.stage` como fonte comercial canônica e mantém `contacts.stage` apenas como espelho de compatibilidade. A migration aditiva 0049 cria `opportunityStageHistory` e faz backfill idempotente das oportunidades existentes. O helper cria/atualiza Lead, Opportunity, baseline e vínculo à Conversation na mesma transação. A transição centralizada serializa por Opportunity e atualiza estágio, espelho, histórico imutável, audit log e outbox na mesma transação. No-op não cria transição falsa; divergência do espelho é reparada com auditoria própria. Inbox, CRM/Kanban, Agenda, REST e `leadMemoryOperation` priorizam o estágio da Opportunity; grupos permanecem fora do funil comercial.

Validação no Sandbox: `pnpm check`, `pnpm test` (54 arquivos passaram/18 ignorados; 232 testes passaram/53 ignorados), `pnpm build` e `git diff --check` passaram. Integrações que requerem PostgreSQL, incluindo O3.3, ficaram ignoradas localmente por ausência de `DATABASE_URL`. O build preserva o aviso existente de bundle frontend acima de 500 kB.

A [PR #9](https://github.com/geordptoroy/forte-panel/pull/9) foi aberta empilhada sobre PR #8. O CI PostgreSQL run [`36710769990`](https://github.com/geordptoroy/forte-panel/actions/runs/36710769990), no commit `7dc0efc`, passou: aplicou 0049 e executou 72 arquivos/285 testes sem skips. O resultado é efêmero; não houve prova em staging persistente, restore, smoke mobile/desktop ou WhatsApp físico. `CORE_ONLY_MODE` permanece ativo e nenhum secret real foi usado. Detalhes: `O3.3-ENTREGA-FUNIL-CANONICO.md`.

**Próxima fatia:** O3.4 — orçamento com itens, validade e aprovação humana, sem cobrança real/Stripe. Preservar a pilha aberta sem merge automático.

## 37. O7.4 — Reconciliação de histórico Baileys não importável — 2026-09-30

A branch `feat/o7.4-webhook-history-reconciliation` deve ser criada sobre `feat/o7.3-controlled-public-release`, sem merge automático. O callback Baileys agora classifica histórico sem conteúdo, com telefone curto ou grupo sem JID/instância verificável como `202 accepted` + `ignored: true`, depois de resolver workspace e ownership da instância. Isso encerra o envelope da outbox sem criar entidade comercial. Eventos históricos importáveis e eventos live preservam os fluxos anteriores.

Validação no Sandbox: `pnpm exec vitest run server/baileys-webhook-policy.test.ts` passou com 4 testes; `pnpm check`, `pnpm build` e `git diff --check` passaram. A suíte ampla passou 230 testes e ignorou 73, mas falhou em 7 arquivos do subprojeto `forte-whatsapp` por dependências ausentes (`baileys`, `pino`, `qrcode`) e pelo patch pinned. A confirmação dos cinco arquivos históricos reais precisa ser feita no Docker do usuário, preservando volumes; não apagar sessão nem usar secrets.

Entrega: `O7.4-ENTREGA-RECONCILIACAO-HISTORICO-WEBHOOK.md`.

## 38. O7.5 — Dead-letter para falhas permanentes do webhook — 2026-09-30

A branch `feat/o7.5-webhook-dead-letter` será criada sobre `feat/o7.4-webhook-history-reconciliation`, sem merge automático. A `WebhookOutbox` mantém retries para 5xx, timeout, rede, 408 e 429; outros 4xx são classificados como permanentes e movidos para `outbox/dead-letter/` com envelope, tentativas, erro, timestamp e motivo. O diretório não é reprocessado como fila ativa e nenhum dado é apagado de forma destrutiva.

Validação: `npm exec vitest run src/webhook-outbox.test.ts` passou com 3 testes; `npm run check` e `npm run build` do gateway passaram; `pnpm check` do Panel e `git diff --check` passaram. `npm ci` aplicou o patch Baileys fixado e reportou vulnerabilidades existentes; não foi executado `npm audit fix --force`. Docker/staging e sessão real não foram alterados.

Entrega: `O7.5-ENTREGA-DLQ-WEBHOOK.md`.

## 39. O7.6 — Observabilidade da dead-letter no status da instância — 2026-09-30

A branch `feat/o7.6-webhook-dead-letter-observability` será criada sobre `feat/o7.5-webhook-dead-letter`, sem merge automático. O snapshot da instância passa a expor somente `webhookOutboxDeadLetter`, a quantidade de arquivos JSON na dead-letter, separado de `webhookOutboxPending` e `webhookLastError`. Nenhum payload, URL ou secret é exposto e o diretório não volta para a fila ativa.

Validação: `npm exec vitest run src/webhook-outbox.test.ts` passou com 3 testes; `npm run check` e `npm run build` do gateway passaram; `pnpm check` do Panel e `git diff --check` passaram. Docker/staging e sessão real não foram alterados.

Entrega: `O7.6-ENTREGA-OBSERVABILIDADE-DLQ.md`.
