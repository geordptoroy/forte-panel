# Forte Panel — acompanhamento do produto público

**Direção atual:** SaaS público multiempresa, conforme `ESTRATEGIA-PRODUTO-PUBLICO-MULTICONTA.md`.
**Fase de código atual:** etapa 1 do core — CRUD e conexão de instâncias Baileys na única página ativa. A integração está funcional; a revisão pendente é visual e o consumo permanece congelado.
**Ambiente habitual de desenvolvimento:** aplicação local em Docker dentro do WSL, operada pelo usuário via Windows Terminal/PowerShell. A implantação em Oracle Cloud Infrastructure (OCI) é futura; não assumir que o sandbox deste agente compartilha o Docker do usuário nem declarar testes locais executados fora do ambiente acessível.

## Direção registrada — 2026-09-27: core antes do restante

- [x] Auditar o código atual de IA, agentes, roteamento multimodal, credenciais, consumo e Console Administrativo. Documento de referência: `AUDITORIA-IA-CONSOLE-ADMIN-E-CORE-2026-09-27.md`.
- [x] Implementar `CORE_ONLY_MODE` e página pós-login **Instâncias WhatsApp**, com lista/criação/edição/exclusão confirmada e consumo.
- [x] Criar lifecycle Baileys multi-instância por ID estável, persistência por sessão, gateway Bearer e procedimentos tRPC tenant-scoped; rejeitar envio sem `instanceId`.
- [x] Desativar visualmente as rotas não-core por flag central sem apagar páginas/dados/backend; preservar login, recuperação e convites.
- [x] Tornar `DEMO_MODE` explicitamente opt-in e fixar `false` no Compose local; manter apenas o admin-bootstrap derivado do `.env` para não bloquear login.
- [x] Configurar publicação automática de imagens `dev` em push validado à branch de trabalho e criar um script PowerShell que zera apenas volumes do projeto, dá pull e sobe sem build local.
- [x] Workflow de publicação concluído; as imagens `forte-panel:dev` e `forte-whatsapp:dev` foram confirmadas acessíveis anonimamente no GHCR em 2026-09-27.
- [ ] Executar `scripts/dev-reinstall.ps1 -ResetData` no Docker Desktop do usuário. O sandbox atual não possui daemon Docker nem PowerShell.
- [ ] Validar migrations 0038/0039 e conexão QR com linha de teste e consumo no Docker local WSL do usuário.
- [ ] Depois da revisão do usuário, configurar no Console Admin providers/modelos, URLs, credenciais e rotas/capacidades; chaves no backend, criptografadas e mascaradas.
- [ ] Depois, validar transporte de entrada/saída dos tipos de mensagem necessários com roteamento por instância e modalidade.
- [ ] Só depois, conectar o agente de resposta WhatsApp e começar com prompt fictício, teste simulado e aprovação antes de qualquer envio automático.
- [ ] Manter separadas Ajuda da Plataforma, configurador de onboarding e copiloto do Console Admin; não tratá-los como o mesmo agente.
- [ ] Redesenhar o Console Administrativo com o sistema visual responsivo do workspace: sidebar móvel, header e páginas para providers/modelos, capacidades/rotas, agentes, suporte e auditoria.
- [ ] Corrigir antes de uso amplo do admin: precedência/herança global-local, contrato/normalização de endpoint, testes reais por modalidade, proveniência de configuração e rotação da chave de criptografia.
- [ ] Separar métricas de rate-limit (janela por minuto) de tokens, custo de provider e eventual faturamento comercial.
- [x] Desativar por padrão os endpoints REST empresariais (`FORTE_PUBLIC_API_ENABLED=false`), sem rota n8n ativa nem consumidor no frontend; manter somente health/readiness e callback interno autenticado do Baileys. O E2E manual exige opt-in explícito no servidor de staging.

## Concluído até aqui no MVP

- Shell responsivo e páginas base de Dashboard, Inbox, Kanban, Agenda, Contatos, ficha do cliente, Faturamento, Integrações e Configurações.
- Schema para contatos, conversas, mensagens e auditoria, seed demo idempotente apenas quando opt-in e Inbox/Kanban/Contatos persistentes.
- Pausar/reativar IA, enviar mensagem humana e takeover com auditoria.
- Agenda nativa com serviços, profissionais, jornada semanal por fuso, conflitos, locks para reservas concorrentes e portal do profissional.
- Contrato REST v1 opcional para contatos, memória, disponibilidade, agenda e mensagens; agora fechado por padrão, com opt-in de staging para E2E. O callback interno assinado do Baileys continua ativo.
- Gateway Baileys nativo com QR, webhook assinado, mídia multimodal, envio genérico e worker separado. O adapter Meta ainda existe como código opcional, mas não é configurado/ativado no fluxo local nem deve entrar no core atual.
- Multiusuário interno com hash de senha, memberships e papéis base; telas iniciais de Equipe/Configurações e notificações internas.
- Ledger idempotente das tools de agente e melhorias de leases do worker.
- Compose, migrations, documentação local e infraestrutura registrados nos docs existentes.
- Última validação (2026-09-26): sandbox sem banco: 50 testes passaram e 24 foram ignorados; PostgreSQL local efêmero: **74 testes passaram, 0 ignorados**, incluindo isolamento, deduplicação, quotas, retenção, alertas e readiness.

## Direção de produto aprovada

- Cada conta **master** cria e administra uma empresa/workspace.
- Cada empresa terá logins individuais de funcionários, com nome, identificador e senha inicial segura, e papéis/permissões.
- Instâncias/números WhatsApp são entidades independentes dentro do workspace, cada uma com ID e sessão Baileys próprios; não usar ID default global para envio.
- O usuário final não deverá configurar secrets nem editar Compose.
- Baileys nativo é o único caminho ativo no core atual. O adapter Meta e os tipos PAPI legados continuam apenas como código/compatibilidade e não são configurados pelo Compose oficial nem exibidos nesta primeira etapa.

## Próximos passos — ordem recomendada

### 1. Tenancy e autenticação (primeiro bloco de código)

