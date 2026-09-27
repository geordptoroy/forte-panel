# Forte Panel — Guia de convites, funcionários e permissões

**Data:** 2026-09-27  
**Status:** decisão de produto; fundação backend de convites implementada na migration `0024` e nas procedures de criação/listagem/revogação/aceite. Tela de gestão, link público completo e envio de e-mail ainda pendentes.

## 1. Decisão principal

Funcionário não cria uma conta solta nem recebe uma senha compartilhada. O **owner/admin da empresa envia um convite individual** para o e-mail da pessoa:

```text
owner/admin cria convite
→ e-mail/link único com expiração
→ funcionário aceita e confirma que o e-mail é o convidado
→ cria a própria senha
→ membership é ativada com papel e perfil operacional pré-definidos
→ primeiro acesso mostra apenas o que aquele papel pode operar
```

O convite pertence a um workspace específico, tem token aleatório de uso único, expira, pode ser cancelado e registra quem enviou, quando foi aceito e qual papel foi concedido. O token nunca é armazenado em claro: armazenar somente hash, expiração e estado.

A confirmação geral de e-mail do produto é uma fase posterior. O convite já precisa validar o e-mail convidado por token de uso único; ativar confirmação adicional de e-mail fica atrás de feature flag quando o provedor de envio estiver configurado.

## 2. Papéis e perfis não são a mesma coisa

### Papel de autorização

- **Owner/master:** propriedade do workspace, faturamento/configurações sensíveis, equipe, canais, prompt publicado e suporte.
- **Admin:** administração delegada, equipe e configuração conforme política; não transfere ownership por padrão.
- **Manager:** supervisão operacional, equipe limitada, indicadores operacionais e distribuição de atendimento; sem segredos, faturamento completo ou controle de plataforma.
- **Agent/atendente:** execução do atendimento e CRM necessários para responder leads/clientes; sem faturamento global, secrets, exportações amplas ou gestão de equipe.
- **Professional:** agenda e atendimentos próprios; pode acumular permissões de agent se explicitamente concedido, mas não ganha acesso administrativo automaticamente.

### Perfil operacional

`human_attendant`, `ai_attendant` e `professional` descrevem a operação, não substituem autorização. Uma pessoa pode ser `manager` com perfil `human_attendant` ou `agent` com perfil `professional`; o backend deve avaliar ambos.

## 3. Matriz inicial de visibilidade

| Área/dado | Owner | Admin | Manager | Agent/atendente | Professional |
|---|---:|---:|---:|---:|---:|
| Dashboard operacional | sim | sim | sim | visão operacional mínima | agenda/atendimentos próprios |
| Inbox e conversas | todas | todas | equipe/filas permitidas | conversas atribuídas ou fila permitida | somente conversas ligadas ao próprio atendimento, salvo permissão adicional |
| Nome/telefone/mensagens do contato | sim | sim | necessário para equipe | sim, quando necessário para atender | sim, quando necessário para executar o serviço |
| Notas internas | todas | todas | equipe permitida | somente notas operacionais necessárias | notas do próprio atendimento |
| Serviços, preços publicados e disponibilidade | editar | editar | editar se delegado | ler o necessário para responder | ler o necessário para executar |
| Custo, margem e faturamento consolidado | sim | sim | não por padrão | não | não |
| Orçamento do contato | sim | sim | ler/editar se delegado | ler somente o necessário; sem métricas globais | ler o próprio atendimento se necessário |
| Lançamento manual de recebimento | sim | sim | se delegado e auditado | não por padrão | não |
| Configuração de IA e prompt publicado | publicar/rollback | editar/publicar se delegado | sugerir/revisar | não editar regras globais | não |
| Chave Pix, tokens, API keys e secrets | referência mascarada | referência mascarada | não | não | não |
| WhatsApp, QR, conexão e webhooks | sim | sim | status operacional | status limitado | não |
| Equipe, convites e desativação | sim | sim | escopo delegado | não | não |
| Exportação e exclusão de dados | sim, com confirmação/auditoria | conforme política | não por padrão | não | não |
| Console `platform_admin` | não por ser membro comum | não | não | não | não |

A matriz é um ponto de partida. **Permissão de módulo não deve liberar automaticamente todos os campos**: a resposta do backend deve filtrar dados sensíveis por papel e contexto.

## 4. Atendente: o que ela precisa saber

Uma atendente normalmente precisa:

