# Auditoria de WhatsApp, histórico e arquitetura de IA — 2026-09-28

## O chat `lid:…` e o histórico Baileys

O identificador `lid:…` mostrado na captura, isoladamente, **não indica dado de demonstração**. Em Baileys 7.x, `@lid` é uma identidade opaca que o WhatsApp usa como identificador canônico; ela pode aparecer no lugar do telefone e não deve ser convertida por suposição em número. A captura não inclui o payload nem o ID externo da mensagem, então não permite provar qual evento criou aquela conversa. [3] [4] [6]

Há um defeito concreto no caminho atual que combina com o sintoma. O gateway assina `messages.upsert`, extrai apenas `messages` e encaminha o mesmo processamento para qualquer tipo do evento (`forte-whatsapp/src/instance-manager.ts:217–219`). Baileys diferencia `notify` — entrega em tempo real — de `append` — mensagens de histórico/backfill. O gateway não lê essa classificação (`forte-whatsapp/src/instance-manager.ts:656–764`), então não consegue impedir que um lote antigo seja tratado como entrada operacional nova. [2]

O Baileys também entrega o sync inicial por `messaging-history.set`, com chats, contatos e mensagens em lotes, mas o `InstanceManager` atual não se inscreve nesse evento. [1] [2] A dependência instalada é `baileys@7.0.0-rc14` (`forte-whatsapp/package.json:16`). A hipótese mais forte para a conversa recém-aparecida é um evento próprio/manual não reconhecido como eco, ou um evento de histórico/backfill que caiu no caminho de ingestão ao vivo, com conteúdo não reconhecido. Isso é **causa provável, ainda não confirmação do registro específico**.

A outra metade do sintoma também está identificada. Quando uma mensagem não contém texto reconhecido, `normalizeBaileysMessage` a classifica como `text` e usa `[mensagem recebida]` (`forte-whatsapp/src/message-normalization.ts:62–122`). A ingestão cria contato e conversa mesmo para `fromMe`, grava a mensagem como saída humana e pausa a IA (`server/db.ts:6739–6757`, `6797–6830`). Portanto, um evento vazio ou histórico pode resultar em um chat LID com bolhas “Atendente — [mensagem recebida]”. A captura é compatível com essa combinação, mas só a linha no banco e o payload Baileys da máquina local fecham a prova.

O seed de demonstração existe e contém conversas e referências a “Gabriel”, mas o JID LID da captura não está entre esses dados. `ensureDemoInbox` só popula quando `DEMO_MODE=true` e quando ainda não há contatos (`server/db.ts:4701–4713`); o `docker-compose.local.yml` usado pelo usuário define `DEMO_MODE=false` (`docker-compose.local.yml:49–60`). Desligar a flag não remove dados que tenham sido inseridos antes. Logo, os seeds visíveis não explicam o JID específico, mas apenas consultar o banco real pode descartar definitivamente dados antigos. O antigo nome “Gabriel” no remetente era outro problema: era um fallback literal da UI, já corrigido para “Atendente” no commit de referência.

Pareamento por si só não grava contato ou mensagem no banco. A inserção ocorre quando o gateway envia evento ao webhook; o código de ingestão é que cria contato/conversa na primeira mensagem elegível. O LID observado é compatível com identidade WhatsApp válida e **não deve ser apagado ou bloqueado em lote por ser LID**.

### O que a API de histórico realmente faz

A intuição sobre histórico está certa, com uma distinção: Baileys oferece uma API de socket/eventos, não um endpoint REST do WhatsApp para o navegador. A biblioteca informa o histórico inicial pelo evento `messaging-history.set`; para buscar mensagens mais antigas, expõe `sock.fetchMessageHistory(count, oldestMsgKey, oldestMsgTimestamp)`. [1] [2] [7] O segundo método solicita mais histórico ao dispositivo principal usando um cursor; não promete todas as mensagens desde sempre. A disponibilidade e abrangência dependem do que o WhatsApp entregar ao dispositivo vinculado.