- [x] JWT passa a assinar `sessionVersion`, usado na verificação para revogar sessões; testes de regressão adicionados.
- [x] Login OAuth comum não recebe automaticamente membership `owner`; somente o bootstrap configurado ou admin preexistente pode reivindicar a instalação vazia.
- [x] Contexto tRPC e middleware agora exigem uma única membership ativa; usuário sem tenant é negado mesmo se `users.role` for `admin`.
- [x] Login local e `workspace.current` usam o tenant resolvido; notificações e preferências usam o `workspaceId` desse contexto.
- [x] Equipe, catálogo, profissionais, vínculos e disponibilidade semanal recebem `workspaceId` explícito vindo do contexto autenticado; papéis de funcionário não promovem admin global.
- [x] Agenda, dashboard, portal do profissional, validação de serviço, mudanças de status/cancelamento/reagendamento e ferramentas de agenda do agente recebem `workspaceId` explícito.
- [x] API REST de agenda deixa de cair no workspace demo: exige `FORTE_API_WORKSPACE_ID` validado; sem vínculo responde `503`. É ainda uma chave/env de deployment para **um** workspace, não uma API multiempresa pronta.
- [x] CRM/Inbox agora recebem `workspaceId` explícito: contatos, conversas, mensagens, notas, lead-memory, seleção de canal, outbound, inbound/webhooks e ferramentas do agente não caem mais no workspace demo.
- [x] API REST de CRM/mensagens/webhooks exige o workspace configurado e preserva validação de payload/idempotência antes do fail-closed de tenancy.
- [x] Onboarding, prompt publicado, configuração/runtime do agente e gestão de instâncias/webhooks PAPI recebem `workspaceId`; o fallback global de `PAPI_INSTANCE_ID` foi removido dos fluxos tenant-aware.
- [x] Segredos de provider e API key PAPI são criptografados em repouso; segredos de webhook PAPI também são criptografados dentro de `workspaceSettings`, com leitura compatível com registros legados.
- [x] Respostas de configuração retornam somente valores mascarados; o segredo de webhook é devolvido apenas no momento de criação/provisionamento.
- [x] Cotas agora derivam do plano (`starter`, `pro`, `business`) e existe bucket atômico por `(workspaceId, userId, minuto)`; o envio manual do Inbox aplica a cota individual do operador.
- [x] Painel operacional tenant-aware adicionado em Integrações: mostra consumo atual do workspace, limites do plano, renovação da janela e operadores com maior consumo outbound.
- [x] Worker outbound agora consome `outboundMessages` do workspace antes de chamar PAPI/Meta; mensagens excedentes permanecem `queued` e são tentadas na próxima janela, sem perda.
- [x] Alertas in-app de consumo em 70% e 90% para owners/admins/managers ativos, com chave idempotente por workspace, janela, métrica e threshold; worker registra `alertasCota=N`.
- [x] Documentação consolidada em `BETA-OPERATIONS-CHECKLIST.md`, `PROJECT_DOCUMENTATION_INDEX.md` e atualização do `API_CONTRACT.md`.
- [x] Mapeamento atualizado: o workspace demo permanece apenas em bootstrap/seed, onboarding/configuração histórica, catálogo de canais legado e helpers ainda não migrados; não é mais usado nas leituras/mutações do CRM/Inbox.
- [x] Executar `workspace-domain-isolation.test.ts`, `agenda-workspace-isolation.test.ts`, `professional-isolation.test.ts`, `workspace-key-isolation.test.ts` e `workspace-usage.test.ts` contra PostgreSQL real local.
- [x] Aplicar as migrations versionadas no PostgreSQL local e confirmar as tabelas/índices tenant-aware, incluindo buckets 0016–0018.
- [x] Validar alertas de quota em PostgreSQL: 70% cria uma notificação, segunda varredura não duplica e outro workspace não recebe alerta.
- [x] Adicionar retenção de buckets: o worker remove diariamente registros antigos de workspace e usuário; padrão de 30 dias configurável por `FORTE_USAGE_RETENTION_DAYS`.
- [x] Adicionar liveness `/api/v1/health`, readiness `/api/v1/ready` com `select 1` seguro e heartbeat JSON do worker configurável por `WORKER_HEARTBEAT_MS`.
- [ ] Repetir a mesma validação no PostgreSQL do ambiente de staging/produção antes do beta.
- **Decisão de produto:** o cadastro público será por e-mail + senha para criar owner e workspace em `onboarding`; o login/bootstrap de `platform_admin` continua separado e protegido por secrets de deployment. O signup agora está implementado, mas não deve ser aberto em produção antes de recuperação, staging e revisão legal.
- [x] Implementar signup público inicial por e-mail + senha, com hash, rate limit, aceite versionado e criação transacional de owner/workspace em `onboarding`. (migration `0026_consent_records`, rota `auth.signup`, sessão automática e tela `/signup`; depende de `LOCAL_AUTH_ENABLED=true`)
- [x] Preparar recuperação de senha one-time: token aleatório armazenado só como hash, expiração de 30 minutos, revogação, uso único, incremento de `sessionVersion` e respostas públicas genéricas. (migration `0027_password_reset_tokens`; entrega por e-mail ainda pendente)
- [x] Preparar adapter provider-agnostic de e-mail e configuração segura (`EMAIL_DELIVERY_ENABLED=false`, `EMAIL_PROVIDER=none`, `EMAIL_FROM`, `PUBLIC_APP_URL` e variáveis SMTP reservadas), sem envio ou token em logs.
- [ ] Preparar `EMAIL_VERIFICATION_ENABLED=false`, tokens e provider de confirmação sem ativar envio; ativar somente após configurar secret, domínio/remetente e testes de entrega.
- [ ] Planejar Google OAuth e outros provedores atrás de feature flag desligada; não bloquear o signup inicial por essa integração.
- [x] Implementar convite de funcionário por workspace: token hash, uso único, expiração, revogação, aceite pelo e-mail convidado e criação da própria senha via backend + telas administrativa/pública. (migration 0024; envio automático de e-mail ainda pendente)
- [ ] Aplicar matriz server-side de capacidades e escopos: owner/admin/manager/agent/professional; esconder faturamento, secrets, prompt administrativo e exportações de quem não precisa.
- [ ] Definir Inbox compartilhada versus assignment por equipe; atendente vê o histórico necessário para atender, mas não ganha faturamento, secrets ou conversas fora do escopo automaticamente.
- [ ] Adicionar testes negativos de papel/escopo e auditoria para convite, aceite, reenvio, revogação, mudança de papel e desativação.
- Próxima fatia de código: preparar recuperação de senha e fluxo de onboarding do owner; manter staging como gate antes de abrir o cadastro.
- [x] Estrutura inicial do console interno `platform_admin` criada para listar workspaces, consultar saúde/uso, prestar suporte escopado e registrar auditoria; falta validar em PostgreSQL/staging.
- [x] API keys, configuração de IA, prompt e reset removidos do painel operacional comum; backend e rotas exigem `platformAdmins`, e o reset está no detalhe do workspace com sessão operadora e auditoria.
- [x] **P0 antes dos convites beta:** implementar configuração versionada do agente por workspace: rascunho, simulação sem envio externo, publicação, histórico e rollback.
- [x] Permitir rollback de qualquer versão arquivada, publicando uma nova versão e preservando o histórico.
- [x] Atualizar a aba do agente após salvar, simular, publicar ou fazer rollback, sem exigir recarregamento manual.
- [x] Suíte PostgreSQL criada para validar pausar/reativar IA, suspender/reativar workspace e nota de suporte com motivo/auditoria, sem revelar segredo bruto; falta repetir no staging real.
- [x] Cobertura local prova que owner/member e `users.role = admin` sem registro em `platformAdmins` não acessam o console.
- [x] Suíte PostgreSQL criada para provar sessão de suporte read-only, operador, expiração, revogação e rejeição de outro workspace; executar no staging quando `DATABASE_URL` estiver disponível.
- [x] Botão de logout adicionado ao painel operacional e ligado à procedure autenticada de logout.
- [x] Reset destrutivo removido da tela comum de preferências; o controle permanece somente no console `/platform-admin`.
- [x] Interface de Integrações recebe card de conexão Baileys com status, QR Code, reconexão e desconexão/logout.
- Criar/explicitar relação tenant ↔ owner/master e preparar backfill do workspace demo sem perder dados.
- Remover dependência de workspace global/demo e bootstrap de admin global para o caminho público.
- Manter `LOCAL_ADMIN_EMAIL`/`LOCAL_ADMIN_PASSWORD` apenas como bootstrap operacional da plataforma; em produção usar secret manager e rotação, sem senha global compartilhada entre clientes.
- Garantir sessão ativa e versão/revogação efetiva após troca de senha/desativação.
- Testar com PostgreSQL real: duas empresas não podem ler, mutar, consultar storage ou disparar mensagens uma da outra.

