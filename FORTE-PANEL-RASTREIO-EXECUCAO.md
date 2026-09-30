# Forte Panel — Rastreio de execução

Atualizado em: 2026-09-30

## Regra de execução acordada

1. **Fazer primeiro todas as fatias de coding da fila.**
2. Validar cada fatia com testes locais, typecheck, build, CI e Docker quando aplicável.
3. Não mascarar limitações externas: staging, restore, browser smoke, billing real e release público têm gates próprios.
4. Ao final da fila de coding, executar uma rodada de **refatoração orientada por evidência**: corrigir somente o que falhou, ficou duplicado, não está funcional ou contradiz os contratos.
5. Não fazer merge automático, não apagar volumes e manter `CORE_ONLY_MODE` ativo.

## Estado consolidado

| Área | Estado | Evidência |
|---|---|---|
| O7.4 histórico Baileys | Concluída | CI PostgreSQL; 5 eventos saíram da fila ativa; `pending=0` |
| O7.5 dead-letter | Concluída | CI PostgreSQL; 5 envelopes preservados em `dead-letter` |
| O7.6 observabilidade DLQ | Concluída | Imagem `sha-f66ec8d`; `deadLetter=5` antes/depois do restart |
| Smoke inbound | Concluído | `[forte-worker] eventos=1 entregues=1 falhas=0` |
| Smoke outbound | Concluído | `[forte-worker] eventos=1 entregues=1 falhas=0` |
| Sessão persistente | Concluída | Reconectou após restart sem novo QR |
| Release público | Bloqueado por gates externos | Ainda exige staging, restore, browser smoke, segurança e revisão final |

Auditoria documental de 2026-09-30 confirmou gaps adicionais além do resumo operacional: idempotência de efeito externo no gateway, transação inbound, hardening de sessão/webhook/headers, runbook, observabilidade externa, coorte de até 10 workspaces, fallback/custo da IA, UX pública e billing continuam abertos. Detalhamento em [`AUDITORIA-GAPS-MVP-2026-09-30.md`](./AUDITORIA-GAPS-MVP-2026-09-30.md).

## Fila unificada após a auditoria documental

