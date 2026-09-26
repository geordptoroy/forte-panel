# Forte Panel — acompanhamento do produto público

**Direção atual:** SaaS público multiempresa, conforme `ESTRATEGIA-PRODUTO-PUBLICO-MULTICONTA.md`.
**Fase de código atual:** migrar queries e mutações de negócio para `workspaceId` explícito, domínio por domínio. **Não começar pela integração Baileys.**

## Concluído até aqui no MVP

- Shell responsivo e páginas base de Dashboard, Inbox, Kanban, Agenda, Contatos, ficha do cliente, Faturamento, Integrações e Configurações.
- Schema para contatos, conversas, mensagens e auditoria, seed demo idempotente e Inbox/Kanban/Contatos persistentes.
- Pausar/reativar IA, enviar mensagem humana e takeover com auditoria.
- Agenda nativa com serviços, profissionais, jornada semanal por fuso, conflitos, locks para reservas concorrentes e portal do profissional.
- API v1 inicial para contatos, memória, disponibilidade, agendamentos, mensagens e webhooks; autenticação, idempotência e outbox de eventos.
- Adapters de WhatsApp PAPI e Meta Cloud API, seleção de canal por workspace e worker separado.
- Multiusuário interno com hash de senha, memberships e papéis base; telas iniciais de Equipe/Configurações e notificações internas.
- Ledger idempotente das tools de agente e melhorias de leases do worker.
- Compose, migrations, documentação local e infraestrutura registrados nos docs existentes.
- Última validação (2026-09-26): sandbox sem banco: 50 testes passaram e 24 foram ignorados; PostgreSQL local efêmero: **74 testes passaram, 0 ignorados**, incluindo isolamento, deduplicação, quotas, retenção, alertas e readiness.

## Direção de produto aprovada

- Cada conta **master** cria e administra uma empresa/workspace.
- Cada empresa terá logins individuais de funcionários, com nome, identificador e senha inicial segura, e papéis/permissões.
- A conexão/número WhatsApp é uma entidade separada do login e do workspace; primeira versão pública: alvo de uma conexão por workspace.
- O usuário final não deverá configurar secrets nem editar Compose.
- PAPI atual é provider de transição. Um gateway REST próprio baseado em fork da PAPI ou em Baileys é etapa futura e condicionada à validação de fonte/licença/segurança. Atualmente os Compose mais recentes usam `intrategica/papi-free:1.5.2`, não `1.5.1`; não assumir autorização para modificar/redistribuir a imagem.

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
- **Atenção:** ainda não abrir cadastro público de empresa; o banco local foi efêmero e serve apenas para validação automatizada.
- Próxima fatia: repetir migrations/testes no staging real e conectar os sinais de readiness/heartbeat ao monitoramento; depois revisar planos comerciais a partir do consumo observado.
- [ ] **P0 antes dos convites beta:** implementar console interno `platform_admin` para listar contas/workspaces, consultar saúde/uso, prestar suporte read-only e registrar auditoria.
- [ ] **P0 antes dos convites beta:** implementar configuração versionada do agente por workspace: rascunho, simulação sem envio externo, publicação, histórico e rollback.
- [ ] **P0 antes dos convites beta:** permitir pausar/reativar IA, suspender/reativar conta e adicionar notas de suporte com motivo, sem revelar senha ou segredo bruto.
- [ ] **P0 antes dos convites beta:** criar testes de autorização que provem que owner/member não acessa o console da plataforma e que uma sessão de suporte não cruza workspace.
- Criar/explicitar relação tenant ↔ owner/master e preparar backfill do workspace demo sem perder dados.
- Remover dependência de workspace global/demo e bootstrap de admin global para o caminho público.
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

### 4. Uma conexão WhatsApp por empresa (primeira entrega)

- Escolher provider estável, autenticação por tenant, vínculo de webhook/instância, estados de QR/pareamento e health.
- Validar inbound/outbound, `fromMe`, idempotência, takeover humano, rate limits e operação em staging.
- Preservar adapter para troca reversível de provider e manter opção oficial da Meta documentada.

### 5. Operação, beta e lançamento

- CI com PostgreSQL, suites de isolamento/integration/E2E, health/readiness, logs/alertas e correlation IDs.
- Backups off-host e restauração testada; exportação/encerramento de empresa; limites antiabuso.
- Revisar privacidade, termos, retenção e suporte antes de cadastro público aberto.
- Decidir planos/cobrança depois de validar uso/custo e jornada do produto.

### Futuro condicionado — PAPI própria / Baileys

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
