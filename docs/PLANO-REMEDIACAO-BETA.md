# Plano de remediação — beta segura do Forte Panel

**Base:** auditoria estática do commit `445d4cc2747366b3a27976ba0b0046e8fbba102c`, concluída em 2026-10-03.

**Estado:** remediações commitadas e publicadas em branch de handoff `integration/beta-candidate-2026-10-02` (`cdaa811`); `main` e GHCR `latest` permanecem intactos.
**Relatório completo:** [`AUDITORIA-BETA-COMPLETA-2026-10-03.md`](./AUDITORIA-BETA-COMPLETA-2026-10-03.md).

## Regra de trabalho

Trabalhar incrementalmente na candidata local. Não fazer uma reescrita total, não publicar GHCR, não mexer em Supabase, não executar migrations em dados reais e não testar com mensagens reais sem ambiente/número expressamente autorizado. Preservar `main`, a imagem GHCR principal e o script de reinstalação definidos pelo utilizador. A beta pública fica bloqueada até os gates reais passarem.

## Fase 0 — congelar promoção e estabelecer baseline (P0)

**Objetivo:** impedir perda de dados ou exposição enquanto os bloqueadores são corrigidos.

- Manter `publicSignup` fechado e os gates de controlled release fail-closed.
- Marcar explicitamente `0017` e `0043` como migrations bloqueadoras para dados pré-existentes até se testar o upgrade com fixtures representativas.
- Registar o SHA/digest da imagem e os resultados de cada ensaio; a tag operacional do utilizador não muda nesta fase.
- Executar baseline local isolado: `pnpm check`, suite unitária, suite PostgreSQL sem skips, build root e testes/check/build do gateway. Não usar serviços reais.

**Aceitação:** resultados guardados com SHA, versões e contagens; zero alterações fora da candidata; nenhuma publicação nem ligação a bases externas.

## Fase 1 — segurança multi-tenant e limites da API (P0)

**Prioridade máxima porque pode permitir acesso ou ação sobre outro workspace.**

1. Corrigir o IDOR do proxy de storage: autorizar a chave do objeto contra workspace/tenant da sessão, não apenas autenticar utilizador.
2. Vincular `instanceId` REST ao workspace autenticado/resolvido antes de enfileirar qualquer envio; recusar cross-tenant antes de criar side-effects.
3. Restringir operações de suporte/admin a uma `supportSession` válida; remover ou proteger rotas legadas que alteram tenant.
4. Corrigir exclusão de instância para que a autorização server-side prove ownership; nunca confiar no `instanceId` do cliente.
5. Corrigir SSRF no `baseUrl` LLM: allowlist/protocolo, bloqueio de redes privadas/metadata, validação de redirect/DNS e proteção da API key.
6. Corrigir fencing de leases de idempotência REST para que execução antiga não conclua depois de perder a lease; normalizar erros assíncronos das rotas Express 4 com `await`/wrapper seguro.
7. Limitar tamanho de body e frequência de endpoints públicos, autenticando webhook antes de processar payload grande; avaliar assinatura sobre bytes originais e CSRF/Origin.

**Aceitação:** testes negativos entre dois workspaces, testes de permissão por role/sessão, SSRF para loopback/metadata bloqueado, requests oversized/rate-limited rejeitados e nenhuma side-effect em caso de autorização falhada.

## Fase 2 — migrations, integridade e preservação dos dados (P0)

1. Corrigir `drizzle-pg/0017`: não depender de workspace `forte-demo`; backfill deve ser determinístico, tenant-aware, repetível e falhar com diagnóstico em ambiguidade, nunca atribuir dados a tenant arbitrário.
2. Rever `0043` (remoção/transformação de legado PAPI/Meta): desenhar conversão/arquivo reversível; não descartar dados sem backup e plano explícito.
3. Alinhar schema Drizzle, constraints SQL existentes e FK compostas que garantam `workspaceId` consistente nas tabelas operacionais.
4. Adicionar unicidade `(workspaceId,key)` a `workspaceSettings` com deduplicação segura antes de criar o índice.
5. Tornar migrations replay-safe; completar snapshots/journal e garantir que restore verifica alvo isolado antes de usar `--clean`.
6. Adicionar testes de upgrade com dados históricos sintéticos que representem ausência de demo, vários workspaces e duplicados, além do teste de DB vazio já feito.

