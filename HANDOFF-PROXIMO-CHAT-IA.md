# Handoff — Forte Panel

## Contexto do produto

O Forte Panel está sendo transformado de um conjunto de superfícies beta/demo em um SaaS público de operação comercial para negócios atendidos por WhatsApp. A ordem estratégica é: saneamento público, onboarding simples, WhatsApp confiável, lead e Inbox, orçamento, agenda, recebimento, IA supervisionada, Console Admin de produção e, por fim, planos/cobrança/escala.

O repositório é `geordptoroy/forte-panel`, branch `main`, no caminho `/home/ubuntu/forte-panel`. A instrução operacional vigente é avançar fatia por fatia, documentar tudo, publicar no Git e continuar quando o usuário disser “Próximo”. Os testes completos podem ser pulados quando o usuário mantiver essa instrução; os gates de typecheck, build e diff devem continuar sendo executados.

## Último estado conhecido

A P0.5 criou `client/src/release-catalog.ts`, um catálogo tipado com estados `public_ready`, `internal_only`, `simulation_only` e `not_ready`. O `client/src/core-mode.ts` consulta esse catálogo para decidir o que fica exposto durante a contenção. A navegação reduzida de `PanelLayout` usa `CORE_NAV_ROUTES` em vez de duplicar os caminhos.

No modo atual, ficam expostos no núcleo operacional `/whatsapp-connection`, `/inbox` e `/platform-admin/*`. As demais rotas são catalogadas, mas continuam bloqueadas até suas fatias funcionais. Login, cadastro, recuperação, reset e convite continuam públicos no fluxo de autenticação.

A O1.1 adicionou o wizard público de seis passos em `client/src/pages/OnboardingPage.tsx`. A estrutura visual é:

| Passo | Conteúdo | Estado técnico |
|---|---|---|
| 1. Negócio | Nome, segmento e descrição | Usa `onboarding.profile` e autosave |
| 2. Serviços | Oferta, preço, duração e regra de orçamento | Persiste no perfil atual; catálogo detalhado fica para O1.2 |
| 3. Operação | Área, horários e profissionais | Persiste no perfil atual; disponibilidade detalhada fica para O1.2 |
| 4. Atendimento | Tom, FAQ, limites, humano e qualificação | Usa confirmação humana por bloco |
| 5. Revisão | Checklist, áudio/texto, conflitos e confirmações | Mantém consentimento e revisão existentes |
| 6. Ativação | Retenção, publicação e conexão WhatsApp | Conexão fica habilitada somente depois de publicar |

O wizard é uma camada de experiência. Ele não substitui a validação server-side: publicação continua exigindo os blocos obrigatórios confirmados, sem conflitos pendentes e com checklist completo.

## Arquivos alterados nesta fatia

- `client/src/pages/OnboardingPage.tsx`: wizard, separação dos blocos, navegação e etapa de ativação.
- `ROADMAP-EXECUCAO-FORTE-PANEL.md`: O1.1 marcada como concluída e O1.2 definida como próxima.
- `O1.1-ENTREGA-ONBOARDING-WIZARD.md`: decisões, escopo, critérios e pendências.
- `HANDOFF-PROXIMO-CHAT-IA.md`: este handoff.
- `PROJECT_DOCUMENTATION_INDEX.md`: deve apontar para os dois documentos novos no commit final desta fatia.

## Estado funcional atual

O onboarding já possui contratos persistidos e procedures para sessão, autosave, perfil, checklist, consentimento, retenção, áudio, transcrição, proposta estruturada, missing fields, conflitos, confirmação, publicação versionada e rollback. O código atual ainda tem blocos administrativos de métricas e histórico de versões; eles foram agrupados nas etapas de revisão/ativação para não ficarem misturados com o primeiro formulário.

O onboarding continua classificado como `not_ready` no release catalog enquanto não houver prova completa com banco persistente, navegador, microfone, canal WhatsApp e publicação real. Não liberar `/onboarding` no gate apenas porque a UI foi reorganizada.

## O1.2 concluída — catálogo operacional

