

## Etapa 6 — Ledger idempotente das tools do agente — concluída

Foi criada a tabela `agentEffects` com chave única por:

```text
workspaceId + eventId + toolCallId
```

A tabela guarda:

- nome da tool;
- fingerprint dos argumentos;
- status (`processing`, `completed`, `failed`);
- resultado estruturado;
- lease expirável;
- timestamps.

As tools mutáveis agora fazem claim atômico antes de executar:

- `atualizar_lead`;
- `registrar_nota`;
- `criar_agendamento`;
- `transferir_humano`.

Consultas (`buscar_lead` e `consultar_agenda`) não criam efeitos e continuam sem ledger.

Se uma tool já foi concluída, o resultado salvo é reproduzido. Se outra execução ainda possui o lease, o evento não executa o efeito novamente. O reset de dados de desenvolvimento também limpa o ledger.

Migration:

```text
drizzle-pg/0015_agent_effects.sql
```

Validação: `pnpm check`, `pnpm test` (39 aprovados; 13 ignorados), `pnpm build`, journal JSON e diff check passaram.

Limitação deliberada para a próxima etapa: o teste de crash/concorrência com PostgreSQL real ainda precisa ser adicionado. Também será necessário evoluir o tratamento de `unknown` quando houver queda depois de uma mutação externa e antes de persistir o resultado.
