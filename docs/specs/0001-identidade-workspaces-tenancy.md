# 0001 — Identidade, workspaces e tenancy

**Estado:** parcial — o fluxo principal está implementado e testado, mas a selecção explícita de múltiplos workspaces e alguns aspectos de membership ainda não estão fechados.

**Fonte observada:** `drizzle/schema.ts`, `server/db.ts`, `server/workspace.ts`, `server/_core/trpc.ts`, `server/routers.ts` e testes de contexto/isolamento.

## 1. Objectivo

Definir como uma identidade autenticada entra no sistema, como pertence a um workspace e como todas as operações ficam limitadas ao tenant correcto.

Esta spec descreve o comportamento actual e os contratos que as futuras alterações devem preservar.

## 2. Fora de escopo

- Gestão de operadores do Console Admin e sessões de suporte; será detalhada na spec 0002.
- Regras de negócio da Inbox, agenda, pagamentos ou agente; cada domínio terá a sua própria spec.
- Multi-workspace com selecção interactiva por pedido; ainda não é um fluxo operacional suportado.
- SSO externo, organização hierárquica de workspaces ou partilha de dados entre tenants.

## 3. Actores e entidades

### Utilizador (`users`)

Um utilizador possui identidade global e credenciais locais opcionais. Os campos relevantes são:

- `id`, `openId`, `name`, `email`, `phone`;
- `loginMethod`, `passwordHash` e `sessionVersion`;
- `role`: `user` ou `admin`;
- `operationalRole`: `human_attendant`, `ai_attendant` ou `professional`.

`users.role = admin` **não concede por si só acesso a dados de um workspace**. O acesso tenant-scoped depende de uma membership activa. A excepção é o acesso ao Console Admin através de `platformAdmins`, que é uma superfície separada.

### Workspace (`workspaces`)

Um workspace possui:

- `id`, `name` e `slug` único;
- `segment`;
- `plan`: `starter`, `pro` ou `business`;
- `timezone`;
- `status`: `onboarding`, `active` ou `suspended`;
- `active` como guard operacional.

Um workspace só pode ser resolvido para contexto tenant quando `active = 1`.

### Membership (`workspaceMembers`)

A membership liga um `userId` a um `workspaceId`. Existe uma restrição única por `(workspaceId, userId)` e os campos operacionais são:

- `role`: `owner`, `admin`, `manager` ou `agent`;
- `active`;
- `jobTitle`;
- `professionalId` opcional;
- `canRegisterPayments`.

Uma membership inactiva não concede contexto nem acesso protegido.

### Convite (`workspaceInvites`)

Um convite pertence a um workspace e contém o email normalizado, role, perfil operacional, token hash, estado, expiração e actor que o criou. O token em claro só é devolvido no momento de criação; a base guarda apenas SHA-256.

Estados possíveis: `pending`, `sent`, `accepted`, `expired`, `revoked`, `replaced`.

## 4. Resolução do contexto tenant

A função `getWorkspaceMembershipContext(userId)` é a fonte de verdade para procedimentos tenant-scoped:

1. procura memberships activas do utilizador;
2. faz join com workspaces activos e com o utilizador;
3. limita o resultado a dois registos para detectar ambiguidade;
4. devolve contexto apenas quando existe **exactamente uma** membership activa;
5. devolve `null` para zero memberships ou para mais de uma membership activa.

O contexto inclui workspace, plano, timezone, role, membership, perfil profissional, função operacional e permissão de registar pagamentos.

Esta resolução é deliberadamente fail-closed. O servidor não escolhe um tenant através de `users.role`, de um slug vindo do cliente, de um ID arbitrário ou do workspace demo.

### Contexto tRPC

`createContext` autentica o pedido e começa com `workspace = null`. O middleware `protectedProcedure` resolve a membership e rejeita com `FORBIDDEN` quando não existe exactamente um workspace activo. Procedimentos públicos continuam sujeitos ao guard same-origin, mas não exigem identidade.

`authenticatedProcedure` permite uma identidade autenticada sem membership para superfícies como o Console Admin. Não deve ser usado para dados de workspace sem um guard adicional.

## 5. Autenticação e criação de conta

### Signup público

