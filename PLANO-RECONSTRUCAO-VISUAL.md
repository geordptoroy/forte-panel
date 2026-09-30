# Plano de Reconstrução Visual do Forte Panel

## Contexto e objetivo

Este plano parte exclusivamente das funcionalidades já identificadas na aplicação:

- Dashboard operacional;
- Inbox de conversas WhatsApp;
- contatos, grupos e perfil do contato;
- Kanban de contactos e etapas comerciais;
- agenda e compromissos;
- orçamentos, pagamentos e billing;
- conexão WhatsApp/Baileys e instâncias;
- onboarding da empresa;
- configurações de equipe, serviços e permissões;
- Console Admin da plataforma;
- gestão de workspaces clientes;
- sessões de suporte read-only/operator;
- instâncias WhatsApp do suporte;
- Inbox de suporte;
- IA global, conexões de providers e prompts;
- prompts por instância;
- simulação controlada do agente;
- auditoria e notas operacionais.

O objetivo não é apenas trocar cores. É **reorganizar a densidade de informação**, separar níveis de decisão e dar a cada ecrã uma estrutura visual coerente.

---

# Parte 1 — Mapeamento de formatos de visualização

A seguir estão 24 formatos de organização visual. Cada um inclui o nome técnico em português/inglês, o comportamento visual e uma aplicação específica no Forte Panel.

## 1. Kanban / Kanban Board

**Como funciona:** cartões arrastáveis são distribuídos em colunas que representam estados ou etapas. Cada cartão contém apenas o resumo necessário para decidir o próximo movimento.

**Aplicação no Forte Panel:**

- `KanbanPage`: contactos agrupados por estágio comercial, como novo, em atendimento, orçamento e concluído;
- Console Admin: workspaces em Onboarding, Ativos e Suspensos;
- futuro Kanban de instâncias WhatsApp: pareamento, conectada, desconectada e com erro;
- cada card deve ter ações rápidas, mas não carregar todos os detalhes do registro.

## 2. Canvas de Fluxo / Flow Canvas

**Como funciona:** nós e conexões representam relações, dependências ou o caminho de uma operação. O utilizador navega visualmente pela arquitetura em vez de ler uma lista linear.

**Aplicação no Forte Panel:**

- Console Admin: `Workspace → Canal → Instância → Inbox → Prompt → Provider → Auditoria`;
- onboarding: visualização dos passos identidade, oferta, operações, guardrails, voz e publicação;
- IA: ligação entre capacidade, provider, modelo e prompt;
- o canvas deve começar como diagnóstico, não como editor livre.

## 3. Grid de Cartões / Card Grid / Gallery

**Como funciona:** entidades são exibidas em cartões uniformes, distribuídos em uma grelha responsiva. Cada cartão mostra título, estado, métrica principal e uma ação.

**Aplicação no Forte Panel:**

- Dashboard com métricas de contatos, agenda, orçamentos e recebimentos;
- lista de workspaces do Console Admin;
- conexões de IA por capacidade;
- instâncias WhatsApp com status, telefone, último heartbeat e prompt associado.

## 4. Tree View / Árvore Hierárquica

**Como funciona:** informação pai-filho é exibida com níveis de indentação e expansão progressiva.

**Aplicação no Forte Panel:**

- Console Admin: plataforma → workspaces → canais → instâncias;
- configurações da empresa: equipe → profissionais → serviços;
- permissões: workspace → perfil → capacidades permitidas;
- auditoria agrupada por workspace e por operação.

## 5. Split Screen / Ecrã Dividido

**Como funciona:** duas áreas persistentes ocupam o mesmo ecrã. A coluna esquerda escolhe o contexto e a direita mostra os detalhes.

**Aplicação no Forte Panel:**

- Inbox: lista de conversas à esquerda, conversa ao centro e ficha do contato à direita;
- Inbox de suporte: contatos à esquerda, thread ao centro e metadata da instância à direita;
- Console Admin: workspaces à esquerda e detalhe operacional à direita quando a sessão estiver aberta.

## 6. Master-Detail / Lista e Detalhe

**Como funciona:** uma lista de entidades controla um painel de detalhe. O utilizador não precisa abandonar o contexto para consultar ou editar.

**Aplicação no Forte Panel:**

