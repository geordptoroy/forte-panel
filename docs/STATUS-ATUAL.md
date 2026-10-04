# Estado atual — Forte Panel

**Atualizado:** 3 de outubro de 2026, 13:49 (UTC−3)
**Repositório:** `geordptoroy/forte-panel`  
**Estado:** candidata de remediação publicada numa branch de handoff; **não integrada em `main` nem publicada como release/imagem**.
**Continuação local:** commits `bb3fb0e` (limites), `6ee474c` (webhook genérico encerrado), `17b0b34` (guard de media outbound), `8e8c1bd` (contrato MIME/PTT), `6a02133` (purge Baileys-only), `eeaa6d5` (reconciliação idempotente auditável), `a896dbd` (readiness/body do gateway), `bdeff4b` (evidência fail-closed de backup de media), `0a190fb` (documentação de operação), `6582607` (reset de password fail-closed) e `87dfaac` (sink operacional opcional); sem push nesta sessão.

## Git e decisão de integração

| Referência | SHA observado | Estado |
|---|---|---|
| `origin/main` | `f67548570f44b8c8fe79082911d7de557a8a3650` | Base canónica observada antes da candidata; confirmar de novo antes de promover. |
| `origin/feat/o7.15-storage-reconciliation-observability` | `61d8a13703b3146727987b6f00b34785bfdcfb87` | Linha de desenvolvimento que está a ser reconciliada localmente com a main. |
| PR #3, `docs/ai-admin-core-plan-2026-09-27` | `d90bba2edc6601e73db9bd18601b9d97a2b2bef4` | Auditoria concluída: **não integrar a ref inteira**. As capacidades Baileys principais já estão em main/O7; a arquitetura multi-canal antiga não faz parte do produto. |
| Base da candidata | branch `integration/beta-candidate-2026-10-02`, commit de remediação `cdaa811ec47243ad17fc2ab24c45b17421329a4f` | Junção main+O7 originalmente auditada em `445d4cc`; remediações validadas e commitadas/pushadas para a branch de handoff. `main` continua em `f67548570f44b8c8fe79082911d7de557a8a3650`. |

**Conclusão da auditoria:** main+O7 já contém o modelo multi-instância Baileys, pairing/readiness, polling de estado, CRUD, settings/profile, integração REST opt-in e os gates mais recentes. As migrations 0038/0039 do PR são byte-a-byte iguais às refs atuais; o candidato conserva também as migrations 0040–0044 de main e 0045–0058 de O7. A ref antiga do PR carrega uma arquitetura multi-canal fora do escopo e uma UI alternativa que remove settings/profile e o atalho Inbox; trazer a branch inteira é regressivo e conflitante. Nenhuma alteração do PR #3 foi copiada.

O possível conflito de nonce foi revisto: o gateway gera nonce aleatório com 18 bytes (144 bits), e a aplicação usa um segredo global de assinatura; a unicidade por workspace/provider é intencional para detetar replay independentemente da instância. Não foi feita alteração ao índice.

Foi publicado o commit `cdaa811` apenas em `integration/beta-candidate-2026-10-02` para permitir continuação por outra IA. A candidata foi posteriormente actualizada até `84bed77` apenas nessa branch para o dispatch autorizado do Actions; não houve merge para `main`, publicação GHCR, acesso ao Supabase, reset Docker nem teste contra a instância real do utilizador. PR #3 permanece sem alteração remota.

## Alterações feitas apenas na candidata

