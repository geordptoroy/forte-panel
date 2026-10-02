# Auditoria completa — Inbox, Baileys e PAPI 1.5.1

- **Data:** 2026-10-02
- **Branch:** `feat/o7.15-storage-reconciliation-observability`
- **Commit auditado:** `db51134abe5bad57bbb5e420b8047ae425746b92` (`docs: prepare inbox audit prompt for next AI`)
- **Estado atual:** a auditoria inicial foi documental; após os logs fornecidos pelo utilizador, foi corrigida a Permissions Policy same-origin e atualizado o respetivo teste. Alterações de código/documentação ainda não commitadas; sem merge.
- **Ambiente:** Manus Sandbox; sem segredos reais, sem execução contra WhatsApp real e sem testes na máquina do utilizador.

## Resposta executiva

**Os dois sintomas têm causas separadas.** Os logs posteriores do utilizador confirmaram que o bloqueio da gravação era a `Permissions-Policy` HTTP da própria aplicação (`microphone=()`), não o botão, as credenciais ou o codec. Separadamente, continuam confirmados os riscos de MIME/PTT e da estrutura da lista nativa; a aceitação/renderização dos interativos no destinatário permanece por provar.

1. **Microfone — causa confirmada:** o utilizador reportou em Chrome e Edge a mensagem `Permissions policy violation: microphone is not allowed in this document`, com `NotAllowedError`, `origin=http://localhost:3002`, `secureContext=true`, `mediaDevicesAvailable=true` e permissão do site «Permitir». O servidor definia `Permissions-Policy: ... microphone=()` globalmente (`server/_core/http-security.ts`, aplicada em `server/_core/index.ts:36-40`), o que bloqueava `getUserMedia` antes do codec. Corrigido para `microphone=(self)`; câmera e geolocalização continuam negadas. A captura após atualizar/reiniciar o servidor e a permissão OS continuam por validar.
2. **Áudio após iniciar gravação:** o recorder escolhe WebM/Opus primeiro, mas o worker/adaptador preserva `mediaMimeType` enquanto o gateway lê `metadata.mimetype` e, na ausência desta, declara `audio/ogg; codecs=opus` e `ptt=true` (`server/db.ts:8083-8112`; `server/integrations/whatsapp.ts:287-299`; `forte-whatsapp/src/instance-manager.ts:583-591`). Portanto, o formato pode ser rotulado incorretamente e um ficheiro de áudio comum pode ser marcado como voice note. **Defeito de contrato confirmado; não explica o erro de captura antes do upload.**
3. **Botões/listas:** o editor → tRPC → DB/fila → adaptador → gateway mantém tipos e metadata separados. Botões usam Native Flow `quick_reply` via `relayMessage`; listas usam `single_select` via `relayMessage`; polls usam `sendMessage({poll})`. Há uma divergência de ID confirmada: o editor constrói `rows[].rowId`, mas o teste do builder modela `rows[].id` e o builder não converte um para o outro. A PAPI auditada usa `listMessage` legado para listas, ao contrário do single-select nativo do Forte. **A forma serializa; aceitação/renderização no telemóvel não está comprovada.**
4. **“Enviado” local:** a Inbox primeiro grava `queued`. O endpoint do gateway responde `status: "sent"` quando o método Baileys termina (`forte-whatsapp/src/server.ts:141-190`). Isso não é receipt nem prova que o destinatário viu/renderizou a mensagem. O normalizador de echo não reconhece `interactiveMessage.nativeFlowMessage` como tipo nativo e pode classificar/suprimir o echo como texto; `[button]`/ausência de echo não é evidência de entrega.
5. **Eventos da Inbox:** `messages.upsert` e `messages.update` têm percursos implementados de ponta a ponta em código, com outbox, autenticação, tenancy, deduplicação e atualização de UI/estado; os testes unitários/contratuais existem, mas falta prova E2E completa. `messaging-history.set` chega ao webhook, mas a rota ativa responde `202 ignored` antes da validação de instância/workspace e da persistência. Não foram encontrados handlers dedicados para chats, contacts, presence, groups, group participants ou labels; reactions têm suporte parcial como `reactionMessage` dentro de `messages.upsert`, sem associação confirmada à mensagem-alvo.
6. **PAPI/Baileys:** Forte usa `baileys@7.0.0-rc14`, confirmado em `forte-whatsapp/package.json` e lockfile. A versão Baileys empacotada na PAPI 1.5.1 **não está confirmada**: o checkout/manifesto local da PAPI não está disponível e os relatórios PAPI anteriores não registam a versão do pacote. Comparação comportamental possível: PAPI usa Native Flow quick reply para botões, `listMessage` legado para listas e poll como formato separado; o Forte usa Native Flow também para listas.
7. **Anexos:** o upload prefere storage privado e aceita fallback base64 limitado/validado; a fila apaga `mediaData` após sucesso e o conserva no erro para retry. O MIME é comparado com o valor declarado, não com magic bytes; a extensão é sanitizada mas não validada contra conteúdo; URL guard não fixa/resolutiona DNS. O armazenamento privado inbound depende de `FORTE_MEDIA_PRIVATE_STORAGE_ENABLED=true`.

