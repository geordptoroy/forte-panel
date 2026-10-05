# 0002 — Autenticação, autorização e sessões de suporte

**Estado:** parcial — os guards principais, a sessão assinada, as permissões de plataforma e o ciclo de vida de suporte estão implementados; ainda faltam fechar alguns limites de defesa em profundidade e a matriz completa de cobertura por procedure.

**Fonte observada:** `server/_core/sdk.ts`, `server/_core/context.ts`, `server/_core/trpc.ts`, `server/db.ts`, `server/routers.ts`, `server/platform-admin.ts`, `server/platform-router.ts`, `drizzle/schema.ts` e testes de autenticação/plataforma.

## 1. Objectivo

Definir como o Forte Panel:

- autentica uma identidade;
- transforma essa identidade num contexto de workspace;
- autoriza operações por membership e capacidade;
- separa utilizadores de workspace de operadores da plataforma;
- cria, valida, expira e revoga sessões de suporte;
- audita alterações administrativas e operações assistidas.

A regra central é:

> **Autenticação prova quem faz o pedido; autorização prova o que essa identidade pode fazer e em que workspace; uma sessão de suporte adicional prova quando um operador da plataforma está autorizado a actuar sobre um workspace de cliente.**

## 2. Não-objectivos

- Não transformar `users.role = admin` numa permissão universal de tenant ou plataforma.
- Não permitir que o cliente escolha livremente `workspaceId`, `platformAdminId` ou `supportSessionId`.
- Não criar provider WhatsApp alternativo; suporte WhatsApp continua a usar Baileys.
- Não usar uma sessão de suporte para substituir auditoria, consentimento operacional ou motivo da acção.
- Não especificar neste documento SSO, MFA ou gestão de chaves de um IdP externo.

## 3. Actores e níveis de confiança

### 3.1 Visitante

Não possui identidade validada. Pode usar procedures públicas protegidas por same-origin, como login, signup, aceitar convite, recuperação de password e logout.

### 3.2 Utilizador autenticado

É resolvido por uma sessão assinada e sincronizado com `users`. Pode ser:

- membro de um workspace, com acesso tenant-scoped;
- operador de plataforma, através de `platformAdmins`;
- ambos, embora o acesso de plataforma e o acesso de workspace devam continuar a usar guards separados.

### 3.3 Membro de workspace

Tem uma `workspaceMembers` activa e é autorizado através de `resolveWorkspaceAccess`/`withAccess`. A role global do utilizador não substitui a membership.

### 3.4 Operador de plataforma

Tem uma linha activa em `platformAdmins` com uma das permissões:

- `platform_admin`;
- `platform_support_readonly`;
- `platform_support_operator`.

Operadores de plataforma são uma superfície administrativa separada e não devem ser inferidos a partir de `users.role`.

### 3.5 Sessão de suporte

É uma autorização temporal, explícita e limitada a um `platformAdminId`, `workspaceId`, modo e motivo. Não é uma sessão de login e não substitui a autenticação.

## 4. Autenticação de pedido

### 4.1 Entrada da sessão

`authenticateRequest` procura, pela ordem:

1. cookie de sessão;
2. header `Authorization: Bearer <token>` como fallback para ambientes onde cookies de iframe são bloqueados.

O token é verificado pelo SDK. Sessões cron são tratadas separadamente e exigem `task_uid` válido.

### 4.2 Resolução da identidade

Para uma sessão normal:

1. o `openId` da sessão identifica o utilizador;
2. se necessário, o utilizador é sincronizado a partir do OAuth configurado;
3. a conta é carregada de `users`;
4. `session.sessionVersion` tem de coincidir com `users.sessionVersion`;
5. divergência implica `ForbiddenError("Session revoked")`;
6. `lastSignedIn` é actualizado.

Uma falha do backend de segurança não deve degradar silenciosamente para acesso permitido quando o modo fail-closed está activo.

### 4.3 Sessão local

O login local:

- normaliza o email;
- aplica rate limits distribuídos ou locais;
- escolhe a conta cujo hash de password corresponde;
- distingue contas locais de contas configuradas como administradores de plataforma;
- cria cookie de sessão com `sessionVersion`;
- exige exactamente um workspace activo para contas normais;
- permite entrada sem workspace apenas para uma conta com acesso de plataforma válido.