O socket atual usa `Browsers.ubuntu("Chrome")` (`forte-whatsapp/src/pairing-code.ts:12–14`) e não registra `messaging-history.set`. A configuração instalada do Baileys tem `syncFullHistory: true` por padrão, mas a documentação recomenda identidade de desktop para receber mais histórico e avisa que sync amplo aumenta tempo de inicialização e memória. O filtro padrão local também não processa o tipo `FULL`; portanto não se deve afirmar que o sistema já baixa o histórico completo. [1] [3] [5]

**Decisão recomendada para atender ao pedido:** iniciar automaticamente o sync inicial assim que a instância conectar, de forma assíncrona no gateway, com estado de progresso visível. Isso deve importar somente o conteúdo que o WhatsApp fornecer. O importador deve ser separado do atendimento ao vivo: histórico não pode acionar IA, aumentar não lidas, enviar notificação nem assumir controle humano. Mensagens antigas devem ser idempotentes, preservando direção, JID alternativo, autor do grupo e horário original. A busca de mensagens ainda mais antigas pode ocorrer sob demanda ao abrir/rolar um chat, por `fetchMessageHistory` no gateway.

## O que a IA do sistema já faz

O backend tem um roteador de provedores em `server/llm-providers.ts` com capacidades `text`, `vision`, `audio` e `document`, e provedores NVIDIA NIM, Google Gemini e OpenAI-compatible. `runNativeAgent` usa o prompt configurado ou o prompt do onboarding, carrega até 30 mensagens da conversa, inclui mídia suportada, chama o modelo e executa ferramentas do Forte. O loop é limitado a até oito etapas e cada chamada usa até 1.800 tokens de resposta (`server/native-agent.ts:184–303`). As capacidades são escolhidas pelo tipo da entrada: imagem vai a visão; áudio à rota `audio`; documentos à rota `document`.

A rota `audio` não é uma implementação de texto-para-fala. A transcrição Whisper existente é outro fluxo: `voice.transcribe` no onboarding usa consentimento específico do onboarding, asset privado assinado, trava contra processamento duplicado e telemetria (`server/routers.ts:2019–2093`). Não há uma rota geral de transcrição para áudio do chat comum, e não há capability TTS no tipo ou roteamento (`server/llm-providers.ts:4–8`). Para mensagens de áudio recebidas, o agente pode enviar um arquivo ao modelo pela rota `audio`, mas isso não equivale a uma pipeline geral e explícita de transcrição reutilizada no Inbox, no onboarding e no suporte.

O Console já tem uma rota administrativa `IA global` (`/platform-admin/ai`). A página atual configura provedores, chave mascarada, roteamento por capacidade e um prompt global (`client/src/pages/PlatformAdminPage.tsx:216–320`, `1545–1552`). A tela não representa ainda o ciclo completo de IA que você descreveu: operação de transcrição separada, visão como fluxo com prompt e limites, botões estruturados, TTS futuro, uso/custo por workspace ou um copiloto de suporte. Também existem rotas antigas `/ai-config` e `/ai-prompt` em `client/src/App.tsx:124–135` e procedimentos `agent.config/save/testConnection` (`server/routers.ts:2119–2308`), o que deixa a gestão espalhada. A recomendação é manter **uma aba de IA no Console Admin** e consolidar/aposentar essas entradas legadas.

O suporte operacional atual é diferente de um chat de ajuda. Existem sessões administrativas temporárias com workspace, escopo, motivo, expiração e auditoria (`server/platform-admin.ts:360–430`), além de simulação local do agente. Não foi encontrada uma conversa de suporte por IA na interface de workspace. O assistente de suporte deve ser um fluxo separado que pode usar o mesmo roteamento de provedor do workspace, mas precisa de prompt, ferramentas e contexto próprios. Ele não deve receber automaticamente histórico de leads nem o prompt privado de atendimento.

## Achados que precisam ser resolvidos antes de ligar a IA para clientes

### P0 — Ingestão de eventos e controle humano

