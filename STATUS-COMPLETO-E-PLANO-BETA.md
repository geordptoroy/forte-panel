# Forte Panel — estado completo, funcionamento e plano do beta

**Atualizado em:** 26/09/2026
**Repositório:** `geordptoroy/forte-panel`
**Último commit publicado:** `9017ac0 feat: add beta health observability`

## 1. Resumo executivo

O Forte Panel é um SaaS multiempresa para atendimento via WhatsApp, CRM, agenda e agente de IA. A unidade de isolamento é o **workspace/empresa**. Cada workspace possui membros, contatos, conversas, mensagens, agenda, configurações, canal WhatsApp, prompt do agente, quotas e auditoria próprios.

A base técnica atual já cobre a maior parte da fundação do beta controlado:

- CRM e Inbox tenant-aware;
- agenda, serviços e profissionais com isolamento por workspace;
- onboarding e configuração do agente por workspace;
- adapters PAPI e Meta Cloud API;
- worker separado para IA, eventos e mensagens outbound;
- quotas por workspace e por operador;
- alertas in-app de consumo;
- criptografia de segredos PAPI/webhook em repouso;
- idempotência, deduplicação e auditoria com chaves compostas por workspace;
- health/readiness e heartbeat do worker;
- testes PostgreSQL reais locais.

**Importante:** o painel administrativo interno para o operador da plataforma — conta dos beta testers, suporte e configuração centralizada do agente — ainda não está implementado como módulo dedicado. Ele foi incluído neste documento e no roadmap como requisito **antes de convidar os beta testers**.

## 2. Quem usa o sistema

### 2.1 Operador da plataforma — você

É o administrador interno do Forte Panel. Ele precisa de um console separado para:

- ver todas as empresas beta;
- abrir a ficha operacional de uma conta;
- acompanhar saúde da conexão, IA, worker, quotas e últimas falhas;
- configurar o agente de cada workspace;
- simular e publicar alterações do prompt;
- prestar suporte sem pedir senha do cliente;
- suspender, reativar ou marcar uma conta como em onboarding;
- consultar auditoria e histórico de suporte.

Esse papel não deve ser confundido com o `owner`, `admin` ou `manager` de uma empresa cliente.

### 2.2 Owner/master da empresa

Administra apenas a própria empresa, sua equipe, canais e configurações permitidas. Não pode enxergar outras empresas nem acessar o console interno da plataforma.

### 2.3 Admin/manager/agent/profissional

São papéis internos do workspace. Cada um tem permissões operacionais diferentes. Um funcionário desativado deve perder acesso e sessões válidas quando o hardening de autenticação estiver concluído.

## 3. O que já está funcionando

### 3.1 Frontend existente

O shell possui páginas base de:

- Dashboard;
- Inbox;
- Kanban/funil;
- Agenda;
- Contatos e ficha do cliente;
- Faturamento;
- Integrações;
- Configurações;
- Equipe;
- notificações internas;
- portal profissional.

O painel de Integrações já mostra o consumo atual do workspace, limites do plano, renovação da janela e operadores com maior consumo outbound.

### 3.2 Multi-tenancy

O fluxo protegido segue:

```text
usuário autenticado
  -> membership ativa
  -> workspace resolvido no servidor
  -> query/mutação filtrada por workspaceId
```

O CRM/Inbox não utiliza mais o workspace demo para contatos, conversas, mensagens, notas, lead-memory, inbound, outbound ou ferramentas do agente. Agenda, catálogo, profissionais, disponibilidade, dashboard e portal profissional também recebem o workspace explicitamente.

As chaves de deduplicação são tenant-aware:

- API idempotency: `(workspaceId, key)`;
- webhooks: `(workspaceId, eventId)`;
- domain events: `(workspaceId, eventKey)`;
- agent effects: `(workspaceId, eventId, toolCallId)`;
- notifications: `(workspaceId, userId, eventKey)`;
- buckets: workspace e usuário por janela.