**Aceitação:** migrations desde main com fixtures anteriores e posteriores, sem dados perdidos/órfãos/atribuídos ao workspace errado; segundo replay seguro; rollback/preflight documentado; zero interação com dados reais.

## Fase 3 — gateway Baileys, media e semântica de envio (P0/P1)

1. Bloquear `sendPayload` de contornar a política de media privada; validar URL/redirecionamentos e conteúdo antes de enviar.
2. Propagar a chave/MIME efetivamente lida pelo gateway; validar bytes/tipo real. Não declarar áudio arbitrário como OGG/PTT sem transcodificação real ou rejeição clara.
3. Não fazer download inbound ilimitado nem materializar buffers/base64 sem limites; usar streaming, limites de bytes e storage privado com lifecycle.
4. Corrigir `loggedOut` para encerrar/limpar state de forma explícita e exigir novo pairing sem destruir dados além do necessário.
5. Persistir `maxAttempts` do webhook outbox através de restart/flush e tratar receipts que chegam antes do ACK de forma durável.
6. Configurar `getMessage`/`msgRetryCounterCache` conforme o fluxo Baileys suportado; rever API deprecated e shutdown de handlers assíncronos.
7. Resolver interativos: não oferecer Carousel se não é enviado; persistir/normalizar respostas nativas; propagar erros upstream e receipts sem fingir sucesso.
8. Preservar distinção PN/LID/grupo; impedir envio “Todas” sem instância válida.

**Aceitação:** contratos de gateway por tipo de mensagem com responses/receipts persistidos; MIME falso, payload oversized e URL privada rejeitados; testes de restart/outbox e semântica de status visível na Inbox. E2E WhatsApp real só em número de teste controlado e autorizado.

## Fase 4 — filas, idempotência, quotas e recuperação (P1)

- Claimar mensagens outbound com lease/owner antes de consumir quota; quota deve ser idempotente por messageId.
- Garantir fencing de updates por owner e recuperação apenas de lease expirada; ensaiar queda em cada janela de envio.
- Documentar e testar garantia at-least-once/idempotência com ledger persistente; impedir escala horizontal do gateway enquanto não existir lease/fencing distribuído.
- Corrigir deduplicação de `historySync` e durabilidade de receipts.
- Remover Redis do Compose apenas se confirmação final de referências demonstrar que não tem consumidor; caso exista propósito de produto, documentar e testar o consumidor antes.

**Aceitação:** dois workers concorrentes, quota 1 e falhas/restarts sem consumo duplicado, mensagem perdida ou owner antigo a concluir; gateway singleton enforced ou coordenado.

## Fase 5 — fluxos de negócio e zero demo/mock no produto (P1)

- Corrigir transições impossíveis na Agenda e o limite dos modos semana/próximos.
- Manter leads visíveis com estágios customizados/legados; adicionar estado vazio/CTA ao Kanban.
- Implementar orçamento itemizado e validade configurável conforme promessa do produto, ou remover explicitamente essas promessas antes da beta.
- Garantir que pagamentos atualizam ledger/recibo de forma atómica e auditável.
- Remover seed/demo/mock do caminho do produto e do build de produção; manter fixtures apenas em suites automatizadas isoladas. Não usar contactos, mensagens ou media fictícios para validar a UI de produção.

**Aceitação:** fluxos CRM/agenda/orçamento/pagamento têm testes de contrato e browser com dados sintéticos isolados no ambiente de testes; banco limpo de beta inicia vazio, sem seed automático; UI tem estados vazios úteis.

## Fase 6 — UX, navegação e acessibilidade (P1/P2)

- Unificar allowlists de `CORE_ONLY_MODE`, sidebar e documentação, com teste de matriz das rotas autorizadas.
- Garantir foco, teclado, confirmação e retorno de foco nos diálogos de ações críticas.
- Só declarar clipboard copiado após sucesso; refletir queued/processing/sent/failed na Inbox.
- Preservar legendas de anexos no preview e adicionar feedback claro a uploads, áudio, pairing e erros Baileys.
- Completar testes de acessibilidade comportamental (nome acessível, foco, teclado, estados) além de snapshots/contratos estáticos.
- Testar desktop e mobile num browser real/automatizado autorizado; não inferir UX E2E de testes HTTP.

