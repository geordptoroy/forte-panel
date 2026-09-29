

## 21. Fase A concluída — operações de instância no Console Admin — 2026-09-29

A fachada administrativa de instâncias Baileys avançou além do commit `ce5f9ab`: o Console Admin agora permite criar uma instância dentro de uma sessão `operator`, com `workspaceId` e `supportSessionId` explícitos, auditoria de sucesso e rollback do registro no gateway quando a persistência falhar. Também permite desconectar uma instância existente após validar ownership no workspace; a UI pede confirmação e a ação é auditada. O logout administrativo permanece separado e não é acionado por engano pelo botão de desconexão.

A alteração está nos endpoints `platform.createBaileysInstance` e `platform.disconnectBaileysInstance`, no domínio `server/platform-admin.ts` e na fachada `SummaryTab` de `client/src/pages/PlatformAdminPage.tsx`. Read-only não cria nem desconecta; a sessão continua vinculada ao administrador, workspace, modo e expiração.

Validação no sandbox: `pnpm check`, `pnpm build`, `pnpm test` com 204 aprovados e 47 ignorados por dependência de banco, `npm test --prefix forte-whatsapp` com 62 aprovados e `git diff --check`. Os testes PostgreSQL do suporte continuam condicionados a `DATABASE_URL` e não foram declarados executados.

Próximo bloco: implementar a fachada de Inbox de suporte, sempre recebendo `workspaceId` + `supportSessionId`, com leitura em `read_only`, envio somente em `operator`, filtro de instâncias, cabeçalho explícito de workspace/sessão e auditoria das ações. Depois publicar a imagem `:dev` e executar o smoke test no Docker/staging do usuário; não usar a conta “Minha empresa” nem criar a instância pelo terminal como fluxo principal.
