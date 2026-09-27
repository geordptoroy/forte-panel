# Forte Panel — auditoria de feedback e handoff para continuidade

**Data:** 2026-09-27  
**Repositório:** `geordptoroy/forte-panel`  
**Branch:** `main`  
**Commit de referência:** `7c0bcdb`  
**Objetivo deste arquivo:** registrar os erros encontrados na validação local, consolidar as decisões de produto informadas pelo usuário e preparar o próximo chat para executar a refatoração sem perder contexto.

> Esta etapa é **documental e de auditoria**. Nenhuma alteração funcional foi implementada neste registro.

---

## 1. Feedback recebido do usuário

Durante a validação local, o usuário informou:

1. **Mensagens do WhatsApp não estão chegando/fluindo corretamente** e a integração com Baileys precisa ser concluída de ponta a ponta.
2. A integração Baileys deve ser bem documentada e conectar corretamente todas as áreas do painel de cliente ao WhatsApp.
3. O console administrativo precisa de uma área para configurar as chaves/API dos modelos de IA.
4. Não devem ser colocados modelos predefinidos como se fossem obrigatórios. O console deve apresentar somente os tipos de inteligência necessários:
   - IA para responder no chat;
   - IA para transcrição;
   - IA para criação/edição de prompts;
   - IA para visão.
5. O modelo deve ser escolhido **globalmente por tipo de interação**, no console da plataforma, e não cliente por cliente.
6. Um prompt criado em uma conta não apareceu no console administrativo.
7. A página atualmente chamada Kanban deve ser apresentada ao usuário como **Funil**.
8. O profissional executor precisa informar sua função em texto no cadastro da conta.
9. O profissional executor só deve visualizar seus agendamentos, poder registrar o valor recebido e operar outros campos financeiros/operacionais necessários.
10. É necessária uma auditoria completa dos fluxos do console administrativo e do painel do cliente, incluindo conexão Baileys e entrega das interfaces dos dois painéis.

### Logs recebidos nesta sandbox

Não foram encontrados novos arquivos de log anexados fora dos documentos já versionados. O repositório contém apenas evidências históricas no `FORTE-MEDIA-HANDOFF.md` e logs internos de ferramentas. Portanto, os achados abaixo combinam:

- o feedback acima;
- leitura do código atual;
- documentação já versionada;
- evidências históricas de Docker/Baileys registradas no handoff anterior.

Os logs que faltavam foram anexados pelo usuário em `pasted_content_4.txt` e analisados nesta atualização. Eles confirmam problemas de ordem de inicialização, reinício do banco durante a execução e sincronização de estado do Baileys.

---

## 2. Estado técnico de referência

### Stack

- React 19 + TypeScript;
- Express + tRPC;
- Drizzle + PostgreSQL;
- Redis;
- worker separado;
- gateway `forte-whatsapp` usando Baileys;
- adapters de WhatsApp para Baileys, Meta Cloud API e legado PAPI;
- configuração multimodelo persistida em `workspaceSettings`;
- console separado em `/platform-admin`;
- Docker Compose com Panel, worker, PostgreSQL, Redis e gateway WhatsApp.

### Arquivos centrais auditados

| Área | Arquivos |
|---|---|
| Gateway Baileys | `forte-whatsapp/src/instance-manager.ts`, `forte-whatsapp/src/server.ts`, `forte-whatsapp/src/config.ts` |
| Adapter WhatsApp | `server/integrations/whatsapp.ts`, `server/integrations/contracts.ts` |
| Webhook/API | `server/api.ts` |
| Worker/agente | `server/db.ts`, `server/worker.ts`, `server/native-agent.ts` |
| Console plataforma | `client/src/pages/PlatformAdminPage.tsx`, `server/platform-router.ts`, `server/platform-admin.ts` |
| IA cliente | `client/src/pages/AiConfigPage.tsx`, `server/routers.ts`, `server/db.ts` |
| Painel cliente | `client/src/App.tsx`, `client/src/components/PanelLayout.tsx`, `client/src/pages/PanelPages.tsx` |
| Equipe/profissional | `client/src/pages/TeamPage.tsx`, `client/src/pages/ProfessionalPortal.tsx`, `server/workspace.ts`, `server/agenda.ts` |
| Dados | `drizzle/schema.ts`, migrations em `drizzle-pg/` |

---

## 3. Achados críticos — prioridade P0

### P0.1 — WhatsApp/Baileys não está comprovado de ponta a ponta

A documentação histórica registra que:

```text
WhatsApp → Baileys → webhook → Forte Panel → PostgreSQL → Inbox
```

já funcionou para uma mensagem inbound. Também registra:

```text
[forte-worker] processadas=1 enviadas=1 falhas=0 limitadas=0
```

Isso prova processamento interno, mas **não prova entrega física no aparelho** nem confirma que todos os fluxos da UI usam o mesmo `jid`, `instanceId` e provider.

No código atual:

- `InstanceManager.handleMessages()` descarta mensagens `fromMe` e grupos;
- o webhook guarda `metadata.jid` e `instanceId`;
- `createBaileysAdapter().sendMessage()` prefere `metadata.jid`;
- o gateway normaliza um telefone sem `@` para `@s.whatsapp.net`;
- mensagens `@lid` dependem de o JID completo ter sido persistido na conversa/mensagem;
- o gateway registra falha do webhook apenas como warning e não possui fila/retry próprio para callback;
- `server.ts` retorna `status: sent` imediatamente após `socket.sendMessage()`, sem confirmação posterior de entrega/read;
- a interface do cliente mostra status do canal, mas ainda não apresenta uma cadeia observável `queued → processing → provider_accepted → delivered/failed`.

**Conclusão:** a integração está parcialmente implementada, mas o contrato operacional ainda é frágil para o requisito “mensagens chegando e saindo corretamente”.

### Evidência nova dos logs anexados

Os logs trazem quatro achados objetivos:

1. **Race condition entre worker e migrations.** Às `15:27:15`, `15:27:18` e `15:27:21`, o PostgreSQL registra:

   ```text
   ERROR: relation "messages" does not exist
   STATEMENT: update "messages" set "status" = $1 where "messages"."status" = $2 returning "id"
   ```

   O worker começou a executar contra o banco antes de o schema estar disponível. Mais tarde, às `16:16:05`, o Panel iniciou `applying database migrations` e concluiu às `16:16:08`. O Compose atual depende apenas de `depends_on`/health e não garante que a migration tenha terminado antes do worker.

   **Impacto:** o worker pode falhar ao recuperar/atualizar mensagens, causando a impressão de que mensagens não chegam ou não são processadas. A correção P0 é um job/entrypoint de migration separado ou um gate explícito de readiness de schema antes de iniciar o worker.

2. **Reinício do PostgreSQL derruba o worker.** Às `16:28:19`, o worker encerra com:

   ```text
   error: terminating connection due to administrator command
   code: 57P01
   Emitted 'error' event on BoundPool instance
   ```

   O PostgreSQL registra `checkpoint starting: shutdown immediate` e encerra; depois os containers sobem novamente. O pool `pg` do worker emite um erro fatal não tratado. **Não é uma falha de senha ou de schema nessa ocorrência:** é o banco sendo reiniciado enquanto o worker mantinha conexão ativa.

   **Impacto:** um restart normal de banco pode matar o worker ou deixá-lo sem recuperar jobs. Adicionar listener de erro no pool, backoff de reconexão, reabertura segura do pool e recuperação de jobs presos após o startup.

3. **Sessão Baileys passa por stream error 515.** Às `16:17:25`, após o pareamento, aparece:

   ```text
   stream errored out
   Error: Stream Errored (restart required)
   ```

   O gateway reconecta às `16:17:28`, refaz pre-keys e fica online. O código 515, isoladamente, parece uma reinicialização exigida pelo estado da sessão após o pareamento, não prova banimento. Porém, a UI deve mostrar `reconnecting` e não `connected` durante essa janela.

4. **Falhas de app-state sync e identidades `@lid`.** O Baileys registra repetidamente:

   ```text
   failed to find key "AAAAAOyY" to decode mutation
   ... parking after 2 attempts
   ```

   Depois injeta novas chaves e conclui o app-state sync, mas registra várias mudanças de identidade para JIDs `@lid`, por exemplo:

   ```text
   jid: "159446902776063@lid"
   identity key changed or new contact, session will be re-established
   ```

   Também confirma a sessão própria com:

   ```text
   myPN: "5511999828045:12@s.whatsapp.net"
   myLID: "21522752209051:12@lid"
   Own LID session created successfully
   ```

   **Impacto:** o gateway ficou online, mas o armazenamento e a resolução de destinatários não podem depender apenas de telefone. É obrigatório persistir o JID completo recebido e correlacionar `@lid`/PN sem sobrescrever contatos ou enviar para um destinatário incorreto.

5. **O worker continuou saudável somente no heartbeat após o restart.** Às `16:28:21` ele iniciou novamente com `lastError: null` e os heartbeats seguiram até `16:37:22`. Isso comprova que o processo volta a subir, mas não comprova que havia jobs/mensagens sendo consumidos; o log não contém uma confirmação de `inbound received`, `outbound sent` ou webhook aceito nesse intervalo.

6. **Há chamadas sem sessão autenticada.** O Panel registra várias vezes `Auth: Missing session cookie` (`16:16:14`, `16:16:45`, `16:28:28`, `16:33:00` etc.). Isso é compatível com acesso sem login, sessão expirada ou cookies não enviados pelo browser. Não é a causa direta da falha Baileys, mas deve ser relacionado ao problema do console administrativo: o frontend precisa distinguir `401/sessão ausente` de `403/sem permissão` e redirecionar corretamente.

7. **Aviso não bloqueante do Express.** O Panel registra `res.clearCookie: Passing "options.maxAge" is deprecated`. Corrigir para remover `maxAge` do `clearCookie`; não explica as mensagens ausentes, mas deve sair do log antes do beta.

