# Forte Panel — plano de auditoria e execução para o beta

**Data:** 2026-09-27
**Estado:** pré-staging, antes de novos convites beta
**Escopo:** console da plataforma, operação do workspace, WhatsApp/QR, UX mobile, métricas, catálogo, planos, LGPD e lançamento público.

## Resumo executivo

A auditoria confirmou que o produto já tem uma base técnica relevante, mas ainda não deve abrir cadastro público nem ampliar o beta. Existem dois grupos de problemas: **falhas de fluxo que precisam ser corrigidas imediatamente** e **blocos de produto que precisam ser modelados antes de serem simulados na interface**.

A ordem correta é primeiro fechar segurança/controle-plane e coerência dos dados; em seguida tornar WhatsApp e operação diária confiáveis; depois criar billing, catálogo e governança LGPD; só então publicar landing page, signup e novos convites.

## Prioridade P0 — bloquear riscos e fluxos quebrados

### P0.1 — Corrigir o console administrativo

- Remover o botão genérico “Voltar ao painel workspace” que aponta para `/dashboard`.
- Substituir por retorno ao contexto correto: lista de workspaces, detalhe anterior ou handoff explícito com `workspaceId` + `supportSessionId` validado no servidor.
- Corrigir o dead-end de workspace suspenso: o administrador precisa conseguir abrir o detalhe e iniciar uma sessão administrativa mesmo quando o workspace está suspenso, para poder reativá-lo.
- Unificar o guard de plataforma para que um `platformAdmin` sem membership consiga usar o console e as rotas administrativas legadas sem passar por `protectedProcedure` dependente de tenant.
- Invalidar/refazer o detalhe após pausar/reativar IA ou workspace.
- Tornar `sessionId` e aba administrativos canônicos na URL, com limpeza ao expirar e suporte correto a refresh, back e forward.

**Critério de saída:** um operador platform-only consegue entrar, abrir um workspace ativo ou suspenso, iniciar suporte read-only/operator, suspender, sair, voltar e reativar sem banco manual e sem cair na conta normal.

### P0.2 — Restaurar navegação operacional

- Registrar a rota `/kanban` no `App.tsx` ou remover todos os links que apontam para ela.
- Criar smoke test que percorra todos os `href` principais da sidebar e confirme que não retornam `NotFound`.
- Fazer a sidebar calcular estado ativo pelo pathname, ignorando query string, e adicionar `aria-current="page"`.

**Critério de saída:** Dashboard, Atendimento, Funil, Agenda, Clientes, Integrações, Equipe, Serviços, Profissionais e Preferências abrem corretamente e destacam a página atual.

### P0.3 — Corrigir billing e orçamentos antes de qualquer teste comercial

- Remover `ensureDemoWorkspace()` de quotes/billing.
- Fazer cada query/mutação de orçamento receber o `workspaceId` do contexto autenticado.
- Aplicar `requireManager` ou permissão equivalente no backend; `AccessGuard` no frontend não é segurança.
- Criar testes de dois workspaces para impedir leitura e mutação cruzadas.

**Critério de saída:** nenhum orçamento, serviço ou dado financeiro de um workspace aparece ou pode ser alterado por outro workspace.

## Prioridade P1 — operação diária e confiabilidade

### P1.1 — WhatsApp e QR Code

- Mover a conexão WhatsApp para a primeira dobra de Integrações.
- Renomear “Canais conectados” para **Conexão WhatsApp** e usar ícone WhatsApp/telefone apropriado.
- Deixar explícito que a primeira versão permite uma instância por workspace.
- Exibir estado, última atualização, expiração do QR, erro acionável, retry e botão de reconexão.
- Após gerar QR, focar/rolar para o card sem salto inesperado.
- Confirmar no backend o ciclo `idle → connecting → qr → connected → disconnected/logged_out/error`.
- Validar Docker real com número de teste: pareamento, inbound novo, Inbox e outbound.