### 2. Logins master e funcionários

- Cadastro/login master; verificação de e-mail antes de abrir ao público.
- Owner cria funcionário por nome, username/identificador, senha inicial temporária e papel.
- Hash scrypt ou melhor KDF aprovado; reset e desativação revogam sessões; auditoria das ações.
- Limites de login, cookies seguros, mensagens anti-enumeração e política de sessão.

### 3. Onboarding guiado e experiência de autoatendimento

- Criar empresa e defaults; checklist com segmento, fuso, serviços, profissionais, horários e equipe.
- Estados de erro/vazio/loading com explicações simples e configuração de canal sem termos técnicos.
- Perfil do agente estruturado, simulável, revisado e publicado pelo owner.

### 4. Uma conexão WhatsApp por empresa (Baileys atual)

- [x] Gateway Baileys próprio, autenticação interna, webhook assinado, QR/pareamento e health básicos.
- [x] Inbound/outbound de texto, mídia multimodal, JID, idempotência e takeover humano em nível de código.
- [x] Contrato HTTP do gateway validado sem pareamento: health/readiness, autenticação e envio de texto, imagem, áudio, vídeo e documento.
- [ ] Validar imagem, áudio, vídeo, documento e tipos interativos em Docker/staging com número de teste.
- [x] Workflow manual E2E criado para o fluxo operacional de staging, com URL e credenciais injetadas por variável/secret do GitHub; não executado automaticamente porque cria dados.
- [x] Comando único `scripts/start-docker.sh` criado: faz pull das imagens e sobe/recria Panel, worker e gateway sem apagar volumes.
- [x] Script Docker ampliado para atualizar toda a stack: PostgreSQL, Redis, Panel, worker e gateway, preservando volumes.
- [x] Contrato REST aceita `list`, `poll`, `location`, `contact`, `react`, `sticker`, `album` e `event` com `metadata.payload`; Meta rejeita tipos não-texto explicitamente.
- [x] E2E protegido por confirmação explícita de staging descartável, concorrência única e timeout de 10 minutos.
- [x] Lock atômico por diretório impede duas conexões Baileys concorrentes e recupera lock obsoleto com teste automatizado.
- [x] Diretório de sessão e arquivos persistidos são normalizados para permissões privadas `0700/0600`, com teste automatizado.
- [x] Auth state local opcional com AES-256-GCM, migração de JSON legado e restore testado.
- [x] Storage privado opcional para mídia inbound, com limite, referência por workspace e URL assinada para o agente; ativar e validar em staging.
- [ ] Store de sessão durável/externo e lifecycle de instância por tenant.
- [x] Backup/verify/restore local do PostgreSQL e sessão Baileys com hash, permissões privadas e confirmação destrutiva.
- [ ] Agendar backup externo e executar restauração real em ambiente limpo.
- Preservar adapter para troca reversível de provider e manter opção oficial da Meta documentada.

### 5. Operação, beta e lançamento

- [x] CI com PostgreSQL 16, migrations limpas e suites de isolamento; o workflow falha se uma suite crítica for ignorada.
- [x] Cobertura PostgreSQL do heartbeat confirma estados healthy, degraded e stale no console e preserva um único registro por serviço.
- [x] Smoke check manual de staging criado para validar `/api/v1/health` e `/api/v1/ready` sem expor credenciais.
- CI com suites E2E, logs/alertas e correlation IDs.
- Backups off-host e restauração testada; exportação/encerramento de empresa; limites antiabuso.
- Revisar privacidade, termos, retenção e suporte antes de cadastro público aberto.
- Decidir planos/cobrança depois de validar uso/custo e jornada do produto.

### Futuro condicionado — PAPI legada / alternativas de canal

- Primeiro obter ou confirmar com o mantenedor o repositório fonte, licença e permissão de fork/redistribuição da PAPI Free.
- Comparar código e segurança de `1.5.1` com `1.5.2`, atualmente usada pelo Forte Panel.
- Se a fonte e a licença permitirem, preferir avaliar um fork rastreável da PAPI. Se não, comparar continuar com provider externo vs serviço REST próprio sobre Baileys.
- Prototipar isoladamente; auth store durável e criptografado, nunca `useMultiFileAuthState` em produção; credenciais Signal e QR tratados como segredos.
- Testar reconexão, crash, restore, duplicidade, idempotência e tenancy; lançamento opt-in e reversível somente após revisão de segurança/termos.

## Pendências e riscos conhecidos

- Tenancy por membership ainda precisa ser provada de forma abrangente; alguns caminhos históricos ainda dependem do workspace demo/global.
- A suíte real de concorrência/isolamento PostgreSQL precisa entrar em CI; testes com dependência externa podem estar ignorados.
- Não existe autorização comprovada para fork ou redistribuição da imagem PAPI no Docker Hub.
- Baileys/PAPI baseada em WhatsApp Web é provider não oficial; pode haver desconexões, bloqueio de número, mudanças de protocolo e limitações de uso; tratar transparência e opção Meta oficial.
- `docker compose up --build` não foi validado no sandbox original por falta de Docker; validar numa máquina com Docker antes do deployment.
- Revisar secrets de Compose/histórico antes de qualquer deploy; não usar defaults de demonstração.

