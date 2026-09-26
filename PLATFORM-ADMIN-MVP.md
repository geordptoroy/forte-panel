# Console Administrativo da Plataforma — MVP

## Objetivo

O Console Administrativo é uma área interna separada do painel de cada workspace. Ele permite observar e operar contas beta sem transformar o papel `admin` de um workspace em acesso global.

## Fronteira de acesso

- A autorização usa a tabela `platformAdmins` e a permissão explícita `platform_admin`, `platform_support_readonly` ou `platform_support_operator`.
- O console **não consulta `users.role` para conceder acesso de plataforma**.
- O bootstrap controlado pode usar `PLATFORM_ADMIN_OPEN_IDS`, uma lista separada por vírgula de `users.openId`. No admin local padrão, o valor é `local_admin`.
- Cada consulta de workspace exige uma `supportSession` ativa, escopada para um workspace, com motivo e expiração de 5 a 60 minutos.
- Sessões `read_only` são o padrão. Ações mutáveis exigem uma sessão `operator` e uma permissão que possa mutar.
- Uma sessão pode ser revogada manualmente e expira no backend; a UI não é a autoridade de segurança.

## Capacidades do MVP

### Visão geral

- Lista workspaces beta por nome/slug.
- Exibe plano, status (`onboarding`, `active`, `suspended`), owner e contagem de membros.
- Mostra saúde resumida de canal, IA e worker, além de fila outbound e falhas recentes.
- Mostra uso da janela atual por API, IA e outbound, com alerta de contas próximas de 70% da quota.

### Detalhe com suporte escopado

- Lista membros e owner sem campos de senha.
- Exibe canais e instâncias com telefone e credenciais mascarados.
- Mostra notas internas de suporte.
- Permite consultar auditoria do workspace e auditoria específica da plataforma.
- Em sessão operadora, permite pausar/reativar IA e suspender/reativar workspace, sempre com motivo e auditoria.

### Agente

- Permite editar rascunho de `enabled`, modelo lógico, `maxSteps` e system prompt por workspace.
- Valida e rejeita padrões comuns de credenciais, tokens e chaves no prompt.
- Publica versões imutáveis e registra motivo, autor e timestamp.
- Rollback cria uma **nova versão publicada** apontando para a versão de origem; não sobrescreve histórico.
- A simulação é determinística e local: persiste `providerCalled = 0` e não chama PAPI, Meta ou nenhum LLM.
- Chaves de provider ficam apenas no armazenamento já criptografado do workspace e aparecem mascaradas no payload do console.

### Worker

O worker persiste o último heartbeat em `workerHeartbeats`. O console sinaliza `healthy`, `degraded`, `stale` ou `unknown` sem depender somente de logs.

## Persistência

A migration `drizzle-pg/0019_platform_admin_console.sql` adiciona:

- `workspaces.status`;
- `platformAdmins`;
- `supportSessions`;
- `agentPromptDrafts` e `agentPromptVersions`;
- `agentSimulationRuns`;
- `platformAuditLogs` e `platformWorkspaceNotes`;
- `workerHeartbeats`.

O journal Drizzle foi atualizado com a entrada `0019_platform_admin_console`.

## Como habilitar no ambiente local

1. Aplique as migrations do PostgreSQL.
2. Configure `PLATFORM_ADMIN_OPEN_IDS=local_admin` no ambiente local, ou informe somente os `openId` autorizados.
3. Garanta que `JWT_SECRET` esteja configurado, especialmente em produção.
4. Faça login com o usuário autorizado e abra `/platform-admin`.

A ausência de `PLATFORM_ADMIN_OPEN_IDS` não concede acesso por fallback. Um usuário de workspace sem uma linha ativa em `platformAdmins` recebe `FORBIDDEN`.

## Verificação realizada

- `pnpm check` — aprovado.
- `pnpm test -- --run` — 14 arquivos aprovados, 54 testes aprovados e 24 testes de integração dependentes de banco pulados pelo próprio projeto.
- `pnpm build` — aprovado; Vite e bundles do servidor gerados.
- `git diff --check` — aprovado.

O sandbox usado para a implementação não tinha `DATABASE_URL`, portanto a aplicação da migration em um PostgreSQL real deve ocorrer no ambiente de implantação como etapa operacional separada.