- Restaurada a relação `appointments.quoteId` no schema e no contrato REST, com migration PostgreSQL aditiva 0059.
- Corrigida a corrida do webhook outbox e adicionada cobertura determinística.
- Atualizados contratos de testes que pertenciam à API anterior; bloqueada a criação de dados demo em produção e removido o endpoint público de seed da Inbox.
- Compose local alinhado às imagens operacionais GHCR `:latest`; workflow de publicação restringido à `main` e sem tag `:dev`.
- Script de atualização consolidado: modo normal preserva volumes; reset elimina apenas os recursos/dados da stack Forte Panel. Os restantes projetos Docker ficam preservados. O nome antigo `dev-reinstall.ps1` é um alias.
- Criados `AGENTS.md` e o procedimento único de desenvolvimento/release.
- Removidas variáveis Meta dos exemplos de ambiente, atualizado o contrato/escopo para Baileys-only e generalizada a deteção de nomes de credenciais.
- Normalizados avisos de documento histórico nos planos, prompts, handoffs e auditorias antigas. As menções remanescentes à PAPI estão limitadas à regra explícita de escopo e a referências de engenharia; não há uso no runtime nem nos exemplos de ambiente.
- Reduzido o parser JSON global para 1 MiB, com limites de rota explícitos para o webhook Baileys (12 MiB), voz de onboarding (24 MiB) e uploads de anexos (12 MiB), preservando os contratos de anexos existentes.
- Adicionado pré-parser do webhook Baileys que rejeita `Content-Length` excessivo e exige segredo/API key antes de materializar o JSON; o gateway envia também `X-Webhook-Instance-Id` para resolver o segredo por instância antes do parse, mantendo a assinatura HMAC após o parse.
- Limitada a media inbound Baileys a 8 MiB descodificados: o gateway lê por stream com bound, o schema limita a data URL/base64 e o storage não aceita configuração acima desse tecto. Webhooks de eventos Baileys e receipts passam a consumir a quota `apiRequests` do workspace e devolvem `429`/`Retry-After` quando esgotada.
- Encerrado permanentemente com `404` o endpoint REST genérico `/api/v1/webhooks/inbound/whatsapp`; o único contrato de inbound activo é o callback autenticado `/api/v1/webhooks/providers/baileys`, eliminando a segunda superfície de ingestão fora da policy Baileys-only.
- Fechado o bypass de media no endpoint gateway `/send`: o ramo `payload` arbitrário agora inspecciona recursivamente campos `image`/`audio`/`video`/`document`/`sticker`, rejeita referências privadas e formas binárias não limitadas antes de chamar o manager, preservando URLs HTTPS permitidas e data URLs bounded.
- Corrigido o contrato MIME/PTT outbound: `mediaMimeType` é a fonte canónica (com `mimetype` apenas como compatibilidade), ficheiros áudio normais usam `ptt: false` e gravações do microfone usam `ptt: true`; testes cobrem WebM/Opus, OGG e fallback MIME.
- Adicionada ferramenta `pnpm db:reconcile:idempotency`: listar claims `indeterminate` é sempre read-only; reabrir como `failed` exige workspace/chave exactos, razão, `--confirm`, verificação externa prévia e escreve audit log. A ferramenta não marca `completed` automaticamente.
- Endurecido o gateway Baileys: `/ready` anónimo continua adequado a probes, mas devolve apenas `status/service`; inventário, erros e estado de instâncias exigem API key. O parser JSON interno rejeita bodies acima de 1 MiB com `413` antes de chamar o manager.
- Fechado o fallback plaintext em produção: `WHATSAPP_SESSION_ENCRYPTION_KEY` exige 32 bytes AES-256-GCM no arranque do gateway, é obrigatória no Compose e no validator de produção; o fallback `useMultiFileAuthState` permanece apenas para desenvolvimento/testes.
- Readiness operacional separado de liveness: `/api/v1/health` continua a medir processo, enquanto `/api/v1/ready` exige DB saudável, heartbeat do worker não stale/healthy e gateway Baileys operacional/conectado; a resposta expõe cada check sem segredos.
- Adicionados healthchecks Compose para Panel e gateway, dependência do worker no gateway saudável e shutdown gracioso: o Panel drena ligações HTTP até 10 s e o worker interrompe o sleep, aguarda o tick corrente e termina limpo em SIGTERM/SIGINT.
- Reforçado `scripts/backup-restore.sh`: backup/restore exigem `WHATSAPP_SESSION_ENCRYPTION_KEY`, guardam apenas o fingerprint SHA-256 da chave no manifesto e recusam restore antes de `pg_restore` quando a chave não corresponde; o segredo nunca é escrito no backup.
- Adicionado `scripts/backup-restore.sh retention BACKUP_DIR`: calcula candidatos por `created_at` e `BACKUP_RETENTION_DAYS` (30 por defeito), imprime apenas um plano de retenção e não remove ficheiros; a aplicação destrutiva continua deliberadamente fora do runtime até haver validação operacional.
- Endurecido o caminho de blobs: o adapter rejeita traversal, separadores/bytes de controlo, encoding de traversal e chaves acima de 512 caracteres; o proxy de media não regista corpos de erro do backend e inclui apenas `requestId`, nome do erro e status.
- Adicionado `X-Request-Id` validado ou gerado no arranque HTTP do Panel, permitindo correlação segura sem aceitar newline/header injection; o worker já mantém heartbeat JSON com estado redigido por nome de erro.
- Adicionado `pnpm verify:media-backup INVENTORY.json`: valida o inventário tenant-scoped, exige exportação de conteúdo e prova de restore com hashes SHA-256 reais para declarar `restore_proven`; com o adapter Forge actual, o resultado explícito é `inventory_only` e exit code não-zero.
- Adicionado transporte opcional `FORTE_OBSERVABILITY_WEBHOOK_URL`/`FORTE_OBSERVABILITY_WEBHOOK_TOKEN`: exporta apenas heartbeat/falhas agregadas do worker, com payload allowlisted, limites, timeout de 2 s, autenticação Bearer e redacção; fica inactivo sem configuração e exige HTTPS/token no validator de produção.
- O proxy autenticado `/manus-storage/*` agora consome a quota `apiRequests` do workspace depois da validação de tenant/key, expõe `X-RateLimit-*` e devolve `429`/`Retry-After` sem pedir presigned URL ao backend quando a quota está esgotada.
- Os workflows `publish-image` e `postgres-integration` agora passam `DATABASE_URL`, `JWT_SECRET` e todas as credenciais sintéticas Baileys ao validator de produção; o CI deixa de passar sem validar o contrato do único provider. Ambos mantêm o bloqueio de testes skipped. A tentativa de mover a configuração pnpm foi revertida porque removia o patch Wouter do lockfile; o warning de configuração pnpm permanece pendente.
- O callback OAuth agora rejeita `code`/`state` acima de 4096 caracteres antes do exchange, mantém o guard de nonce/cookie e redige o erro para apenas nome/classe no log. Foram adicionados testes para payload oversized e state sem cookie; não há contacto com o provider OAuth nos testes.
- O Compose operacional/local aceita `FORTE_PANEL_IMAGE` e `FORTE_WHATSAPP_IMAGE` para pinagem por tag `sha-*`, mantendo `:latest` apenas como default. `start-docker.ps1` faz `pull` antes do reset destrutivo e aborta sem apagar volumes se a imagem não existir; o procedimento completo está em `docs/TESTE-LOCAL-RESET-E-IMAGEM-PINADA.md`.
- O dispatch autorizado `publish-image` `37149066623` foi executado na candidata `84bed77`, mas falhou antes da publicação porque três suites de integração ainda usavam `provider: "test"`, rejeitado pela constraint Baileys-only `webhook_events_operational_provider_check`. Os fixtures foram corrigidos para `provider: "baileys"`; a validação local posterior passou com **129 ficheiros / 474 testes**, root build, Gateway check e Gateway build verdes. É necessário repetir o Actions antes de obter imagens GHCR.