### Correção de prioridade derivada dos logs

Antes de investigar a entrega física no celular, executar nesta ordem:

1. separar migrations do processo web e do worker;
2. esperar um `schema_ready` explícito antes de iniciar qualquer polling;
3. tornar o pool PostgreSQL resiliente a `57P01` e `ECONNRESET`;
4. subir o worker e confirmar `worker_heartbeat` sem erro;
5. testar inbound/outbound com `messageId`, `jid`, `instanceId` e status em cada etapa;
6. só então investigar entrega física, `@lid` e confirmação do provider.

Não apagar a sessão WhatsApp neste momento. Os logs mostram que a sessão reconectou, sincronizou e identificou `myPN`/`myLID`; apagar a sessão eliminaria uma evidência útil e obrigaria novo pareamento.

### P0.2 — Erro de arquitetura na configuração da IA

O código atual possui configuração por workspace em `AiConfigPage.tsx` e procedures `agent.config`, `agent.save`, `agent.testConnection` e `agent.models`.

Contudo:

- as procedures estão protegidas por `requirePlatformAdministrator`;
- a UI de configuração está na rota do painel cliente `/ai-config`;
- a configuração é armazenada em `workspaceSettings` com a chave `native_agent_config`;
- o objeto atual contém providers `nvidia_nim`, `google_gemini` e `openai_compatible`;
- o routing atual contém `text`, `vision`, `audio` e `document`;
- existem defaults de endpoint/modelo em `AiConfigPage.tsx` e fallback para `AGENT_MODEL`/`gpt-5-mini` no backend;
- o console de plataforma mostra configuração de agente por workspace, não uma matriz global de capacidades.

Isso contradiz a decisão do usuário: **a plataforma deve escolher os modelos gerais por tipo de interação**. O cliente não deve receber uma escolha de modelo por conta, e o console administrativo não deve obrigar a editar workspace por workspace.

### P0.3 — Prompt criado no cliente não aparece no console administrativo

Há duas trilhas de prompt:

1. **Onboarding/publicação de perfil do negócio**
   - `onboarding_profile`;
   - `ai_prompt_published`;
   - `onboardingPublishedVersions`;
   - publicação e rollback por workspace.
2. **Prompt do agente nativo**
   - `native_agent_config`;
   - `agentPromptDrafts`;
   - `agentPromptVersions`;
   - simulação/publicação/rollback no console de plataforma.

O console administrativo lê o segundo caminho (`agentPromptVersions`/configuração do agente), enquanto o cliente pode ter criado o primeiro (`ai_prompt_published`). Portanto, o prompt pode estar salvo corretamente e ainda assim não aparecer no console.

**Decisão necessária para a implementação:** o console deve ter uma visão única e explícita de:

```text
original do onboarding
→ transcrição
→ fatos extraídos
→ regra redigida
→ prompt rascunho
→ prompt confirmado pelo cliente
→ prompt publicado em runtime
→ versões/rollback/auditoria
```

Não duplicar o conteúdo silenciosamente entre `ai_prompt_published` e `native_agent_config`.

### P0.4 — “Kanban” ainda é o nome técnico visível em vários pontos

A rota atual é `/kanban`, o componente é `KanbanPage` e várias classes CSS usam `kanban-*`. Porém, a sidebar já usa o rótulo “Funil de atendimento” em alguns pontos.

A decisão de produto é:

- nome visível para o cliente: **Funil**;
- URL canônica futura: `/funil`;
- `/kanban` pode permanecer como redirect compatível durante a migração;
- nomes técnicos internos podem continuar temporariamente, mas não devem aparecer em títulos, menus, ajuda ou mensagens.

Também separar no futuro:

- **Funil de leads do cliente**;
- **Kanban de tickets do suporte interno**, que pertence ao console da plataforma.

---

## 4. Refatoração Baileys — desenho obrigatório

### 4.1 Objetivo

Fazer o gateway e o Panel operarem como uma integração confiável, observável e tenant-aware para:

```text
conectar QR
→ manter sessão
→ receber texto/mídia
→ persistir contato/conversa/mensagem
→ atualizar Inbox/Funil/Dashboard
→ responder por humano ou IA
→ confirmar aceite do provider
→ reconciliar falha/entrega
→ registrar auditoria
```

### 4.2 Contrato de identidade

Toda mensagem deve carregar e preservar:

- `workspaceId` no lado do Panel;
- `instanceId` da conexão;
- `provider = baileys`;
- `externalId`/message key do WhatsApp;
- `jid` completo original, incluindo `@lid` quando recebido;
- telefone alternativo normalizado somente para busca/CRM;
- `fromMe`;
- tipo de mensagem;
- timestamp do provider;
- correlation/request ID;
- tentativa e último erro.

Nunca resolver um outbound somente pelo telefone normalizado quando existir `metadata.jid` confiável.

### 4.3 Webhook Baileys → Panel

Implementar:

- assinatura obrigatória por instância, sem fallback silencioso;
- validação de tamanho, tipo e schema antes do processamento;
- `eventId` idempotente por `(workspaceId, instanceId, eventId)`;
- retry com backoff no gateway quando o Panel retornar `5xx`/timeout;
- fila local ou outbox de webhook para não perder evento quando o Panel reiniciar;
- dead-letter/error state após limite de tentativas;
- logs JSON com `instanceId`, `messageId`, `jid`, `eventId`, `status`, `attempt`;
- endpoint de reconciliação para consultar eventos não confirmados;
- distinção entre mensagem recebida, mensagem enviada pelo usuário e evento de status.

### 4.4 Outbound Panel → Baileys

O worker deve expor claramente os estados:

```text
queued
→ processing
→ provider_accepted
→ sent
→ delivered (quando houver evidência)
→ read (quando houver evidência)
→ failed
```

Requisitos:

- não marcar como “entregue” apenas porque `sendMessage()` retornou um ID;
- armazenar resposta bruta minimizada e segura do provider;
- usar `instanceId` da conversa/mensagem, sem fallback global indevido;
- usar `metadata.jid` completo quando disponível;
- para mensagens antigas sem JID, exibir ação de reconciliação/novo inbound em vez de inventar destinatário;
- retry idempotente por mensagem, com limite e backoff;
- não duplicar mensagens após timeout ambíguo;
- reconciliar `externalId` e status posteriormente;
- informar na Inbox por que uma mensagem falhou.

### 4.5 Mídia

A implementação atual envia mídia via data URL em `metadata.mediaData` em alguns fluxos. Isso deve ser substituído por:

- storage privado por workspace/mensagem;
- URL assinada de curta duração;
- hash e MIME real;
- limite de tamanho/duração;
- retenção configurável;
- download pelo gateway somente durante o envio;
- nenhum conteúdo binário grande no banco ou em logs.

### 4.6 Interface de conexão

Na página **Integrações / Conexão WhatsApp**:

- QR na primeira dobra;
- estado `idle`, `connecting`, `qr`, `connected`, `disconnected`, `logged_out`, `error`;
- telefone conectado;
- `instanceId` apenas em detalhe técnico;
- última atualização;
- expiração do QR;
- erro acionável;
- reconectar, desconectar e sair da sessão com confirmação adequada;
- indicador separado de gateway saudável, webhook saudável e worker saudável;
- teste inbound e outbound guiado;
- nenhuma chave Baileys visível ao cliente.

### 4.7 Testes de aceite Baileys

Criar testes automatizados e um E2E Docker/staging que comprove:

1. QR aparece;
2. pareamento deixa o estado `connected`;
3. reinício preserva sessão;
4. inbound de texto aparece no Inbox;
5. inbound de mídia mantém MIME/JID e não vaza tenant;
6. contato/conversa são criados ou reutilizados corretamente;
7. resposta humana chega ao mesmo JID;
8. resposta IA chega ao mesmo JID;
9. mensagem fica como `provider_accepted`, não como entregue prematuramente;
10. falha/timeout gera retry sem duplicação;
11. mensagem nova aparece no celular;
12. duas empresas não conseguem usar a instância uma da outra;
13. logout invalida a sessão e exige novo QR;
14. webhook inválido é rejeitado e auditado;
15. worker reiniciado recupera jobs presos.

---

## 5. Arquitetura desejada para modelos de IA

### 5.1 Regra de produto

O console da plataforma configura uma **política global de IA**, não uma seleção de modelo por cliente.

O cliente deve poder:

- ativar/desativar funcionalidades permitidas;
- configurar seu prompt e regras de negócio;
- revisar e publicar seu conteúdo;
- não escolher credenciais/modelos técnicos da plataforma.

O administrador da plataforma escolhe os modelos gerais por capacidade.

### 5.2 Capacidades mínimas

A configuração global deve ter exatamente estas quatro áreas visíveis:

| Capacidade | Uso |
|---|---|
| **Resposta no chat** | responder mensagens, usar ferramentas e fazer handoff/agendamento |
| **Transcrição** | converter áudio recebido ou áudio do onboarding em texto |
| **Criação de prompts** | extrair fatos, redigir regras e propor versões de prompt |
| **Visão** | interpretar imagens, comprovantes, fotos e documentos visuais |

`document` pode ser uma subcapacidade de visão, mas não deve virar um quinto bloco obrigatório sem decisão explícita.

### 5.3 Sem modelos predefinidos obrigatórios

Não colocar `gpt-5-mini`, `whisper-1`, URLs Nvidia/Gemini ou qualquer outro modelo como escolha fixa da interface.

A UI deve começar com:

```text
Não configurado
```

O administrador informa:

- provider/endpoint compatível;
- API key;
- modelo exato disponibilizado pelo provider;
- limites/timeouts opcionais;
- ativo/inativo;
- data e autor da última alteração.

A plataforma pode ter fallback técnico interno para desenvolvimento, mas ele não deve aparecer como modelo de cliente nem ser tratado como configuração de produção. A origem do fallback deve ser explicitamente marcada e auditada.