**Critério de saída:** um owner/manager conecta o número sem acessar secret, entende o estado e consegue recuperar uma falha sem reiniciar toda a stack.

### P1.2 — Dashboard, Atendimento e Funil

Definir KPIs sem misturar entidades:

| KPI | Fonte | Regra |
| --- | --- | --- |
| Mensagens recebidas | `messages` | inbound no período, por status válido |
| Mensagens enviadas | `messages` | outbound por status |
| Novos contatos | `contacts` | contatos criados no período e timezone do workspace |
| Aguardando resposta | última mensagem inbound não respondida | não apenas contador aproximado |
| Pipeline | `contacts.stage` | estágio válido e coluna de desconhecidos durante migração |

Implementação planejada:

- Criar uma projeção/atividade que o Dashboard possa ler para inbound, outbound, falha e mudança de estágio.
- Definir uma única fonte de verdade para unread; hoje `contacts.unreadCount` e `conversations.unreadCount` podem divergir.
- Marcar mensagens/conversas como lidas ao abrir, com cursor ou última mensagem lida.
- Validar estágio no backend e migrar valores divergentes; temporariamente mostrar “Não classificado”.
- Exibir status `queued`, `processing`, `sent`, `received` e `failed` no Atendimento.
- Invalidar/refetch Dashboard, Inbox e Funil depois de webhook/mutação ou usar realtime controlado.
- Corrigir timezone dos agregados de “hoje”.

**Critério de saída:** uma mensagem inbound em contato novo ou existente aparece no Atendimento e atualiza exatamente os KPIs esperados, sem desaparecer do Funil nem depender de reload.

### P1.3 — UX mobile, navegação e performance

- Não esconder `.page-actions` no mobile; substituir por CTA full-width ou ação fixa.
- Evitar duas áreas de scroll simultâneas no Inbox; em mobile usar lista/tela de conversa com retorno claro.
- Implementar scroll-to-bottom controlado e botão “ir para mais recentes”.
- Persistir tabs e views na URL (`tab=agent`, `view=semana`), com heading focado ao trocar de contexto.
- Implementar `role=tablist/tab/tabpanel`, `aria-selected`, `aria-current` e navegação por teclado.
- Corrigir modal/drawer: `role=dialog`, `aria-modal`, foco inicial, Escape, focus trap, retorno de foco e bloqueio de scroll de fundo.
- Aumentar alvos de toque para pelo menos 44px e criar `:focus-visible` consistente.
- Separar páginas por `import()` e medir LCP/INP/transferência em 3G.
- Paginar workspaces do console, aplicar debounce na busca e carregar detalhes por aba.
- Trocar data URL duplicada de anexos por upload binário/storage assinado.
- Revisar contraste e tamanhos de texto funcionais.

**Critério de saída:** fluxo crítico funcional em 320–390px, teclado e leitor de tela, sem salto de scroll e com bundle inicial reduzido.

## Prioridade P2 — produto SaaS e suporte interno

### P2.1 — Tickets e Kanban de suporte

Criar bounded context administrativo separado do Kanban de leads:

- `supportTickets`: workspace, título, descrição, status, prioridade, responsável, tags, timestamps e origem.
- Comentários internos, histórico de mudanças e auditoria.
- Status: `new`, `triage`, `in_progress`, `waiting_customer`, `blocked`, `resolved`, `closed`.
- Kanban `/platform-admin/tickets` com filtros por prioridade, status, workspace, responsável e SLA.
- Permissões read-only/operator/admin e `requireSession` nas operações escopadas.
- Não expor dados pessoais além do necessário para resolver o ticket.

### P2.2 — Catálogo operacional

Separar catálogo de serviços do cliente de catálogo SaaS. Para serviços vendidos pelo workspace, substituir preço `0` ambíguo por:

- `fixed`: preço único;
- `starting_at`: a partir de;
- `quote`: mediante orçamento;
- moeda, unidade, ativo/inativo e validade.

