# Auditoria — Baileys, mensagens interativas e áudio

**Data:** 2026-10-02
**Base auditada:** `feat/o7.15-storage-reconciliation-observability` em `db51134`
**Modo:** auditoria documental e testes no Sandbox; sem alterações de lógica de produto, sem credenciais reais e sem teste físico no WhatsApp.

## Versão e origem do Baileys

O gateway declara a dependência `baileys: 7.0.0-rc14` em `forte-whatsapp/package.json` e fixa a mesma versão no lockfile (`forte-whatsapp/package-lock.json:1747-1750`). O pacote instalado durante a validação identifica o repositório `WhiskeySockets/Baileys`; a assinatura de `relayMessage` na distribuição é `Promise<string>` (`node_modules/baileys/lib/Socket/messages-send.d.ts:15`). O retorno de `sendMessage` é `Promise<WAMessage | undefined>` e o gateway extrai `result.key.id` (`messages-send.d.ts:36`; `forte-whatsapp/src/instance-manager.ts:664-666`).

`7.0.0-rc14` é uma release candidate da linha 7, não uma garantia de compatibilidade com todas as versões/clientes WhatsApp. A documentação do projeto avisa que a linha 7 introduziu breaking changes [1] [2]. O Baileys é uma implementação comunitária do protocolo Web WhatsApp, não a API oficial Meta [1].

A versão exata de Baileys empacotada na PAPI 1.5.1 **não está confirmada** nesta cópia: `/tmp/pastorini-root` não existe no Sandbox e os relatórios prévios não registaram o lockfile/package version do container. A versão da PAPI só pode ser fechada inspecionando o manifesto/package lock extraído da imagem original ou o respetivo repositório autorizado. Não inferir que PAPI e Forte usam a mesma versão.

## Contrato da Inbox até ao gateway

O editor da Inbox envia `messageType`, texto/caption e `metadata` através de `inbox.sendMessage`; o router valida o tipo e grava a mensagem na fila com estado `queued` (`client/src/pages/PanelPages.tsx:1389-1512`; `server/routers.ts:3332-3379`; `server/db.ts:5964-6073`). O worker encaminha a mesma metadata e `messageType` ao adaptador; o adaptador envia `metadata` ao endpoint autenticado do gateway (`server/db.ts:8032-8112`; `server/integrations/whatsapp.ts:266-300`). O gateway converte o contrato numa mensagem Baileys (`forte-whatsapp/src/instance-manager.ts:560-683`).

A linha `queued` significa persistência local, não aceitação pelo WhatsApp. O worker muda para `sent` depois de o adaptador receber uma resposta bem-sucedida do gateway; para payload nativo, o gateway devolve o identificador obtido de `relayMessage`. Isso confirma o resultado do caminho de envio até ao socket, não entrega nem renderização no destinatário. A confirmação de entrega/read receipt é uma via separada e o teste físico continua pendente.

## Botões e listas

O composer permite enviar uma mensagem interativa sem texto livre: o guarda de `send()` só interrompe quando o tipo é texto e não há conteúdo; o botão de enviar também deixa de depender de `draft` quando `interactiveType !== "text"` (`PanelPages.tsx:1389-1390`, `1941`). O router aceita `button`, `list`, `poll` e `carousel`; os validadores impõem 1–3 botões, ao menos uma secção para lista, e payload obrigatório para poll/carousel (`server/interactive-messages.ts:3-37`; `server/routers.ts:3332-3349`).

Para `button`, o gateway constrói o envelope direto `{ interactiveMessage }`, com `body: {text}`, `nativeFlowMessage.messageVersion: 1` e botões `name: "quick_reply"`, cujo `buttonParamsJson` é JSON com `display_text` e `id` (`forte-whatsapp/src/interactive-payload.ts:16-38`). O envio usa `relayMessage(jid, message, { messageId })`; o `messageId` de correlação é fornecido e o retorno string de `relayMessage` é guardado como `externalId` (`instance-manager.ts:664-674`). Isto evita o wrapper `viewOnceMessage` que o relatório prévio identificou como problemático. O envelope não define `headerType`, `contextInfo`, `deviceListMetadata` nem `messageParamsJson`; o código só adiciona `header.title` opcional sem mídia e `footer.text` opcional.

