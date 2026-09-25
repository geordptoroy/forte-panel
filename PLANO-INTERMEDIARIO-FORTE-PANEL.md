

## Etapa 4 — Leases do worker de eventos — concluída

A tabela `domainEvents` agora possui:

- `workerId` para identificar o processo que fez o claim;
- `claimedAt` para registrar o início do processamento;
- `leaseUntil` para delimitar o tempo de posse;
- índice de recuperação por status/lease.

O worker agora:

- faz claim condicional de eventos `pending` ou de `processing` com lease expirado;
- usa uma identidade estável por processo (`WORKER_ID` ou UUID gerado no startup);
- limpa os campos de lease ao entregar, reagendar ou falhar;
- só finaliza/reprograma um evento se ainda for o worker proprietário;
- recupera apenas eventos abandonados, em vez de resetar todo `processing` no startup.

Migration criada:

```text
drizzle-pg/0013_domain_event_leases.sql
```

Configuração opcional:

```env
WORKER_ID=forte-worker-1
EVENT_WORKER_LEASE_MS=120000
```

A migration deve ser aplicada pelo fluxo normal (`pnpm db:push`) antes de atualizar o worker em um banco existente. Não remover volumes.

Validação: typecheck, testes, build, journal JSON e diff check passaram.
