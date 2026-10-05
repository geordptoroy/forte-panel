# 0003 — Auditoria, logs e segurança operacional

**Estado:** parcial — existem trilhos de auditoria de domínio e plataforma, redacção de eventos, request IDs, rate limits, retenção operacional e políticas fail-closed; falta consolidar o contrato entre auditoria, logs e segurança, além de provar sistematicamente todos os endpoints.

**Fonte observada:** `drizzle/schema.ts`, `server/db.ts`, `server/platform-admin.ts`, `server/_core/observability.ts`, `server/_core/request-context.ts`, `server/_core/request-security.ts`, `server/_core/security-mode.ts`, `server/_core/http-security.ts`, `server/distributed-rate-limit.ts` e testes de auditoria/segurança/readiness.

## 1. Objectivo

Definir como o Forte Panel regista, protege, consulta, redige e retém:

- acções de utilizadores e operadores;
- alterações de dados tenant-scoped;
- operações administrativas de plataforma;
- falhas de autenticação, autorização e dependências;
- eventos operacionais enviados para observabilidade;
- sinais necessários para investigação, resposta e release seguro.

A spec também define o plano prático para fechar a lacuna P0 de isolamento e autorização da spec 0001.

## 2. Princípio central

> **Um log explica o que o sistema observou; uma auditoria prova quem alterou o quê, em que workspace, porquê e através de que autorização. Logs podem ser amostrados e expirar; auditoria de segurança não pode ser tratada como simples debug.**

## 3. Não-objectivos

- Não guardar passwords, tokens, API keys, cookies, JWTs ou payloads sensíveis em claro.
- Não usar logs para conceder autorização.
- Não substituir testes de isolamento por observabilidade.
- Não enviar automaticamente dados de produção para um fornecedor externo sem configuração e redacção aprovadas.
- Não transformar a tabela de auditoria num canal de eventos de domínio ou numa fila de processamento.

## 4. Modelo actual

### 4.1 Auditoria de domínio (`auditLogs`)

A tabela de domínio contém actualmente:

- `workspaceId` obrigatório;
- `actorUserId` opcional;
- `contactId` opcional;
- `action` até 100 caracteres;
- `summary` até 500 caracteres;
- `createdAt`.

É usada por signup, convites, agenda, Inbox, agente, quotes, pagamentos, reconciliações e outras mutations. As queries de auditoria de workspace devem sempre filtrar pelo `workspaceId` resolvido no servidor.

O modelo actual é suficiente para histórico funcional, mas é limitado para investigação de segurança: não tem request ID, IP, resultado explícito, before/after, actor de plataforma ou support session.

### 4.2 Auditoria de plataforma (`platformAuditLogs`)

A auditoria de plataforma acrescenta:

- `platformAdminId`;
- `workspaceId` opcional;
- `supportSessionId` opcional;
- `action`, `scope`, `reason` e `summary`;
- `beforeData` e `afterData` redigidos;
- `result`: `success` ou `failure`;
- `requestId`, `ipAddress` e `createdAt`.

`recordPlatformAudit` limita reason/summary a 500 caracteres e usa `jsonSnapshot`/`redactValue` para esconder chaves com `password`, `secret`, `token`, `apiKey`, `jwt` ou `authorization`.

### 4.3 Logs operacionais

`emitOperationalEvent` aceita eventos com:

- `event` até 80 caracteres;
- severidade `info`, `warning` ou `critical`;
- `service` até 80 caracteres;
- no máximo 24 campos simples;
- valores string limitados a 240 caracteres;
- transporte HTTPS em produção;
- Bearer token de transporte fora do payload.

O transporte tem timeout de dois segundos, falha sem bloquear o request principal e limita o ruído de erros a um evento por minuto.

### 4.4 Request context

O servidor gera/normaliza `X-Request-Id`, guarda o valor em `res.locals.requestId` e devolve o header na resposta. IDs inválidos, excessivamente longos ou com newline são substituídos por UUID seguro.

### 4.5 Retenção

A limpeza operacional actual é dry-run por default e limita parâmetros inseguros. Pode remover, em lotes, `webhookEvents` concluídos, `domainEvents` concluídos e buckets antigos de `securityRateLimitBuckets`.

A retenção de usage, onboarding e artefactos tem contratos próprios. `auditLogs` e `platformAuditLogs` não devem ser removidos por esta limpeza genérica sem uma política de retenção de auditoria aprovada.