A etapa de Serviços do onboarding agora consulta e grava `services` com nome, preço, duração e ativo/pausado. A etapa de Operação consulta `professionalsDetailed`, permite cadastrar profissional, marcar dias de atendimento e vincular serviços. O texto livre foi preservado para regras variáveis e observações que ainda não foram detalhadas. A entrega está documentada em `O1.2-ENTREGA-CATALOGO-OPERACIONAL.md`.

## Próxima ação recomendada

A próxima fatia é **O2.1 — Saúde do WhatsApp e ciclo de conexão**. O trabalho deve auditar QR/pairing, estados da instância, reconexão, polling, erros acionáveis e isolamento multi-instância antes de liberar o caminho operacional.

## Regras de produto que não podem ser quebradas

O cliente final não deve ver termos como provider, webhook, token, prompt técnico ou gateway como requisito de configuração. A IA pode transcrever, estruturar e redigir rascunhos, mas não pode inventar preço, prazo, disponibilidade, política ou promessa. Toda publicação precisa de confirmação humana e versão com rollback.

O Forte Panel registra recebimentos manuais; não deve afirmar que cobrou ou liquidou o cliente. O WhatsApp precisa sempre preservar workspace, instância, JID, externalId, direção e status. Envio outbound deve falhar fechado quando a instância não for explícita. Seeds/demo ficam restritos a ambientes autorizados e não podem contaminar signup ou produção.

O Console Admin é control-plane interno. Ações de suporte devem exigir autorização, motivo e auditoria. O administrador pode ajudar a criar rascunho, simular e revisar, mas não publicar silenciosamente em nome do cliente.

## Gates e bloqueios

O gate técnico da última alteração deve ser executado antes do commit. O gate de produto continua pendente para prova manual com PostgreSQL persistente, microfone e número WhatsApp real. Não apagar dados nem alterar secrets. Não desligar `CORE_ONLY_MODE` antes de fechar o caminho WhatsApp → Inbox → lead.

## Como continuar no próximo chat

Começar dizendo que vai verificar o checkout, ler `ROADMAP-EXECUCAO-FORTE-PANEL.md`, `FORTE-PANEL-FONTE-DE-VERDADE.md`, este handoff e `O1.1-ENTREGA-ONBOARDING-WIZARD.md`, além de inspecionar o código real de serviços/profissionais/agenda. Não confiar apenas na documentação: comparar sempre com `client`, `server`, `drizzle` e `forte-whatsapp`.

Depois executar a próxima fatia vigente de ponta a ponta, mantendo mudanças atômicas, atualizando o roadmap a cada fatia e publicando o commit. O usuário quer continuidade direta e costuma responder somente “Próximo”.

**Commit da fatia:** `commit da fatia atual` — `feat: connect onboarding to operational catalog`
**Branch esperada:** `main` sincronizada com `origin/main`.


## O1.3 concluída — regras e simulação segura — 2026-10-01

A etapa de Revisão do onboarding agora permite testar exemplos com o rascunho atual antes da publicação. A nova procedure `onboarding.simulate` é tenant-scoped, determinística e não chama provider externo. Ela consulta o catálogo operacional e a disponibilidade do workspace autenticado, reconhece pedidos de preço, horário e transferência humana e falha fechado quando não existe fonte aprovada. Cada execução gera auditoria `onboarding_simulation_run`.

A tela `client/src/pages/OnboardingPage.tsx` oferece exemplos prontos, mensagem livre, resposta simulada, fontes usadas e indicação de transferência. A entrega está documentada em `O1.3-ENTREGA-REGRAS-E-SIMULACAO.md`; não foi necessária migration.

Validações executadas: `pnpm check`, `pnpm build`, `pnpm exec vitest run server/onboarding.test.ts server/onboarding-structured.test.ts` com 9 testes aprovados e `git diff --check`. A prova persistente com dois workspaces, navegador e staging continua pendente.

## Próxima ação