### 5.4 Dados sugeridos

Criar uma configuração global, separada de `workspaceSettings`, por exemplo:

- `platformAiProviders` — endpoints e secrets criptografados;
- `platformAiRoutes` — capacidade → provider/modelo;
- `platformAiRouteVersions` — histórico publicado;
- `workspaceAiOverrides` — somente flags e regras permitidas, sem chave/modelo;
- `aiExecutionLogs` — capacidade, versão, latency, tokens/custo aproximado, resultado/falha sem conteúdo sensível desnecessário.

As chaves devem:

- ser criptografadas em repouso;
- nunca voltar completas para o browser;
- ser mascaradas;
- permitir rotação;
- registrar quem alterou, quando e por quê;
- não aparecer em prompts, logs ou exportações comuns.

### 5.5 Fluxo da IA

```text
platform_admin configura quatro capacidades
→ testa conexão por capacidade
→ publica versão global
→ workspace usa a versão global
→ cliente edita regras/prompt do próprio negócio
→ cliente confirma/publica conteúdo de negócio
→ runtime combina política global + prompt do workspace
→ execução registra capacidade/versão/resultado
```

### 5.6 Critérios de aceite

- Não existe dropdown de modelo por cliente;
- não existem defaults de provider/modelo apresentados como obrigatórios;
- o console mostra quatro capacidades globais;
- cada capacidade pode ser testada isoladamente;
- uma falha em transcrição não derruba resposta de texto;
- vision recebe mídia somente quando o canal e a capacidade estão configurados;
- criação de prompt não publica automaticamente;
- rollback global e rollback de prompt do workspace são independentes;
- o workspace consegue ver o status funcional sem ver secret/modelo técnico completo.

---

## 6. Unificação dos prompts

### Problema atual

O onboarding publica `ai_prompt_published`, enquanto o agente nativo do console usa `native_agent_config` e tabelas de versões do agente. Isso explica o prompt criado em uma conta não aparecer no console.

### Refatoração

Criar uma visão de prompt com origem e estado:

| Campo | Exemplo |
|---|---|
| workspace | Empresa A |
| origem | onboarding / edição manual / suporte |
| tipo | regras de negócio / prompt operacional |
| versão | 4 |
| estado | draft / awaiting_confirmation / published / rolled_back |
| publicado por | user/platform admin |
| confirmado em | timestamp |
| versão global de IA | 3 |
| checksum | hash |
| conflitos/missing | lista estruturada |

O console deve listar prompts por workspace e mostrar:

- o prompt atual publicado;
- o último rascunho;
- a origem;
- quem criou/confirmou/publicou;
- diferenças entre versões;
- fatos extraídos e transcrição de origem;
- simulação;
- rollback;
- auditoria.

A sincronização deve ser explícita, idempotente e testada. Não copiar prompt entre tabelas sem registrar origem e versão.

---

## 7. Refatoração de nomenclatura: Funil

### Alterações esperadas

- título da página: **Funil**;
- menu: **Funil de atendimento**;
- CTA e empty states usam “funil”;
- rota canônica: `/funil`;
- redirect compatível `/kanban → /funil`;
- testes de rota para ambos;
- `aria-current="page"` na navegação;
- remover “kanban” da linguagem do cliente;
- manter classes internas `kanban-*` somente até uma limpeza técnica posterior.

### Suporte interno

Se o console da plataforma receber tickets, o quadro interno deverá ser chamado **Tickets de suporte**, não Funil. Não misturar tickets administrativos com leads do cliente.

---

## 8. Profissional executor — modelo desejado

### Regra de acesso

O profissional executor é um perfil operacional vinculado a um login individual e, opcionalmente, a uma entidade `professional`.

Ele deve:

- ver somente seus agendamentos;
- ver dados mínimos necessários do cliente atendido;
- iniciar/concluir/marcar não comparecimento conforme permissão;
- consultar sua disponibilidade;
- registrar recebimento permitido pela política do workspace;
- não ver Inbox global, outros profissionais, configurações de IA, secrets, equipe, auditoria completa ou faturamento do SaaS.

O backend já filtra a agenda por `professionalId`, mas a auditoria deve comprovar isso em PostgreSQL com dois profissionais e dois workspaces.

### Campos novos ou a confirmar

No cadastro/convite do profissional, adicionar:

- `jobTitle` / função textual livre, obrigatório;
- `specialty` opcional;
- `bio` opcional;
- `professionalId` vinculado;
- `canRegisterPayments` booleano controlado pelo owner/manager;
- `paymentRegistrationScope` (`own_appointments` por padrão);
- `active`;
- `serviceIds` permitidos;
- `workingNotes` internas, se necessário.

Não usar apenas enum para a função. O enum `operationalRole=professional` continua definindo a política; o texto descreve o trabalho real.

### Registro de pagamento recebido

O campo atual `quotes.receivedCents` é insuficiente como histórico/ledger. Criar entidade imutável, por exemplo `paymentReceipts` ou `quotePayments`, com:

- `workspaceId`;
- `quoteId`/`appointmentId`/`contactId`;
- `receivedCents`;
- `receivedAt`;
- `method`: Pix, dinheiro, cartão/maquininha, transferência, outro;
- `reference` opcional;
- `receivedByUserId`;
- `professionalId` opcional;
- `notes`;
- `status`/estorno separado, sem apagar o recebimento;
- número sequencial por workspace;
- auditoria.

O profissional pode registrar o valor somente quando:

- estiver vinculado ao atendimento/cliente;
- tiver permissão explícita;
- estiver dentro do escopo próprio;
- o servidor validar tenant e ownership;
- o valor não for usado para confirmar liquidação de gateway inexistente.

O produto deve deixar claro que isso é **registro manual de recebimento**, não checkout, conciliação bancária ou cobrança automática.

---

## 9. Auditoria do painel do cliente

### Fluxo de entrada

Verificar:

- login, signup, convite, reset e logout;
- workspace ativo resolvido pela membership;
- owner/admin/manager/agent/professional com menus corretos;
- estados loading/error/empty;
- retorno seguro após sessão expirada.

### Dashboard

Verificar:

- KPIs de inbound/outbound por status real;
- contatos novos;
- aguardando resposta baseado na última mensagem;
- agendamentos no timezone do workspace;
- recebido manual não misturado com faturamento SaaS;
- atualização após webhook sem reload indevido.

### Inbox/Atendimento

Verificar:

- conversa correta por workspace/contato/JID;
- inbound novo aparecendo;
- unread consistente;
- resposta humana no mesmo JID;
- takeover humano e retorno à IA;
- status queued/processing/sent/failed;
- mídia privada;
- erro acionável;
- paginação e scroll mobile.

### Funil

Verificar:

- nome “Funil”;
- estágios canônicos no backend;
- drag-and-drop com mutação tenant-aware;
- mensagens/contatos não desaparecem após mover;
- auditoria da mudança;
- filtros e busca;
- atualização do Dashboard.

### Agenda/Serviços/Profissionais

Verificar:

- timezone;
- conflito de horários;
- vínculo profissional-serviço;
- agenda do profissional restrita;
- notificações ao gestor e executor correto;
- cancelamento/reagendamento;
- função textual do profissional;
- registro manual de recebimento com permissão.

### Onboarding/IA

Verificar:

- texto e voz;
- consentimento;
- transcrição revisável;
- missing/conflicts/follow-up;
- fatos extraídos separados da regra redigida;
- confirmação humana;
- prompt não publicado automaticamente;
- origem/versionamento visível;
- uso da configuração global de IA sem expor secrets/modelos técnicos.

### Integrações

Verificar:

- Conexão WhatsApp na primeira dobra;
- QR/status/retry/logout;
- health do gateway, webhook e worker;
- nenhuma API key no cliente;
- quotas e erros;
- Meta como alternativa somente se realmente implementada.

---

## 10. Auditoria do console administrativo da plataforma

### Acesso e navegação

- `platform_admin` deve ser independente de membership de workspace;
- `/platform-admin` e `/platform-admin/workspaces` devem funcionar;
- logout deve retornar a `/login`;
- refresh/back/forward devem preservar ou limpar sessão corretamente;
- sessão de suporte deve exigir motivo, modo, expiração e auditoria;
- workspace suspenso deve poder ser aberto para diagnóstico/reativação;
- não cair no painel normal do cliente.

### Workspaces

O console deve mostrar por workspace:

- status;
- saúde de canal/worker;
- quotas;
- owner/membros;
- conexão WhatsApp;
- último inbound/outbound;
- erros recentes;
- onboarding e prompt;
- configuração global aplicada;
- eventos de auditoria.

Adicionar paginação, busca com debounce e filtros por status/saúde.

### Sessão de suporte

Separar claramente:

- read-only;
- operator mutável;
- administrador de plataforma.

Toda ação deve registrar:

- ator;
- workspace;
- supportSessionId;
- motivo;
- ação;
- antes/depois sem secrets;
- timestamp;
- request/correlation ID.

### Área global de IA

Adicionar navegação própria, por exemplo:

- **IA da plataforma**;
- **Provedores**;
- **Rotas de interação**;
- **Prompts e versões**;
- **Simulações/execuções**;
- **Auditoria**.

Não colocar essa área dentro do detalhe de um único workspace.

### Prompt por workspace

No detalhe do workspace, o console deve visualizar o prompt do negócio, mas não tratá-lo como configuração global de modelo. Deve ser possível:

- comparar origem/versões;
- ver confirmação do cliente;
- simular;
- publicar/rollback conforme o modo da sessão;
- registrar motivo;
- não revelar secrets.

---

## 11. Matriz de permissões esperada

