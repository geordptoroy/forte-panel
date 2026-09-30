# Forte Panel — Operação do beta e continuidade técnica

**Atualizado em:** 29/09/2026 (America/Sao_Paulo)
**Repositório:** `geordptoroy/forte-panel`  
**Objetivo:** servir como referência única para executar o beta com até 10 empresas/testadores sem misturar tenants, perder mensagens ou expor credenciais.

## 1. Modelo de API e chaves

### Chave do provedor de IA

A aplicação usa a configuração de IA do servidor para chamar o modelo. Os usuários do Forte Panel **não precisam informar uma chave de IA individual** no fluxo normal.

Uma chave de provedor pode atender requisições de vários workspaces porque a chave autentica a aplicação perante o provedor. O isolamento entre clientes é responsabilidade do Forte Panel: cada requisição recebe o `workspaceId` do contexto autenticado ou da integração vinculada.

A chave única não deve ser confundida com uma cota única sem controle. O sistema mantém limites separados por workspace e por operador:

- **Starter:** 120 API/min, 60 IA/min, 120 outbound/min.
- **Pro:** 600 API/min, 300 IA/min, 600 outbound/min.
- **Business:** 1.800 API/min, 900 IA/min, 1.800 outbound/min.

Variáveis `FORTE_WORKSPACE_*_PER_MINUTE` podem sobrescrever os limites do deployment.

### Chaves de integração

As credenciais internas do gateway Baileys pertencem ao deployment/serviço, não ao usuário final. Elas nunca são retornadas ao frontend. O webhook interno usa segredo/assinatura e a instância é validada pelo workspace antes da ingestão.

## 2. Isolamento multi-tenant

Todo fluxo protegido deve resolver o workspace antes de ler ou escrever dados. A regra é:

```text
usuário autenticado -> membership ativo -> workspace -> query/mutação filtrada pelo workspaceId
```

As chaves compostas de deduplicação usam workspace:

- API idempotency: `(workspaceId, key)`
- webhook events: `(workspaceId, eventId)`
- domain events: `(workspaceId, eventKey)`
- agent effects: `(workspaceId, eventId, toolCallId)`
- notifications: `(workspaceId, userId, eventKey)`
- usage workspace: `(workspaceId, bucketStart)`
- usage user: `(workspaceId, userId, bucketStart)`

## 3. Fluxo da IA e mensagens

1. O webhook inbound entra com autenticação e idempotência.
2. O evento é salvo com `workspaceId`.
3. O worker processa `message.received`.
4. A execução de IA consome `aiRequests` do workspace.
5. A resposta da IA é enfileirada como mensagem outbound.
6. Antes de chamar o gateway Baileys, o worker consome `outboundMessages` do workspace.
7. Se a cota estiver cheia, a mensagem continua `queued`, sem incrementar tentativas, e será tentada na próxima janela.
8. O gateway Baileys recebe uma chave de idempotência baseada no ID da mensagem e persiste um ledger por instância; replay concluído reaproveita o `externalId` e resultado inconclusivo falha fechado. A prova de restart/timeout em staging ainda é gate de release.

Mensagens manuais do Inbox também consomem a cota individual do operador no momento do envio e a cota do workspace no worker.

## 4. Cotas e alertas

As janelas são de um minuto e persistidas no PostgreSQL:

- `workspaceUsageBuckets`
- `workspaceUserUsageBuckets`

O worker executa `processWorkspaceQuotaAlertsOnce` uma vez por minuto. Gestores, administradores e owners ativos recebem uma notificação quando o workspace atinge:

- **70%:** alerta de consumo elevado.
- **90%:** alerta crítico de cota quase esgotada.

A chave de evento contém workspace, janela, métrica e threshold. Portanto, o alerta é idempotente mesmo que vários ciclos do worker executem a mesma varredura.

## 5. Migrations

Aplicar em ordem no PostgreSQL real:

```bash
pnpm exec drizzle-kit migrate
```

Migrations relevantes:

```text
0016_workspace_usage_buckets.sql
0017_tenant_scoped_deduplication.sql
0018_workspace_user_usage_buckets.sql
0023_interactive_message_types.sql
```

Depois da aplicação, verificar que as três tabelas/constraints existem e executar dois workspaces com usuários diferentes.

