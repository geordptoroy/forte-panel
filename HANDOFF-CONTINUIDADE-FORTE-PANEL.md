

## 20. Correção de direção: Console Admin como workspace de suporte — 2026-09-29

O usuário esclareceu que **“Minha empresa” não deve existir**. O registro reaparece porque `server/db.ts:upsertUser()` chama `ensureDemoWorkspace()` durante autenticação mesmo com `DEMO_MODE=false`; apagar/reinstalar não resolve enquanto essa criação implícita continuar. A correção deve tornar a criação do workspace padrão explicitamente opt-in e preservar a criação normal por signup/demo configurado.

O usuário confirmou a exclusão permanente do workspace local **id 1, slug `forte-workspace`, nome “Minha empresa”**, incluindo instâncias/canais Baileys, contatos, conversas, mensagens, agenda, funil, configurações, auditoria e memberships. A sandbox não tem acesso ao PostgreSQL/Docker local do usuário, portanto a exclusão ainda não foi executada. O próximo chat deve primeiro entregar um procedimento transacional guardado pelo id/slug/nome e pedir a execução no container local, mantendo o login principal do Console Admin; não apagar o usuário de plataforma apenas por remover sua membership.

A decisão de produto também foi corrigida: o Console Admin deve ter na sidebar as áreas **Instâncias, Inbox, Agenda e Funil**, usando as ferramentas do workspace público para fins de suporte. Isso não significa redirecionar para `/whatsapp-connection`, `/inbox`, `/agenda` ou `/kanban` com o contexto do cliente. Cada área precisa de uma fachada administrativa que receba `workspaceId` + `supportSessionId`, respeite `read_only`/`operator`, registre auditoria e mantenha o workspace selecionado visível. O próximo smoke test deve criar uma nova instância pelo Console Admin, pareá-la por código dentro de uma sessão operadora e validar inbound/outbound; não usar a conta “Minha empresa” nem criar instância pelo terminal como fluxo principal.

A implementação provisória de criação administrativa feita nesta tentativa foi desfeita por orientação do usuário; não há código não publicado pendente. O último commit válido continua sendo `ce5f9ab`, com pareamento administrativo da instância existente, mas ainda sem criação administrativa nem as páginas completas de suporte.


## 21. Fase A concluída — operações de instância no Console Admin — 2026-09-29

A fachada administrativa de instâncias Baileys avançou além do commit `ce5f9ab`: o Console Admin agora permite criar uma instância dentro de uma sessão `operator`, com `workspaceId` e `supportSessionId` explícitos, auditoria de sucesso e rollback do registro no gateway quando a persistência falhar. Também permite desconectar uma instância existente após validar ownership no workspace; a UI pede confirmação e a ação é auditada. O logout administrativo permanece separado e não é acionado por engano pelo botão de desconexão.

A alteração está nos endpoints `platform.createBaileysInstance` e `platform.disconnectBaileysInstance`, no domínio `server/platform-admin.ts` e na fachada `SummaryTab` de `client/src/pages/PlatformAdminPage.tsx`. Read-only não cria nem desconecta; a sessão continua vinculada ao administrador, workspace, modo e expiração.

Validação no sandbox: `pnpm check`, `pnpm build`, `pnpm test` com 204 aprovados e 47 ignorados por dependência de banco, `npm test --prefix forte-whatsapp` com 62 aprovados e `git diff --check`. Os testes PostgreSQL do suporte continuam condicionados a `DATABASE_URL` e não foram declarados executados.

Próximo bloco: implementar a fachada de Inbox de suporte, sempre recebendo `workspaceId` + `supportSessionId`, com leitura em `read_only`, envio somente em `operator`, filtro de instâncias, cabeçalho explícito de workspace/sessão e auditoria das ações. Depois publicar a imagem `:dev` e executar o smoke test no Docker/staging do usuário; não usar a conta “Minha empresa” nem criar a instância pelo terminal como fluxo principal.