1. **O7.9 — Idempotência outbound fim a fim:** concluída em código e testes locais; ledger durável e fail-closed para timeout/restart. Staging/timeout físico permanecem no fechamento externo.
2. **O7.10 — Inbound transacional:** concluída em código e testes locais; uma transação protege contato, conversa, lead/oportunidade, mensagem, unread e evento de domínio. Compensação de mídia e crash/restore persistente permanecem externos.
3. **O7.11 — Hardening de sessão/webhook/headers:** primeira fatia concluída; headers globais, bearer constant-time, origem/CSRF e rate limits cobertos. Secrets, revogação, rate limit distribuído e staging permanecem.
4. **O7.12 — Restore e operação:** primeira fatia concluída; restore verifica manifesto/hashes antes de mutar, rejeita a sessão ativa e o runbook mínimo foi documentado. Restore completo, off-host, blobs, RPO/RTO e rollback permanecem.
5. **O7.13 — Restore rehearsal e compensação:** política local concluída; classifica chaves conhecidas, referências, objetos recentes e desconhecidos sem delete automático. Provider list/delete, retenção, métricas e restore real permanecem.
6. **O7.14 — Provider de storage:** contrato concluído em dry-run; listagem paginada e delete condicionado por etag estão definidos, mas o adapter Forge real não expõe essas operações.
7. **O7.15 — Métricas e ensaio do provider:** concluído localmente; métricas agregadas, limite anti-loop e ausência de chaves no resultado.
8. **O7.16 — Auditoria persistida e restore rehearsal:** concluída como fatia de coding/documentação; o reconciliador aceita `onMetrics`, `persistStorageReconciliationAudit` grava somente contadores, `runId`, workspace e duração em `auditLogs`, e [`RESTORE-REHEARSAL-PLAN.md`](./RESTORE-REHEARSAL-PLAN.md) define o ensaio de PostgreSQL, mídia, Redis, sessão Baileys, chaves, RPO/RTO e rollback. Provider real, alertas e execução do ensaio permanecem como gates externos.
9. **O7.17 — Anti-replay de webhook:** primeira fatia concluída em código e testes locais; timestamp, nonce, HMAC temporal, janela de 5 minutos e unicidade persistente por workspace/provider foram adicionados. CI PostgreSQL, corrida distribuída, revogação e staging permanecem.
10. **O7.18 — Rate limiting distribuído:** primeira fatia concluída em código e migrations; login, cadastro e reset usam buckets PostgreSQL com hash de escopo e `FOR UPDATE`. CI PostgreSQL concorrente e política de falha quando o banco está ausente permanecem.
11. **O7.19 — Segredo de webhook por instância:** concluído em código no Panel e gateway; o Panel persiste criptografado, atualiza o outbox em memória via endpoint autenticado e faz rollback em erro. Validação PostgreSQL/WhatsApp real permanece.
12. **O7.20 — Revogação de sessões:** concluído em código; logout autenticado incrementa `users.sessionVersion`, invalidando cookies e Bearer tokens anteriores. PostgreSQL real e browser smoke permanecem.
13. **O7.21 — Fail-closed de segurança:** concluído em código; produção ou `FORTE_SECURITY_FAIL_CLOSED=true` não usa fallback permissivo para autenticação, rate limit e revogação quando PostgreSQL está indisponível.
14. **O7.22 — Retenção operacional:** concluído em código; worker possui sweep diário dry-run por padrão para webhooks, domain events e buckets de segurança, com limites e transação na aplicação destrutiva.
15. **O7.23 — Reconciliação de mídia no worker:** runner concluído com provider abstrato, auditoria redigida, dry-run e limites; provider Forge real continua desativado porque list/delete ainda não estão disponíveis.
16. **O7.24 — Quality gate final de CI:** concluído em código; validador fail-closed de produção adicionado aos workflows PostgreSQL e publicação, com zero skips obrigatório no job PostgreSQL.
17. **O7.25 — Gate de restore rehearsal:** concluído em código; verificador offline exige banco, sessão Baileys e inventário de mídia com hashes, sem executar mutações.
18. **O7.26 — Relatório de restore rehearsal:** concluído em código; gerador redigido calcula RPO/RTO e emite somente `approved`, `inconclusive` ou `blocked`, sem aprovação parcial.
19. **O7.27 — Isolamento do restore rehearsal:** concluído em código; gate verifica CORE_ONLY_MODE, tráfego bloqueado, outbound desligado, endpoints não produtivos, sessão separada, rollback e readiness.
5. **O7.13 — Qualidade e escala:** quality gate sem skips críticos, concorrência, paginação, métricas e coorte de dois/dez workspaces.
6. **Produto público:** onboarding final, UX/a11y, IA avançada, billing, termos e cadastro público somente depois dos gates P0.

Os itens que exigem a máquina do usuário ou ambiente externo ficam em uma fila separada para o encerramento: Docker com volume real, staging persistente, browser autenticado, restore limpo e WhatsApp físico.

O plano operacional do restore está em [`RESTORE-REHEARSAL-PLAN.md`](./RESTORE-REHEARSAL-PLAN.md). Ele não foi executado no sandbox e não autoriza restore contra produção.

### O7.16 — Contrato de auditoria persistida

- `server/storage-reconciliation.ts` calcula o snapshot agregado e chama `onMetrics` quando configurado.
- `server/storage-reconciliation-audit.ts` implementa a persistência em `auditLogs` com `actorUserId` e `contactId` nulos, apropriados para uma execução de worker.
- O resumo é limitado a 500 caracteres e não inclui `referencedKeys`, nomes de arquivos, URLs, ETags ou payloads de provider.
- Falha de banco retorna `{ persisted: false }` quando a conexão não está disponível; o adapter real e a política de retry/alerta serão definidos antes de habilitar deleção fora de dry-run.

### O7.17 — Anti-replay de webhook

- O gateway envia `X-Webhook-Timestamp`, `X-Webhook-Nonce` e assina `timestamp.nonce.raw_body`.
- O Panel rejeita timestamp fora da janela, nonce inválido ou assinatura divergente antes de ingerir o evento.
- O nonce é persistido em `webhookEvents` com índice único por workspace/provider; duplicatas não voltam ao pipeline.
- Detalhes, limites de compatibilidade e evidências estão em [`O7.17-ENTREGA-ANTI-REPLAY-WEBHOOK.md`](./O7.17-ENTREGA-ANTI-REPLAY-WEBHOOK.md).

### O7.18 — Rate limiting distribuído

