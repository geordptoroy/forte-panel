

# Roadmap unificado — Auditoria técnica + PAPI Cloud

A auditoria técnica anexada é o roadmap principal do Forte Panel. A implementação PAPI Cloud não substitui a auditoria: ela é uma frente do roadmap de integrações e deve avançar em paralelo às correções de segurança, tenancy, agente, confiabilidade e operação.

## Estado consolidado em 25/09/2026

| Frente | Estado | Próxima ação |
|---|---|---|
| Segurança de sessão, revogação e containers | Fase 1 implementada e publicada | Validar em staging e corrigir pendências encontradas |
| Credenciais PAPI por instância | Entidade persistente criada | Migrar credenciais antigas e adicionar rotação completa |
| Canais conectados/webhooks | UI e backfill implementados | Testar com duas instâncias e webhook autenticado |
| PAPI Cloud | Provisionamento atrás de flag | Executar smoke test real com token configurado |
| Multi-tenant | Parcial; helpers ainda usam workspace demo/global | Tornar workspace derivado da sessão/membership |
| Idempotência | Índices e dedupe existentes; concorrência ainda precisa teste/claim atômico | Implementar e testar `INSERT ... ON CONFLICT` como claim |
| Outbox/worker | Eventos e retries existem; lease/outbox transacional ainda pendentes | Adicionar `workerId`, `claimedAt`, `leaseUntil` e transações |
| Agente nativo | Funcional, mas faltam ledger, fencing/handoff, mídia e timeout | Implementar na ordem da auditoria |
| Storage proxy | Endurecimento implementado na Fase 1 | Adicionar ownership por workspace e testes de autorização |
| CI/CD | Gates básicos publicados | Adicionar integração PostgreSQL, E2E, scan de imagem e smoke test |
| Operação Oracle | Arquitetura definida, ainda não implantada | Validar ARM64, backup/restore e deploy por SHA |

## Ordem obrigatória daqui para frente

1. **Smoke test PAPI Cloud** em instância descartável, sem ativar produção.
2. Confirmar contrato real de webhook: assinatura, retry, payload e `fromMe`.
3. Corrigir autenticação obrigatória/rotação de webhook se o contrato Cloud permitir.
4. Preservar `instanceId` no payload do domínio e no evento do agente.
5. Implementar tenancy por membership real antes de vender para múltiplos workspaces.
6. Implementar claim idempotente concorrente.
7. Implementar outbox transacional e leases do worker.
8. Implementar ledger de tool calls, fencing de handoff e comandos `#humano`/`#bot`.
9. Adicionar timeout/circuit breaker do LLM e tratamento de falhas de tools.
10. Criar testes PostgreSQL reais, E2E e smoke test automatizado no CI.
11. Preparar Oracle, backups off-host, restore e rollback por SHA.

## Critério de conclusão comercial

O sistema só será considerado pronto para produção comercial quando, em staging, demonstrar: nenhum segredo operacional no Git; webhook autenticado e rotacionável; isolamento entre dois workspaces; membro desativado sem acesso; idempotência concorrente; ausência de duplicação após restart; handoff humano bloqueando resposta em andamento; `instanceId` determinando o canal de saída; mídia tratada corretamente; migration/backup/restore/rollback testados; CI com integração/E2E/scan/smoke; e health, logs, métricas e alertas operacionais.

A decisão permanece: desenvolvimento local em Docker, PostgreSQL como banco principal, PAPI self-hosted como provider local padrão, PAPI Cloud como provider futuro reversível e login administrativo/proprietário único preservado.
