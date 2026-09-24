# Continuação do Forte Panel — Catálogo operacional e isolamento da agenda

**Data:** 24/09/2026
**Repositório:** `geordptoroy/forte-panel`
**Branch:** `main`
**Commit anterior:** `b70dfa5 feat: add professional portal and operational access management`

## Objetivo desta etapa

O checkpoint anterior entregou o modelo de dados do portal do profissional (tabela `professionalServices`, coluna `professionalId` em `workspaceMembers`, perfil operacional em `users`), mas as telas ainda eram estáticas, a autorização usava o papel global de usuário e nenhum teste garantia que um profissional não veria a agenda de outro.

Esta etapa fecha a lacuna operacional:

- o proprietário cria serviços, profissionais e vínculos reais;
- cada profissional tem jornada semanal própria, persistida;
- o acesso de executor é criado com e-mail e senha e fica preso ao `professionalId`;
- a autorização passa a ler o papel do workspace, não o `role` global;
- o profissional executor vê somente a própria agenda, em dia, semana, mês e clientes;
- a API v1 devolve apenas serviços e profissionais ativos, com o par válido para agendamento.

## O que foi entregue

### 1. Autorização baseada no workspace

`server/workspace.ts` passa a ser a fonte de verdade da autorização. `resolveWorkspaceAccess()` devolve o papel de workspace, o perfil operacional, o `professionalId` vinculado e os sinalizadores `canManageTeam`, `canManageCatalog`, `canSeeFullAgenda` e `restrictedToOwnAgenda`.

Um membro desativado nunca herda visibilidade de administrador — o `role` global só serve para o bootstrap do proprietário da instalação. Todos os middlewares `requireManager` e `requireAdministrator` derivam desse resolvedor.

### 2. Catálogo operacional persistido

- `listServices`, `createService`, `updateService`, `setServiceProfessionals`;
- `listProfessionalsDetailed`, `createProfessional`, `updateProfessional`, `setProfessionalServices`;
- `replaceAvailability` para a jornada semanal por dia da semana.

Rotas tRPC novas: `workspace.services`, `workspace.createService`, `workspace.updateService`, `workspace.setServiceProfessionals`, `workspace.professionalsDetailed`, `workspace.updateProfessional`, `workspace.setProfessionalServices`, `workspace.setProfessionalAvailability`.

### 3. Isolamento da agenda do profissional

`server/agenda.ts` centraliza leitura e transição de estado. `listAppointmentsForProfessional` sempre filtra por `workspaceId` **e** `professionalId`, e `transitionAppointment` aceita `restrictToProfessionalId`, o que faz um executor receber `NOT_FOUND` ao tentar alterar o atendimento de outro profissional.

`agenda.snapshot` devolve a agenda completa para gestores e a agenda própria para executores. `agenda.updateMyStatus` e `agenda.cancel` respeitam o vínculo. `agenda.create` recusa (`FORBIDDEN`) quando o executor tenta agendar para outro profissional.

### 4. Status `in_progress`

O enum `appointment_status` ganhou `in_progress`, permitindo o ciclo Real: `requested → confirmed → in_progress → completed`, com `cancelled` e `no_show` como saídas. O profissional inicia e conclui os próprios atendimentos.

### 5. Portal do profissional

`/my-work` (arquivo `client/src/pages/ProfessionalPortal.tsx`) mostra contadores de hoje, semana, mês e concluídos, o próximo compromisso com ações rápidas, e as visões **dia**, **semana**, **mês** e **clientes**. O menu lateral (`PanelLayout.tsx`) muda conforme o perfil: gestão, atendimento ou portal do profissional.

### 6. Telas administrativas

- `/services`: cadastro de serviços com duração, preço e vínculo de executores;
- `/professionals`: ficha do executor com serviços vinculados e jornada semanal editável;
- `/team`: criação real de acesso (e-mail + senha) com papel de workspace, perfil operacional e vínculo ao profissional; ativação e desativação de acesso;
- `/settings`: abas reais de perfil, segurança (troca de senha), notificações persistidas, disponibilidade própria do profissional e auditoria.

`client/src/pages/PanelPages.tsx` deixou de conter as telas estáticas de Equipe, Configurações e Portal — elas foram substituídas por módulos com ações persistidas.

### 7. Migrations PostgreSQL

`drizzle-pg/0007_professional_services.sql` e `drizzle-pg/0008_operational_catalog.sql` aplicam, respectivamente, a tabela de vínculo profissional-serviço e as mudanças desta etapa: status `in_progress`, coluna `users.phone` e os índices `appointments_workspace_idx`, `appointments_professional_idx`, `availability_professional_idx`, `professionals_workspace_idx`, `services_workspace_idx`, `workspace_members_unique_idx` e `workspace_members_professional_idx`.