**Aceitação:** journeys de onboarding/inbox/agenda/criação de orçamento sem bloqueios de teclado, com estado vazio, loading e erro verificados; rotas core-only coerentes; zero falso “copiado/enviado”.

## Fase 7 — prontidão operacional e segurança de produção (P1)

1. Encriptar auth state Baileys por configuração obrigatória em produção. Definir rotação e processo de recuperação antes de tornar a chave mandatória para instalações com sessão já existente.
2. **Implementado localmente:** separar liveness de readiness; `/api/v1/ready` verifica DB, heartbeat do worker (healthy e não stale) e gateway Baileys conectado. QR/idle são estados não prontos e devolvem `503`.
3. **Implementado localmente:** healthchecks Compose para Panel/gateway, dependência do worker no gateway saudável e shutdown gracioso/drain para web e worker.
4. **Parcialmente implementado localmente:** `backup-restore.sh` inclui DB e sessão Baileys, exige a chave AES e regista apenas o seu fingerprint, com verificação de correspondência antes do restore destrutivo. `pnpm verify:media-backup` agora diferencia inventário de media de conteúdo exportado e prova de restore, verificando hashes SHA-256 reais. Faltam backup cifrado/off-host, blobs/media reais e rehearsal completo medindo RPO/RTO; o Forge actual só oferece presign PUT/GET.
5. **Parcialmente implementado localmente:** `backup-restore.sh retention BACKUP_DIR` configura `BACKUP_RETENTION_DAYS` (30 por defeito), lista manifestos expirados em dry-run e nunca apaga dados. A aplicação da retenção só deve ser desenhada após validar escopo, recovery e armazenamento off-host.
6. **Parcialmente implementado localmente:** convites funcionam com fallback explícito por link manual e providers HTTP transacionais são suportados quando configurados; recuperação de password agora falha fechado antes de emitir/persistir token se o provider não estiver pronto. Falta executar teste contra provider real ou manter a recuperação desativada na beta.
7. **Parcialmente implementado localmente:** `X-Request-Id` validado/gerado no Panel, proxy de storage com logs redigidos, heartbeat JSON do worker e transporte webhook externo opcional com payload allowlisted/redigido, timeout e autenticação. Falta ligar um sink autorizado em staging e provar alertas/deduplicação para readiness, DB, gateway, fila e storage, além de uma política operacional de retenção/alerta para o backend Forge/S3.
8. Validar config de produção no startup sem imprimir secrets; impedir `DEMO_MODE`/seed se a base for ambiente de produção.
9. Manter instalação do utilizador por `git pull` e pelo script oficial já acordado; o reset é sempre opção explícita e scoped à stack do Forte Panel.

**Aceitação:** ensaio de restart, perda de dependência, sessão cifrada, restore completo e alertas num staging isolado; os resultados incluem SHA/digest e evidências redigidas. Sem estes resultados, beta pública permanece bloqueada.

## Fase 8 — CI e qualidade (P1/P2)

- Fazer pull requests executar typecheck/build root, typecheck dos testes e suíte PostgreSQL obrigatória sem skips.
- Separar `test:unit` de `test:integration`; integração falha se não houver DB ou conexão.
- Acrescentar gate de advisories/vulnerabilidades com política de triagem e atualização controlada; não aplicar upgrades major automaticamente.
- Adicionar format check não mutante, lint com regras concretas e cobertura gradual nas áreas de auth, tenancy, webhooks e retries.
- Tornar E2E de browser/API e E2E Baileys com escopos separados e evidência no mesmo SHA/digest que se promove.
- Corrigir warning/config pnpm e tornar patch/override reproduzíveis em install limpo.

**Aceitação:** CI demonstra que erro de tipo, teste falhado, migration incompatível, skip de DB e advisory fora da política impedem o publish; build do digest promovido é o que foi verificado.

## Fase 9 — refatoração estrutural incremental (P2, após P0/P1)

- Extrair bounded contexts de `server/db.ts` e `server/routers.ts` (Inbox/outbox, domain events, CRM/pipeline, agenda/orçamentos, onboarding e plataforma), mantendo contratos públicos estáveis.
- Criar um único `BaileysGatewayClient` tipado e manter `WhatsappAdapter` como fronteira de domínio.
- Retirar Redis não utilizado apenas após provar que a stack funciona sem ele; não introduzir BullMQ nem outro broker sem necessidade medida.
- Evitar reescrita total: mover uma fronteira por vez com testes de contrato e observação do diff.