## Validação por bloco

Executar e registrar resultado no handoff:

```bash
pnpm check
pnpm test
pnpm build
git diff --check
```

Para migrations, tenancy ou webhooks, acrescentar testes de integração com PostgreSQL real e validar journals. Não rodar smoke PAPI Cloud sem autorização previamente registrada; não solicitar token no chat.


## Auditoria 2026-09-27 — backlog priorizado para execução

### P0 — corrigir antes de novos convites

- [ ] Corrigir o botão do console que volta para `/dashboard`; usar retorno contextual ao console/workspace suportado, sem quebrar platform-only.
- [ ] Permitir iniciar sessão administrativa e reativar workspace suspenso mesmo após logout/expiração.
- [ ] Unificar guards de plataforma e tornar `sessionId`/aba do console canônicos na URL.
- [ ] Registrar a rota `/kanban` ou remover os links quebrados da sidebar/cards.
- [ ] Remover `ensureDemoWorkspace()` de quotes/billing e adicionar isolamento negativo entre dois workspaces.

### P1 — operação, dados e experiência

- [ ] Reestruturar a conexão WhatsApp: renomear para Conexão WhatsApp, priorizar QR no mobile, indicar expiração/stale/retry e validar Docker com número de teste.
- [ ] Definir KPIs Dashboard/Atendimento/Funil por entidade: mensagens, contatos, unread e stages.
- [ ] Criar projeção de atividade para inbound/outbound/falha, unificar unread, marcar leitura, validar stages e atualizar telas sem reload.
- [ ] Corrigir CTAs mobile, scroll do Inbox, destaque de rota/query, acessibilidade de abas/drawers/modais e `:focus-visible`.
- [ ] Aplicar code splitting, debounce/paginação no console, carregamento por aba e upload sem data URL duplicada.

### P2 — suporte e produto

- [ ] Criar tickets administrativos e Kanban de suporte separado do funil de leads.
- [ ] Estruturar catálogo de serviços com preço `fixed`, `starting_at` e `quote`.
- [ ] Criar página de assinatura/consumo com planos em modo sandbox/teste; sem cobrança real e com auditoria de troca de plano.
- [ ] Separar rate limit técnico de ledger de uso comercial mensal.

### P3 — lançamento público e LGPD

- [ ] Criar landing, pricing, termos, privacidade e cookies.
- [ ] Criar signup com verificação de e-mail, convite, recuperação e consentimento versionado.
- [ ] Implementar exportação, anonimização/exclusão, retenção e solicitações de titulares LGPD.
- [ ] Validar staging persistente, backup/restore, alertas externos, antiabuso e E2E antes de abrir cadastro público.

Plano detalhado: `PLANO-AUDITORIA-E-EXECUCAO-2026-09-27.md`.


## Execução P0 — 2026-09-27

- [x] Console admin não retorna mais para `/dashboard`; retorno permanece dentro do console da plataforma.
- [x] Sessão administrativa pode ser iniciada em workspace suspenso para permitir reativação.
- [x] `sessionId` é atualizado na URL ao escalar e limpo ao iniciar nova sessão após erro/expiração.
- [x] Rota `/kanban` registrada no `App.tsx`.
- [x] Billing/quotes usa `ctx.workspace.workspaceId`, exige `requireManager` e não usa mais `ensureDemoWorkspace()` nesses caminhos.
- [x] `pnpm check`, `pnpm build`, suíte local e `git diff --check` executados.
- [x] Preparar fluxo local reproduzível com `docker-compose.local.yml`, `.env.docker.example`, inicialização, logs e reset destrutivo explicitamente confirmado.
- [ ] Rodar a prova equivalente em PostgreSQL/staging com dois workspaces; 31 testes dependentes de banco continuam skipped no sandbox sem `DATABASE_URL`.
- [ ] Fazer smoke browser do console: platform-only, workspace suspenso, refresh/back/forward e reativação.
- [ ] Iniciar P1.1: QR/Conexão WhatsApp em primeira dobra e validação real em Docker.


## Execução P1.1 — 2026-09-27

- [x] Aba comum reorganizada para Conexão WhatsApp, sem seleção de múltiplos provedores na experiência do usuário.
- [x] Regra antiga de uma instância por workspace explicitada na interface — **superada em 2026-09-27** pelo CRUD multi-instância solicitado; não reintroduzir singleton.
- [x] QR com timestamp, expiração em 60 segundos, estado stale, retry e foco/rolagem mobile.
- [x] Gateway com `reconnect()` para renovar QR sem ignorar o clique quando já há uma sessão.
- [x] Desconexão manual não dispara reconexão automática indevida.
- [x] Proxy repassa `updatedAt`, aceita `phone`/`phoneNumber` e trata 404 transitório do QR.
- [x] TypeScript do painel e gateway aprovados; builds do painel/gateway aprovados; 147 testes do monorepo aprovados e 32 do gateway (41 testes dependentes de banco skipped localmente).
- [x] Pareamento por número revisado: código nativo Baileys, readiness antes do pedido, limpeza de sessão incompleta e seletor país/bandeira/DDI com validação internacional.
- [ ] Validar com Docker e número real: conectar, ler QR, atualizar QR expirado, reiniciar serviço, desconectar e logout.
- [x] Confirmar no issue Baileys #2560 que um `companion_platform_display` customizado pode produzir código rejeitado pelo WhatsApp sem erro visível no fluxo rc14.
- [x] Preservar credenciais emitidas por `pair-success` mesmo antes de `registered=true`; serializar `creds.update` antes do restart e não enviar `logout()` remoto para tentativa ainda não aceita.
- [x] Aumentar a janela de readiness e mascarar material criptográfico de handshake nos logs do gateway.
- [x] Corrigir a identidade para `Chrome (Ubuntu)` e backportar a confirmação IQ ao `baileys@7.0.0-rc14` com patch npm versionado; `npm ci` aplicou o patch e o teste de regressão confirma que o código não retorna antes do IQ.
- [ ] Validar o seletor de país/bandeira/DDI e o código de 8 caracteres (incluindo letras, se presentes) em número real; repetir geração após tentativa não aceita e confirmar que não volta `Connection Closed`.
- [ ] Validar webhook inbound e status no Inbox depois da conexão real.

## Pós-pareamento: atualização de status e refatoração da tela — 2026-09-28