O signup local exige nome, email, password, nome do workspace e aceitação literal dos termos e da política de privacidade. O email é normalizado para minúsculas e a operação é protegida contra concorrência por advisory lock baseado no email.

A transacção cria atomicamente:

1. workspace com plano `starter`, estado `onboarding`, slug normalizado mais sufixo aleatório de oito caracteres hexadecimais;
2. utilizador local com role global `user` e `operationalRole = human_attendant`;
3. membership `owner` activa;
4. canal Baileys inicial;
5. consentimento com versões de termos e privacidade;
6. audit log `public_signup_completed`.

Se o email já existir, a operação falha sem criar um segundo account/workspace.

### Login local

Depois de validar credenciais e rate limits:

- uma conta com acesso `platformAdmins` pode iniciar sessão no Console Admin sem membership de workspace;
- uma conta normal tem de possuir exactamente um workspace activo;
- sem membership ou com membership ambígua, o login é rejeitado com `FORBIDDEN`;
- uma sessão válida inclui `sessionVersion`, permitindo revogar sessões quando necessário.

## 6. Convites e membership

### Criação

A criação de convite:

- normaliza o email;
- rejeita email que já tenha conta;
- aceita apenas roles `admin`, `manager` ou `agent`;
- define TTL de 72 horas;
- substitui convites anteriores `pending`/`sent` para o mesmo email no workspace;
- exige `professionalId` e `jobTitle` quando `operationalRole = professional`;
- valida que o profissional pertence ao mesmo workspace;
- guarda apenas `tokenHash`;
- regista `member_invite_created`.

Existe no máximo um convite pendente/enviado por `(workspaceId, email)`.

### Envio, listagem e revogação

Um convite `pending` pode passar a `sent` apenas uma vez. A listagem actualiza convites vencidos para `expired` antes de os devolver. A revogação só altera convites do workspace correcto que ainda estejam `pending` ou `sent`.

### Aceitação

A aceitação:

1. calcula o hash do token recebido;
2. rejeita token inexistente, utilizado, revogado, substituído ou expirado;
3. marca token expirado antes de devolver erro quando a data já passou;
4. usa lock transaccional no convite;
5. rejeita email que entretanto tenha criado conta;
6. cria o utilizador local e a membership com os atributos do convite;
7. marca o convite como `accepted` com actor e timestamp;
8. regista `member_invite_accepted`.

A operação é transaccional e não deve criar uma conta sem membership correspondente.

## 7. Política de roles actual

| Role | Gerir equipa | Gerir catálogo | Usar Inbox | Enviar mensagens | Ver agenda completa | Agenda limitada |
|---|---:|---:|---:|---:|---:|---:|
| `owner` | Sim | Sim | Sim | Sim | Sim | Não |
| `admin` | Sim | Sim | Sim | Sim | Sim | Não |
| `manager` | Não | Sim | Sim | Sim | Sim | Não |
| `agent` | Não | Não | Sim | Sim | Não | Não por role; aplicar regra operacional |

Regras adicionais actuais:

- todos os membros activos operam a Inbox partilhada enquanto não existir assignment/fila por equipa;
- `canRegisterPayments` é verdadeiro para `owner`, `admin` e `manager`, ou quando o flag explícito da membership está activo;
- `professional` fica restrito à própria agenda (`restrictedToOwnAgenda = true`);
- pelo menos um `owner` activo tem de permanecer no workspace;
- desactivar uma membership incrementa `users.sessionVersion` e limpa atribuições de oportunidades desse membro;
- um `professionalId` só pode apontar para profissional do mesmo workspace.

## 8. Invariantes de tenancy

1. Toda query de domínio que lê ou altera dados tenant-scoped deve filtrar pelo `workspaceId` resolvido no servidor.
2. Um ID de outro workspace deve resultar em vazio, `undefined`, `false` ou erro de domínio — nunca em leitura ou mutação cross-tenant.
3. Joins entre entidades tenant-scoped devem incluir o mesmo `workspaceId`, não apenas o ID da entidade relacionada.
4. Um cliente não pode escolher o workspace efectivo apenas enviando um `workspaceId` no payload.
5. `users.role = admin` não pode ser usado como atalho para atravessar guards de workspace.
6. Erros de acesso não devem revelar dados do workspace estrangeiro.
7. Dados de teste devem usar base descartável; signup, convites e memberships não podem semear a instalação real.
8. Operações de alteração de membership devem produzir auditoria e invalidar sessões quando retiram acesso.

