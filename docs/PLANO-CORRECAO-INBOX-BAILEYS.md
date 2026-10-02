# Plano de correção — Inbox e Baileys

**Estado:** proposto após auditoria documental; nenhuma correção de lógica foi implementada nesta fatia.
**Base:** branch `feat/o7.15-storage-reconciliation-observability`, commit de partida `db51134`.
**Restrições preservadas:** `CORE_ONLY_MODE = true`; não trocar provider; não usar credenciais reais; não alterar base de forma destrutiva; não fazer merge; não declarar prova física sem teste real. Cada fatia abaixo deve ser autorizada e revista individualmente.

## Ordem recomendada

| Ordem | Fatia | Arquivos prováveis | Risco | Critério de conclusão | Testes/validação |
|---|---|---|---|---|---|
| 0 | Recolher evidência runtime do microfone sem gravação de áudio | `client/src/pages/PanelPages.tsx`; roteiro de teste local, sem alterar dados | Baixo, desde que se recolham somente estado/origem/código de erro | Uma tentativa documenta `location.origin`, `isSecureContext`, presença de `mediaDevices/getUserMedia/MediaRecorder`, `Permissions API` quando disponível e `DOMException.name`; a hipótese de origem/OS/permissão fica separada | Browser autorizado no `localhost:3002`; sem capturar áudio ou credenciais. Não executado nesta auditoria por restrição de máquina do utilizador |
| 1 | Corrigir diagnóstico/estados explícitos de captura | `client/src/pages/PanelPages.tsx`; novo teste de contrato da Inbox | Baixo a médio; mensagens erradas podem orientar mal o operador | UI diferencia API ausente, contexto inseguro, permissão, dispositivo ausente/ocupado, MIME, `MediaRecorder.onerror`, Blob vazio e envio; `getUserMedia` continua diretamente ligado ao gesto; tracks são sempre encerradas | Testes unitários de mapeamento DOMException, ausência de API, limpeza de stream e sucesso; browser smoke depois, sem testar no computador do utilizador nesta execução |
| 2 | Corrigir contrato MIME/PTT de áudio entre Inbox, fila, adaptador e gateway | `client/src/pages/PanelPages.tsx`, `server/db.ts`, `server/integrations/whatsapp.ts`, `forte-whatsapp/src/instance-manager.ts`, respetivos testes | Médio; rótulo MIME incorreto afeta playback e PTT | MIME real atravessa `mediaMimeType` ou contrato canónico; voice note gravada e áudio anexado têm comportamento explícito diferente; não marcar MP3/WebM como OGG/Opus sem conversão | Testes do mapper worker→gateway para WebM/Opus, OGG/Opus, MP3 e documento; testes PTT true/false; TypeScript e suíte focada. Só depois, envio físico autorizado |
| 3 | Fixar o contrato single-select da lista nativa | `client/src/pages/PanelPages.tsx`, `server/interactive-messages.ts`, `forte-whatsapp/src/interactive-payload.ts`, `forte-whatsapp/src/interactive-payload.test.ts` | Médio; comportamento varia por contrato WhatsApp e versão do cliente | Uma forma canónica de ID (`id` ou outra, após fonte/ensaio verificado) é validada no editor, router e gateway; teste percorre metadata produzida pelo editor até JSON dentro de `buttonParamsJson`; limite/opções e IDs únicos são validados | Testes unitários e de contrato; ensaio em telefone/cliente controlado é obrigatório para declarar compatibilidade. Não misturar com microfone ou histórico |
| 4 | Fechar ciclo de entrega/echo dos interativos | `forte-whatsapp/src/message-normalization.ts`, `forte-whatsapp/src/instance-manager.ts`, `forte-whatsapp/src/delivery-status.ts` e testes | Médio; mexe em identidade/idempotência/status | Native Flow outbound/inbound não é classificado como texto por omissão; eco próprio é suprimido por ID/provider sem descartar mensagem manual; estado local separa queued, socket accepted, sent e receipt | Testes de fixtures Baileys, idempotência, `externalId` e receipts; teste de contrato de webhook; prova física separada |
| 5 | Confirmar persistência de respostas de enquete | `forte-whatsapp/src/message-normalization.ts`, entrada de webhook, DB/router da Inbox e testes | Médio; votos exigem correlacionar poll, chave e autoria sem duplicar mensagens | Criação de poll, update/voto e resultado são entidades/tipos distintos e ficam associados à mensagem original, instância e workspace; UI apresenta estado sem convertê-lo em botão/lista | Testes de normalização/tenancy/idempotência; validação com payloads sanitizados; envio/receção físicos depois |
| 6 | Corrigir uma lacuna de histórico/conversas escolhida pela matriz de eventos | Somente arquivos indicados pela `docs/MATRIZ-COBERTURA-INBOX-EVENTOS.md` | Médio a alto, dependendo de tenancy/deduplicação/replay | Selecionar um evento específico; definir persistência, idempotência, recovery e UI; manter lease/outbox e não alterar eventos fora da fatia | Teste de contrato e integração adequado; CI PostgreSQL para caminho persistente; sem replay destrutivo |
| 7 | Hardening de anexos e retenção | `server/inbox-media-upload.ts`, `server/media-storage.ts`, `server/routers.ts`, `forte-whatsapp/src/media-reference.ts`, worker e testes | Médio; pode bloquear uploads válidos ou mudar retenção | Verificar conteúdo real/MIME; testar hostname DNS para IP privado; preservar storage privado; fallback apenas com limites; política de remoção/expiração para falhas após retry; log sanitizado | Testes positivos/negativos, byte signatures, SSRF/DNS em harness controlado, limites 8 MiB e logs sem bytes; teste de integração isolado |