## 5. Como fechar o P0 de isolamento e autorização no código actual

A correcção deve ser incremental e começar sem mudar a política funcional das roles.

### Fase P0.1 — Fixar o contexto confiável

1. `protectedProcedure` continua a resolver `ctx.workspace` através de membership activa.
2. Cada router tenant-scoped usa `withAccess` ou um guard derivado (`requireManager`, `requireAdministrator`, `requireInbox`, `requireFinancial`).
3. O handler não escolhe o tenant a partir de `input.workspaceId`.
4. Quando um input ainda precisar de `workspaceId` por compatibilidade, o servidor deve comparar com `ctx.workspace.workspaceId` e rejeitar divergência; não aceitar silenciosamente outro tenant.
5. Funções de domínio recebem `workspaceId` apenas do contexto confiável do caller, não do payload bruto.

**Resultado esperado:** a origem do tenant fica visível no código e não há dupla fonte de verdade.

### Fase P0.2 — Criar helpers de escopo

Adicionar helpers pequenos e reutilizáveis, sem duplicar regras:

```ts
assertWorkspaceId(ctx.workspace.workspaceId, input.workspaceId)
getResourceInWorkspace(workspaceId, resourceId)
assertResourceInWorkspace(workspaceId, resourceId, message)
```

Cada helper deve:

- receber o workspace confiável primeiro;
- filtrar o recurso por `(id, workspaceId)`;
- devolver `undefined`/`NOT_FOUND` ou erro de domínio sem revelar outro tenant;
- nunca fazer fallback para lookup apenas por ID.

Para joins, todas as entidades tenant-scoped devem incluir o mesmo filtro `workspaceId`.

### Fase P0.3 — Separar autorização de mutation

Para cada procedure:

```text
actor autenticado
→ workspace/membership resolvida
→ capacidade exigida
→ recurso pertence ao workspace
→ mutation transaccional
→ audit log
```

Não colocar apenas uma verificação visual no frontend. Não usar `users.role` como atalho. Não confiar em `workspaceId` ou `supportSessionId` fornecidos pelo cliente sem cruzamento com o contexto autenticado.

### Fase P0.4 — Fechar a camada de plataforma

Para mutations de cliente iniciadas pelo Console Admin:

```text
authenticatedProcedure
→ requirePlatform
→ validar permission
→ requireSession(platformAdminId, workspaceId, sessionId)
→ requireOperator
→ validar recurso dentro do workspace
→ mutation
→ platformAuditLog com supportSessionId
```

`read_only`, sessão expirada, revogada, pertencente a outro operador ou ligada a outro workspace devem falhar antes do write.

As funções internas críticas também devem validar os invariantes mínimos, para que um novo caller não consiga contornar o router por acidente.

### Fase P0.5 — Fazer o inventário endpoint a endpoint

Criar uma tabela de cobertura com:

| Endpoint | Actor | Workspace source | Capability | Support session | Audit | Negative test |
|---|---|---|---|---|---|---|
| procedure X | member/platform | ctx | capability | required/none | action | test path |

A matriz deve incluir procedures legadas e rotas administrativas. Um endpoint não pode ser marcado coberto apenas porque o router pai tem um nome plausível.

### Fase P0.6 — Provar com testes negativos

Para cada domínio, testar pelo menos:

1. utilizador não autenticado;
2. membership inactiva;
3. role insuficiente;
4. ID de recurso de outro workspace;
5. `workspaceId` adulterado no payload;
6. mutation que falha não cria auditoria de sucesso;
7. outra workspace permanece inalterada;
8. plataforma sem `platformAdmins` activo;
9. sessão read-only em mutation;
10. sessão de outro operador/workspace;
11. sessão expirada ou revogada;
12. auditoria contém actor, workspace e correlação correctos.

## 6. Contrato de auditoria

### 6.1 Evento mínimo de domínio

Toda mutation relevante deve produzir, na mesma transacção quando possível:

```text
workspaceId
actorUserId
action estável
summary segura e limitada
createdAt
```

A auditoria de sucesso só pode ser gravada depois de a mutation principal estar confirmada na mesma transacção. Falhas devem ser registadas como evento de segurança/operacional quando necessário, mas não fingir uma mutation bem-sucedida.

### 6.2 Evento administrativo de plataforma

Toda mutation sobre workspace de cliente deve conter:

```text
platformAdminId
workspaceId
supportSessionId
action
scope
reason
summary
result
requestId
ipAddress, quando confiável
```