## Autoridade documental

Para esta candidata, a ordem é: `AGENTS.md` (regras da IA) → `docs/STATUS-ATUAL.md` (estado e decisões) → `docs/WORKFLOW-DESENVOLVIMENTO-E-RELEASE.md` (processo). Os handoffs, prompts, `todo.md`, fonte de verdade e relatórios com o banner **DOCUMENTO HISTÓRICO** preservam o passado; não se devem executar neles branches, tags `:dev`, comandos ou próximos passos antigos.

O utilizador confirmou em 2026-10-02/03: **Baileys é o único canal/provedor do produto**; PAPI é apenas referência de engenharia e Meta não faz parte da aplicação. A migration `0043` purga rows, credenciais/configuração operacional, mensagens e eventos de webhook não-Baileys, preservando apenas Baileys. Não reintroduzir adapters, configurações ou opções de outros canais; qualquer mudança de UX deve preservar os contratos atuais.

## Auditoria beta completa — 2026-10-03

Auditoria read-only de 10 domínios no commit `445d4cc2747366b3a27976ba0b0046e8fbba102c`: **94 achados (2 critical, 38 high, 41 medium, 13 low)**. Ver [`docs/AUDITORIA-BETA-COMPLETA-2026-10-03.md`](./AUDITORIA-BETA-COMPLETA-2026-10-03.md) e o roteiro [`docs/PLANO-REMEDIACAO-BETA.md`](./PLANO-REMEDIACAO-BETA.md). O achado crítico de migration `0017` exige fixtures com dados legados; o gate de lançamento público continua corretamente fechado até existirem as oito evidências reais. A auditoria não alterou código, não usou Supabase nem publicou imagens.

## Validação já concluída