**Prioridade atual:** reiniciar/atualizar a aplicação com o novo header e confirmar que desaparece a violação `microphone`; isto não exige gravar áudio para verificar o header. Se depois persistir `NotAllowedError`, verificar permissão do sistema/dispositivo. A correção MIME/PTT, lista/Native Flow, reactions/histórico e hardening de anexos continuam como fatias distintas no [plano](PLANO-CORRECAO-INBOX-BAILEYS.md).

## Fluxo ponta a ponta — envio de áudio/mídia e interativos

| Etapa | Responsabilidade | Evidência/resultado |
|---|---|---|
| Composer | Grava áudio via gesto explícito; escolhe anexo; constrói metadata de botão/lista/poll | `client/src/pages/PanelPages.tsx:1389-1512,1514-1640` |
| Upload | Armazena privado se disponível; devolve `mediaStorageKey` ou `mediaData` transitório validado | `server/inbox-media-upload.ts:7-42,53-95` |
| tRPC/router | Valida tipo e estrutura interativa; chama persistência da mensagem manual | `server/routers.ts:3332-3379`; `server/interactive-messages.ts:3-37` |
| DB/outbox | Associa rota/instância; valida chave/MIME/tamanho; grava `queued`; worker reclama e envia | `server/db.ts:5964-6073,8032-8112` |
| Adaptador | Faz POST autenticado com chave de idempotência e `metadata` inalterada | `server/integrations/whatsapp.ts:266-311` |
| Gateway | Constrói áudio/mídia/poll/Native Flow e chama `sendMessage` ou `relayMessage` | `forte-whatsapp/src/instance-manager.ts:560-683` |
| Estado de envio | Resultado do socket produz `externalId`; worker grava `sent`; receipts posteriores seguem `messages.update` | `forte-whatsapp/src/server.ts:141-190`; `forte-whatsapp/src/instance-manager.ts:749-800`; matriz de eventos |
| Destinatário | Renderização num telefone/WhatsApp Web controlado | **Não testada nesta auditoria** |

A linha `sent` significa que o método de envio/bridge devolveu sucesso. Só `messages.update` pode acrescentar os estados de receipt implementados (`delivered`, `read`); nenhum deles demonstra que todos os clientes renderizam o mesmo payload/UX.

## Diagnóstico detalhado

### 1. Microfone e browser

`startRecording()` verifica APIs, limpa o erro anterior e chama `navigator.mediaDevices.getUserMedia({audio:true})` diretamente no handler da ação (`PanelPages.tsx:1545-1553`). Depois pede `MediaRecorder` com candidatos WebM/Opus → Ogg/Opus → MP4; ao parar, encerra tracks, limpa intervalo, constrói Blob com `recorder.mimeType` e converte-o para `File` (`:1555-1601`). A falha de `getUserMedia` ou do construtor/start cai no `catch` e limpa as tracks existentes (`:1615-1640`).