A página deve permitir ao owner/manager criar produto/serviço, escolher o modelo de preço, informar valor ou faixa, controlar disponibilidade e gerar orçamento sem misturar isso com assinatura do Forte Panel.

### P2.3 — Planos, assinaturas e consumo em modo de teste

Criar página **Assinatura e consumo** com cards de planos, plano atual, consumo técnico, consumo comercial, ciclo e recursos. O modo inicial será explicitamente **sandbox/teste**, sem cobrança real:

- clicar em um plano troca o plano de teste do workspace;
- entitlements e limites podem ser testados;
- upgrade/downgrade/cancelamento são simulados;
- todo teste deixa auditoria;
- nenhum checkout ou pagamento real deve ser ativado sem decisão posterior.

Modelo futuro separado do CRM: `saas_products`, `plan_prices`, `plan_entitlements`, `workspace_subscriptions`, `trials`, `usage_ledger`, `invoices` e eventos idempotentes. O rate limit por minuto não deve ser tratado como faturamento mensal.

## Prioridade P3 — lançamento público e governança

Antes de landing/signup público, criar:

- landing page pública;
- `/pricing`;
- `/terms`;
- `/privacy`;
- `/cookies`;
- signup com verificação de e-mail;
- recuperação de senha, convite e consentimento versionado;
- política de retenção e canal de solicitações LGPD.

O modelo de dados deve suportar versão aceita de termos/política, timestamp, finalidade/base legal, exportação, anonimização/exclusão, jobs assíncronos e auditoria. Também devem ser documentados controlador/operador, suboperadores, WhatsApp/Meta/Baileys, provedor de IA, storage, e-mail e pagamentos.

## Ordem de execução aprovada

1. Corrigir retorno do console, workspace suspenso, guards e `/kanban`.
2. Corrigir billing/quotes tenant-aware e criar testes negativos.
3. Fazer QR/Conexão WhatsApp funcionar no Docker real.
4. Corrigir contrato de KPIs, unread, status, estágio e atualização cross-screen.
5. Corrigir mobile, scroll, destaque de rota, acessibilidade e performance.
6. Criar tickets/kanban de suporte.
7. Criar catálogo de serviços com preço fixo/a partir/orçamento.
8. Criar assinatura/consumo com planos em modo sandbox/teste.
9. Implementar governança LGPD e documentos públicos.
10. Só depois abrir landing, signup e ampliar o beta.

## Auditoria de lançamento

O beta não deve avançar para novos convites enquanto P0 não estiver fechado e os seguintes gates não tiverem evidência em staging: dois workspaces isolados, QR/inbound/outbound com número de teste, backup/restore, suporte administrativo com auditoria, billing sandbox sem cruzamento de tenant, mobile crítico validado e consentimento/documentos públicos definidos.


---
## Registro de execução — P0 concluído

O primeiro bloco foi implementado no commit desta etapa. O console administrativo não retorna mais para `/dashboard`; a sessão de suporte pode ser iniciada para workspaces suspensos; a rota `/kanban` foi registrada; e billing/quotes deixou de depender do workspace demo nos procedimentos tenant-aware.

A validação local passou em `pnpm check`, `pnpm build` e nos 62 testes executáveis. O build ainda emite o alerta de bundle acima de 500 kB, que permanece corretamente no P1 de performance. Trinta e um testes continuam skipped porque o sandbox atual não tem `DATABASE_URL`; portanto a prova definitiva de isolamento, suspensão e billing entre dois tenants continua sendo gate de staging.

### Próximo bloco imediato

Adicionar/ativar testes PostgreSQL para: (a) platform-only abrir workspace suspenso, sair e reativar; (b) operador de workspace A não ler nem mutar quotes de B; (c) manager versus agent no billing; e (d) smoke browser de todas as rotas da sidebar. Em seguida iniciar o P1.1 de QR/Conexão WhatsApp.
