# Inventário de dados WhatsApp antes da convergência Baileys

**Estado:** procedimento read-only preparado em 2026-09-29  
**Objetivo:** medir provider, instância, mensagens pendentes, settings potencialmente legados e colisões de `instanceId` por workspace antes de qualquer limpeza ou migration destrutiva.

## Garantias

O comando `scripts/inventory-whatsapp-legacy.ts` exige `DATABASE_URL` PostgreSQL, abre uma transação `BEGIN READ ONLY`, aplica `statement_timeout` de 30 segundos e encerra com `ROLLBACK`. Ele não atualiza, exclui ou corrige registros.

O relatório não retorna `value` de `workspaceSettings`, conteúdo de mensagens, API keys, webhook secrets ou outros segredos. Retorna somente nomes de chaves e contagens para permitir identificar o escopo da revisão.

A sandbox do agente não possui acesso ao PostgreSQL persistente do ambiente Windows/WSL do usuário. Portanto, este procedimento deve ser executado pelo operador no banco restaurado, nunca apontando para o banco ativo sem confirmar o alvo.

## Pré-condição obrigatória

1. Criar um backup verificável com `scripts/backup-restore.sh backup`.
2. Executar `scripts/backup-restore.sh verify <diretório-do-backup>`.
3. Restaurar o dump em um banco separado, com tráfego do Panel e do gateway parados ou desconectados.
4. Definir `DATABASE_URL` somente para esse banco restaurado. Não imprimir a URL no terminal compartilhado.
5. Confirmar que o usuário do banco tem permissão de leitura e que o nome do banco restaurado não é o banco de produção.

O inventário não substitui backup. Também não inventaria arquivos de sessão Baileys; a sessão deve ser tratada separadamente, sem presumir portabilidade entre providers ou IDs.

## Execução

Resumo seguro:

```bash
DATABASE_URL='postgresql://USUARIO:***@HOST:5432/forte_panel_restore' \
  pnpm db:inventory:whatsapp
```

Relatório completo em JSON, sem conteúdo de mensagem nem secrets:

```bash
mkdir -p ./reports
DATABASE_URL='postgresql://USUARIO:***@HOST:5432/forte_panel_restore' \
  pnpm db:inventory:whatsapp --json > ./reports/whatsapp-inventory-$(date -u +%Y%m%dT%H%M%SZ).json
chmod 600 ./reports/whatsapp-inventory-*.json
```

Para revisar apenas um workspace:

```bash
DATABASE_URL='postgresql://USUARIO:***@HOST:5432/forte_panel_restore' \
  pnpm db:inventory:whatsapp -- --workspace=123 --json
```

O argumento `--` é necessário para o pnpm encaminhar `--workspace=123` ao script.

## Campos que precisam ser revisados

| Bloco | Pergunta de decisão |
|---|---|
| `channelProviders` | Existem canais com provider diferente de Baileys? Eles ainda possuem consumidor ou são apenas histórico? |
| `instanceProviders` e `instances` | Cada instância necessária tem `workspaceId` e `instanceId` explícitos? Há registros inativos ou legados que precisam ser preservados para auditoria? |
| `messageProviders` | Há mensagens antigas com provider removido? Elas são históricas ou ainda estão no caminho operacional? |
| `pendingMessages` | Existem mensagens `queued`/`processing`? Mensagens outbound sem `instanceId` não podem ser enviadas por uma instância arbitrária. |
| `legacySettings` | Quais workspaces ainda possuem chaves de provider/webhook? A revisão seguinte deve limpar apenas chaves comprovadamente obsoletas, após backup e contagem. |
| `duplicateInstanceIds` | O mesmo `instanceId` aparece em mais de um workspace? Resolver a colisão antes de impor unicidade global. |

## Critérios para a próxima migration

A migration de convergência só pode avançar depois de registrar o JSON do inventário e confirmar, no banco restaurado, que:

- os workspaces, conversas, contatos, mensagens, auditoria e anexos que devem ser preservados estão contados;
- cada instância operacional possui workspace e `instanceId` verificáveis;
- não há mensagem pendente sem rota comprovada que possa ser enviada automaticamente;
- colisões de `instanceId` têm um mapa de resolução aprovado;
- settings legados têm contagem, backup e plano de limpeza direcionada;
- a validação de banco vazio e banco restaurado será executada separadamente.

Nenhum registro deve ser apagado neste passo. O inventário é evidência para a decisão seguinte, não uma autorização de limpeza.