- contatos → dados cadastrais, notas, estágio, orçamento e histórico;
- workspaces → owner, membros, saúde, IA, notas e auditoria;
- instâncias WhatsApp → status, QR/código, prompts vinculados e Inbox filtrado.

## 7. Bento Grid / Bento Dashboard

**Como funciona:** módulos de tamanhos diferentes formam uma composição modular. Indicadores importantes ganham áreas maiores; informações secundárias ficam em módulos menores.

**Aplicação no Forte Panel:**

- Dashboard principal: uma área grande para “Aguardando resposta”, módulos menores para IA pausada, urgências, agenda e faturamento;
- Overview do Console Admin: módulo de saúde, módulo de quotas, módulo de falhas e módulo de workspaces em atenção;
- evitar que todos os cards tenham o mesmo peso visual.

## 8. Tabela Densa / Data Table

**Como funciona:** linhas e colunas apresentam grande volume de dados comparáveis, com ordenação, filtros e ações por linha.

**Aplicação no Forte Panel:**

- lista de workspaces quando o operador precisa comparar plano, owner, saúde e uso;
- auditoria;
- membros da equipe;
- conexões de IA;
- pagamentos e orçamentos.

A tabela deve ser usada para comparação, não como layout universal.

## 9. Tabela com Colunas Fixas / Frozen-Column Table

**Como funciona:** a coluna identificadora e/ou as ações permanecem visíveis enquanto as colunas de métricas fazem scroll horizontal.

**Aplicação no Forte Panel:**

- workspaces com múltiplas métricas de utilização;
- lista de contatos com telefone, etapa, última interação, IA, orçamento e responsável;
- auditoria com timestamp, actor, ação, escopo e resultado.

## 10. Timeline / Linha do Tempo

**Como funciona:** eventos aparecem em sequência temporal, com marcador, timestamp, ator e descrição curta.

**Aplicação no Forte Panel:**

- histórico de conversa;
- auditoria de workspace;
- versões de prompts: draft, publicado, arquivado e rollback;
- timeline de onboarding;
- sequência de pairing, conexão, falha e recuperação de uma instância.

## 11. Activity Feed / Feed de Atividade

**Como funciona:** eventos recentes são apresentados como uma lista curta e atualizada, priorizando recência e relevância.

**Aplicação no Forte Panel:**

- Dashboard: eventos recentes do CRM;
- Console Admin: falhas recentes, mudanças de status, criação de sessões e ações operacionais;
- suporte: últimas ações sobre um workspace.

## 12. Stepper / Wizard / Fluxo por Etapas

**Como funciona:** divide uma configuração longa em passos sequenciais, mostrando etapa atual, etapas concluídas e próximas etapas.

**Aplicação no Forte Panel:**

- onboarding da empresa;
- configuração de conexão WhatsApp;
- criação de conexão de IA;
- publicação de prompt;
- abertura de sessão de suporte com seleção de modo e validade.

## 13. Tabs / Separadores

**Como funciona:** divide um mesmo contexto em painéis mutuamente exclusivos, evitando páginas longas.

**Aplicação no Forte Panel:**

- detalhe do workspace: resumo, suporte, agente e auditoria;
- configurações: identidade, equipe, serviços, WhatsApp e permissões;
- detalhe do contato: ficha, conversa, notas e orçamento;
- Console Admin: visão geral, workspaces, IA, suporte e auditoria.

Tabs devem separar contextos relacionados, não esconder ações essenciais.

## 14. Accordion / Acordeão

**Como funciona:** secções expandíveis mostram detalhes apenas quando necessário.

**Aplicação no Forte Panel:**

- configurações avançadas de uma instância WhatsApp;
- provider de IA: URL, modelo, capabilities e estado de teste;
- regras de guardrails e respostas aprovadas;
- detalhes de uma entrada de auditoria;
- payload técnico de uma mensagem interativa.

## 15. Drawer / Painel Lateral

**Como funciona:** detalhe ou edição abre lateralmente sem abandonar a lista principal.

**Aplicação no Forte Panel:**

- ficha rápida do contato no Inbox;
- edição de nome e notas;
- configuração rápida de instância;
- detalhes de auditoria;
- painel de filtros avançados.

## 16. Modal de Confirmação / Confirmation Modal