| Verificação na candidata | Resultado |
|---|---|
| PostgreSQL local descartável, versão 16 | **61 migrations** numa base vazia; upgrade `main`→candidata aplicou 45 + 16 migrations com sucesso. |
| `pnpm check` | Passou. |
| Regressões focadas após generalizar a deteção de credenciais | **4 ficheiros / 18 testes passaram** (`platform-admin`, `secret-safety`, `baileys-policy`, `message-routing`). |
| Procura de providers no runtime/env e links do índice | **Zero referências operacionais/variáveis antigas; 17 links documentais válidos.** Testes negativos continuam a provar que valores legados são rejeitados. |
| Segurança P0 e regressões de tenancy | Storage proxy, REST/queue e SSRF têm guards; `setWorkspaceLifecycleStatus`, `setWorkspacePlan` e mutations de incidentes exigem sessão operadora do admin/workspace correctos e registam `supportSessionId`; o Kanban inicia sessão curta antes de suspender/reativar. O delete Baileys prova ownership; `0017` remove o fallback `forte-demo`; `0060` aplica fencing REST fail-closed. |
| Migration 0043 e preflight | **Purge explícito de superfícies não-Baileys**; teste PostgreSQL confirma remoção de channels/instances/messages/settings/webhookEvents não-Baileys, preservação Baileys, enum/check/default Baileys-only e inventário read-only reporta candidatos sem revelar valores. |
| Express 4 async REST | 17 callbacks async protegidos por `asyncRoute`; erros não tratados devolvem JSON 500 genérico; as 6 rotas idempotentes passaram a `return await`; 8 regressões cobrem 7 endpoints e claim failed. |
| Suite root com `DATABASE_URL` local | **128 ficheiros / 472 testes passaram** na execução completa no SHA actual; sem skips nesta execução. |
| Validator de configuração de produção | Passou com configuração sintética segura; sem credenciais reais. |
| `pnpm build` do painel | Passou; emite aviso de bundle JavaScript principal com cerca de 1,1 MB (minificado). |
| Gateway Baileys | Replay exacto do job CI com `npm ci` (scripts activos para aplicar o patch Baileys): **18 ficheiros / 93 testes passaram**, sem skips; `npm run check` e `npm run build` passaram. `npm ci --ignore-scripts` foi testado apenas como diagnóstico e falhou no teste do patch, como esperado; não houve alteração do lockfile. |
| Gateway Baileys — media/MIME/PTT | `sendPayload` já não contorna a política de media; `mediaMimeType` e PTT são preservados até ao payload Baileys; **18 ficheiros / 91 testes** passaram, com check/build verdes. |
| Preflight de restore/rehearsal | **5 ficheiros / 12 testes passaram**; pacote, hashes, isolamento, endpoint de produção e decisão fail-closed foram verificados com fixtures sintéticas. |
| Compose | YAML analisado com Prettier; `docker compose config` não pôde ser executado porque a CLI Docker não está instalada neste sandbox. Nenhum container/volume foi iniciado ou alterado. |
| Workflow de publicação | YAML validado; `main` apenas, migrations PostgreSQL e zero-skips antes de `publish`. Ainda não executado no GitHub. |
| Replay local do job `verify` após hardening CI | Migrations PostgreSQL locais aplicadas, suite root **128/472 sem skips**, validator Baileys-only, check/build root e gateway verdes. `pnpm install --frozen-lockfile` passa, mas mantém warning de configuração `pnpm` obsoleta no `package.json`; a tentativa de migração foi revertida para preservar o patch Wouter. |

A suite root também passou sobre a base atualizada de 45 migrations da `main` para 61 da candidata. A base era descartável e não continha dados de negócio; isto prova compatibilidade do SQL de upgrade, **não** preservação de dados reais existentes. Os testes não cobriram WhatsApp real, browser do utilizador, envio de mensagens, Supabase nem imagem Docker executada.

## Pendências antes de promover

1. Completar a Fase 1: o tratamento async Express 4, os limites de body/rate, o encerramento do endpoint REST genérico e a ferramenta de reconciliação idempotente estão implementados e testados; segue-se a revisão dos restantes endpoints. O gate de supportSession para status/plano/incidentes está implementado e testado. O fencing REST da `0060` falha fechado em resultado ambíguo.
2. A `0017` foi corrigida e testada. A `0043` agora aplica a decisão explícita Baileys-only: elimina rows/configuração/eventos/mensagens tagged com provider não-Baileys durante o upgrade. O inventário read-only deve ser guardado antes de aplicar a migration real; não executar este upgrade no ambiente do utilizador sem backup/rollback validado.
3. Resolver os demais high de segurança e transporte Baileys, inclusive encriptação de auth state e semântica real de queued/sent/failed; o guard de media outbound e os limites de media/body estão fechados localmente, sem smoke de imagem ou WhatsApp real.
4. Fechar os gates de dados e operação: backup/restore completo, readiness, shutdown, email real ou promessa removida, observabilidade e staging controlado.
5. **Gate local repetido no SHA actual:** typecheck, suite root PostgreSQL sem skips, suite Gateway sem skips, builds e validator de produção passaram. Falta executar workflow/staging autorizado no mesmo SHA/digest.
6. Manter `publicSignup` fechado até as oito evidências do controlled release estarem comprovadas. Nenhum commit de promoção em `main`, publicação GHCR ou alteração da instalação Docker foi feito.

## Próxima ação