**O que a evidência confirma agora:**

- A UI escolhe “permissão negada” para `DOMException.name === "NotAllowedError"` (`PanelPages.tsx:1615-1639`). O utilizador forneceu logs de Chrome e Edge em que o browser também reporta `Permissions policy violation: microphone is not allowed in this document`; a definição do site está «Permitir».
- Os logs fornecidos registam `origin=http://localhost:3002`, `secureContext=true` e `mediaDevicesAvailable=true`. Isso elimina a hipótese de origem HTTP insegura/API ausente, mas não atesta permissões OS/dispositivo.
- `securityHeadersForRequest` enviava `Permissions-Policy: camera=(), microphone=(), geolocation=()` (`server/_core/http-security.ts:10`) para todas as respostas, através do middleware inicial (`server/_core/index.ts:36-40`). Essa diretiva nega o uso mesmo com a permissão do site ativa.
- Corrigido para `microphone=(self)`, permitindo pedidos de microfone apenas a documentos same-origin; câmera e geolocalização permanecem bloqueadas. O gesto do utilizador e as permissões de browser/OS continuam necessários.
- `MediaRecorder.onerror` ainda expõe uma mensagem genérica; `setIsRecording(true)` só ocorre após `recorder.start()` (`:1615-1640`). Não se pediu nem realizou captação neste diagnóstico.

**Ainda por confirmar:**

- O utilizador tem de reiniciar/atualizar a aplicação com esta alteração e verificar que desaparece o aviso de `microphone` policy; este runtime pós-fix não foi testado.
- Se o erro persistir após o header novo, são necessários estado da permissão do sistema operativo, disponibilidade/estado do dispositivo e novo nome/código de erro; isso não foi recolhido.
- O aviso de `unload` é independente: o repositório contém `beforeunload` no debug collector (`client/public/__manus__/debug-collector.js:759-760`), mas não é o bloqueio do microfone.

### 2. Áudio, voice note e anexos

O audio capture produz o MIME real do `MediaRecorder`, mas a cadeia downstream usa outra chave. Upload aceita áudio com vários containers e persiste `mediaMimeType`; worker passa metadata; adaptador não a transforma; manager procura `mimetype`. Ao enviar, `ptt: metadata.ptt !== false` marca true por omissão. Resultado potencial:

- WebM/Opus pode ser anunciado ao Baileys como OGG/Opus sem transcoding;
- áudio comum carregado pode ser tratado como PTT;
- documentos passam a MIME genérico se `mimetype` não existir; imagens/vídeos deixam de receber MIME explícito nessa camada.

O que foi provado é a divergência de chave e os valores de fallback. Se um dispositivo receptor rejeita o ficheiro concreto, só um teste real de envio/receipt/reprodução pode confirmá-lo.

No outbound upload, storage privado é tentado primeiro. Se falhar, a API devolve a data URL transitória; `sendManualMessage` aceita uma referência privada do workspace ou data URL base64 validada, impõe 8 MiB, verifica MIME indicado/data URL e rejeita `mediaUrl`. O worker envia `mediaData` transitório e apaga-o da row quando o adapter tem sucesso; falhas deixam os bytes enquanto a mensagem aguarda/requer retry. Ver secção “Riscos e regressões”.

### 3. Botões, listas e enquetes