O logout é público e idempotente: revoga as sessões do utilizador quando este está autenticado, limpa o cookie e devolve sucesso.

## 5. Camadas de middleware

### `publicProcedure`

Não exige identidade, mas usa o middleware de segurança same-origin.

### `protectedProcedure`

Exige:

1. `ctx.user` autenticado;
2. contexto de exactamente um workspace activo;
3. membership activa nesse workspace.

A ausência ou ambiguidade do workspace resulta em `FORBIDDEN`.

### `authenticatedProcedure`

Exige apenas identidade autenticada. É a base para o Console Admin, porque operadores de plataforma não precisam de ser membros do workspace do cliente.

Não deve ser usado directamente para uma leitura ou mutation de dados de cliente sem um guard de plataforma e/ou sessão de suporte.

### `adminProcedure` legado

Verifica `users.role = admin`. Este guard não é suficiente para dados tenant-scoped nem para o Console Admin moderno. Cada novo endpoint deve preferir `protectedProcedure` com `withAccess` ou `authenticatedProcedure` com `requirePlatform`.

## 6. Autorização de workspace

`withAccess(requirement, message)` resolve `WorkspaceAccess` a partir de `ctx.user` e `ctx.workspace`, verifica `memberActive` e aplica uma capacidade.

Capacidades actuais relevantes:

- `canManageTeam`: owner/admin;
- `canManageCatalog`: owner/admin/manager;
- `canUseInbox`: membros com perfil permitido;
- `canSendMessages`: membros com perfil permitido;
- `canManageInbox`: capacidade de gerir o fluxo da Inbox;
- `canRegisterPayments`: role permitida ou flag da membership;
- agenda completa ou agenda limitada conforme role/perfil operacional.

Um endpoint deve declarar o guard correspondente em vez de repetir verificações de role no handler.

### Regras de falha

- utilizador não autenticado: `UNAUTHORIZED`;
- utilizador autenticado sem workspace válido: `FORBIDDEN`;
- membership inactiva: `FORBIDDEN`;
- capacidade insuficiente: `FORBIDDEN`;
- recurso de outro workspace: vazio, `NOT_FOUND`, `false` ou erro de domínio sem revelar o recurso.

## 7. Autorização de plataforma

### 7.1 `requirePlatform`

Parte de `authenticatedProcedure`, carrega `getPlatformAdminAccess(ctx.user.id)` e rejeita quem não tenha uma linha activa em `platformAdmins`.

O acesso pode ser bootstrapado por `PLATFORM_ADMIN_OPEN_IDS` ou pelas contas locais configuradas explicitamente. O campo legado `users.role` nunca é consultado para conceder este acesso.

### 7.2 `requirePlatformOperator`

Além de `requirePlatform`, exige uma permissão que possa mutar e não permite modo `read_only`:

| Permissão | Consultar plataforma | Iniciar read-only | Iniciar operator | Mutar |
|---|---:|---:|---:|---:|
| `platform_support_readonly` | Sim | Sim | Não | Não |
| `platform_support_operator` | Sim | Sim | Sim | Sim, com sessão válida |
| `platform_admin` | Sim | Sim | Sim | Sim, com sessão válida |

`canPlatformAdminMutate(permission, mode)` é a regra única para a combinação de permissão e modo.

### 7.3 Superfícies permitidas sem sessão de cliente

O Console Admin pode consultar overview, health, auditoria global e catálogos administrativos através de `requirePlatform`. Isto não concede automaticamente acesso mutável ao workspace de um cliente.

Operações que alteram dados de cliente devem exigir `requireSession(..., requireOperator = true)`, excepto operações explicitamente limitadas ao workspace interno de suporte e documentadas como tal.

## 8. Sessões de suporte

### 8.1 Modelo

A tabela `supportSessions` contém:

- `platformAdminId`;
- `workspaceId`;
- `mode`: `read_only` ou `operator`;
- `status`: `active`, `expired` ou `revoked`;
- `scope`, actualmente `workspace`;
- `reason` obrigatório;
- `startedAt`, `expiresAt`, `revokedAt` e `revokedByUserId`.

