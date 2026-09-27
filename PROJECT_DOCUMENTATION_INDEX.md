# Forte Panel — índice de documentação

Este arquivo organiza a documentação do projeto e aponta qual documento consultar em cada decisão.

## Começar pela continuidade

1. [`HANDOFF-CONTINUIDADE-FORTE-PANEL.md`](./HANDOFF-CONTINUIDADE-FORTE-PANEL.md) — histórico de execução, decisões e próximo passo.
2. [`todo.md`](./todo.md) — checklist vivo da implementação.
3. [`PLANO-INTERMEDIARIO-FORTE-PANEL.md`](./PLANO-INTERMEDIARIO-FORTE-PANEL.md) — sequência de blocos técnicos e riscos.
4. [`BETA-OPERATIONS-CHECKLIST.md`](./BETA-OPERATIONS-CHECKLIST.md) — manual consolidado de operação do beta, migrations, quotas e segurança.
5. [`STATUS-COMPLETO-E-PLANO-BETA.md`](./STATUS-COMPLETO-E-PLANO-BETA.md) — visão completa do que funciona, como funciona, plano do console admin e pendências antes do beta.
6. [`AUDITORIA-DOCUMENTACAO-E-ROADMAP-2026-09-26.md`](./AUDITORIA-DOCUMENTACAO-E-ROADMAP-2026-09-26.md) — auditoria de divergências e roadmap canônico por fases.
7. [`PLANO-AUDITORIA-E-EXECUCAO-2026-09-27.md`](./PLANO-AUDITORIA-E-EXECUCAO-2026-09-27.md) — plano priorizado P0–P3 para console, operação, QR, UX, produto, planos e LGPD.
8. [`PLANO-CADASTRO-AUDIO-E-PAGAMENTOS-2026-09-27.md`](./PLANO-CADASTRO-AUDIO-E-PAGAMENTOS-2026-09-27.md) — auditoria de melhoria contínua, funil de cadastro com respostas em áudio e modelo de orçamento, chave Pix e registro manual de recebimentos.
9. [`GUIA-LEVANTAMENTO-ONBOARDING-ASSISTIDO-IA.md`](./GUIA-LEVANTAMENTO-ONBOARDING-ASSISTIDO-IA.md) — perguntas progressivas, entrada por áudio/texto, geração de prompt com confirmação e suporte administrativo auditado.
10. [`GUIA-CONVITES-E-PERMISSOES.md`](./GUIA-CONVITES-E-PERMISSOES.md) — convite de funcionários, RBAC/ABAC, matriz de visibilidade, escopos de Inbox e critérios de aceite.
11. [`GUIA-UX-CLAREZA-E-FACILIDADE.md`](./GUIA-UX-CLAREZA-E-FACILIDADE.md) — checklist de primeiro acesso, linguagem para leigos, estados vazios, ajuda contextual, previews e métricas de abandono.
12. [`CAPABILITY-MATRIX.md`](./CAPABILITY-MATRIX.md) — capacidade, código, evidência de teste e ambiente efetivamente validado.

## Produto e tenancy

- [`PRODUCT_SCOPE.md`](./PRODUCT_SCOPE.md) — limites do produto, público e modelo multi-conta.
- [`ESTRATEGIA-PRODUTO-PUBLICO-MULTICONTA.md`](./ESTRATEGIA-PRODUTO-PUBLICO-MULTICONTA.md) — estratégia de produto público multi-tenant.
- [`FASE-1-SEGURANCA-CONTENCAO.md`](./FASE-1-SEGURANCA-CONTENCAO.md) — regras de contenção e segurança da primeira fase.
- [`AUDITORIA-TECNICA-E-ROADMAP.md`](./AUDITORIA-TECNICA-E-ROADMAP.md) — auditoria, prioridades e riscos técnicos.

> Para decisões atuais, use o roadmap datado acima. Os planos intermediários e handoffs continuam como histórico de execução e não substituem a fonte de verdade atual.

## API, agente e integrações