1. **Separar `notify` de `append` e de `messaging-history.set`.** Só uma entrada ao vivo elegível pode abrir o fluxo de resposta. Importação/backfill deve ter origem explícita e nunca emitir `message.received` para IA. O evento Baileys ainda precisa guardar `type`, `requestId`, `syncType`, progresso e cursor.
2. **Não criar lead com mensagem vazia ou saída própria órfã.** O fallback `[mensagem recebida]` serve à apresentação, não deve ser tratado como conteúdo real que cria contato, conversa ou aciona IA. Um `fromMe` sem conversa conhecida deve ser colocado em diagnóstico/quarentena; um `fromMe` em chat conhecido pode ser gravado como outbound humano.
3. **Revalidar a instância no ponto central de ingestão.** O webhook resolve o workspace pela instância, mas `ingestInboundWhatsApp` verifica explicitamente o ownership da instância apenas para grupos (`server/db.ts:6610–6634`). Aplicar a mesma validação a mensagens individuais protege chamadas futuras e caminhos internos, não só a rota atual.
4. **Preservar o takeover como estado terminal.** Antes de cada ferramenta e antes de enviar resposta, o worker deve revalidar `aiEnabled`, `humanControlled`, workspace, instância e status da conversa. A resposta precisa ser cancelada se o atendente assumiu durante a chamada do modelo.

### P0 — Controles administrativos, egress e ferramentas

5. **Corrigir a autorização das rotas antigas.** `requirePlatformAdministrator` só exige que a pessoa seja um administrador da plataforma. As mutations antigas `agent.save` e `agent.testConnection` usam esse guard. A rota nova do Console usa `requirePlatformOperator`, que também verifica permissão de mutação (`server/platform-router.ts:32–52`, `128–147`). Um suporte configurado como somente leitura não pode conseguir alterar IA ou testar URL arbitrária pelas rotas antigas. Adicionar teste de tentativa negada.
6. **Bloquear SSRF e egress arbitrário.** `invokeConfiguredLLM` faz `fetch` para `baseUrl` configurável (`server/llm-providers.ts:160–196`). A transcrição baixa `audioUrl` por `fetch` e só verifica o limite de 16 MB depois de carregar o corpo inteiro (`server/_core/voiceTranscription.ts:120–149`). Validar esquema HTTPS, host permitido, DNS e IPs privados/metadata, redirects, timeout, MIME e tamanho durante streaming. A rota de onboarding hoje passa URL assinada interna, mas a função de base não deve ser reutilizada sem validação.
7. **Ferramentas mutáveis precisam de autorização no servidor.** O prompt manda confirmar o agendamento antes de criar, mas o modelo pode chamar `criar_agendamento` diretamente; a confirmação está no texto do prompt, não em uma autorização comprovada no serviço (`server/native-agent.ts:180–182`, `359–410`). Diferenciar leitura de escrita; validar permissões e invariantes no backend. Para efeitos que mudam agenda ou dados importantes, exigir confirmação explícita ligada a workspace, lead, ferramenta, argumentos e expiração.

### P1 — Prompts, limites, métricas e mídia

8. **Separar guardrail de prompt comercial.** Hoje a configuração global é mesclada com a configuração do workspace, dando precedência ao workspace (`server/db.ts:3821–3845`); em `runNativeAgent`, o prompt configurado substitui o onboarding, que serve de fallback (`server/native-agent.ts:194–198`). Isso não garante uma política de segurança imutável. O modelo alvo é: política do produto não removível → defaults e provedores permitidos → prompt/perfil comercial do workspace → fatos do negócio recuperados pelas ferramentas → lead, histórico e mensagem atual como dados não confiáveis → resultados de ferramentas revalidados pelo servidor. O lead não escolhe provider, modelo, ferramenta ou guardrails.
9. **Definir limites por execução e por workspace.** Existem limites de etapas/tokens e timeout da chamada ao provedor, mas o caminho atual não registra tokens/custo efetivo por chamada. O worker consome `aiRequests` antes de verificar se a IA global do agente está desligada (`server/db.ts:7817–7864`), então eventos descartados podem consumir quota. Medir chamadas, tokens, latência, falhas, retries e custo; não contar evento que não chamou provedor. Limitar por workspace, usuário/operador, evento, mídia e ferramenta.
10. **Tornar mídia privada e limitada antes de baixar.** O gateway baixa mídia para `Buffer` e pode embutir data URL em metadata (`forte-whatsapp/src/instance-manager.ts:720–735`). Exigir storage privado, asset ID e limite aplicado durante streaming; validar bytes, MIME real, tipo e duração. Definir retenção e exclusão tanto para objeto bruto como para transcrição, prompt e resultados.
11. **TTS deve existir na interface, mas continuar desligado.** Mostrar a capacidade como “Planejada/desativada”; não chamar provedor até existir rota TTS, validação de formato/duração, política de voz/consentimento, limite de custo e fallback em texto. Ações de botão também precisam ser saída estruturada validada pelo servidor, não uma promessa livre no prompt.
12. **Falhar de forma clara quando o provedor não está pronto.** A configuração runtime trata agente como habilitado por padrão (`server/db.ts:3857–3864`), enquanto os provedores padrão começam desativados (`server/llm-providers.ts:31–50`). A tela deve indicar “não configurada/teste pendente” e não deixar o workspace parecer que a IA responderá antes de provider e prompt serem publicados e validados.

