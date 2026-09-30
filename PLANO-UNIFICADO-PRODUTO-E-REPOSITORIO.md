# Plano Único de Consolidação do Forte Panel

## Decisão principal

A aplicação não deve ser unificada em um único arquivo ou em uma única tela. Isso aumentaria o acoplamento, dificultaria testes e tornaria qualquer alteração perigosa.

A unificação correta é:

1. **uma visão única de produto**;
2. **uma arquitetura de navegação coerente**;
3. **um sistema visual compartilhado**;
4. **uma fonte canónica de regras de negócio**;
5. **um conjunto pequeno de módulos de código bem definidos**;
6. **documentação consolidada e claramente separada entre atual, histórico e descartada**.

O objetivo é preservar as funcionalidades reais e eliminar duplicação, ideias abandonadas e caminhos que já não representam o produto.

---

# 1. O que deve ser consolidado

## 1.1 Produto

A aplicação tem quatro áreas principais:

### A. Operação do workspace

- Dashboard;
- Inbox de WhatsApp;
- contatos e grupos;
- Kanban de atendimento;
- agenda;
- orçamentos, pagamentos e billing;
- instâncias WhatsApp;
- onboarding;
- configurações de empresa, equipe, serviços e permissões.

### B. Inteligência operacional

- agente nativo;
- IA ativa/pausada por contato;
- prompt global;
- prompt por instância;
- conexões de providers;
- simulação controlada;
- transcrição, análise de imagem e documentos;
- guardrails e ações autorizadas.

### C. Console Admin da plataforma

- Overview;
- Kanban de Workspaces;
- workspaces e sessões de suporte;
- instâncias de suporte;
- Inbox de suporte;
- IA global;
- Prompts por instância;
- auditoria;
- notas operacionais;
- saúde de canais, workers, filas e providers.

### D. Infraestrutura operacional

- gateway WhatsApp;
- worker;
- filas de saída;
- heartbeats;
- webhooks;
- migrations;
- auditoria;
- armazenamento de configurações e segredos.

Estas quatro áreas devem permanecer distintas, mas usar os mesmos padrões de interface, autorização, feedback e auditoria.

---

# 2. O que não deve ser unificado

## 2.1 Não transformar tudo num monólito de código

Não juntar `PanelPages.tsx`, páginas do Console Admin, routers e serviços num ficheiro único. A separação atual contém domínios diferentes e deve ser melhorada, não eliminada.

## 2.2 Não misturar Console Admin com workspace cliente

O Console Admin tem:

- identidade visual própria;
- permissões próprias;
- `platformAdmins`;
- sessões de suporte;
- auditoria global;
- acesso a vários workspaces.

O workspace cliente tem:

- utilizadores e membros;
- permissões do tenant;
- dados de contatos e conversas;
- operações específicas da empresa.

Misturar estes contextos é um risco de segurança e de experiência.

## 2.3 Não unificar todos os status

Cada domínio deve manter os seus próprios estados:

- workspace: `onboarding`, `active`, `suspended`;
- saúde: `healthy`, `degraded`, `stale`, `unknown`;
- conexão: `connected`, `ready`, `disconnected`, `idle`;
- mensagens: `received`, `queued`, `processing`, `sent`, `failed`;
- prompt: `draft`, `published`, `archived`;
- sessão: `read_only`, `operator`, `expired`, `revoked`.

O design pode apresentar todos com o mesmo componente `StatusBadge`, mas o modelo de negócio não deve ser artificialmente fundido.

---

# 3. Critério para separar bom, obsoleto e ruído

Cada ficheiro, ideia ou funcionalidade deve ser classificado numa destas categorias.

## 3.1 Canónico / manter

Manter quando:

- existe uso real no código;
- tem rota, router ou tabela ativa;
- representa uma regra de negócio atual;
- possui integração funcional;
- é coberto por fluxo operacional importante;
- está alinhado com o produto atual.

## 3.2 Consolidar / refatorar

Não apagar imediatamente quando:

- existem duas implementações da mesma ideia;
- a função está espalhada por vários ficheiros;
- o comportamento é válido, mas a interface está duplicada;
- há uma versão antiga e uma versão mais completa;
- há documentação válida distribuída em vários handoffs.

Neste caso, escolher uma implementação canónica, migrar referências e só depois remover o duplicado.

## 3.3 Histórico / arquivar

Mover para uma área de histórico quando:

- explica uma decisão anterior;
- regista um smoke test ou handoff concluído;
- é útil para auditoria humana;
- não deve orientar novas implementações.

Sugestão:

```text
/docs/
  README.md                 # entrada canónica
  produto.md                # visão atual
  arquitetura.md            # arquitetura atual
  regras-de-negocio.md      # regras atuais
  ux-e-interface.md         # sistema visual
  operacao.md               # deploy, workers, gateway e migrations
  historico/
    handoffs/
    decisoes/
    smoke-tests/
```

## 3.4 Candidato a remover

Remover apenas depois de confirmar que:

- não é importado;
- não é referenciado em scripts, rotas ou migrations;
- não é necessário para deploy;
- não contém uma regra que ainda não foi migrada;
- não é um artefacto de configuração usado por ferramenta externa.

