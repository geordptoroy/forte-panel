# Continuação do Forte Panel — Portal do profissional

**Data:** 24/09/2026

**Repositório:** `geordptoroy/forte-panel`

**Branch:** `main`

**Último commit publicado antes desta etapa:** `7888e98 docs: clarify lead memory and forte panel tool roles`

## Objetivo da próxima etapa

O Forte Panel já conseguiu consumir a API real pela Forte Panel Tool. O teste de disponibilidade funcionou, mas retornou arrays vazios porque ainda não havia configuração operacional de agenda suficiente.

A próxima etapa é transformar o Panel em um sistema utilizável por uma operação real:

- o proprietário e administradores gerenciam a conta, equipe, profissionais, serviços e agenda;
- um profissional executor possui login próprio;
- o profissional executor vê apenas os próprios atendimentos;
- o profissional pode acompanhar o que precisa fazer no dia, na semana e no mês;
- o fluxo deve se parecer com um quadro operacional simples, semelhante ao Trello;
- atendentes humanos e atendentes de IA são separados dos profissionais que executam o serviço;
- a agenda continua sendo a fonte oficial usada pela Forte Panel Tool.

## Arquitetura funcional decidida

Existem três conceitos diferentes e eles não devem ser misturados.

### Papel de acesso ao Panel

O papel de acesso determina o que a pessoa pode administrar:

- `owner`: proprietário;
- `admin`: administrador;
- `manager`: gerente;
- `agent`: atendente.

### Perfil operacional

O perfil operacional determina o tipo de atuação:

- `human_attendant`: atendente humano;
- `ai_attendant`: atendente de IA;
- `professional`: profissional executor.

Exemplo do Gabriel:

```text
Papel de acesso: owner
Perfil operacional: professional
Profissional vinculado: Gabriel
```

Exemplo de atendente humano:

```text
Papel de acesso: agent
Perfil operacional: human_attendant
Profissional vinculado: nenhum
```

A IA não precisa ser um usuário humano com senha. Ela pode continuar sendo o agente conectado ao n8n.

### Três fontes de contexto do agente

```text
Postgres Chat Memory = histórico curto da conversa
Lead Memory Tool = estado estruturado e resumo do lead
Forte Panel Tool = CRM oficial, notas operacionais e agenda
```

A Lead Memory Tool deve estar publicada no n8n. Ela possui as ações `ler`, `atualizar` e `registrar_evento`. A Forte Panel Tool possui as ações de CRM e agenda. Nenhuma das duas deve repetir a mesma operação.

## O que já foi confirmado

A Forte Panel Tool consumiu a API real e recebeu uma resposta semelhante a:

```json
{
  "timezone": "America/Sao_Paulo",
  "services": [],
  "professionals": [],
  "appointments": []
}
```

Isso confirmou que a integração está viva. A resposta vazia significa falta de dados/configuração operacional, não falha de conexão.

O usuário também informou que o workflow da Lead Memory Tool estava despublicado durante parte dos testes. Antes de testar o agente novamente, a subworkflow da Lead Memory Tool precisa estar publicada/ativa.

## Estado atual do banco

O schema já possui as entidades principais:

- `users`;
- `workspaceMembers`;
- `services`;
- `professionals`;
- `availability`;
- `appointments`;
- `contacts`;
- `workspaceSettings`.

A agenda já possui vínculo explícito:

```text
appointments.professionalId -> professionals.id
appointments.serviceId -> services.id
appointments.contactId -> contacts.id
```

A disponibilidade já possui:

```text
availability.professionalId
availability.weekday
availability.startMinute
availability.endMinute
```

## Alterações iniciadas nesta etapa

As seguintes alterações já foram feitas no workspace, mas ainda precisam ser concluídas, testadas e commitadas:

### `drizzle/schema.ts`

Foi adicionado:

```text
operational_role = human_attendant | ai_attendant | professional
```

Na tabela `users` foram adicionados:

```text
passwordHash
operationalRole
```

Na tabela `workspaceMembers` foi adicionado:

```text
professionalId
```

### `drizzle-pg/0006_lumpy_night_thrasher.sql`

Migration gerada:

```sql
CREATE TYPE "public"."operational_role" AS ENUM('human_attendant', 'ai_attendant', 'professional');
ALTER TABLE "users" ADD COLUMN "passwordHash" text;
ALTER TABLE "users" ADD COLUMN "operationalRole" "operational_role";
ALTER TABLE "workspaceMembers" ADD COLUMN "professionalId" integer;
```

A migration foi gerada, mas **não foi aplicada ao banco de produção**.

### `server/db.ts`

Foram adicionados helpers para:

- gerar hash local com `crypto.scryptSync`;
- verificar senha local com comparação segura;
- buscar usuário por e-mail;
- criar membro local com senha e perfil operacional;
- buscar o vínculo de workspace do usuário atual;
- filtrar `getAgendaSnapshot(professionalId?)` por profissional.

### `server/routers.ts`

Foi iniciado:

- login local para aceitar o administrador configurado por Compose e contas locais salvas no banco;
- `auth.access`, que retorna papel, perfil operacional e `professionalId`;
- `workspace.createMember`, protegido para administradores;
- filtro de `agenda.snapshot` para profissionais executores.

A checagem TypeScript passou após essas alterações:

```text
pnpm check
```

## O que ainda não está pronto

### 1. Migration precisa ser aplicada

A migration `0006_lumpy_night_thrasher.sql` precisa ser aplicada ao banco correto depois de revisar e validar o ambiente.

Não aplicar automaticamente em produção sem confirmar o `DATABASE_URL` correto.

### 2. Criar profissionais pelo Panel

A API e o schema já possuem a tabela `professionals`, mas ainda falta uma interface administrativa para:

- criar profissional;
- editar nome;
- editar especialidade;
- ativar/desativar;
- definir cor;
- vincular serviços;
- configurar disponibilidade semanal.

### 3. Criar serviços pelo Panel

A página Agenda atualmente espera que `services` exista, mas ainda não há uma tela administrativa completa para:

- criar serviço;
- editar nome e descrição;
- definir duração;
- definir preço opcional;
- ativar/desativar;
- vincular o serviço aos profissionais executores.

### 4. Vínculo profissional-serviço

O schema atual tem `services` e `professionals`, mas ainda não existe uma tabela de relação muitos-para-muitos. Para um produto correto, criar:

```text
professionalServices
- id
- workspaceId
- professionalId
- serviceId
- active
```

Sem essa tabela, a API não consegue saber de forma confiável quais serviços cada profissional pode executar.

### 5. UI de criação de usuários

A procedure `workspace.createMember` foi iniciada, mas a página `TeamPage` ainda mostra um formulário visual sem mutation real.

A UI precisa enviar:

```text
name
email
password
role
operationalRole
professionalId opcional
```

Regras:

- somente proprietário/administrador pode criar conta;
- senha mínima de oito caracteres;
- e-mail único;
- não mostrar `passwordHash` na resposta;
- profissional executor deve ser vinculado a um profissional;
- atendente humano não deve exigir `professionalId`;
- atendente de IA não deve ser tratado como executor.

### 6. Login e autorização

O login atual ainda mostra “e-mail do administrador” e o rodapé diz que a conta vem das variáveis do Compose. Isso precisa ser atualizado para:

```text
E-mail
Senha
```

O login local agora aceita contas criadas no banco, mas deve ser revisado para:

- verificar membro ativo no workspace;
- impedir login de membro desativado;
- definir o primeiro usuário local de forma segura;
- permitir troca de senha posteriormente;
- registrar auditoria de criação, login e desativação.

A checagem atual ainda usa `ctx.user.role` global em alguns pontos. A autorização definitiva deve usar o papel de `workspaceMembers`.

### 7. Portal do profissional

Ainda não existe uma página dedicada para o executor.

Criar uma rota como:

```text
/my-work
```

ou:

```text
/minha-agenda
```

Para um usuário com `operationalRole === professional`, mostrar:

- resumo do dia;
- atendimentos de hoje;
- próximos atendimentos;
- visão semanal;
- visão mensal;
- status do atendimento;
- nome e telefone do cliente;
- cidade, bairro e serviço;
- observações;
- botão para iniciar atendimento;
- botão para concluir;
- botão para marcar como não compareceu;
- possibilidade de abrir a conversa quando permitido.

A consulta deve ser filtrada no servidor por `professionalId`. Não basta esconder cards no frontend.

### 8. Menu por perfil

O menu lateral deve mudar conforme o acesso:

#### Proprietário/admin/gerente

Mostrar:

- Dashboard;
- Inbox;
- Kanban;
- Agenda completa;
- Contatos;
- Faturamento;
- Integrações;
- Onboarding;
- Equipe;
- Configurações.

#### Profissional executor

Mostrar prioritariamente:

- Meu dia;
- Minha semana;
- Minha agenda;
- Clientes dos meus atendimentos;
- Perfil e disponibilidade própria, se permitido.

Não mostrar faturamento, integrações, credenciais, equipe ou configurações administrativas.

#### Atendente humano

Mostrar prioritariamente:

- Inbox;
- Contatos;
- Kanban;
- tarefas atribuídas.

Não mostrar administração de equipe nem credenciais.

### 9. Páginas de configurações incompletas

A página `SettingsPage` atualmente exibe botões sem navegação funcional:

- Perfil e conta;
- Notificações;
- Segurança;
- Auditoria.

Esses botões precisam virar tabs funcionais ou rotas reais. Não deixar ações sem efeito.

A página `IntegrationsPage` ainda possui um botão “Configurar” que apenas mostra um alerta. Isso deve continuar explícito como configuração de servidor ou ser transformado em uma tela real.

## Problemas conhecidos no código iniciado

Antes de continuar, revisar estes pontos:

