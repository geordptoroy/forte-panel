

---

## Atualização do handoff — 2026-09-25 21:06

### Commit atual desta atualização

A etapa seguinte ao claim de idempotência HTTP implementou o ledger das tools do agente:

```text
0015_agent_effects.sql
```

A tabela `agentEffects` usa chave única `workspaceId + eventId + toolCallId` e registra fingerprint, status, resultado e lease.

Tools mutáveis protegidas:

- `atualizar_lead`;
- `registrar_nota`;
- `criar_agendamento`;
- `transferir_humano`.

Tools somente leitura não registram efeito:

- `buscar_lead`;
- `consultar_agenda`.

O agente faz claim antes da tool, devolve resultado salvo quando já concluída e não executa novamente enquanto outro lease estiver ativo. O reset de dados de desenvolvimento apaga `agentEffects` do workspace.

### Validação desta etapa

```text
pnpm check: passou
pnpm test: 39 passaram; 13 ignorados por dependências externas
pnpm build: passou
journal JSON: válido
git diff --check: passou
```

### Próximo bloco recomendado

1. Adicionar teste PostgreSQL real para dois workers disputando o mesmo `eventId + toolCallId`.
2. Tratar estado `unknown` para crash depois da mutação e antes do `completeAgentEffect`.
3. Criar fencing token/versão de conversa para impedir resposta de IA depois de handoff humano.
4. Implementar parser autenticado dos comandos de controle humano.

A regra continua: não executar smoke test PAPI Cloud nem pedir token neste momento; o usuário adiou essa operação. Não alterar login proprietário único e não remover volumes Docker.
