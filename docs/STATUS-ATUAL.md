# Estado atual — Forte Panel

**Atualizado:** 3 de outubro de 2026, 08:57 (UTC−3)
**Repositório:** `geordptoroy/forte-panel`  
**Estado:** candidata de remediação publicada numa branch de handoff; **não integrada em `main` nem publicada como release/imagem**.
**Continuação local:** commits `bb3fb0e` (limites), `6ee474c` (webhook genérico encerrado), `17b0b34` (guard de media outbound), `8e8c1bd` (contrato MIME/PTT), `6a02133` (purge Baileys-only), `eeaa6d5` (reconciliação idempotente auditável), `a896dbd` (readiness/body do gateway) e a correcção local de auth state ainda não commitada; sem push nesta sessão.

## Git e decisão de integração

| Referência | SHA observado | Estado |
|---|---|---|
| `origin/main` | `f67548570f44b8c8fe79082911d7de557a8a3650` | Base canónica observada antes da candidata; confirmar de novo antes de promover. |
| `origin/feat/o7.15-storage-reconciliation-observability` | `61d8a13703b3146727987b6f00b34785bfdcfb87` | Linha de desenvolvimento que está a ser reconciliada localmente com a main. |
| PR #3, `docs/ai-admin-core-plan-2026-09-27` | `d90bba2edc6601e73db9bd18601b9d97a2b2bef4` | Auditoria concluída: **não integrar a ref inteira**. As capacidades Baileys principais já estão em main/O7; a arquitetura multi-canal antiga não faz parte do produto. |
| Base da candidata | branch `integration/beta-candidate-2026-10-02`, commit de remediação `cdaa811ec47243ad17fc2ab24c45b17421329a4f` | Junção main+O7 originalmente auditada em `445d4cc`; remediações validadas e commitadas/pushadas para a branch de handoff. `main` continua em `f67548570f44b8c8fe79082911d7de557a8a3650`. |

**Conclusão da auditoria:** main+O7 já contém o modelo multi-instância Baileys, pairing/readiness, polling de estado, CRUD, settings/profile, integração REST opt-in e os gates mais recentes. As migrations 0038/0039 do PR são byte-a-byte iguais às refs atuais; o candidato conserva também as migrations 0040–0044 de main e 0045–0058 de O7. A ref antiga do PR carrega uma arquitetura multi-canal fora do escopo e uma UI alternativa que remove settings/profile e o atalho Inbox; trazer a branch inteira é regressivo e conflitante. Nenhuma alteração do PR #3 foi copiada.

O possível conflito de nonce foi revisto: o gateway gera nonce aleatório com 18 bytes (144 bits), e a aplicação usa um segredo global de assinatura; a unicidade por workspace/provider é intencional para detetar replay independentemente da instância. Não foi feita alteração ao índice.

Foi publicado o commit `cdaa811` apenas em `integration/beta-candidate-2026-10-02` para permitir continuação por outra IA. Não houve merge/push para `main`, publicação GHCR, acesso ao Supabase, reset Docker nem teste contra a instância real do utilizador. O push não disparou workflows; PR #3 permanece sem alteração remota.

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
| Suite root com `DATABASE_URL` local | **124 ficheiros / 455 testes passaram** na execução completa após esta remediação; sem skips nesta execução. |
| Validator de configuração de produção | Passou com configuração sintética segura; sem credenciais reais. |
| `pnpm build` do painel | Passou; emite aviso de bundle JavaScript principal com cerca de 1,1 MB (minificado). |
| Gateway Baileys | Suite isolada: **18 ficheiros / 93 testes passaram**, sem skips; `npm run check` e `npm run build` passaram. O patch Baileys versionado foi aplicado apenas ao `node_modules` local para validar o teste histórico; não houve alteração do lockfile nem do patch. |
| Gateway Baileys — media/MIME/PTT | `sendPayload` já não contorna a política de media; `mediaMimeType` e PTT são preservados até ao payload Baileys; **18 ficheiros / 91 testes** passaram, com check/build verdes. |
| Compose | YAML analisado com Prettier; `docker compose config` não pôde ser executado porque a CLI Docker não está instalada neste sandbox. Nenhum container/volume foi iniciado ou alterado. |
| Workflow de publicação | YAML validado; `main` apenas, migrations PostgreSQL e zero-skips antes de `publish`. Ainda não executado no GitHub. |

A suite root também passou sobre a base atualizada de 45 migrations da `main` para 61 da candidata. A base era descartável e não continha dados de negócio; isto prova compatibilidade do SQL de upgrade, **não** preservação de dados reais existentes. Os testes não cobriram WhatsApp real, browser do utilizador, envio de mensagens, Supabase nem imagem Docker executada.

## Pendências antes de promover

1. Completar a Fase 1: o tratamento async Express 4, os limites de body/rate, o encerramento do endpoint REST genérico e a ferramenta de reconciliação idempotente estão implementados e testados; segue-se a revisão dos restantes endpoints. O gate de supportSession para status/plano/incidentes está implementado e testado. O fencing REST da `0060` falha fechado em resultado ambíguo.
2. A `0017` foi corrigida e testada. A `0043` agora aplica a decisão explícita Baileys-only: elimina rows/configuração/eventos/mensagens tagged com provider não-Baileys durante o upgrade. O inventário read-only deve ser guardado antes de aplicar a migration real; não executar este upgrade no ambiente do utilizador sem backup/rollback validado.
3. Resolver os demais high de segurança e transporte Baileys, inclusive encriptação de auth state e semântica real de queued/sent/failed; o guard de media outbound e os limites de media/body estão fechados localmente, sem smoke de imagem ou WhatsApp real.
4. Fechar os gates de dados e operação: backup/restore completo, readiness, shutdown, email real ou promessa removida, observabilidade e staging controlado.
5. Repetir typecheck, testes root/gateway, suite PostgreSQL sem skips, builds e workflow no mesmo SHA/digest quando as correções estiverem concluídas.
6. Manter `publicSignup` fechado até as oito evidências do controlled release estarem comprovadas. Nenhum commit de promoção em `main`, publicação GHCR ou alteração da instalação Docker foi feito.

## Próxima ação

**Continuar pela revisão dos restantes endpoints e dos gates de transporte/operação**, agora priorizando o contrato de backup externo dos blobs Forge/S3 e alertas externos. O backup local já verifica DB/sessão e a identidade da chave sem expor o segredo, mas ainda não é prova de backup cifrado/off-host nem de restore completo de blobs/media; a candidata não é release beta pública, não deve ser instalada no ambiente do utilizador e não houve push/merge/publicação.