## 6. Checklist de abertura do beta

- [ ] Definir `NODE_ENV=production` no deployment.
- [ ] Definir `JWT_SECRET` forte e exclusivo do deployment.
- [ ] Definir `FORTE_API_KEY` para integrações REST.
- [ ] Tornar obrigatória e persistente a chave de criptografia do auth state Baileys em staging/produção.
- [ ] Executar migrations 0016–0018.
- [ ] Criar dois workspaces de teste e confirmar que nenhum contato/mensagem/configuração cruza tenant.
- [ ] Criar até 10 memberships beta, com roles mínimas necessárias.
- [ ] Implementar e testar o console interno `platform_admin` antes de criar os testers.
- [ ] Configurar cada agente beta por workspace usando rascunho, simulação, publicação e rollback; não editar secrets manualmente.
- [ ] Confirmar que suporte read-only não permite acesso cruzado e que toda ação mutável exige motivo/auditoria.
- [ ] Confirmar que apenas manager/admin/owner vê o painel de consumo e os alertas operacionais.
- [ ] Testar inbound, resposta de IA, envio manual e outbound automático.
- [ ] Forçar limite baixo em ambiente de teste e confirmar que mensagens ficam `queued`.
- [ ] Confirmar que a renovação do minuto permite o reenvio.
- [ ] Confirmar notificação de 70% e 90% sem duplicação.
- [ ] Observar logs do worker: `limitadas=N` e `alertasCota=N`.
- [ ] Registrar erros do beta sem remover dados de produção.

## 7. Riscos ainda abertos

1. A validação PostgreSQL local passou, mas deve ser repetida no staging real.
2. O console interno `platform_admin` e a configuração versionada do agente estão implementados; falta repetir as mutações e sessões de suporte no staging real antes dos convites.
3. A cota individual atual é derivada da cota do plano, não de uma tabela de planos comercial.
4. Ainda não há alerta externo por e-mail/WhatsApp; neste momento o alerta é in-app.
5. A API REST usa chave da aplicação; se clientes externos receberem acesso individual no futuro, criar tokens por workspace com rotação e revogação.

## 8. Comandos de validação

```bash
pnpm check
pnpm test
pnpm build
git diff --check
```

No estado atual, os comandos passam no sandbox. Parte dos testes de isolamento é ignorada quando `DATABASE_URL` não está disponível.

## 9. Últimos blocos entregues

- CRM/Inbox tenant-aware.
- Onboarding e runtime do agente tenant-aware.
- Gateway Baileys multi-instância, webhook assinado e bloqueio de fallback previsível em produção.
- Idempotência, eventos, auditoria e deduplicação tenant-aware.
- Quotas por workspace e operador.
- Painel operacional de consumo em Integrações.
- Limite outbound no worker.
- Alertas in-app de 70% e 90% para gestores.
- Health/readiness, heartbeat e retenção dos buckets.

## 10. Validação PostgreSQL executada

Em 26/09/2026 foi criada uma instância PostgreSQL 16 local efêmera. As migrations versionadas foram aplicadas com `pnpm exec drizzle-kit migrate`. O banco confirmou as tabelas e índices compostos de tenancy. A suíte passou com 20 arquivos e 72 testes, sem testes ignorados. O teste adicional de alertas confirmou criação em 70%, deduplicação e isolamento entre workspaces.

Esse resultado valida o código contra PostgreSQL local, mas não substitui a execução no PostgreSQL de staging com as credenciais e configurações reais do deployment.

## 11. Retenção de consumo

Os buckets de uso não são mantidos indefinidamente. O worker executa uma limpeza diária através de `cleanupWorkspaceUsageBuckets`. O padrão é 30 dias e pode ser alterado por `FORTE_USAGE_RETENTION_DAYS`, entre 1 e 365 dias. A limpeza remove tanto `workspaceUsageBuckets` quanto `workspaceUserUsageBuckets` e preserva a janela dentro do período configurado.

## 12. Sinais de operação

Use `GET /api/v1/health` para liveness e `GET /api/v1/ready` para readiness. O primeiro confirma somente o processo HTTP; o segundo confirma também a conexão PostgreSQL. Configure o monitoramento para considerar `503` em `/ready` como indisponibilidade do serviço.

