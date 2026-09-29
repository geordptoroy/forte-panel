

## Clarificação de direção — 29/09/2026

- [ ] Corrigir `upsertUser()` para não chamar `ensureDemoWorkspace()` durante login quando `DEMO_MODE=false`; a criação padrão deve ser opt-in.
- [ ] Excluir no PostgreSQL local o workspace confirmado `id=1`, `slug=forte-workspace`, `name=Minha empresa`, com guard transacional e sem excluir o usuário principal do Console Admin.
- [ ] Colocar na sidebar do Console Admin as áreas de suporte: Instâncias, Inbox, Agenda e Funil.
- [ ] Criar fachadas administrativas tenant-scoped para essas áreas; não reutilizar diretamente as rotas públicas com o contexto do cliente.
- [ ] Exigir `workspaceId` + `supportSessionId` em toda leitura/mutação; `read_only` somente leitura e `operator` para ações auditadas.
- [ ] Retomar o smoke test criando uma nova instância Baileys dentro do Console Admin, pareando por código e validando inbound/outbound.