- [x] Ler o log fornecido: o WhatsApp aceitou o pareamento, pediu o restart `515` esperado e o gateway registrou `opened connection to WA` / `Baileys session is open`.
- [x] Representar esse restart como `connecting` no snapshot Baileys; teste cobre o estado após o close e o caso real de logout.
- [x] Corrigir polling React Query: 2 s para connecting/pairing/QR, ativo em segundo plano, além de revalidar ao foco e à reconexão de rede.
- [x] Extrair a tela WhatsApp para `client/src/pages/WhatsappConnectionPage.tsx`, mantendo CRUD e métodos de conexão, sem o cartão de consumo; adicionar status por instância, resumo, atualização manual e layout responsivo.
- [x] Mover plano/cotas/janela para a rota **Planos e consumo** (`/plans-usage`) e disponibilizá-la como a única outra rota do Core congelado.
- [x] Suíte local: 158 testes aprovados, 41 dependentes de banco skipped; typecheck, build frontend e build backend passaram.
- [x] CI `verify`, `postgres-integration` e `publish` aprovados; pull anônimo confirmado para as tags `:dev` do painel e do gateway.
- [ ] Atualizar localmente com `pull`/`up` sem reset para preservar o número já conectado; verificar Conectado no painel, inclusive após deixar a aba em segundo plano, e confirmar a página Planos e consumo.


## Auditoria de melhoria contínua — 2026-09-27

Varredura nova do repositório encontrou 26 pontos além do que já estava no plano P0–P3. O detalhamento, a evidência de cada um e a ordem de execução estão em `PLANO-CADASTRO-AUDIO-E-PAGAMENTOS-2026-09-27.md`.

### P0 de produto — antes de convites

- [ ] Mover onboarding e configuração da IA de `requirePlatformAdministrator` para owner/gerente, deixando o console da plataforma apenas como suporte. (onboarding textual `profile/save` agora aceita owner/admin; configuração de IA, prompt e reset continuam exclusivos da plataforma)
- [x] Criar signup público inicial por e-mail/senha, convite de funcionário e recuperação de senha (`workspaceInvites`, `passwordResetTokens`); confirmação de e-mail e Google OAuth continuam planejados, feature-flagged e desligados até configurar provedores.
- [x] Aplicar limite de tentativas e atraso progressivo no login local. (primeiro slice B1: limiter em memória por IP e conta, com testes; auditoria persistida de falhas continua pendente)
- [x] Adicionar checagem de origem/CSRF nas mutações tRPC (o cookie usa `sameSite: "none"` em HTTPS). (primeiro slice B1: same-origin em mutações HTTP)
- [ ] Tornar a deduplicação de mensagens por tenant: `messages.externalId` é único globalmente hoje.
- [ ] Tornar `contacts.workspaceId` não anulável com backfill, seguindo o padrão da migration `0017`.

### P1 — operação, dados e coerência

- [ ] Recalcular/derivar valores financeiros: `contacts.quoteCents` desatualiza e `receivedMonthCents` está fixo em `0`.
- [ ] Limpar `unreadCount` ao abrir a conversa e unificar a fonte de verdade entre contatos e conversas.
- [ ] Paginar `listInboxContacts` e as listas do console/funil.
- [ ] Validar estágios do funil no backend com lista canônica única.
- [ ] Distinguir workspace suspenso de membership ausente na mensagem de erro.
- [ ] Remover fallback de workspace demo em `resetWorkspaceDevelopmentData`.
- [x] Não aposentar `whatsappChannels` nesta etapa: o registro Baileys usa a linha como vínculo/canal; reavaliar somente quando todos os consumers tiverem migração comprovada.
- [ ] Inverter `DEMO_MODE` para fail-closed.
- [ ] Remover branding fixo de cliente único (título, Dashboard, sidebar e seeds).
- [ ] Alinhar o rótulo da sidebar "Canais conectados" com a tela "Conexão WhatsApp".
- [ ] Remover a segunda `BillingPage` com dados fictícios e o código de demonstração ainda importado.
- [ ] Criar índices de leitura: `quotes(workspaceId, createdAt)` e `messages(conversationId, createdAt)`.
- [x] Impedir `auditLogs` falsos: só registrar evento após confirmar que a mutação alterou uma linha do próprio workspace. (toggle IA e mudança de stage protegidos; cobertura de banco real continua dependente de staging)
- [ ] Adicionar FKs/constraints para conversations/messages/notes/quotes e decidir barreira redundante de `workspaceId` nas entidades derivadas.
- [x] Normalizar telefones/JIDs antes do upsert e testar formatos equivalentes. (chave canônica compartilhada; LID/grupo preservados; adapters usam JID normalizado para roteamento)
- [x] Criar auditoria somente leitura de duplicidades (`pnpm exec tsx scripts/audit-contact-duplicates.ts --workspace=<id> --json`); nenhuma consolidação automática.
- [ ] Revisar grupos em staging, escolher contato canônico, migrar referências/transações e só depois aplicar deduplicação controlada.
- [x] Responder pela instância/canal de origem da conversa, não por `defaultPapiWebhook`. (mensagens legadas sem origem ainda usam o default explicitamente marcado)
- [ ] Formalizar se a operação é caixa compartilhada; caso não seja, implementar assignment/equipe/ACL por contato e mídia.
- [x] Definir semanticamente `awaiting_response` separado de unread: a última atividade outbound aceita aguarda o lead; a última inbound precisa de operador; outbound `failed` não conta. (contrato puro e testes adicionados)
- [x] Integrar `awaiting_response` às consultas da Inbox/Dashboard; o KPI agora usa a última mensagem outbound `sent`, e `unread` continua separado. (leitura transacional por usuário permanece pendente)
- [x] Implementar leitura transacional por operador e atualizar `unreadCount` sem misturar com `awaitingResponse`. (migration `0025_conversation_reads`, cursor por conversa/usuário, mutation `inbox.markRead` e teste PostgreSQL; assignment/ACL continua pendente)
- [ ] Exibir status `queued/processing/sent/failed`, erro e retry na Inbox; invalidar após webhook/worker.
- [ ] Corrigir KPIs `daysNoReply`/`receivedMonthCents`, usar consultas server-side e timezone do workspace.
- [ ] Persistir histórico de stages (from/to, ator, motivo, timestamp, SLA, open/won/lost) e tratar Sem retorno/Perdido como estados terminais.
- [ ] Separar ciclo de vida lead/cliente, origem, responsável, opt-out, conversão e serviço vinculado.

### P2 — engenharia e higiene