A migration foi validada contra um PostgreSQL 16 real: as 19 tabelas foram criadas e o enum passou a ter os seis estados.

### 8. API v1 mais precisa

`GET /api/v1/availability` agora aceita `serviceId` e `professionalId`, devolve apenas serviços e profissionais ativos, inclui `serviceIds` em cada profissional e `professionalIds` em cada serviço, e lista somente horários futuros não cancelados. `POST /api/v1/appointments` recusa (`409 service_not_linked`) quando o profissional não executa o serviço e (`400 invalid_period`) quando o período é inválido.

## Verificação executada

| Verificação | Resultado |
|---|---|
| `pnpm check` (tsc) | sem erros |
| `pnpm test` sem banco | 16 testes de contrato passam, 5 de isolamento pulados |
| `pnpm test` com PostgreSQL | 22 testes passam, incluindo os 6 de isolamento |
| Migrations em PostgreSQL 16 real | 19 tabelas e enum de 6 estados |
| `scripts/validate-flow.mjs` contra servidor de produção | 23 de 23 validações |
| Verificação visual no navegador | dashboard, serviços, profissionais, equipe e portal do executor |

O teste `server/professional-isolation.test.ts` cobre: leitura restrita ao próprio `professionalId`, recusa de transição alheia, transição própria permitida, agenda completa para gestor, recusa de criação para terceiro, bloqueio de membro desativado e ausência de exposição do roster, da auditoria e da lista de profissionais.

O script `scripts/validate-flow.mjs` exercita o mesmo comportamento por HTTP real: login do proprietário, criação de serviço e profissionais, vínculos, jornada, criação de duas contas de executor, login do executor, `FORBIDDEN` em auditoria, roster, profissionais e criação de serviço, agendamento pelo gestor, início pelo executor e checagem da API v1.

## Correções encontradas durante a verificação visual

Duas falhas só apareceram ao exercitar o painel no navegador, com uma conta real de executor:

1. **Crash do portal (`React error #310`)**. Em `ProfessionalPortal.tsx`, dois `useMemo` estavam declarados depois dos retornos antecipados de carregamento e de ausência de vínculo. Na primeira renderização a ordem dos hooks era uma; depois do carregamento, outra — e o React abortava a página. Os cálculos foram movidos para antes dos retornos. É um defeito que o `tsc` não detecta, por isso o portal agora é verificado também no navegador.

2. **Roster da equipe exposto ao executor**. Digitar `/team` diretamente na URL mostrava a lista completa de membros — nomes, e-mails e situação de conta — mesmo sem permissão de administração. A navegação lateral escondia o item, mas a rota não tinha guarda. A correção foi aplicada em duas camadas: `workspace.members` e `workspace.professionalsDetailed` agora exigem papel de gestão no servidor (um `FORBIDDEN` real, não apenas ocultação visual), e o componente `AccessGuard` bloqueia no cliente as rotas `/agenda`, `/billing`, `/integrations`, `/onboarding`, `/team`, `/services` e `/professionals`, mostrando a tela "Área restrita".

Ambas as correções ganharam cobertura: o teste de isolamento verifica os `FORBIDDEN` de `workspace.members`, `workspace.audit` e `workspace.professionalsDetailed`, e o script de validação passou a exercitar os mesmos caminhos por HTTP.

## Correção de infraestrutura incluída

O script `start` do `package.json` apontava para `dist/index.js`, mas o build gera `dist/_core/index.js`. Como o `infra/docker-entrypoint.sh` já usava o caminho correto, apenas o comando local quebrava. O script foi alinhado ao artefato real do build.

## Como retomar

```bash
pnpm install
pnpm build
pnpm check
pnpm test
docker compose -p forte-local --env-file .env.local -f docker-compose.yaml -f docker-compose.local.yml up -d
```

Para validar um servidor já em execução:

```bash
FORTE_API_KEY=<chave> node scripts/validate-flow.mjs http://localhost:3000
```

## Próximos passos sugeridos

1. **Notificações reais**: as preferências já são persistidas em `workspaceSettings`, mas ainda não disparam e-mail, WhatsApp ou push.
2. **Hashing de API key por workspace**: o contrato atual usa uma chave de ambiente; a evolução prevista é chave por workspace com hash.
3. **Auditoria com escopo**: `workspace.audit` já é restrita a gestores, mas ainda não permite filtrar por contato ou período na interface.
4. **Teste da stack Docker**: executar `docker compose up --build` numa máquina com Docker; o sandbox não tem Docker instalado.

As validações de disponibilidade e sobreposição foram implementadas e têm detalhes em `CONTINUATION_2026-09-24_SCHEDULE_VALIDATION.md`.