Para `list`, o Forte também usa `interactiveMessage.nativeFlowMessage`, com um botão `single_select` e `buttonParamsJson` contendo `title` e `sections` (`interactive-payload.ts:39-50`). **Há uma inconsistência local confirmada no identificador da linha:** o editor gera `rows: [{ rowId, title }]` (`PanelPages.tsx:1485-1491`), enquanto o teste de contrato para o payload nativo fornece `rows: [{ id, title }]` e espera que a secção seja preservada (`interactive-payload.test.ts:21-27`). O builder encaminha `sections` sem normalizar os identificadores. Isto prova divergência entre editor e fixture, mas, por si só, não prova qual variante é aceite pelo cliente WhatsApp real: `buttonParamsJson` é uma string opaca para o proto Baileys.

A PAPI 1.5.1 observada no relatório reverso usa `nativeFlowMessage`/`quick_reply` nos botões e `listMessage` legado nas listas; enquetes são outro formato (`docs/AUDITORIA-REVERSA-PAPI-1.5.1-PARA-FORTE.md:219-262`). Portanto, o Forte não reproduz o contrato da lista da PAPI: converte a lista para `single_select` nativo. A evidência disponível não permite afirmar que botões/listas legados foram removidos ou que `single_select` esteja garantido em todas as versões atuais dos clientes. O proto atual documenta o envelope e os campos `buttons`, `messageParamsJson`, `messageVersion`, `name` e `buttonParamsJson`, mas não valida o JSON interno nem garante a apresentação no destinatário [3]. Não concluir “Baileys incompatível” apenas com base na estrutura serializável.

## Enquetes

O contrato de poll é independente de botões/listas: o editor envia `metadata.payload.poll` com `name`, `values` e `selectableCount`; o gateway valida nome e pelo menos duas opções e envia `socket.sendMessage(jid, { poll: ... })` (`PanelPages.tsx:1492-1497`; `instance-manager.ts:631-653`). A normalização inbound também escolhe `pollCreationMessage`/`pollUpdateMessage` como um tipo próprio, separado de `listMessage` e botões (`message-normalization.ts:63-72`, `84-101`). O caminho de criação não passa por `relayMessage` nem por Native Flow.

O editor limita as opções a 12; o gateway não limita esse máximo nem valida `selectableCount` contra o número de opções. O router valida apenas que `payload` existe para poll. A extração de votos/respostas e a sua persistência semântica **não estão confirmadas** nesta auditoria; a presença de `pollUpdateMessage` no normalizador não prova que votos sejam desencriptados ou apresentados como resultado de poll.

## Eco local e confirmação de entrega

O normalizador inbound reconhece `listMessage`, botões/templates/respostas legadas e polls, mas não classifica `interactiveMessage.nativeFlowMessage` (`message-normalization.ts:55-101`). O normalizador outbound também não reconhece esse envelope e, por omissão, classifica-o como texto (`message-normalization.ts:151-205`). O tracker pode suprimir o echo local com assinatura vazia para o JID/tipo correspondente. Assim, um echo ignorado não constitui teste de renderização, e a ausência de uma segunda linha de eco não distingue falha de entrega de supressão intencional.

O gateway devolve `status: "sent"` quando a função de envio termina; o próprio endpoint não recolhe prova do telemóvel destinatário (`forte-whatsapp/src/server.ts:141-190`). A confirmação real por receipt ou por inbound no número destinatário não foi obtida nesta execução. O motivo reportado para a mensagem não chegar ao telemóvel/PC **não está confirmado**; as hipóteses concretas são o contrato `rowId`/`id` da lista, a diferença entre native flow do Forte e lista legada da PAPI, e a falsa confiança no estado/echo local. O payload moderno de botões é estruturalmente coerente com o exemplo documentado na auditoria prévia da PAPI, mas ainda não foi validado em cliente real.

## Áudio/voice note

### Gravação no browser