### P2 — Isolamento operacional e reconciliação

13. **Separar conversas compartilhadas entre instâncias.** Contatos/conversas são únicos por workspace + contato, enquanto `instanceId` fica na metadata da mensagem. A thread pode agregar mensagens de múltiplas instâncias no mesmo contato; produto precisa escolher se isso é desejado ou se o chat deve ser por `(contato, instância)`. A consulta de unread de instância selecionada também precisa aplicar o filtro de instância (`server/db.ts:5452–5470`).
14. **Fechar os gaps de retries.** Registro do webhook, criação da mensagem e emissão do evento de domínio não são uma única transação; quedas entre as etapas podem deixar evento recebido sem mensagem, ou mensagem sem `message.received`. Criar reconciliação e retries idempotentes por `instanceId + messageId`.
15. **Planejar retenção antes de multiplicar chamadas de IA.** Definir prazo e exclusão por workspace para mensagens, mídia, prompts, transcrições, argumentos/resultados de ferramentas e logs. Não persistir corpo ou mídia em telemetria padrão; usar IDs correlacionáveis, hashes e campos redigidos.

## Arquitetura proposta para os cards do Console Admin

Os cards devem representar **capacidades operacionais**, não agentes independentes com lógica duplicada. Um único serviço backend de orquestração carrega política, workspace, capability, provider, modelo, contexto permitido, quota e trace ID; os adaptadores de tRPC, REST e worker chamam esse serviço. Isso centraliza chaves, limites e telemetria.

- **Resposta no WhatsApp:** histórico mínimo da conversa, prompt comercial publicado pelo workspace, fatos do negócio e ferramentas de leitura/escrita autorizadas. A saída deve ser contrato estruturado (`texto`, `botões`, futuramente `áudio`), validado antes de enviar.
- **Transcrição:** serviço server-side reutilizável pelo chat e onboarding, com asset privado, consentimento/purpose, idioma, tamanho/duração, status, quota e retenção próprios. Deve devolver texto/segmentos e não publicar prompts automaticamente.
- **Visão:** chamada explícita para imagem recebida, com limites de tamanho, proveniência e política própria. Compartilha o roteador de modelos, não o contexto inteiro do lead por padrão.
- **Áudio/TTS:** separar compreensão/transcrição de geração. TTS aparece desativado até implementação, revisão de custo e consentimento.
- **Ajuda Forte no workspace:** mesmo catálogo de provedores e, se autorizado, a mesma rota/modelo contratada pelo workspace; outro prompt, contexto documental do produto e ferramentas de suporte. O acesso a dados de lead deve ser opt-in, mínimo, redigido, temporário e auditado.

No Console global, ficam credenciais, provedores aprovados, defaults, limites máximos, política de produto e estado de cada capability. No workspace ficam fatos do negócio, tom, serviços, horário, política comercial e prompt publicado, sempre subordinados à regra global. A ficha do lead guarda fatos, estágio, consentimento e o toggle de IA; não deve armazenar um system prompt livre por lead. Se futuramente houver vários perfis de atendimento, o workspace escolhe perfis publicados por regra explícita e permitida pela plataforma.