- Os fluxos de login, signup e recuperação de senha usam `securityRateLimitBuckets`.
- IP e e-mail são combinados e armazenados somente como SHA-256; o valor sensível não vai para a tabela.
- `INSERT ... ON CONFLICT DO NOTHING` com `SELECT ... FOR UPDATE` evita contagem divergente entre réplicas.
- O fallback local permanece apenas para sandbox/desenvolvimento sem `DATABASE_URL`; staging deve comprovar a rota distribuída.
- Detalhes estão em [`O7.18-ENTREGA-RATE-LIMIT-DISTRIBUIDO.md`](./O7.18-ENTREGA-RATE-LIMIT-DISTRIBUIDO.md).

### O7.19 — Segredo de webhook por instância

- `encryptedWebhookSecret` agora participa da validação do webhook Baileys.
- Instância com segredo próprio não aceita o segredo global, segredo genérico ou API key como bypass.
- `rotateBaileysWebhookSecret` gera e persiste um novo segredo criptografado, mas ainda não é exposto em mutação pública.
- A mutação `rotateBaileysWebhookSecret` atualiza Panel e gateway sem reiniciar a sessão; em falha, restaura o segredo anterior ou remove o segredo próprio.
- Detalhes estão em [`O7.19-ENTREGA-SEGREDO-WEBHOOK-INSTANCIA.md`](./O7.19-ENTREGA-SEGREDO-WEBHOOK-INSTANCIA.md).

### O7.20 — Revogação de sessões

- Logout autenticado agora chama `revokeUserSessions` antes de limpar o cookie.
- `sdk.authenticateRequest` já rejeita tokens cuja `sessionVersion` não coincide com `users.sessionVersion`.
- Troca de senha, reset por token e desativação de membro continuam usando o mesmo mecanismo.
- Detalhes estão em [`O7.20-ENTREGA-REVOGACAO-SESSOES.md`](./O7.20-ENTREGA-REVOGACAO-SESSOES.md).

### O7.21 — Fail-closed de segurança

- Política central em `server/_core/security-mode.ts`.
- Produção ativa o modo automaticamente; sandbox/testes continuam compatíveis sem a flag.
- Autenticação, limiter distribuído e revogação deixam de confirmar sucesso quando o backend persistente não responde.
- Detalhes estão em [`O7.21-ENTREGA-FAIL-CLOSED-SEGURANCA.md`](./O7.21-ENTREGA-FAIL-CLOSED-SEGURANCA.md).

### O7.22 — Retenção operacional

- Retém somente estados terminais; `pending`, `processing` e `received` ficam protegidos.
- Dry-run é o default; execução destrutiva exige `FORTE_OPERATIONAL_RETENTION_DRY_RUN=false`.
- Contagens por workspace vão para auditoria e os dados removidos são limitados por lote.
- Detalhes estão em [`O7.22-ENTREGA-RETENCAO-OPERACIONAL.md`](./O7.22-ENTREGA-RETENCAO-OPERACIONAL.md).

### O7.23 — Reconciliação de mídia no worker

- `runStorageReconciliationSweep` reaproveita o contrato de paginação, proteção temporal e etag.
- O worker chama o sweep diário, mas sem provider configurado o comportamento é no-op explícito e seguro.
- Métricas são redigidas e persistidas no audit log quando o provider estiver disponível.
- Detalhes estão em [`O7.23-ENTREGA-RECONCILIACAO-MIDIA-WORKER.md`](./O7.23-ENTREGA-RECONCILIACAO-MIDIA-WORKER.md).

### O7.24 — Quality gate final de CI

- `pnpm check:production-config` rejeita placeholders, banco ausente, fail-closed ausente e flags permissivas.
- PostgreSQL integration mantém serviço efêmero e falha se testes condicionais forem pulados.
- Publish image executa a mesma validação sintética antes dos builds.
- `CORE_ONLY_MODE` permanece ativo.
- Detalhes estão em [`O7.24-ENTREGA-QUALITY-GATE-CI.md`](./O7.24-ENTREGA-QUALITY-GATE-CI.md).

### O7.25 — Gate de restore rehearsal

- `pnpm verify:restore-rehearsal BACKUP_DIR` valida manifesto, hashes, `pg_restore --list`, tar de sessões e inventário de mídia.
- Pacotes sem evidência de mídia falham como inconclusivos.
- Nenhum restore, delete, cópia de sessão ou banco real é executado no Sandbox.
- Detalhes estão em [`O7.25-ENTREGA-RESTORE-REHEARSAL-GATE.md`](./O7.25-ENTREGA-RESTORE-REHEARSAL-GATE.md).

### O7.26 — Relatório de restore rehearsal