## Critérios comuns para cada fatia

- Não alterar mais de um domínio funcional da Inbox no mesmo conjunto de código. Em particular, **microfone, MIME/PTT, payload interativo e histórico são trabalhos separados**.
- Definir contrato antes de mudar o código e acrescentar teste que falhe no comportamento antigo.
- Manter autorização workspace-scoped, instância correta, chave idempotente e comportamento de retry.
- Não introduzir dependência nem código da PAPI; consultar apenas o comportamento documentado.
- Executar testes locais/Sandbox e CI relevantes, anotando skips; CI não substitui uma prova física.
- Se um payload externo for alterado, separar `queued`, aceite pelo gateway/socket, receipt, inbound no destino e renderização no cliente.
- Não promover para produção, desligar `CORE_ONLY_MODE` ou mesclar PR como consequência implícita.

## Próxima fatia pequena sugerida

Após a decisão do utilizador sobre a implementação, a fatia técnica mais objetivamente verificável é **contrato de MIME/PTT para áudio** (ordem 2), com testes de worker/adaptador/gateway e sem mudar a UI do microfone. A causa de não iniciar gravação permanece dependente de evidência do browser autorizado; não deve ser declarada corrigida pela alteração de MIME. Se a prioridade for a mensagem “permissão negada”, fazer primeiro somente a fatia 0/1 e não juntar o transporte do áudio.


## Atualização — Permissions Policy do microfone — 2026-10-02

Os logs que o utilizador recolheu em Chrome e Edge confirmam `Permissions policy violation: microphone is not allowed in this document`, seguido de `NotAllowedError`, apesar da permissão do site estar em «Permitir». Os logs indicam `origin=http://localhost:3002`, `secureContext=true` e `mediaDevicesAvailable=true`. A causa estava no header global `Permissions-Policy: camera=(), microphone=(), geolocation=()` de `server/_core/http-security.ts`, aplicado no middleware de `server/_core/index.ts:36-40`.

**Correção aplicada no working tree:** `microphone=(self)`; câmera e geolocalização continuam negadas. O teste `server/_core/http-security.test.ts` foi atualizado. A suíte do repositório passou (336 testes; 62 ignorados), `pnpm check` passou e `git diff --check` passou. As alterações ainda não foram commitadas.

**Próximo passo:** reiniciar/recarregar a aplicação local com esta alteração e confirmar no response header/console que a política permite microfone na origem própria e que desapareceu o aviso `microphone is not allowed`. Isto valida a policy, mas não constitui prova de gravação. Se `NotAllowedError` persistir, investigar permissões do sistema operativo, dispositivo e estado da Permissions API; não misturar essa investigação com codec/MIME. O aviso separado sobre `unload` corresponde ao listener `beforeunload` do debug collector (`client/public/__manus__/debug-collector.js:759-760`) e não causa o bloqueio do microfone.
