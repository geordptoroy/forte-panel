

## Continuação pós-auditoria — correções aplicadas sem smoke test manual

Como o smoke test real da PAPI Cloud foi adiado, nenhuma instância externa foi criada e `PAPI_DEPLOYMENT` permanece self-hosted. O desenvolvimento continuou nas correções que não dependem de credencial Cloud:

- `instanceId` agora é copiado do metadata da mensagem para o payload `message.received`.
- O worker entrega `instanceId` ao `NativeAgentEvent`.
- A resposta do agente preserva `instanceId` no outbound, evitando cair na instância padrão quando a entrada veio por uma instância específica.
- Chamadas LLM agora têm timeout configurável por `AGENT_LLM_TIMEOUT_MS`, com padrão de 45 segundos e limite máximo de 180 segundos.

Validação após estas mudanças: `pnpm check`, `pnpm test` (39 aprovados; 13 ignorados por dependência externa), `pnpm build` e `git diff --check` passaram.

Ainda permanecem no roadmap, para as próximas etapas, claim idempotente concorrente, leases robustos, outbox transacional, ledger de tool calls, fencing de handoff, parser de comandos humanos, mídia multimodal real, tenancy derivado da membership e testes reais PostgreSQL/E2E.
