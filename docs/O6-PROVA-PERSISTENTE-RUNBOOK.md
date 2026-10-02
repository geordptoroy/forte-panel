# Onda O6 — Runbook de prova persistente

**Status:** preparação documental; execução bloqueada por falta de ambiente persistente autorizado.

**Branch:** `feat/o7.15-storage-reconciliation-observability`

**Objetivo:** produzir evidência de operação real em ambiente descartável/persistente, sem declarar o MVP público como concluído e sem repetir ensaios de backup/restore ou pareamento real já registrados.

## 1. Bloqueio atual

A sessão atual possui somente o **Manus Sandbox**, sem Cloud Computer, workspace persistente, Docker disponível para staging ou URL de staging autorizada. Nenhuma infraestrutura será inventada, provisionada com credenciais implícitas ou substituída por um mock.

Para executar esta prova é necessário um ambiente descartável e persistente autorizado, com acesso controlado ao repositório e configuração de runtime fornecida fora do chat. Secrets devem ser cadastrados no mecanismo de secrets do ambiente/CI; nunca devem ser commitados, impressos ou enviados em mensagens.

## 2. Topologia mínima

A prova precisa manter dados e sessões entre reinícios:

- PostgreSQL persistente com migrations versionadas aplicadas;
- Redis persistente ou com política explícita de recuperação;
- Panel e worker em versões imutáveis do mesmo commit;
- gateway Baileys com volume persistente para `/app/sessions` e outbox;
- HTTPS ou rede interna equivalente com autenticação server-to-server;
- logs e readiness acessíveis sem expor payloads, QR, cookies ou secrets;
- `DEMO_MODE=false`, `WORKSPACE_BOOTSTRAP_ENABLED=false` e `CORE_ONLY_MODE=true`.

A sessão Baileys existente não deve ser apagada nem pareada novamente. Se ela não puder ser usada de forma isolada no ambiente de prova, o gate de WhatsApp permanece bloqueado.

## 3. Configuração obrigatória

No ambiente seguro, configurar por secret/variable store:

| Categoria | Requisitos |
|---|---|
| Aplicação | `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `LOCAL_ADMIN_EMAIL`, `LOCAL_ADMIN_PASSWORD` |
| Gateway | `BAILEYS_API_KEY`, `BAILEYS_WEBHOOK_SECRET`, `BAILEYS_INSTANCE_ID`, `BAILEYS_BASE_URL` |
| API de teste | `FORTE_API_KEY`, `FORTE_API_WORKSPACE_ID` somente se a API pública estiver explicitamente habilitada |
| Staging E2E | `STAGING_BASE_URL`, `STAGING_FORTE_API_KEY`, `STAGING_ADMIN_EMAIL`, `STAGING_ADMIN_PASSWORD` |

Não usar valores reais de produção. A URL do staging deve ser descartável, autorizada a receber dados sintéticos e separada de qualquer número ou workspace de produção.

## 4. Sequência de execução

### Gate A — configuração e migrations

1. Validar configuração fail-closed:

   ```bash
   pnpm check:production-config
   ```

2. Aplicar migrations em banco vazio/persistente e conferir o journal.
3. Executar `scripts/staging-smoke.sh` com `STAGING_BASE_URL` e confirmar `/api/v1/health` e `/api/v1/ready`.
4. Registrar commit, digest das imagens e timestamp da execução.

### Gate B — isolamento e papéis

1. Criar dois workspaces descartáveis pelo fluxo autorizado.
2. Criar usuários owner/admin/manager/agent/professional conforme a matriz de papéis.
3. Provar que cada caller só lê e muta o próprio workspace.
4. Executar o fluxo operacional existente:

   ```bash
   node scripts/validate-flow.mjs "$STAGING_BASE_URL"
   ```

5. Executar os contratos PostgreSQL e as provas negativas de tenancy/roles no mesmo banco persistente.
6. Remover apenas os dados sintéticos da execução, usando o procedimento aprovado do ambiente; nunca usar `docker compose down -v` sem autorização específica.

### Gate C — worker, gateway e mídia

1. Confirmar worker, fila, DLQ, storage, webhook e gateway saudáveis.
2. Confirmar que reiniciar Panel, worker e gateway não perde eventos pendentes nem sessão persistida.
3. Exercitar inbound/outbound apenas com o número de teste já autorizado, sem novo pareamento.
4. Validar mídia privada sem expor URL pública, ownership entre workspaces e falhas redigidas.
5. Registrar evidência de idempotência, retry, reconexão e `webhookOutboxPending`.

### Gate D — browser e acessibilidade

Executar no navegador autenticado desktop e mobile:

- login e logout;
- onboarding/estado de ativação;
- saúde e conexão do WhatsApp;
- Inbox inbound/outbound;
- estados de erro, retry e loading;
- foco, labels, dialogs, contraste e navegação por teclado.

Este gate não pode ser inferido de `pnpm build` ou de testes sintéticos.

### Gate E — decisão

A O6 só pode ser marcada como evidência de produção quando todos os gates A–D tiverem artefatos datados, sem skips críticos e com isolamento negativo. Qualquer URL, secret ausente, banco efêmero, sessão não persistente ou smoke manual não executado mantém o status **BLOQUEADO/PARCIAL**.

## 5. Workflow E2E existente

O repositório já possui `.github/workflows/staging-e2e.yml`. Ele exige explicitamente:

- `base_url` opcional ou variável `STAGING_BASE_URL`;
- `confirm_disposable_staging=true`;
- secrets `STAGING_FORTE_API_KEY`, `STAGING_ADMIN_EMAIL` e `STAGING_ADMIN_PASSWORD`.

Não disparar esse workflow até que a URL seja confirmada como staging descartável autorizado e os secrets estejam cadastrados no GitHub Actions. O Sandbox atual não possui nenhum desses pré-requisitos.

## 6. Evidências a anexar

- URL/identificador do ambiente descartável, sem credenciais;
- commit e digest das imagens;
- resultado de health/readiness;
- migrations/journal;
- matriz de dois workspaces e papéis;
- relatório de isolamento negativo;
- logs redigidos de worker/gateway/fila/DLQ/storage;
- resultado do browser desktop/mobile;
- decisão final `approved`, `inconclusive` ou `blocked`.

Não anexar cookies, QR, chaves, URLs assinadas, corpo de mensagens, mídia privada ou dumps de produção.