**Como funciona:** interrompe uma ação importante para pedir contexto, confirmação ou motivo. Deve ser reservado para ações de impacto.

**Aplicação no Forte Panel:**

- suspender ou reativar workspace;
- apagar dados operacionais;
- revogar sessão de suporte;
- desconectar/logout de instância;
- publicar ou fazer rollback de prompt;
- toda ação mutável do Console Admin deve pedir motivo quando isso já for regra de negócio.

## 17. Command Palette / Paleta de Comandos

**Como funciona:** um atalho de teclado abre busca de ações e entidades, permitindo navegar sem percorrer menus.

**Aplicação no Forte Panel:**

- procurar workspace, contato, instância ou auditoria;
- “abrir Inbox do contato”;
- “abrir sessão read-only”; 
- “ir para prompts da instância”; 
- “pausar IA nesta conversa”.

Deve respeitar permissões e nunca executar ação destrutiva sem confirmação.

## 18. Filter Bar / Barra de Filtros Contextual

**Como funciona:** filtros ficam visíveis junto ao conteúdo, com chips ativos, busca e limpeza rápida.

**Aplicação no Forte Panel:**

- Inbox: instância, tipo de conversa, grupo/individual, IA ativa/pausada;
- auditoria: workspace, ação, actor e intervalo temporal;
- workspaces: status, plano, saúde e quota;
- billing: estado do orçamento e pagamento.

## 19. Faceted Search / Pesquisa Facetada

**Como funciona:** a busca é combinada com facetas selecionáveis e contadores por categoria.

**Aplicação no Forte Panel:**

- localizar workspaces com “canal degradado + plano business + quota alta”;
- localizar contatos “sem resposta + urgência alta + IA pausada”;
- encontrar auditoria de uma instância e ação específica.

## 20. Status Board / Painel de Saúde

**Como funciona:** organiza indicadores em estados operacionais: saudável, atenção, degradado, desconhecido.

**Aplicação no Forte Panel:**

- saúde de canal, worker, fila de saída e provider;
- status de instâncias Baileys;
- estado do agente: ativo, pausado, prompt global ou prompt por instância;
- overview do Console Admin.

## 21. Metric Cards / Cartões de Métricas

**Como funciona:** cada cartão mostra um número principal, label, comparação ou explicação curta e tendência/estado.

**Aplicação no Forte Panel:**

- Dashboard: novos contatos, aguardando resposta, IA pausada, urgências, orçamento, agenda e recebido;
- Console Admin: contas, ativas, quotas e sinais degradados;
- workspace: membros, canais, fila, falhas e status da IA.

## 22. Progressive Disclosure / Divulgação Progressiva

**Como funciona:** o primeiro nível mostra decisão e ação; detalhes técnicos aparecem somente quando o utilizador pede.

**Aplicação no Forte Panel:**

- card de conexão mostra nome, provider, modelo e estado; API key mascarada e configuração avançada ficam no detalhe;
- Inbox mostra mensagem e estado; metadata técnica fica em accordion;
- prompts mostram estado e versão; diff completo fica em painel secundário.

## 23. Empty State Orientado à Ação / Actionable Empty State

**Como funciona:** quando não há dados, o espaço vazio explica o motivo e oferece a ação seguinte.

**Aplicação no Forte Panel:**

- sem instância WhatsApp: “Criar instância” ou “Configurar conexão”;
- sem contatos: “Aguardar primeira conversa”;
- sem provider: “Adicionar conexão de IA”;
- sem auditoria: explicar que os eventos aparecerão após a primeira operação.

## 24. Contextual Action Bar / Barra de Ações Contextuais

**Como funciona:** ações aparecem conforme a seleção atual, em vez de ficarem espalhadas pelo ecrã.

**Aplicação no Forte Panel:**

- selecionar vários contatos para alterar etapa ou marcar leitura;
- selecionar uma instância para abrir Inbox, prompts, QR ou desconexão;
- selecionar um workspace para suporte, auditoria ou detalhe;
- selecionar uma versão de prompt para publicar ou fazer rollback.

---

# Parte 2 — Técnicas de separação de informação

## 1. Espaço em branco / White Space

O layout atual concentra informação em tabelas, cards e blocos muito próximos. O espaço vazio deve ser usado como ferramenta de hierarquia, não como desperdício.

