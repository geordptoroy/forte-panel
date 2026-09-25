

## Etapa 2 — Canais conectados e webhooks persistentes — concluída

A tela **Canais conectados** agora consulta `workspace.papiInstances` e exibe, por workspace:

- nome e `instanceId`;
- deployment self-hosted ou Cloud;
- status e estado ativo/inativo;
- API key mascarada;
- instância padrão de saída;
- último erro de health quando existir.

A criação de webhook continua sendo compatível com o fluxo local, mas agora também sincroniza a instância persistente. O backfill é idempotente: quando a tela consulta as instâncias, webhooks antigos guardados em `workspaceSettings` são convertidos para `whatsappInstances` sem remover nem alterar os dados originais.

Selecionar o webhook padrão ou a instância padrão mantém os dois estados sincronizados. Remover um webhook marca sua instância como inativa, impedindo que ela seja selecionada para novos envios, mas não apaga o registro histórico.

Para aplicar em um banco local existente, execute apenas o mecanismo normal de migration, sem remover volumes:

```bash
pnpm db:push
```

Se o ambiente usar migrations SQL versionadas em vez de `db:push`, aplique `drizzle-pg/0012_whatsapp_instances.sql` pelo procedimento já usado pela stack. Não execute `docker compose down -v`.

Validação da etapa 2:

- `pnpm check`: passou.
- `pnpm test`: 39 passaram; 13 continuam ignorados por dependerem de banco/configuração externa.
- `pnpm build`: passou.
- `git diff --check`: passou.

A próxima etapa será adicionar provisionamento PAPI Cloud (criar instância, recuperar/rotacionar API key e configurar webhook) atrás de uma configuração explícita. A tela continuará usando self-hosted enquanto `PAPI_DEPLOYMENT=cloud` não for ativado.