**Próximo passo:** executar staging controlado e workflow autorizado com o mesmo SHA/digest, incluindo restore completo de DB/sessão/blobs, smoke de readiness/restart, sink de alertas autorizado e evidências redigidas. O preflight local está verde e o smoke sem `STAGING_BASE_URL` falha correctamente com exit code 2. A execução real permanece bloqueada: este Sandbox não tem Docker, URL de staging nem secrets de staging. A candidata não é release beta pública, não deve ser instalada no ambiente do utilizador e não houve push/merge/publicação.

## Investigação de interactive messages — 2026-10-03

- A auditoria `docs/AUDITORIA-REVERSA-PAPI-1.5.1-PARA-FORTE.md` confirma `relayMessage({ interactiveMessage })` para botões modernos, `relayMessage({ listMessage })` para listas legadas e `sendMessage({ poll })` para enquetes. A PAPI é apenas referência de engenharia; não é dependência do produto.
- Na stack Docker local, 5 mensagens `button` ficaram `outbound/sent` com `externalId` e sem `lastError`; isto prova apenas aceitação local do Baileys, não entrega nem renderização no telemóvel. Os logs não tinham erro específico de interactive message; houve erros de reconexão `408/515` e `PayloadTooLargeError` separado, relativo a body grande.
- A candidata `fix/interactive-buttons` alinha as opções de `relayMessage` com a chamada auditada (`{}`), regista de forma sanitizada a aceitação/receipt e acrescenta round-trip protobuf do envelope directo. Testes focados (46), check e build do Gateway passaram; a suite completa teve uma falha ambiental Windows no modo `0o700` de `session-lock.test.ts` (17/18 ficheiros, 93/94 testes).
- Não foi feito envio físico adicional, nem alterada a sessão WhatsApp, até existir número de teste dedicado e autorização específica.

## Requisitos futuros confirmados — autenticação por WhatsApp

- Substituir o login principal por email por login através do **número de WhatsApp** associado à conta.
- No recuperador de conta, enviar o código de verificação pela **instância Baileys disponível e seleccionada no Console Admin**, com auditoria da instância, workspace e administrador responsável.
- Tratar esta mudança como backlog de produto: ainda não alterar o login, password reset, modelo de conta, UI ou contratos de API.
- Antes da implementação, definir número normalizado, posse/verificação do número, expiração e limite de tentativas do código, fallback operacional e comportamento quando não houver instância disponível.

## Actualização local da imagem — 2026-10-03

- A publicação de `main` terminou com sucesso, mas a primeira tentativa de actualizar apenas o Gateway revelou que `docker-compose.local.yml` não passava `WHATSAPP_SESSION_ENCRYPTION_KEY` ao container, embora a chave já existisse no `.env`.
- O Gateway foi revertido imediatamente para `ghcr.io/geordptoroy/forte-whatsapp:sha-06cc98e`, mantendo o volume `forte-panel-repo_forte_whatsapp_sessions`; readiness voltou a `{"status":"ready","service":"forte-whatsapp"}`.
- O Compose foi corrigido para exigir e passar a chave existente. A nova imagem ainda requer uma nova publicação antes de repetir a actualização. O storage SeaweedFS continua separado da stack principal e não foi alterado.


## Execução local — PN→LID e fallback Native Flow — 2026-10-04

- Implementado `resolveOutboundJid` em `forte-whatsapp/src/jid-resolution.ts`:
  - preserva JIDs explícitos, incluindo `@lid`;
  - consulta `signalRepository.lidMapping.getLIDForPN` do Baileys v7;
  - usa `getUSyncDevices` como best-effort para preencher o mapping PN→LID quando ainda não existe;
  - só recua para `@s.whatsapp.net` quando o Baileys não consegue obter um LID.
- `sendMessage` e `sendPayload` passaram a usar a resolução automática antes de `sendMessage`/`relayMessage`.
- Native Flow `button` e `list` passaram a enviar fallback textual numerado automaticamente, porque o protocolo não fornece um receipt que indique se o cliente conseguiu renderizar a interface. O fallback é enviado como texto normal e mantém as opções utilizáveis.
- Corrigido `session-lock.ts`: `ws1` e `ws4` partilham o mesmo processo Node/PID dentro do container; o lock agora usa um conjunto de owners activos no processo e trata lock com PID Docker reutilizado de processo anterior como stale, sem apagar credenciais.
- Gateway local reconstruído como `forte-whatsapp:local-lid-fallback`, com volume `forte-panel-repo_forte_whatsapp_sessions` preservado. Health `/health` OK; `ws1` e `ws4` voltaram a `Baileys session is open`.
- Validação de código:
  - `npm run check`: passou;
  - `npm run build`: passou;
  - `src/jid-resolution.test.ts`: 4 testes passaram;
  - `src/interactive-payload.test.ts`: 3 testes passaram;
  - suite completa: 97/98 testes passaram; a única falha foi `session-lock.test.ts` na expectativa Unix `0o700` para permissões de directório, recebendo `0o666` no filesystem Windows local — falha ambiental pré-existente, não relacionada à lógica PN→LID.