O worker emite um evento JSON `worker_heartbeat` por padrão a cada 60 segundos. Ajuste `WORKER_HEARTBEAT_MS` somente se o sistema de logs/monitoramento exigir outra frequência. Monitore também `limitadas`, `alertasCota`, `bucketsRemovidos` e `lastError`.

## 13. Smoke check de staging

O repositório contém `scripts/staging-smoke.sh`, que valida `GET /api/v1/health` com `200/status=ok` e `GET /api/v1/ready` com `200/status=ready`. O script não recebe nem imprime credenciais; precisa apenas de `STAGING_BASE_URL` e falha explicitamente quando a URL não está configurada ou o banco não está pronto.

Também foi criado o workflow manual `Staging smoke check`. Para habilitá-lo, configure a variável de repositório `STAGING_BASE_URL` no GitHub ou informe `base_url` ao disparar o workflow. Execute-o após cada deploy de staging; um `503` em readiness deve bloquear a abertura do beta até a causa ser resolvida.

## 14. Mutações administrativas

A suíte PostgreSQL `server/platform-admin-actions.test.ts` valida o fluxo de pausar/reativar a IA, suspender/reativar workspace e registrar nota interna de suporte com motivo, sessão escopada e auditoria por workspace. Esse gate passa no CI com banco limpo; ainda deve ser repetido no staging real antes dos convites beta.

## 15. Gateway WhatsApp e mídia

O pacote `forte-whatsapp` agora possui testes de contrato HTTP em `src/server.test.ts` para health/readiness, autenticação e envio de texto, imagem, áudio, vídeo e documento sem pareamento ou número real. O workflow de publicação executa `npm ci`, `npm test`, `npm run check` e `npm run build` do gateway.

Isso não substitui o teste E2E de staging com número dedicado: o pareamento, recebimento real e envio para um contato controlado continuam bloqueados até existir um ambiente de teste explicitamente configurado.

## 16. E2E operacional de staging

O workflow manual `Staging end-to-end` executa `scripts/validate-flow.mjs` contra uma URL fornecida no momento da execução ou pela variável `STAGING_BASE_URL`. A chave REST e as credenciais do administrador entram exclusivamente pelos secrets `STAGING_FORTE_API_KEY`, `STAGING_ADMIN_EMAIL` e `STAGING_ADMIN_PASSWORD`; nunca devem ser commitadas ou passadas na linha de comando.

Esse fluxo cria serviços, profissionais, memberships e agendamentos para provar isolamento e regras da agenda. Portanto, deve ser executado apenas em staging descartável ou com dados de teste previamente autorizados, nunca em produção. O pareamento e o E2E de mídia/WhatsApp continuam sendo uma etapa separada porque exigem um número de teste controlado.

## 17. Proteções do E2E

Antes de iniciar o workflow E2E, o operador deve marcar `confirm_disposable_staging=true`, confirmando que a URL é um staging descartável/autorizado e pode receber dados de teste. O workflow impede duas execuções simultâneas e possui limite de dez minutos; sem a confirmação, URL ou secrets necessários, ele falha antes de chamar o sistema.

## 18. Backup, restore e mídia privada

O script `scripts/backup-restore.sh` fornece três operações:

```bash
scripts/backup-restore.sh backup
scripts/backup-restore.sh verify ./backups
CONFIRM_RESTORE=YES RESTORE_SESSION_DIR=/tmp/forte-restore scripts/backup-restore.sh restore ./backups
```

`backup` cria dump customizado do PostgreSQL, tar da sessão Baileys sem o lock ativo e manifesto com SHA-256. `verify` valida o dump, o tar e os hashes. `restore` exige confirmação explícita e um diretório de sessão separado; depois da restauração, valide health/readiness, tenant e pareamento antes de reabrir o tráfego.

Para remover data URLs da persistência inbound, configure `FORTE_MEDIA_PRIVATE_STORAGE_ENABLED=true`, `FORTE_MEDIA_MAX_BYTES` e o storage privado do ambiente. O Panel grava a mídia em `workspaces/<workspaceId>/whatsapp/`, mantém somente a referência e resolve URL assinada para o agente. A ativação deve ser feita primeiro em staging.