- [ ] Adicionar lint e rodar `check`/`build` em pull request.
- [ ] Migrar `pnpm.patchedDependencies`/`pnpm.overrides` para o local suportado pelo pnpm 10 e aprovar builds nativos.
- [ ] Remover artefatos de template do repositório (`template.json`, `ComponentShowcase.tsx`, `debug-collector.js`) e os scripts `.py` de patch pontual.
- [ ] Consolidar a árvore de migrations legada (MySQL) e manter apenas `drizzle-pg`.
- [ ] Criar README e LICENSE; reduzir sobreposição entre handoff, roadmap e auditorias.
- [ ] Adicionar correlation ID e logging estruturado.
- [ ] Implementar governança LGPD (consentimento, exportação, exclusão, retenção). (consentimento versionado e retenção configurável do onboarding já entregues; exportação, exclusão e worker de limpeza ainda pendentes)
- [ ] Remover bloco duplicado de `BAILEYS_*` em `.env.local.example`.

## Funil de cadastro com respostas em áudio — planejado
- [x] Modelar `onboardingSessions`, `onboardingStepAnswers`, `onboardingAudioAssets`, `onboardingChecklistItems`, `consentRecords`. (`onboardingSessions`, `onboardingStepAnswers`, `consentRecords`, `onboardingAudioAssets` e `onboardingTranscriptions` persistidos; checklist independente ainda pendente)
- [ ] Definir os 10 blocos do funil (identidade, oferta, execução, agenda, atendimento/IA, política comercial, recebimento, canal, revisão/publicação) com pergunta falada, campos e destino.
- [x] Criar procedure `voice.upload` com base64 limitado, MIME/duração/tamanho validados, storage privado e ownership por workspace/sessão. (migration `0034_onboarding_audio_assets`)
- [x] Ligar `voice.transcribe` tenant-aware ao serviço de transcrição já existente. A procedure recebe somente `assetId`, gera URL assinada internamente, exige consentimento vigente, usa claim idempotente e persiste resultado/erro.
- [x] Estruturar transcrição em JSON validado por schema, com confiança por campo e pergunta de acompanhamento. (schema estrito por bloco, `missing/conflicts/confidence`, proposta em `draft` e follow-up manual com revisão imutável)
- [ ] Pré-preencher catálogo, agenda, equipe e perfil da IA em rascunho, sem efeito colateral.
- [ ] Manter formulário como caminho garantido quando o áudio falhar; áudio nunca é a única via.
- [x] Implementar consentimento de voz e retenção do áudio bruto. (guard, upload com consentimento, `expiresAt`, rotina diária tenant-aware, `dryRun`, limite por lote e auditoria entregues; o storage configurado não expõe delete físico, então a remoção revoga a referência privada)
- [ ] Usar `workspaces.status = onboarding` de verdade e só promover para `active` com checklist obrigatório fechado.
- [ ] Separar onboarding do negócio (empresário) de `leadIntake` conversacional (lead do WhatsApp); não reutilizar `OnboardingPage` como questionário do lead.
- [ ] Modelar `leadIntakeSessions`, `leadIntakeQuestions`, `leadIntakeAnswers`, `leadConsents`, `mediaAssets`, `transcriptions` e `conversationHandoffs`.
- [ ] Definir consentimento `consent_pending/accepted/denied/withdrawn/expired`; sem `accepted`, não iniciar STT/LLM.
- [ ] Validar áudio real do Baileys (bytes/URL, MIME, tamanho/duração); placeholder de mídia ou payload vazio deve cair em texto/humano, nunca em texto inventado.
- [ ] Tornar mídia privada por padrão: sem data URL em `metadata` produtivo, com ownership por workspace+message, hash, retenção, signed URL curta e auditoria de acesso.
- [ ] Persistir `channelId/instanceId` com ownership relacional e validar correspondência entre instância, segredo do webhook e workspace.
- [ ] Substituir handoff booleano por estado com `handoffId`, responsável, motivo e `controlVersion`/fencing token; cancelar outbound de IA quando humano assumir.
- [ ] Tornar contato/mensagem/consentimento/evento de transcrição atômicos ou usar outbox; testar retries concorrentes do mesmo áudio.

## Orçamentos, meios de pagamento e conciliação — planejado

- [ ] Evoluir `quotes` com numeração, validade, escopo, subtotal, desconto e total coerentes.
- [ ] Criar `quoteItems` (itens do catálogo ou linha livre com quantidade).
- [ ] Criar `quoteInstallments` com sinal, parcelas, vencimentos e periodicidade.
- [ ] Criar `quotePayments` como ledger imutável de recebimentos, com meio de pagamento, taxa e referência externa.
- [ ] Criar `paymentReceipts` com numeração sequencial por workspace.
- [ ] Criar `workspacePaymentSettings` com meios aceitos, chave Pix criptografada, titular, sinal padrão, parcelas e juros.
- [ ] Oferecer as escolhas que faltam: modelo de pagamento, sinal, parcelamento com/sem entrada, vencimentos e desconto com limite de aprovação.
- [ ] Migrar os sete status atuais para o status financeiro granular, com mapa explícito e histórico preservado.
- [ ] Gerar Pix copia e cola, extrato por período, CSV e recibo simples (sem PSP nesta fase).
- [ ] Enviar a chave Pix do workspace pela conversa do WhatsApp, sem confirmar automaticamente a liquidação.
- [ ] Registrar manualmente pagamentos informados pelo empresário/funcionários (Pix, maquininha, dinheiro, transferência ou outro), com valor, data, meio, responsável e observação.
- [ ] Deixar explícito: sem gateway, checkout, boleto, link de pagamento, integração com maquininha, armazenamento de cartão ou retenção de valores; documento fiscal fora do escopo.
- [ ] Manter cobrança do próprio SaaS separada (`saasProducts`, `workspaceSubscriptions`, `invoices`, `usageLedger`).


## Onboarding assistido por IA — ordem de execução refinada

Referência: `GUIA-LEVANTAMENTO-ONBOARDING-ASSISTIDO-IA.md`.

### P0 — fundação segura

- [ ] Separar núcleo obrigatório curto de perguntas condicionais e aprofundamento; permitir áudio, texto, “não se aplica”, “decidir depois” e retomada.
- [x] Definir schemas por bloco, estados `draft/confirmed/published` e campos `missing/conflict/source/confidence`. (blocos, draft/confirmed, `missing/conflicts/source/confidence`, política de fontes/confiança, retenção, resolução auditável e histórico publicado separado persistidos)
- [ ] Mostrar após cada resposta/bloco apenas a regra curta daquela área; manter o prompt completo recolhido e opcional.
- [x] Definir confirmação humana obrigatória antes de publicar prompt ou regra operacional. (quatro blocos obrigatórios exigem `onboarding.confirmStep` e o backend repete o gate)
- [x] Persistir histórico imutável de revisões por bloco e permitir confirmação explícita opcional do bloco `voice`; publicação continua exigindo somente os blocos essenciais.
- [ ] Definir guardrails: IA não inventa preço, prazo, disponibilidade, serviço, política ou promessa; fallback para humano quando faltar fonte.
- [ ] Definir acesso administrativo de suporte com workspace autorizado, motivo, masking, auditoria e sem publicação silenciosa.