### 3.3 Fluxo da IA

1. Uma mensagem inbound chega pelo webhook autenticado.
2. O evento é registrado com `workspaceId` e chave idempotente.
3. A mensagem/conversa é localizada dentro do workspace correto.
4. O worker processa o evento `message.received`.
5. O consumo de `aiRequests` é contabilizado no workspace.
6. A configuração/runtime do agente é carregada daquele workspace.
7. O agente consulta histórico, memória, agenda e ferramentas permitidas.
8. A resposta é enfileirada como mensagem outbound.
9. Antes do envio, o worker consome `outboundMessages` do workspace.
10. O adapter chama PAPI ou Meta com o canal/instância correspondente.
11. A mensagem permanece `queued` se a quota estiver cheia e é tentada novamente depois.

A chave do provedor de IA normalmente fica no servidor e pode atender vários workspaces. O isolamento não é feito criando uma chave por cliente; é feito por `workspaceId`, permissões, configuração, quotas e filtros de banco.

### 3.4 Configuração do agente

Já existe configuração tenant-aware para:

- prompt publicado;
- configuração do agente;
- runtime habilitado/desabilitado;
- modelo/provedor conforme a configuração disponível;
- integrações PAPI;
- ferramentas de CRM, memória e agenda.

O segredo de provider e o segredo de webhook são armazenados criptografados quando persistidos. A UI recebe apenas valores mascarados. O segredo novo de webhook é exibido somente no momento de criação/provisionamento.

O que falta para o seu fluxo de beta é uma interface administrativa central para editar isso por workspace, com prévia, publicação, histórico e rollback.

### 3.5 WhatsApp e API

Há adapters para:

- PAPI, provider de transição para desenvolvimento/beta;
- Meta Cloud API, como alternativa oficial.

A API v1 cobre contatos, lead-memory, disponibilidade, agendamentos, mensagens, mudança de estágio, canais, prompt e webhooks. As mutações usam autenticação, validação de payload, idempotência e auditoria.

A API REST ainda deve ser tratada como integração controlada de deployment, não como API pública multiempresa pronta. O binding `FORTE_API_WORKSPACE_ID` prende a API de ambiente a um workspace.

Endpoints operacionais:

- `GET /api/v1/health`: processo HTTP vivo;
- `GET /api/v1/ready`: processo pronto e PostgreSQL respondendo;
- demais endpoints versionados descritos em `API_CONTRACT.md`.

### 3.6 Quotas e limites

Limites padrão por workspace/minuto:

| Plano | API | IA | Outbound |
|---|---:|---:|---:|
| Starter | 120 | 60 | 120 |
| Pro | 600 | 300 | 600 |
| Business | 1.800 | 900 | 1.800 |

O operador individual recebe uma cota derivada do plano. O envio manual do Inbox consome a cota individual; o worker também aplica a cota do workspace antes de enviar ao provider.

Há alertas in-app em 70% e 90% para owners, admins e managers ativos. Os buckets antigos são removidos diariamente; o padrão de retenção é 30 dias e pode ser alterado por `FORTE_USAGE_RETENTION_DAYS`.

### 3.7 Worker

O worker separado processa:

- mensagens outbound;
- eventos de domínio;
- respostas de IA;
- resumos diários;
- alertas de quota;
- limpeza de buckets antigos;
- recuperação de itens presos após reinício.

O heartbeat JSON periódico é controlado por `WORKER_HEARTBEAT_MS`, padrão de 60 segundos. O worker registra contadores de mensagens, limites, alertas, limpeza e erros.

### 3.8 Validação atual

A validação local mais completa foi feita com PostgreSQL 16 efêmero:

```text
21 arquivos de teste aprovados
74 testes aprovados
pnpm check ✅
pnpm build ✅
git diff --check ✅
```

Foram testados isolamento, deduplicação, quotas, alertas, retenção, agenda, memberships e contratos HTTP.

## 4. Como será o painel administrativo interno

### 4.1 Regra de segurança principal