`supportSessionId` só pode ser nulo para operações do workspace interno de suporte explicitamente classificadas como próprias.

### 6.3 Nomes e qualidade dos eventos

`action` deve ser estável, minúscula e orientada a domínio, por exemplo:

- `workspace_plan_changed`;
- `support_session_started`;
- `member_invite_accepted`;
- `api_idempotency_reconciled`;
- `baileys_instance_disconnected`.

Não incluir tokens, URLs privadas, mensagens completas de clientes, prompts integrais ou secrets no `summary`.

### 6.4 Resultado de autorização

Tentativas negadas com relevância de segurança devem gerar evento operacional/auditoria de falha sem revelar dados ao cliente. No mínimo, preservar:

- actor conhecido ou anónimo;
- request ID;
- tipo de tentativa;
- workspace pretendido apenas se já for confiável;
- motivo categórico (`unauthenticated`, `wrong_workspace`, `readonly_session`, `expired_session`, `insufficient_capability`).

## 7. Logs e redacção

### 7.1 Regras obrigatórias

- logs estruturados, não concatenação de payloads arbitrários;
- request ID em erros HTTP, gateway e workers;
- limites de tamanho para nomes, mensagens e metadata;
- redacção por nome de chave e por padrão de valor;
- nenhum cookie, `Authorization`, password, API key, JWT, token de convite ou secret de provider;
- stack trace apenas em destino operacional protegido, nunca na resposta pública;
- mensagens públicas genéricas para falhas de autenticação/autorização.

### 7.2 Diferença entre auditoria e observabilidade

| Canal | Finalidade | Retenção | Pode conter payload? |
|---|---|---|---|
| `auditLogs` | histórico funcional tenant-scoped | política própria | apenas resumo seguro |
| `platformAuditLogs` | prova administrativa e suporte | política de compliance | snapshots redigidos |
| `emitOperationalEvent` | health, erros e métricas | operacional | campos simples redigidos |
| `console.error` | fallback local de emergência | depende do runtime | apenas erro sanitizado |

### 7.3 Prompt e dados de IA

Prompts não podem conter credenciais. O validador actual rejeita padrões como `sk-...`, `Bearer ...`, `api_key=...`, `WEBHOOK_SECRET=...` e limita o tamanho do prompt. Este guard deve permanecer activo antes de persistir, publicar ou simular prompts.

## 8. Segurança de pedidos

### Same-origin

Mutations browser-side aceitam requests same-origin. Requests explicitamente `cross-site` ou com `Origin: null` são rejeitadas. Requests sem `Origin` permanecem compatíveis com CLI, webhook e jobs internos, que precisam de autenticação própria.

### Rate limits

Login usa buckets por IP e email, com escalões de bloqueio. Signup e password reset têm limites independentes. Quando configurado, o sistema usa buckets distribuídos em PostgreSQL/Redis; em produção, indisponibilidade do backend de segurança deve falhar fechado.

### Fail-closed

`securityFailClosed()` é verdadeiro em `NODE_ENV=production` ou quando `FORTE_SECURITY_FAIL_CLOSED=true`. Sem base de dados ou backend de segurança disponível, autenticação e limites críticos não podem transformar a indisponibilidade numa autorização implícita.

### Headers e readiness

Headers HTTP de segurança, readiness separada de liveness e validação de configuração de produção são gates operacionais. Um endpoint de readiness não deve responder `ready` sem dependências obrigatórias, especialmente PostgreSQL.

## 9. Retenção e acesso

1. `auditLogs` e `platformAuditLogs` têm políticas de retenção explícitas, separadas de buckets de rate limit e eventos transitórios.
2. Limpezas são dry-run por default e limitadas por lote.
3. Uma limpeza nunca remove auditoria de outro workspace por erro de filtro.
4. Auditoria deve ser consultável apenas por actor autorizado e com filtro de workspace.
5. O Console Admin pode ter visão global, mas a visão de cliente deve manter `workspaceId`/sessão de suporte.
6. Backups e restore devem preservar a capacidade de investigar mutations e sessions, ou declarar a janela de perda.

## 10. Incidentes e resposta operacional

`platformIncidents` representa incidentes por workspace com severidade, estado, actor de abertura/resolução e timestamps. Abrir/resolver incidente exige sessão operator, motivo e auditoria.