| Capacidade | Owner | Admin | Manager | Agent | Profissional executor | Platform read-only | Platform operator |
|---|---:|---:|---:|---:|---:|---:|---:|
| Ver Inbox próprio/atribuído | sim | sim | sim | conforme fila | não por padrão | sim | sim |
| Ver Inbox global | sim | sim | sim | não | não | sim | sim |
| Funil | sim | sim | sim | conforme permissão | não por padrão | sim | sim |
| Agenda completa | sim | sim | sim | não | não | sim | sim |
| Minha agenda | sim | sim | sim | sim | sim | sim | sim |
| Configurar equipe | sim | sim | não por padrão | não | não | não | conforme suporte |
| Configurar WhatsApp | sim | sim | sim conforme política | não | não | não | diagnóstico |
| Configurar regras/prompt do negócio | sim | sim | sim conforme política | não | não | leitura limitada | suporte |
| Escolher modelo global | não | não | não | não | não | não | somente admin de plataforma |
| Ver API keys completas | não | não | não | não | não | não | nunca após gravação |
| Registrar recebimento próprio | conforme flag | conforme flag | conforme flag | não | conforme flag | não | suporte auditado |
| Reset destrutivo | não | não | não | não | não | não | admin explícito |

A matriz deve ser aplicada no backend. Esconder botão no frontend não é segurança.

---

## 12. Plano de implementação para o próximo chat

### Bloco 1 — diagnóstico reproduzível do Baileys

1. Atualizar Docker sem apagar volume;
2. capturar logs do gateway, Panel e worker com correlation IDs;
3. testar inbound novo;
4. consultar mensagem/JID/instanceId no PostgreSQL;
5. responder pela mesma conversa;
6. comparar status interno com aparelho;
7. reproduzir falha;
8. transformar o caso em teste automatizado.

### Bloco 2 — contrato e confiabilidade Baileys

1. webhook retry/outbox;
2. assinatura obrigatória por instância;
3. estados de entrega;
4. reconciliação;
5. storage privado de mídia;
6. E2E Docker/staging;
7. documentação operacional atualizada.

### Bloco 3 — IA global

1. migration para configuração global;
2. quatro capacidades;
3. secrets criptografados/mascarados/rotacionáveis;
4. sem defaults visíveis;
5. teste por capacidade;
6. publicação/rollback global;
7. workspace consumindo versão global;
8. remover escolha técnica por cliente.

### Bloco 4 — unificação de prompts

1. inventariar registros `ai_prompt_published`, `onboardingPublishedVersions`, `native_agent_config`, `agentPromptDrafts`, `agentPromptVersions`;
2. criar read model/contract único;
3. exibir origem, estado e versão;
4. sincronizar explicitamente;
5. testar prompt criado no cliente aparecendo no console;
6. testar rollback sem alterar outra empresa.

### Bloco 5 — Funil

1. adicionar `/funil`;
2. redirect de `/kanban`;
3. trocar títulos/menus/ajuda;
4. manter compatibilidade interna temporária;
5. testes de navegação e acessibilidade.

### Bloco 6 — profissional e recebimentos

1. migration para função textual e flags;
2. formulário de criação/edição;
3. backend de escopo próprio;
4. ledger de recebimentos;
5. registro manual com auditoria;
6. portal enxuto;
7. testes negativos com dois profissionais/workspaces.

### Bloco 7 — auditoria E2E dos dois painéis

1. smoke de todas as rotas;
2. matriz de permissões;
3. teste de refresh/back/forward;
4. teste mobile crítico;
5. teste de sessão de suporte;
6. teste de prompt/IA;
7. teste Baileys;
8. PostgreSQL real e staging antes de novos convites beta.

---

## 13. Critério de “pronto” desta rodada

Não considerar pronto enquanto não houver evidência de:

- mensagem inbound nova no banco e na Inbox;
- mensagem outbound aceita pelo gateway e confirmada no aparelho de teste;
- retry sem duplicação;
- mesma conversa/JID/instanceId em todo o caminho;
- quatro capacidades globais de IA no console;
- nenhum modelo obrigatório/predefinido apresentado ao cliente;
- prompt criado no workspace visível na visão administrativa unificada;
- página chamada Funil;
- profissional com função textual e agenda restrita;
- recebimento manual auditado e limitado;
- logout e navegação dos dois painéis funcionando;
- dois workspaces isolados em PostgreSQL real;
- documentação/contratos atualizados junto com migrations e testes.

---

## 14. Comandos de diagnóstico local — sem apagar sessão

No PowerShell do usuário:

```powershell
cd C:\Users\Rafae\Desktop\forte-media

docker compose --env-file .env ps
Invoke-RestMethod http://localhost:3010/ready | ConvertTo-Json -Depth 8

docker logs --since 10m forte_whatsapp

docker logs --since 10m forte_panel

docker logs --since 10m forte_panel_worker
```

Para atualizar imagens sem remover volumes:

```powershell
docker compose --env-file .env pull forte-panel forte-panel-worker forte-whatsapp
docker compose --env-file .env up -d --force-recreate forte-panel forte-panel-worker forte-whatsapp
```

Não usar durante diagnóstico normal:

```powershell
docker compose down -v
```

Isso remove banco, Redis e sessão do WhatsApp.

---

