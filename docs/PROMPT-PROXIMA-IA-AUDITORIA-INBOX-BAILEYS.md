# Prompt para a próxima IA — auditoria completa da Inbox, Baileys e PAPI

Você está a continuar o desenvolvimento do **Forte Panel**, um SaaS para operações comerciais via WhatsApp. Trabalhe em **português europeu** e avance uma fatia de cada vez.

## Contexto obrigatório

Repositório: `geordptoroy/forte-panel`  
Branch de trabalho: `feat/o7.15-storage-reconciliation-observability`  
Ambiente inicial: Sandbox em `/home/ubuntu/forte-panel`  
Imagens locais: GHCR com tag `dev`; não fazer build local para a stack do utilizador.  
Modo obrigatório: `CORE_ONLY_MODE = true`.  
Não usar secrets reais.  
Não fazer merge automático.  
Não executar testes na máquina do utilizador nesta fatia, salvo se o utilizador pedir explicitamente depois.

Antes de qualquer alteração, execute no repositório:

```bash
git status --short --branch
git log -1 --oneline --decorate
git remote -v
git fetch origin
git rev-parse HEAD
git rev-parse origin/feat/o7.15-storage-reconciliation-observability
```

Se a branch, o commit remoto ou o estado local divergirem, não comece a editar. Registre a divergência e corrija primeiro o contexto.

## Estado conhecido

A Inbox já suporta conversas, contactos, mensagens inbound/outbound e anexos. Após a última atualização, **anexos passaram a ser enviados**. Porém, persistem dois problemas reportados pelo utilizador:

1. O áudio não grava. O Chrome mostra que o microfone está permitido para `localhost:3002`, mas a UI continua a mostrar mensagem equivalente a “a permissão do microfone está negada” e não inicia a gravação.
2. Botões e listas aparecem como enviados no Forte, mas não chegam ao telemóvel do outro número e não aparecem corretamente no outro PC. O eco local chega a mostrar `[button]`, o que pode estar a mascarar falha ou payload inválido.

O utilizador pediu uma auditoria completa da Inbox, incluindo:

- fluxo de gravação e permissões do navegador;
- upload e envio de áudio/anexos;
- editor e contrato de botões, listas e enquetes;
- payloads esperados pelo Baileys;
- versão efetiva do Baileys no Forte;
- comparação com a versão/implementação da PAPI 1.5.1;
- eventos de conversas, histórico, status, contactos, presença e reações;
- documentação completa para a próxima fatia.

## Fontes locais autorizadas

Use apenas como referência técnica, sem copiar a PAPI como dependência:

- `client/src/pages/PanelPages.tsx`
- `server/routers.ts`
- `server/db.ts`
- `server/inbox-media-upload.ts`
- `server/storage.ts`
- `server/media-storage.ts`, se existir
- `server/interactive-messages.ts`
- `server/integrations/whatsapp.ts`
- `forte-whatsapp/src/instance-manager.ts`
- `forte-whatsapp/src/interactive-payload.ts`
- `forte-whatsapp/src/media-reference.ts`
- `forte-whatsapp/src/server.ts`
- `forte-whatsapp/package.json`
- locks e patches do pacote `forte-whatsapp`
- `forte-whatsapp/src/message-normalization.ts`
- handlers de webhook/outbox e os contratos dos eventos
- `docs/AUDITORIA-API-OPERACIONAL-PAPI-1.5.1.md`
- `docs/AUDITORIA-REVERSA-PAPI-1.5.1-PARA-FORTE.md`
- `/tmp/pastorini-root`, se ainda existir no Sandbox
- `ROADMAP-EXECUCAO-FORTE-PANEL.md`
- `HANDOFF-PROXIMO-CHAT-IA.md`

Não usar a imagem/anexo do utilizador como única evidência. A imagem deve ser interpretada apenas como contexto visual: o Chrome exibe microfone permitido, mas a aplicação continua em estado de erro.

## Objetivo da auditoria

Não implemente correções imediatamente. Primeiro produza evidência suficiente para responder:

### A. Microfone e áudio

1. Qual é o estado real de `navigator.mediaDevices`, `navigator.mediaDevices.getUserMedia`, `window.isSecureContext` e `navigator.permissions.query({ name: "microphone" })` na aplicação?
2. A origem usada é exatamente `http://localhost:3002` ou o navegador está a tratar a página como outra origem, por exemplo `127.0.0.1`, iframe, proxy ou URL diferente?
3. A UI está a confundir estes estados?
   - permissão `denied`;
   - `prompt`;
   - `granted`;
   - API ausente;
   - contexto inseguro;
   - dispositivo sem microfone;
   - `MediaRecorder` ausente;
   - erro de MIME;
   - erro durante `ondataavailable`/`onstop`.