1. `workspace.createMember` aceita `professionalId`, mas ainda não valida se o profissional pertence ao workspace correto.
2. O formulário da equipe ainda não chama a mutation.
3. Não existe UI para criar o profissional antes de criar uma conta vinculada.
4. A tabela `professionalServices` ainda não existe.
5. `agenda.snapshot` filtra a lista no servidor, mas `agenda.create`, `updateStatus` e `cancel` ainda precisam de autorização por profissional.
6. Um profissional não pode alterar ou cancelar agendamento de outro profissional.
7. O login local ainda depende de `LOCAL_AUTH_ENABLED` e da configuração atual do Compose; validar se essa regra deve continuar para todas as contas ou apenas para o bootstrap administrativo.
8. A migration não foi aplicada.
9. Ainda não foram executados `pnpm test` e `pnpm build` depois das alterações.
10. O workspace contém arquivos de Compose enviados pelo usuário e uma exclusão antiga do node n8n. Não apagar nem incluir esses arquivos sem revisar o status e a intenção.

## Arquivos de Compose que não devem ser confundidos

O `git status` ao documentar esta etapa mostrou:

```text
D packages/n8n-nodes-forte-panel/nodes/FortePanel/FortePanelTool.node.ts
?? docker-compose.corrected.yaml
?? docker-compose.evomain-preserved.yaml
?? docker-compose.yaml
```

Esses arquivos vieram das etapas anteriores de instalação/teste do n8n e não devem ser misturados automaticamente ao commit do portal profissional.

## Ordem recomendada de implementação

### Fase A — Banco e regras

1. Criar `professionalServices`.
2. Adicionar índices e constraints para workspace.
3. Aplicar migration em ambiente local.
4. Criar helpers de CRUD de serviços, profissionais e disponibilidade.
5. Criar autorização por papel e por `professionalId`.
6. Criar testes de isolamento entre profissionais.

### Fase B — Administração

1. Tela de serviços.
2. Tela de profissionais.
3. Tela de disponibilidade.
4. Tela de equipe com criação de usuário e senha.
5. Vínculo entre usuário, membro e profissional.
6. Auditoria de alterações.

### Fase C — Portal profissional

1. Rota `/my-work`.
2. Query `professional.myAgenda` protegida no servidor.
3. Cards de hoje.
4. Lista semanal.
5. Visão mensal.
6. Atualização de status.
7. Bloqueio de dados de outros profissionais.

### Fase D — Integração com agente

1. Garantir que `availability` retorne somente serviços e profissionais ativos.
2. Filtrar por serviço quando o lead informar o serviço.
3. Retornar `professionalId` real nos horários.
4. Criar appointment somente com ID real.
5. Atualizar Lead Memory e CRM sem duplicidade.
6. Repetir o teste pelo n8n somente depois de publicar a Lead Memory Tool.

## Comandos para retomar

```bash
cd /home/ubuntu/forte-panel

git status --short --branch
git log --oneline --decorate -12

pnpm check
pnpm test
pnpm build

DATABASE_URL="$DATABASE_URL" pnpm drizzle-kit check
DATABASE_URL="$DATABASE_URL" pnpm drizzle-kit generate
```

Para inspecionar alterações antes de commit:

```bash
git diff -- drizzle/schema.ts server/db.ts server/routers.ts
git diff --check
```

Para confirmar a migration criada:

```bash
cat drizzle-pg/0006_lumpy_night_thrasher.sql
```

## Critério de aceite da próxima etapa

A etapa pode ser considerada concluída quando:

1. o proprietário consegue criar um usuário com nome, e-mail, senha, papel e perfil operacional;
2. o proprietário consegue criar o profissional Gabriel;
3. o proprietário consegue cadastrar pelo menos um serviço elétrico;
4. o proprietário consegue vincular o serviço ao Gabriel;
5. o proprietário consegue configurar os horários de trabalho do Gabriel;
6. Gabriel consegue entrar com seu próprio e-mail e senha;
7. Gabriel vê somente os atendimentos vinculados ao seu `professionalId`;
8. um gerente consegue ver a agenda completa;
9. um profissional não consegue consultar ou alterar o agendamento de outro profissional pela API;
10. a Forte Panel Tool recebe serviços, profissionais e horários reais;
11. o agente consegue consultar “amanhã” e usar o `professionalId` retornado;
12. a criação do appointment funciona após confirmação explícita do cliente;
13. nenhuma tela de configurações fica clicável sem efeito;
14. `pnpm test`, `pnpm check` e `pnpm build` passam.

## Resumo para a próxima IA

Não recomeçar o node n8n. A API real já foi consumida com sucesso. O próximo trabalho é produto e autorização: criar usuários locais no Panel, separar papel de acesso de perfil operacional, cadastrar serviços/profissionais/disponibilidade e entregar um portal de agenda filtrado no servidor para cada profissional executor.

A primeira implementação incompleta desta etapa já está no workspace em `drizzle/schema.ts`, `server/db.ts`, `server/routers.ts` e na migration `drizzle-pg/0006_lumpy_night_thrasher.sql`. O TypeScript passou, mas o restante ainda precisa ser concluído e testado.