- Teste real autorizado para `236450952020113@lid`, instância `ws4`:
  - `TESTE 21` botão Native Flow: `3EB0BC1D1218997299773E`, aceite por `relayMessage` e `delivered`;
  - fallback do teste 21: `3EB078AD34906B750D5D6A`, aceite por `sendMessage`;
  - `TESTE 22` lista Native Flow: `3EB07ABB0673CC3FFE8751`, aceite por `relayMessage` e `delivered`;
  - fallback do teste 22: `3EB0D9DE76E8A5E78CF049`, aceite por `sendMessage`.
- Confirmação visual do utilizador por captura: os dois Native Flow (`button` e `list`) continuam a aparecer como **“Não foi possível carregar a mensagem. Use seu celular para acessá-la”**; os dois fallbacks numerados aparecem correctamente com as opções `1` e `2`. Portanto, para a beta, texto numerado é o caminho funcional; Native Flow permanece experimental.
- Não publicar ainda em `main`/GHCR: a alteração está validada localmente no worktree `forte-panel-button-fix` e requer revisão/integração pelos gates definidos em `AGENTS.md`.


## Commit e preparação do GHCR — 2026-10-04

- Correção multiplataforma do teste `session-lock.test.ts`: Linux/macOS continuam a exigir `0o700`/`0o600`; no Windows, onde `fs.stat().mode` não representa ACLs como bits POSIX, o teste valida acesso/existência e a atomicidade/libertação do lock. A implementação continua a executar `chmod`.
- Commit local criado: `898a20b fix: resolve LID recipients and fallback interactive messages`.
- Gateway final: **19 ficheiros / 98 testes passaram**, `npm run check` e `npm run build` passaram.
- Root: `corepack pnpm check` e `corepack pnpm build` passaram. A suite root no Windows executou **96 testes passados / 75 skipped / 10 falhas ambientais**, causadas por ferramentas Unix ausentes ou incompatíveis (`sha256sum`, `find`, `bash` com paths Windows) nos testes de backup/restore; isto será revalidado no runner Linux do workflow GHCR. Não houve falha nos testes relacionados com LID, Native Flow ou lock.
- O push autorizado deve ser feito sem force-push para `main`; o workflow `.github/workflows/publish-image.yml` publica apenas após o verify Linux completo e mantém os caminhos `ghcr.io/geordptoroy/forte-panel:latest` e `ghcr.io/geordptoroy/forte-whatsapp:latest`.
- Próximo chat: confirmar o SHA de `main`, o resultado dos jobs `publish-image`/PostgreSQL e os digests GHCR antes de orientar `git pull`/`scripts/start-docker.ps1`.


## Estado após push para main — 2026-10-04

O commit de código `6b9ea814e8bd656b318ab82bd1a84429c927c789` foi enviado com sucesso para `origin/main` por fast-forward (`172f265..6b9ea81`), sem force-push. O workflow `publish-image.yml` deve agora executar o verify Linux e, se todos os gates passarem, publicar `ghcr.io/geordptoroy/forte-panel:latest` e `ghcr.io/geordptoroy/forte-whatsapp:latest`. O GitHub CLI não está instalado neste Windows, portanto o próximo chat deve consultar os jobs e digests no GitHub antes de anunciar a publicação ou atualizar o Docker local. A suite root local teve apenas as limitações Windows documentadas acima; o runner Linux é a validação autoritativa para os testes que dependem de `bash`, `find` e `sha256sum`.


## Candidata PAPI-compatível para interactivos — 2026-10-04

- Worktree isolada: `C:\Users\Rafae\Desktop\forte-panel-papi-fix`, branch `fix/papi-compatible-interactives`, baseada em `origin/main` no SHA `6bbfa29`; candidata local, sem push, merge ou GHCR.
- Listas passaram de Native Flow `single_select` para o envelope legado `listMessage`, enviado por `relayMessage`, conforme a auditoria da PAPI. O fallback textual da lista foi mantido.
- Carrosséis passaram a aceitar `metadata.cards` (2 a 10 cartões), preparar imagem/vídeo por `prepareWAMessageMedia` com `waUploadToServer`, montar `interactiveMessage.carouselMessage` com `messageVersion: 1` e acções Native Flow por cartão. Payload protobuf já preparado continua aceite.
- Foi acrescentado fallback textual numerado para carrossel e testes de serialização/preparação de mídia.
- Gateway: **19 ficheiros de teste / 99 testes passaram**, `npm run check` e `npm run build` passaram.
- Root: `corepack pnpm check` e `corepack pnpm build` passaram. A suite root no Windows continua com **96 testes passados / 75 skipped / 10 falhas ambientais** por `sha256sum`, `find` e `bash` incompatíveis com paths Windows; nenhum erro está relacionado com esta alteração. Deve ser revalidada no runner Linux.
- Os containers `forte_whatsapp`, `forte_whatsapp_disposable`, `forte_panel` e `forte_panel_worker` não foram reiniciados nem alterados.
- Próxima acção: revisão do diff e, se autorizado separadamente, teste real controlado no cliente móvel com número de teste dedicado; não declarar renderização universal no WhatsApp Web.


