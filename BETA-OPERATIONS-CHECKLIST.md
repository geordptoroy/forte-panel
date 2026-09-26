# Forte Panel — Operação do beta e continuidade técnica

**Atualizado em:** 26/09/2026 10:52 (America/Sao_Paulo)  
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

As chaves PAPI/Meta pertencem ao workspace ou à instância do workspace, não ao usuário final. Elas são armazenadas criptografadas quando persistidas e aparecem somente mascaradas nas respostas de configuração. O segredo de webhook é mostrado apenas no momento de criação/provisionamento.

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
6. Antes de chamar PAPI/Meta, o worker consome `outboundMessages` do workspace.
7. Se a cota estiver cheia, a mensagem continua `queued`, sem incrementar tentativas, e será tentada na próxima janela.
8. PAPI/Meta recebe uma chave de idempotência baseada no ID da mensagem.

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
```

Depois da aplicação, verificar que as três tabelas/constraints existem e executar dois workspaces com usuários diferentes.

## 6. Checklist de abertura do beta

- [ ] Definir `NODE_ENV=production` no deployment.
- [ ] Definir `JWT_SECRET` forte e exclusivo do deployment.
- [ ] Definir `FORTE_API_KEY` para integrações REST.
- [ ] Definir credenciais PAPI/Meta somente no servidor ou por workspace.
- [ ] Executar migrations 0016–0018.
- [ ] Criar dois workspaces de teste e confirmar que nenhum contato/mensagem/configuração cruza tenant.
- [ ] Criar até 10 memberships beta, com roles mínimas necessárias.
- [ ] Confirmar que apenas manager/admin/owner vê o painel de consumo e os alertas operacionais.
- [ ] Testar inbound, resposta de IA, envio manual e outbound automático.
- [ ] Forçar limite baixo em ambiente de teste e confirmar que mensagens ficam `queued`.
- [ ] Confirmar que a renovação do minuto permite o reenvio.
- [ ] Confirmar notificação de 70% e 90% sem duplicação.
- [ ] Observar logs do worker: `limitadas=N` e `alertasCota=N`.
- [ ] Registrar erros do beta sem remover dados de produção.

## 7. Riscos ainda abertos

1. Os testes que exigem PostgreSQL aparecem ignorados neste sandbox; a validação concorrente real ainda precisa ser feita no ambiente com banco.
2. O bucket de consumo cresce com o tempo; adicionar retenção/limpeza periódica após observar o volume do beta.
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
- Onboarding, runtime do agente e PAPI tenant-aware.
- Criptografia de segredos PAPI/webhook e bloqueio de fallback previsível em produção.
- Idempotência, eventos, auditoria e deduplicação tenant-aware.
- Quotas por workspace e operador.
- Painel operacional de consumo em Integrações.
- Limite outbound no worker.
- Alertas in-app de 70% e 90% para gestores.

## 10. Validação PostgreSQL executada

Em 26/09/2026 foi criada uma instância PostgreSQL 16 local efêmera. As migrations versionadas foram aplicadas com `pnpm exec drizzle-kit migrate`. O banco confirmou as tabelas e índices compostos de tenancy. A suíte passou com 20 arquivos e 72 testes, sem testes ignorados. O teste adicional de alertas confirmou criação em 70%, deduplicação e isolamento entre workspaces.

Esse resultado valida o código contra PostgreSQL local, mas não substitui a execução no PostgreSQL de staging com as credenciais e configurações reais do deployment.