Na configuração guiada, a IA de onboarding pode transcrever a voz e redigir um **rascunho** de perfil/prompt com base nas respostas do proprietário. O usuário revisa e confirma fatos; a publicação gera uma versão com rollback. Essa capability não publica regras sozinha e não usa as conversas dos leads como exemplos.

“API REST” significa um contrato HTTP com rotas como `POST /api/v1/ai/transcriptions`, autenticação e JSON. O produto já usa tRPC autenticado por sessão para ações do próprio React; para o botão do client, esse é o caminho mais simples e não exige criar uma API pública. Se houver integração externa, a REST deve ter credencial por workspace, permissões, idempotência, status/job e limites. Hoje `/api/v1` fica fechada por padrão e usa `FORTE_API_KEY` mais um único `FORTE_API_WORKSPACE_ID` do servidor (`server/api.ts:36–50`, `238–297`); **não** é uma credencial multi-tenant adequada para expor no navegador. Nenhuma chave de provider deve sair do backend.

## Ordem de execução sugerida

1. Instrumentar o caso real em modo somente leitura: comparar `contacts.externalPhone`, `messages.externalId`, `direction`, `senderType`, `provider`, `createdAt`, `metadata.jid`, `remoteJidAlt`, `fromMe` e `messageId` com `webhookEvents` e `domainEvents`. Não gravar QR, chaves ou conteúdo bruto de conversa em logs. Não limpar o banco antes de preservar essa evidência.
2. Implementar a barreira anti-poluição do inbox: classificar `notify/append/history`, recusar mensagem sem corpo como evento de atendimento e impedir que `fromMe` desconhecido crie lead. Cobrir com teste as mensagens LID, eco, texto vazio, repetição e sync.
3. Implementar importação inicial automática por instância após conexão, status assíncrono, dedupe e progresso. Nenhum lote importado pode responder IA ou alterar unread/takeover. Implementar paginação antiga por `fetchMessageHistory` depois do snapshot inicial.
4. Fechar autorização antiga, URLs/egress, tamanho de mídia, aprovação de ferramenta e reconciliação de eventos. Só então habilitar IA de lead em produção.
5. Consolidar a aba `/platform-admin/ai` em cards fixos com status “desativada/configuração pendente/validada”, teste real server-side, publicação/versionamento, orçamento e histórico de uso. Manter workspace prompt separado da política global. Redirecionar ou remover as rotas antigas depois de migração e teste de compatibilidade.
6. Construir o serviço comum de capabilities; conectar `voice.transcribe` geral/onboarding/chat pela mesma implementação server-side; adicionar visão explícita; construir depois o assistente de suporte isolado; deixar TTS como flag desligada.
7. Validar em banco temporário com duas workspaces, depois executar E2E em staging com número WhatsApp dedicado. Testar mídia e grupos no navegador. Os testes direcionados executados pelos agentes desta auditoria foram conjuntos separados, não uma única suíte completa; testes que dependem do PostgreSQL e staging real continuam sendo gates.

## Protocolo para a próxima sessão de IA

1. Verificar primeiro o ambiente atual e a branch (`git status --short --branch`, `git log -5 --oneline`, `git fetch` sem resetar arquivos). Não presumir que caminhos, browser, credenciais, banco ou addons de outra sessão continuam disponíveis.
2. Ler `PROJECT_DOCUMENTATION_INDEX.md`, `HANDOFF-CONTINUIDADE-FORTE-PANEL.md`, este arquivo, `docs/BAILEYS-INTEGRATION.md` e o trecho vigente de `AUDITORIA-TECNICA-E-ROADMAP.md`. Ler as skills de automação/integrações, workflow e pesquisa antes de construir sync/API/IA.
3. Reproduzir sem mutação: obter somente os IDs/metadata necessários do workspace local, comparar com o webhook e confirmar origem. Não executar reset global, `docker compose down -v`, remoção de volumes, limpeza de credenciais ou pareamento por cima de sessões existentes durante uma auditoria. A escolha anterior do usuário por limpeza Docker global continua registrada como pendente; antes de executar qualquer limpeza, confirmar backup e que esse ainda é o objetivo da sessão.
4. Para cada bloco: definir critérios de aceite e testes primeiro; alterar uma fatia por vez; rodar checks direcionados, `pnpm check`, typecheck do gateway, suíte relevante, `pnpm build` e `git diff --check`; separar evidência de sandbox, banco PostgreSQL, staging e WhatsApp real. Não declarar produção pronta por teste mock.
5. Atualizar este handoff, `todo.md`, índice e contratos afetados; não registrar secrets, QR, conteúdo de leads ou dumps do usuário. Commit/push só depois de revisão do diff e validação; depois verificar workflows e dar ao usuário o comando adequado ao PowerShell dele.

