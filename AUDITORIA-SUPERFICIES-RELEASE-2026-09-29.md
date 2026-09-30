# Auditoria de superfícies e release — 2026-09-29

**Fatia:** P0.1 — Inventário de superfícies demo/beta e classificação de release
**Base:** checkout `main` em `47bf199`
**Objetivo:** separar o que é caminho público real, operação interna, simulação e código que precisa ser removido ou reconstruído.

> Esta matriz é uma fotografia de código, não uma promessa de staging. Uma superfície só pode virar `public_ready` depois de passar pelos gates do roadmap.

## 1. Estados usados

| Estado | Significado |
|---|---|
| `public_ready` | Pode fazer parte do produto público após os gates físicos e de ambiente; não depende de dados fictícios nem de simulação para o efeito principal. |
| `internal_only` | Superfície válida para operador, suporte, QA ou administração, mas não deve aparecer no produto do cliente final. |
| `simulation_only` | Executa demonstração/teste controlado sem efeito externo; deve declarar isso explicitamente. |
| `not_ready` | Existe código ou rota, mas há contenção, dados fictícios, contrato incompleto, dívida de UX ou falta de prova para exposição pública. |
| `remove_from_runtime` | Showcase, fixture ou artefato sem função de produto; não deve entrar no bundle/caminho autenticado. |

## 2. Matriz de rotas

| Superfície | Evidência no código | Fonte principal | Estado atual | Decisão |
|---|---|---|---|---|
| `/login` | `LoginPage`, `auth.localLogin` | banco/sessão | `public_ready` | manter; adicionar telemetria de falha e empty/error claros |
| `/signup` | `SignupPage`, `auth.signup`, `createPublicSignup` | workspace real | `public_ready` | manter; validar onboarding imediato e ausência de seeds |
| `/forgot-password` | `ForgotPasswordPage`, `auth.requestPasswordReset` | email/sessão | `public_ready` | manter; banner é estado de entrega, não demo |
| `/reset-password` | `ResetPasswordPage`, `auth.resetPassword` | sessão/token | `public_ready` | manter; tratar token ausente como erro de link |
| `/invite/:token` | `InviteAcceptPage`, `auth.acceptInvite` | convite/membership | `public_ready` | manter; validar revogação e expiração |
| `/whatsapp-connection` | `WhatsappConnectionPage`, CRUD Baileys | gateway + banco | `not_ready` | é a primeira rota operacional; depende de prova real de QR, reconexão e outbound |
| `/inbox` | `InboxPage`, `trpc.inbox` | contatos/conversas/mensagens | `not_ready` | fechar assignment, cursor, unread, follow-up e prova de mensagem real |
| `/kanban` | `KanbanPage`, `inbox.moveStage` | contatos/stages | `not_ready` | consolidar como Funil comercial, sem divergência de estágios |
| `/dashboard` | `DashboardPage`, `dashboard.snapshot` | KPIs derivados | `not_ready` | substituir métricas incompletas por ações do dia e KPIs de receita reais |
| `/agenda` | `AgendaPage`, `agenda.snapshot/create/update` | appointments/professionals | `not_ready` | fechar conflitos, disponibilidade, confirmação, conclusão e no-show |
| `/contacts` | `ContactsPage`, `inbox.contacts/createContact` | contacts/conversations | `not_ready` | remover `DemoBanner`; adicionar lead, origem, próxima ação e vínculo comercial |
| `/contacts/:id` | `ContactDetailPage`, thread/agenda/notes | contato + histórico | `not_ready` | remover `DemoBanner`; consolidar orçamento, agenda e recebimento |
| `/billing` | `BillingPage`, `billing.quotes/updatePayment` | quotes/contacts | `not_ready` | remover `DemoBanner` e “salvo localmente em modo demo”; implementar itens, condição e recibo |
| `/services` | `ServicesPage`, `workspace.services` | services | `not_ready` | fonte real já existe; integrar preço/duração/availability ao orçamento e agenda |
| `/professionals` | `ProfessionalsPage`, `workspace.professionalsDetailed` | professionals/availability | `not_ready` | fechar capacidade, serviços e agenda do executor |
| `/team` | `TeamPage`, invites/members | membership | `not_ready` | funcionalidade real; validar papéis, revogação e onboarding de equipe |
| `/onboarding` | `OnboardingPage`, autosave/voice/extract/publish | onboarding tables + storage | `not_ready` | simplificar dez blocos técnicos para seis passos públicos |
| `/settings` | `SettingsTabsPage` | user/workspace/preferences/audit | `not_ready` | separar configuração do cliente de governança interna |
| `/integrations` | `IntegrationsPage`, usage/alerts | quotas/events | `not_ready` | mostrar somente integrações e consumo que o cliente pode operar |
| `/my-work` | `ProfessionalPortalPage` | professional agenda/status | `not_ready` | provar isolamento do profissional e atualização de status |
| `/ai-config` | redirect para `/platform-admin/ai` | Console Admin | `internal_only` | não expor ao cliente; substituir por regras de atendimento no onboarding |
| `/ai-prompt` | `AiPromptPage`, `agent.config/save` | prompt técnico | `internal_only` | não expor ao cliente final; governança vai para Console Admin |
| `/platform-admin/*` | `PlatformAdminPage` e suporte | platform procedures | `internal_only` | reconstruir como control-plane de produção, sem “beta” |
| `/platform-admin/support-inbox` | Inbox com `platformAdmin` | tenant interno | `internal_only` | manter separado de workspaces clientes |
| `ComponentShowcase` | `ComponentShowcase.tsx` | estado local/mock | `remove_from_runtime` | preservar somente como ferramenta visual isolada; não registrar rota pública |

