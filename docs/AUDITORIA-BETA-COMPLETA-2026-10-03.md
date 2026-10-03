# Auditoria beta — arquitetura, produto, Baileys, segurança e operações

**Concluída:** 2026-10-03 (UTC−3)

**Snapshot auditado:** `geordptoroy/forte-panel`, branch local `integration/beta-candidate-2026-10-02`, commit `445d4cc2747366b3a27976ba0b0046e8fbba102c`

**Modo:** inspeção estática read-only; nenhuma edição, publicação, migration, acesso ao Supabase, pairing ou envio WhatsApp foi efetuado pela auditoria.
**Escopo:** 10 domínios, 94 achados: critical=2, high=38, medium=41, low=13.

> **Conclusão executiva:** esta candidata tem fundações úteis, testes e uma fronteira Baileys-only, mas **não está pronta para beta pública nem para promoção como release**. Existem 2 achados críticos (um migration/data-safety confirmado e um gate de lançamento público ainda sem evidência), 38 achados high e riscos multi-tenant, media, credenciais, entrega e recuperação que exigem fechar gates antes de expor dados reais. O plano de execução está em [`PLANO-REMEDIACAO-BETA.md`](./PLANO-REMEDIACAO-BETA.md).

## Como ler este relatório

- `critical/high/medium/low` são severidades atribuídas pelos revisores; “bug comprovado” indica evidência no código, enquanto “risco/inferência” precisa da verificação indicada.
- As linhas de evidência apontam para caminhos/linhas observados no commit auditado; os números podem mudar após alterações.
- Cada achado permanece **aberto** até existir correção e teste de aceitação. Uma suite verde, isoladamente, não prova browser, WhatsApp real, backup/restore ou configuração de produção.
- PAPI/Meta não são providers do produto; a integração a preservar é Baileys-only. Referências técnicas antigas não mudam essa decisão.

## Resumo por domínio

| Domínio | Achados | Críticos | High | Medium | Low |
|---|---:|---:|---:|---:|---:|
| Arquitetura e fronteiras | 8 | 0 | 0 | 7 | 1 |
| Fluxos CRM e operação (leads, contatos, funil, serviços, agenda, orçamentos, aprovações, recebimentos e estados vazios) | 8 | 0 | 2 | 5 | 1 |
| UI/UX, páginas e navegação | 5 | 0 | 1 | 1 | 3 |
| Inbox, áudio e conteúdo de mensagens — auditoria read-only do commit 445d4cc2747366b3a27976ba0b0046e8fbba102c | 10 | 0 | 5 | 4 | 1 |
| Gateway Baileys e compatibilidade upstream | 12 | 0 | 4 | 6 | 2 |
| APIs, tRPC e webhooks | 11 | 0 | 4 | 6 | 1 |
| Segurança, identidade e isolamento — auditoria estática read-only do commit 445d4cc2747366b3a27976ba0b0046e8fbba102c | 9 | 0 | 6 | 2 | 1 |
| Dados, migrations e armazenamento — auditoria read-only do commit 445d4cc2747366b3a27976ba0b0046e8fbba102c | 11 | 1 | 7 | 3 | 0 |
| Testes, CI, dependências e qualidade | 8 | 0 | 1 | 5 | 2 |
| Produção, observabilidade e prontidão beta | 12 | 1 | 8 | 2 | 1 |

## Achados detalhados

## 1. Arquitetura e fronteiras

### 1.1 [MEDIUM] [bug comprovado] O worker consome quota antes de obter a claim atómica da mensagem

**Evidência:**

`server/db.ts:8055-8064` chama `consumeWorkspaceUsage(item.workspaceId, "outboundMessages")` enquanto a mensagem ainda pode estar `queued`; só depois `server/db.ts:8066-8076` faz `UPDATE ... WHERE id = ? AND status = 'queued'`. Dois ciclos/workers podem ambos consumir quota para o mesmo item já selecionado, embora apenas um consiga a claim.


**Correção proposta:**

Claimar primeiro com token/lease e só então reservar quota de forma idempotente por `messageId`, ou fazer a reserva de quota e a claim na mesma transação SQL. Se a claim falhar, não deve haver consumo; se o processo cair após reservar, a reserva deve ser recuperável/refundável.


**Impacto:**

Sob concorrência ou numa sobreposição entre ciclos, a quota outbound fica artificialmente consumida e pode bloquear mensagens legítimas. É um efeito arquitetural comprovado pela ordem das operações, mesmo que o envio duplicado seja mitigado pelo ledger do gateway.


**Teste de aceitação:**

Teste de integração com a mesma mensagem `queued` e duas invocações concorrentes de `processQueuedMessagesOnce`: uma única claim, uma única reserva em `workspace_user_usage`/bucket equivalente e nenhuma mensagem perdida. Repetir com uma quota de 1 e verificar que o segundo item não é artificialmente throttled.


### 1.2 [MEDIUM] [risco/inferência] Mensagens outbound não têm lease/owner no Panel; recuperação re-enfileira qualquer processamento

**Evidência:**

`server/db.ts:8024-8033` implementa `recoverProcessingMessages()` como `UPDATE messages SET status='queued' WHERE status='processing'`, sem `workerId`, `leaseUntil` ou token. `server/db.ts:8035-8050` seleciona itens queued e `8066-8075` apenas muda o status para processing. `server/worker.ts:126-133` executa a recuperação no arranque. Em contraste, `drizzle/schema.ts:1106-1143` dá `domainEvents` campos explícitos `workerId`, `claimedAt` e `leaseUntil`.


**Correção proposta:**

Aplicar ao outbound o mesmo padrão de claim condicional de `domainEvents`: `workerId`, `leaseUntil`, tentativa e updates condicionados ao owner; recuperar apenas leases expiradas. Manter a chave `forte-message-${id}` como segunda barreira, mas documentar a garantia como at-least-once/fail-closed e exigir volume/estado persistente do ledger.


**Impacto:**

Um restart/rolling deploy ou segundo worker pode reabrir trabalho ainda em voo e o Panel não consegue distinguir claim expirada de claim viva. O `SendLedger` do gateway (`forte-whatsapp/src/send-ledger.ts:28-48,68-83`) reduz o risco de duplicação no mesmo volume, mas não fornece ownership/observabilidade da fila do Panel nem cobre perda/migração do ledger. Escalar o worker sem fechar esta semântica pode causar mensagens presas, quota inconsistente ou efeitos duplicados.


**Teste de aceitação:**

Executar dois workers e matar o primeiro durante cada janela (antes da chamada gateway, durante timeout e depois do ACK). Confirmar que só o owner atualiza a mensagem, leases expiradas são retomadas, uma chave concluída retorna o mesmo `externalId` e o estado não fica indefinidamente `processing`.


### 1.3 [MEDIUM] [risco/inferência] Redis é um serviço obrigatório no Compose, mas não é consumidor das filas reais

**Evidência:**

`docker-compose.yml:21-33` cria Redis persistente; `docker-compose.yml:78,94,113,132` injeta `REDIS_URL` e torna Redis uma dependência saudável de Panel/worker. A procura do runtime encontrou `REDIS_URL` apenas em Compose/scripts, sem import/cliente Redis em `server/` ou `forte-whatsapp/`; as filas efetivas estão em `server/db.ts:8035-8176` (messages) e no processamento SQL de `domainEvents`.


**Correção proposta:**

Para o desenho atual, remover Redis do Compose, `REDIS_URL` e dependências de health/startup, atualizando documentação e checklists de backup. Só introduzir Redis se existir uma responsabilidade concreta (por exemplo, rate limit/cache ou broker) com cliente, métricas, política de perda e testes; não substituir PostgreSQL por biblioteca/broker abstrato sem medir a necessidade.


**Impacto:**

Redis acrescenta um serviço stateful, volume, backup/restore e condição de arranque sem participar do caminho de filas. Operadores podem assumir que há fila Redis/semântica de broker quando o comportamento real é polling PostgreSQL; uma falha Redis pode impedir a aplicação embora as filas SQL estejam disponíveis.


**Teste de aceitação:**

Subir a stack reduzida sem Redis e provar que web, worker, inbound outbox e outbound SQL continuam funcionando. Se Redis for mantido, adicionar teste que falhe quando o caminho declarado não o consome e documentar exatamente qual estado é persistido nele.


### 1.4 [MEDIUM] [risco/inferência] O registry do gateway é local ao processo e não define coordenação para réplicas

**Evidência:**

`forte-whatsapp/src/instance-registry.ts` mantém as instâncias em um `Map`/registry em memória e inicializa managers a partir do diretório de sessões; `forte-whatsapp/src/instance-manager.ts` coordena socket, sessão e locks no processo/Filesystem. Não há lock/lease distribuído, eleição ou registro externo no gateway. O Compose publica um único `forte-whatsapp` (`docker-compose.yml:137-145`), portanto o risco aparece ao escalar/failover, não é prova de falha na topologia atual.


**Correção proposta:**

Escolher explicitamente uma garantia: manter e impor uma única réplica com health/readiness e documentação, ou adicionar ownership distribuído por `instanceId` (lease renovável, fencing token e armazenamento compartilhado de sessão/outbox) antes de permitir escala horizontal. Não usar apenas mais processos/containers como substituição.


**Impacto:**

Duas réplicas podem descobrir a mesma sessão e abrir sockets concorrentes, dividir estado de saúde/QR ou duplicar webhooks. O modelo atual é aceitável como singleton, mas a evolução horizontal não é segura por construção.


**Teste de aceitação:**

Teste com duas instâncias do gateway apontando para o mesmo volume/instanceId: uma só pode possuir o lease/socket, a outra deve ficar fenced; após matar o owner, a nova réplica assume sem dois webhooks ou duas conexões simultâneas.


### 1.5 [MEDIUM] [risco de manutenção comprovado] Dois clientes HTTP implementam partes sobrepostas da fronteira Baileys

**Evidência:**

`server/baileys-gateway.ts` fornece funções de criação, status, QR, pairing, envio e segredo; `server/integrations/whatsapp.ts` fornece `createBaileysAdapter`, health, normalize e send. Ambos tratam URL base, API key, timeout, serialização de erro e chamadas REST ao mesmo gateway, enquanto `server/integrations/contracts.ts:72-83` define apenas a interface de alto nível.


**Correção proposta:**

Extrair um cliente interno tipado, por exemplo `BaileysGatewayClient`, com `request`, schemas de resposta e erros; fazer `server/baileys-gateway.ts` e o adapter delegarem nele. Manter a interface `WhatsappAdapter` para domínio, sem adicionar um SDK externo: o benefício concreto é eliminar duplicação de transporte, não trocar a biblioteca HTTP.


**Impacto:**

Mudanças de endpoint, timeout, headers ou classificação de erro podem atualizar um wrapper e deixar o outro divergente. A lógica repetida aumenta a superfície de testes e torna menos nítido onde termina o adapter e começa o cliente de transporte.


**Teste de aceitação:**

Teste de contrato contra um gateway fake cobrindo cada operação pelos dois consumidores, incluindo timeout, 401/404, payload inválido e idempotency key; depois alterar um header/rota no cliente único e confirmar que ambos os caminhos continuam alinhados.


### 1.6 [MEDIUM] [risco de evolução comprovado] `server/db.ts` e `server/routers.ts` são agregadores monolíticos com responsabilidades misturadas

**Evidência:**

`server/db.ts` tem cerca de 9.469 linhas e reúne CRM, agenda, onboarding/IA, mídia, WhatsApp, webhook, usage, outbound messages e domain-event worker; exemplos: `recoverProcessingMessages/processQueuedMessagesOnce` em `server/db.ts:8024-8176` e o processamento de domain events nas secções seguintes. `server/routers.ts` tem cerca de 3.434 linhas e mistura procedures de auth, onboarding, inbox, agenda, admin e Baileys; `server/routers.ts:1336-1486` contém lifecycle de instâncias e `3330-3376` envio manual.


**Correção proposta:**

Separar por bounded contexts (`inbox/whatsapp`, `outbox`, `domain-events`, `contacts/pipeline`, `onboarding`, `agenda`) em módulos de serviço/repositórios; manter `drizzle/schema.ts` como contrato de persistência e routers finos que apenas validam input, autorizam e delegam. Fazer a migração incremental sem alterar contratos Baileys.


**Impacto:**

Uma alteração de schema ou regra de integração atravessa um módulo de alto acoplamento, aumenta tempo de revisão e torna testes unitários menos focados. Também dificulta extrair o worker ou aplicar limites de transação por bounded context. Isto é um problema de organização/risco, não uma falha funcional demonstrada no commit.


**Teste de aceitação:**

Adicionar regra de dependências/import graph que impeça módulo de agenda/onboarding de importar gateway e vice-versa; cada contexto deve ter testes próprios de contrato e o worker deve poder ser importado/executado sem carregar routers/UI.


### 1.7 [LOW] [risco/inferência] O servidor escolhe silenciosamente outra porta também em produção

**Evidência:**

`server/_core/index.ts:24-30` procura qualquer porta até `startPort+19`; `62-70` usa essa porta mesmo quando `NODE_ENV=production`. O Compose publica `forte-panel:3000` (`docker-compose.yml:91`) e o gateway usa a URL interna fixa `http://forte-panel:3000` (`docker-compose.yml:87` para o Panel e contrato documentado).


**Correção proposta:**

Em produção bindar exclusivamente `PORT` e falhar com erro explícito se não estiver disponível; conservar busca de porta apenas em desenvolvimento. Adicionar readiness que confirme a porta/URL efetivamente anunciada.


**Impacto:**

Se 3000 estiver ocupada no container/host de execução, o processo pode ficar ‘running’ mas não atender no endpoint publicado nem no callback do gateway. O fallback é útil em desenvolvimento, mas o comportamento silencioso torna configuração/readiness enganosa em produção.


**Teste de aceitação:**

Iniciar uma imagem de produção com 3000 ocupada e confirmar falha não ambígua; em desenvolvimento, confirmar que o fallback continua permitido. Testar health e webhook com a porta declarada no Compose.


### 1.8 [MEDIUM] [lacuna documental comprovada] A documentação operacional mistura uma alegação de E2E real com um status que diz que WhatsApp real não foi testado

**Evidência:**

`docs/BAILEYS-INTEGRATION.md:5`/cabeçalho descreve a integração como validada com número real; `docs/STATUS-ATUAL.md:41-53` registra os gates locais e afirma explicitamente que os testes não cobriram WhatsApp real, envio ou imagem Docker executada; `docs/STATUS-ATUAL.md:55-67` ainda lista lacunas antes de promover. `AGENTS.md:42-48` exige separar build verde de prontidão pública.


**Correção proposta:**

Marcar o cabeçalho/alegação de `BAILEYS-INTEGRATION.md` como histórico ou substituir por ‘contrato implementado, E2E real não verificado nesta candidata’; apontar sempre para `docs/STATUS-ATUAL.md` para evidência temporal. Adicionar data/commit e ambiente a qualquer claim E2E.


**Impacto:**

Um leitor que use apenas a documentação da integração pode inferir uma prova operacional que a fonte de estado atual nega. Isso afeta decisão de promoção e evolução da fronteira, embora não seja um bug de runtime.


**Teste de aceitação:**

Revisão documental automatizada/manual: toda afirmação ‘validado/real/E2E’ deve conter commit, ambiente e evidência; no commit auditado, a leitura de integração e status deve produzir a mesma conclusão sobre ausência de teste real.


### Revisão de bibliotecas

- Drizzle/PostgreSQL é uma escolha concreta para as filas atuais, leases de webhook/domain events, unicidade e transações; o problema encontrado é a claim outbound ausente, não falta de uma biblioteca. Não recomendo trocar por Redis/BullMQ sem uma necessidade de throughput/particionamento demonstrada.
- tRPC + Zod + superjson trazem benefício concreto na fronteira frontend↔Panel: tipos do `AppRouter`, validação de input e serialização consistente. A importação type-only de `server/routers` em `client/src/lib/trpc.ts` é acoplamento de compilação intencional, não acesso runtime ao backend.
- O `SendLedger` próprio do gateway resolve idempotência com uma garantia fail-closed que uma biblioteca genérica não prova automaticamente; deve ser mantido, mas acompanhado de volume persistente e testes de restart. A melhoria recomendada é compartilhar o cliente REST interno, não substituir o transporte por SDK abstrato.
- A instalação usa patches/overrides reais no lockfile (`pnpm-lock.yaml:7-13,4383-4387,9163-9167`), incluindo Wouter; `docs/STATUS-ATUAL.md:61` registra um aviso de instalação. Não há evidência suficiente nesta revisão para recomendar substituir Wouter ou outra dependência; o follow-up apropriado é tornar a configuração pnpm reproduzível e remover o warning.

### Pontos fortes observados

- O runtime está efetivamente Baileys-only: `server/integrations/contracts.ts` expõe `WhatsappProvider = "baileys"`, `server/integrations/baileys-policy.ts` falha fechado para valores diferentes, e `drizzle/schema.ts:901-969,1423-1450` tem checks operacionais para Baileys. A varredura do código não encontrou adapter PAPI/Meta ativo.
- A fronteira Panel↔gateway é identificável e versionada: `server/api.ts:1561-1567` monta `POST /api/v1/webhooks/providers/baileys`; `server/baileys-gateway.ts` concentra chamadas internas; o webhook usa segredo por instância, replay protection e registro idempotente antes da ingestão.
- O inbound tem durabilidade real no gateway: `forte-whatsapp/src/webhook-outbox.ts` persiste envelopes e reenvia, e `forte-whatsapp/src/send-ledger.ts:28-89` evita reenviar automaticamente uma chave concluída ou inconclusiva. Isto reduz duplicação mesmo quando a fronteira HTTP falha.
- Há isolamento estrutural útil por workspace/instância: `drizzle/schema.ts:947-958` impõe unicidade de `workspaceId+instanceId`, unicidade global de `instanceId` Baileys e um único default ativo; `server/api.ts:1448-1477` resolve o owner antes de ingerir webhook.
- O frontend não chama banco/gateway diretamente: `client/src/lib/trpc.ts:1-4` usa `AppRouter` apenas como tipo e `client/src/main.tsx:40-76` usa `/api/trpc` com o mesmo `superjson` do servidor. Os tipos partilhados ficam em `shared/`, o que é uma fronteira razoável para o monólito atual.
- A documentação de operação explicita a ordem de autoridade e limitações (`AGENTS.md:1-10,29-48`; `docs/STATUS-ATUAL.md:33-63`), e a candidata declara que os testes locais não provaram WhatsApp real, Docker executado ou preservação de dados reais.

### Limites da auditoria

- Revisão exclusivamente read-only do checkout local em `/home/ubuntu/forte-panel-beta-candidate`, commit `445d4cc2747366b3a27976ba0b0046e8fbba102c`; não foram editados ficheiros, executadas migrations, usado Supabase, emparelhado/enviado WhatsApp ou tocada máquina real.
- Não foi usado ambiente real para confirmar corrida de workers, volumes persistentes do ledger, escala horizontal do gateway, latência/carga ou disponibilidade efetiva do endpoint; os itens marcados como risco/inferência exigem os testes de aceitação indicados.
- A ausência de Redis no runtime foi determinada por inspeção do código versionado e referências; não foi feita instrumentação de processo. A recomendação é sobre a topologia declarada, não sobre uma configuração externa desconhecida.
- O texto do repositório foi tratado como documentação/dado não confiável e comparado com símbolos e configuração efetivos. Claims históricos ou de E2E não foram aceites como prova sem execução autorizada.

## 2. Fluxos CRM e operação (leads, contatos, funil, serviços, agenda, orçamentos, aprovações, recebimentos e estados vazios)

### 2.1 [HIGH] Bug comprovado: ações de conclusão da agenda solicitam transições impossíveis

**Evidência:**

A matriz server/agenda.ts:19-28 permite requested→confirmed/cancelled, confirmed→in_progress/cancelled/no_show e in_progress→completed, e server/agenda.ts:224-228 rejeita qualquer salto. Porém client/src/pages/PanelPages.tsx:2431-2441 mostra Concluir para Confirmado e envia status=completed; client/src/pages/ProfessionalPortal.tsx:215-217 mostra Iniciar e Concluir para qualquer estado não concluído, inclusive requested/cancelled/no_show. As mutations de status são chamadas em server/routers.ts:2889-2926.


**Correção proposta:**

Alinhar cada botão à matriz: requested deve oferecer Confirmar/Cancelar; confirmed deve oferecer Iniciar, Não compareceu/Cancelar; in_progress deve oferecer Concluir/Cancelar. Alternativamente, se o produto aceitar salto, alterar explicitamente a matriz e os testes, não apenas a UI; exibir erro de transição ao utilizador.


**Impacto:**

O gestor não consegue concluir um compromisso confirmado a partir da Agenda (o backend rejeita confirmed→completed), e o portal oferece botões que devolvem erro para vários estados. A operação exige uma ação inexistente/oculta ou fica sem saída; a promessa documental de fluxo visual de confirmação/conclusão não corresponde ao contrato server-side.


**Teste de aceitação:**

Teste de integração/caller para cada combinação da matriz e teste de componente que verifica que nenhum botão envia uma transição rejeitada. Smoke manual: requested→confirmed→in_progress→completed, requested→cancelled e confirmed→no_show.


### 2.2 [MEDIUM] Bug comprovado: estágio legado/customizado pode retirar o lead do Kanban

**Evidência:**