## 15. Documentos relacionados

- `FORTE-MEDIA-HANDOFF.md` — histórico da integração Baileys e testes Docker anteriores;
- `API_CONTRACT.md` — contrato de API, webhook, mensagens e quotas;
- `PLANO-AUDITORIA-E-EXECUCAO-2026-09-27.md` — roadmap P0–P3;
- `PLANO-CADASTRO-AUDIO-E-PAGAMENTOS-2026-09-27.md` — onboarding por áudio e financeiro operacional;
- `GUIA-LEVANTAMENTO-ONBOARDING-ASSISTIDO-IA.md` — perguntas, extração e publicação de prompt;
- `CONFIGURACAO-MULTIMODEL-AGENTE.md` — estado anterior da configuração multimodelo;
- `GUIA-CONVITES-E-PERMISSOES.md` — permissões e convites;
- `CAPABILITY-MATRIX.md` — capacidade, evidência e ambiente validado;
- `PROJECT_DOCUMENTATION_INDEX.md` — índice oficial.

---

## 16. Regras para o próximo agente

1. Responder em português do Brasil.
2. Ler este arquivo antes de modificar código.
3. Não apagar volumes Docker nem resetar banco sem pedido explícito.
4. Não pedir ao usuário para colar secrets no chat.
5. Não transformar o painel do cliente em configuração técnica de provider/modelo.
6. Não criar um modelo por workspace quando a política é global.
7. Não tratar processamento interno como entrega física de WhatsApp.
8. Não misturar prompt do negócio com prompt/configuração global da plataforma.
9. Não usar `users.role=admin` como substituto de `platformAdmins`.
10. Para cada mudança, atualizar schema, migration, db helper, procedure, UI, testes, contrato e documentação.
11. Validar com `pnpm check`, `pnpm test`, `pnpm build` e `git diff --check`.
12. Para o Baileys, executar E2E real com número de teste antes de declarar concluído.

---

## 17. Evidências de logs — `pasted_content_4.txt`

### 17.1 Logs do gateway

- `16:16:05–16:16:08`: Panel aplica migrations com sucesso.
- `16:17:25`: stream error 515 e restart requerido após pareamento.
- `16:17:31–16:17:35`: pre-keys são enviados; app-state sync encontra chaves ausentes, estaciona coleções e depois recebe novas chaves.
- `16:17:33`: sessão própria confirmada com `myPN` e `myLID`.
- `16:29:55–16:37:43`: múltiplos eventos de mudança de identity key para JIDs `@lid`.

### 17.2 Logs do Panel/webhook

- `15:27:15–15:27:21`: PostgreSQL rejeita atualização em `messages` porque a relation ainda não existe.
- `16:16:14` em diante: chamadas sem cookie de sessão.
- Aviso deprecado de `res.clearCookie` com `maxAge`.
- Não há, no trecho anexado, log suficiente para provar webhook inbound recebido/aceito ou outbound entregue.

### 17.3 Logs do worker/outbound

- `16:16:06`: worker inicia; polling de 1500 ms, lote 10, três tentativas.
- Heartbeats seguem com `lastError: null` antes do restart.
- `16:28:19`: pool PostgreSQL recebe `57P01 terminating connection due to administrator command` e o processo encerra por evento `error` não tratado.
- `16:28:21` em diante: worker sobe novamente e emite heartbeats, mas sem evento de mensagem processada no trecho.

### 17.4 SQL/estado da mensagem

Ainda é necessária consulta no ambiente local com `id`, `direction`, `status`, `provider`, `externalId`, `metadata`, `lastError`, `createdAt`. O arquivo de log não contém esses registros SQL de uma mensagem real.

---

## 18. Resumo executivo para colar em outro chat

> O Forte Panel está no commit `7c0bcdb`, com console administrativo, onboarding por voz/texto, gateway Baileys nativo e Docker. A validação local encontrou que as mensagens do WhatsApp ainda não estão confiáveis de ponta a ponta: o inbound histórico funcionou e o worker processou outbound internamente, mas falta comprovar/implementar entrega física, retry, reconciliação, estados de entrega, assinatura/retry de webhook e preservação rigorosa de `workspaceId`, `instanceId` e `jid`. O próximo agente deve começar reproduzindo inbound/outbound com logs e PostgreSQL, sem apagar volumes. Também precisa refatorar a IA para configuração global no console da plataforma, com quatro capacidades — resposta no chat, transcrição, criação de prompts e visão — sem modelos predefinidos visíveis ou escolha de modelo por cliente. O prompt criado no cliente não aparece hoje porque onboarding e agente nativo usam trilhas de persistência diferentes; é preciso criar uma visão/versionamento unificado. A página `/kanban` deve ser apresentada como **Funil**, com `/funil` canônico e redirect compatível. O profissional executor precisa de função textual, agenda restrita e registro manual de recebimento com ledger/auditoria. Fazer auditoria E2E dos dois painéis, atualizar migrations/contratos/testes/documentação e só considerar beta pronto após PostgreSQL/staging real.