`platformSupportTickets` representam trabalho de suporte e devem conter `supportSessionId`. Fechar ticket exige resolução e sessão operator.

Um incidente não é prova de causa raiz. O processo deve ligar:

```text
requestId
→ logs operacionais
→ platformAuditLog/auditLog
→ supportSession
→ incident/ticket
→ resolução e evidência
```

## 11. Evidência actual

| Contrato | Evidência |
|---|---|
| Auditoria tenant-scoped de domínio | `server/inbox.contract.test.ts`, `server/agent-runtime.integration.test.ts`, `server/api-idempotency-reconciliation.integration.test.ts` |
| Auditoria de plataforma com escopo e sessão | `server/platform-admin-actions.test.ts`, `server/platform-tenant-mutations.integration.test.ts` |
| Redacção e limites de eventos | `server/_core/observability.test.ts`, `server/platform-admin.test.ts` |
| Request ID seguro | `server/_core/request-context.test.ts` |
| Same-origin e pedidos cross-site | `server/_core/request-security.test.ts` |
| Fail-closed | `server/_core/security-mode.test.ts`, `scripts/validate-production-config.test.ts` |
| Rate limits distribuídos e locais | testes de auth/request-security e `server/distributed-rate-limit.ts` |
| Retenção dry-run e limites | `server/operational-retention.test.ts`, `server/workspace-usage-retention.test.ts` |
| Readiness e release fail-closed | `server/api.contract.test.ts`, `server/controlled-release.contract.test.ts` |
| Isolamento negativo por workspace | `server/workspace-domain-isolation.test.ts`, `server/agenda-workspace-isolation.test.ts`, `server/o6-tenancy-roles-negative.test.ts` |

## 12. Lacunas prioritárias

### O1 — Auditoria tenant e plataforma não partilham um contrato comum

Os dois modelos têm campos e capacidades diferentes. Definir uma taxonomia de `action`, resultado, request correlation e política de retenção sem apagar o schema legado.

### O2 — Cobertura de auditoria de falhas de autorização

Muitas falhas devolvem `FORBIDDEN`, mas não existe ainda uma política uniforme para decidir quando gerar evento de segurança, evitando simultaneamente ruído e cegueira operacional.

### O3 — Logs locais ainda não estão totalmente estruturados

Existem chamadas directas a `console.error`, `console.warn` e `console.log` em vários módulos. Migrar gradualmente os caminhos de segurança, auth, gateway e workers para eventos estruturados e redigidos.

### O4 — Retenção de auditoria por decidir

A retenção operacional limpa eventos transitórios e buckets, mas não define claramente retenção, legal hold, exportação ou purge de `auditLogs` e `platformAuditLogs`.

### O5 — Integridade relacional de actor e escopo

As tabelas administrativas dependem sobretudo de filtros de aplicação. Avaliar foreign keys/checks e tornar impossível persistir uma combinação incoerente de actor, workspace e sessão.

### O6 — Corrida de autorização e write

O contrato precisa de testes e, se necessário, transacções/locks que garantam que a sessão continua válida no ponto de mutation, não apenas no primeiro lookup.

### O7 — SLOs e alertas de segurança

Ainda não há thresholds documentados para falhas de login, `FORBIDDEN` anormais, indisponibilidade do observability transport, backlog de domain events ou falhas de readiness.

## 13. Critérios de aceitação

- [ ] Existe matriz endpoint → actor → workspace → capacidade → sessão → auditoria.
- [ ] Todos os endpoints tenant-scoped obtêm o workspace de contexto confiável.
- [ ] Inputs `workspaceId`/`supportSessionId` adulterados são rejeitados antes da mutation.
- [ ] Helpers de lookup nunca procuram recurso tenant-scoped apenas por ID.
- [ ] Mutations de plataforma em clientes exigem sessão operator exacta e `supportSessionId` na auditoria.
- [ ] Existe cobertura negativa de outro workspace, role insuficiente, sessão read-only, sessão expirada e sessão de outro operador.
- [ ] Auditoria de sucesso é transaccional com a mutation quando possível.
- [ ] Logs e snapshots redigem secrets, tokens e payloads sensíveis.
- [ ] `requestId` acompanha erros e auditoria administrativa quando disponível.
- [ ] Retenção operacional não remove auditoria sem política explícita.
- [ ] Falha de PostgreSQL/Redis/backend de segurança não concede acesso em produção.
- [ ] Readiness, release e restore reportam limitações sem declarar segurança não provada.