A próxima fatia é **O1.4 — Retomada, autosave, missing/conflict e empty states**. Auditar a recuperação de sessão, hidratação do perfil, autosave após interrupção, estados de carregamento/erro/vazio e a consistência entre respostas do formulário, catálogo e revisão antes de alterar o gate público.


## O1.4 concluída — retomada e resiliência — 2026-10-01

A tela do onboarding agora tem loading explícito e erro com retry para recuperação de sessão/perfil. Sessões pausadas retomam automaticamente e oferecem uma ação manual se a retomada falhar. A hidratação não sobrescreve edições locais sujas.

O autosave foi serializado no cliente: uma gravação pendente bloqueia uma segunda gravação concorrente, mudanças feitas durante a requisição continuam marcadas como `dirty` e são salvas depois, e falhas oferecem retry sem perder o perfil. A revisão mostra estado vazio quando não há respostas estruturadas; serviços e profissionais distinguem loading, vazio e erro.

A entrega está documentada em `O1.4-ENTREGA-RETOMADA-E-RESILIENCIA.md`. Validações: `pnpm check`, `pnpm build`, 12 testes focados aprovados e `git diff --check`. A prova manual com rede interrompida, reload e PostgreSQL persistente continua pendente.

## Próxima ação histórica
Esta seção registrava a entrada da O2.1; ela foi concluída abaixo. A continuidade vigente é O2.2.


## O2.1 concluída — saúde do WhatsApp e ciclo de conexão — 2026-10-01

A auditoria confirmou o lifecycle multi-instância do gateway: registry persistente por `instanceId`, lock por sessão, autoStart, QR, pairing por código, reconexão após queda não intencional e isolamento tenant-scoped no Panel.

O probe interno `GET /ready` agora verifica todas as instâncias e retorna `503` com `failedInstances` quando qualquer sessão está em erro, em vez de olhar somente a instância default. O Panel também traduz respostas de erro JSON do gateway para mensagens acionáveis sobre conexão inexistente, QR ausente, sessão já conectada, serviço não configurado e timeout.

Entrega documentada em `O2.1-ENTREGA-SAUDE-WHATSAPP.md`. Validações: `pnpm check`, typecheck do `forte-whatsapp`, build do gateway, 35 testes focados e `git diff --check`. As dependências próprias do gateway foram restauradas com `npm ci`; o comando reportou vulnerabilidades existentes no audit, sem aplicar upgrade automático.

## Próxima ação

A próxima fatia é **O2.2 — Inbound idempotente e histórico sem efeitos colaterais**. Auditar webhook/outbox, deduplicação por `eventId`, histórico Baileys, mensagens de grupo, fromMe/echo do Panel, persistência de JID e status observável antes de liberar o caminho WhatsApp → Inbox.


## O2.2 concluída — inbound idempotente e histórico — 2026-10-01

A auditoria confirmou que o callback Baileys registra `eventId` por workspace antes dos efeitos, rejeita instâncias desconhecidas/inativas, valida grupos, preserva instanceId/JID/direção/status e deduplica no webhook e na tabela de mensagens. Histórico não cria unread, lead, takeover ou evento de IA. Grupos ficam isolados por workspace + instância + JID, com participantes e autores. `fromMe` manual vira outbound humano e pausa IA; echoes do próprio Panel são filtrados sem ocultar mensagens manuais.

Foi corrigida uma corrida real do `WebhookOutbox`: a escrita concorrente usava `rename`, que pode substituir um arquivo e recriá-lo depois da primeira entrega. A criação agora usa `fs.link` atômico após arquivo temporário, garantindo um item e uma entrega por eventId mesmo com oito enqueues concorrentes. O teste novo cobre essa condição.

Entrega documentada em `O2.2-ENTREGA-INBOUND-IDEMPOTENTE.md`. Validações: typecheck do gateway, 38 testes aprovados e `git diff --check`; seis testes de integração PostgreSQL foram pulados porque o sandbox não possui banco configurado.

## Próxima ação vigente

A próxima fatia é **O2.3 — Outbound com `instanceId`, fila e reconciliação**. Auditar `queueOutboundMessage`, adapter Baileys, idempotency key, estados de envio, retries, falhas do gateway, reconciliação por externalId e a apresentação desses estados no Inbox.