### Regras práticas

- usar um espaçamento vertical consistente entre blocos: 8, 12, 16, 24 e 32 px;
- separar título/descrição de conteúdo pelo menos 16 px;
- separar grupos de dados dentro de um card por linhas e não por novas bordas em excesso;
- manter uma largura máxima de leitura para prompts, notas e descrições;
- deixar a ação principal isolada no topo ou rodapé do bloco;
- evitar que uma tabela, um banner e um formulário comecem todos no mesmo alinhamento sem respiro;
- usar espaço maior antes de uma nova decisão, como “Detalhe do workspace”, “Auditoria” ou “Zona perigosa”.

### Aplicação por ecrã

- **Dashboard:** mais espaço entre métricas e blocos de atividade; o primeiro viewport deve mostrar só prioridades;
- **Inbox:** reduzir elementos no composer e dar altura real ao histórico;
- **Console Admin:** separar operação visual, tabela, suporte e auditoria em secções distintas;
- **Onboarding:** uma pergunta principal por etapa, em vez de vários campos simultâneos;
- **Prompts:** editor amplo, preview separado e ações de publicação agrupadas.

## 2. Cartões, contornos e sombras suaves

Cards devem agrupar um conjunto coerente, não servir como moldura para tudo.

### Hierarquia recomendada

- **surface principal:** bloco de página ou painel;
- **card de domínio:** contatos, instância, provider, prompt ou workspace;
- **subcard técnico:** metadata, quota, histórico ou payload;
- **alert card:** erro, degradação, quota ou ação perigosa.

### Regras visuais

- usar bordas discretas, nunca várias caixas fortes aninhadas;
- usar sombra muito suave somente para modais, drawers e elementos flutuantes;
- usar cor de fundo para separar camadas, não para colorir cada informação;
- reservar verde para saudável/ativo, amber para atenção e vermelho para falha/perigo;
- não usar a mesma aparência para informação neutra e ação destrutiva;
- card clicável deve ter hover e foco; card apenas informativo não deve parecer botão.

### Aplicação

- **Workspace:** hero card com identidade e status; cards menores para saúde, uso e membros;
- **Instância:** card de conexão, card de pareamento, card de prompt e card de ações;
- **IA:** card por capability, com provider, modelo, estado e teste;
- **Contato:** card de resumo no drawer e blocos separados para notas, orçamento e dados pessoais.

## 3. Tabs

Tabs devem conter áreas do mesmo nível de importância e do mesmo objeto.

### Uso correto

- manter a tab ativa claramente marcada;
- não esconder uma ação urgente em tab secundária;
- preservar o estado da tab quando possível;
- usar no máximo 4 a 6 tabs visíveis antes de usar overflow;
- indicar contagens importantes, como mensagens não lidas ou falhas.

### Aplicação

- workspace: **Resumo / Suporte / Agente / Auditoria**;
- conexão de IA: **Configuração / Roteamento / Histórico de testes**;
- instância: **Conexão / Inbox / Prompt / Saúde**;
- contato: **Conversa / Ficha / Notas / Orçamento**.

## 4. Acordeões

Acordeões devem esconder detalhes secundários e técnicos, não a ação principal.

### Aplicação

- “Ver detalhes técnicos” em provider;
- “Payload completo” em mensagens interativas;
- “Histórico de mudanças” em prompts;
- “Métricas de uso” no workspace;
- “Configuração avançada” na instância WhatsApp.

O cabeçalho do acordeão precisa resumir o conteúdo fechado, por exemplo: “3 falhas recentes”, “API configurada”, “Prompt global v4”.

## 5. Modais e drawers

### Modal

Usar para confirmação e operações com impacto:

- suspender workspace;
- desconectar instância;
- publicar prompt;
- apagar dados;
- revogar sessão.

O modal deve conter: objeto afetado, consequência, motivo, ação principal e cancelamento.

### Drawer

Usar para consulta e edição contextual:

- ficha do contato;
- detalhe da instância;
- auditoria de um evento;
- edição de uma nota;
- filtros avançados.

A regra é simples: **modal interrompe; drawer acompanha**.

## 6. Tipografia e densidade