**Aceitação:** cada contexto tem testes próprios; dependências proibidas são verificadas automaticamente; nenhuma alteração de API/migration acompanha uma extração estrutural sem plano específico.

## Decisões que ficam deliberadamente por tomar

- Provider de email real vs. retirar temporariamente convites/reset por email da beta.
- Semântica exata de status QR/idle na readiness quando a instância ainda não foi emparelhada.
- Se a beta será privada/invite-only ou se se pretende abertura pública; em ambos os casos o gate atual não deve ser contornado.
- Política de conversão de dados históricos das migrations 0017/0043; não assumir que apagar ou reassociar dados é aceitável.

## Estado

**Execução na branch `integration/beta-candidate-2026-10-02`; base `cdaa811` publicada para handoff e continuação local `bb3fb0e`/`6ee474c`/`17b0b34`/`6a02133`/`eeaa6d5`, sem push/merge para `main` ou publicação de imagem.** As correcções abaixo foram implementadas e verificadas sem uso de Supabase, WhatsApp real ou Docker do utilizador:

| Item | Evidência actual | Estado |
|---|---|---|
| Fase 1.1 — IDOR do storage proxy | Key autorizada contra sessão/workspace e prefixo de tenant; imagens geradas passaram a usar caminho tenant-scoped; testes negativos de acesso cross-workspace e de assinatura sem membership. | Fechado localmente |
| Fase 1.2 — REST `instanceId` | Ownership validada antes de reservar idempotência/enfileirar; `queueOutboundMessage` e o worker revalidam workspace/instância. | Fechado localmente |
| Fase 1.3 — mutations administrativas de tenant | Lifecycle, plano e abertura/resolução de incidentes exigem sessão `operator` do mesmo `platformAdminId` e `workspaceId`; services repetem a validação e auditoria grava `supportSessionId`. O Kanban cria sessão de 5 minutos após confirmação do motivo. Teste PostgreSQL cobre ausência, read-only, workspace/admin divergentes e sucesso/auditoria. | Fechado localmente |
| Fase 1.4 — delete no console de suporte | A rota procura a instância activa no workspace interno antes de chamar o registry global; não mascara falhas, arquiva só após delete e regista audit scoped. Teste tRPC prova que ID estrangeiro não alcança o gateway e que o ID próprio é arquivado/auditado. | Fechado localmente |
| Fase 1.5 — SSRF de base URL LLM | HTTPS e hosts exactos permitidos, resolução DNS pública fixada no dispatcher, redirects bloqueados, timeout e resposta limitada; validação também nas gravações tRPC/admin. | Fechado localmente |
| Fase 1.6 — lease de idempotência REST | `claimToken` aleatório; complete/fail condicionados por token + `processing`; claims expiradas e handlers com erro passam a `indeterminate` em vez de reexecutarem efeitos. `pnpm db:reconcile:idempotency` lista claims read-only e só reabre uma claim exacta como `failed` com razão, `--confirm` e audit log, após verificação externa. | Fencing e ferramenta de reconciliação fechados localmente |
| Fase 1.7 — erros async Express 4 | As 17 callbacks async do router REST são envolvidas por `asyncRoute`; middleware devolve JSON 500 genérico; os seis `return idempotent(...)` sem await foram corrigidos. Oito testes provam respostas 500/sem leak e claim failed nas sete rotas idempotentes auditadas. | Fechado localmente |
| Fase 1.7 — limites de body/media e rate | Parser global reduzido a 1 MiB; webhook Baileys autenticado e limitado antes do parse (12 MiB), uploads existentes mantêm limites explícitos; media inbound limitada a 8 MiB no gateway por stream e na API; webhooks e receipts consomem quota `apiRequests` por workspace. Testes cobrem `413`, autenticação, 8 MiB e `429`. | Fechado localmente; sem smoke externo |
| Fase 1.8 — inbound genérico fora de Baileys-only | `/api/v1/webhooks/inbound/whatsapp` responde `404` permanentemente; o contrato e o teste negativo deixam apenas `/api/v1/webhooks/providers/baileys` como callback de entrada. | Fechado localmente |
| Fase 3.1 — contrato MIME/PTT outbound | `mediaMimeType` é a fonte canónica com `mimetype` de compatibilidade; áudio normal explicita `ptt: false` e gravação do microfone `ptt: true`; helpers cobrem MIME real e fallback. | Fechado localmente; sem smoke externo |
| Fase 2.1 — migration `0017` | Removido fallback `forte-demo`; inferência apenas com ownership determinística e falha diagnóstica em ambiguidade. Testes cobrem backfill single-tenant e bloqueio sem atribuição arbitrária. | Fechado localmente |
| Fase 2.2 — transição `0043` | Migration Baileys-only purga channels, instances, messages, settings e webhookEvents não-Baileys; preserva rows Baileys e fixa enum/check/default Baileys-only. Teste PostgreSQL confirma a purge e o inventário read-only reporta candidatos/credenciais sem expor valores. | Implementado localmente; aplicar só com backup/rollback |

