# Handoff — Forte Panel

## Contexto do produto

O Forte Panel está sendo transformado de superfícies beta/demo em um SaaS público de operação comercial para negócios atendidos por WhatsApp. A sequência atual é saneamento público → onboarding → WhatsApp confiável → lead/Inbox → orçamento → agenda/recebimento → IA supervisionada → Admin de produção → planos e cobrança.

O repositório é `geordptoroy/forte-panel`, no caminho `/home/ubuntu/forte-panel`. A branch é `feat/o1.3-attendance-rule-simulation`; o commit de implementação O1.3 é `6f5a812`. Revalidar ambiente, branch, HEAD, status, remote e disponibilidade do PostgreSQL antes de reutilizar qualquer estado.

## Estado de GitHub

- O PR [#4](https://github.com/geordptoroy/forte-panel/pull/4) contém O1.2 e segue aberto contra `main`; o último estado observado reportou `mergeStateStatus=UNSTABLE`.
- O PR [#5](https://github.com/geordptoroy/forte-panel/pull/5) contém O1.3 e foi aberto contra a branch `feat/o1.2-operational-service-catalog`, portanto está **empilhado** sobre #4. Não mesclar #5 isoladamente para `main` nem fazer merge automático.
- O1.3 está publicada na branch remota; commits posteriores de atualização de handoff podem estar no topo quando esta nota for lida.

## Última fatia: O1.3 — regras e revisão de exemplos

A etapa Revisão do onboarding mostra três casos seguros fixos: serviço/preço fora do catálogo, pedido de horário específico e reclamação/pedido de pessoa. Se houver consentimento `llm`, o responsável pode gerar uma prévia estruturada com o perfil-candidato atual. Essa chamada não acessa catálogo/agenda real, não executa ferramentas, não confirma blocos, não publica e não persiste as respostas; uma resposta só pode ser reutilizada no FAQ como rascunho editável.

A revisão humana fica registrada em `workspace_settings` com fingerprint do candidato de publicação, modo, data e responsável. O hash fica obsoleto após alteração do candidato, e `publishOnboardingDraft` o verifica novamente no servidor. Identidade, oferta, operação e limites continuam exigindo confirmação humana por bloco, checklist completo e ausência de conflitos. Rollback continua imutável/versionado e registra a revisão da versão restaurada.

Arquivos de entrega: `O1.3-ENTREGA-REGRAS-E-REVISAO-EXEMPLOS.md`, `server/onboarding-simulation.ts`, `server/onboarding-review.ts` e os tipos/testes em `shared/`.

## Validação e limites

No Sandbox: `pnpm check` passou; `pnpm test` passou com **214 testes aprovados e 48 ignorados em 65 arquivos**; `pnpm build` passou com aviso de bundle frontend acima de 500 kB; `git diff --check` passou. O teste PostgreSQL de publicação/revisão/obsolescência/rollback foi adicionado, mas ficou ignorado por ausência de `DATABASE_URL`/PostgreSQL.

Nenhuma migration nova foi criada. O onboarding continua como `not_ready` no release catalog; `/onboarding` não foi liberado, `CORE_ONLY_MODE` permanece, e ainda falta prova manual persistente/browser. Esta fatia não inicia Stripe, WhatsApp nem cobrança SaaS. A integração comercial própria do Forte Panel continua no roadmap O7.1/O7.2, posterior ao núcleo operacional e aos gates do produto.

## Próximo passo

A próxima fatia é **O1.4 — retomada, autosave, missing/conflict e estados vazios**. Antes de começar, revisar `PROJECT_DOCUMENTATION_INDEX.md`, `ROADMAP-EXECUCAO-FORTE-PANEL.md`, `FORTE-PANEL-FONTE-DE-VERDADE.md`, o handoff e a entrega O1.3; confirmar o estado dos PRs #4 e #5. Trabalhar em branch separada empilhada sobre O1.3, se os PRs continuarem pendentes. Executar `pnpm check`, `pnpm test`, `pnpm build` e `git diff --check`; registrar testes PostgreSQL como pendentes se o banco não estiver disponível. Não ampliar para billing, release gate ou integração real do WhatsApp sem o corte correspondente no roadmap.
