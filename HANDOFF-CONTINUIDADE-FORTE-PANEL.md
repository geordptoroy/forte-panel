

## 20. Correção de direção: Console Admin como workspace de suporte — 2026-09-29

O usuário esclareceu que **“Minha empresa” não deve existir**. O registro reaparece porque `server/db.ts:upsertUser()` chama `ensureDemoWorkspace()` durante autenticação mesmo com `DEMO_MODE=false`; apagar/reinstalar não resolve enquanto essa criação implícita continuar. A correção deve tornar a criação do workspace padrão explicitamente opt-in e preservar a criação normal por signup/demo configurado.

O usuário confirmou a exclusão permanente do workspace local **id 1, slug `forte-workspace`, nome “Minha empresa”**, incluindo instâncias/canais Baileys, contatos, conversas, mensagens, agenda, funil, configurações, auditoria e memberships. A sandbox não tem acesso ao PostgreSQL/Docker local do usuário, portanto a exclusão ainda não foi executada. O próximo chat deve primeiro entregar um procedimento transacional guardado pelo id/slug/nome e pedir a execução no container local, mantendo o login principal do Console Admin; não apagar o usuário de plataforma apenas por remover sua membership.

A decisão de produto também foi corrigida: o Console Admin deve ter na sidebar as áreas **Instâncias, Inbox, Agenda e Funil**, usando as ferramentas do workspace público para fins de suporte. Isso não significa redirecionar para `/whatsapp-connection`, `/inbox`, `/agenda` ou `/kanban` com o contexto do cliente. Cada área precisa de uma fachada administrativa que receba `workspaceId` + `supportSessionId`, respeite `read_only`/`operator`, registre auditoria e mantenha o workspace selecionado visível. O próximo smoke test deve criar uma nova instância pelo Console Admin, pareá-la por código dentro de uma sessão operadora e validar inbound/outbound; não usar a conta “Minha empresa” nem criar instância pelo terminal como fluxo principal.

A implementação provisória de criação administrativa feita nesta tentativa foi desfeita por orientação do usuário; não há código não publicado pendente. O último commit válido continua sendo `ce5f9ab`, com pareamento administrativo da instância existente, mas ainda sem criação administrativa nem as páginas completas de suporte.