- um título de página;
- um subtítulo de contexto;
- títulos de secção curtos;
- labels em uppercase apenas para metadados e eyebrow;
- texto de ação sempre legível, sem depender apenas de ícones;
- usar `font-size` menor para metadata, não para conteúdo operacional importante;
- evitar tabelas com 8 ou mais colunas quando um card ou detalhe resolver melhor.

## 7. Estados de interface

Todo componente novo deve ter quatro estados explícitos:

1. loading;
2. sucesso com dados;
3. vazio acionável;
4. erro recuperável.

Para mutações, acrescentar:

- pending;
- sucesso com confirmação visível;
- falha sem apagar o conteúdo preenchido;
- auditoria quando a regra de negócio exigir.

---

# Parte 3 — Proposta prática de aplicação

## 1. Dashboard principal do workspace

### Composição

**Bento Grid + Metric Cards + Activity Feed + Timeline curta**

```text
[ Novos contatos ] [ Aguardando resposta / maior ] [ IA pausada ]
[ Urgências       ] [ Agenda de hoje       ] [ Orçamentos ]

[ Feed de atividade recente          ] [ Próximos horários ]
[ eventos de CRM, Inbox e agenda    ] [ timeline curta    ]
```

### Comportamento

- “Aguardando resposta” deve ser o módulo de maior destaque;
- cada métrica abre o ecrã já filtrado;
- o feed mostra apenas os eventos mais recentes, com “ver tudo”;
- o bloco de agenda mostra próximos compromissos, não a agenda inteira;
- alertas de IA pausada e urgências devem ter tratamento visual distinto.

## 2. Inbox do workspace

### Composição

**Split Screen + Master-Detail + Filter Bar + Drawer de perfil**

```text
[ Filtros e busca ]

[ Lista de conversas ] [ Thread da conversa                  ] [ Ficha ]
[ contato, etapa,     ] [ mensagens, mídia, interações        ] [ dados  ]
[ não lidas, IA       ] [ composer e instância de envio       ] [ notas  ]
```

### Regras

- a lista deve ser mais estreita e mostrar apenas decisão: nome, preview, tempo, unread e IA;
- a thread deve ter o maior espaço do ecrã;
- o perfil do contato deve ser Drawer em telas menores;
- botões/listas/enquetes/carrosséis devem abrir um editor secundário no composer;
- a instância selecionada para envio deve ficar visível junto ao composer;
- metadata técnica deve ficar em accordion dentro da mensagem;
- ações de IA, marcação de leitura e anexos devem ficar em barras compactas.

## 3. Kanban de contactos

### Composição

**Kanban + Filter Bar + Card compacto + Drawer de contato**

```text
[ Busca ] [ filtros ] [ responsável ] [ período ]

[ Novo ] [ Em atendimento ] [ Orçamento ] [ Agendado ] [ Concluído ]
[card  ] [card           ] [card      ] [card     ] [card      ]
```

### Conteúdo mínimo do card

- nome;
- última interação;
- urgência;
- serviço;
- responsável;
- indicador de IA;
- valor do orçamento quando houver.

Detalhes como notas, telefone e histórico devem abrir no Drawer, não ocupar o card.

## 4. Agenda

### Composição

**Calendar Grid + Day Timeline + Side Panel**

```text
[ mês/semana/dia ] [ filtros de profissional ] [ criar ]

[ calendário principal                 ] [ detalhes do dia ]
[ blocos de agenda                     ] [ compromissos     ]
[ arrastar para reagendar              ] [ conflito/ações   ]
```

### Aplicação

- mês para visão geral;
- semana para operação;
- dia para execução;
- compromissos abrem em Drawer;
- conflitos aparecem como alerta inline;
- profissionais e serviços funcionam como filtros facetados.

## 5. Contatos

### Composição

**Data Table + Filter Bar + Bulk Action Bar + Detail Drawer**

```text
[ Busca ] [ etapa ] [ urgência ] [ IA ] [ responsável ]
[ seleção múltipla ] [ alterar etapa ] [ marcar lido ]

[ tabela comparável                               ]
[ nome | telefone | etapa | último contato | dono ]
```

### Aplicação

A tabela é adequada porque contatos precisam ser comparados. O Drawer mostra o registro completo sem levar o utilizador para outra página.