## 3.5 Ideia / backlog

Ideias válidas mas não implementadas não devem ficar misturadas com a documentação atual. Devem ir para:

```text
/docs/backlog/
  exploracoes.md
  ideias-de-ux.md
  futuros-fluxos.md
```

Cada ideia deve ter estado:

- proposta;
- selecionada;
- em implementação;
- implementada;
- rejeitada;
- substituída.

---

# 4. Estrutura canónica recomendada

## 4.1 Código

A organização ideal deve seguir domínio e responsabilidade, não apenas tipo de ficheiro.

```text
client/src/
  app/
    App.tsx
    routes.tsx
    providers.tsx
  components/
    ui/
      Button.tsx
      Card.tsx
      Badge.tsx
      Tabs.tsx
      Drawer.tsx
      Modal.tsx
      DataTable.tsx
      EmptyState.tsx
      LoadingState.tsx
      FilterBar.tsx
    layout/
      AppShell.tsx
      Sidebar.tsx
      PageHeader.tsx
  features/
    inbox/
    contacts/
    kanban/
    agenda/
    billing/
    whatsapp/
    onboarding/
    settings/
    dashboard/
    platform-admin/
  styles/
    tokens.css
    components.css
    utilities.css

server/
  _core/
  domains/
    inbox/
    contacts/
    agenda/
    billing/
    whatsapp/
    onboarding/
    ai/
    platform-admin/
  routers/
    app-router.ts
    platform-router.ts
  services/
    audit-service.ts
    health-service.ts
    session-service.ts
    prompt-service.ts
  repositories/
  schemas/
  workers/
```

A migração pode ser gradual. Não é necessário mover todo o código de uma vez.

## 4.2 Regra de ownership

Cada domínio deve possuir:

- tipos de entrada e saída;
- validação;
- procedures/routers;
- serviço de negócio;
- componentes de interface;
- estados de loading, vazio e erro;
- auditoria quando aplicável.

O objetivo é evitar que uma página conheça detalhes de banco, gateway e regras de autorização ao mesmo tempo.

---

# 5. Produto unificado: navegação final

## Workspace cliente

```text
Operação
  Dashboard
  Inbox
  Kanban
  Agenda

Relacionamento
  Contatos
  Grupos
  Orçamentos
  Pagamentos

Configuração
  WhatsApp
  Equipe
  Serviços
  Permissões
  Configurações

Inteligência
  IA e prompts
  Histórico do agente
```

## Console Admin

```text
Plataforma
  Overview
  Workspaces
  Saúde operacional

Suporte
  Sessões
  Instâncias de suporte
  Inbox de suporte

Inteligência global
  Conexões de IA
  Prompts por instância
  Simulações

Governança
  Auditoria
  Notas operacionais
```

O menu não precisa criar uma entrada para cada tabela ou função. Funções relacionadas devem ficar dentro de um contexto com Tabs, Drawers ou ações contextuais.

---

# 6. Funcionalidades escolhidas como núcleo do produto

## Núcleo 1 — Conversa e atendimento

Prioridade máxima:

- Inbox;
- envio de texto, mídia e mensagens interativas;
- identificação da instância de envio;
- IA ativa/pausada;
- ficha do contato;
- histórico e notas;
- filtros por instância, etapa, unread e tipo de conversa.

## Núcleo 2 — Operação comercial

- Kanban de contatos;
- etapas;
- responsáveis;
- urgência;
- serviços;
- orçamentos;
- agenda;
- pagamentos.

## Núcleo 3 — Conectividade

- instâncias WhatsApp;
- QR e pairing code;
- status e saúde;
- erros recentes;
- reconexão e desconexão;
- filtro por instância.

## Núcleo 4 — IA controlada

- provider por capability;
- prompt global;
- prompt efetivo por instância;
- simulação sem disparo externo quando o modo não permitir;
- versões, publicação e rollback;
- auditoria.

## Núcleo 5 — Administração segura

- Console Admin separado;
- sessões read-only/operator;
- permissões explícitas;
- motivos obrigatórios;
- auditoria before/after;
- proteção do workspace interno;
- status real de workspaces e saúde operacional.

Estas são as melhores ideias porque já estão ligadas a fluxos reais, dados, routers ou regras de segurança. Ideias que não se ligam a um destes núcleos devem permanecer no backlog até demonstrarem valor.

---

# 7. Plano de limpeza do repositório

## Fase 0 — Congelar o estado atual

Antes de remover qualquer coisa:

1. garantir que o checkout está limpo ou separar alterações locais;
2. criar uma branch de consolidação;
3. registar o commit de referência;
4. executar apenas os checks já aceites pelo projeto;
5. guardar uma lista de ficheiros e diretórios existentes.

Não apagar durante esta fase.

## Fase 1 — Inventário automático

Gerar uma tabela com:

- caminho;
- extensão;
- tamanho;
- última alteração;
- imports/referências;
- rota ou script associado;
- categoria: código, teste, migration, documentação, artefacto ou configuração.

Comandos úteis:

```bash
find . -not -path './node_modules/*' -not -path './.git/*' -type f
rg -n "from |import |require\(|router|route|migration|script" client server forte-whatsapp drizzle-pg
```

## Fase 2 — Classificação humana

Criar uma matriz:

| Ficheiro | Domínio | Usado? | Canónico? | Ação |
|---|---|---:|---:|---|
| página/serviço | inbox | sim | sim | manter/refatorar |
| documento | histórico | não | não | arquivar |
| componente duplicado | UI | sim | não | consolidar |
| artefacto temporário | nenhum | não | não | remover após confirmar |

## Fase 3 — Consolidar documentação

Manter somente um ponto de entrada:

- `README.md` para executar e entender o projeto;
- `docs/produto.md` para o produto;
- `docs/regras-de-negocio.md` para regras;
- `docs/arquitetura.md` para módulos e fluxo técnico;
- `docs/ux-e-interface.md` para o design;
- `docs/operacao.md` para gateway, worker, migrations e deploy;
- `docs/historico/` para handoffs antigos;
- `docs/backlog/` para ideias não implementadas.

Os handoffs não devem continuar no nível raiz como se fossem documentação atual.

## Fase 4 — Consolidar UI

Criar o sistema visual base e migrar progressivamente:

1. tokens;
2. App Shell;
3. componentes base;
4. Dashboard;
5. Inbox;
6. Kanban;
7. Agenda;
8. configurações;
9. Console Admin.

Não apagar a UI antiga até cada fluxo ter uma rota substituta validada.

## Fase 5 — Consolidar backend

- separar router de serviço de negócio;
- centralizar autorização;
- centralizar auditoria;
- reutilizar schemas de input;
- remover consultas duplicadas;
- nomear claramente operações de plataforma versus tenant;
- preservar os contratos existentes até a migração do frontend terminar.

## Fase 6 — Remover obsoletos

Só depois de:

- `rg` não encontrar referências;
- build passar;
- typecheck passar;
- migrations estarem no journal correto;
- rotas antigas não estarem registradas;
- documentação atual não apontar para os ficheiros removidos.

---

# 8. Estratégia de decisão para ideias existentes

Cada ideia deve responder a cinco perguntas:

1. resolve uma dor real de operação?
2. tem relação com um dos cinco núcleos do produto?
3. pode ser implementada sem duplicar uma função existente?
4. tem regra de autorização clara?
5. consegue ser representada com os componentes visuais já definidos?

## Manter agora

- Inbox robusto;
- Kanban de contatos;
- Agenda;
- WhatsApp e instâncias;
- IA e prompts efetivos;
- Console Admin completo;
- auditoria;
- onboarding.

## Manter no backlog

- Canvas editável de fluxos;
- command palette completa;
- automações avançadas;
- editor visual de roteamento;
- relatórios avançados;
- novas integrações ainda sem fluxo operacional claro.

## Não priorizar

- duplicar dashboards;
- criar uma página para cada pequena configuração;
- misturar status de domínios diferentes;
- criar editores visuais antes de estabilizar os dados e os contratos;
- manter documentos que contradizem o código atual.

---

# 9. O plano único de construção

## Etapa A — Reconhecimento e limpeza segura

- inventariar ficheiros;
- classificar documentação;
- localizar duplicações;
- definir ficheiros canónicos;
- não remover código ainda.

## Etapa B — Design system

- tokens;
- App Shell;
- cards;
- badges;
- tabs;
- filters;
- tabelas;
- kanban;
- drawers;
- modais;
- estados.

## Etapa C — Reconstrução dos fluxos principais

1. Inbox;
2. Dashboard;
3. Kanban de contactos;
4. Agenda;
5. Contatos;
6. WhatsApp;
7. Onboarding;
8. Billing;
9. Configurações.

## Etapa D — Consolidação do Console Admin

1. Overview e Kanban de Workspaces;
2. detalhe e sessões;
3. instâncias de suporte;
4. Inbox de suporte;
5. IA global;
6. prompts por instância;
7. auditoria;
8. canvas operacional de diagnóstico.

## Etapa E — Limpeza definitiva

- arquivar handoffs;
- remover componentes sem referências;
- remover rotas antigas;
- remover schemas duplicados;
- consolidar scripts;
- atualizar README e documentação canónica;
- confirmar build e typecheck.

---

# 10. Próximo passo recomendado

O próximo passo não é apagar ficheiros imediatamente. É fazer uma **auditoria do repositório inteiro**, sem limitar a documentação, e gerar a matriz:

```text
ficheiro → domínio → usado? → duplicado? → regra atual? → destino
```

A auditoria deve cobrir:

- `client/src`;
- `server`;
- `forte-whatsapp`;
- `drizzle` e `drizzle-pg`;
- scripts;
- configurações;
- testes existentes;
- documentação;
- artefactos temporários.

Depois disso será possível remover o obsoleto sem destruir uma regra de negócio escondida num ficheiro antigo.

A primeira entrega concreta deve ser a matriz de inventário e uma proposta de árvore final do repositório. Só depois começa a remoção e a migração visual.