## Teste real no container candidato — 2026-10-04 01:40

- O container `forte_whatsapp_disposable` foi substituído temporariamente por `forte-whatsapp:local-papi-test`, mantendo a sessão persistida `papi-envelope-test`; o container principal `forte_whatsapp` não foi alterado.
- O envio de botão para o LID confirmado foi aceite pelo Baileys (`3EB04353D0823CCD6A112D`) e recebeu estado `delivered`. O fallback textual também foi entregue (`3EB0846C1279D2C811B35D`), comportamento esperado pela estratégia de compatibilidade.
- O envio de lista legada foi aceite inicialmente (`3EB0ED75B0A393838DF3B9`), mas o log recebeu ACK WhatsApp `405`. O fallback textual foi entregue (`3EB0620764333EA30D655C`). Portanto, neste ambiente o envelope nativo de lista ainda não está comprovadamente renderizável; o caminho funcional permanece o fallback.
- As duas tentativas anteriores com 404 foram falhas de rota/configuração do ID persistido (`disposable-papi-test` vs `papi-envelope-test`) e não transmitiram mensagens.


## Teste fork wire sem fallback — 2026-10-04 01:49

- Foi adicionada a injecção de nós observada nos forks activos: `biz` com `interactive/native_flow` v1/v9 e `bot{biz_bot:1}` em chats privados; listas usam o nó `list v2/product_list`.
- A variante foi validada com **102 testes**, typecheck e build, e activada apenas em `forte_whatsapp_disposable` como `forte-whatsapp:local-papi-wire`.
- Foi enviado ao destino fornecido pelo utilizador (`55999034689`) um único botão `Teste PAPI wire - botao`, com `Sim`/`Nao`, sem fallback. O Baileys aceitou o envelope com ID `3EB0B3AA90886E20C838FD`. Até à última consulta não apareceu ACK `delivered` nem erro de ACK; renderização final depende da confirmação no dispositivo destinatário.


## Texto simples para diagnóstico de destino — 2026-10-04 01:50

- Foi enviado `Teste de texto simples do Forte Panel` para `55999034689` pelo endpoint normal `send-text`.
- O Baileys aceitou o envio com ID `3EB0E0CAECF02A8C5A7041`, mas não apareceu ACK de entrega nem erro no período de observação. Como o texto simples também não confirmou entrega, o problema neste destino não pode ser atribuído apenas ao Native Flow; o número deve ser confirmado no formato internacional completo e/ou pode não estar registado no WhatsApp.


## Teste texto com número completo — 2026-10-04 01:51

- Foi enviado `Teste de texto simples do Forte Panel` para `+5538999034689`.
- O Baileys aceitou o envio com ID `3EB0372927AF7146EABA2A`, mas não recebeu ACK de entrega durante a janela de observação. O botão wire não foi repetido, porque o diagnóstico base — texto simples — ainda não foi confirmado no destinatário.


## JID directo entregue — 2026-10-04 01:55

- Foi enviado `Teste de texto simples do Forte Panel` usando directamente `553899034689@s.whatsapp.net`.
- O Baileys aceitou com ID `3EB0C2C0B43946CD6D6BCB` e recebeu ACK `delivered`.
- Isto confirma que a sessão está conectada e que o destino correcto é `553899034689@s.whatsapp.net`; os testes anteriores falharam por usarem `5538999034689` (um dígito extra) e `55999034689` (incompleto).


## Quatro botões wire entregues — 2026-10-04 01:59

- O contrato do Gateway foi ampliado de 3 para 10 botões e o resolvedor passou a tentar as variantes brasileiras com e sem o nono dígito.
- Foi enviado, sem fallback textual, `Teste PAPI wire - quatro botoes` para `553899034689@s.whatsapp.net`, com `Opcao 1`, `Opcao 2`, `Opcao 3` e `Opcao 4`.
- O envelope foi aceite e recebeu ACK `delivered`: `3EB099594CBFAC4AC5717C`.


## Lista Native Flow e carrossel entregues — 2026-10-04 02:02