`startRecording()` é invocado pela ação de utilizador e chama diretamente `navigator.mediaDevices.getUserMedia({audio:true})` (`PanelPages.tsx:1545-1553`). A função não consulta `navigator.permissions.query({name:"microphone"})`; `window.isSecureContext` e a origem só entram no log/mensagem depois de uma falha. O aviso “permissão negada” é mostrado especificamente quando a Promise de `getUserMedia` rejeita com `NotAllowedError` (`PanelPages.tsx:1615-1639`). A permissão mostrada no ícone do Chrome é um estado da origem, não prova que a chamada concreta foi autorizada: contexto/iframe, políticas do browser/OS e seleção/ocupação do dispositivo continuam possíveis. **A causa runtime não está confirmada** porque esta auditoria correu num Sandbox sem acesso à origem/browser físico `http://localhost:3002`; não foram recolhidos `origin`, `isSecureContext`, estado da Permissions API nem o `DOMException.name` da tentativa do utilizador.

Quando o acesso é concedido, o recorder testa por ordem `audio/webm;codecs=opus`, `audio/ogg;codecs=opus` e `audio/mp4`; cria o `Blob` com `recorder.mimeType` e envia-o como anexo (`PanelPages.tsx:1555-1601`). O UI distingue alguns erros de getUserMedia, mas `MediaRecorder.onerror` dá uma mensagem genérica e não regista nome/código; o fallback `new MediaRecorder(stream)` pode falhar ao iniciar e cai no mesmo `catch`. Por isso, “API ausente”, “permissão”, “hardware”, “MIME/construtor” e “falha do recorder” não têm diagnóstico completo nem estado separado.

### Upload, worker e Baileys

O upload da Inbox aceita `audio/ogg`, `audio/mpeg`, `audio/mp4`, `audio/webm`, `audio/wav`, `audio/x-wav` e `audio/aac`, com limite de 8 MiB e comparação do MIME declarado com o MIME da data URL (`server/inbox-media-upload.ts:7-42`, `53-72`). A metadata persistida contém `mediaMimeType`; o worker mantém essa chave ao chamar o adaptador (`server/db.ts:8083-8112`), e o adaptador não a renomeia (`server/integrations/whatsapp.ts:287-299`).

**Defeito de contrato confirmado:** o gateway consulta `metadata.mimetype`, não `metadata.mediaMimeType`. Para áudio sem o campo adicional `mimetype`, envia por omissão `mimetype: "audio/ogg; codecs=opus"` e `ptt: true` (`forte-whatsapp/src/instance-manager.ts:583-591`). Assim, uma gravação WebM/Opus pode ser rotulada como OGG sem conversão; um áudio MP3/WebM carregado como ficheiro também é marcado PTT por omissão. Os bytes não são convertidos para OGG/Opus. Isto não explica a falha anterior à gravação, mas é um risco concreto de áudio enviado inválido ou com classificação incorreta depois de o browser gravar.

O mesmo mapeamento MIME afeta os outros tipos: a metadata da aplicação usa `mediaMimeType`, mas o gateway só lê `mimetype`; documento passa a `application/octet-stream` se `mimetype` não estiver presente, e imagem/vídeo não recebem o MIME explícito. A implementação ainda poderá inferir o tipo pelos bytes/URL, mas não existe teste ponta a ponta a provar a classificação final no WhatsApp.

## Anexos: regressões e risco residual

O upload tenta storage privado primeiro e só devolve fallback `mediaData` se o `storagePut` falhar (`server/inbox-media-upload.ts:77-95`). O `sendManualMessage` permite referência privada válida ou data URL base64 validada, verifica tamanho ≤8 MiB e igualdade entre MIME da data URL e `mediaMimeType`, e rejeita `mediaUrl` (`server/db.ts:6025-6052`). O worker envia a data URL transitória quando existe; depois do sucesso remove `mediaData` da metadata guardada (`server/db.ts:8083-8129`). Em erro, a mensagem continua na fila/falhada e os bytes ficam retidos para retry; não foi localizada uma expiração específica dessa metadata nesta trilha.

O gateway exige HTTPS para URL externa e rejeita credenciais, localhost, nomes locais e IPs privados/reservados enumerados; também limita data URLs a 8 MiB (`forte-whatsapp/src/media-reference.ts:21-68`). A validação de hostname não faz resolução DNS nem fixa o IP resolvido. Se o consumidor de URL seguir DNS para um IP privado, o filtro atual não prova proteção contra DNS rebinding/SSRF; a consequência depende do downloader usado pelo Baileys e precisa de defesa/teste próprios.