### P1 — onboarding textual e progressivo

- [ ] Implementar sessão retomável com núcleo de 10 blocos e perguntas condicionais por segmento.
- [ ] Extrair respostas textuais para JSON validado e gerar rascunho de prompt com resumo, conflitos e exemplos.
- [x] Criar histórico de versões publicadas do onboarding, revisão pelo prestador, gate server-side, publicação incremental e rollback que cria nova versão. (migration `0036_onboarding_published_versions`)
- [ ] Criar simulações mínimas: primeira mensagem, triagem, preço, agendamento, fora do horário e handoff.

### P2 — áudio assistido
- [x] Conectar captura/upload privado à transcrição tenant-aware, preservando original, fonte, trecho e confiança. (OnboardingPage agora oferece MediaRecorder, preview, upload, transcrição e retry; a transcrição permanece revisável e o formulário continua como fallback)
- [x] Permitir correção por texto ou áudio curto e proposta estruturada com pergunta explícita de revisão para ambiguidade. (textarea editável, regravação de até 30s, consentimento `llm`, schema JSON estrito, `missing/conflicts/confidence`, persistência como `draft`, follow-up por campo/conflito, revisão imutável e publicação versionada com rollback)
- [x] Tornar processamento idempotente, com status, retry e fallback textual/humano. (claim por asset, estados `uploaded/processing/completed/failed` e retry da UI)
- [x] Medir custo, duração, taxa de correção e abandono antes de ampliar áudio para toda a base. (migration `0035_onboarding_telemetry`, eventos tenant-aware sem conteúdo, tokens como proxy de custo, duração de sessão/áudio, correções, follow-ups, conclusão e abandono estimado por 7 dias; preço real por modelo ainda depende de catálogo configurado)

### P3 — suporte avançado

- [ ] Criar console de suporte para comparar respostas, transcrições, fatos extraídos e versões do prompt.
- [ ] Adicionar `promptReviewComments`, `promptPublications`, `promptSimulations` e `supportAccessLogs`.
- [ ] Registrar visualizar, baixar, corrigir, exportar, publicar e rollback; aplicar retenção, exportação e exclusão LGPD.


## UX de clareza e facilidade — ordem de impacto

Referência: `GUIA-UX-CLAREZA-E-FACILIDADE.md`.

### P0 — primeiro acesso

- [ ] Criar checklist de primeiro acesso com um próximo passo único, progresso, autosave, “fazer depois” e retomada. (checklist/progresso/próximo passo, autosave debounce, sessão persistente active/paused/completed e cartão de retomada no dashboard já entregues; respostas por bloco e lembrete mais rico continuam pendentes)
- [ ] Separar visualmente configurar negócio, atender clientes, acompanhar resultados e administrar equipe.
- [ ] Revisar termos técnicos das telas para linguagem de negócio; deixar provider, webhook, prompt e secrets somente em detalhes/suporte.
- [ ] Reescrever estados vazios e erros com explicação, exemplo e ação de resolução.
- [ ] Mostrar impacto antes de publicar regra, revogar convite, desativar membro, cancelar orçamento ou registrar recebimento.

### P1 — onboarding e perfis

- [ ] Implementar ajuda contextual “O que é isso?” para campos de serviço, horário, agenda, orçamento, recebimento e regras do bot.
- [ ] Fazer a navegação inicial variar por papel: owner/admin no checklist da empresa, atendente na Inbox, professional em Minha agenda.
- [ ] Implementar preview curto por bloco e simulação antes de publicar prompt; leitura completa fica opcional.
- [ ] Medir abandono por etapa, tempo até primeira simulação, correções por bloco, erros de convite e tempo até primeira resposta.

### P2 — clareza financeira e confiança na IA

- [ ] Renomear o fluxo para “registrar recebimento manual” e explicar que não é gateway nem confirmação bancária.
- [ ] Separar visualmente original, transcrição, fatos extraídos, regra redigida, regra confirmada e prompt publicado.
- [ ] Exibir conflitos e campos faltantes em linguagem simples, com correção guiada e fallback humano.


### Interface WhatsApp — 28/09/2026

- [x] Preservar contratos e conexão Baileys/Forte Panel já funcionais.
- [x] Ocultar temporariamente Planos e consumo do Core/sidebar.
- [x] Reorganizar criação de instância em modal: nome, escolha QR/número e DDI com bandeira.
- [x] Manter renomeação, exclusão confirmada, QR e pareamento por número sem alterar o backend.
- [ ] Fazer smoke test visual no Docker do usuário.


### Inbox operacional — 28/09/2026

- [x] Liberar Inbox na sidebar e no modo Core, mantendo demais rotas congeladas.
- [x] Remover o cabeçalho redundante da página sem alterar o desenho principal.
- [x] Validar texto, mídia, contato, JID, instanceId e roteamento de envio.
- [x] Ampliar recebimento Baileys para sticker, localização, contato, enquete, lista, botão e reação.
- [x] Typecheck, build e 23 testes específicos aprovados.
- [ ] Fazer smoke test visual e teste com mensagens reais no Docker do usuário.


## Inbox/Baileys — atualização 2026-09-28