## 9. Exemplos normativos

### Válidos

```text
Utilizador U tem uma membership activa em W1.
→ protectedProcedure resolve W1 e expõe role/plano/permissões de U em W1.
```

```text
Utilizador U aceita convite válido para W1.
→ é criada uma conta local, uma membership em W1 e o convite passa a accepted.
```

```text
Utilizador U consulta um serviço de W1 através do contexto W1.
→ a query devolve apenas serviços com workspaceId = W1.
```

### Inválidos

```text
Utilizador U tem membership apenas em W1 e envia workspaceId = W2.
→ o servidor ignora o valor não autorizado ou rejeita; nunca consulta W2.
```

```text
Utilizador U é admin global, mas não tem membership.
→ protectedProcedure devolve FORBIDDEN; não é criado contexto tenant.
```

```text
Serviço S pertence a W2 e é usado numa mutation com contexto W1.
→ a operação falha ou não altera S; W2 permanece inalterado.
```

```text
Utilizador U tem duas memberships activas.
→ o contexto resolve para null e o acesso protegido falha fechado até existir selecção explícita suportada.
```

## 10. Evidência actual

| Contrato | Evidência |
|---|---|
| Zero ou múltiplas memberships falham fechado | `server/workspace-context.test.ts` |
| Admin global sem membership não entra em procedimentos protegidos | `server/workspace-context.test.ts` |
| Signup cria owner/workspace/membership/consentimento atomicamente | `server/signup-db.test.ts` |
| Email duplicado é rejeitado | `server/signup-db.test.ts` |
| Serviços e profissionais não atravessam workspaces | `server/workspace-domain-isolation.test.ts` |
| Agenda não lista nem altera recursos de outro workspace | `server/agenda-workspace-isolation.test.ts` |
| Chaves de idempotência e eventos mantêm workspace | `server/workspace-key-isolation.test.ts` |
| Storage proxy resolve membership antes de aceder a dados | `server/_core/storageProxy.test.ts` |

## 11. Lacunas e decisões futuras

### L1 — Selecção explícita de workspace

O modelo permite várias memberships, mas o contexto actual rejeita a ambiguidade em vez de permitir ao utilizador escolher workspace. Antes de suportar multi-workspace, é necessário especificar: selecção por sessão, prevenção de troca indevida, persistência segura da escolha e testes de isolamento durante a troca.

### L2 — `operationalRole` está em `users`

A role de membro está em `workspaceMembers`, mas `operationalRole` é actualmente um campo global do utilizador. Isto pode tornar ambíguo o perfil operacional quando a mesma pessoa tiver memberships em vários workspaces. Não corrigir silenciosamente; a futura spec de multi-workspace deve decidir se o campo migra para membership.

### L3 — Integridade relacional

Várias relações usam IDs inteiros e guards de aplicação, sem foreign keys explícitas no schema actual. Uma futura revisão de migrations deve avaliar foreign keys, ordem de deleção e compatibilidade com dados legados sem enfraquecer os guards de aplicação.

### L4 — Desactivação administrativa

A desactivação de membership invalida sessões e limpa atribuições conhecidas, mas a cobertura DB completa depende de PostgreSQL descartável/CI. O gate de integração não deve ser considerado verde apenas com testes unitários.

## 12. Critérios de aceitação

- [ ] Toda procedure tenant-scoped resolve membership no servidor e não aceita tenant arbitrário do cliente.
- [ ] Zero e múltiplas memberships activas falham fechado até existir selecção explícita especificada.
- [ ] Signup e aceitação de convite são atómicos e deixam audit log.
- [ ] Convites guardam apenas hash do token, expiram em 72 horas e não podem ser reutilizados.
- [ ] Todas as mutations de domínio rejeitam IDs de entidades pertencentes a outro workspace.
- [ ] A cobertura PostgreSQL de base vazia e upgrade a partir da `main` passa sem skips DB.
- [ ] A futura implementação de multi-workspace resolve L1 e L2 antes de remover a regra de exactly-one.