**Estado nesta auditoria:** inspeção somente leitura do commit `33d2ea7` em `main`. Não houve acesso ao PostgreSQL da máquina Windows, chamada a provider, pareamento, importação ou alteração de código. O handoff já estava modificado antes desta rodada; suas decisões anteriores foram preservadas. O banco real e a origem do chat continuam sem confirmação.

## Referências

[1]: https://baileys.wiki/advanced/history-sync "Baileys — History sync"
[2]: https://baileys.wiki/concepts/events "Baileys — Events"
[3]: https://baileys.wiki/faq "Baileys — FAQ"
[4]: https://baileys.wiki/concepts/jids "Baileys — JIDs"
[5]: https://baileys.wiki/concepts/socket-config "Baileys — Socket config"
[6]: https://baileys.wiki/migration/v7 "Baileys — v7 migration"
[7]: https://github.com/WhiskeySockets/Baileys/blob/master/Example/example.ts "Baileys — official example"


## Implementação da primeira fatia de proteção — 2026-09-28

O primeiro bloco preventivo foi aplicado ao código: o gateway só encaminha `messages.upsert` com `type: notify` e sem `requestId`; `append`/backfill é descartado do fluxo ao vivo. Os eventos `messaging-history.set` e `messaging-history.status` agora geram observabilidade de contagens, progresso e tipo, sem logar o conteúdo. **Isso ainda não importa nem persiste o histórico.**

O normalizador marca quando o texto exibido é apenas fallback. O adaptador leva a proveniência até a API, e `ingestInboundWhatsApp` reconhece backfill, corpo vazio e placeholder textual como eventos ignorados, sem criar lead/conversa. Antes de qualquer persistência de mídia, a função também exige que a instância Baileys esteja ativa e pertença ao workspace recebido. O webhook confirma `ignored: true` para não manter esses eventos na outbox. `notify` válido `fromMe` continua permitido para preservar mensagens humanas/takeover; a política de `fromMe` real sem conversa conhecida permanece uma decisão/validação pendente, não foi silenciosamente bloqueada.

### Validação e limitações desta fatia

`pnpm check`, `pnpm build`, typecheck separado do gateway, testes unitários direcionados e `git diff --check` passaram. A suíte local completa ficou em **197 aprovados / 46 ignorados** (42 arquivos passaram, 18 foram ignorados). Os testes PostgreSQL novos foram executados pelo workflow `PostgreSQL integration` (run `36491464735`): migrations, typecheck do gateway e suíte completa contra PostgreSQL concluíram com sucesso. A publicação de `forte-panel` e `forte-whatsapp` para `:dev` também concluiu com sucesso (run `36491464730`). Localmente, os casos PostgreSQL foram ignorados porque o sandbox não tem `DATABASE_URL` nem Docker. Não houve consulta ao banco Windows, pareamento, QR/código gerado nem envio de mensagem. O usuário autorizou um teste com seu número dedicado, mas ele deve acontecer num runtime isolado, sem IA/outbound ativado e sem gravar corpo de mensagem além do necessário. O motivo exato do chat da captura ainda depende de diagnóstico read-only da linha real.

### Próximo passo

CI PostgreSQL e publicação passaram. Próximo: preparar um gateway temporário de observação para o teste de pareamento autorizado. Em seguida implementar o importer idempotente do sync inicial, mantendo história fora da automação de IA, unread, notificações e takeover. O comportamento atual ainda não atende o pedido de importar automaticamente todas as conversas.