## Validação da remediação local (2026-10-03)

- `pnpm check`: passou.
- Suite Vitest root contra PostgreSQL 16 local: **124 ficheiros / 455 testes passaram; sem skips**.
- `pnpm build` do painel: passou; permanece o aviso conhecido de bundle JavaScript principal com cerca de 1,1 MB minificado.
- Gateway Baileys: **18 ficheiros / 93 testes passaram, sem skips**; `npm run check` e `npm run build` passaram. O patch Baileys versionado foi aplicado apenas ao `node_modules` local para validar o teste histórico.
- Body/media/rate: testes focados de ingress, media e quota passaram (**3 ficheiros / 15 testes**); o parser global deixou 50 MiB e passou a 1 MiB, com webhook Baileys pré-autenticado a 12 MiB e media inbound limitada a 8 MiB descodificados.
- Migration `0043`: fixture temporário local com rows Baileys + não-Baileys confirmou purge das superfícies operacionais não-Baileys e preservação Baileys; a base temporária foi removida.
- Inventário WhatsApp: executado em `BEGIN READ ONLY`; agora reporta `purgeCandidates`/`purgeRequired` e nunca altera a base. Isto **não** é inventário da instalação do utilizador.
- Reconciliação idempotente: teste PostgreSQL cobre listagem workspace-scoped, transição única `indeterminate→failed`, bloqueio de segunda transição e audit log; CLI read-only devolveu zero claims na base local e recusou mutação sem `--confirm`.
- Gateway endpoint hardening: `/ready` anónimo devolve apenas estado mínimo, enquanto o inventário de instâncias exige API key; o parser JSON interno rejeita bodies acima de 1 MiB com `413` e não chama o manager. Regressões cobrem ambos os comportamentos.
- Auth state Baileys: `WHATSAPP_SESSION_ENCRYPTION_KEY` é obrigatória em produção, validada como chave AES de 32 bytes, exigida pelo Compose e pelo validator; o fallback `useMultiFileAuthState` continua disponível apenas fora de produção.
- Readiness/shutdown: testes focados **3 ficheiros / 20 testes** passaram; suite root completa **124 ficheiros / 455 testes**, build root e typecheck passaram. Probe local do bundle confirmou SIGTERM com drain do servidor HTTP.
- YAML Compose analisado; a CLI Docker não está instalada. Nenhum container ou volume Docker foi iniciado, parado, resetado ou alterado.

## Pendências e limite de segurança

Continuam abertos os itens restantes da Fase 1 (revisão dos demais endpoints), as outras migrations/dados, o transporte Baileys e os gates de operação listados acima. O parser JSON global foi reduzido para 1 MiB; o webhook Baileys usa 12 MiB apenas após pré-autenticação, a media descodificada fica limitada a 8 MiB e os anexos existentes têm excepções explícitas sem o antigo limite global de 50 MB. A `0043` purga dados não-Baileys por decisão explícita, mas o inventário local não prova o conteúdo da base real do utilizador.

A eliminação de dados PAPI/Meta/genericamente não-Baileys foi **escolhida no pedido do utilizador e implementada na migration `0043`**, mas não foi executada numa base real. Antes de aplicar o upgrade, guardar o inventário read-only, confirmar backup/rollback e rever o impacto da eliminação de mensagens pendentes, credenciais, settings e eventos de webhook não-Baileys. Nenhuma publicação fica autorizada por este documento.