- **Botões:** `nativeFlowMessage.messageVersion=1`; cada botão é `quick_reply`; JSON contém `display_text` e ID gerado pelo editor (`option-1`, etc.). Gateway usa `relayMessage`, fornece `messageId` e usa o retorno string como `externalId` (`forte-whatsapp/src/interactive-payload.ts:16-38`; `instance-manager.ts:664-674`). O tipo Baileys instalado declara `relayMessage: Promise<string>`.
- **Listas:** `single_select` tem JSON `{title, sections}`. O editor constrói rows com `rowId`, enquanto fixture do builder fornece `id`; o builder não mapeia. É uma inconsistência editor–fixture, não validação do significado do campo no cliente final. Não enviar IDs instáveis baseados só em índice para sistemas externos sem verificar o contrato.
- **Enquetes:** editor envia `payload.poll` com nome, opções e `selectableCount`; gateway valida nome + pelo menos duas opções e usa `socket.sendMessage(jid, {poll})`. O normalizador separa `pollCreationMessage/pollUpdateMessage` de botões/listas. O gateway não valida o limite 12 nem a relação `selectableCount`/opções; votos/resultados em UI e decriptação não estão demonstrados.
- **Proto versus cliente:** proto Baileys documenta campos de serialização (`buttons`, `messageParamsJson`, `messageVersion`, `name`, `buttonParamsJson`), mas `buttonParamsJson` é string; tipo compilável não verifica schema semântico dentro dessa string nem compatibilidade entre telemóvel/Desktop.
- **PAPI 1.5.1:** relatório reverso descreve quick replies nativos para botões e `listMessage` legado para listas (`docs/AUDITORIA-REVERSA-PAPI-1.5.1-PARA-FORTE.md:219-262`). O Forte mudou a família de payload da lista. Não há evidência suficiente para afirmar que um formato foi deprecado no Baileys ou que essa diferença é definitivamente a causa da falha reportada.

### 4. Eco, UI e entrega

O composer permite envio interativo sem texto livre: a guarda bloqueia draft vazio apenas para `interactiveType === "text"` (`PanelPages.tsx:1389-1390`). Router aceita os tipos e valida opções (`server/routers.ts:3332-3349`; `server/interactive-messages.ts:3-37`).

O envio é persistido primeiro como `queued` (`server/db.ts:6061-6073`), passa pelo worker e é marcado `sent` depois de resposta OK do gateway (`:8113-8130`). O endpoint de gateway devolve `status: "sent"` depois do retorno de `sendMessage`/`relayMessage`, não do telefone (`forte-whatsapp/src/server.ts:141-190`).

O normalizador inbound não interpreta `interactiveMessage.nativeFlowMessage` como tipo nativo; o outbound normalizador também não o classifica como button/list (`forte-whatsapp/src/message-normalization.ts:55-101,151-205`). Um eco próprio pode então ser suprimido pelo tracker como assinatura de texto vazia. Isso ajuda a evitar duplicados locais mas não é uma confirmação de entrega. A confirmação implementada deve ser examinada separadamente em `messages.update`; também não substitui um teste de apresentação nos dois clientes.

## Cobertura real de eventos

A análise completa por evento — entrada, normalização, persistência, tenancy/autenticação, idempotência, retries, UI e testes — está em [MATRIZ-COBERTURA-INBOX-EVENTOS.md](MATRIZ-COBERTURA-INBOX-EVENTOS.md). Síntese:

| Evento | Conclusão no commit auditado | Lacuna principal |
|---|---|---|
| `messages.upsert` | **Implementado** para mensagens live; `notify` sem requestId segue o caminho; outbox HMAC, validação workspace/instância, dedupe, ingestão e thread Inbox | Sem E2E único socket real → autenticação → DB → UI; IDs de provider ausentes não garantem dedupe |
| `messages.update` | **Implementado** para receipts own-message `sent/delivered/read`, persistido monotonicamente e exibido na Inbox | Buffer de receipt prematuro é só memória; E2E do listener/callback/UI não encontrado |
| `messaging-history.set` | **Entrega até ao endpoint, depois ignorado com 202** | Não persiste histórico; `return` ocorre antes de ownership/workspace e ledger; docs de importação divergem do código |
| `chats.update` | **Não observado/indisponível no caminho auditado** | Sem listener, contrato, persistência, retry ou UI específica |
| `contacts.update` | **Não observado** | Nome pode ser atualizado incidentalmente por `pushName` numa mensagem, não por evento dedicado |
| `presence.update` | **Não observado** | Sem listener, normalização, estado persistido ou UI de presença |
| `messages.reaction` | **Parcial** como `reactionMessage` dentro de `messages.upsert` | Sem listener/evento dedicado confirmado; adapter não preserva payload structured da reação; alvo/remoção não associada |
| `groups.update` | **Não observado como evento**; subject pode ser consultado/atualizado durante mensagens de grupo | Sem sincronização de alteração sem mensagem |
| `group-participants.update` | **Não observado**; DB/UI exibem participantes/remetentes observados em mensagens | Não prova associação/remoção/promoção nem reconciliação da membresia |
| `labels` (`labels.association`, `labels.edit`) | **Não observado** | Sem subscription, modelo, persistência ou UI no percurso pesquisado |