- [`API_CONTRACT.md`](./API_CONTRACT.md) — endpoints REST, payloads, idempotência, webhooks, quotas e erros.
- [`CONFIGURACAO-MULTIMODEL-AGENTE.md`](./CONFIGURACAO-MULTIMODEL-AGENTE.md) — configuração multi-modelo do agente.
- [`AI_AGENT_PROMPT_FORTE_PANEL.md`](./AI_AGENT_PROMPT_FORTE_PANEL.md) — prompt operacional do agente.
- [`AI_AGENT_PROMPT_GABRIEL_FORTE_PANEL_COMPLETO.md`](./AI_AGENT_PROMPT_GABRIEL_FORTE_PANEL_COMPLETO.md) — prompt completo de referência.
- [`CONTINUATION_2026-09-24_IN_APP_NOTIFICATIONS.md`](./CONTINUATION_2026-09-24_IN_APP_NOTIFICATIONS.md) — contrato e histórico das notificações internas.
- [`CONTINUATION_2026-09-24_CATALOG_AND_ISOLATION.md`](./CONTINUATION_2026-09-24_CATALOG_AND_ISOLATION.md) — catálogo e isolamento.
- [`CONTINUATION_2026-09-24_PROFESSIONAL_PORTAL.md`](./CONTINUATION_2026-09-24_PROFESSIONAL_PORTAL.md) — portal profissional.
- [`CONTINUATION_2026-09-24_SCHEDULE_VALIDATION.md`](./CONTINUATION_2026-09-24_SCHEDULE_VALIDATION.md) — agenda, fuso e validações.

## Cadastro, onboarding e financeiro

- [`PLANO-CADASTRO-AUDIO-E-PAGAMENTOS-2026-09-27.md`](./PLANO-CADASTRO-AUDIO-E-PAGAMENTOS-2026-09-27.md) — funil de cadastro por áudio, checklist de onboarding, modelo de orçamento, chave Pix, registro manual de recebimentos e recibos.
- [`GUIA-LEVANTAMENTO-ONBOARDING-ASSISTIDO-IA.md`](./GUIA-LEVANTAMENTO-ONBOARDING-ASSISTIDO-IA.md) — guia operacional do núcleo obrigatório, perguntas condicionais, prompt rascunho/publicado, revisão do prestador e suporte do administrador.

## Infraestrutura e desenvolvimento

- [`infra/LOCAL_TEST.md`](./infra/LOCAL_TEST.md) — comandos de execução/teste local.
- [`infra/VPS_STACK.md`](./infra/VPS_STACK.md) — stack de VPS e produção.
- [`ATUALIZACAO-STACK-DESENVOLVIMENTO.md`](./ATUALIZACAO-STACK-DESENVOLVIMENTO.md) — atualização da stack.

## Regras de manutenção documental

Ao concluir um bloco técnico:

1. atualizar `todo.md`;
2. anexar um registro datado ao handoff;
3. atualizar o plano intermediário;
4. atualizar `API_CONTRACT.md` se houver mudança de contrato;
5. atualizar este índice se surgir documentação nova;
6. registrar validações reais e o que continua dependente de PostgreSQL;
7. publicar o commit apenas após `pnpm check`, `pnpm test`, `pnpm build` e `git diff --check`.

## Estado atual resumido

- Tenancy explícito nas superfícies CRM, Inbox, onboarding, agente, Baileys, idempotência, eventos e auditoria.
- Segredos de IA e webhook criptografados em repouso e mascarados nas respostas.
- Quotas por workspace e usuário com janela de um minuto.
- Painel de consumo em Integrações.
- Worker protegido para IA e outbound.
- Alertas in-app de 70% e 90% para gestores.
- Retenção de buckets, readiness `/api/v1/ready` e heartbeat JSON do worker.
- Validação PostgreSQL no CI aprovada com migrations limpas e nenhuma suíte ignorada; staging real ainda pendente.
- Console interno de plataforma possui código, migration, UI e cobertura de autorização, sessões, mutações, auditoria e saúde; staging real ainda pendente.
- Configuração da IA possui rascunho, simulação local, publicação, histórico e rollback; validação visual/staging e fallback explícito continuam pendentes.
- Auditoria de 27/09 encontrou `/kanban` sem rota, retorno administrativo inadequado, dead-end de workspace suspenso, divergência entre mensagens/contatos/unread/stages, QR abaixo da primeira dobra mobile, billing ainda com caminho demo e ausência de modelo SaaS/LGPD; o bloco P0 foi executado, mas os gates de staging continuam antes de novos convites.
- A auditoria de melhoria contínua de 27/09 acrescentou 26 achados novos; signup inicial, convites, recuperação, limite/origem, onboarding textual owner/admin e governança de fontes já avançaram. O funil de áudio agora possui migration, upload privado, `voice.transcribe` tenant-aware e UI MediaRecorder com preview/retry; ainda faltam expiração efetiva e estruturação/revisão por bloco. O mesmo documento planeja o financeiro operacional completo (itens, plano de pagamento, meios, ledger, recibo e conciliação).