O MIME é uma whitelist de tipos e compara `input.mimeType` com o cabeçalho da data URL; não inspeciona magic bytes/conteúdo real. A extensão do nome é sanitizada contra separadores/caracteres perigosos, mas não é validada contra o tipo real. Não se encontrou código que registe o conteúdo/binário/base64 do anexo; a rota regista `fileName`, MIME e causa técnica (`routers.ts:3072-3085`). O armazenamento privado inbound é condicional a `FORTE_MEDIA_PRIVATE_STORAGE_ENABLED=true`; caso contrário, `persistInboundMedia` mantém metadata original, incluindo `mediaData` (`server/media-storage.ts:27-58`).

## Próximas verificações separadas

1. Reproduzir a gravação numa sessão autorizada do Chrome e registar somente `origin`, `isSecureContext`, disponibilidade das APIs, estado da Permissions API e nome/código de erro; não recolher áudio nem secrets. Até esse teste, a causa do `NotAllowedError` permanece **não confirmada**.
2. Fazer uma alteração de código isolada para o contrato MIME/PTT de áudio: transportar o MIME real end-to-end e distinguir gravação de voz de ficheiro áudio comum. Cobrir com testes o worker, adaptador e payload final. Não juntar a correção do microfone nem a da lista.
3. Corrigir/decidir a forma de ID das linhas native single-select e criar teste que compare o payload produzido pelo editor, não apenas o builder. Testar envio e resposta num dispositivo controlado antes de afirmar compatibilidade.
4. Executar a prova física de entrega/receipt para quick reply, single-select e poll em destinatário autorizado. Registar separadamente aceitação do gateway, receipt, inbound no destinatário e UI de dois clientes.
5. Tratar limites de validação MIME/conteúdo, retenção de `mediaData` e proteção contra DNS rebinding em fatias independentes.

## Testes desta auditoria

- Gateway, diretamente com o Vitest instalado: `interactive-payload.test.ts`, `message-normalization.test.ts`, `media-reference.test.ts` e `server.test.ts` — **46 testes passaram**.
- Aplicação/Sandbox: suíte Vitest completa — **336 passaram, 62 ignorados**, 108 ficheiros, dos quais 86 passaram e 22 ficaram ignorados. Os ignorados incluem integrações que dependem de ambiente/DB; não equivalem a CI PostgreSQL.
- TypeScript: `pnpm check` na raiz — passou; `./node_modules/.bin/tsc --noEmit -p tsconfig.json` em `forte-whatsapp` — passou.
- Não executados: CI, Browser em `localhost:3002`, Chrome do utilizador, envio/receipt/inbound com WhatsApp físico, prova em segundo cliente ou comparação de package lock da PAPI.

## Referências upstream

[1]: https://github.com/WhiskeySockets/Baileys "Repositório oficial comunitário WhiskeySockets/Baileys"
[2]: https://www.npmjs.com/package/baileys/v/7.0.0-rc14 "Distribuição npm baileys 7.0.0-rc14"
[3]: https://baileys.wiki/proto-reference/Message/InteractiveMessage/classes/NativeFlowMessage "Referência upstream do proto NativeFlowMessage"


## Atualização pós-auditoria — bloqueio de captura do microfone — 2026-10-02

O utilizador testou Chrome e Edge e forneceu estes sinais da falha: `Permissions policy violation: microphone is not allowed in this document`, `NotAllowedError`, origem `http://localhost:3002`, `secureContext=true` e `mediaDevicesAvailable=true`; a permissão de site estava em «Permitir». A causa não era o botão, o contrato Baileys, credenciais nem o codec: o header global da aplicação tinha `microphone=()` (`server/_core/http-security.ts`, aplicado em `server/_core/index.ts:36-40`). A diretiva negava a chamada antes de qualquer processamento de áudio.

No working tree, a diretiva foi alterada para `microphone=(self)`, preservando `camera=()` e `geolocation=()`, e o teste de security headers foi atualizado. O suite run passou (336 testes; 62 ignorados), `pnpm check` e `git diff --check` passaram. Ainda falta reiniciar/recarregar a cópia local do utilizador e confirmar a remoção do aviso; a captação não foi executada pelo agente. Se `NotAllowedError` continuar depois da atualização, verificar permissões do OS e dispositivo. A divergência MIME/PTT descrita neste relatório continua a ser um problema separado, posterior ao início da captura.