“Não observado/indisponível” descreve o repositório/caminho auditado; não afirma que Baileys, outro provider ou componente fora deste checkout não tenha essa capacidade.

## Factos confirmados, hipóteses e bloqueadores

### Factos confirmados no código/testes

- HEAD local e upstream coincidem em `db51134`; a árvore estava limpa antes de documentar.
- Forte instala `baileys@7.0.0-rc14`; `relayMessage` retorna `Promise<string>`.
- Microfone: mensagem de erro “negada” depende de rejeição `NotAllowedError`; não há leitura da Permissions API neste fluxo.
- Áudio: erro de chave `mediaMimeType` versus `mimetype`; PTT `true` por omissão; o código não converte o container.
- Lista: fixture nativa usa `id`, editor emite `rowId`, não há normalização entre os dois.
- Botões/listas persistem como `queued`; o retorno do gateway é aceite do método Baileys, não prova por si só da renderização no destinatário.
- Eventos implementados e suas lacunas constam na matriz referenciada.
- Anexos outbound tentam storage privado e limitam fallback a uma data URL validada de até 8 MiB; `mediaData` é removido após sucesso, conservado em falha/retry.

### Hipóteses a validar (não confirmadas)

- A falha de `getUserMedia` pode estar ligada à origem/secure context/iframe, permissão do OS, hardware ou política do browser; não selecionar uma hipótese sem registar dados do erro.
- A discrepância `rowId`/`id` ou a diferença `single_select` versus `listMessage` pode causar a falha da lista no cliente; a causa física não está provada.
- MIME incorreto/ptt indevido pode impedir ou alterar playback do áudio; não explica o recorder não iniciar.
- O echo suprimido pode criar falsa confiança sobre envio, mas não prova que tenha causado rejeição do destinatário.
- `isAllowedOutboundMediaUrl` não resolve DNS nem fixa IP; risco de SSRF via hostname depende do percurso autenticado e downloader downstream e merece teste/hardening específico.

### Bloqueadores externos

- O utilizador testou Chrome e Edge e forneceu os logs da falha; o browser conectado abriu `/login`, sem autenticação. Não foi executada captação pelo agente nem verificado o runtime após a alteração do header.
- Número/conta e telemóvel/WhatsApp Web de teste controlados não disponibilizados; sem prova de delivery/read/rendering.
- Container/source package lock da PAPI 1.5.1 não existe em `/tmp/pastorini-root`, e documentação PAPI anterior não registra a versão exata do Baileys.
- CI com PostgreSQL e variáveis reais/deployment não executados; alguns testes condicionais dependem de `DATABASE_URL`.

## Riscos e regressões de anexos

