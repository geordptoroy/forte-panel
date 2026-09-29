

## Auditoria transversal adicional — bloqueadores antes do beta

A auditoria completa de segurança, desempenho, engenharia, dados, operação, testes e UI/UX está em `AUDITORIA-TRANSVERSAL-SEGURANCA-DESEMPENHO-UX-FORTE-PANEL.md`.

Antes de convidar as dez empresas, trate como bloqueadores de release:

1. Baileys-only precisa ser invariant no schema, contratos, API, worker, Compose, UI e CI; nenhum provider antigo pode ser selecionável.
2. O `Idempotency-Key` precisa chegar ao efeito Baileys por ledger durável no gateway; testar timeout depois do envio, restart e concorrência.
3. Inbound precisa usar transação única para webhook, contato, conversa, mensagem, unread e domain event; usar outbox/compensação para storage externo.
4. Remover base64 e mídia bruta do caminho síncrono; usar upload/streaming, storage privado obrigatório, referência, metadata, limite e quota.
5. O quality gate de release deve usar PostgreSQL, migrations, zero skips críticos, testes de contrato, browser/axe, staging Baileys e restore.
6. Toda ação do Console Admin deve passar por support session, workspace explícito, modo, expiração e motivo; mutation e auditoria devem ser atômicas.
7. Exigir criptografia de auth state, revogação real de sessão, ownership de storage, webhook por instância com anti-replay, CSRF e rate limit distribuído.
8. Implementar fila com claim/lease/backoff/DLQ, índices/paginação da Inbox, métricas p95/p99, heap, WAL, pool e queue age.
9. Corrigir deploy por digest, health/readiness de Panel/worker/gateway/instâncias, reconnect com backoff/jitter, backup off-host e restore ensaiado.
10. Corrigir branding para Forte Panel, onboarding guiado, erros inline, dialogs/foco/labels acessíveis e fluxo mobile da Inbox.

A ordem é: P0 técnico e segurança; quality gate e restore; Console Admin operacional; mídia e performance; UX/onboarding; depois staging com dois workspaces e finalmente coorte de dez. Não declarar prontidão com base apenas em typecheck, testes unitários, documentação histórica ou healthcheck de banco.