4. O erro exibido pela UI corresponde ao erro real lançado pelo browser? Verifique especialmente `NotAllowedError`, `PermissionDeniedError`, `SecurityError`, `NotFoundError`, `NotReadableError`, `OverconstrainedError` e `AbortError`.
5. O `getUserMedia` é chamado diretamente por uma ação do utilizador ou existe algum estado/evento que remove a ativação do gesto?
6. A aplicação chama `getUserMedia` mais de uma vez, mantém uma stream antiga, não encerra tracks, ou mantém estado de erro depois de uma permissão concedida?
7. Qual MIME é escolhido pelo `MediaRecorder`? O resultado é `audio/webm`, `audio/ogg`, `audio/mp4` ou outro? Esse formato é aceitável para voice note/áudio no Baileys?
8. O áudio gravado chega ao upload, ao worker e ao gateway? Em que ponto falha?
9. O Chrome está a permitir o microfone, mas a UI está a consultar uma permissão antiga, uma origem diferente ou um estado React obsoleto?
10. Recomende uma correção técnica com estados explícitos e mensagens diferentes para permissão, hardware, MIME, gravação, upload e envio.

Não diga apenas “pedir permissão de novo”. A auditoria deve identificar a causa no código e propor instrumentação segura, sem expor dados sensíveis.

### B. Botões, listas, enquetes e payload Baileys

1. Qual é o contrato atual entre editor da Inbox, `metadata`, router, banco, worker, adaptador WhatsApp e gateway?
2. O botão de envio fica habilitado quando existe somente uma mensagem interativa sem texto livre?
3. Quais campos são enviados atualmente?
   - body/texto;
   - header;
   - footer;
   - `buttonText`;
   - `buttons`;
   - `sections`;
   - `rows`;
   - IDs estáveis;
   - títulos e descrições;
   - `selectableCount` para enquete;
   - contexto de dispositivo;
   - `messageVersion`.
4. O gateway usa `sendMessage`, `relayMessage` ou ambos? Em que formato?
5. O payload usa o envelope correto esperado pelo Baileys atualmente?
6. Compare cuidadosamente:
   - `interactiveMessage`;
   - `nativeFlowMessage`;
   - `buttons`/`sections` legados;
   - `quick_reply`;
   - `single_select`;
   - `buttonParamsJson`;
   - `messageParamsJson`;
   - `header`, `body`, `footer`, `headerType`;
   - `viewOnceMessage` ou outro envelope, se necessário;
   - `contextInfo` e `deviceListMetadata`, somente se a versão exigir.
7. Confirme os campos obrigatórios com a versão efetivamente instalada do Baileys e com documentação/código upstream atual. Não deduza a partir de exemplos antigos.
8. Verifique se o `relayMessage` está a receber exatamente a estrutura que a versão instalada serializa corretamente.
9. Verifique se o retorno de `relayMessage` é realmente um `messageId`. Se não for, corrija o tratamento do `externalId` sem quebrar idempotência.
10. Verifique se o normalizador de eco está a interpretar o próprio payload como `[button]` e a criar uma falsa aparência de sucesso.
11. Verifique se o webhook inbound do destinatário ou o status de entrega confirma ou rejeita a mensagem.
12. Compare a versão do Baileys do Forte com a versão usada pela PAPI 1.5.1. Registre a diferença, mas não copie a PAPI como dependência.
13. Explique se botões/listas antigos são incompatíveis ou descontinuados na versão atual e se a alternativa correta é native flow, template aprovado, lista interativa suportada ou outro tipo.
14. Para enquetes, verifique se o contrato de envio e de normalização é independente de botões/listas.

A auditoria deve separar claramente:

- erro no editor da Inbox;
- erro no contrato tRPC/DB;
- erro no worker/adaptador;
- erro no payload Baileys;
- erro de compatibilidade com o WhatsApp atual;
- falha apenas de echo/local UI.

### C. Anexos e regressões

Como anexos passaram a funcionar após a última versão, confirme que a correção não introduziu riscos:

1. storage privado continua sendo preferido;
2. fallback transitório só aceita data URLs validadas;
3. limite de 8 MB é aplicado;
4. MIME e extensão não são confiados cegamente;
5. `mediaData` não fica retido desnecessariamente após o envio;
6. URLs externas continuam limitadas a HTTPS e não permitem SSRF;
7. áudio usa `ptt` quando apropriado;
8. documento, imagem, vídeo e áudio chegam ao Baileys com o tipo correto;
9. o log informa a causa técnica sem vazar conteúdo do arquivo.

### D. Conversas, histórico e eventos

Audite a cobertura real, não apenas os nomes:

- `messages.upsert`;
- `messages.update`;
- `messaging-history.set`;
- `chats.update`;
- `contacts.update`;
- `presence.update`;
- `messages.reaction`;
- `groups.update`;
- `group-participants.update`;
- labels/etiquetas, se suportadas.