## 6. Billing / Orçamentos e pagamentos

### Composição

**Metric Cards + Status Board + Data Table + Detail Drawer**

```text
[ Pendentes ] [ Aprovados ] [ Sinal pendente ] [ Recebidos ]

[ tabela de orçamentos ] → [ drawer com itens, pagamento e histórico ]
```

### Aplicação

- cards para resumo financeiro;
- tabela para comparação;
- Drawer para lançamento e histórico;
- ações de pagamento devem pedir confirmação quando alterarem valores ou status.

## 7. Conexão WhatsApp

### Composição

**Stepper + Status Board + Card de instância + Modal de pairing**

```text
[ Canal ] → [ Instância ] → [ QR/código ] → [ Conectado ] → [ Saúde ]

[ status geral ] [ instâncias ] [ ações de conectar/desconectar ]
```

### Aplicação

- uma conexão deve ter caminho orientado;
- QR e código de pareamento ficam em modal;
- cada instância mostra status, último erro, ações e link para Inbox filtrado;
- não misturar setup inicial com manutenção avançada.

## 8. Onboarding

### Composição

**Stepper + Form Card + Preview Card + Progress Summary**

```text
[1 Identidade] [2 Oferta] [3 Operações] [4 Guardrails] [5 Voz] [6 Publicação]

[ formulário da etapa ] [ resumo do que já foi definido ]
```

### Aplicação

- uma decisão principal por etapa;
- respostas estruturadas aparecem num preview;
- conflitos e propostas da IA ficam numa área de revisão;
- publicação final deve ser uma etapa própria e explícita.

## 9. Configurações da empresa

### Composição

**Tree View lateral + Tabs ou Form Sections à direita**

```text
[ Identidade       ] [ formulário da secção selecionada ]
[ Equipe           ] [ preview / validações             ]
[ Serviços         ] [ ações de salvar                  ]
[ WhatsApp         ]
[ Permissões       ]
```

### Aplicação

A Tree View impede que identidade, equipe, catálogo e permissões formem uma página vertical interminável.

## 10. Console Admin — Overview

### Composição

**Bento Grid + Workspace Kanban + Health Board + Activity Feed**

```text
[ Contas ] [ Ativas ] [ Quota ] [ Degradadas ]

[ Kanban de workspaces                         ]
[ onboarding ] [ ativos ] [ suspensos ]         

[ Saúde de workers/canais ] [ Falhas recentes ]
```

### Aplicação

- o Kanban permite triagem operacional;
- o Health Board mostra canal, worker, fila e falhas;
- o feed mostra auditoria recente;
- a tabela permanece disponível para comparação detalhada, abaixo ou numa tab separada.

## 11. Console Admin — Workspaces

### Composição

**Master-Detail + Tabs + Session Banner + Timeline**

```text
[ busca/lista de workspaces ] [ resumo do workspace selecionado ]
                              [ Sessão read-only/operator       ]
                              [ Tabs: resumo | suporte | agente | auditoria ]
```

### Aplicação

- abrir detalhe não deve imediatamente expor mutações;
- a sessão deve estar sempre visível;
- ações mutáveis ficam agrupadas e indicam se a sessão é operator;
- auditoria deve ser uma Timeline filtrável, não uma tabela sem hierarquia.

## 12. Console Admin — Instâncias de suporte

### Composição

**Status Board + Card Grid + Detail Drawer + Stepper de pareamento**

```text
[ Conectadas ] [ Pareamento ] [ Desconectadas ] [ Erro ]

[ card da instância ] [ card da instância ] [ card da instância ]
```

Cada card deve oferecer:

- conectar;
- QR/código;
- desconectar;
- abrir Inbox;
- abrir Prompts;
- mostrar saúde e último erro.

## 13. Console Admin — Inbox de suporte

### Composição

**Split Screen + Instance Filter + Single Send Target + Structured Message Preview**

```text
[ contatos filtrados ] [ conversa ] [ contexto da instância ]

[ tipo de mensagem ] [ editor de botões/lista/enquete/carrossel ]
[ enviar pela instância X ] [ enviar ]
```

### Aplicação

- separar instância usada para filtrar histórico da instância usada para enviar;
- mostrar “Enviado por [instância]” na mensagem;
- payload técnico em accordion;
- não permitir envio sem instância explícita.