- [x] Rastrear e corrigir a normalização de texto Baileys dentro do gateway; wrappers não podem transformar `oi` em fallback genérico de mídia.
- [x] Encaminhar `fromMe`, distinguir takeover manual de eco iniciado no Panel, pausar IA/assumir conversa e impedir emissão de evento recebido para o agente.
- [x] Implementar filtro explícito Todas/uma/várias na Inbox, com validação de IDs e escopo de workspace no backend/SQL; preservar linha legada sem origem somente em Todas e excluir origem Baileys conhecida de outro tenant.
- [x] Adicionar upload de áudio `audio/*` separado (até 8 MB); decisão desta fatia: upload, sem gravação pelo microfone.
- [x] Adicionar fixtures de normalização, `fromMe`, filtro de instâncias e isolamento; validar contra PostgreSQL local temporário com migrations aplicadas ao sandbox descartável.
- [x] Executar `pnpm check`, `pnpm exec tsc --noEmit -p forte-whatsapp/tsconfig.json`, `pnpm test` (59 arquivos / 231 aprovados / zero ignorados), `npm test --prefix forte-whatsapp` (9 arquivos / 55 aprovados) e `pnpm build`.
- [x] Repetir `git diff --check` após a revisão final.
- [x] Publicar a fatia validada em `main` (`e9d800d`) e acompanhar [Publish Forte Panel image](https://github.com/geordptoroy/forte-panel/actions/runs/36454030781) e [PostgreSQL integration](https://github.com/geordptoroy/forte-panel/actions/runs/36454030684): ambos passaram.
- [ ] Validar rendering responsivo e envio/recebimento real de texto, imagem e áudio com número WhatsApp dedicado; confirmar o PostgreSQL persistente de staging. O banco efêmero usado acima pertence somente ao sandbox.


## Auditoria WhatsApp/IA — estado em 2026-09-28

- [x] Auditar a origem provável do chat LID e as rotas de seed, `fromMe`, normalização e persistência sem alterar o banco do usuário.
- [x] Verificar documentação oficial e versão instalada do Baileys para `messaging-history.set`, `messages.upsert`, `fetchMessageHistory`, LID e limites do sync.
- [x] Inventariar runtime/provedores de IA, prompts, tools, transcrição, REST/tRPC, ACL do Console, suporte, mídia, quotas e isolamento; registrar achados no `docs/AUDITORIA-WHATSAPP-IA-2026-09-28.md`.
- [x] Atualizar handoff e índice documental para que uma nova sessão comece pelo estado atual e não confunda auditoria com implementação.
- [ ] Consultar com segurança o PostgreSQL persistente do usuário para confirmar a origem da conversa, correlacionando IDs/eventos e preservando evidência; não executar limpeza de dados nesta etapa.
- [x] Implementar primeira proteção contra eventos históricos/vazios e validar ownership de instância antes da ingestão; `fromMe` live órfão continua pendente de política.
- [x] Implementar importação inicial Baileys após conexão, com dedupe por `externalId`, provenance `historySync` e nenhuma resposta IA/unread/takeover para conteúdo histórico; progresso persistido e busca incremental continuam pendentes.
- [ ] Corrigir ACL legacy de IA, SSRF/egress, limites de mídia e autorização server-side das tools.
- [ ] Consolidar cards de IA, hierarquia imutável de políticas, orquestrador de capabilities, transcrição comum, métricas/quotas, suporte isolado e TTS explicitamente desativado.
- [ ] Validar com PostgreSQL de dois workspaces, CI, staging e número dedicado antes de habilitar respostas automáticas em produção.


## Proteção inicial da ingestão Baileys — 2026-09-28

- [x] Carregar `type` e `requestId`; encaminhar somente `notify` sem backfill para o fluxo ao vivo e observar sync-history sem guardar conteúdo.
- [x] Marcar texto-placeholder; ignorar payload Baileys desconhecido/vazio e lote histórico antes da criação de contato/conversa.
- [x] Exigir instância Baileys ativa e do workspace antes de persistir mídia ou mensagem.
- [x] Adicionar regressões unitárias/adaptador e testes PostgreSQL para append, placeholder e instância de outro workspace.
- [x] Passar localmente `pnpm check`, `pnpm test` (197 aprovados/46 ignorados), `pnpm build`, typecheck do gateway e `git diff --check`.
- [x] Workflow `PostgreSQL integration` executou migrations, typecheck e suíte completa contra PostgreSQL com sucesso; os testes locais foram ignorados por ausência de `DATABASE_URL` e Docker.
- [x] Parear em gateway isolado sem webhook/DB/IA/outbound: sync FULL reportou progresso 100%, 38 chats, 39 contatos e 4.452 mensagens; outbox zero, sem corpo encaminhado/logado/persistido; sessão despareada e runtime removido.
- [x] Redigir o objeto interno `histNotification` do Pino após observação de referências/chaves criptografadas de mídia; suíte do gateway 62/62, typecheck e `git diff --check` passaram. Commit `1b8d9a1` e CI PostgreSQL/publicação (`36492929091`, `36492928824`) passaram.
- [ ] Diagnosticar read-only a conversa específica no banco Windows do usuário; o sandbox não tem acesso a esse banco.
- [x] Encaminhar `messaging-history.set` para importação automática idempotente; batches usam IDs determinísticos, não baixam mídia histórica e ficam fora de IA/unread/takeover. Persistência de progresso e busca incremental continuam pendentes.
- [ ] Decidir após evidência/teste o tratamento de `fromMe` live válido sem conversa conhecida; no momento esse envio real ainda é aceito.


## Limpeza estrutural Baileys-only — 2026-09-29

- [x] Remover o adapter Cloud e reduzir o transporte operacional ao gateway Baileys.
- [x] Remover do `server/db.ts` os helpers CRUD, secrets, seleção de default e webhooks PAPI sem consumidores ativos.
- [x] Remover variáveis PAPI Cloud do runtime e retirar `defaultChannel`/`setDefaultChannel` da API tRPC.
- [x] Restringir `WhatsappProvider`/`IntegrationName` operacionais a Baileys e fazer inbound/outbound falharem fechado para provider histórico incompatível.
- [x] Atualizar contrato REST, checklist beta, instruções locais/VPS e marcar guias PAPI antigos como históricos.
- [x] Atualizar o detector de secrets do workflow sem nomes de providers removidos.
- [ ] Inventariar dados legados por workspace/instância em banco restaurado; não apagar configurações históricas sem backup e contagem.
- [ ] Criar e testar migration de schema ativo Baileys-only em banco vazio e restaurado; migrations já aplicadas não serão editadas.
- [ ] Repetir quality gate PostgreSQL, gateway, staging e scan de rotas/configuração antes de declarar o bloqueador P0 fechado.


## Inventário pré-migration Baileys — 2026-09-29

- [x] Preparar `scripts/inventory-whatsapp-legacy.ts` com transação `BEGIN READ ONLY`, timeout, rollback e saída sem secrets/conteúdo.
- [x] Adicionar `pnpm db:inventory:whatsapp` e documentar backup, restore separado, escopo por workspace e critérios de decisão em `docs/BAILEYS-DATA-INVENTORY.md`.
- [x] Validar `pnpm check`, JSON do `package.json`, `git diff --check` e recusa segura quando `DATABASE_URL` não está configurada.
- [ ] Executar o inventário no PostgreSQL restaurado do usuário e preservar o JSON como evidência; a sandbox não possui esse banco.
- [ ] Revisar contagens de provider/instância, mensagens queued/processing, settings legados e colisões antes de desenhar a migration de convergência.