Para cada evento, determine:

- onde entra;
- como é autenticado;
- como é associado à instância;
- como é associado ao workspace;
- se é idempotente;
- se pode duplicar contacto/conversa/mensagem;
- se é persistido;
- se atualiza a Inbox;
- se é recuperável quando o webhook falha;
- se há teste de contrato.

## Entregáveis obrigatórios

Não parar apenas com uma explicação no chat. Criar e atualizar os seguintes documentos:

1. `docs/AUDITORIA-COMPLETA-INBOX-BAILEYS.md`
   - diagnóstico detalhado;
   - evidências com caminhos e linhas;
   - matriz de fluxo ponta a ponta;
   - causa provável por problema;
   - diferença entre Forte, Baileys e PAPI;
   - riscos;
   - correções em ordem de prioridade;
   - testes locais/Sandbox, CI e testes físicos posteriores separados.

2. `docs/AUDITORIA-BAILEYS-INTERACTIVE-AUDIO.md`
   - versão do Baileys;
   - contrato de botões/listas/enquetes;
   - envelope e campos obrigatórios;
   - `relayMessage` versus `sendMessage`;
   - contrato de áudio/voice note;
   - comparação objetiva com PAPI 1.5.1;
   - referências upstream utilizadas.

3. `docs/MATRIZ-COBERTURA-INBOX-EVENTOS.md`
   - tabela com cada evento, entrada, normalização, persistência, tenancy, idempotência, retry, UI e testes.

4. `docs/PLANO-CORRECAO-INBOX-BAILEYS.md`
   - fatias pequenas e ordenadas;
   - cada fatia com arquivos, risco, critério de conclusão e teste;
   - não misturar microfone, payload interativo e histórico numa única alteração de código.

5. `docs/PROMPT-PROXIMA-IA-AUDITORIA-INBOX-BAILEYS.md`
   - atualizar este prompt com descobertas novas, mas não apagar as restrições.

6. Atualizar:
   - `ROADMAP-EXECUCAO-FORTE-PANEL.md`;
   - `HANDOFF-PROXIMO-CHAT-IA.md`.

## Regras de execução

- Não copiar código da PAPI diretamente para o Forte.
- Não adicionar dependência da PAPI.
- Não mudar o provedor WhatsApp nesta fatia.
- Não ativar resposta automática do agente.
- Não desligar `CORE_ONLY_MODE`.
- Não usar credenciais reais.
- Não fazer alterações destrutivas na base.
- Não fazer merge.
- Não declarar que o WhatsApp físico foi validado sem teste físico real.
- Se a evidência não for suficiente, escrever “não confirmado” e explicar o que falta.
- Se houver correção de código, parar antes de implementar e apresentar primeiro a auditoria e o plano, a menos que o utilizador autorize explicitamente a implementação.

## Resultado esperado no final

Entregar um relatório compreensível para leigos e útil para desenvolvimento, respondendo objetivamente:

1. Por que o Chrome diz que o microfone está permitido mas a Inbox continua a dizer que está negado?
2. Por que o áudio não começa a gravar?
3. Por que anexos agora funcionam e qual risco permanece?
4. Por que botões/listas não chegam ao destinatário?
5. O problema é a versão do Baileys, o formato do payload, o editor, o worker, o eco ou uma combinação?
6. Quais capacidades da PAPI ainda faltam no Forte para a Inbox ficar operacional?
7. Qual é a próxima fatia pequena e verificável?

A próxima IA deve terminar com:

- lista de fatos confirmados;
- lista de hipóteses;
- bloqueadores;
- plano de correção em ordem;
- documentos criados/atualizados;
- testes realmente executados;
- testes que continuam pendentes.


---

## Addendum — auditoria concluída em 2026-10-02

A auditoria foi concluída a partir do commit `db51134abe5bad57bbb5e420b8047ae425746b92` na branch `feat/o7.15-storage-reconciliation-observability`. HEAD local e remoto estavam alinhados. **Não foi alterado código de produto**; apenas documentação foi criada/atualizada. `CORE_ONLY_MODE` permanece `true`; não foram usados secrets reais, nem houve merge, teste na máquina do utilizador ou envio para WhatsApp real.

### Descobertas confirmadas

