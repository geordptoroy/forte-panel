

## Etapa 5 — Claim atômico de idempotência HTTP — concluída

A idempotência das rotas mutáveis deixou de usar o padrão inseguro `SELECT` antes do handler e `INSERT` depois do handler.

Agora o fluxo é:

1. `INSERT ... ON CONFLICT DO NOTHING` cria a chave em estado `processing`.
2. Apenas a requisição que conseguiu inserir executa o efeito.
3. Requisições concorrentes com o mesmo payload recebem `idempotency_in_progress` e `Retry-After: 2`.
4. Ao concluir, o registro passa a `completed` e guarda status/body para replay.
5. Payload diferente para a mesma chave continua retornando conflito.
6. Se o processo cair, o lease expira e uma nova tentativa pode reassumir a chave.

A tabela ganhou `status`, `leaseUntil` e `updatedAt`. Migration:

```text
drizzle-pg/0014_api_idempotency_claim.sql
```

Isso protege contatos, memória de lead, agendamentos, mensagens, lotes, mudança de etapa e cancelamentos que usam o helper HTTP `idempotent`.

Validação: typecheck, testes, build, journal JSON e diff check passaram. O teste de concorrência com PostgreSQL real continua planejado para a suíte de integração, sem exigir ação manual do usuário.

## Handoff de continuidade

Foi criado `HANDOFF-CONTINUIDADE-FORTE-PANEL.md` com o contexto completo para outra IA: decisões de arquitetura, commits, migrations, variáveis, comandos WSL/Docker, estado real da auditoria, limitações, smoke test adiado e próximo bloco recomendado.

## Etapa 6 — Ledger idempotente das tools do agente — concluída

Foi criada a tabela `agentEffects` com chave única por `workspaceId + eventId + toolCallId`. Ela guarda fingerprint dos argumentos, status, resultado estruturado e lease expirável.

As tools mutáveis protegidas são `atualizar_lead`, `registrar_nota`, `criar_agendamento` e `transferir_humano`. As consultas `buscar_lead` e `consultar_agenda` não criam efeitos.

Se uma tool já foi concluída, o resultado salvo é reproduzido. Se outra execução possui o lease, o efeito não é executado novamente. O reset de desenvolvimento também limpa o ledger.

Migration: `drizzle-pg/0015_agent_effects.sql`.

Validação: `pnpm check`, `pnpm test` (39 aprovados; 13 ignorados), `pnpm build`, journal JSON e diff check passaram.

Limitações para a próxima etapa: teste PostgreSQL real de crash/concorrência, estado `unknown` depois de mutação antes de persistir o resultado e fencing de handoff humano.