A sessão deve ser avaliada sempre com a tupla completa `(sessionId, platformAdminId, workspaceId)`.

### 8.2 Início

`startSupportSession` recebe workspace, modo, motivo e duração:

- motivo entre 3 e 500 caracteres;
- duração efectiva entre 5 e 60 minutos;
- default de 30 minutos;
- sessão começa `active`;
- criação produz audit log `support_session_started`.

Um `platform_support_readonly` só pode iniciar `read_only`. Operador ou admin podem iniciar ambos os modos.

### 8.3 Validação

`getActiveSupportSession` só devolve a sessão quando:

1. o ID da sessão existe;
2. pertence ao `platformAdminId` autenticado;
3. pertence ao `workspaceId` solicitado;
4. está `active`;
5. ainda não expirou;
6. quando solicitado, tem `mode = operator`.

Uma sessão vencida é marcada `expired` antes de retornar `null`. Uma sessão read-only nunca satisfaz `requireOperator`.

### 8.4 Revogação

A revogação exige que a sessão pertença ao operador autenticado, marca `revoked`, guarda timestamp e actor, e regista `support_session_revoked`. A validação seguinte deve falhar imediatamente.

### 8.5 Regras por modo

**Read-only** pode inspeccionar dados autorizados e produzir auditoria de leituras sensíveis quando a procedure o exigir. Não pode criar, alterar, apagar, conectar, desconectar, publicar, enviar mensagens ou mudar configurações.

**Operator** pode executar mutations de suporte apenas para o workspace da sessão, com motivo e auditoria. A sessão não autoriza outro workspace nem outro operador.

## 9. Auditoria e dados sensíveis

`platformAuditLogs` deve registar, quando aplicável:

- `platformAdminId`;
- `workspaceId`;
- `supportSessionId`;
- `action`, `scope`, `reason`, `summary`;
- resultado;
- snapshots before/after redigidos;
- request ID, IP e timestamp.

Snapshots devem redigir chaves que contenham `password`, `secret`, `token`, `apiKey`, `jwt` ou `authorization`. Não guardar passwords, tokens de sessão, tokens de convite ou secrets de providers em auditoria.

Toda mutation administrativa de cliente deve ser correlacionável com a sessão de suporte que a autorizou, excepto operações do workspace interno de suporte explicitamente marcadas como próprias.

## 10. Invariantes normativas

1. Autenticação e autorização são fases separadas.
2. `users.role` não é uma autorização de tenant nem um atalho para plataforma.
3. Todo endpoint de cliente resolve membership e capacidade no servidor.
4. Todo endpoint de plataforma resolve `platformAdmins` pelo `ctx.user.id`.
5. Todo endpoint de mutation de cliente verifica a sessão exacta do mesmo operador e workspace.
6. `read_only` nunca pode alcançar um handler mutável por alteração apenas do payload.
7. Sessões expiradas ou revogadas falham fechado e não são reutilizáveis.
8. Um `supportSessionId` de outro operador ou workspace é inválido mesmo que o ID exista.
9. Incrementar `users.sessionVersion` invalida imediatamente sessões assinadas anteriores.
10. Logout, password change, password reset e desactivação de membership devem invalidar sessões conforme o fluxo aplicável.
11. Razões de suporte são obrigatórias para acções mutáveis e ficam na auditoria.
12. Auditoria não pode conter credenciais ou tokens em claro.
13. Falhas de autorização não devem revelar se o recurso existe noutro workspace.
14. Não emparelhar, desligar, limpar sessão WhatsApp, enviar mensagens ou testar integração real sem autorização operacional específica e número de teste dedicado.

## 11. Exemplos normativos

### Permitidos

```text
Conta autenticada + uma membership activa + canManageCatalog.
→ pode executar mutations de catálogo apenas no workspace resolvido.
```

```text
Operador platform_support_operator + sessão operator activa para W1.
→ pode executar a mutation autorizada em W1, com reason e audit log.
```

```text
Operador platform_support_readonly + sessão read_only para W1.
→ pode consultar o detalhe permitido de W1, mas uma mutation é FORBIDDEN.
```

### Negados

```text
Utilizador global admin sem linha activa em platformAdmins.
→ não entra no Console Admin.
```