- Forte usa `baileys@7.0.0-rc14` (`forte-whatsapp/package.json` e lockfile); `relayMessage` da distribuição retorna `Promise<string>`. Não inferir entrega física a partir desse retorno.
- O aviso específico de permissão do microfone só é selecionado para `NotAllowedError`. O fluxo não consulta `navigator.permissions.query`; a causa concreta no Chrome/origem `localhost:3002` continua **não confirmada**, porque esta execução não teve acesso ao browser/dispositivo do utilizador.
- Recorder tenta WebM/Opus primeiro; a metadata de upload/fila/adaptador usa `mediaMimeType`, mas o gateway consulta `mimetype`. O gateway pode, portanto, enviar WebM anunciado como OGG/Opus e marca áudio como PTT por omissão. Este problema não explica a rejeição de captura pré-upload.
- O editor da lista gera `rows[].rowId`; a fixture do payload nativo usa `rows[].id`; o builder preserva a secção sem conversão. O Forte envia listas como Native Flow `single_select`; a auditoria prévia da PAPI descreve `listMessage` legado. A causa da não entrega/renderização no telefone continua **não confirmada**.
- `queued` é persistência local. A resposta `status: sent` do gateway é o retorno do método Baileys; não prova entrega, read receipt ou renderização. O normalizador/echo não classifica Native Flow como tipo nativo e pode suprimi-lo como texto vazio.
- `messaging-history.set` é devolvido como `202 ignored` antes de ownership/tenancy, ledger e ingestão; não confundir outbox entregue com histórico importado.
- `messages.upsert` e `messages.update` têm caminho de implementação e status na UI, com lacunas de E2E; chats/contacts/presence/groups/participants/labels não têm handlers dedicados encontrados. `messages.reaction` tem suporte parcial dentro de upsert, sem associação confirmada à mensagem-alvo. Consultar a matriz para cada detalhe e ressalva.
- Storage privado outbound é preferido; fallback data URL é limitado/validado e `mediaData` é removido após sucesso, mas fica retido para retry em erro. MIME/extensão não são validados por conteúdo e o filtro de URL não resolve/fixa DNS. Storage privado inbound depende de `FORTE_MEDIA_PRIVATE_STORAGE_ENABLED=true`.
- A versão exata do Baileys embutido na PAPI 1.5.1 está **não confirmada**; `/tmp/pastorini-root` não existe e a documentação PAPI anterior não regista o lockfile dessa imagem.

### Resultados de validação e entregáveis

- Suite do repositório no Sandbox: 336 testes passaram; 62 foram ignorados (86 ficheiros passaram, 22 ignorados). Não equivale a CI/PostgreSQL sem skips.
- Testes focados do gateway: 46 passaram; TypeScript raiz e do gateway passaram.
- Não executados: Chrome do utilizador, envio/receipt/read em telefone, segundo cliente WhatsApp Web, comparação do package lock PAPI e CI PostgreSQL.
- Relatórios: `docs/AUDITORIA-COMPLETA-INBOX-BAILEYS.md`, `docs/AUDITORIA-BAILEYS-INTERACTIVE-AUDIO.md`, `docs/MATRIZ-COBERTURA-INBOX-EVENTOS.md` e `docs/PLANO-CORRECAO-INBOX-BAILEYS.md`.

### Próxima IA

Usar o plano de correção como sequência, mas **não implementar correções sem autorização explícita**. Manter microfone, MIME/PTT, lista/Native Flow, eventos/histórico e hardening de anexos em fatias separadas. O próximo passo de diagnóstico runtime do microfone deve recolher apenas origem, `isSecureContext`, disponibilidade das APIs, estado da Permissions API e nome/código da exceção — sem gravar áudio nem testar no computador do utilizador sem pedido explícito. O plano sugere, como primeira fatia técnica depois de autorização, o contrato MIME/PTT de áudio, com testes do worker/adaptador/gateway.

As restrições das secções anteriores deste prompt continuam válidas e prevalecem sobre este addendum.


---

## Addendum posterior — Permissions Policy do microfone — 2026-10-02

**Nova evidência do utilizador:** Chrome e Edge mostram `Permissions policy violation: microphone is not allowed in this document` antes de `NotAllowedError`; a permissão de site está em «Permitir». O objeto de erro informa `origin=http://localhost:3002`, `secureContext=true`, `mediaDevicesAvailable=true`. Isto identifica a política HTTP do documento, não o botão, credenciais nem codec, como causa do bloqueio de captura.

No commit de base, `server/_core/http-security.ts` enviava `camera=(), microphone=(), geolocation=()`; o middleware global está em `server/_core/index.ts:36-40`. **Correção já aplicada no working tree:** `microphone=(self)`, sem abrir câmera/geolocalização; teste atualizado em `server/_core/http-security.test.ts`. A suite passou com 336 testes e 62 skips, `pnpm check` passou e `git diff --check` passou. O código ainda não foi commitado/publicado e o utilizador ainda tem de reiniciar/atualizar `localhost:3002` e confirmar a remoção da violação. A captura real não foi iniciada pelo agente.

O aviso `unload is not allowed` é separado e corresponde ao listener `beforeunload` no debug collector `client/public/__manus__/debug-collector.js:759-760`; não confundir com a violação do microfone. Se o erro do microfone persistir após carregar a policy nova, investigar permissão OS/dispositivo/Permissions API. Não misturar com MIME/PTT, lista ou teste WhatsApp físico.