## O2.3 concluída — outbound, fila e reconciliação — 2026-10-01

A auditoria confirmou que o outbound usa mensagem persistida como unidade de trabalho, claim condicional, estados `queued`/`processing`/`sent`/`failed`, tentativas limitadas, `lastError`, `sentAt`, `externalId` e evento `message.sent`. O adapter envia para a rota da instância explícita e inclui uma chave estável baseada no ID da mensagem.

A entrada REST e as chamadas internas agora exigem `instanceId` para Baileys antes de criarem fila ou contato; o envio manual do Inbox falha fechado quando não resolve uma única conexão. O worker disputa o claim antes de consumir cota, devolve a mensagem à fila quando limitado e só incrementa tentativa quando o envio realmente pode começar.

Entrega documentada em `O2.3-ENTREGA-OUTBOUND-FILA-RECONCILIACAO.md`. Validações: `pnpm check`, `pnpm build`, 30 testes de adapter/API/roteamento/estado e `git diff --check`. A prova PostgreSQL com dois workers, timeout após envio e gateway real continua pendente.

## Próxima ação vigente

Esta instrução foi executada na seção **O2.4 concluída** abaixo; a continuidade vigente agora é O3.1.


## O2.4 concluída — mídia privada e composer — 2026-10-01

O composer do Inbox continua oferecendo imagem, áudio, vídeo e documento, mas agora o servidor valida data URL, MIME coerente e limite de tamanho; o cliente também bloqueia MIME desconhecido antes de carregar o arquivo. A gravação de áudio mantém o limite de 10 minutos.

Quando `FORTE_MEDIA_PRIVATE_STORAGE_ENABLED=true`, mídia inbound e outbound é persistida em storage privado tenant-scoped. O outbound não grava mais base64 no JSON da mensagem: mantém chave, MIME, tamanho e nome; o worker resolve uma URL assinada temporária antes de chamar o gateway. O histórico autorizado hidrata somente URLs assinadas. Sem storage configurado, a validação server-side continua ativa e o comportamento legado permanece compatível para desenvolvimento.

Entrega documentada em `O2.4-ENTREGA-MIDIA-PRIVADA-COMPOSER.md`. Validações: `pnpm check`, `pnpm build`, typecheck do gateway, 28 testes de mídia/adapter/API/roteamento e `git diff --check`. A prova real com Forge/S3 e URL expirada continua pendente por falta de credenciais no sandbox.

## Próxima ação vigente

A próxima fatia é **O3.1 — Lead unificado entre contato, conversa e oportunidade**. Auditar criação/atualização de lead pelo WhatsApp, vínculo canônico entre contato/conversa/oportunidade, deduplicação por workspace/telefone, histórico de mudanças e estados observáveis no CRM.


## O3.1 concluída — lead unificado — 2026-10-01

O contato já era a entidade canônica do telefone normalizado por workspace, com conversa 1:1 e mensagens ligadas à conversa. A auditoria confirmou isolamento de grupos por instância/JID e deduplicação do inbound por evento/mensagem.

A ficha do lead agora retorna e exibe as oportunidades (`quotes`) vinculadas ao mesmo contato, com serviço, descrição, valor, status e atualização. O total denormalizado `contacts.quoteCents` passou a ser recalculado a partir dos quotes não cancelados na criação e na atualização de status/recebimento, evitando sobrescrita quando há múltiplos orçamentos.

Entrega documentada em `O3.1-ENTREGA-LEAD-UNIFICADO.md`. Validações: `pnpm check`, `pnpm build`, 16 testes aprovados e 6 testes PostgreSQL pulados por ausência de banco no sandbox; `git diff --check` aprovado.

## Próxima ação vigente

A próxima fatia é **O3.2 — Inbox operacional com assignment e follow-up**. Auditar atribuição por operador, estado de follow-up, filtros de responsabilidade, SLA/pendências, notificações e visibilidade tenant-scoped no Inbox.