## 14. Console Admin — IA global

### Composição

**Capability Cards + Routing Matrix + Test Panel + Audit Timeline**

```text
[ WhatsApp ] [ Áudio ] [ Imagem ] [ Documento ] [ Admin Support ]

[ capability ] → [ provider ] → [ modelo ] → [ estado ]

[ teste controlado ] [ últimos testes ] [ erros ]
```

## 15. Console Admin — Prompts por instância

### Composição

**Instance List + Prompt Editor + Effective Config Preview + Version Timeline**

```text
[ instâncias ] [ editor do prompt efetivo ] [ preview/teste ]
                [ modelo, maxSteps, estado ]
```

### Aplicação

- selecionar instância à esquerda;
- diferenciar prompt global de binding por instância;
- mostrar versão e data;
- botão de teste junto ao prompt efetivo;
- publicação e rollback na Timeline de versões.

## 16. Console Admin — Auditoria

### Composição

**Filter Bar + Timeline/Activity Feed + Detail Drawer**

```text
[ workspace ] [ ação ] [ actor ] [ período ] [ resultado ]

[ timeline de eventos ] → [ drawer com before/after e motivo ]
```

A auditoria deve tornar claro: quem fez, o quê, em qual escopo, por qual motivo, quando e qual foi o resultado.

---

# Sistema visual recomendado

## Navegação

- sidebar persistente em desktop;
- navegação horizontal compacta em mobile;
- agrupamento por domínio: Operação, Conversas, Agenda, Financeiro, Configuração;
- no Console Admin, manter navegação separada da aplicação cliente.

## Hierarquia de cores

- neutro: informação e estrutura;
- verde: ativo, saudável, conectado, concluído;
- amber: atenção, pendência, quota próxima, pairing;
- vermelho: degradado, falha, suspenso, ação perigosa;
- azul: informação contextual e ação de diagnóstico.

## Componentes base que devem ser reconstruídos primeiro

1. App Shell e sidebar;
2. Page Header;
3. Tabs;
4. Metric Card;
5. Status Badge;
6. Filter Bar;
7. Data Table;
8. Card Grid;
9. Drawer;
10. Modal;
11. Empty State;
12. Loading State;
13. Toast e feedback de mutação;
14. Timeline;
15. Kanban Card e Kanban Column.

A reconstrução deve começar pelos componentes base para que Dashboard, Inbox, Kanban e Console Admin não ganhem estilos diferentes entre si.

---

# Ordem recomendada de reconstrução

## Fase 1 — Fundação visual

- tokens de espaçamento, cores, bordas e tipografia;
- App Shell;
- sidebar e Page Header;
- cards, buttons, inputs, tabs, badges e modais;
- estados loading/empty/error.

## Fase 2 — Ecrãs de maior uso

1. Inbox;
2. Dashboard;
3. Kanban de contatos;
4. Agenda;
5. Contatos.

## Fase 3 — Operação e configuração

1. WhatsApp/instâncias;
2. Onboarding;
3. Configurações;
4. Billing;
5. equipe e permissões.

## Fase 4 — Console Admin

1. Overview com Bento Grid e Kanban de Workspaces;
2. Workspaces com Master-Detail;
3. Instâncias de suporte;
4. Inbox de suporte;
5. IA global;
6. Prompts por instância;
7. Auditoria;
8. Canvas operacional de diagnóstico.

## Fase 5 — Polimento

- acessibilidade de teclado;
- focus states;
- responsividade;
- redução de scroll vertical;
- feedback de mutations;
- consistência entre estados;
- verificação visual das telas vazias e de erro.

---

# Decisão inicial

O primeiro ecrã recomendado para a reconstrução visual é o **Inbox**, porque é o centro operacional da aplicação e concentra mais tipos de dados: conversas, instâncias, IA, mídia, mensagens interativas, grupos, ficha do contato e envio.

A alternativa mais segura para começar pelo Console Admin é o **Overview**, porque permite criar os componentes base de métricas, cards, status, Kanban e feedback de mutações sem alterar imediatamente fluxos críticos de atendimento.

**Por qual ecrã quer começar a reconstrução visual: Inbox, Dashboard, Kanban de contactos ou Overview do Console Admin?**