- **Storage:** privado é preferido outbound; fallback transient só depois de falha de storage. Inbound, em contrapartida, só é movido para storage privado com `FORTE_MEDIA_PRIVATE_STORAGE_ENABLED=true` (`server/media-storage.ts:27-58`); sem a flag, a metadata original — potencialmente `mediaData` — permanece.
- **Validação:** lista MIME + comparação da string indicada não valida bytes mágicos/assinatura real; extensão é sanitizada, não cruzada com conteúdo. Rejeita SVG como imagem e impõe maxBytes, mas pode aceitar conteúdo que declare tipo permitido sem esse tipo real.
- **Retenção:** remove `mediaData` após sucesso, deixa bytes nas mensagens queued/failed para retry; política de expiração/cleanup dessa metadata não localizada.
- **SSRF/DNS:** gateway rejeita protocolos/hosts/IPs locais enumerados e credenciais, mas não resolve hostname nem valida endereço DNS final. A proteção contra rebinding não fica provada.
- **Logs:** caminho de upload registra nome/MIME/causa, não foi localizado logging de bytes/base64. Manter sanitização de nome e erro do fornecedor ao melhorar diagnóstico.
- **MIME/PTT:** media type downstream usa chave diferente, pode anunciar container incorreto e marcar áudio comum como PTT.

## Plano e critério da próxima fatia

O plano completo e o estado atualizado por fatia estão em [PLANO-CORRECAO-INBOX-BAILEYS.md](PLANO-CORRECAO-INBOX-BAILEYS.md). A fatia de permissões está corrigida em código e testada; falta o utilizador reiniciar/recarregar e confirmar a remoção do aviso. A fatia MIME/PTT continua separada, sem misturar com lista/Native Flow ou eventos. A correção de policy não prova gravação/reprodução física.

## Validação realmente executada

- **Suíte Vitest do repositório no Sandbox:** 86 ficheiros passaram, 22 ficaram ignorados; **336 testes passaram e 62 ficaram ignorados** (108 ficheiros/398 testes contabilizados). Não equivale a CI/PostgreSQL sem skips.
- **Testes gateway focados:** `interactive-payload.test.ts`, `message-normalization.test.ts`, `media-reference.test.ts`, `server.test.ts` — **4 ficheiros, 46 testes passaram**.
- **TypeScript:** `pnpm check` raiz — passou; `./node_modules/.bin/tsc --noEmit -p tsconfig.json` em `forte-whatsapp` — passou. Após a correção Permissions Policy, `pnpm check` voltou a passar.
- **PAPI/upstream:** lida a documentação de NativeFlowMessage do Baileys, README do repositório e página npm da distribuição 7.0.0-rc14.
- **Não executados:** CI; teste da captura após a correção no Chrome/Edge do utilizador; envio/receipt/read num dispositivo; teste em WhatsApp Web do segundo PC; comparação de package lock PAPI runtime; PostgreSQL end-to-end.
- As alterações e testes de código foram feitos no Sandbox; o utilizador forneceu logs locais, mas o agente não captou áudio, não acedeu a credenciais/números reais e não alterou o sistema operativo/browser.

## Documentação criada/atualizada

- `docs/AUDITORIA-COMPLETA-INBOX-BAILEYS.md` — este relatório.
- `docs/AUDITORIA-BAILEYS-INTERACTIVE-AUDIO.md` — payloads, áudio, Baileys/PAPI e regressões.
- `docs/MATRIZ-COBERTURA-INBOX-EVENTOS.md` — cobertura detalhada dos dez eventos.
- `docs/PLANO-CORRECAO-INBOX-BAILEYS.md` — plano de fatias separadas.
- `docs/PROMPT-PROXIMA-IA-AUDITORIA-INBOX-BAILEYS.md` — manter prompt e adicionar descobertas da execução.
- `ROADMAP-EXECUCAO-FORTE-PANEL.md` e `HANDOFF-PROXIMO-CHAT-IA.md` — estado e próxima fatia documentados.

## Referências externas

[1]: https://github.com/WhiskeySockets/Baileys "Repositório comunitário oficial WhiskeySockets/Baileys"
[2]: https://www.npmjs.com/package/baileys/v/7.0.0-rc14 "Distribuição npm instalada no Forte"
[3]: https://baileys.wiki/proto-reference/Message/InteractiveMessage/classes/NativeFlowMessage "Referência upstream do proto NativeFlowMessage"