O painel admin interno deve ser uma superfície separada, não uma permissão global escondida no papel `users.role = admin`.

Modelo recomendado:

```text
platform_admin
  -> acessa o console interno
  -> lista workspaces autorizados
  -> seleciona explicitamente uma conta
  -> cria uma sessão de suporte escopada
  -> executa apenas ações auditadas
```

O suporte deve ser **read-only por padrão**. Para alterar dados ou configuração, o operador deve iniciar uma ação explícita, informar motivo e gerar auditoria com:

- operador da plataforma;
- workspace afetado;
- tipo de ação;
- motivo;
- antes/depois sanitizados;
- data, IP e request/correlation ID;
- resultado.

O painel nunca deve mostrar senha, token bruto ou chave de IA. Segredos permanecem mascarados e a rotação acontece por fluxo próprio.

### 4.2 Telas do painel admin

#### A. Visão geral

- workspaces ativos, em onboarding, suspensos e com erro;
- últimos eventos de suporte;
- contas perto do limite de quota;
- conexões WhatsApp degradadas;
- worker sem heartbeat;
- fila outbound acumulada;
- falhas recentes do agente.

#### B. Contas/workspaces

- busca por empresa, slug, owner e status;
- plano e quotas;
- data de criação;
- último acesso;
- quantidade de membros;
- estado do canal;
- estado da IA;
- uso atual;
- ação de suspender/reativar com motivo;
- exportação e encerramento somente em etapa posterior e com confirmação forte.

#### C. Detalhe da conta

Abas sugeridas:

1. **Resumo:** status, owner, membros, plano e saúde.
2. **Suporte:** iniciar sessão escopada read-only, notas internas e histórico.
3. **Agente:** prompt, regras, tom, limites, ferramentas, modelo e estado publicado.
4. **Simulação:** enviar uma mensagem de teste sem falar com o WhatsApp real.
5. **Publicações:** versões, autor, data, diff sanitizado, publicar e rollback.
6. **Canal:** provider, instância mascarada, estado do webhook e rotação.
7. **Uso:** API, IA, outbound, operadores, alertas e fila.
8. **Auditoria:** ações do cliente, agente, worker e suporte.

#### D. Configuração do agente por beta tester

Para cada workspace, você poderá preencher:

- identidade e nome do negócio;
- serviços e áreas atendidas;
- público e região;
- tom de voz;
- horário de atendimento;
- perguntas obrigatórias;
- regras de preço e orçamento;
- regras para agendamento;
- quando transferir para humano;
- assuntos proibidos;
- mensagens de fallback;
- modelo e limites;
- ferramentas habilitadas.

Fluxo seguro:

```text
editar rascunho
  -> validar campos
  -> simular exemplos
  -> revisar diff
  -> publicar versão
  -> monitorar primeiras conversas
  -> rollback se necessário
```

A configuração de um beta tester deve ser por workspace, nunca por variável global nem por prompt compartilhado mutável.

### 4.3 Estruturas técnicas necessárias

Implementar como fase própria:

- `platformAdmins` ou vínculo de operador da plataforma;
- `supportSessions` com escopo, expiração, motivo e revogação;
- `agentPromptVersions` por workspace;
- `agentPromptDrafts` ou estado `draft/published/archived`;
- `agentSimulationRuns` sem envio externo;
- `platformAuditLogs` ou extensão explícita da auditoria existente;
- permissões `platform_admin`, `platform_support_readonly` e `platform_support_operator`;
- endpoint interno separado das rotas públicas do workspace;
- middleware que diferencie plataforma, owner e membro comum;
- rate limit e MFA/step-up para ações de suporte mutáveis.

## 5. Em que etapa implementar

### Fase Beta 0 — agora, antes dos convites

Implementar o **MVP interno** do painel, antes de chamar os 10 testers:

1. autenticação separada de platform admin;
2. lista de workspaces e detalhe da conta;
3. status de onboarding, IA, canal, quotas e worker;
4. configuração do agente por workspace;
5. rascunho, simulação, publicação e rollback simples;
6. suporte read-only;
7. notas internas e auditoria;
8. suspensão/reativação controlada;
9. proteção para não exibir segredos.

Sem esse MVP, você precisará editar banco/variáveis manualmente e o suporte ficará arriscado quando os testers começarem a usar o sistema.

### Fase Beta 1 — durante os primeiros testers

- histórico de versões completo;
- comparação de prompts;
- suporte com ações mutáveis justificadas;
- métricas por workspace;
- fila de problemas e tickets internos;
- alertas de falha de IA, canal e quota;
- templates de agente por segmento;
- checklist de onboarding por conta.

### Fase Pós-beta

- billing e planos comerciais;
- automação de onboarding;
- autosserviço do owner;
- suporte externo com permissões delegadas;
- exportação/encerramento com retenção formal;
- MFA obrigatório para plataforma;
- observabilidade externa, backup/restore e CI PostgreSQL.

## 6. O que ainda falta no produto

### Obrigatório antes de beta real

- painel admin interno descrito acima;
- PostgreSQL de staging real com migrations aplicadas;
- execução da suíte de isolamento no staging;
- `NODE_ENV=production`;
- `JWT_SECRET` forte e exclusivo;
- rotação de qualquer segredo exposto anteriormente;
- webhook PAPI com autenticação criptográfica obrigatória;
- storage proxy com autorização por sessão/workspace;
- sessão curta, revogação server-side e perda imediata de acesso após desativação;
- backup off-host e teste de restore;
- monitoramento de `/api/v1/ready` e heartbeat do worker;
- teste real inbound/IA/outbound com canal de staging;
- confirmar regras de uso e privacidade para os testers.

### Importante, mas pode vir durante o beta controlado

- timeout/circuit breaker do LLM;
- fencing token completo para corrida entre IA e takeover humano;
- comandos `#humano`, `#assumir`, `#pausar`, `#retomar`, `#bot` e `#voltar` como máquina de estados auditada;
- transporte multimodal real para áudio/imagem/documento;
- Meta inbound completo e challenge/assinatura;
- backoff e leases mais completos no outbound;
- correlation ID e logs estruturados centralizados;
- CI executando PostgreSQL e falhando quando testes críticos forem ignorados;
- estados de loading/error/empty e correções de acessibilidade/mobile.

### Futuro, não bloquear o beta

- fork próprio da PAPI ou gateway Baileys;
- múltiplos canais por empresa;
- billing automatizado;
- planos comerciais definitivos;
- relatórios avançados;
- automações complexas.

## 7. Experiência esperada para um beta tester

1. Você cria ou cadastra o workspace do tester no painel interno.
2. Você configura o agente daquele tester, testa exemplos e publica a primeira versão.
3. Você conecta o canal WhatsApp em ambiente controlado.
4. O tester recebe seu acesso de owner/master.
5. Ele configura ou revisa equipe, serviços e agenda, conforme a etapa do beta.
6. Mensagens chegam ao Inbox e podem ser respondidas pela IA.
7. O tester pode assumir manualmente uma conversa.
8. A IA registra contatos, notas, estágio e agendamentos conforme as ferramentas permitidas.
9. Quotas e alertas impedem que uma conta consuma o ambiente inteiro.
10. Você acompanha tudo no painel admin sem acessar a senha do tester.
11. Se o agente se comportar mal, você pausa a IA, corrige o rascunho, simula e publica uma nova versão ou faz rollback.
12. Se houver problema de canal, quota ou worker, você vê o status e o histórico de suporte.

## 8. Estado final de decisão

O próximo bloco de código prioritário é o **Painel Admin da Plataforma + Configuração Versionada do Agente por Workspace**. Ele deve ser implementado antes do convite aos beta testers, junto com staging real e o checklist de segurança. O beta pode começar com até 10 contas somente depois de você conseguir operar essas contas sem editar banco ou secrets manualmente.