shared/lead-opportunity.ts:12-14 (initialOpportunityStage) preserva qualquer texto não vazio, truncando apenas a 80 caracteres; server/db.ts:ensureLeadOpportunityForContact:9040-9048 usa esse valor ao criar a Opportunity. Já shared/contact-stage.ts:19-25 define como canónicos apenas os 11 valores de CONTACT_STAGE_ORDER, e client/src/pages/PanelPages.tsx:2019-2022 renderiza cards apenas quando contact.stage coincide com uma coluna canónica.


**Correção proposta:**

Normalizar estágio na promoção/migração para um estágio canónico (por exemplo Novo contato), guardar o valor legado em histórico/auditoria, e renderizar uma coluna/estado de reparação para valores desconhecidos até a correção. Não usar simplesmente um label visual que esconda o dado.


**Impacto:**

Um contato migrado ou criado com estágio não reconhecido pode aparecer em Contacts/Inbox mas não em nenhuma coluna do funil. Como a API de mudança usa o contrato canónico, o registro fica potencialmente invisível e sem transição operacional; é uma inconsistência entre domínio legado, Opportunity e projeção visual.


**Teste de aceitação:**

Fixture com contact.stage='pago' ou outro valor desconhecido: confirmar que aparece no Kanban em fallback/Novo contato, que Opportunity e espelho ficam canónicos e que stage history registra a reparação; testar também uma transição posterior.


### 2.3 [MEDIUM] Bug comprovado: a Agenda não limita o modo semana nem a lista de próximos

**Evidência:**

server/db.ts:getAgendaSnapshot:5192-5229 seleciona todos os appointments do workspace/profissional, sem limite temporal, e apenas ordena por startsAt. Em client/src/pages/PanelPages.tsx:2480-2482 o modo que não é dia mapeia agendaItems inteiro; em :2521-2523 a seção intitulada Próximos agendamentos usa simplesmente agendaItems.slice(0,8), sem filtrar startsAt>=agora.


**Correção proposta:**

Enviar intervalo from/to para uma query de agenda ou filtrar por timezone no servidor; para semana usar início/fim da semana selecionada, e para Próximos filtrar a partir de agora antes de ordenar/slice. Manter o modo dia com o mesmo critério temporal consistente.


**Impacto:**

Compromissos históricos podem ocupar a lista chamada Próximos e o modo semana pode mostrar meses de dados, não a semana selecionada. Com volume real, a agenda fica operacionalmente enganosa e o usuário pode não encontrar o próximo atendimento.


**Teste de aceitação:**

Inserir appointments passados, desta semana e fora da semana: verificar que cada view mostra somente seu intervalo e que Próximos nunca inclui passado. Testar limites de meia-noite/DST no timezone do workspace.


### 2.4 [HIGH] Bug comprovado: orçamento itemizado prometido na documentação não está disponível na tela

**Evidência:**

O3.4-ENTREGA-ORCAMENTO-ITEMIZADO.md, seção 'Itens e total canônico', afirma que Billing permite adicionar/remover várias linhas e mostra o total calculado. Contudo client/src/pages/BillingPage.tsx:41 tem apenas um input de serviço, um valor e uma descrição; o submit envia o contrato flat. server/db.ts:createQuote:6608-6625 aceita items, mas cai no fallback de uma única linha quando o caller envia somente serviceName/quotedCents.


**Correção proposta:**

Implementar editor repetível de itens (serviço, descrição, quantidade, preço unitário), calcular total no cliente apenas como prévia e enviar items ao backend; manter o cálculo canónico em createQuote e mostrar os itens no detalhe/lista.


**Impacto:**

O produto só consegue criar orçamentos de uma linha pela UI, apesar de persistir quoteItems/quantity/position no backend. Materiais e serviços múltiplos não podem ser representados nem revisados antes da aprovação; a documentação descreve uma capacidade ausente no fluxo de ecrã até persistência.


**Teste de aceitação:**

Teste UI cria três linhas, altera quantidade/preço, confirma total e envia; teste server verifica quoteItems, posições únicas e quotedCents igual à soma. Verificar que aprovação e recibo usam o total calculado.


### 2.5 [MEDIUM] Bug comprovado: validade comercial do orçamento não é configurável pela aplicação

**Evidência:**

A documentação O3.4-ENTREGA-ORCAMENTO-ITEMIZADO.md, seção 'Validade', distingue validUntil de dueDate e afirma que a interface mostra a validade. O formulário real em client/src/pages/BillingPage.tsx:41 só tem o campo quote-due (dueDate); não há input nem argumento validUntil. O backend suporta validUntil e rejeita data passada em server/db.ts:createQuote:6608-6617, mas a UI nunca o preenche.


**Correção proposta:**

Adicionar campo separado de validade comercial, enviar validUntil em ISO, distinguir os labels e renderizar o estado expired na lista. Preservar dueDate como vencimento financeiro.


**Impacto:**

Todos os orçamentos criados na aplicação ficam sem validade comercial (validUntil=null), portanto a expiração e a rejeição de aprovação por expiração não podem ser usadas pelo operador. O campo mostrado como Vencimento é o vencimento financeiro/operacional, não a validade prometida.


**Teste de aceitação:**

Criar orçamento com validUntil futuro e depois com data passada; conferir payload/persistência, label na UI e que approve aceita o primeiro e rejeita o segundo com mensagem acionável.


### 2.6 [MEDIUM] Risco comprovado no contrato legado: updatePayment ainda altera o agregado sem ledger nem recibo

**Evidência:**

server/routers.ts:2628-2642 mantém billing.updatePayment exposto a requireFinancial. server/db.ts:updateQuotePayment:6651-6666 atualiza apenas quotes.receivedCents/paymentStatus/status e grava auditLogs; não insere quotePayments nem quoteReceipts. A própria documentação O3.6-ENTREGA-RECEBIMENTOS-LEDGER-RECIBO.md:15-17 chama-o de contrato legado, mas ele continua chamável diretamente.


**Correção proposta:**

Remover/depreciar a procedure após migração dos consumidores, ou fazer updatePayment delegar atomicamente a registerPayment com método/data/recibo explícitos; monitorar chamadas legadas e bloquear escrita agregada sem ledger.


**Impacto:**

Qualquer consumidor que use a procedure antiga pode fazer o Inbox/dashboard mostrar recebimento sem lançamento e sem recibo, divergindo do ledger operacional. Não é observado no botão atual, que usa registerPayment, mas é uma superfície de API real e uma fonte de reconciliação incorreta.


**Teste de aceitação:**

Chamar cada procedure diretamente num fixture aprovado: uma operação deve produzir exatamente um quotePayment, um quoteReceipt e o agregado correspondente; confirmar que chamadas legadas são rejeitadas ou delegadas sem divergência.


### 2.7 [MEDIUM] Bug/requisito comprovado: seeds demo de leads, serviços e agenda continuam no caminho de runtime não produtivo

**Evidência:**

server/db.ts:isDemoRuntimeAllowed:221-230 habilita DEMO_MODE=true em development/test ou runtime qa. ensureDemoInbox:4851-4889 insere contatos/conversas/mensagens seed; ensureDemoAgenda:4934-4965 insere serviços/profissional e continua criando disponibilidade/agendamentos. getAgendaSnapshot e createAgendaAppointment chamam ensureDemoAgenda para o workspace slug forte-demo em server/db.ts:5150-5151 e :5293-5294.


**Correção proposta:**

Retirar seeds da execução de queries/mutations e movê-los para fixture explícita fora do caminho da aplicação, ou exigir uma base de demonstração isolada que nunca seja usada por workspace operacional. Não reatribuir contatos sem workspace automaticamente; a linha :4857-4859 deve desaparecer do runtime.


**Impacto:**

Em dev/QA com DEMO_MODE, a aplicação pode apresentar dados fictícios como leads, clientes, serviços e compromissos e misturá-los com o workspace demo; isso viola a exigência de não ter dados demo/mock na aplicação e pode contaminar testes operacionais. O gate reduz o alcance, mas não elimina a presença do seed no produto/runtime.


**Teste de aceitação:**

Com DEMO_MODE em cada ambiente suportado e base vazia/não vazia, confirmar que nenhuma query cria/reatribui contacts, messages, services, professionals ou appointments; testar que um workspace operacional nunca recebe o slug forte-demo.


### 2.8 [LOW] Bug de estado vazio: Kanban sem leads filtrados fica visualmente vazio e sem CTA

**Evidência:**

client/src/pages/PanelPages.tsx:2017-2106 sempre renderiza kanban-board e as 11 colunas; cada coluna só faz columnItems.map em :2037-2038. Não há EmptyState/CTA quando items ou filteredItems é zero, ao contrário da Agenda em :2471-2476 e :2510-2515.


**Correção proposta:**

Renderizar EmptyState distinto para 0 leads e para filtro sem resultados, com CTA Novo contato; manter contadores de colunas quando houver dados.


**Impacto:**

Um workspace novo ou uma busca sem resultados mostra colunas vazias, sem explicar se não existem leads ou se o filtro eliminou todos, nem oferece criar o primeiro contato. Isso cria ambiguidade no estado inicial do funil.


**Teste de aceitação:**

Testar workspace sem contatos, filtro sem correspondência e workspace com contatos; conferir mensagem, CTA e que limpar filtros restaura os cards.


### Revisão de bibliotecas

- Não identifiquei uma biblioteca adicional que reduza diretamente estes riscos sem substituir lógica de domínio. A matriz de estados, tenancy, ledger e conflitos são invariantes específicas do produto e devem permanecer no backend; não recomendo troca abstrata de biblioteca.
- As queries tRPC/Drizzle existentes já fornecem transação, locks e constraints usados nos caminhos corretos; o problema principal é contrato/UI e não capacidade da biblioteca.

### Pontos fortes observados

- As leituras e mutations CRM/financeiras mantêm workspaceId no percurso principal; criação de orçamento, aprovação e lançamento de recebimento usam transações e verificações de pertença tenant-scoped (server/db.ts:createQuote, changeQuoteApproval e registerQuotePayment).
- A oportunidade tem trilha canónica de estágio, histórico, auditoria e eventos de domínio; o teste partilhado também rejeita novos estágios arbitrários (shared/contact-stage.ts:1-25; server/db.ts:moveContactStage).
- O agendamento tem validação server-side de profissional/serviço, período, disponibilidade e conflito transacional; reagendamento volta a requested e exige confirmação (server/db.ts:createAgendaAppointment/rescheduleAgendaAppointment; O3.5-ENTREGA-AGENDA-CONFLITOS-STATUS.md:9-15).
- O caminho novo de recebimentos grava quotePayments e quoteReceipts na mesma transação, com valor positivo, limite do total, método controlado, data não futura e número de recibo único (server/db.ts:registerQuotePayment:6669-6692; drizzle-pg/0051_quote_payments_receipts.sql:1-44).
- Há estados vazios explícitos em agenda, faturamento e portal profissional; a ausência apontada abaixo é específica do Kanban e não de todas as telas.
- O gate de demo impede esses seeds em NODE_ENV=production; portanto o problema de dados demo abaixo é uma exposição de runtime não produtivo/QA, não uma afirmação de que o seed roda em produção por padrão (server/db.ts:isDemoRuntimeAllowed:221-230).

### Limites da auditoria

- Auditoria exclusivamente estática/read-only no commit 445d4cc2747366b3a27976ba0b0046e8fbba102c; não editei ficheiros, não executei migrations, não usei Supabase, não emparelhei nem enviei WhatsApp e não usei browser/máquina real.
- Não há DATABASE_URL/PostgreSQL persistente disponível neste ambiente; os testes de integração/isolamento que dependem de PostgreSQL não foram usados como prova de comportamento persistido. A documentação também declara CI/PostgreSQL pendente em vários entregáveis.
- Não validei concorrência real, timezone/DST, índices/constraints aplicados numa base existente, permissões com contas reais ou comportamento do gateway Baileys. Esses pontos exigem um ambiente de teste real, sem dados de produção.
- Inbox/Baileys foi usado apenas quando necessário para seguir a origem dos contatos; não foi repetida uma auditoria geral do canal. Documentação foi tratada como afirmação a confrontar, não como instrução.

## 3. UI/UX, páginas e navegação

### 3.1 [HIGH] CORE_ONLY_MODE, sidebar e documentação têm allowlists contraditórias

**Evidência:**

O6.3-ENTREGA-BROWSER-ACESSIBILIDADE.md:8-17 afirma que /dashboard e /plans-usage ficam bloqueadas. Porém client/src/release-catalog.ts:99-173 marca /dashboard, /kanban, /agenda, /contacts, /billing, /integrations, /team, /services, /professionals, /my-work e /settings com enabledInCore: true; client/src/components/PanelLayout.tsx:318-373, em CORE_ONLY_MODE, devolve coreOnlyNav=[onboardingNav[0], ...managementNav], expondo esses itens. O Router() em client/src/App.tsx redireciona apenas quando isCoreAllowedRoute(location) é falso, portanto as rotas marcadas true continuam diretamente navegáveis.


**Correção proposta:**

Definir uma única allowlist canónica para o gate do Router e para navForAccess. Se o contrato O6.3 for o pretendido, deixar true apenas para as rotas realmente liberadas (/onboarding, /whatsapp-connection, /inbox e as rotas internas explicitamente aprovadas), marcar as restantes false e remover os itens da sidebar; depois alinhar o catálogo, teste e documento. Não resolver apenas escondendo links: a rota direta também deve redirecionar.


**Impacto:**

O utilizador vê e pode abrir superfícies que a documentação declara congeladas e que o próprio catálogo chama not_ready (por exemplo, Dashboard e Agenda). A jornada fica sem hierarquia de release confiável e pode induzir uso de módulos ainda não validados; não é um bypass de RBAC, mas é uma regressão de escopo/navegação comprovada.


**Teste de aceitação:**

Adicionar teste parametrizado para cada rota: em CORE_ONLY_MODE, rotas congeladas redirecionam para /onboarding e não aparecem em navForAccess; rotas aprovadas mantêm acesso. Fazer smoke de links da sidebar e de URL direta sem alterar dados.


### 3.2 [MEDIUM] Diálogos customizados não implementam gestão de foco suficiente para ações críticas

**Evidência:**

Os modais de renomeação e exclusão são divs manuais com role=dialog/alertdialog e aria-modal em client/src/pages/WhatsappConnectionPage.tsx:978-1028 e :1030-1077. Há autoFocus apenas no input de renomeação (:999-1006); não há focus trap, retorno do foco ao botão que abriu, tratamento de Escape, aria-describedby para a explicação da exclusão ou código de foco equivalente. O teste client/src/browser-accessibility.contract.test.ts:41-49 só verifica a presença textual dos atributos.


**Correção proposta:**

Usar os componentes Radix já presentes em client/src/components/ui/dialog.tsx e alert-dialog.tsx, ou implementar explicitamente focus trap, foco inicial/retorno, Escape, labelledby/describedby e bloqueio de interação do fundo. Manter a confirmação explícita e o confirmDeletion: true no backend/cliente.


**Impacto:**

Com teclado/leitor de ecrã, Tab pode sair do diálogo para conteúdo atrás do backdrop; ao fechar, o foco pode perder-se. Numa confirmação de exclusão isto aumenta a probabilidade de confusão e de ativação da ação errada. role=alertdialog sozinho não fornece essas garantias.


**Teste de aceitação:**

Teste de teclado com Tab/Shift+Tab/Escape e foco antes/depois de abrir/fechar para renomeação e exclusão; validar DOM com leitor de ecrã/axe em staging, sem executar a ação destrutiva.


### 3.3 [LOW] A UI declara código de pareamento como copiado sem confirmar a operação de clipboard

**Evidência:**

client/src/pages/WhatsappConnectionPage.tsx:503-517 chama void navigator.clipboard?.writeText(pairingCode) e imediatamente setCopiedCode(true), sem await, sem catch e sem fallback quando clipboard é indisponível/negado.


**Correção proposta:**

Aguardar writeText e só marcar sucesso no resolve; no reject/ausência da API, manter “clique para copiar” e mostrar feedback acessível orientando seleção manual. Não ocultar o código nem depender apenas de toast.


**Impacto:**

O rótulo muda para “copiado” mesmo quando a permissão falha ou a API não existe; o operador pode colar um valor antigo/vazio e repetir o pareamento desnecessariamente.


**Teste de aceitação:**

Mockar navigator.clipboard ausente, resolvido e rejeitado; confirmar que o estado só diz “copiado” no resolve e que há mensagem/ação alternativa nos outros casos.


### 3.4 [LOW] Nomenclatura de “serviços externos” sugere providers fora do produto Baileys-only

**Evidência:**

client/src/components/PanelLayout.tsx:146-149 apresenta a navegação como “Canais conectados” com descrição “WhatsApp e serviços externos”, enquanto client/src/pages/PanelPages.tsx:3053-3055 mostra que /integrations é somente WhatsappConnectionPage. A busca do runtime não encontrou PAPI ou Meta como opções funcionais.


**Correção proposta:**

Renomear a entrada e o heading para “Conexões WhatsApp (Baileys)” ou remover o alias /integrations em favor de /whatsapp-connection. Reservar “integrações” para uma superfície futura só quando houver um contrato suportado; manter PAPI apenas em documentação de engenharia.


**Impacto:**

Não há evidência de adapter PAPI/Meta exposto, mas o texto cria expectativa de integrações que o produto confirmado não suporta e contradiz a clareza de escopo; pode levar o operador a procurar um provider inexistente.


**Teste de aceitação:**

Teste de conteúdo/rotas garantindo que a sidebar e a página exibem Baileys como único canal e não oferecem Meta/PAPI; validar links /integrations e /whatsapp-connection sem duplicação confusa.


### 3.5 [LOW] O contrato chamado de acessibilidade é estático, não uma prova de comportamento de UI

**Evidência:**

client/src/browser-accessibility.contract.test.ts:11-12 lê ficheiros com readFileSync e em :24-55 usa toContain/regex para procurar strings; O6.3-ENTREGA-BROWSER-ACESSIBILIDADE.md:21-23 declara que não há smoke browser, Lighthouse/axe nem utilizador autenticado.


**Correção proposta:**

Manter o contrato estático como guarda de regressão de escopo, mas adicionar testes DOM/browser reais para navegação por teclado, dialogs, estados de erro/loading e breakpoints; não transformar o teste textual em alegação de validação visual.


**Impacto:**

O teste passa mesmo se um componente não renderizar o atributo, se o foco não funcionar ou se houver clipping/contraste insuficiente. Isto explica por que a lacuna de foco dos modais não é detetada e dá mais confiança do que a evidência suporta.


**Teste de aceitação:**

Executar a matriz em staging com conta de teste: desktop/mobile, teclado sem rato, leitor de ecrã/axe e fluxos de erro/empty/loading; registar os resultados separadamente dos testes de fonte.


### Revisão de bibliotecas

- wouter é usado de forma consistente no Router, Link, useLocation e useRoute; não há prova de que trocar o router reduziria risco. O problema de allowlist deve ser corrigido na política central, não por substituição abstrata.
- Radix UI já está instalado e há componentes locais Dialog/AlertDialog; reutilizá-los nos dois modais customizados reduz código próprio de focus management e risco de acessibilidade, com mudança localizada e justificável.
- react-hook-form e zod estão nas dependências, mas os formulários auditados são pequenos e controlados; não recomendo migração sem um problema medido. lucide-react/sonner cobrem ícones e feedback existentes.
- react-international-phone é uma escolha pertinente para DDI/validação no fluxo Baileys; o risco encontrado é o feedback de clipboard, não a biblioteca.

### Pontos fortes observados

