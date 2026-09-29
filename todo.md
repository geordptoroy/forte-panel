

## Fase A — operações de instância no Console Admin — 2026-09-29

- [x] Criar instância Baileys dentro de sessão `operator`, com `workspaceId` + `supportSessionId`, rollback do gateway em falha de persistência e auditoria.
- [x] Desconectar instância Baileys a partir do Console Admin, validando ownership no workspace, com confirmação na UI e auditoria.
- [x] Preservar pareamento por código administrativo existente e manter provider Baileys-only.
- [x] Validar `pnpm check`, `pnpm build`, `pnpm test`, `npm test --prefix forte-whatsapp` e `git diff --check`.
- [ ] Executar no Docker/staging do usuário: criar instância, parear por código, desconectar, validar inbound/outbound e confirmar PostgreSQL persistente.
- [ ] Próxima fatia: fachada de Inbox de suporte com `workspaceId` + `supportSessionId`; não reutilizar diretamente o contexto do painel público.