```text
Sessão operator de W1 usada com workspaceId W2.
→ getActiveSupportSession devolve null e a mutation é FORBIDDEN.
```

```text
Sessão de operador A usada pelo operador B.
→ a sessão não é aceite, mesmo que esteja activa.
```

```text
Sessão expirada enviada a uma mutation.
→ passa a expired e a mutation não executa.
```

```text
Cliente envia mode=operator numa sessão read_only.
→ o servidor ignora a pretensão do payload e rejeita.
```

## 12. Evidência actual

| Contrato | Evidência |
|---|---|
| Cookie/Bearer, assinatura e `sessionVersion` | `server/_core/sdk.session.test.ts`, `server/_core/sdk.ts` |
| Logout limpa cookie e usa opções seguras | `server/auth.logout.test.ts` |
| Conta normal exige workspace e admin global sem membership falha | `server/workspace-context.test.ts` |
| Role global não concede Console Admin | `server/platform-authorization.test.ts` |
| Permissões readonly/operator são separadas | `server/platform-admin.test.ts`, `server/o6-tenancy-roles-negative.test.ts` |
| Sessão exige operador, workspace e ID exactos | `server/platform-support-session.test.ts`, `server/o6-tenancy-roles-negative.test.ts` |
| Expiração e revogação são imediatas | `server/platform-support-session.test.ts`, `server/platform-admin-actions.test.ts` |
| Mutations de tenant exigem sessão operator e geram auditoria | `server/platform-tenant-mutations.integration.test.ts` |
| Desactivação por perfil restringe procedures de workspace | `server/professional-isolation.test.ts` |

## 13. Lacunas prioritárias

### A1 — Defesa em profundidade no service layer

A maior parte dos limites é aplicada pelos routers. Funções internas como criação/validação de sessão devem continuar a validar actor, permissão e escopo quando forem chamadas fora do router, para evitar que um novo caller interno contorne `requirePlatform`.

### A2 — Matriz completa endpoint → capacidade → auditoria

Existe uma boa camada `withAccess`, mas a cobertura precisa de uma matriz verificável para todas as procedures, incluindo endpoints legados que usam `adminProcedure` ou `requirePlatformAdministrator`. Nenhum endpoint novo deve introduzir uma verificação de role isolada.

### A3 — Auditoria uniforme de leituras sensíveis

Mutations relevantes têm auditoria e `supportSessionId`, mas deve ser decidido quais leituras de suporte exigem evento de auditoria, retenção e acesso restrito. A spec actual não deve presumir que toda query é auditada.

### A4 — Revogação e concorrência de sessões

A revogação é imediata por estado, mas é necessário cobrir concorrência entre validação e revogação, expiração lazy e eventual job de limpeza. O comportamento seguro deve ser negar a mutation se a validação não observar uma sessão active no instante da autorização.

### A5 — MFA, reautenticação e confirmação de acções de alto impacto

Não há neste contrato uma camada explícita de MFA ou step-up authentication para operações como reset destrutivo, desconexão de WhatsApp ou publicação global. Deve ser especificada antes de declarar readiness pública.

### A6 — Foreign keys e identidade do actor

As tabelas usam IDs e guards de aplicação. Avaliar constraints relacionais e garantir que `platformAdminId`, `workspaceId` e `supportSessionId` não podem ser combinados de forma incoerente por escrita directa.

## 14. Critérios de aceitação

- [ ] Cada procedure protegida aparece numa matriz de capacidade e workspace.
- [ ] Nenhuma procedure tenant-scoped depende apenas de `users.role`.
- [ ] Nenhuma mutation de cliente aceita sessão read-only, expirada, revogada, de outro operador ou de outro workspace.
- [ ] Logout, password change, password reset e desactivação de membership invalidam sessões conforme documentado.
- [ ] Toda mutation administrativa relevante grava actor, motivo, workspace e sessão de suporte quando aplicável.
- [ ] Auditoria redige todos os segredos e tokens conhecidos.
- [ ] Testes negativos cobrem bypass por payload, ID de sessão trocado e corrida de revogação/expiração.
- [ ] Testes PostgreSQL usam base descartável/CI e não ignoram os cenários DB obrigatórios.
- [ ] MFA/step-up fica especificado antes de beta pública ou de acções destrutivas irreversíveis.