O REST também aceita tipos estruturados Baileys (`list`, `poll`, `location`, `contact`, `react`, `sticker`, `album`, `event`) com `metadata.payload`; o worker não possui fallback para outro provider.


## 19. Segredos, prompt e reset

O painel operacional comum não exibe nem permite editar API keys, configuração de provedores, prompt do agente ou reset de dados. As rotas `/onboarding`, `/ai-config` e `/ai-prompt` agora usam guard exclusivo de `platformAdmins`, e as procedures correspondentes também rejeitam usuários comuns no backend.

O reset de desenvolvimento foi movido para o detalhe do workspace no console `/platform-admin/workspaces/:id`. Ele exige sessão de suporte `operator`, permissão mutável, confirmação explícita `APAGAR DADOS DO WORKSPACE`, motivo e auditoria. Usuários, memberships e acesso são preservados.


## 20. Operação local e conexão do WhatsApp

Para atualizar e iniciar a stack usando `.env`, execute:

```bash
./scripts/start-docker.sh
```

No Windows, também é possível executar diretamente pelo PowerShell, sem depender do Bash/WSL:

```powershell
.\scripts\start-docker.ps1
```

Esse comando faz pull das imagens `dev` e recria somente os serviços da stack, sem remover volumes.

O script faz pull das imagens publicadas e recria `postgres_panel`, `redis_panel`, `forte-panel`, `forte-panel-worker` e `forte-whatsapp`; não remove volumes. O painel comum agora possui **Sair** no topo e a tela `Integrações` permite iniciar a conexão, acompanhar o estado e ler o QR Code do WhatsApp dentro da própria interface.


## 21. Bloqueios descobertos na auditoria de 27/09

Antes de novos convites beta, fechar obrigatoriamente:

1. Retorno do console sem cair genericamente em `/dashboard`; suporte a platform-only.
2. Reativação de workspace suspenso após expiração/logout de sessão administrativa.
3. Rota `/kanban` funcionando ou links removidos.
4. Quotes/billing sem `ensureDemoWorkspace()` e com isolamento de workspace.
5. QR/conexão WhatsApp validado em Docker com número de teste, incluindo inbound/outbound.
6. KPIs Dashboard/Atendimento/Funil reconciliados por mensagens, contatos, unread e stage.
7. Mobile sem CTAs escondidos, scroll aninhado ou ausência de destaque da rota atual.
8. Backup/restore, staging persistente, observabilidade e testes negativos de tenancy.

Tickets de suporte, catálogo de preços, planos sandbox, landing, termos, privacidade e LGPD são etapas seguintes; não ativar cobrança ou cadastro público antes da aprovação dos gates acima. Consulte `PLANO-AUDITORIA-E-EXECUCAO-2026-09-27.md` para a ordem completa.


## 22. Resultado da execução P0 — 2026-09-27

O primeiro bloco de correções foi concluído. O retorno do console permanece no console da plataforma, workspaces suspensos podem receber uma sessão administrativa para reativação, `/kanban` está registrado e billing/quotes passou a exigir gerente e escopo explícito do workspace.

Os comandos locais `pnpm check`, `pnpm build`, `pnpm test -- --runInBand` e `git diff --check` foram executados. O resultado foi 62 testes aprovados, 31 skipped por ausência de `DATABASE_URL`, build aprovado com alerta conhecido de bundle grande e nenhum erro de TypeScript.

O gate ainda não é considerado totalmente fechado até executar PostgreSQL/staging com dois workspaces, validar quotes sem cruzamento de tenant e rodar smoke browser no ciclo workspace suspenso → logout → novo login → reativação. Depois desse gate, a próxima frente é QR/Conexão WhatsApp.


## 23. P1.1 — Conexão WhatsApp/QR

A interface comum agora é uma área dedicada à conexão WhatsApp, com uma instância por workspace. O QR apresenta expiração, retry, tratamento de QR stale e foco mobile. O gateway possui reconnect explícito e mantém a proteção de sessão já implementada.

O gate automatizado passou: painel em TypeScript/build e gateway em TypeScript/15 testes. Antes do beta controlado, executar com Docker e número de teste o ciclo completo de conexão, leitura, expiração/atualização, reinício, desconexão e logout. Confirmar também que uma mensagem inbound chega ao Inbox pelo webhook assinado.
