# Forte Panel — Rastreio de execução

Atualizado em: 2026-09-30

## Regra de execução acordada

1. **Fazer primeiro todas as fatias de coding da fila.**
2. Validar cada fatia com testes locais, typecheck, build, CI e Docker quando aplicável.
3. Não mascarar limitações externas: staging, restore, browser smoke, billing real e release público têm gates próprios.
4. Ao final da fila de coding, executar uma rodada de **refatoração orientada por evidência**: corrigir somente o que falhou, ficou duplicado, não está funcional ou contradiz os contratos.
5. Não fazer merge automático, não apagar volumes e manter `CORE_ONLY_MODE` ativo.

## Estado consolidado

| Área | Estado | Evidência |
|---|---|---|
| O7.4 histórico Baileys | Concluída | CI PostgreSQL; 5 eventos saíram da fila ativa; `pending=0` |
| O7.5 dead-letter | Concluída | CI PostgreSQL; 5 envelopes preservados em `dead-letter` |
| O7.6 observabilidade DLQ | Concluída | Imagem `sha-f66ec8d`; `deadLetter=5` antes/depois do restart |
| Smoke inbound | Concluído | `[forte-worker] eventos=1 entregues=1 falhas=0` |
| Smoke outbound | Concluído | `[forte-worker] eventos=1 entregues=1 falhas=0` |
| Sessão persistente | Concluída | Reconectou após restart sem novo QR |
| Release público | Bloqueado por gates externos | Ainda exige staging, restore, browser smoke, segurança e revisão final |

Auditoria documental de 2026-09-30 confirmou gaps adicionais além do resumo operacional: idempotência de efeito externo no gateway, transação inbound, hardening de sessão/webhook/headers, runbook, observabilidade externa, coorte de até 10 workspaces, fallback/custo da IA, UX pública e billing continuam abertos. Detalhamento em [`AUDITORIA-GAPS-MVP-2026-09-30.md`](./AUDITORIA-GAPS-MVP-2026-09-30.md).

## Fila de coding

### C1 — Regressão de classificação HTTP da outbox

**Estado:** concluído nesta rodada.

Adicionar cobertura explícita para garantir que:

- `400–499`, exceto `408` e `429`, vão para dead-letter;
- `408 Request Timeout` continua retryável;
- `429 Too Many Requests` continua retryável;
- `5xx` e erros de rede continuam retryáveis;
- dead-letter não volta para a fila ativa.

Validação: 5 testes da outbox passaram; `npm run check`, `pnpm check` e `git diff --check` passaram.

### C2 — Auditoria de contratos e superfícies de operação

**Estado:** concluído nesta rodada.

Revisar contratos de `/ready`, snapshot de instância, outbox, documentação Docker, logs seguros e comandos de operação. Corrigir inconsistências somente quando houver teste ou evidência concreta.

Resultado: foi adicionada regressão HTTP garantindo que `/ready` preserve `webhookOutboxPending`, `webhookOutboxDeadLetter` e `webhookLastError`.

### C3 — Cobertura de falhas de restart e recuperação

**Estado:** concluído nesta rodada.

Adicionar testes determinísticos para restart com fila ativa, dead-letter existente e diretório ausente, sem alterar o volume real do usuário.

Validação: 6 testes da outbox e 16 testes HTTP do gateway passaram; typechecks do gateway e Panel passaram.

### C4 — Revisão final de integração

**Estado:** concluído nesta rodada.

Rodar a suíte completa, CI PostgreSQL, testes do gateway, build das imagens e smoke Docker. Consolidar falhas em uma lista única antes de refatorar.

Resultado: Panel `268 passed / 55 skipped`; gateway `76 passed`; typechecks e builds passaram; PR #32 tem CI PostgreSQL verde. Avisos observados: `OAUTH_SERVER_URL` ausente nos testes que apenas inicializam o adapter, testes persistentes explicitamente skipped e warning de bundle frontend acima de 500 kB.

## Fase final — Refatoração orientada por falhas

Executar somente depois de C1–C4:

- corrigir testes flakey/races;
- remover duplicação descoberta na auditoria;
- alinhar nomes e contratos;
- melhorar logs sem payload ou secret;
- atualizar documentação que contradiga o comportamento real;
- repetir todos os gates após cada correção.

**Não refatorar por preferência estética enquanto os gates ainda estiverem sendo descobertos.**

**Resultado desta rodada:** nenhuma falha funcional, race ou contrato contraditório foi encontrado; nenhuma refatoração corretiva foi aplicada. O warning de bundle e a configuração ausente de OAuth ficam registrados como itens operacionais separados, não como regressões desta fila.

## Gates de release que não são substituídos por coding

- staging persistente;
- restore em ambiente limpo;
- browser desktop/mobile e acessibilidade;
- revisão de tenancy, papéis e segredos;
- observabilidade externa;
- provider de billing real, se ativado futuramente;
- revisão legal e decisão explícita de release público.

## Histórico de execução

| Data | Item | Resultado |
|---|---|---|
| 2026-09-30 | O7.4 | ACK `202 ignored` para histórico não importável |
| 2026-09-30 | O7.5 | HTTP 4xx permanente em dead-letter |
| 2026-09-30 | O7.6 | `webhookOutboxDeadLetter` no snapshot |
| 2026-09-30 | Docker local | `connected`, `pending=0`, `deadLetter=5` após restart |
| 2026-09-30 | Smoke negócio | inbound e outbound: `eventos=1`, `entregues=1`, `falhas=0` |
