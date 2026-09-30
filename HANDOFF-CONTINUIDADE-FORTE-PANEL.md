

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