- identificar o contato e o histórico necessário para não repetir perguntas;
- responder mensagens e enviar mídia autorizada;
- consultar serviços, preços publicados, duração e horários disponíveis;
- registrar notas operacionais, origem, estágio e resultado do atendimento;
- criar ou solicitar agendamento dentro das regras;
- ver o status do orçamento quando isso for necessário para responder o cliente.

Ela normalmente **não precisa**:

- ver faturamento total, margem, custo, recebimentos de toda a empresa ou ranking financeiro;
- acessar chave Pix em claro, tokens, QR, API keys ou configuração de provider;
- publicar/alterar prompt global da IA;
- exportar a base inteira de contatos;
- convidar, promover ou desativar funcionários;
- acessar conversas de equipes sem relação com sua fila, se a empresa adotar assignment.

Se a operação for uma caixa compartilhada, o owner pode liberar Inbox completa para atendentes, mas isso deve ser uma decisão explícita por workspace e auditada. O padrão mais seguro é **fila/assignment + acesso mínimo necessário**.

## 5. Convite e ciclo de vida

Estados sugeridos para `workspaceInvites`:

- `pending`: criado e ainda não aceito;
- `sent`: tentativa de entrega registrada;
- `accepted`: conta e membership criadas/ativadas;
- `expired`: passou do prazo;
- `revoked`: cancelado pelo owner/admin;
- `replaced`: novo convite substituiu o anterior.

Regras:

1. token aleatório forte, armazenado somente como hash;
2. expiração curta e configurável, por exemplo 72 horas;
3. um convite pendente por e-mail/workspace/papel, com reenvio que invalida o token anterior;
4. e-mail do aceite deve coincidir com o e-mail convidado, salvo fluxo explícito de troca auditada;
5. aceitar convite não promove usuário em outro workspace;
6. membership nasce inativa até o aceite transacional concluir;
7. owner/admin pode revogar antes do aceite e desativar depois;
8. desativação invalida sessões e tokens de reset;
9. mudança de papel, escopo ou fila gera auditoria;
10. nunca colocar senha, token de provider ou segredo na URL ou no e-mail.

## 6. Modelo técnico recomendado

Adicionar/estabilizar:

- `workspaceInvites`: `workspaceId`, `email`, `role`, `operationalRole`, `scope`, `tokenHash`, `expiresAt`, `status`, `invitedByUserId`, `acceptedByUserId`, `acceptedAt`, `revokedAt`;
- `workspaceMembers`: `workspaceId`, `userId`, papel, perfil operacional, ativo, `teamId`/`assignmentScope` quando a distribuição for implementada;
- `passwordResetTokens`: hash do token, expiração, uso e usuário;
- `permissionPolicies` ou configuração versionada por workspace apenas se a matriz fixa não for suficiente; começar com permissões server-side fixas e escopos simples, não com editor de ACL complexo;
- `auditLogs`: convite criado, reenviado, aceito, revogado, membro ativado/desativado, papel/escopo alterado, acesso sensível e exportação.

O servidor deve usar procedures por capacidade (`canManageTeam`, `canViewBilling`, `canSendMessages`, `canViewAllInbox`, etc.) e escopo (`workspace`, `team`, `assigned`, `own`). A UI pode esconder menus, mas nunca é a barreira de segurança.

## 7. Ordem de implementação

### P0 — segurança da identidade

- convite one-time com hash, expiração, revogação e aceite transacional;
- criar senha com hash forte, rate limit e revogação de sessão;
- membership ativa e workspace-scoped em todas as procedures;
- matriz server-side de capacidades e testes negativos entre papéis;
- masking de secrets e campos financeiros.

### P1 — operação de equipe

- assignment/equipes/fila de Inbox;
- permissões de leitura por conversa e notas;
- tela de convites pendentes, reenvio e revogação;
- trilha de auditoria e visão de suporte.

### P2 — flexibilidade controlada

- escopos personalizados por workspace;
- permissões temporárias e delegação com expiração;
- exportação, LGPD e relatórios por papel;
- confirmação de e-mail e Google OAuth quando provedores estiverem configurados.

## 8. Critérios de aceite

- Funcionário convidado não consegue acessar rota/procedure de billing por alterar a URL.
- Funcionário não recebe secrets, chave Pix em claro ou prompt administrativo em resposta de API.
- Atendente consegue atender uma conversa autorizada e não consegue abrir conversa fora do escopo.
- Revogar convite impede aceite do link antigo.
- Desativar membro revoga sessões ativas.
- Alterar papel não deixa permissões antigas em cache.
- Dois workspaces não conseguem usar convite, membership ou ID de contato um do outro.
- Toda ação administrativa e acesso sensível fica auditado.