- A rota de lista foi ajustada para usar `interactiveMessage.nativeFlowMessage` com botão `single_select`, em vez do `listMessage` legado que tinha recebido ACK 405.
- Foi enviada a lista `Teste PAPI wire - lista` para `553899034689@s.whatsapp.net`, com três opções, sem fallback. ID `3EB0E76EA20C48A6F7CBC0`; ACK `delivered`.
- Foi enviado o carrossel `Teste PAPI wire - carrossel`, com dois cartões, imagens preparadas e um botão por cartão, sem fallback. ID `3EB0894B7AE7E1FBF91963`; ACK `delivered`.


## Cobrança Pix com cta_copy — 2026-10-04 02:09

- A enquete anterior apareceu correctamente no cliente e recebeu ACK `delivered` (`3EB0274DCCED9563D204C2`).
- Foi enviada a mensagem `Cobranca Pix de teste - chave: 10703598660` com botão Native Flow `cta_copy` / `Copiar chave Pix`, sem fallback. ID `3EB0D79776977A343FC602`; ACK `delivered` e depois `read`.
- Um formulário WhatsApp real não foi enviado porque o protocolo exige um Flow criado/publicado e um `flow_id` ou `flow_name`; um formulário inventado sem esse identificador seria rejeitado ou não abriria no cliente.


## Cobrança Pix nativa payment_info/review_and_pay — 2026-10-04 02:26

- O wire foi ajustado para reconhecer `payment_info` e `review_and_pay`; para `review_and_pay` envia `native_flow_name=order_details`, conforme o formato observado.
- Foi enviada uma mensagem `payment_info` com `pix_static_code`, chave CPF configurada para o teste, moeda BRL e total de 990 centavos. ID `3EB0F0DE923CA1A008B3C4`; ACK `delivered`.
- Foi enviada uma mensagem `review_and_pay` com pedido `Teste Forte Panel`, valor de teste R$ 9,90, estado `pending` e os mesmos dados Pix. ID `3EB0C2BA2DC17D958A8DD4`; ACK `delivered`.
- Nenhum pagamento foi capturado; são mensagens de teste com estado pendente.


## Comparação de quatro variantes review_and_pay — 2026-10-04 02:30

Foram enviadas quatro mensagens de teste de R$ 10,00, todas com estado `pending`, chave Pix estática e sem captura financeira. Variaram apenas `payment_configuration` e o tipo do pedido: A=`""`/physical-goods; B=`pix`/physical-goods; C=`PIX`/physical-goods; D=`pix_static_code`/digital-goods. Todas foram aceites e entregues: A `3EB029BFCFC90D5BF46AC4`, B `3EB075F3F82D3CEA7E701D`, C `3EB0D1056CDC410A0797FA`, D `3EB01A2ED0B3A88B793BD5`.


## Pix nativo com valor — envelope confirmado e candidata preparada — 2026-10-04 02:41

- A payload capturada da mensagem original confirmou `review_and_pay`, `payment_configuration: "merchant_categorization_code"`, `payment_settings[].type: "pix_static_code"`, `key_type: "PHONE"`, `total_amount: { value: 10000, offset: 1000 }` e ausência de `order`.
- O envelope foi reproduzido e entregue ao contacto de teste com o ID `3EB0FD97F2B0417B8CF195`.
- Foi criado `forte-whatsapp/src/pix-payment.ts`, com `payment_info` sem valor e `review_and_pay` com valor, mais testes unitários em `pix-payment.test.ts`.
- Foi criada a documentação `docs/WHATSAPP-PIX-NATIVO.md`, incluindo endpoints, exemplos, conversão de valores e limitações.
- Branch candidata: `fix/papi-compatible-interactives`; preparar validação completa e PR para `main`. Sem publicação GHCR e sem alteração do Gateway principal.


## Consolidação de interactivos para PR — 2026-10-04 02:45

A candidata agora inclui, no mesmo provider Baileys, botões Native Flow (até dez), listas `single_select` com fallback, carrosséis com mídia preparada, enquetes nativas, wire nodes compatíveis e Pix nativo com/sem valor. O diagnóstico temporário de payload recebida foi removido antes da preparação do PR.

Gates concluídos: Gateway `npm test` (21 ficheiros, 105 testes), `npm run check` e `npm run build`; aplicação raiz `pnpm check`, testes direccionados de interactivos/Pix/wire (9 testes) e `pnpm build`. A suite raiz completa executou 404 testes passados e 75 skips, mas 10 testes de backup/restore falharam por dependências/scripts Unix indisponíveis no Windows (`sha256sum`, Bash e caminhos POSIX); não são falhas dos interactivos. A candidata continua local na branch `fix/papi-compatible-interactives`; sem merge em `main`, sem publicação GHCR.
