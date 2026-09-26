

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