- `pnpm report:restore-rehearsal EVIDENCE.json REPORT.json` gera evidência privada e redigida.
- Falha de componente ou tráfego de produção resulta em `blocked`; ausência de evidência resulta em `inconclusive`.
- RPO/RTO, digests e contagens são registrados sem conteúdo sensível.
- Detalhes estão em [`O7.26-ENTREGA-RELATORIO-RESTORE-REHEARSAL.md`](./O7.26-ENTREGA-RELATORIO-RESTORE-REHEARSAL.md).

### O7.27 — Isolamento do restore rehearsal

- `pnpm check:restore-rehearsal-isolation EVIDENCE.json` roda antes de qualquer mutação.
- Endpoint produtivo, outbound, sessão reutilizada ou rollback ausente bloqueiam o ensaio.
- O script é somente avaliador; não faz rede nem altera serviços.
- Detalhes estão em [`O7.27-ENTREGA-ISOLAMENTO-RESTORE-REHEARSAL.md`](./O7.27-ENTREGA-ISOLAMENTO-RESTORE-REHEARSAL.md).

## Fila de coding

### C1 — Regressão de classificação HTTP da outbox

**Estado:** concluído nesta rodada.

Adicionar cobertura explícita para garantir que:

- `400–499`, exceto `408` e `429`, vão para dead-letter;
- `408 Request Timeout` continua retryável;
- `429 Too Many Requests` continua retryável;
- `5xx` e erros de rede continuam retryáveis;
- dead-letter não volta para a fila ativa.

Validação: 5 testes da outbox passaram; `npm run check`, `pnpm check` e `git diff --check` passaram.

### C2 — Auditoria de contratos e superfícies de operação

**Estado:** concluído nesta rodada.

Revisar contratos de `/ready`, snapshot de instância, outbox, documentação Docker, logs seguros e comandos de operação. Corrigir inconsistências somente quando houver teste ou evidência concreta.

Resultado: foi adicionada regressão HTTP garantindo que `/ready` preserve `webhookOutboxPending`, `webhookOutboxDeadLetter` e `webhookLastError`.

### C3 — Cobertura de falhas de restart e recuperação

**Estado:** concluído nesta rodada.

Adicionar testes determinísticos para restart com fila ativa, dead-letter existente e diretório ausente, sem alterar o volume real do usuário.

Validação: 6 testes da outbox e 16 testes HTTP do gateway passaram; typechecks do gateway e Panel passaram.

### C4 — Revisão final de integração

**Estado:** concluído nesta rodada.

Rodar a suíte completa, CI PostgreSQL, testes do gateway, build das imagens e smoke Docker. Consolidar falhas em uma lista única antes de refatorar.

Resultado: Panel `268 passed / 55 skipped`; gateway `76 passed`; typechecks e builds passaram; PR #32 tem CI PostgreSQL verde. Avisos observados: `OAUTH_SERVER_URL` ausente nos testes que apenas inicializam o adapter, testes persistentes explicitamente skipped e warning de bundle frontend acima de 500 kB.

## Fase final — Refatoração orientada por falhas

Executar somente depois de C1–C4:

- corrigir testes flakey/races;
- remover duplicação descoberta na auditoria;
- alinhar nomes e contratos;
- melhorar logs sem payload ou secret;
- atualizar documentação que contradiga o comportamento real;
- repetir todos os gates após cada correção.

**Não refatorar por preferência estética enquanto os gates ainda estiverem sendo descobertos.**

**Resultado desta rodada:** nenhuma falha funcional, race ou contrato contraditório foi encontrado; nenhuma refatoração corretiva foi aplicada. O warning de bundle e a configuração ausente de OAuth ficam registrados como itens operacionais separados, não como regressões desta fila.

## Gates de release que não são substituídos por coding

- staging persistente;
- restore em ambiente limpo;
- browser desktop/mobile e acessibilidade;
- revisão de tenancy, papéis e segredos;
- observabilidade externa;
- provider de billing real, se ativado futuramente;
- revisão legal e decisão explícita de release público.

## Histórico de execução

| Data | Item | Resultado |
|---|---|---|
| 2026-09-30 | O7.4 | ACK `202 ignored` para histórico não importável |
| 2026-09-30 | O7.5 | HTTP 4xx permanente em dead-letter |
| 2026-09-30 | O7.6 | `webhookOutboxDeadLetter` no snapshot |
| 2026-09-30 | Docker local | `connected`, `pending=0`, `deadLetter=5` após restart |
| 2026-09-30 | Smoke negócio | inbound e outbound: `eventos=1`, `entregues=1`, `falhas=0` |