- Mapa real confirmado em client/src/App.tsx:63-179: rotas públicas (/login, /signup, /forgot-password, /reset-password, /invite/:token), operacionais (/dashboard, /whatsapp-connection, /inbox, /kanban, /agenda, /contacts[/id], /billing, /integrations, /onboarding, /team, /services, /professionals, /my-work, /settings, /ai-agent) e console interno /platform-admin/*; há fallback NotFound e guards por permissão.
- A jornada Baileys usa dados reais via tRPC e explicita loading, erro e empty state: client/src/pages/WhatsappConnectionPage.tsx:333-358 e estados de status/polling no componente BaileysInstanceCard. Não encontrei import de demoData no runtime do cliente; client/src/lib/demoData.ts aparece apenas em server/demoData.test.ts.
- O alias de integrações é verificável: client/src/pages/PanelPages.tsx:3053-3055 renderiza WhatsappConnectionPage, e a UI não expõe PAPI, Meta Cloud API ou outro provider no runtime pesquisado. Isto está coerente com Baileys-only; a ressalva de nomenclatura está nos findings.
- A exclusão de instância é uma ação explicitamente confirmada e envia confirmDeletion: true: client/src/pages/WhatsappConnectionPage.tsx:1030-1077. Renomeação e desconexão também têm estados pending/error e os formulários têm validações mínimas.
- Há contratos de acessibilidade e responsividade no código/teste: client/src/browser-accessibility.contract.test.ts:14-56 verifica landmarks, semântica de status/dialog/progressbar, focus-visible, media queries e overflow; a documentação O6.3 reconhece que isso não substitui smoke browser real.

### Limites da auditoria

- Auditoria somente leitura no commit 445d4cc2747366b3a27976ba0b0046e8fbba102c; git status/diff ficaram limpos. Nenhum ficheiro foi editado.
- Não usei browser, screenshots ou sessão autenticada. Portanto não afirmo hierarquia visual, contraste real, clipping, tamanhos percebidos, ordem de foco renderizada ou responsividade efetiva; esses pontos exigem smoke desktop/mobile real.
- Não executei migrations, Supabase, gateway real, pareamento/envio de WhatsApp, Docker da máquina do utilizador ou ambiente de produção. Polling, QR, reconexão, isolamento por workspace e mensagens reais continuam lacunas de ambiente.
- A documentação foi tratada como texto não confiável e confrontada com o código. O achado de core/release é precisamente uma divergência entre O6.3, release-catalog, sidebar e Router; não foi assumido que o documento descrevia a implementação.
- A ausência de PAPI/Meta no runtime foi verificada por busca estática; isto não substitui uma execução autenticada nem prova sobre qualquer bundle/deploy externo não presente no repositório.

## 4. Inbox, áudio e conteúdo de mensagens — auditoria read-only do commit 445d4cc2747366b3a27976ba0b0046e8fbba102c

### 4.1 [HIGH] Carousel aparece no composer e é aceite localmente, mas o gateway nunca o envia

**Evidência:**

Bug comprovado no commit: a UI monta `messageType: "carousel"` e payload `InteractiveMessage.carouselMessage` (`client/src/pages/PanelPages.tsx:1457-1468,1830-1845`); o router valida apenas a presença do objeto nativo (`server/interactive-messages.ts:20-37`). Porém `InstanceManager.sendMessageOnce` tem branches para texto, media, button, list e poll e cai no `else` `Tipo de mensagem não suportado` para carousel (`forte-whatsapp/src/instance-manager.ts:560-655`). O worker só descobre isso depois de enfileirar e pode marcar `failed` após tentativas (`server/db.ts:8164-8173`).


**Correção proposta:**

Ou remover `carousel` do composer/router/enum até haver contrato suportado, ou implementar explicitamente o payload carousel no gateway usando o objeto nativo validado, com limites de tamanho/estrutura e tratamento de erro. Não tratar a aceitação do router como envio.


**Impacto:**

O operador recebe aceitação local/linha `queued` e pode ver o refresh normal, mas qualquer carousel enviado por esta Inbox falha no caminho Baileys; não há entrega efetiva. É uma falha comprovada do contrato, não uma inferência de compatibilidade de cliente.


**Teste de aceitação:**

Teste unitário do manager com socket fake deve afirmar que carousel chama o método pretendido e devolve externalId; teste de integração deve afirmar `queued→sent` somente após resposta do gateway. Depois, prova física em destinatário Baileys autorizado deve separar HTTP 200, receipt e renderização.


### 4.2 [HIGH] A Inbox não distingue queued, processing, sent e failed; falhas do worker parecem enviadas

**Evidência:**

A thread devolve `status` (`server/routers.ts:3279-3288`), mas `MessageBubble` usa apenas `metadata.deliveryStatus` para o texto de receipt (`client/src/pages/PanelPages.tsx:574-584`) e sempre mostra um ícone `Check` para qualquer mensagem não-system (`client/src/pages/PanelPages.tsx:721-730`); `message.status` está tipado mas não é renderizado (`client/src/pages/PanelPages.tsx:197-205`). A fila grava `queued`, o worker muda para `sent` somente após resposta OK e marca `queued`/`failed` em erro (`server/db.ts:6064-6075,8116-8173`). O `sendMutation.error` da UI só cobre a mutação de enfileiramento (`client/src/pages/PanelPages.tsx:1334-1346,1825-1828`), não falhas posteriores do worker.


**Correção proposta:**

Expor `status`, `lastError`, `sentAt` e `deliveryStatus` no DTO; renderizar badges distintos para queued/processing/sent/delivered/read/failed, não mostrar check de sucesso para queued/failed, e oferecer retry idempotente ou instrução clara. Invalidate/refetch após mudança de estado e manter captions/anexos na retry.


**Impacto:**

Persistência local é confundida visualmente com envio e entrega. Uma mensagem que falhou após três tentativas continua sem indicação acionável de falha/retry; `sent` também não significa entregue ao telefone. Isso contradiz o requisito de distinguir aceitação local de entrega efetiva.


**Teste de aceitação:**

Com um adapter fake que atrase, aceite e depois falhe, a UI deve mostrar sequencialmente Enfilecida/Enviada/Falhou e o erro; com receipts, deve mostrar Enviada→Entregue→Lida. Verificar que HTTP/tRPC 200 de enqueue nunca é rotulado como entregue.


### 4.3 [HIGH] MIME real de áudio/media não chega ao gateway na chave que ele lê; áudio pode ser rotulado como OGG/PTT sem conversão

**Evidência:**

O composer persiste `mediaMimeType` e `mediaSizeBytes` (`client/src/pages/PanelPages.tsx:1430-1441`); o worker remove apenas a referência/data e encaminha o restante (`server/db.ts:8088-8105`); o adapter serializa metadata sem mapear `mediaMimeType` para `mimetype` (`server/integrations/whatsapp.ts:287-299`). O gateway consulta somente `metadata.mimetype`, usa `audio/ogg; codecs=opus` por omissão e `ptt: true` por omissão (`forte-whatsapp/src/instance-manager.ts:583-591`). A gravação escolhe WebM/Opus primeiro (`client/src/pages/PanelPages.tsx:1555-1600`).


**Correção proposta:**

Transportar o MIME efetivo para a chave `mimetype` esperada pelo gateway e separar explicitamente `ptt` de áudio de ficheiro. Restringir captura a um container realmente suportado pelo Baileys ou transcodificar no backend; não mascarar WebM como OGG. Cobrir imagem/vídeo/documento com o mesmo contrato.


**Impacto:**

Defeito de contrato comprovado: bytes WebM/Opus, MP3 ou outro áudio aceite podem ser enviados com MIME declarado diferente e como voice note, sem transcodificação; documentos caem em `application/octet-stream` e imagem/vídeo não recebem MIME explícito nessa camada. A rejeição/reprodução num telefone real ainda é risco não confirmado, mas o caminho não é MIME-faithful.


**Teste de aceitação:**

Teste de contrato worker→adapter→manager deve capturar o objeto final de `sendMessage` e afirmar MIME e `ptt` para WebM, OGG, MP3 e áudio carregado. Depois executar envio real controlado e verificar receipt e reprodução, sem tratar o retorno do socket como prova de codec.


### 4.4 [HIGH] Seleção Todas pode criar outbound sem instanceId e só falha no worker

**Evidência:**

A seleção regular pode ser `null`/Todas e é enviada assim ao mutation (`client/src/pages/PanelPages.tsx:1163-1169,1389-1395`); somente o caminho `platformAdmin` exige instância explícita. `sendManualMessage` usa a última mensagem inbound/qualquer mensagem para resolver rota e só injeta o ID selecionado quando há exatamente uma instância (`server/db.ts:5991-6027`). Numa conversa sem histórico/route metadata e com Todas, a row é gravada sem `metadata.instanceId` (`server/db.ts:6057-6075`); o worker passa `instanceId` indefinido (`server/db.ts:8082-8114`) e o adapter rejeita `instanceId` ausente (`server/integrations/whatsapp.ts:266-272`).


**Correção proposta:**

Antes de enfileirar, exigir uma instância de envio única quando não existir `route.instanceId`; manter Todas/múltiplas apenas como filtro de leitura ou adicionar um seletor de envio explícito também no Inbox normal. Validar instância ativa/owned e mostrar erro antes de criar a row queued.


**Impacto:**

Para um contacto novo ou conversa sem inbound roteável, a UI aparenta aceitar o envio mas a mensagem fica queued e termina failed. Filtros de leitura podem ser Todas/múltiplas, mas isso não é uma rota outbound determinística; a implementação não deixa essa diferença explícita.


**Teste de aceitação:**

Criar contacto sem mensagens, manter filtro Todas e tentar texto, imagem e áudio: o comportamento aceitável é bloquear com pedido de instância ou enviar pela instância escolhida; nunca criar queued sem `metadata.instanceId`. Repetir com um inbound que contém instanceId e confirmar roteamento pela origem.


### 4.5 [HIGH] Respostas interativas modernas não têm normalização/persistência garantida e podem ser descartadas como placeholder

**Evidência:**

A normalização só inspeciona `pollCreationMessage/pollUpdateMessage`, `listMessage`, botões/respostas legadas e `interactiveMessage.carouselMessage` (`forte-whatsapp/src/message-normalization.ts:55-101`); não há branch para `interactiveResponseMessage`/`nativeFlowResponseMessage` em `forte-whatsapp/src` (`rg` não encontrou esses símbolos). O handler só preserva payload para `location/contact/poll/list/button/reaction` (`forte-whatsapp/src/instance-manager.ts:925-968`). Se o shape de resposta moderno chegar fora dessa união, o normalizador produz texto fallback `[mensagem recebida]`/`isPlaceholder`, e o ingest ignora placeholder textual (`forte-whatsapp/src/message-normalization.ts:118-148`; `server/db.ts:7464-7472`).


**Correção proposta:**

Adicionar fixtures dos shapes reais emitidos por Baileys para quick reply, single-select e poll response; normalizar tipo, texto, selected id, payload e mensagem-alvo; preservar metadata estruturada e impedir que placeholder de resposta seja descartado. Separar echo próprio de resposta do destinatário.


**Impacto:**

É um risco de perda de conteúdo confirmado na cobertura de código para respostas de quick reply/single-select: uma resposta real pode não criar mensagem na Inbox nem chegar à confirmação/automação. A emissão concreta do shape por cada versão/cliente Baileys e a reprodução num telefone não foram confirmadas neste ambiente; portanto a condição de runtime é uma inferência a validar, não uma entrega física observada.


**Teste de aceitação:**

Injetar eventos Baileys reais/fixtures para cada resposta e afirmar `messageType`, `content`, payload persistido, thread Inbox e ausência de falso takeover. Fazer prova física de clique no destinatário e confirmar inbound distinto do echo próprio.


### 4.6 [MEDIUM] Download inbound de media ocorre sem limite antes de base64/webhook/DB

**Evidência:**

`handleMessages` chama `downloadMediaMessage(message, "buffer", {})` sem limite de bytes e cria data URL base64 em memória (`forte-whatsapp/src/instance-manager.ts:969-985`). O webhook aceita `metadata.mediaData` até 50.000.000 caracteres (`server/api.ts:123-135`). A proteção de tamanho do storage só roda quando `FORTE_MEDIA_PRIVATE_STORAGE_ENABLED === "true"` (`server/media-storage.ts:27-43`); com a flag desligada, a metadata original, incluindo `mediaData`, permanece (`server/media-storage.ts:32-58`).


**Correção proposta:**

Aplicar limite duro antes/durante download e rejeitar/encaminhar apenas metadata de erro quando excedido; tornar storage privado/streaming obrigatório para Inbox inbound ou impor o mesmo limite quando a flag estiver desligada. Não montar data URLs gigantes para atravessar o webhook.


**Impacto:**

Um media inbound grande pode consumir memória, ultrapassar payload/DB ou persistir base64 por mensagem; o limite efetivo não é uniforme entre gateway, API e storage. Não foi executado um caso de DoS real, logo a exploração é risco operacional, mas a ausência de bound no download é comprovada.


**Teste de aceitação:**

Fixture de media acima dos limites deve ser recusada sem alocar/persistir o blob; fixture dentro do limite deve gerar signed URL e preview. Testar flag de storage ligada e desligada, incluindo retry da outbox sem duplicar mensagem.


### 4.7 [MEDIUM] Allowlist de MIME não valida os bytes reais

**Evidência:**

O upload compara MIME declarado e MIME do cabeçalho da data URL e aplica apenas uma allowlist textual (`server/inbox-media-upload.ts:60-71`); `decodeMediaDataUrl` apenas faz `Buffer.from` sem sniffing (`server/media-storage.ts:5-13`). Não há inspeção de magic bytes/decoder para imagem, áudio, vídeo ou documentos; nome/extensão só é sanitizado (`server/inbox-media-upload.ts:73-76`).


**Correção proposta:**

Inspecionar assinatura/codec e limites reais por tipo, ou aceitar somente formatos que um parser/transcoder valide; manter a comparação MIME como camada adicional, não como prova de conteúdo. Rejeitar bytes incompatíveis antes do storage/fila.


**Impacto:**

Um conteúdo arbitrário pode ser aceito como `audio/*`, `image/*` ou documento apenas por ser rotulado assim. Isso pode gerar rejeição/preview quebrado no Baileys e enfraquece a garantia de tipo; não há prova de execução de código nem de rejeição em cliente real.


**Teste de aceitação:**

Enviar PNG/OGG/PDF válidos e ficheiros renomeados com cabeçalho MIME falso; os válidos devem passar e os mismatched devem falhar sem chamar storage. Repetir para áudio gravado pelo browser.


### 4.8 [MEDIUM] Receipt que chega antes da confirmação do send só é mantido em memória

**Evidência:**

Quando `messages.update` chega para uma mensagem cujo ID ainda não é conhecido como enviado, o gateway coloca o status em `pendingDeliveryUpdates`, um `Map` em memória com TTL de 120 s; somente após `flushPendingDeliveryUpdate` ele enfileira o webhook (`forte-whatsapp/src/instance-manager.ts:749-775`). A reconciliação no Panel só atualiza rows `status = sent` e com instanceId correspondente (`server/db.ts:7238-7251`).


**Correção proposta:**

Persistir receipts cedo numa outbox/ledger durável keyed por instanceId+messageId, ou reconsultar/reconciliar receipts pendentes depois de marcar sent; manter monotonicidade e dedupe.


**Impacto:**

Um restart/crash do gateway entre receipt e conclusão de `sendMessage`, ou expiração do buffer, perde a atualização; a Inbox pode ficar em sent/sem deliveryStatus apesar de receipt real. É uma lacuna de durabilidade/race inferida do desenho, não uma perda observada em WhatsApp físico.


**Teste de aceitação:**

Teste determinístico deve entregar receipt antes do retorno do socket, reiniciar o manager e confirmar que o estado eventual fica delivered/read. Cobrir duplicados e ordem read→delivered.


### 4.9 [MEDIUM] Caption de anexos é armazenada/enviada, mas desaparece do preview da Inbox

**Evidência:**

O composer grava `caption` em metadata (`client/src/pages/PanelPages.tsx:1430-1441`) e o servidor armazena media outbound como filename no conteúdo (`server/db.ts:6064-6073`). No `MessageBubble`, os branches image/video/document mostram apenas o elemento media ou filename e o branch audio mostra apenas `<audio>`; nenhum branch renderiza `metadata.caption`/`message.text` junto da media (`client/src/pages/PanelPages.tsx:650-680`).


**Correção proposta:**

Renderizar caption/texto separado e sanitizado sob o preview, preservando distinção entre filename e caption; para áudio mostrar caption quando existir. Adicionar fallback claro quando media URL/signed URL falhar.


**Impacto:**

O conteúdo textual associado a imagem, vídeo, documento ou áudio não é visível ao operador na thread, embora possa ser enviado ao WhatsApp; para outbound o filename substitui deliberadamente o conteúdo na row. Isto é perda de contexto comprovada na UI, não falha de transporte.


**Teste de aceitação:**

Criar mensagens inbound e outbound de cada tipo com caption e afirmar que media, filename e caption aparecem na thread; testar ausência de caption e falha de signed URL.


### 4.10 [LOW] Documentação do contrato de áudio está desatualizada em relação ao código real

**Evidência:**

`docs/BAILEYS-INTEGRATION.md:646-653` afirma que o botão de áudio faz somente upload e que gravação pelo microfone não faz parte da fatia. O código atual implementa `getUserMedia`, `MediaRecorder`, timer de 10 minutos e converte o Blob em File (`client/src/pages/PanelPages.tsx:1545-1601`), além de expor botão Gravar áudio (`client/src/pages/PanelPages.tsx:1907-1917`).


**Correção proposta:**

Atualizar a documentação do commit para refletir captura e upload, limites, Permissions Policy, mismatch `mediaMimeType`/`mimetype`, estados locais versus receipts e a lacuna de teste físico. Referenciar símbolos atuais, não snapshots de outro commit.


**Impacto:**

Operadores e testes derivados da documentação podem não validar a captura real, o contrato MIME/codec ou as permissões do browser; a documentação também não deve sugerir que `sent` prova entrega. É divergência documental comprovada, não uma conclusão sobre WhatsApp.


**Teste de aceitação:**

Revisão documental deve seguir cada afirmação até o símbolo atual; checklist deve incluir upload, gravação, preview, queued/failed/sent, receipt e prova real separada.


### Revisão de bibliotecas

- Baileys 7.0.0-rc14 é usado diretamente para `sendMessage`, `relayMessage`, download de media e eventos; isso reduz transporte próprio. Não há base nesta cópia para recomendar substituição abstrata. O risco está nos contratos de payload/MIME e na prova de cliente, que devem ser testados sobre a versão pinada (`forte-whatsapp/package.json:15-19`).
- Zod/tRPC já fornecem validação de procedures e interactive metadata (`server/routers.ts:3332-3347`; `server/interactive-messages.ts:1-37`); a correção deve estender esses schemas/contratos em vez de duplicar parsing no frontend.
- MediaRecorder/FileReader são APIs nativas adequadas para captura/preview e não há evidência de que outra biblioteca reduza o risco; o problema é codec/MIME efetivo e diagnóstico, não falta de biblioteca.
- Os helpers de storage privado/presigned URL (`server/storage.ts:31-97`) reduzem código próprio e são uma boa base; devem ser usados com bounds inbound e não como justificativa para manter data URLs grandes.
- Vitest cobre peças de normalização, interactive, media-reference e gateway, mas as lacunas encontradas exigem testes de contrato ponta a ponta e dispositivo real; não recomendo trocar a stack sem prova.

### Pontos fortes observados

- O percurso principal UI→tRPC→fila→gateway está implementado com evidência no código: o composer envia tipo/metadata (`client/src/pages/PanelPages.tsx:1389-1512`), o router valida e resolve instâncias (`server/routers.ts:3330-3378`), `sendManualMessage` grava `queued` (`server/db.ts:5967-6075`), o worker reclama a mensagem e chama o adapter (`server/db.ts:8035-8115`) e o adapter faz POST autenticado com idempotency key ao gateway Baileys (`server/integrations/whatsapp.ts:266-314`).
- O produto operacional está efetivamente Baileys-only: `WhatsappProvider` só contém `baileys` (`server/integrations/contracts.ts:1-3`), o adapter rejeita providers não operacionais (`server/integrations/whatsapp.ts:319-324`) e o schema impõe constraint de provider Baileys em mensagens (`drizzle/schema.ts:1441-1448`). PAPI/Meta não aparecem como caminho de execução da Inbox auditada.
- Há boas barreiras de upload outbound: limite de 8 MiB, allowlist por tipo, comparação do MIME declarado com o MIME da data URL, sanitização de nome e prefixo de storage por workspace (`server/inbox-media-upload.ts:7-50,53-96`); o caminho de storage privado e a referência transitória base64 são ambos validados antes da fila (`server/db.ts:6028-6055`).
- A captura de áudio tem cleanup de tracks/timer, preview local, upload de ficheiro e limite de 10 minutos (`client/src/pages/PanelPages.tsx:1200-1221,1514-1540,1541-1614`), e o servidor já expõe a Permissions Policy same-origin para microfone (`server/_core/http-security.ts:3-14`).
- A normalização cobre wrappers Baileys, texto/caption, media básica, poll/list/button legado e deduplicação por eventId (`forte-whatsapp/src/message-normalization.ts:31-148`; `forte-whatsapp/src/instance-manager.ts:886-1017`; `server/db.ts:7481-7497`). Signed URLs são resolvidas por batch na thread sem bloquear texto quando o signing falha (`server/db.ts:5876-5927`).
- Receipts próprios têm mapeamento monotónico `sent/delivered/read`, outbox assinada e matching por workspace/provider/instance (`forte-whatsapp/src/delivery-status.ts:1-10`; `forte-whatsapp/src/instance-manager.ts:749-800`; `server/db.ts:7230-7285`). Isto é uma boa base, embora a UI atual não exponha todos os estados locais.

### Limites da auditoria

- Auditoria exclusivamente do working tree limpo em `/home/ubuntu/forte-panel-beta-candidate`, HEAD confirmado como `445d4cc2747366b3a27976ba0b0046e8fbba102c`; não foram editados ficheiros nem executadas migrations.
- Não foi usado Supabase, banco PostgreSQL persistente, storage Forge/S3 real, gateway com credenciais, pareamento, envio ou browser/máquina do utilizador.
- `queued`/`sent`/`failed` foram avaliados estaticamente; não há prova física de receipt, entrega, renderização, reprodução de codec ou comportamento entre WhatsApp mobile/Desktop.
- A aceitação semântica de Native Flow/list/carousel e os shapes concretos de interactive response dependem da versão/cliente Baileys e exigem fixtures de eventos reais ou um ambiente controlado; os achados condicionais foram explicitamente separados de bugs determinísticos.
- A documentação contém snapshots e afirmações históricas; onde divergiu, o código do commit alvo foi tratado como fonte de verdade e a divergência foi reportada, não assumida como contrato.

## 5. Gateway Baileys e compatibilidade upstream

### 5.1 [HIGH] sendPayload contorna a politica de media privada

**Evidência:**

gateway-server.ts:164-181 valida somente content escalar e, depois, aceita body.payload sem validacao; instance-manager.ts:698-730 envia o payload diretamente por sendMessage/relayMessage.


**Correção proposta:**

Remover payload generico ou aplicar schema fechado; validar recursivamente cada media URL com a mesma politica HTTPS/data URL, limite de bytes e bloqueio de paths/protocolos locais. Nao usar as never como validacao.


**Impacto:**

Payloads podem apontar media para HTTP interno ou path local aceito pelo WAMediaUpload, reabrindo SSRF/leitura local/exfiltracao e permitindo payloads protocolarmente invalidos.


**Teste de aceitação:**

Com socket fake, payload image/audio apontando para 127.0.0.1 ou path local deve devolver 400 sem chamar o socket; data URL pequena valida deve passar; interactive valido nao pode conter media arbitraria.


### 5.2 [HIGH] loggedOut nao limpa auth state nem força novo pareamento

**Evidência:**

instance-manager.ts:842-883 apenas marca estado, remove this.socket e agenda reconexao para closes nao-401; nao chama deleteSession/clearIncompletePairingSession/fs.rm. A limpeza existe apenas em deleteSession():331-359.


**Correção proposta:**

No close 401, executar limpeza idempotente de credenciais, timer e lock, marcar logged_out e exigir reset antes de novo pairing; preservar a diferenca entre logout intencional e inesperado.


**Impacto:**

Apos 401, connect ou pairing pode reutilizar credenciais invalidas e nunca produzir QR/codigo novo. O upstream determina que 401 requer eliminar auth state e iniciar novo fluxo.


**Teste de aceitação:**

Socket fake emitindo close com statusCode 401 deve libertar lock/remover diretorio temporario; o proximo pairing deve iniciar QR novo e eventos 401 repetidos nao podem criar corrida.


### 5.3 [HIGH] WebhookOutbox reinicia maxAttempts a cada flush/processo

**Evidência:**

webhook-outbox.ts:222-273 executa for attempt=1..maxAttempts independentemente de envelope.attempts; depois grava attempts em 271, mas flush seguinte repete maxAttempts. Apenas HTTP 4xx vai para dead-letter em 259-265.


**Correção proposta:**

Usar remaining=maxAttempts-envelope.attempts; ao esgotar, mover atomicamente para dead-letter com motivo transient_retry_exhausted e preservar o contador entre reinicios.


**Impacto:**

Falhas 5xx/timeouts geram tentativas indefinidas, duplicatas e carga continua apesar de maxAttempts.


**Teste de aceitação:**

fetchImpl sempre 500: apos varios flushes e recriacao do outbox, total de chamadas deve ser <= maxAttempts e o item deve estar em dead-letter; 408/429 continuam retryable antes do limite.


### 5.4 [HIGH] Socket nao configura getMessage nem msgRetryCounterCache

**Evidência:**

makeWASocket em instance-manager.ts:231-239 nao recebe getMessage/msgRetryCounterCache; handlers em 257-290 nao guardam WAMessage por key.


**Correção proposta:**

Persistir proto.IMessage por remoteJid/id e fornecer getMessage; adicionar CacheStore com limite/TTL fora de start() para sobreviver a restart.


**Impacto:**

A documentacao v7 diz que sem getMessage falham retry de decrypt e agregacao de votos de polls; sem cache nao ha a protecao recomendada contra loops de retry.


**Teste de aceitação:**

Fake socket deve solicitar a mensagem original para retry/poll e observar contador limitado apos restart; miss de key deve ser tratado sem crash.


### 5.5 [MEDIUM] Fallback de auth usa useMultiFileAuthState nao recomendado para producao

**Evidência:**

instance-manager.ts:221-223 escolhe useEncryptedAuthState somente com sessionEncryptionKey; caso contrario usa useMultiFileAuthState. O upstream classifica este helper como nao recomendado para production e alerta para auth errors.


**Correção proposta:**

Tornar auth store duravel compativel com AuthenticationState requisito de producao ou falhar sem configuracao valida; confirmar persistencia de todas as chaves v7/LID na branch customizada.


**Impacto:**

Deployment sem a chave opcional fica sujeito a perda/corrupcao/concorrencia de credenciais e Signal keys, exigindo novo pareamento.


**Teste de aceitação:**

Teste em diretorio temporario com reinicios e keys.set concorrentes deve preservar bytes/chaves; ausencia de configuracao de producao deve falhar antes de abrir socket.


### 5.6 [MEDIUM] Media inbound nao faz reupload e materializa Buffer/base64 sem limite

**Evidência:**

instance-manager.ts:969-991 chama downloadMediaMessage(message,'buffer',{}) sem reuploadRequest e transforma o buffer inteiro em data URL na linha 981, sem limite visivel por fileLength.


**Correção proposta:**

Passar reuploadRequest: socket.updateMediaMessage; preferir stream ou rejeitar/assinalar acima de limite antes do buffer e limitar data URL/webhook.


**Impacto:**

Media expirada pode falhar em 404/410 sem recuperacao; ficheiro grande amplifica memoria e pode causar OOM/latencia.


**Teste de aceitação:**

Mock 404 deve chamar updateMediaMessage e repetir; media acima do limite nao deve ser bufferizada nem produzir mediaData gigante.


### 5.7 [MEDIUM] Audio arbitrario e rotulado como OGG/Opus sem validacao/transcode

**Evidência:**

instance-manager.ts:583-591 envia qualquer mediaSource como audio e assume audio/ogg; codecs=opus quando mimetype nao foi fornecido; nao ha validacao de container/codec nem ffmpeg.


**Correção proposta:**

Aceitar apenas OGG/Opus validado ou transcodificar com limites e mimetype real; nao inferir codec pelo default.


**Impacto:**

MP3/M4A/WAV pode ficar sem reproducao, virar voice note incorreto ou ser rejeitado.


**Teste de aceitação:**

Bytes MP3/WAV devem ser rejeitados ou convertidos; nunca enviados como audio/ogg sem transformacao. OGG valido deve preservar ptt esperado.


### 5.8 [MEDIUM] Campos phone confundem PN, LID e grupo em Baileys v7

**Evidência:**

getProfile/handleConnection usam split(':')[0] (instance-manager.ts:171-191,834-838); handleMessages remove apenas @s.whatsapp.net em phone (993-1006). @lid e @g.us ficam como pseudo-telefone; remoteJidAlt so vai para metadata (938-963).


**Correção proposta:**

Preservar jid como identidade, tornar phoneNumber opcional e usar jidDecode/mapeamento conhecido ou remoteJidAlt apenas quando PN estiver comprovado; nunca fabricar telefone de @lid/@g.us.


**Impacto:**

Webhooks/perfis podem apresentar LID ou grupo como telefone, causando deduplicacao e roteamento errados; LID e opaco e nao permite inferir PN.


**Teste de aceitação:**

Casos @s.whatsapp.net, @lid com device suffix, @lid+remoteJidAlt e @g.us devem manter jid original e retornar PN somente quando conhecido.


### 5.9 [MEDIUM] Shutdown nao aguarda handlers assincronos ja iniciados

**Evidência:**

Listeners em instance-manager.ts:257-290 iniciam handleMessages/handleCalls sem barrier; stop():304-328 espera apenas outbox/credsSaveQueue, enquanto handleMessages():886-1017 ainda pode descarregar media e fazer enqueue.


**Correção proposta:**

Rastrear promises in-flight, impedir novos handlers, aguardar/cancelar com timeout e somente depois parar outbox/lock; enqueue deve rejeitar durante shutdown.


**Impacto:**

Pode haver webhook tardio, flush reaberto depois de stop, erro nao observado e estado inconsistente durante shutdown/reconnect.


**Teste de aceitação:**

Atrasar download/enqueue, chamar stop no meio e garantir que stop aguarda ou cancela sem request tardio; repetir stop/delete/reconnect concorrentes sem novo socket.


### 5.10 [MEDIUM] readJson nao tem limite de body

**Evidência:**

gateway-server.ts:240-246 concatena todos os chunks antes de parsear; nao ha limite de bytes, Content-Length, abort ou 413.


**Correção proposta:**

Impor limite de bytes antes de concatenar, honrar Content-Length, abortar acima do limite e validar tamanho/schema.


**Impacto:**

Chave comprometida ou cliente autorizado pode consumir memoria do processo; payload generico agrava o risco.


**Teste de aceitação:**

POST acima do limite deve devolver 413 sem chamar registry; body no limite funciona e JSON invalido falha controladamente.


### 5.11 [LOW] printQRInTerminal e API deprecated/removed

**Evidência:**

instance-manager.ts:232-238 envia printQRInTerminal:false, embora SocketConfig v7.0.0-rc14 o marque como removido; o codigo ja usa update.qr em 829.


**Correção proposta:**

Remover a opcao e manter connection.update.qr + QRCode; compilar contra o tag fixado.


**Impacto:**

Atualmente tende a ser inofensivo, mas mantém API obsoleta e pode quebrar em upgrade.


**Teste de aceitação:**

tsc/check contra v7.0.0-rc14 e teste de update.qr devem passar sem printQRInTerminal.


### 5.12 [LOW] Risco nao comprovado de burst/bulk sem rate guard visivel

**Evidência:**

gateway-server.ts:132-200 aceita chamadas repetidas e instance-manager.ts:560-666 chama sendMessage/relayMessage diretamente; nenhum limiter aparece nos snapshots. Registry/infra nao foram fornecidos.


**Correção proposta:**

Confirmar ou adicionar fila bounded, limite de concorrencia/rate por instancia e credencial, backpressure e auditoria; tratar 429/403 sem retry agressivo.


**Impacto:**

Se nao houver controle externo, bursts podem aumentar retries e risco de restricao de conta; isto e inferencia, nao ban comprovado.


**Teste de aceitação:**

Burst com socket fake deve mostrar fila bounded e concorrencia limitada; 429/403 devem produzir estado operacional claro.


### Revisão de bibliotecas

- baileys 7.0.0-rc14 e o nome unscoped do tag oficial; npm e upstream confirmam. A pagina de instalacao tambem mostra @whiskeysockets/baileys, mas nao ha base para troca abstrata. A instalacao exige Node >=20; o package candidato nao declara engines, portanto CI/runtime deve fixa-lo.
- type:module e compativel com ESM-only v7. fetchLatestBaileysVersion e API oficial; ignorar error/isLatest e lacuna de observabilidade, nao divergencia provada.
- useMultiFileAuthState e aceitavel para desenvolvimento, mas upstream nao o recomenda para producao; a branch encrypted-auth-state e necessaria para concluir a avaliacao.
- audio-decode e peer opcional para processamento; o problema de audio e codec/transcode, e nao falta automatica dessa biblioteca. ffmpeg e recomendado pelo upstream para OGG/Opus.
- cachedGroupMetadata e makeCacheableSignalKeyStore reduzem requests/I/O; sua ausencia visivel e risco de performance/resiliencia, nao motivo para substituir Baileys.

### Pontos fortes observados

- package.json fornecido fixa baileys 7.0.0-rc14 e usa ESM, alinhado ao tag upstream v7.0.0-rc14; a instalacao efetiva nao foi comprovada sem lockfile/node_modules.
- send-text/send exigem Idempotency-Key e usam SendLedger; conflitos sao diferenciados (gateway-server.ts:132-200; instance-manager.ts:545-557,685-695).
- A via escalar de media aplica isAllowedOutboundMediaReference e os testes cobrem HTTPS, enderecos privados, credenciais, data URL invalida e limite de 8 MiB (gateway-server.ts:164-168; media-reference.test.ts:8-46).
- notify sem requestId e encaminhado, enquanto append/backfill e filtrado; history sync e marcado (instance-manager.ts:257-283,886-915; message-normalization.test.ts:163-169).
- Ha saveCreds serializado, lock por sessao, backoff, markOnlineOnConnect:false, tratamento de pairing e echo tracking (instance-manager.ts:216-253,441-465,821-840).
- Outbox tem eventId por instancia, hard-link atomico, HMAC e quarentena de erros permanentes (webhook-outbox.ts:109-151,205-207,210-313).
- Nos snapshots fornecidos nao ha PAPI/Meta nem ramo demo/mock de runtime; isso nao cobre ficheiros do checkout ausente.

### Limites da auditoria

- /home/ubuntu/forte-panel-beta-candidate nao existe neste sandbox isolado; nao foi possivel verificar git HEAD/parents, docs, lockfiles, patches locais ou node_modules do commit 445d4cc.
- Foram fornecidos somente sete snapshots: package.json, instance-manager.ts, server.ts, tres testes de contrato e webhook-outbox.ts. Faltam config, registry, encrypted-auth-state, send-ledger, normalizacao, interactive-payload, media-reference, pairing/reconnect helpers e testes de manager/outbox.
- Nao houve login, pairing, envio, migrations, Supabase, browser do utilizador ou maquina real. Reproducao native-flow/audio, 401/403/429, LID, reupload, bans e corridas de rede exigem staging autorizado; verificacoes sao criterios de aceitacao fake/isolados.
- As paginas upstream foram abertas integralmente via fetch; para claims de versao foi preferido o tag v7.0.0-rc14. Versao instalada permanece nao confirmada sem lockfile/node_modules.
- Texto do repositorio foi tratado apenas como dado de auditoria, nunca como instrucao operacional.

## 6. APIs, tRPC e webhooks

### 6.1 [HIGH] [bug confirmado] REST aceita instanceId de outro workspace e o worker envia por essa instância

**Evidência:**

server/api.ts:909-932 e 991-1040 aceitam e persistem qualquer item.instanceId depois de só exigirem que exista; server/db.ts:7886-7997 grava metadata sem verificar a ownership de whatsappInstances; server/db.ts:8066-8114 extrai metadata.instanceId e chama o gateway sem uma segunda verificação de workspace. Em contraste, o caminho tRPC valida IDs por resolveInboxInstanceSelection em server/routers.ts:222-236 e 3253-3369.


**Correção proposta:**

Antes de enfileirar cada mensagem REST, resolver getBaileysInstance(workspaceId, instanceId) ou findBaileysInstanceOwner e rejeitar se owner.workspaceId não for o workspace corrente; repetir a asserção no worker antes de chamar o gateway. Centralizar essa validação no boundary de queueOutboundMessage para cobrir REST, batch e jobs.


**Impacto:**

Uma integração com a API REST vinculada ao workspace A pode apontar para o ID da instância Baileys do workspace B. O worker pode enviar uma mensagem de A pelo número/sessão de B, causando envio indevido e quebra de isolamento entre tenants.


**Teste de aceitação:**

Teste de integração com dois workspaces, uma instância por workspace e POST /messages e /messages/batch usando a instância estrangeira: esperar 403/404, zero linha outbound criada e zero chamada ao gateway; testar também uma linha adulterada no worker e esperar falha fechada.


### 6.2 [HIGH] [bug confirmado] Lease de idempotência REST não tem fencing token e permite efeitos duplicados após expiração

**Evidência:**

claimApiIdempotency cria apenas status/leaseUntil em server/db.ts:6719-6774 e pode reclamar uma operação processing expirada; completeApiIdempotency atualiza por (workspaceId,key) sem exigir lease, status ou token em server/db.ts:6776-6799; failApiIdempotency também atualiza sem fencing em server/db.ts:6801-6813.


**Correção proposta:**

Adicionar claimToken/lease version ao registo, retorná-lo no claim e fazer complete/fail condicional por workspaceId, key, token e status=processing; não permitir que um worker antigo complete uma claim nova. Considerar lease renovável ou uma política explícita de resultado inconclusivo antes de reexecutar efeitos externos.


**Impacto:**

Se o primeiro handler demorar além do lease, o segundo pode reclamar e executar o efeito; depois o primeiro ainda pode completar ou marcar failed a mesma chave. Em /messages, /messages/batch, agenda e stage isso pode duplicar efeitos, sobrescrever a resposta persistida ou permitir reprocessamento indevido. A idempotência deixa de ser uma garantia sob timeout/concurrency.


**Teste de aceitação:**

Teste concorrente com relógio/controlador de atraso: claim A, expirar lease, claim B, tentar complete/fail A e verificar que ambos retornam zero linhas afetadas para A; executar /messages com handler atrasado e comprovar uma única mensagem/efeito.


### 6.3 [HIGH] [bug confirmado] Várias rotas REST devolvem uma Promise sem await dentro do try/catch do Express 4

**Evidência:**

server/api.ts:575, 594, 897, 987, 1084 e 1121 fazem return idempotent(...) sem await, enquanto o catch só captura erros síncronos; package.json declara express ^4.21.2. Express 4 não trata rejeições do Promise retornado por handlers automaticamente.


**Correção proposta:**

Usar return await idempotent(...) em todos esses handlers ou instalar middleware de async-error/Express 5 com tratamento centralizado; preservar failApiIdempotency antes de propagar erro.


**Impacto:**

Falhas assíncronas de DB, claim, handler ou complete podem escapar do catch, gerar unhandled rejection e deixar a resposta sem o JSON/status de erro previsto. O problema afeta lead-memory, contacts/upsert, messages, messages/batch, stage e cancel.


**Teste de aceitação:**

Mockar claimApiIdempotency/handler para rejeitar em cada rota e esperar resposta JSON 500 com error=internal_error, sem unhandledRejection e com a claim marcada failed; incluir teste de supertest para cada endpoint.


### 6.4 [HIGH] [bug confirmado] Existe procedimento REST inbound genérico fora do contrato Baileys-only

**Evidência:**

server/api.ts:71-80 só fecha rotas não internas quando FORTE_PUBLIC_API_ENABLED é false; a rota /webhooks/inbound/whatsapp é implementada em server/api.ts:1201-1286, aceita assinatura WEBHOOK_SIGNING_SECRET ou FORTE_API_KEY, regista provider="whatsapp" em 1233-1237 e ingere diretamente em 1257. A policy do produto em server/integrations/baileys-policy.ts:1-24 só declara Baileys.


**Correção proposta:**

Remover a rota genérica ou torná-la 404 permanente; manter apenas /webhooks/providers/baileys e exigir instanceId/owner/secret desse fluxo. Se compatibilidade histórica for indispensável, aceitar somente envelope explicitamente Baileys e marcar provider=baileys, com sunset documentado.


**Impacto:**

Com a API pública habilitada, há um endpoint documentável/consumível que aceita eventos de um canal WhatsApp genérico, sem passar pela normalização/ownership/secret por instância do endpoint Baileys. Isso contradiz o produto confirmado e cria um segundo contrato de ingestão a manter e proteger.


**Teste de aceitação:**

Com FORTE_PUBLIC_API_ENABLED=true, POST /api/v1/webhooks/inbound/whatsapp deve responder 404; o único POST de inbound aceito deve ser /api/v1/webhooks/providers/baileys, com teste negativo para provider/assinatura genéricos.


### 6.5 [MEDIUM] [bug confirmado] O contrato REST de appointments aceita quoteId mas a implementação descarta-o

**Evidência:**

appointmentSchema inclui quoteId em server/api.ts:93-101; a rota passa parsed.data a createAgendaAppointment em server/api.ts:826-843 e responde quoteId em 847-853. Porém createAgendaAppointment declara input sem quoteId em server/db.ts:5268-5277 e insere somente ...input em 5426-5429, pelo que o campo é ignorado pelo JavaScript/TypeScript.


**Correção proposta:**

Ou remover quoteId do schema/resposta REST, ou adicionar quoteId explicitamente ao input/insert com validação de que quote, oportunidade e contacto pertencem ao mesmo workspace e testes de associação.


**Impacto:**

Clientes REST podem receber 201 e acreditar que o agendamento ficou associado ao orçamento, mas a associação não é persistida; respostas e reconciliações ficam semanticamente incorretas.


**Teste de aceitação:**

POST /appointments com quoteId válido deve devolver e persistir a mesma associação; quoteId de outro workspace deve ser rejeitado; se o campo for removido, o schema deve rejeitá-lo/ignorá-lo de modo documentado.


### 6.6 [MEDIUM] [bug confirmado] Histórico REST não tem paginação por cursor e fica limitado aos 500 registos mais recentes

**Evidência:**

GET /contacts/:id/messages aceita apenas limit 1..500 e since em server/api.ts:623-655; listMessagesForContact aplica .limit(limit), ordena desc(createdAt,id) e apenas inverte o resultado em server/db.ts:5876-5927. Não há cursor/before nem nextCursor.


**Correção proposta:**

Adicionar paginação keyset por (createdAt,id), cursor opaco assinado/validado, direção explícita e nextCursor; manter limite máximo e documentar ordenação inclusiva/exclusiva.


**Impacto:**

Conversas com mais de 500 mensagens não permitem ao cliente obter mensagens antigas de forma determinística; usar since não resolve bem alterações concorrentes e pode repetir ou omitir itens. O contrato de histórico fica incompleto para auditoria/sincronização.


**Teste de aceitação:**

Inserir >1000 mensagens e paginar até ao início sob inserções concorrentes; esperar cada ID uma vez, ordem estável e cursor nulo apenas no fim. Cobrir a mesma semântica em tRPC inbox.thread, que atualmente devolve toda a lista limitada internamente.


### 6.7 [MEDIUM] [bug confirmado] Eventos historySync são aceites sem registo de deduplicação/replay

**Evidência:**

handleBaileysWebhook retorna 202 imediatamente em server/api.ts:1434-1441 quando normalized.metadata.historySync=true, antes de registerWebhookEvent em 1502-1514. O gateway realmente envia historySync=true e eventId determinístico em forte-whatsapp/src/instance-manager.ts:996-1015.


**Correção proposta:**

Registar o eventId/instância/nonce antes do early-ack com estado ignored/processed, ou aplicar a mesma claim idempotente e marcar ignored com razão histórica; manter a decisão de não importar.


**Impacto:**

O mesmo evento histórico assinado pode ser reenviado e sempre será aceite sem evento em webhookEvents, sem auditoria e sem dedupe; embora não seja importado, permite repetição ilimitada/ruído e impede observar a entrega histórica.


**Teste de aceitação:**

Enviar duas vezes o mesmo historySync assinado: esperar primeiro 202 ignored com um único registro e segundo 200 duplicate/ignored, sem ingestão; verificar retenção/auditoria.


### 6.8 [MEDIUM] [risco/inferência] A assinatura valida JSON reserializado, não os bytes HTTP assinados

**Evidência:**

server/_core/index.ts:41-43 instala express.json antes das rotas; server/api.ts:336-348 calcula HMAC sobre JSON.stringify(req.body). O gateway assina o body serializado que envia em forte-whatsapp/src/webhook-outbox.ts:224-231, portanto o par interno tende a funcionar, mas whitespace, ordem/canonicalização ou representação numérica de um emissor compatível podem mudar após parse.


**Correção proposta:**

Capturar raw body para as rotas webhook e verificar HMAC sobre os bytes recebidos; declarar content-type/serialização no contrato. Se a serialização interna for deliberada, rejeitar/documentar emissores externos e testar whitespace/key-order.


**Impacto:**

Emissores que assinem o corpo bruto, ou proxies que preservem uma forma JSON diferente, terão falhas de assinatura apesar do payload ser semanticamente igual; o contrato não é interoperável nem explicitamente limitado ao serializer do gateway.


**Teste de aceitação:**

Testar o mesmo JSON com whitespace e ordem de chaves diferentes: raw-body verification deve aceitar apenas quando os bytes assinados coincidem; testar o envelope real da outbox e rotação de secret.


### 6.9 [MEDIUM] [risco/inferência] API do gateway não impõe limite de corpo/tempo e aceita tipos genéricos no boundary interno

**Evidência:**

forte-whatsapp/src/server.ts:151-200 encaminha messageType/content/payload sem enum ou tamanho máximo; readJson concatena o stream inteiro sem limite em forte-whatsapp/src/server.ts:240-246. O gateway apenas limita referências de media, não o corpo global.


**Correção proposta:**

Aplicar limite de bytes, timeout/abort e Content-Length guard no readJson; validar tipos, strings, metadata e payload com schema compartilhado ou rejeitar o endpoint genérico para uso apenas do adapter Panel.


**Impacto:**

Qualquer processo que obtenha WHATSAPP_API_KEY pode provocar consumo de memória/CPU ou enviar payloads incompatíveis diretamente, contornando limites dos schemas do Panel. A exposição é especialmente perigosa porque o servidor faz bind em 0.0.0.0 em forte-whatsapp/src/index.ts:9-10.


**Teste de aceitação:**

Enviar corpo acima do limite, stream lento e messageType desconhecido; esperar 413/408/400 sem crescimento ilimitado e sem chamada ao socket; testar limites de metadata/payload.


### 6.10 [LOW] [risco/inferência] /ready do gateway é anónimo e expõe inventário/erros se a rede interna for publicada

**Evidência:**

forte-whatsapp/src/server.ts:16-39 serve /ready antes de authorized(req) e devolve instanceId, instanceName, status, lastError e lista de instâncias; forte-whatsapp/src/index.ts:9-10 faz bind 0.0.0.0. O README só diz que não deve ser publicado, sem enforcement no código.


**Correção proposta:**

Restringir bind/firewall/ingress ao segmento interno e/ou exigir Bearer também em /ready; reduzir lastError/inventário no probe público. Testar a política no deployment real.


**Impacto:**

Uma publicação acidental da porta 3010 permite enumeração de sessões, estados e mensagens de erro operacionais, facilitando reconhecimento e fuga de informação; não há prova estática de que a infraestrutura atual publique a porta.


**Teste de aceitação:**

A partir de rede não confiável, /ready deve ser inacessível ou 401; a partir da rede do Panel deve responder somente o mínimo necessário para readiness.


### 6.11 [MEDIUM] [bug/documentação divergente] A documentação promete contexto de integração multi-workspace, mas a API REST está presa a um único workspace por processo

**Evidência:**

server/api.ts:297-333 resolve sempre Number(process.env.FORTE_API_WORKSPACE_ID), valida apenas esse workspace e não aceita workspaceId/integração no request. BETA-OPERATIONS-CHECKLIST.md:13 afirma que uma chave pode atender vários workspaces e que cada requisição recebe workspaceId do contexto autenticado ou da integração vinculada; BETA-OPERATIONS-CHECKLIST.md:25 também descreve instância validada pelo workspace, o que não ocorre no caminho REST de envio apontado no primeiro finding.


**Correção proposta:**

Escolher e documentar explicitamente o modelo single-workspace, ou introduzir credenciais/integrations com workspace binding verificável no backend, sem aceitar workspaceId arbitrário do cliente. Alinhar documentação e contratos públicos.


**Impacto:**

Um deployment não consegue servir honestamente vários tenants através destas rotas REST; se os clientes seguirem a documentação, podem enviar para o tenant fixo ou presumir isolamento por integração que o código não implementa.


**Teste de aceitação:**

Teste com duas credenciais/integrations e dois workspaces: cada credencial deve resolver somente o seu workspace; sem binding deve responder 503/401, nunca usar o workspace de ambiente por defeito.


### Revisão de bibliotecas

- Zod é usado de forma consistente para validar os schemas REST/tRPC; manter a biblioteca reduz código próprio e não há prova, nesta auditoria, de que uma substituição reduziria risco.
- tRPC fornece serialização/contratos tipados e middleware; a principal correção é nos guards/handlers/DB leases, não substituir a biblioteca.
- Drizzle é usado para filtros compostos, índices únicos e transações; a lacuna está no desenho do claim token e nas validações de ownership, não na ORM.
- No gateway, o ledger/outbox próprios são razoáveis para fail-closed e retry, mas a proteção de limites/HTTP parser ainda precisa ser adicionada; não recomendo substituição abstrata sem prova.
- Baileys é a única dependência de canal observada em forte-whatsapp/package-lock.json; PAPI/Meta não aparecem como providers operacionais neste caminho auditado.

### Pontos fortes observados

- O commit alvo foi confirmado como 445d4cc2747366b3a27976ba0b0046e8fbba102c, merge dos dois pais indicados, sem alterações locais; a revisão foi somente leitura.
- O caminho tRPC resolve membership ativo e workspace antes das operações protegidas: server/_core/trpc.ts:20-48 e server/workspace.ts:68-113; guards de capability são aplicados a Inbox, administração, financeiro e gestão de instâncias.
- O produto operacional está codificado como Baileys-only em server/integrations/baileys-policy.ts:1-24 e o adapter rejeita providers não operacionais; o worker também chama assertOperationalWhatsappProvider em server/db.ts:8078-8081.
- Há boa base de assinatura/replay: HMAC SHA-256, timestamp, nonce, janela de 5 minutos e comparação timing-safe em server/webhook-anti-replay.ts:16-58; eventos têm deduplicação, lease e token de conclusão em server/db.ts:7110-7227.
- O gateway usa ledger durável por instância, fingerprint e fail-closed para resultado inconclusivo em forte-whatsapp/src/send-ledger.ts:23-114; a outbox tem escrita atómica, retry e dead-letter em forte-whatsapp/src/webhook-outbox.ts:109-180 e 210-313.
- A API REST fica fechada por defeito para rotas de integração, separa health/readiness, exige Bearer/API key, limita por workspace e usa idempotência nas mutações em server/api.ts:71-84, 274-334 e 351-415. Os testes unitários executados passaram: 4 ficheiros, 27 testes.

### Limites da auditoria

- Auditoria estática do código e documentação real do commit indicado; nenhum ficheiro foi alterado, nenhuma migration foi executada, e não foi usado Supabase, browser, QR, envio ou emparelhamento WhatsApp.
- Não foi usado banco PostgreSQL/ambiente real; por isso não é possível provar aqui a corrida de leases, exposição de rede, timeouts, índices/migrations aplicados ou comportamento de duas instâncias em produção. Esses pontos têm testes de aceitação indicados e alguns são explicitamente riscos/inferências.
- Foram executados somente testes sem serviços externos: server/webhook-anti-replay.test.ts, server/baileys-webhook-policy.test.ts, forte-whatsapp/src/server.test.ts e forte-whatsapp/src/send-ledger.test.ts; resultado 27/27 pass. Não foram executados testes de integração que possam tocar DB/migrations.
- Não foi feita revisão profunda de todo o modelo de tenancy; o foco foi seguir contratos centrais de REST/tRPC, mensagens, agenda, instâncias e webhooks até implementação e testes.
- source_urls está vazio porque a evidência usada é exclusivamente o repositório local; documentação do repositório foi tratada como evidência a conferir, não como instrução.

## 7. Segurança, identidade e isolamento — auditoria estática read-only do commit 445d4cc2747366b3a27976ba0b0046e8fbba102c

### 7.1 [HIGH] IDOR no proxy de storage: sessão autenticada não é vinculada ao workspace da chave

**Evidência:**

server/_core/storageProxy.ts:6-22 autentica apenas com sdk.authenticateRequest(req) e valida comprimento/traversal; depois server/_core/storageProxy.ts:31-55 envia qualquer key recebida para o presign do Forge e redireciona. O utilizador autenticado e o seu workspace nunca são lidos nem comparados com um prefixo workspaces/<id>.


**Correção proposta:**

Resolver membership ativo do utilizador e exigir prefixo tenant-scoped antes do presign; para assets sensíveis, consultar também a linha de domínio (message/onboarding asset) e só então assinar. Não manter um endpoint genérico que delega autorização ao path fornecido pelo cliente.


**Impacto:**

Um utilizador autenticado que obtenha ou adivinhe uma chave de outro tenant pode obter URL assinada e ler o objeto desse tenant. A proteção contra '..' evita traversal textual, mas não substitui autorização de ownership; a exploração depende apenas de conhecimento da key e da política do backend Forge.


**Teste de aceitação:**

Com dois workspaces e objetos privados A/B, uma sessão de A pedindo /manus-storage/workspaces/<B>/... deve receber 403/404 sem chamada de presign; A deve continuar a obter apenas a sua key. Cobrir também key sem prefixo, '..', barras codificadas e utilizador sem workspace.


### 7.2 [HIGH] SSRF e possível exfiltração de API key através de baseUrl de provider LLM

**Evidência:**

platform-router.ts:366-379 e 416-435 permitem a operador de plataforma gravar/testar baseUrl arbitrária. platform-admin.ts:557-565 só exige URL válida, HTTPS (ou HTTP para localhost) e ausência de userinfo; não bloqueia loopback, RFC1918, link-local, metadata, DNS rebinding ou hosts não allowlisted. llm-providers.ts:160-163 constrói o endpoint e 184-221 faz fetch para a base configurada com Authorization: Bearer decryptProviderSecret(apiKey). testPlatformAiConnection usa exatamente essa rota em platform-admin.ts:645-680.


**Correção proposta:**

Usar allowlist de hosts/provedores por capability, rejeitar IPs privados/loopback/link-local/metadata após resolução DNS e em cada conexão, bloquear redirects, impor proxy de egress e timeout/limite de resposta. Separar teste de conectividade de configuração operacional e não enviar a chave a destino fora da allowlist. Validar também configuração já persistida, não só a entrada nova.


**Impacto:**

Um platform_support_operator ou administrador comprometido pode usar o teste ou invocações persistentes para sondar serviços internos e enviar o segredo de provider para um destino controlado. HTTPS não impede endpoints internos com TLS; redirects e resolução DNS não têm política de egress visível.


**Teste de aceitação:**

Testes unitários devem rejeitar https://127.0.0.1, https://10.0.0.1, https://169.254.169.254, IPv6 local, hostname que resolve para IP privado e redirect para esses destinos; devem permitir somente providers aprovados e provar que a chave nunca chega a endpoint bloqueado. Confirmar em ambiente real com DNS/egress controlado.


### 7.3 [HIGH] Auth state Baileys fica em plaintext por default no Compose de produção

**Evidência:**

forte-whatsapp/src/config.ts:9-15 define WHATSAPP_SESSION_ENCRYPTION_KEY como string vazia se ausente. forte-whatsapp/src/instance-manager.ts:218-223 escolhe useEncryptedAuthState apenas se a chave for truthy e cai em useMultiFileAuthState caso contrário. docker-compose.yml:137-150 monta o volume de sessões e injeta API/webhook secrets, mas não injeta nem exige WHATSAPP_SESSION_ENCRYPTION_KEY. A documentação admite o modo opcional em forte-whatsapp/README.md:11-13 e docs/BAILEYS-INTEGRATION.md:120-129.


**Correção proposta:**

Em NODE_ENV=production falhar no startup se WHATSAPP_SESSION_ENCRYPTION_KEY não existir ou não tiver formato/entropia exigidos; tornar a variável obrigatória no Compose e no exemplo de deploy. Migrar/re-cifrar sessões legadas sob lock, documentar rotação/backup da chave e impedir downgrade silencioso para useMultiFileAuthState.


**Impacto:**

Credenciais persistentes do WhatsApp e Signal keys podem ser lidas por quem obtiver o volume, backup ou acesso ao container; isso permite hijack da sessão. Permissões 0700/0600 reduzem exposição acidental, mas não fornecem cifragem em repouso nem protegem backups.


**Teste de aceitação:**

Subir o gateway em produção sem a chave deve falhar antes de abrir sessão; com a chave, arquivos de creds/Signal keys devem ser cifrados e restauráveis; chave errada deve falhar sem aceitar sessão. Verificar que o Compose final inclui a variável como secret obrigatório e que backups não contêm JSON Baileys legível.


### 7.4 [HIGH] Rotas legadas de plataforma alteram tenant sem supportSession

**Evidência:**

platform-router.ts:446-463 expõe setWorkspaceLifecycleStatus e setWorkspacePlan com requirePlatformOperator e apenas workspaceId/status/plan/reason; não recebem nem verificam sessionId. Em contraste, as rotas atuais equivalentes platform-router.ts:980-995 exigem supportSessionInput e requireSession(..., true), e reset/agent seguem o mesmo padrão em :997-1011 e :893-954.


**Correção proposta:**

Remover as procedures legadas ou torná-las aliases das rotas session-gated. Exigir workspaceId+sessionId, verificar correspondência platformAdminId/workspaceId/status/expiração e modo operator, e gravar supportSessionId em cada auditoria. Aplicar o mesmo gate às demais mutações administrativas globais que alteram tenant.


**Impacto:**

Um operador autorizado pode suspender/reativar workspace ou alterar plano de qualquer cliente sem iniciar sessão de suporte operadora, sem consentimento/escopo temporal e sem supportSessionId no audit trail. Isto contorna a fronteira ABAC pretendida, mesmo que a identidade de plataforma seja legítima.


**Teste de aceitação:**

Sem sessão: 403; com sessão read_only: 403; com sessão operator do mesmo admin/workspace e dentro do TTL: sucesso. Verificar no audit log que a ação contém workspaceId e supportSessionId; sessionId de outro admin/tenant deve falhar.


### 7.5 [HIGH] Media inbound é baixada inteira, pode ser gravada como data URL bruto e não tem retenção de mensagens

**Evidência:**

forte-whatsapp/src/instance-manager.ts:969-983 faz downloadMediaMessage para Buffer e grava data:<mime>;base64 no metadata. server/media-storage.ts:32-43 retorna metadata inalterado quando FORTE_MEDIA_PRIVATE_STORAGE_ENABLED não é exatamente true; server/api.ts:123-135 aceita mediaData até 50.000.000 caracteres. server/db.ts:7477-7479 prepara esse metadata e :7680-7696 grava-o diretamente em messages.metadata. docker-compose.yml:137-150 não define FORTE_MEDIA_PRIVATE_STORAGE_ENABLED. No worker, a rotina de retenção localizada é onboarding-audio, não uma limpeza de mediaData de messages/objects.


**Correção proposta:**

Tornar storage privado obrigatório para inbound, aplicar limite de bytes durante streaming antes de materializar Buffer, validar MIME real e retirar mediaData de messages/eventos após persistência. Rejeitar/reenfileirar se storage privado falhar, implementar retenção que elimine objeto bruto, metadata e derivados, e limitar estritamente webhook/body por rota.


**Impacto:**

Conteúdo sensível de conversas pode permanecer indefinidamente em PostgreSQL em base64, além de aumentar memória, payload e backups; o agente também pode consumir esse mediaData. Um webhook autenticado pode provocar picos de memória/DB com mídia grande. A falha de storage não impede o caminho bruto em outros fluxos de attachment.


**Teste de aceitação:**

Sem a flag de storage privado, uma mensagem com mídia deve ser rejeitada ou persistida somente como referência privada, nunca com data URL; testar payload acima do limite durante streaming; executar cleanup em fixture de messages+objects e comprovar exclusão por workspace, sem afetar outro tenant.


### 7.6 [MEDIUM] Webhook público faz parse de até 50 MB antes de autenticar e não tem rate limit específico

**Evidência:**

server/_core/index.ts:41-44 aplica express.json e urlencoded com limit global de 50mb antes de registerApiRoutes. server/api.ts:71-84 deixa /webhooks/providers/baileys passar pelo filtro sem API key; :1398-1425 só verifica HMAC/API key depois de req.body já ter sido parseado. server/api.ts:123-135 permite mediaData de 50.000.000 caracteres. Não há consumeWorkspaceUsage nem bucket por IP aplicado ao caminho assinado/internal webhook.


**Correção proposta:**

Isolar parser raw/body limit por rota, rejeitar Content-Length excessivo antes de acumular, verificar credencial/assinatura em fluxo com limite pequeno e aplicar rate/concurrency limit por IP/instância. Não aceitar 50 MB no mesmo endpoint que é exposto como webhook; configurar firewall/rede para manter a rota interna.


**Impacto:**

Se o endpoint for alcançável fora da rede Docker, requisições anónimas de JSON grande inválido podem consumir CPU/memória antes de qualquer assinatura, causando DoS e pressionando o parser/GC. Mesmo com gateway interno confirmado, uma exposição acidental do endpoint torna a superfície perigosa.


**Teste de aceitação:**

Enviar body acima do limite deve receber 413 antes de materializar um objeto; flood inválido não deve crescer memória/latência sem bound; webhook válido assinado e dentro do limite deve continuar 202. Testar também ausência de secret/API key e rota publicada acidentalmente.


### 7.7 [MEDIUM] Proteção CSRF/origin aceita mutações cookie-auth sem Origin

**Evidência:**

server/_core/request-security.ts:80-107 documenta e implementa compatibilidade para requests sem Origin; só rejeita sec-fetch-site=cross-site, Origin null ou mismatch. server/_core/trpc.ts:13-18 aplica essa função a public/protected/authenticated procedures. Em HTTPS, server/_core/cookies.ts:42-49 define sameSite=none e secure=true, logo o cookie pode acompanhar requests cross-site; não existe token CSRF separado.


**Correção proposta:**

Para procedimentos autenticados por cookie, exigir Origin igual a uma allowlist configurada e/ou CSRF token double-submit ligado ao cookie; separar explicitamente chamadas Bearer/webhook/CLI e não permitir que a compatibilidade sem Origin se aplique a cookie-auth. Rever se SameSite=None é realmente necessário.


**Impacto:**

Clientes/browser antigos, integrações que conseguem omitir Origin ou cenários de proxy podem enviar mutações com cookie de sessão sem passar por uma prova positiva de origem. SameSite=None amplia a consequência caso um bypass de browser/proxy exista. É uma lacuna de defesa em profundidade, não uma prova de exploração em browser moderno.


**Teste de aceitação:**

POST/PUT/DELETE com cookie válido e sem Origin/Sec-Fetch-Site deve receber 403; same-origin deve passar; Bearer explicitamente autorizado e webhook não devem depender de CSRF. Cobrir forwarded host/proto apenas através de proxy confiável.


### 7.8 [HIGH] Delete de instância no console de suporte chama o gateway com instanceId arbitrário

**Evidência:**

platform-router.ts:243-245 implementa supportDeleteBaileysInstance com requirePlatformOperator, chama deleteBaileysGatewayInstance(input.instanceId) e engole qualquer erro, sem primeiro chamar getBaileysInstance(ensurePlatformSupportWorkspace.id, input.instanceId). As rotas vizinhas status/profile/QR/connect fazem esse lookup em :199-229; o gateway delete em forte-whatsapp/src/server.ts:115-116 e :66-67 remove a entrada global encontrada pelo ID.


**Correção proposta:**

Exigir lookup ativo no workspace esperado antes de qualquer chamada ao gateway; para console de suporte multi-tenant, exigir supportSession operator + workspaceId explícito e comparar owner retornado. Não mascarar falha de delete nem retornar sucesso quando não houve confirmação do owner/estado.


**Impacto:**

Conhecendo um instanceId de cliente, um operador pode apagar a sessão física no gateway mesmo que ela não pertença ao workspace interno de suporte; depois archiveBaileysInstance só altera o registro do workspace de suporte. Isto rompe ownership entre registry global e tabela tenant-scoped e pode causar logout/perda de sessão de outro cliente.


**Teste de aceitação:**

Com instâncias A/B, chamar a procedure com B a partir do contexto de suporte deve falhar sem request DELETE para o gateway; a instância de suporte válida deve apagar somente o próprio ID e registrar owner/session no audit log.


### 7.9 [LOW] Conta local de platform admin compara password plaintext de configuração

**Evidência:**

server/routers.ts:544-557 compara configuredPlatformAccount.email e configuredPlatformAccount.password diretamente com o input e depois promove/upsert a conta. server/_core/env.ts:65-72 carrega LOCAL_ADMIN_PASSWORD e PLATFORM_ADMIN_ACCOUNTS_JSON a partir de ambiente; não há hash/verifier nesse caminho.


**Correção proposta:**

Preferir IdP/contas locais com hash forte e verifier (Argon2id/scrypt), retirar passwords plaintext de JSON/env persistente e aplicar comparação uniforme/rate limit também ao caminho configurado. Redactar config/diagnósticos antes de logging.


**Impacto:**

Qualquer exposição de ambiente, dump de processo, diagnóstico ou configuração de CI revela credencial reutilizável de plataforma; também não há proteção de comparação constant-time nesse ramo. É principalmente risco operacional de gestão de secrets, não bypass independente de autenticação.


**Teste de aceitação:**

Auditar que logs/config snapshots não contêm password; testar login válido/inválido sem ramo plaintext e rotação/revogação da credencial. Se o bootstrap exigir segredo inicial, garantir consumo único e remoção após criação do hash.


### Revisão de bibliotecas

- jose está configurado com alg=HS256 e algorithms:['HS256']; não há fundamento para trocar a biblioteca, mas a segurança depende de JWT_SECRET obrigatório e de sessionVersion/DB, já presentes parcialmente.
- Zod fornece limites e enums úteis nas rotas, mas não resolve ownership: os achados de storage, delete de instância e supportSession exigem checks explícitos no serviço/DB, não substituição de biblioteca.
- crypto.timingSafeEqual é usado no HMAC/replay e Bearer do gateway; manter essa primitiva. Não recomendar biblioteca abstrata como correção para o SSRF: é necessária política de allowlist/DNS/egress.
- Express body-parser funciona para requests pequenas, porém o limite global de 50 MB e autenticação posterior exigem desenho de rota/streaming; trocar framework não corrige por si só.
- Baileys/useMultiFileAuthState é a integração confirmada do produto. O problema é o fallback de armazenamento sem cifragem em produção; não há recomendação de trocar o canal por Meta/PAPI nem de substituir Baileys.

### Pontos fortes observados

- A cadeia tRPC aplica assertSameOrigin a todas as procedures, separa protectedProcedure de authenticatedProcedure e não deriva tenant de users.role: server/_core/trpc.ts:13-48.
- A resolução de tenant falha fechada quando o utilizador não tem exatamente um membership ativo: server/db.ts:391-441. As queries de mensagens também aplicam workspace e ownership da instância Baileys: server/db.ts:5461-5472, 5657-5677.
- Sessões JWT têm expiração, algoritmo HS256 explicitamente permitido e sessionVersion persistida; logout revoga sessões no DB antes de limpar cookie: server/_core/sdk.ts:187-205, 208-240, 327-334; server/routers.ts:781-785.
- Webhook Baileys verifica HMAC constant-time, timestamp, nonce e janela; o ingest valida instância Baileys ativa e pertencente ao workspace: server/webhook-anti-replay.ts:32-59; server/api.ts:1401-1458.
- Há separação explícita entre operadores de plataforma e roles de workspace, e as rotas novas de suporte usam platformAdminId + workspaceId + sessionId, incluindo expiração e modo operator: server/_core/trpc.ts:38-48; server/platform-admin.ts:869-900; server/platform-router.ts:850-1011.
- Chaves de media outbound têm prefixo workspace-scoped, ausência de '..' e validação de MIME/tamanho; o gateway compara Bearer em tempo constante e exige idempotency-key para envio: server/inbox-media-upload.ts:37-51; server/db.ts:6028-6055, 7952-7973; forte-whatsapp/src/server.ts:217-233.

### Limites da auditoria

- Auditoria exclusivamente estática e read-only do checkout local no commit solicitado; não editei ficheiros, não executei migrations, não usei Supabase, não fiz probes de serviços/bases, não emparelhei nem enviei WhatsApp e não usei browser ou máquina real.
- Foram executados apenas testes locais sem DB/serviços: 4 ficheiros, 17 testes passaram (request-security 9, sdk.session 2, inbox-media-upload 3, webhook-anti-replay 3). Isso não prova ACL do Forge/S3, atomicidade PostgreSQL, concorrência entre réplicas, TTL real, proxy confiável ou comportamento do gateway em deployment.
- A documentação foi tratada como evidência não confiável e confrontada com código. O próprio O7.11:12-14 e O7.17:25-30 reconhece gates externos pendentes; a migration anti-replay não foi executada nesta auditoria.
- SSRF depende de um operator autorizado poder alcançar o endpoint LLM e de egress/DNS reais; o DoS do webhook depende de exposição fora da rede interna; IDOR depende de conhecimento/obtenção de storage key. Estes condicionantes não reduzem a ausência comprovada dos checks no código.
- Não foi possível provar com ambiente real a política de presign/ACL do Forge, firewall Docker, resolução DNS, rotação de segredos, retenção de objetos, backups ou se todos os deployments definem flags fora dos ficheiros auditados. Nenhuma URL externa foi consultada; source_urls permanece vazio.

## 8. Dados, migrations e armazenamento — auditoria read-only do commit 445d4cc2747366b3a27976ba0b0046e8fbba102c

### 8.1 [CRITICAL] [comprovado] Backfill 0017 depende de forte-demo e pode falhar ou misatribuir dados no upgrade main→candidate

**Evidência:**

drizzle-pg/0017_tenant_scoped_deduplication.sql:17-24 e :26-35 preenchem auditLogs/apiIdempotency/webhookEvents sem workspace pela slug fixa forte-demo; em seguida impõem NOT NULL. server/db.ts:1595-1617 só cria essa workspace quando isDemoRuntimeAllowed(); scripts/validate-production-config.ts:28-39 exige DEMO_MODE=false e WORKSPACE_BOOTSTRAP_ENABLED=false em produção.


**Correção proposta:**

Substituir o fallback implícito por preflight read-only que quantifique cada linha sem mapeamento, exija mapeamento explícito por workspace ou quarentena auditada e bloqueie antes de qualquer ALTER. Nunca usar tenant demo como destino de dados de produção; executar o backfill em transação e com lock apropriado.


**Impacto:**

Num banco main com workspaces reais mas sem forte-demo, qualquer linha legada que não seja resolvida por contacto/membership deixa NULL e aborta a migration. Se forte-demo existir, a linha pode ser atribuída ao tenant errado. O erro ocorre antes do candidato funcionar e pode deixar o operador com uma migração abortada/estado parcial.


**Teste de aceitação:**

Em PostgreSQL descartável, carregar fixture main com workspace não-demo e audit/api/webhook rows sem mapeamento; o preflight deve retornar bloqueio, sem writes. Com mapa explícito, aplicar a migration e verificar que cada linha conserva o workspace correto, que nenhuma NULL sobra e que uma segunda execução não duplica índices.


### 8.2 [HIGH] [comprovado] 0043 é um gate destrutivo para dados históricos PAPI/Meta sem plano de conversão/rollback no código

**Evidência:**

drizzle-pg/0042_baileys_only_operational_provider.sql:2-4 tolera legado, mas drizzle-pg/0043_baileys_only_provider_enum.sql:4-29 lança exceção se existir provider não-baileys em channels/instances/messages ou default_whatsapp_provider; :31-97 remove checks, índices e o enum antigo e recria o enum apenas com baileys. scripts/inventory-whatsapp-legacy.ts:33-36 oferece apenas inventário read-only; :182-184 manda revisar antes da migration, mas não resolve filas/segredos/instâncias.


**Correção proposta:**

Transformar o inventário em gate obrigatório com counts e decisão registrada: separar/arquivar linhas legadas, resolver queued/processing outbound, revogar/rotacionar referências antigas e só então executar 0043. Manter dump/rollback testado e impedir que valores antigos sejam apenas renomeados para baileys.


**Impacto:**

Qualquer dado PAPI/Meta, inclusive mensagens pendentes ou instâncias históricas, bloqueia o upgrade. Não há backfill semântico seguro nem preservação de credenciais/estado de envio; continuar a operação exige intervenção manual. Isso é compatível com o produto Baileys-only, mas não é um caminho de upgrade comprovado.


**Teste de aceitação:**

Fixture com PAPI/meta em cada uma das quatro superfícies deve ser bloqueada sem mutação; após limpeza aprovada, migration deve concluir e constraints/enum/indexes devem existir. Verificar também zero pending outbound não-baileys e zero settings/segredos legados conforme política real.


### 8.3 [HIGH] [comprovado] O schema Drizzle não representa constraints instaladas nas migrations

**Evidência:**

A migration 0048 instala FK em opportunities.assignedMemberId: drizzle-pg/0048_opportunity_assignment_followup.sql:1-3, mas drizzle/schema.ts:1266-1297 declara assignedMemberId como integer sem references. A 0050 instala unique composto e FKs/checks para quotes/items/history: drizzle-pg/0050_quote_items_approval.sql:11-39,55-83; drizzle/schema.ts:1552-1673 não declara esses references/checks. A 0059 adiciona appointments.quoteId e apenas índice: drizzle-pg/0059_appointment_quote_link.sql:1-6; drizzle/schema.ts:1525-1550 também não tem FK para quotes.


**Correção proposta:**

Alinhar drizzle/schema.ts às constraints reais, incluindo FKs compostas tenant-safe, checks e unique constraints, ou criar uma migration deliberada que remova as garantias após análise. Adicionar CI que gere/diff o schema contra um banco limpo e um banco migrado sem aceitar DROP inesperado.


**Impacto:**

A fonte tipada e o banco divergem. O código/gerador não comunica as garantias reais; uma futura geração Drizzle pode propor remoção de constraints ou não detectar drift. Além disso, inserts feitos por caminhos que não repetem verificações de tenant ficam dependentes apenas do banco atual, não do contrato de schema.


**Teste de aceitação:**

Aplicar a árvore a PostgreSQL limpo e a um snapshot migrado; `drizzle-kit generate`/diff deve ser vazio ou somente o delta esperado. Testar insert de item/quote, oportunidade/membro e appointment/quote de workspaces diferentes: cada caso deve falhar no banco.


### 8.4 [HIGH] [comprovado] Integridade referencial tenant-wide é incompleta em tabelas operacionais

**Evidência:**

Não há references no schema para contacts.workspaceId/groupId: drizzle/schema.ts:1194-1227; conversations.contactId:1338-1360; messages.conversationId:1423-1450; whatsappInstances.workspaceId/channelId:923-969; whatsappGroups/groupParticipants:1146-1192; nem para a maioria de services/professionals/appointments/quotes. As FKs existentes são parciais, concentradas em leads/opportunities: drizzle-pg/0047_unified_leads_opportunities.sql:1-3,17-20,32-33, e em alguns objetos de quotes: drizzle-pg/0050:28-39,58-83.


**Correção proposta:**

Inventariar órfãos e relações com workspace divergente antes de alterar; adicionar FKs simples e, para relações tenant-bound, FKs compostas `(workspaceId,id)` com NOT VALID/validação posterior, mais política explícita de ON DELETE. Corrigir/quarentenar dados inválidos sem apagar silenciosamente.


**Impacto:**

O PostgreSQL aceita órfãos e associações cross-workspace ou não cascata deletes de workspace; consultas da aplicação fazem filtros defensivos, mas workers, imports, suporte e futuros caminhos SQL podem quebrar isolamento/recuperação. A ausência de FK também torna contagens e limpeza de dados legacy menos confiáveis.


**Teste de aceitação:**

Fixture negativa com contacto/conversa/mensagem/grupo/instância pertencentes a workspaces diferentes deve ser rejeitada pelo banco; apagar workspace deve produzir o cascade/set-null documentado; repetir queries de isolamento e contagens após restore.


### 8.5 [HIGH] [comprovado] Reconciliação de storage é um no-op no worker e não tem provider nem enumeração real de referências

**Evidência:**

server/worker.ts:97-109 chama runStorageReconciliationSweep sem `provider`; server/storage-reconciliation-runner.ts:31-42 retorna `skipped=true, reason=provider_not_configured` nesse caso. A interface exige list/delete/referencedKeys em :8-12, mas não há implementação wired no repositório. RESTORE-REHEARSAL-PLAN.md:21-32 e :162-183 diz que media adapter/exportação ainda faltam.


**Correção proposta:**

Implementar provider real paginado com list/delete condicional por ETag, `referencedKeys` cobrindo metadata de messages e `onboardingAudioAssets.storageKey`, limites/leases e auditoria redigida. Manter dry-run default e fail-closed quando o provider não estiver configurado, mas expor essa condição como gate de readiness.


**Impacto:**

Objetos órfãos não são descobertos/deletados e o worker não produz auditoria real; o sistema não consegue provar retenção, recuperação de blobs ou ausência de cross-tenant. O código de classificação/ETag existe, mas não constitui operação de produção.


**Teste de aceitação:**

Com provider fake/estágio, listar dois workspaces e fixtures com referência, objeto recente, órfão antigo e chave cross-tenant; o worker deve processar workspaces, não marcar skipped, preservar referências/recentes e deletar apenas órfão antigo com If-Match. Repetir após restart sem duplicar deleção.


### 8.6 [HIGH] [comprovado] Retenção de onboarding remove a linha SQL mas não o objeto privado

**Evidência:**

onboardingAudioAssets guarda `storageKey`: drizzle/schema.ts:394-427. cleanupOnboardingAudioRetention em server/db.ts:4557-4580 seleciona apenas id/workspace e, em modo destrutivo, apaga onboardingTranscriptions/assets; não chama storage delete. A reconciliação que poderia remover o blob está desligada por provider ausente: server/worker.ts:103-109.


**Correção proposta:**

Fazer deleção de objeto idempotente e auditável no lifecycle (ou gravar tombstone/outbox com storageKey antes de remover a linha), com confirmação de ETag e retry; não contar o asset como expirado/concluído enquanto a remoção de blob não tiver evidência. Integrar com o provider real e reconciliar falhas.


**Impacto:**

Áudios expirados podem permanecer no bucket sem referência, contrariando a retenção de artefato bruto, aumentando custo e mantendo PII após a data de expiração. Depois da remoção da linha não há uma referência confiável para limpeza direcionada; fica dependente de um sweep que hoje não executa.


**Teste de aceitação:**

Fixture com asset expirado e objeto correspondente: dry-run não altera, modo aplicado remove o blob e a linha, falha do provider deixa outbox/tombstone retryável e auditoria sem expor a chave; executar novamente não gera erro nem perda adicional.


### 8.7 [HIGH] [comprovado] Backup/restore não cobre a recuperação completa declarada

**Evidência:**

scripts/backup-restore.sh:32-60 cria apenas dump PostgreSQL e tar de sessões; :63-82 verifica apenas esses dois artefatos; :84-109 restaura apenas PostgreSQL e diretório de sessão. RESTORE-REHEARSAL-PLAN.md:21-32 explicita que mídia/blob, Redis e chaves ainda precisam de adapter/exportação operacional.


**Correção proposta:**

Adicionar inventário/hash/versionamento de objetos no mesmo ponto de recuperação, exportação/restauração isolada de Redis ou reconstrução comprovada, e procedimento de secret-manager/keys sem incluir segredos no manifesto. Tornar todos componentes gates obrigatórios antes de declarar rehearsal aprovado.


**Impacto:**

Um restore aprovado pelo script pode restaurar referências SQL sem blobs, filas/leases ou material criptográfico correspondente; media URLs, descriptografia de segredos e comportamento do worker/gateway podem falhar. Database+session não é RPO/RTO do produto completo.


**Teste de aceitação:**

Executar rehearsal em ambiente descartável separado: restaurar banco, blobs, Redis reconstruível, chaves de ensaio e sessão; validar URLs privadas, descriptografia, tenancy negativa, readiness e um job idempotente após restart. Sem qualquer componente, decisão deve ser inconclusive/blocked.


### 8.8 [HIGH] [comprovado] Proxy de storage privado autentica usuário mas não autoriza o workspace do objeto

**Evidência:**

server/_core/storageProxy.ts:13-18 chama apenas sdk.authenticateRequest; :20-23 valida comprimento/traversal, mas não resolve workspace nem verifica referência no banco; :31-55 envia qualquer `key` recebida para o presign do Forge. server/storage.ts:74-76 expõe URL proxy para uma chave arbitrária.


**Correção proposta:**

Aceitar apenas chave derivada do recurso autorizado, resolver workspace da sessão no backend, exigir prefixo `workspaces/{ctx.workspaceId}/` e confirmar referência em message/onboarding asset antes do presign. Preferir não expor proxy genérico; retornar URL assinada somente após essa autorização.


**Impacto:**

Qualquer usuário autenticado que obtenha ou adivinhe uma chave de outro tenant pode tentar obter presigned redirect; o endpoint não fornece uma garantia de autorização tenant-scoped. A dificuldade de adivinhar UUID não substitui controle de acesso, sobretudo quando chaves aparecem em metadados/logs ou backups.


**Teste de aceitação:**

Com sessão A, solicitar chave conhecida de B deve responder 403/404 sem chamada ao Forge; chave referenciada de A deve funcionar; testar traversal, chave inexistente e revogação/expiração de sessão.


### 8.9 [MEDIUM] [comprovado] workspaceSettings não tem unicidade por `(workspaceId,key)` e o código aceita duplicados concorrentes

**Evidência:**

drizzle/schema.ts:826-833 e drizzle-pg/0000_sad_kinsey_walden.sql:183-190 não criam unique `(workspaceId,key)`. O publish/rollback faz SELECT do último registro e depois UPDATE ou INSERT: server/db.ts:3569-3592 e :3641-3647, sem constraint/upsert atômico.


**Correção proposta:**

Fazer inventário/deduplicação determinística por workspace/key, adicionar unique index, e usar INSERT ... ON CONFLICT ou lock transacional. Só depois validar que não existem chaves duplicadas.


**Impacto:**

Concorrência pode criar várias linhas para a mesma setting; leitores que escolhem o mais recente podem observar provider/configuração divergente. Isso também preserva múltiplos valores legados e torna preflight/limpeza ambíguos.


**Teste de aceitação:**

Inserir duas gravações concorrentes para o mesmo workspace/key em PostgreSQL; deve sobreviver exatamente uma linha e a leitura deve ser determinística. Testar migração com duplicados: bloqueia com relatório ou deduplica conforme política, sem perda silenciosa.


### 8.10 [MEDIUM] [risco/inferência] A árvore SQL não é replay-safe e a metadata de snapshots está incompleta

**Evidência:**

Migrations antigas usam CREATE sem IF NOT EXISTS e ALTER sem guard, por exemplo drizzle-pg/0000_sad_kinsey_walden.sql:1-23, 0010_message_metadata_and_deduplication.sql:1-15, 0040_white_mysterio.sql:1-32 e 0050_quote_items_approval.sql:11-40. O journal tem 60 entradas, mas meta contém snapshots apenas até 0043 e o teste só exige o snapshot 0041: server/migration-journal.test.ts:27-39.


**Correção proposta:**

Não depender de rerun manual: adicionar preflight/catalog checks, transações/locks onde suportado, procedimentos de interrupção/rollback e testes de upgrade. Gerar/commitar snapshots coerentes para todos os pontos ou declarar explicitamente uma única fonte de verdade e validar schema live contra ela; nunca aceitar DROP gerado sem revisão.


**Impacto:**

A execução normal via journal pode passar uma vez, mas rerun manual, recuperação após execução parcial ou geração de novo diff não é segura: DDL pode falhar ou propor drift/destruição. Falta de snapshots não bloqueia necessariamente `drizzle-kit migrate`, mas reduz a capacidade de reconstruir/verificar o schema atual.


**Teste de aceitação:**

Em PostgreSQL descartável, aplicar a cadeia clean e sobre fixture main, interromper/repetir cada migration candidata e verificar retomada segura. Gerar diff Drizzle a partir de banco migrado: nenhum DROP/ALTER não aprovado; testar ainda uma segunda aplicação com o journal corretamente marcado.


### 8.11 [MEDIUM] [risco/inferência] Restore destrutivo não verifica que o alvo PostgreSQL é isolado/vazio antes de `--clean`

**Evidência:**

scripts/backup-restore.sh:84-101 exige apenas CONFIRM_RESTORE=YES, DATABASE_URL e diretório separado de sessão; executa `pg_restore ... --clean --if-exists` sem checar identidade do banco, ambiente, allowlist ou vazio. A documentação apenas instrui o operador a confirmar alvo descartável: RESTORE-REHEARSAL-PLAN.md:98-107.


**Correção proposta:**

Usar credencial/banco de rehearsal dedicado, validar identidade via conexão e marker único, exigir allowlist de host/db e uma confirmação vinculada ao fingerprint do alvo; abortar se houver objetos não esperados. Separar comando de restore destrutivo de backup/verify.


**Impacto:**

Um erro de DATABASE_URL pode limpar objetos de um banco existente mesmo com a confirmação genérica. A separação exigida para sessão não se aplica ao banco, bucket ou Redis. É uma salvaguarda operacional ausente, não uma prova de que o código já apagou dados.


**Teste de aceitação:**

Com DATABASE_URL apontando a fixture não-vazia ou host de produção simulado, o comando deve abortar antes de pg_restore; com banco descartável marcado, deve prosseguir e registrar fingerprint, duração e rollback.


### Revisão de bibliotecas

- Drizzle ORM/Drizzle Kit e `pg` são escolhas razoáveis para PostgreSQL tipado e migrations versionadas; não há evidência nesta área que justifique substituir a biblioteca. O risco observado vem de SQL de evolução, backfills, FKs e metadata fora de sincronia, portanto a correção deve permanecer em migrations/schema/preflight.
- O uso de índices parciais, FKs compostas e ON CONFLICT é uma boa capacidade do PostgreSQL/Drizzle quando aplicado. Não recomendo abstração ou ORM alternativo: primeiro fechar o contrato schema-live e provar upgrades em PostgreSQL real.

### Pontos fortes observados

- A fronteira operacional Baileys está explícita no schema (whatsapp_provider enum de um valor e checks nas tabelas de canais, instâncias e mensagens: drizzle/schema.ts:41-43,901-969,1423-1449) e a migration 0043 bloqueia, em vez de relabelar silenciosamente, linhas históricas PAPI/Meta: drizzle-pg/0043_baileys_only_provider_enum.sql:4-29.
- Há boas chaves tenant-scoped em várias áreas: contactos não-grupo, conversas, eventos, idempotência, usage buckets, mensagens e instâncias têm índices de unicidade/consulta dedicados: drizzle/schema.ts:870-898,947-968,986-990,1128-1143,1220-1227,1354-1359,1441-1449.
- Há backfills explícitos para leads/opportunities e quote status/items/history, com algum uso correto de chaves compostas e ON CONFLICT: drizzle-pg/0047_unified_leads_opportunities.sql:39-69 e drizzle-pg/0050_quote_items_approval.sql:88-120.
- O journal registra os 60 SQLs e o teste estático confere tags/índices do journal: drizzle-pg/meta/_journal.json e server/migration-journal.test.ts:8-25.
- Storage usa chaves com prefixo de workspace, normalização de caminho, URLs assinadas e permissões/ETag na reconciliação: server/media-storage.ts:44-58, server/storage.ts:79-97, server/storage-reconciliation.ts:62-70. A documentação também declara honestamente que o rehearsal/adapter real ainda não foi executado: RESTORE-REHEARSAL-PLAN.md:1-5,21-32.

### Limites da auditoria

- Auditoria limitada ao conteúdo real do working tree no commit 445d4cc2747366b3a27976ba0b0046e8fbba102c; git status permaneceu limpo. Nenhum ficheiro foi criado/editado.
- Não executei SQL, migrations, Supabase, browser, pairing/envio WhatsApp, restore ou qualquer chamada contra banco/ambiente real. Portanto não pude confirmar contagens, constraints já presentes, duplicados, órfãos, provider rows, existência de forte-demo, ETags, bucket ACLs ou comportamento do Forge.
- Os testes e afirmações dos documentos foram tratados como evidência de código/documentação, não como prova operacional. O workflow .github/workflows/postgres-integration.yml:57-70 aplica a cadeia em banco limpo e falha em skips, mas não prova upgrade de um snapshot persistido de main nem rehearsal completo de media/Redis/keys.
- A exploração efetiva do risco do proxy requer uma chave de objeto válida e confirmação do comportamento/ACL do Forge; o finding comprova a ausência de autorização tenant-scoped no código, não um download real cross-tenant.
- A validação final deve ocorrer em clone/staging PostgreSQL descartável e storage/Redis isolados, com inventário read-only, sem apagar dados existentes e sem reutilizar sessão ou número WhatsApp real.

## 9. Testes, CI, dependências e qualidade

### 9.1 [HIGH] A publicação não tem gate de vulnerabilidades e o grafo root tem advisories críticas/altas

**Evidência:**

Os caminhos de produção começam em `package.json:23-24` (`@aws-sdk/client-s3`), `:56` (`axios`), `:63` (`drizzle-orm`), `:65` (`express`), `:71` (`nanoid`) e `:80-82` (`recharts`/`streamdown`). O audit read-only do lock atual (`pnpm audit --prod --json`) reportou 1 critical, 23 high, 55 moderate e 10 low em 617 dependências; a critical é `@aws-sdk/client-s3@3.907.0 → @aws-sdk/core@3.907.0 → @aws-sdk/xml-builder@3.901.0 → fast-xml-parser@5.2.5` (GHSA-m7jm-9gc2-mpf2). Também foram reportados `drizzle-orm@0.44.6` com SQL injection, `axios@1.12.2`, `form-data@4.0.4`, `path-to-regexp@0.1.12`, `lodash@4.17.21` e `nanoid@5.1.6`. Nenhum workflow executa `pnpm audit`; `postgres-integration.yml:51-52` usa `npm ci --no-audit` para o gateway e `publish-image.yml:44-49` apenas instala.


**Correção proposta:**

Atualizar primeiro os direct/upstream chains com versões corrigidas (por exemplo `fast-xml-parser` >=5.3.5, ou a versão AWS que o traz corrigido; `drizzle-orm` >=0.45.2; `axios` >=1.16.0; `nanoid` >=5.1.16; `path-to-regexp` >=0.1.13; `form-data` >=4.0.6), rever breaking changes e confirmar uso real antes de qualquer override. Depois adicionar ao job `verify` um `pnpm audit --prod --audit-level=high` e, separadamente, `npm audit --omit=dev --audit-level=high --prefix forte-whatsapp`, com exceções temporárias documentadas por advisory/alcance.


**Impacto:**

Um commit pode passar os gates e publicar imagens com uma dependência transitiva crítica ou várias altas. A presença no advisory DB não prova que cada vetor é alcançável no produto, mas o caminho S3/XML é runtime e não apenas dev; a ausência de triagem/gate impede detectar regressões antes do publish.


**Teste de aceitação:**

Em checkout limpo, `pnpm audit --prod --json` deve devolver zero critical/high ou exceções aprovadas com owner/expiry; `npm audit --omit=dev --prefix forte-whatsapp` deve continuar limpo; o job `verify` deve falhar quando se introduz deliberadamente uma versão vulnerável e publicar só após o scan.


### 9.2 [MEDIUM] Pull requests não executam typecheck/build do painel root

**Evidência:**

`.github/workflows/postgres-integration.yml:3-6` dispara em `pull_request`, mas as etapas `:48-70` fazem install, typecheck somente do gateway (`npm run check --prefix forte-whatsapp`), migrations, validator e testes; não há `pnpm check` nem `pnpm build`. Esses gates aparecem apenas em `.github/workflows/publish-image.yml:49-50,77-78`, cujo trigger é `push` para `main`/manual (`:3-6`), portanto depois do merge.


**Correção proposta:**

Adicionar ao workflow acionado por PR `pnpm check` e `pnpm build` (ou criar workflow de qualidade separado e torná-lo required check). Reutilizar os mesmos comandos do publish, sem depender de configuração externa de branch protection para esconder o gap.


**Impacto:**

Uma PR pode passar o único workflow obrigatório visível com erro de TypeScript ou build Vite/esbuild no painel e só revelar a regressão no push a main, ou no momento de publicar. Testes Vitest transpilarão código, mas não substituem typecheck/build.


**Teste de aceitação:**

Uma PR com erro sintético em `client/src`/`server` deve falhar antes de merge; uma PR limpa deve passar typecheck, build, migrations e testes PostgreSQL. Confirmar também que o publish permanece bloqueado pelo job de verificação.


### 9.3 [MEDIUM] Os testes TypeScript não são typechecked

**Evidência:**

O script root é `pnpm check` (`package.json:10`), mas `tsconfig.json:2-3` inclui `client/src`, `shared` e `server` e exclui explicitamente `**/*.test.ts`. No gateway, `forte-whatsapp/package.json:9,11` chama `tsc -p tsconfig.json`/`--noEmit`, enquanto `forte-whatsapp/tsconfig.json:13` inclui apenas `src/**/*.ts`, não `src/**/*.test.ts`. Os 116 ficheiros de teste entram no Vitest (`vitest.config.ts:15-24`), que não é uma verificação de tipos.


**Correção proposta:**

Criar um `tsconfig.test.json` root e outro do gateway, ambos estendendo o config de produção e incluindo os testes, com aliases/types apropriados; adicionar `tsc --noEmit -p ...test.json` ao CI. Manter o `tsconfig` de produção separado se houver razões de bundle.


**Impacto:**

Erros de tipos em fixtures, mocks, contratos de teste ou imports podem ficar verdes até execução de uma branch específica; a cobertura estática anunciada pelo CI aplica-se ao runtime, não às suites.


**Teste de aceitação:**

Introduzir temporariamente um erro de tipo apenas em um `*.test.ts` deve fazer o check de testes falhar; remover o erro e executar os dois checks deve passar sem alterar lockfiles.


### 9.4 [MEDIUM] 23 suites de integração podem tornar um `pnpm test` verde sem executar DB

**Evidência:**

`package.json:18` é apenas `vitest run`; `vitest.config.ts:15-24` inclui as suites server, mas 23 ficheiros usam `describe.skipIf(!hasDatabase)`, por exemplo `server/platform-health.contract.integration.test.ts:13-17`, `server/inbox-instance-filter.integration.test.ts:39-43`, `server/workspace-usage.test.ts:6-8` e `server/worker-heartbeat.test.ts:10-14`. `hasDatabase` só verifica a forma de `process.env.DATABASE_URL`. O bloqueio de skipped existe apenas depois de configurar PostgreSQL no CI (`.github/workflows/postgres-integration.yml:30-33,63-70` e `publish-image.yml:65-76`).


**Correção proposta:**

Separar `test:unit` de `test:integration` e fazer o segundo falhar se `DATABASE_URL` estiver ausente ou não conectar; no required CI executar explicitamente a suite DB e verificar uma contagem estruturada de skipped, em vez de depender só de grep textual do reporter. Se mantiver `skipIf` para desenvolvimento offline, o comando default deve declarar claramente que não é completo.


**Impacto:**

Execuções locais, jobs mal configurados ou comandos reutilizados fora desses workflows podem reportar sucesso omitindo isolamento de tenancy, retenção, quotas, signup, notificações, agenda e outros fluxos DB. Isto é um gap comprovado de observabilidade do comando padrão, não prova de que o CI configurado pule as suites.


**Teste de aceitação:**

Sem `DATABASE_URL`, `pnpm test:integration` deve sair !=0; com PostgreSQL limpo/migrations aplicadas, a execução deve ter zero skipped e cobrir as 23 suites. O summary deve ser machine-readable para não depender de `[skipped]`/`N skipped`.


### 9.5 [MEDIUM] O chamado E2E é HTTP-only, manual e não valida browser/UI nem o socket Baileys

**Evidência:**

`.github/workflows/staging-e2e.yml:3-14` é exclusivamente `workflow_dispatch`; a etapa `:45-46` executa `node scripts/validate-flow.mjs`. O próprio script diz em `scripts/validate-flow.mjs:11-12` que usa apenas rotas HTTP públicas e implementa `fetch` em `:29-49,155-201`; `scripts/staging-smoke.sh:43-44` verifica apenas `/api/v1/health` e `/api/v1/ready`. Não há configuração rastreada de Playwright/Cypress, nem teste que crie socket Baileys real/QR/envio; os testes do gateway são fakes/contratos como `forte-whatsapp/src/server.test.ts:5-114` e `src/webhook-outbox.test.ts:32-253`.


**Correção proposta:**

Manter o fluxo HTTP porque cobre contratos de API, mas declarar o seu escopo como API E2E. Para o release, associar um job de staging controlado ao mesmo commit/digest publicado e adicionar somente a camada browser necessária aos critérios de produto; para Baileys, usar uma instância/gateway de teste controlado e contratos de webhook sem emparelhar nesta revisão. Não substituir Vitest por outro runner sem um caso de UI concreto.


**Impacto:**

A publicação pode passar sem prova do bundle/renderização no browser, rotas UI, captura/estado visual ou ligação socket→webhook→DB→Inbox. O E2E HTTP também não prova comportamento do gateway real; pairing/envio físico continuam uma lacuna que exige ambiente controlado, não esta sandbox.


**Teste de aceitação:**

O gate de release deve falhar se a imagem/digest exato não passar health/readiness, contratos API e, quando exigido, um smoke browser. Um ambiente autorizado deve fornecer evidência separada de socket/gateway; a revisão atual não pode fabricar essa evidência.


### 9.6 [MEDIUM] Não existem gates de lint, formatação ou cobertura

**Evidência:**

`package.json:6-20` declara `format` com `prettier --write .`, mas não `lint`, `format:check`, `coverage` ou threshold; `vitest.config.ts:3-7` só define include/environment e não coverage. Os workflows executam check/test/build (`.github/workflows/publish-image.yml:49-84`), nunca Prettier check, lint ou cobertura. O próprio `todo.md:325` ainda lista adicionar lint como pendência histórica.


**Correção proposta:**

Adicionar um `format:check` não mutante usando o Prettier já declarado, um lint apenas se houver regras concretas para o código, e coverage Vitest com thresholds graduais por área (server/gateway/shared), excluindo fixtures conscientemente. Priorizar métricas de branches para autenticação, tenancy, webhooks e retries; não introduzir uma biblioteca alternativa sem necessidade demonstrada.


**Impacto:**

Regressões de estilo, regras de qualidade e áreas sem testes não aparecem como falha CI; a contagem de testes não mede linhas/branches críticas. `format --write` também é uma operação mutante e inadequada como gate.


**Teste de aceitação:**

Uma alteração de whitespace deve falhar `format:check`; uma regra lint violada deve falhar o job; o relatório de coverage deve ser produzido no CI e falhar abaixo dos thresholds versionados.


### 9.7 [LOW] Configuração pnpm produz warning e deixa patch/override fora do local suportado

**Evidência:**

`package.json:105` pede `pnpm` `^10.15.1`, mas `packageManager` em `:116` fixa `pnpm@10.4.1`; `:117-123` coloca `patchedDependencies` de wouter e `overrides` de nanoid dentro da chave `pnpm`. Não existe `pnpm-workspace.yaml` no snapshot. Com o pnpm 10.4.1 indicado pelo próprio `packageManager`, foi observado: `The "pnpm" field in package.json is no longer read by pnpm ... patchedDependencies, overrides ignored`. O `pnpm-lock.yaml:7-15` ainda contém os metadados resolvidos, logo não está provado que o checkout atual tenha instalado sem patch; é risco de drift, não bug confirmado do artefacto presente.


**Correção proposta:**

Mover `patchedDependencies`/`overrides` para a configuração suportada por pnpm 10 (`pnpm-workspace.yaml`), alinhar `packageManager` e devDependency a uma versão única e documentar o pin usado pelo CI. Não resolver com override adicional antes de comprovar a necessidade.


**Impacto:**

Instalações futuras/atualizações podem ignorar a intenção de aplicar o patch `patches/wouter@3.7.1.patch` ou o override `tailwindcss>nanoid`, gerando grafos diferentes e warnings no CI. A divergência entre versão executada e devDependency também torna o comportamento local menos determinístico.


**Teste de aceitação:**

`pnpm install --frozen-lockfile` num checkout limpo deve terminar sem o warning, manter o patch hash de wouter e nanoid resolvido conforme lock; verificar isso em CI com uma asserção do grafo, sem alterar lockfile na execução.


### 9.8 [LOW] O E2E de staging cria dados e não faz teardown

**Evidência:**

`scripts/validate-flow.mjs:53-73` cria serviços/profissionais, `:85-95` cria dois membros/contas e `:131-180` cria/atualiza appointments; não há chamadas de delete/cleanup antes de `:203-209`. O workflow exige explicitamente staging descartável em `.github/workflows/staging-e2e.yml:10-14`, o que mitiga mas não elimina o problema em reexecuções ou ambientes reutilizados.


**Correção proposta:**

Executar contra DB/tenant descartável por job ou adicionar teardown `finally` por sufixo, incluindo serviços, profissionais, membros, appointments e vínculos; manter a confirmação de ambiente autorizado. Registar IDs criados para cleanup mesmo quando uma asserção falha.


**Impacto:**

Reexecuções deixam dados, contaminam disponibilidade/overlap e podem acumular contas; falhas no meio deixam resíduos e tornam o teste menos idempotente. Isto pode produzir flakes e risco operacional em staging persistente.


**Teste de aceitação:**

Executar o fluxo duas vezes no mesmo ambiente autorizado deve terminar com o mesmo conjunto de dados esperado e zero resíduos do sufixo, inclusive quando uma etapa falha.


### Revisão de bibliotecas

- Vitest 2.1.4 é adequado para as suites unitárias, contratos HTTP e integração DB presentes em ambos os packages; não há evidência para substituir por Jest. O problema é a separação/seleção de suites e ausência de typecheck/coverage, não a escolha do runner.
- A divisão pnpm root + npm no gateway é coerente com dois manifests/lockfiles (`pnpm-lock.yaml` e `forte-whatsapp/package-lock.json`) e CI usa `pnpm install --frozen-lockfile`/`npm ci`; não recomendo migração abstrata de package manager. Corrigir primeiro a configuração pnpm warning.
- O gateway tem audit de produção limpo no snapshot (`npm audit --omit=dev --prefix forte-whatsapp`); não há motivo concreto para substituir Vitest, Baileys ou npm por outra biblioteca. O root precisa de triagem/atualização das cadeias advisory identificadas.
- Prettier já existe (`package.json:17`), portanto um `format:check` não mutante é uma melhoria menor e concreta; não há linter/coverage declarado, mas a adição deve ser guiada por regras e thresholds do produto, não por substituição de stack.

### Pontos fortes observados

- O checkout está no commit solicitado 445d4cc2747366b3a27976ba0b0046e8fbba102c e a árvore estava limpa; a auditoria usou o código/manifests desse snapshot, não apenas a documentação.
- Há um workflow PostgreSQL (`.github/workflows/postgres-integration.yml:13-73`) com serviço `postgres:16`, migrations versionadas, journal check, typecheck do gateway e tentativa explícita de falhar perante suites skipped; o job de publicação também repete migrations, testes, build e typechecks (`.github/workflows/publish-image.yml:17-90`).
- A suite é ampla (116 ficheiros de teste rastreados: 86 server, 16 gateway, 14 client/shared/scripts) e separa contratos/unidades de suites DB condicionais. O gateway testa ledger/outbox/retry, normalização, redaction e políticas com fakes confinados a `*.test.ts` (por exemplo `forte-whatsapp/src/server.test.ts:5-114` e `forte-whatsapp/src/webhook-outbox.test.ts:32-253`). Não encontrei `vi.mock`/fakes importados pelo runtime de produção.
- O package do gateway fixa Baileys em `7.0.0-rc14` e tem `package-lock.json` lockfileVersion 3; CI usa `npm ci` e `npm audit --omit=dev --prefix forte-whatsapp` devolveu zero advisories de produção no snapshot auditado.
- As seeds demo reais estão guardadas por `isDemoRuntimeAllowed()` (`server/db.ts:216-223,1595-1655,4851-4954`), o validator rejeita `DEMO_MODE=true` (`scripts/validate-production-config.ts:28-52`) e não há referência de runtime a `client/src/lib/demoData.ts` ou `ComponentShowcase`. Isto reduz o risco de dados demo entrarem no caminho normal, embora não prove o ambiente real.

### Limites da auditoria

- Revisão estritamente read-only: não instalei dependências, não alterei lockfiles/ficheiros, não executei migrations, não usei Supabase, não emparelhei nem enviei WhatsApp e não usei browser ou máquina real.
- Não executei `pnpm test`, `pnpm check`, `pnpm build` nem os workflows; as conclusões de pass/fail são do código/configuração observados. O `pnpm audit` e `npm audit` foram consultas read-only ao advisory registry e podem mudar com o tempo.
- A contagem de vulnerabilidades é do advisory DB disponível na data da auditoria; advisory presente não é prova de explorabilidade de todos os caminhos. A confirmação de alcance/mitigação requer revisão de uso e atualização controlada.
- Não há ambiente real nesta execução para confirmar conectividade/isolamento PostgreSQL, migrations em deployment, execução da imagem construída, staging no mesmo digest, browser, QR, socket Baileys, pairing ou envio.
- Documentação e `todo.md` contêm histórico/afirmações de execuções anteriores; foram tratados como dados e não como prova. Onde código e documentação divergem, este resultado privilegia manifests, workflows e símbolos do commit alvo.

## 10. Produção, observabilidade e prontidão beta

### 10.1 [HIGH] [Comprovado] Imagens publicadas e Compose usam a tag mutável latest, sem promoção por digest ou rollback reproduzível

**Evidência:**

docker-compose.yml:35-53,94-99,132-135 usa ghcr.io/...:latest com pull_policy: always para migrations, web, worker e gateway. .github/workflows/publish-image.yml:113-149 publica latest e tags sha-<commit>, que continuam sendo tags mutáveis/sem digest fixado; não há deploy, assinatura, scan, manifesto de promoção ou job de rollback. A própria regra operacional contradiz isso em infra/VPS_STACK.md:17-23 e AUDITORIA-GAPS-MVP-2026-09-30.md:79-85, que exigem imagens por digest e rollback.


**Correção proposta:**

Publicar um digest imutável por componente, gerar um release manifest com commit/digests/configuração, promover o mesmo digest de staging para produção e manter um procedimento de rollback para o digest anterior. Adicionar verificação de imagem/assinatura se esse for requisito do ambiente, sem substituir o Compose por outra ferramenta por abstração.


**Impacto:**

Duas reinicializações podem executar artefactos diferentes; uma migration pode correr com uma versão e web/worker com outra. Não há prova de que o artefacto que recebeu testes seja o que será promovido, nem de rollback determinístico. É um bloqueio de beta fechada operado em produção e de lançamento público.


**Teste de aceitação:**

Em staging descartável, guardar `docker compose config` e `docker image inspect` mostrando os quatro digests; executar deploy, rollback ao manifesto anterior e confirmar que web/worker/gateway/migration reportam a mesma versão e que uma migration não é reaplicada de forma incompatível.


### 10.2 [HIGH] [Comprovado] Readiness pode reportar verde sem gateway Baileys, worker ou Redis operacionais

**Evidência:**

server/api.ts:417-435 faz `/ready` depender apenas de checkDatabaseHealth. O gateway em forte-whatsapp/src/server.ts:18-37 considera ready quando não existe instância com status error; uma lista vazia ou instância idle/QR não é rejeitada. docker-compose.yml:88-92 e :125-130 só aguardam PostgreSQL/Redis healthy e forte-whatsapp `service_started`; não existem healthchecks para forte-panel, worker ou forte-whatsapp, nem dependência de `service_healthy` para o gateway.


**Correção proposta:**

Adicionar healthchecks Compose para cada serviço e usar readiness agregada: DB, Redis, migrations concluídas, heartbeat recente do worker, gateway alcançável e estado Baileys exigido para a instância do workspace. Diferenciar liveness de readiness e decidir explicitamente se QR/idle deve bloquear envio. Fazer o proxy monitorar 503.


**Impacto:**

Reverse proxy/monitor pode aceitar tráfego quando o processo HTTP está vivo mas o worker morreu, Redis está degradado, ou não há sessão Baileys conectada. O smoke em scripts/staging-smoke.sh:43-45 testa somente o endpoint do Panel e portanto pode dar falso verde para o canal suportado.


**Teste de aceitação:**

Em staging, matar o worker, bloquear Redis, deixar o gateway sem instância/conectado em QR e parar Baileys; cada caso deve produzir 503/healthcheck falho e impedir promoção, enquanto uma stack totalmente operacional produz 200. Testar também recuperação e retorno a ready.


### 10.3 [HIGH] [Comprovado] Auth state Baileys pode ser persistido sem encriptação e a chave obrigatória documentada não entra no Compose

**Evidência:**

docker-compose.yml:137-150 não injeta WHATSAPP_SESSION_ENCRYPTION_KEY. forte-whatsapp/src/config.ts:9-17 aceita a chave como string vazia. forte-whatsapp/src/instance-manager.ts:218-223 escolhe useEncryptedAuthState somente se a chave existir; caso contrário usa useMultiFileAuthState. BETA-OPERATIONS-CHECKLIST.md:91-97 exige tornar a chave de auth state obrigatória/persistente em staging/produção.


**Correção proposta:**

No runtime de produção, exigir WHATSAPP_SESSION_ENCRYPTION_KEY com formato/entropia válidos e falhar antes de abrir a sessão; adicioná-la aos exemplos/validador/Compose como secret injetado, nunca como valor versionado. Definir política de rotação e backup/restore da chave junto com a sessão.


**Impacto:**

Credenciais Signal/auth state e sessão WhatsApp ficam no volume em JSON legado quando o operador não acrescenta uma variável fora do Compose; comprometimento do host/backup expõe a sessão e o restore não tem garantia criptográfica. O build/teste não demonstra que produção falha fechado sem esse segredo.


**Teste de aceitação:**

Subir uma cópia de staging sem a chave e confirmar falha antes de criar auth state; subir com secret válido, parear número de teste autorizado, reiniciar, restaurar em diretório separado e confirmar reconnect sem QR e sem ficheiros de credenciais em claro.


### 10.4 [HIGH] [Comprovado] Backup/restore cobre PostgreSQL e sessão, mas não é restore completo do produto

**Evidência:**

scripts/backup-restore.sh:32-60 cria somente pg_dump e whatsapp-sessions tar/manifest; não inclui Redis, blobs/mídia, chave de encriptação, logs/artefactos ou configuração do deployment, nem encripta ou envia o pacote off-host. O `verify` em :63-81 apenas valida dump/tar/hash. O próprio O7.25-ENTREGA-RESTORE-REHEARSAL-GATE.md:12-18 diz que mídia é requisito e que backup-restore.sh ainda não tem adapter de exportação; AUDITORIA-GAPS-MVP-2026-09-30.md:79-80 e :113-118 mantêm restore real aberto.


**Correção proposta:**

Definir inventário de componentes e retenção, criar backup cifrado off-host de PostgreSQL, mídia, sessão, Redis quando necessário e chave/metadata de restauração; aplicar controle de acesso, checksum/manifesto e retenção. Separar preflight offline do restore destrutivo e automatizar rehearsal periódico em ambiente isolado.


**Impacto:**

Perda de mídia, Redis/coordenação ou chave de sessão não é recuperável pelo procedimento versionado. O pacote pode estar íntegro e ainda assim não restaurar a experiência do cliente; RPO/RTO, restore limpo, tenancy, readiness e pareamento permanecem não comprovados.


**Teste de aceitação:**

Gerar pacote com dados sintéticos representativos e inventário de mídia, restaurar em DB/Redis/volume Baileys novos, validar contagens/workspaces/mídia, health/readiness, reconnect e RPO/RTO medidos; exercitar falha parcial e rollback. Sem esse ensaio, o gate de beta continua aberto.


### 10.5 [MEDIUM] [Comprovado] Retenção operacional fica permanentemente em dry-run por omissão de configuração

**Evidência:**

server/worker.ts:73-95 passa `dryRun: process.env.FORTE_OPERATIONAL_RETENTION_DRY_RUN !== "false"`; portanto ausência da variável resulta em true. server/db.ts:4430-4449 define o mesmo default e :4490-4499 só executa DELETE quando `!dryRun`. Nenhum dos serviços em docker-compose.yml:54-124 define FORTE_OPERATIONAL_RETENTION_DRY_RUN. O worker apenas relata `retencaoOperacional=dry-run` em :93-95.


**Correção proposta:**

Escolher explicitamente o modo para cada ambiente: produção deve declarar `FORTE_OPERATIONAL_RETENTION_DRY_RUN=false` somente após validação, com limite/retentionDays e alarme de falha; manter true em rehearsal. Fazer startup/config check e registrar resultado efetivo.


**Impacto:**

webhookEvents, domainEvents e securityRateLimitBuckets antigos são selecionados/contados, mas não removidos no Compose de produção. A retenção declarada não é aplicada, podendo crescer armazenamento e prolongar dados operacionais além da política; métricas de limpeza podem parecer atividade sem efetivar eliminação.


**Teste de aceitação:**

Inserir eventos fora da janela em staging, executar pelo menos dois ciclos do worker com a configuração de produção e confirmar remoção limitada, auditada e tenant-scoped; repetir com dry-run=true e confirmar que nada é apagado.


### 10.6 [HIGH] [Comprovado] Email SMTP está documentado, mas deliberadamente não entrega e o Compose não configura transporte

**Evidência:**

server/_core/email.ts:40-63 define provider smtp como `providerReady=false`; server/_core/email.ts:147-152 retorna `not_configured` para smtp mesmo que EMAIL_DELIVERY_ENABLED=true. SMTP_HOST/PORT/USER/PASSWORD são apenas lidos em server/_core/env.ts:73-81 e não são usados em transporte. docker-compose.yml:77-81 passa somente EMAIL_DELIVERY_ENABLED, EMAIL_PROVIDER, EMAIL_FROM e EMAIL_API_KEY, sem SMTP. BETA-OPERATIONS-CHECKLIST.md:91-107 mantém onboarding/contas como gate operacional.


**Correção proposta:**

Ou remover SMTP dos exemplos/documentação até existir suporte, ou implementar um transporte SMTP real com timeout, TLS, redaction e tratamento/retry; preferir um provider HTTP já suportado somente se ele estiver contratado e configurado. Tornar readiness/health do onboarding explícito quando email for requisito.


**Impacto:**

Convites e recuperação de palavra-passe não têm canal SMTP funcional; com provider `smtp`, o sistema pode aparentar configuração mas devolve `not_configured`. Um beta sem fluxo real de convite/recuperação depende de intervenção manual e pode bloquear onboarding.


**Teste de aceitação:**

Em staging descartável, criar convite e password reset com o provider escolhido, confirmar entrega controlada, expiração/uso único, falha/retry e que nenhum token/segredo aparece em logs. Testar configuração incompleta e esperar bloqueio claro.


### 10.7 [HIGH] [Comprovado] Web server e worker não fazem drain gracioso de requisições/ticks em SIGTERM

**Evidência:**

server/_core/index.ts:33-74 cria/listens no HTTP server e apenas faz `startServer().catch(console.error)`; não há handlers SIGTERM/SIGINT nem `server.close`. server/worker.ts:126-140 altera `stopping=true` em SIGTERM, mas pode estar no meio de `tick()` e não aguarda operações, encerra o loop somente após o próximo sleep. O gateway tem shutdown melhor em forte-whatsapp/src/index.ts:13-23, mas isso não cobre Panel/worker.


**Correção proposta:**

Adicionar shutdown coordenado ao Panel (`server.close`, rejeição de novas requisições, timeout e exit), ao worker (não iniciar ticks novos, aguardar o tick atual, marcar readiness/heartbeat e sair com timeout) e definir stop_grace_period no Compose. Manter idempotência e recovery como segunda barreira.


**Impacto:**

Durante `docker compose up`/deploy/restart, pedidos podem ser cortados e jobs em processamento podem ficar parcialmente aplicados ou ser reprocessados; a proteção de idempotência/recovery não substitui dreno e janela de término. Não há prova de `stop_grace_period`, drain ou readiness false durante shutdown.


**Teste de aceitação:**

Em staging, gerar requisições/envios controlados, enviar SIGTERM em cada processo, confirmar HTTP 503/connection drain, zero job perdido/duplicado após restart e logs de encerramento dentro da janela; repetir com timeout forçado.


### 10.8 [HIGH] [Lacuna comprovada] Não há observabilidade/alertas externos conectados para worker, gateway, DB, fila e storage

**Evidência:**

server/worker.ts:26-31,41-47,93-123 escreve contadores e heartbeat em console; não há endpoint de métricas/Prometheus nem exportador no código auditado. As notificações de quota são in-app (BETA-OPERATIONS-CHECKLIST.md:58-70, :111-117), e o diagnóstico versionado admite que ainda não há provider/alertas reais em AUDITORIA-GAPS-MVP-2026-09-30.md:78-85. infra/VPS_STACK.md:19-23 recomenda alertas/logs estruturados, mas não os implementa.


**Correção proposta:**

Definir contrato de logs JSON redigidos com request/workspace/instance correlation sem conteúdo sensível, métricas de liveness/ready, idade/quantidade de fila, DLQ, latência e erros, e conectar sink/alert manager externo. Alertas devem cobrir ausência de heartbeat, readiness 503, erro de webhook, DB/storage e crescimento de retenção.


**Impacto:**

Falha de worker, backlog/dead-letter, DB, gateway ou storage pode ficar sem alerta fora da própria aplicação, especialmente quando a aplicação está indisponível. Console strings não dão retenção, cardinalidade, correlação/redaction ou regra de paging; não é um beta operável 24/7.


**Teste de aceitação:**

Em ambiente controlado, derrubar cada dependência e exceder limiares de fila/latência; confirmar evento no sink externo, alerta/paging com contexto redigido, deduplicação e recuperação. Sem provider real, manter este gate como não comprovado.


### 10.9 [MEDIUM] [Comprovado] O quality gate de produção não valida a configuração efetivamente publicada

**Evidência:**

scripts/validate-production-config.ts:41-44 só exige BAILEYS_API_KEY/BAILEYS_WEBHOOK_SECRET quando BAILEYS_BASE_URL está preenchida. O job verify em .github/workflows/publish-image.yml:51-59 não define BAILEYS_BASE_URL nem as chaves, logo passa sem validar o segredo do único provider suportado. O Docker entrypoint (infra/docker-entrypoint.sh:4-20) executa migração/Node mas nunca chama esse validador. O Compose exige interpolação não vazia para as duas chaves em docker-compose.yml:84-85, mas isso apenas deteta ausência e não substitui validação de comprimento/formato/estado real; também não existe prova de startup check da configuração completa.


**Correção proposta:**

Executar o validador como gate sobre um conjunto de variáveis de deployment não secretas e placeholders seguros que inclua BAILEYS_BASE_URL, e rodar um check de configuração fail-closed no startup (sem imprimir valores). Testar o `docker compose config` com secrets ausentes, placeholders, provider incoerente e configuração válida; não embutir segredos no CI.


**Impacto:**

CI pode certificar um artefacto sem certificar o contrato Baileys que ele precisa em produção; uma falha fica para o momento do deploy ou para o primeiro request. A separação entre imagens testadas e ambiente real também deixa `DEMO_MODE`, bootstrap, URL pública, email, rotação e retenção dependentes de disciplina externa.


**Teste de aceitação:**

No CI, fazer a ausência/placeholder de BAILEYS_API_KEY/WEBHOOK_SECRET falhar mesmo com DATABASE_URL sintético; em staging, executar o mesmo check antes de iniciar web/worker e confirmar que nenhum serviço atende se o contrato falhar.


### 10.10 [LOW] [Risco/inferência] Código e dados demo continuam dentro do artefacto de produção; a barreira é de ambiente, não de build/deploy

**Evidência:**

server/db.ts:4701-4849 contém contactos, mensagens e preços fixos; ensureDemoInbox/ensureDemoAgenda:4851-4985 podem materializá-los quando isDemoRuntimeAllowed é true. A barreira server/db.ts:221-230 é correta para NODE_ENV=production, mas infra/Dockerfile:10-14 só define um ENV base e não existe validação de startup do modo demo; uma execução manual do mesmo `dist` com NODE_ENV=development e DATABASE_URL de produção poderia ativar seeds.


**Correção proposta:**

Manter seeds apenas em módulo/fixture de desenvolvimento, exigir combinação explícita de banco/host de QA e bloquear `DEMO_MODE`/bootstrap quando DATABASE_URL ou hostname indicar produção; adicionar assertion de startup e teste de não-seeding com qualquer configuração de produção. Não remover a simulação de onboarding real sem confirmar o contrato de produto, pois ela é uma ferramenta de revisão e não seed de runtime.


**Impacto:**

Não é uma injeção comprovada no Compose atual, mas uma operação fora do Compose ou configuração errada pode contaminar uma base real com dados fictícios, contrariando a exigência de não haver demo/mock na aplicação. O conteúdo demo também permanece compilado e exposto para rotas de ambientes não-prod.


**Teste de aceitação:**

Executar testes com NODE_ENV=production, DEMO_MODE=true, DATABASE_URL de teste e ambiente QA/produção: nenhum seed deve ocorrer em produção; em QA, seeds devem ser intencionais e isolados. Verificar também que UI não apresenta contactos demo numa base vazia de produção.


### 10.11 [HIGH] [Gate não comprovado — beta fechada] Staging persistente, restore limpo, browser smoke, secrets/rotação e E2E Baileys real continuam sem evidência no commit

**Evidência:**

AUDITORIA-GAPS-MVP-2026-09-30.md:20-32 classifica como P0 staging PostgreSQL persistente multi-workspace, restore completo, browser smoke, segurança de sessão/secrets, efeito externo idempotente, inbound transacional, quality gate, runbook e revisão legal. BETA-OPERATIONS-CHECKLIST.md:111-118 diz que staging, console/sessões de suporte e alertas externos continuam abertos; :170-178 afirma que testes do gateway sem pareamento não substituem número dedicado, recebimento e envio reais. Os workflows staging-smoke/e2e são manuais (.github/workflows/staging-smoke.yml:3-24; staging-e2e.yml:3-46) e não demonstram execução no commit.


**Correção proposta:**

Abrir staging descartável persistente com dois workspaces, executar migrations/negative tenancy, browser desktop/mobile, fluxo de onboarding/invite, smoke de health/readiness, E2E Baileys com número controlado, crash/restart/idempotência, secrets/rotação, restore de todos os componentes e runbook/alertas; anexar evidências privadas ao release record.


**Impacto:**

Para beta fechada, o máximo sustentado pelo repositório é um MVP técnico/controlado. Não é possível afirmar isolamento persistente, recuperação, onboarding browser, operação pós-restart, pareamento ou envio sem tocar um ambiente real autorizado; convidar testers sem esses resultados mantém risco de perda de mensagens e exposição de dados.


**Teste de aceitação:**

Gate fechado somente com resultados datados, commit/digests, logs redigidos e critérios pass/fail reproduzíveis para cada item; qualquer skipped/unknown deve manter beta bloqueada.


### 10.12 [CRITICAL] [Gate não comprovado — lançamento público] A política fail-closed corretamente bloqueia publicSignup até oito evidências reais, mas nenhuma prova no repositório as satisfaz

**Evidência:**

server/controlled-release.ts:8-22 exige readiness PostgreSQL, integração/isolamento, backup/restore, E2E WhatsApp, observabilidade/alertas externos, revisão legal/privacidade/termos, billing SaaS e CORE_ONLY_MODE desligado; :25-35 retorna blocked para qualquer status diferente de passed. O documento O7.3-ENTREGA-RELEASE-PUBLICO-CONTROLADO.md:24-28 registra testes locais/CI, mas mantém staging persistente, E2E real, restore limpo, observabilidade externa, revisão legal e billing pendentes. AUDITORIA-GAPS-MVP-2026-09-30.md:121-132 classifica SaaS público e cobrança como não atingidos.


**Correção proposta:**

Preservar `publicSignupEnabled=false` até que cada evidência seja coletada em staging/produção controlada, com aprovação independente, data, digest e validade; ligar a decisão ao entrypoint público real, registrar rollback e não desativar CORE_ONLY_MODE por conveniência.


**Impacto:**

O lançamento público, cadastros públicos e cobrança não têm gate comprovado. Build, testes e Docker local não autorizam publicidade; se a UI ou operação tratar sucesso de CI como readiness, o fail-closed documental será contornado por processo humano.


**Teste de aceitação:**

Executar `evaluateControlledRelease` com evidência proveniente dos ensaios reais, exigir todos os oito `passed`, confirmar que qualquer `unknown/not_configured` mantém signup fechado e testar rollback desabilitando entrypoints sem apagar workspaces.


### Revisão de bibliotecas

- PostgreSQL/pg_dump/pg_restore, imagens oficiais Postgres/Redis e actions oficiais Docker/GHCR são escolhas razoáveis e reduzem código próprio; o problema encontrado é cobertura operacional, pinagem e evidência, não uma biblioteca que precise ser substituída.
- O gateway já usa logging estruturado interno e possui shutdown gracioso; não recomendo trocar Baileys nem o gateway por outra biblioteca: o produto confirmado é Baileys-only e os gaps são secrets, readiness, persistência e operações reais.
- A publicação usa docker/login-action, metadata-action e build-push-action oficiais (.github/workflows/publish-image.yml:100-149); eles reduzem implementação própria, mas não fornecem automaticamente digest promotion, scan, assinatura, deploy ou rollback.
- Não há base no commit para recomendar substituição abstrata de Compose, Drizzle, Redis ou do transporte de email; primeiro devem ser fechados os contratos e testes de aceitação acima.

### Pontos fortes observados

- HEAD está confirmado em 445d4cc2747366b3a27976ba0b0046e8fbba102c; a revisão foi somente leitura do código e documentação versionados.
- A fronteira do produto está coerente com Baileys: o Compose levanta apenas o gateway forte-whatsapp e o schema REST restringe provider a baileys (docker-compose.yml:132-153; server/api.ts:139-146). Não encontrei fallback Meta/PAPI operacional no runtime auditado.
- Os seeds Juliana/Marcos/etc. não são executados em NODE_ENV=production: isDemoRuntimeAllowed exige ambiente não-produtivo, DEMO_MODE=true e development/test/qa (server/db.ts:221-230), e ensureDemoInbox/ensureDemoAgenda verificam essa função (server/db.ts:4851-4861, 4934-4944). Isto é uma proteção real, embora ainda dependa de configuração de execução.
- Existem sinais úteis no código: health/readiness do Panel, health/readiness do gateway, heartbeat do worker, retries/outbox Baileys, retenção e comandos de verificação de backup/restore (server/api.ts:417-435; forte-whatsapp/src/server.ts:16-37; server/worker.ts:114-123; scripts/backup-restore.sh:63-81).
- O CI usa PostgreSQL, migrações, typecheck, testes, build e falha se detectar skips; o gateway também tem testes/check/build ( .github/workflows/publish-image.yml:44-90; .github/workflows/postgres-integration.yml:49-73). A política de release é fail-closed, mas os seus inputs ainda não têm evidência real (server/controlled-release.ts:25-47).

### Limites da auditoria

- A auditoria foi read-only e limitada ao working tree no commit indicado; não editei ficheiros, não executei migrations, não usei Supabase, não emparelhei nem enviei WhatsApp, não publiquei imagens/contactei serviços externos e não usei browser do utilizador.
- Não executei staging, GHCR, reverse proxy, secret manager, provider de alertas, storage real, SMTP, restore destrutivo ou browser smoke; por isso RPO/RTO, rotação, entrega de email, isolamento persistente e comportamento sob falha são gates não comprovados, não bugs inferidos como já observados.
- As afirmações de documentos foram confrontadas com código; quando a documentação declarou explicitamente um gap, isso foi usado como evidência de não-comprovação, não como prova de que um ambiente real foi executado.
- Não foram consultadas fontes externas; source_urls fica vazio deliberadamente. Nenhum build/teste adicional nesta auditoria deve ser interpretado como prova de readiness.

## Decisão de release

- **Não promover/publicar esta candidata como beta pública neste estado.** Preservar o gate fail-closed de signup; não o desligar para contornar lacunas.
- **Não executar as migrations de upgrade em bases com dados reais** até resolver o backfill `0017`, a migration `0043` e demonstrar upgrade/rollback em fixtures representativas e descartáveis.
- A publicação principal continua a ser a imagem GHCR operacional definida pelo processo do utilizador; esta auditoria não criou tag `:dev`, não fez push, não mudou o Compose remoto e não iniciou workflow GHCR.
- Nenhum teste com Supabase foi executado. A validação de dados deve usar PostgreSQL local descartável até haver uma autorização explícita para outro alvo.

## Próxima etapa

Executar o roteiro em [`PLANO-REMEDIACAO-BETA.md`](./PLANO-REMEDIACAO-BETA.md), começando por segurança de tenants e migrations. Em cada fase: correção pequena, teste de regressão, suíte PostgreSQL sem skips, typecheck/build e atualização de `docs/STATUS-ATUAL.md`. Não fazer reescrita ampla antes de fechar os P0.