## 3. Achados de dados fictícios e bootstrap

### Cliente

- `client/src/pages/PanelPages.tsx` importa tipos e helpers de `client/src/lib/demoData`.
- `DemoBanner` aparece em Contatos, detalhe de Contato e Financeiro.
- Financeiro ainda mostra a mensagem `Orçamento salvo localmente em modo demo.` em um fluxo de fallback.
- `ComponentShowcase.tsx` contém respostas simuladas e texto “In a real app...”. Não foi encontrado como rota no `App.tsx`, mas deve ficar fora do runtime de produção.
- `CORE_ONLY_MODE = true` em `client/src/core-mode.ts` redireciona quase todas as rotas para `/whatsapp-connection` e expõe apenas Inbox, Console Admin e conexão. Isso é contenção de produto, não autorização.

### Servidor

- `server/db.ts` mantém `ensureDemoWorkspace`, `ensureDemoWhatsappChannels`, `ensureDemoInbox` e `ensureDemoAgenda`.
- Há `seedContacts`, `seedServices` e seeds de mensagens/agenda associadas ao workspace demo.
- `server/routers.ts` expõe `inbox.seed`, uma mutation administrativa de seed que chama `ensureDemoInbox`.
- `ensureDemoAgenda` é chamada por snapshots e criação de agenda quando o slug é `forte-demo`; esse acoplamento precisa ser isolado para não contaminar o caminho de produção.
- `createPublicSignup` cria workspace próprio com status `onboarding`; não há evidência no código auditado de que o signup insira entidades fictícias. Esse comportamento deve ser protegido por teste de não-seeding.

## 4. Achados de linguagem de produto

A área de Console Admin ainda contém linguagem que não pode chegar à operação de produção:

- `Workspaces beta`;
- `Contas beta`;
- `Acompanhamento operacional do beta`;
- `Ação mutável de suporte autorizada no beta`;
- `Registro de suporte beta`;
- `Ajuste operacional do agente no beta`;
- `fora dos Workspaces beta`;
- `Workspaces beta não aparecem aqui`;
- placeholder com `staging`.

Esses textos devem ser tratados na P0.4, não corrigidos parcialmente durante uma tarefa de dados, para manter uma fatia coesa de linguagem e auditoria.

## 5. Simulações legítimas, mas que precisam ser rotuladas

- `server/platform-admin.ts` usa `buildLocalSimulationResponse` e registra `agentSimulationRuns` sem provider externo.
- `server/platform-router.ts` retorna `providerCallAllowed: false` para a simulação.
- A UI já informa `Sem envio externo` e `providerCalled: false` em parte do fluxo.
- Esta superfície é válida para QA e revisão humana, mas não pode ser apresentada como teste de conexão, resposta real de modelo ou mensagem enviada.

## 6. Decisão da fatia P0.1

1. O próximo código deve começar removendo a dependência do cliente em `demoData` e os `DemoBanner` operacionais — fatia **P0.2**.
2. O isolamento dos helpers `ensureDemo*` e do `inbox.seed` fica na fatia **P0.3**.
3. A limpeza dos textos beta/staging fica concentrada na **P0.4**.
4. O `CORE_ONLY_MODE` não será desligado ainda. Primeiro será criado o release gate por rota na **P0.5**, depois as rotas serão liberadas individualmente conforme o núcleo fechar.
5. A primeira rota de valor a ser validada após o saneamento é o caminho `/whatsapp-connection` → `/inbox` → lead, não o Dashboard visual.

## 7. Limitações da auditoria

- A auditoria foi estática no código e não constitui prova de staging, PostgreSQL persistente, número WhatsApp real ou restore.
- Não foram executados testes completos nesta fatia, conforme a instrução vigente de pular testes.
- Nenhum dado de produção foi apagado ou modificado.
