# Forte Panel — índice de documentação

Este arquivo organiza a documentação do projeto e aponta qual documento consultar em cada decisão.

## Começar pela continuidade

1. [`HANDOFF-CONTINUIDADE-FORTE-PANEL.md`](./HANDOFF-CONTINUIDADE-FORTE-PANEL.md) — histórico de execução, decisões e próximo passo.
2. [`todo.md`](./todo.md) — checklist vivo da implementação.
3. [`PLANO-INTERMEDIARIO-FORTE-PANEL.md`](./PLANO-INTERMEDIARIO-FORTE-PANEL.md) — sequência de blocos técnicos e riscos.
4. [`BETA-OPERATIONS-CHECKLIST.md`](./BETA-OPERATIONS-CHECKLIST.md) — manual consolidado de operação do beta, migrations, quotas e segurança.

## Produto e tenancy

- [`PRODUCT_SCOPE.md`](./PRODUCT_SCOPE.md) — limites do produto, público e modelo multi-conta.
- [`ESTRATEGIA-PRODUTO-PUBLICO-MULTICONTA.md`](./ESTRATEGIA-PRODUTO-PUBLICO-MULTICONTA.md) — estratégia de produto público multi-tenant.
- [`FASE-1-SEGURANCA-CONTENCAO.md`](./FASE-1-SEGURANCA-CONTENCAO.md) — regras de contenção e segurança da primeira fase.
- [`AUDITORIA-TECNICA-E-ROADMAP.md`](./AUDITORIA-TECNICA-E-ROADMAP.md) — auditoria, prioridades e riscos técnicos.

## API, agente e integrações

- [`API_CONTRACT.md`](./API_CONTRACT.md) — endpoints REST, payloads, idempotência, webhooks, quotas e erros.
- [`CONFIGURACAO-MULTIMODEL-AGENTE.md`](./CONFIGURACAO-MULTIMODEL-AGENTE.md) — configuração multi-modelo do agente.
- [`AI_AGENT_PROMPT_FORTE_PANEL.md`](./AI_AGENT_PROMPT_FORTE_PANEL.md) — prompt operacional do agente.
- [`AI_AGENT_PROMPT_GABRIEL_FORTE_PANEL_COMPLETO.md`](./AI_AGENT_PROMPT_GABRIEL_FORTE_PANEL_COMPLETO.md) — prompt completo de referência.
- [`CONTINUATION_2026-09-24_IN_APP_NOTIFICATIONS.md`](./CONTINUATION_2026-09-24_IN_APP_NOTIFICATIONS.md) — contrato e histórico das notificações internas.
- [`CONTINUATION_2026-09-24_CATALOG_AND_ISOLATION.md`](./CONTINUATION_2026-09-24_CATALOG_AND_ISOLATION.md) — catálogo e isolamento.
- [`CONTINUATION_2026-09-24_PROFESSIONAL_PORTAL.md`](./CONTINUATION_2026-09-24_PROFESSIONAL_PORTAL.md) — portal profissional.
- [`CONTINUATION_2026-09-24_SCHEDULE_VALIDATION.md`](./CONTINUATION_2026-09-24_SCHEDULE_VALIDATION.md) — agenda, fuso e validações.

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

- Tenancy explícito nas superfícies CRM, Inbox, onboarding, agente, PAPI, idempotência, eventos e auditoria.
- Segredos PAPI/webhook criptografados em repouso e mascarados nas respostas.
- Quotas por workspace e usuário com janela de um minuto.
- Painel de consumo em Integrações.
- Worker protegido para IA e outbound.
- Alertas in-app de 70% e 90% para gestores.
- Validação sandbox aprovada; validação concorrente com PostgreSQL real ainda pendente.
