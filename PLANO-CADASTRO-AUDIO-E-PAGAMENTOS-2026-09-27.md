# Forte Panel — melhorias encontradas, cadastro com onboarding por áudio e pagamentos

**Data:** 2026-09-27
**Estado:** backend, UI inicial, retenção, proposta estruturada, perguntas de acompanhamento, telemetria e publicação versionada com rollback implementados; validação PostgreSQL/staging continua pendente
**Escopo:** lacunas restantes da base, funil de cadastro/onboarding com respostas em áudio, e modelo completo de orçamento, meios de pagamento e conciliação.
**Documentos relacionados:** [`PLANO-AUDITORIA-E-EXECUCAO-2026-09-27.md`](./PLANO-AUDITORIA-E-EXECUCAO-2026-09-27.md) (P0–P3 em execução), [`PRODUCT_SCOPE.md`](./PRODUCT_SCOPE.md), [`ESTRATEGIA-PRODUTO-PUBLICO-MULTICONTA.md`](./ESTRATEGIA-PRODUTO-PUBLICO-MULTICONTA.md), [`API_CONTRACT.md`](./API_CONTRACT.md), [`todo.md`](./todo.md).

## 1. Resumo executivo

Esta etapa responde a três perguntas: **o que mais na base pode melhorar**, **como estruturar o funil em que o lead responde por áudio sobre o próprio negócio** e **como fazer os pagamentos**, já que a área de orçamento atual não oferece as escolhas necessárias.

Três conclusões:

1. A base técnica está sólida no que já foi atacado (tenancy explícito, quotas, console, QR), mas há lacunas reais que impedem o autoatendimento: **o onboarding e a configuração da IA só podem ser feitos pelo operador da plataforma**, não pelo dono do negócio; **não existe cadastro público, verificação de e-mail, convite ou recuperação de senha**; e **não existe captura de áudio ligada a nenhuma rota** — o serviço de transcrição está no repositório, mas desconectado da API.
2. O funil de cadastro precisa ser um **checklist estruturado, retomável e com fonte de verdade no banco**, não um conjunto de campos de texto livre dentro de `workspaceSettings`. Cada bloco respondido em áudio deve ser transcrito, estruturado em JSON validado, revisado pelo dono e só então publicado.
3. O financeiro hoje é **um contador manual por orçamento**. Falta composição de itens, plano de pagamento, meios aceitos, sinal, parcelamento, datas de vencimento, histórico de recebimentos, recibo, dados de recebimento do workspace e conciliação. Sem isso, o cliente não consegue escolher como será pago nem o painel consegue provar o que entrou.

Regra de sequência mantida: **nada de cadastro público aberto antes de P0 fechado e do gate de staging**, conforme já registrado no plano de auditoria. Este documento adiciona blocos P1/P2 próprios, sem antecipar o lançamento.


### 1.1 Reconciliando a auditoria anexada: dois onboardings diferentes

A auditoria anexada trouxe uma distinção essencial que precisa ficar explícita:

- **Onboarding do negócio/cliente da plataforma:** o empresário configura empresa, catálogo, equipe, agenda, políticas e comportamento da IA. É o fluxo descrito na Parte 2 anterior.
- **Onboarding conversacional do lead:** o cliente final do empresário entra pelo WhatsApp, dá consentimento e responde a uma entrevista de qualificação, por áudio ou texto. Esse lead não cria uma conta na plataforma nem configura o negócio.

O fluxo do lead deve ser modelado separadamente como `leadIntakeSessions`, `leadIntakeQuestions`, `leadIntakeAnswers`, `leadConsents`, `mediaAssets`, `transcriptions` e `conversationHandoffs`. O `OnboardingPage` atual é do primeiro tipo e não deve ser reaproveitado como se fosse a entrevista do lead.

Fluxo correto do lead:

```text
inbound WhatsApp texto/áudio
→ criar/atualizar contact + conversation de modo idempotente
→ consent_pending (se houver áudio/IA/transcrição)
→ aviso sobre finalidade, retenção, provedor e opção humana
→ uma pergunta por turno, áudio pré-gravado/TTS quando suportado, texto sempre como fallback
→ resposta armazenada em mídia privada
→ transcrição assíncrona
→ mostrar transcrição/origem/confiança
→ confirmação explícita do valor
→ próxima pergunta ou handoff humano
→ projeção dos fatos confirmados no CRM
```

Regras herdadas da auditoria anexada:

- Estados de consentimento: `consent_pending`, `accepted`, `denied`, `withdrawn`, `expired`. Sem `accepted`, nenhum job de STT/LLM é criado. Recusa ou revogação interrompe áudio/IA e oferece texto/humano.
- O áudio real precisa ser validado no payload Baileys: não basta `messageType = audio`; o sistema precisa receber bytes/URL, MIME, tamanho e, se disponível, duração. Falha de download, MIME não suportado ou arquivo vazio nunca pode virar texto inventado.
- `FORTE_MEDIA_PRIVATE_STORAGE_ENABLED=false` hoje deixa data URL no `metadata` JSONB. Para produção, mídia deve ser privada por padrão, com ownership `workspace + message`, hash, retenção, URL assinada curta e autorização no proxy.
- `instanceId`/canal precisam ter ownership relacional verificável. Não basta `FORTE_API_WORKSPACE_ID` fixo no processo; `event.instanceId`, segredo do webhook, canal e workspace devem corresponder ao mesmo registro.
- Respostas manuais devem preservar o `provider`, `instanceId` e `jid` da mensagem inbound mais recente da conversa. O `defaultPapiWebhook` só pode ser usado para mensagens legadas sem metadado de origem, e isso deve ficar identificado como fallback.
- O booleano `contact.aiEnabled`/`conversation.humanControlled` não basta para handoff. O worker precisa de `handoffId`, estado, responsável e `controlVersion`/fencing token, revalidando a versão imediatamente antes do outbound. Se o humano assumir enquanto o LLM processa, a resposta da IA é cancelada.
- Contato, mensagem, consentimento inicial e evento de transcrição devem ser atômicos ou protegidos por outbox transacional; retries concorrentes do mesmo áudio não podem duplicar mensagem, job ou resposta.
- O Inbox precisa expor consentimento, player privado, status de transcrição, confiança/proveniência, correção, Assumir/Devolver/Retomar e fallback textual. A gravação enviada pelo operador também não deve trafegar como data URL exposta.
- O questionário do lead deve ser versionado e ter `expectedType`, `validationSchema`, `required`, `retryLimit` e ordem. `qualificationRules` em texto livre não pode ser usado como máquina de estados.

Essa separação evita misturar os dados do empresário com os fatos do lead e deixa claro que o áudio de entrada acontece no canal WhatsApp, não na tela de criação de conta do empresário.

### 1.2 Guia de levantamento assistido por IA

O guia operacional completo está em [`GUIA-LEVANTAMENTO-ONBOARDING-ASSISTIDO-IA.md`](./GUIA-LEVANTAMENTO-ONBOARDING-ASSISTIDO-IA.md). A decisão é não transformar as 72 perguntas da auditoria recebida em um formulário linear. O onboarding usará um núcleo P0 de 10 blocos, perguntas condicionais por segmento e aprofundamento progressivo.

O prestador poderá responder por áudio ou texto, alternar entre os dois e retomar depois. A cadeia será: captura → transcrição → extração em JSON validado → detecção de lacunas/conflitos → rascunho da regra da área atual → prévia curta daquela área → correção/confirmação rápida → consolidação final → confirmação curta para publicação → versão → simulação → ativação. A IA melhora a redação, mas não pode inventar preço, política, prazo, serviço ou disponibilidade. O prompt completo ficará disponível por link/accordion opcional, sem obrigar o prestador a ler um texto grande.

O administrador da plataforma poderá visualizar respostas, transcrições, fatos extraídos e versões do prompt para suporte, sempre com workspace autorizado, motivo, masking e auditoria. Ele poderá sugerir alterações e criar rascunhos, mas não publicar silenciosamente no lugar do prestador.

## 2. Parte 1 — O que mais pode ser melhorado na base

### 2.1 Prioridade imediata (P0 de produto, antes de convites)

| #   | Achado                                                                                                                                                                                                                                                                                                | Evidência                                                                                                          | Impacto                                                                                                                                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Onboarding e prompt da IA são exclusivos do operador da plataforma.** `onboarding.profile` e `onboarding.save` usam `requirePlatformAdministrator`, e `/onboarding`, `/ai-config` e `/ai-prompt` estão atrás de `PlatformOnlyGuard`.                                                                | `server/routers.ts:883`, `server/routers.ts:886`, `client/src/App.tsx`, `client/src/components/AccessGuard.tsx:39` | O dono do negócio não consegue configurar a própria empresa. O suporte da plataforma precisa editar o prompt comercial do cliente — inversão de responsabilidade e risco de LGPD/operacional. |
| 2   | **Não existe cadastro público nem ciclo de identidade.** Não há `/signup`, verificação de e-mail, aceite de convite, recuperação de senha, nem política de sessão para autoatendimento; o login é apenas local ou OAuth e a própria tela diz que o acesso é "criado pelo proprietário da instalação". | `client/src/pages/LoginPage.tsx`, `server/routers.ts:280`                                                          | Bloqueia o fluxo "lead entra → responde → vira cliente". É pré-requisito do funil por áudio.                                                                                                  |
| 3   | **Login local sem limitação de tentativas.** Nenhum rate limit, atraso progressivo, lockout ou auditoria de falha em `auth.localLogin`.                                                                                                                                                               | `server/routers.ts:280`, ausência de `express-rate-limit`                                                          | Força bruta e enumeração de contas na superfície mais exposta do produto.                                                                                                                     |
| 4   | **Sem proteção de origem/CSRF nas mutações tRPC.** O cookie usa `sameSite: "none"` quando a requisição é HTTPS (exigência do fluxo OAuth), e não há checagem de `Origin`/`Referer` nem token duplo.                                                                                                   | `server/_core/cookies.ts`, `server/_core/index.ts`                                                                 | Mutações (financeiro, equipe, canal) ficam expostas a requisições cross-site com cookie válido.                                                                                               |
| 5   | **Deduplicação de mensagens é global, não por tenant.** `messages_external_id_unique_idx` é único apenas em `externalId`; a checagem de duplicidade no código é por workspace, mas o índice do banco é global.                                                                                        | `drizzle/schema.ts:691`, `drizzle-pg/0010_message_metadata_and_deduplication.sql:15`, `server/db.ts:3890`          | Dois workspaces que recebam o mesmo identificador de evento do provider colidem no banco. Risco de perda/erro cruzado entre empresas.                                                         |
| 6   | **`contacts.workspaceId` é anulável.** O índice único é `(workspaceId, externalPhone)`, mas a coluna aceita `NULL`.                                                                                                                                                                                   | `drizzle/schema.ts:625`                                                                                            | Linhas órfãs e lógica de três valores em consultas de isolamento. A migration `0017` já mostrou o padrão correto (backfill + `SET NOT NULL`).                                                 |

### 2.2 Operação, dados e coerência (P1)

| #   | Achado                                                                                                                                                                                                                                                                                                 | Evidência                                                                                                                                                  | Impacto                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 7   | **`contacts.quoteCents` é desnormalizado e desatualiza.** O valor é gravado ao criar o orçamento, mas nunca recalculado em edição, cancelamento ou pagamento; o Dashboard soma esse campo em vez da tabela `quotes`, e `receivedMonthCents` está fixo em `0`.                                          | `server/db.ts:3495`, `server/db.ts:3328` (`getDashboardSnapshot`), `server/db.ts:3417` (`listQuotes`)                                                      | "Pendente" e "Aguardando resposta" do painel mentem, e não existe receita do mês.                               |
| 8   | **`unreadCount` nunca é limpo.** O inbound incrementa `contacts.unreadCount` e `conversations.unreadCount`, mas não há marcação de leitura em CRM; só notificações têm `readAt`. Além disso os dois contadores podem divergir.                                                                         | `server/db.ts:3929`, `server/db.ts:4046`, ausência de `markRead` para contatos                                                                             | Contrato e integração Inbox/Dashboard agora separam unread de `awaitingResponse`; leitura transacional por operador continua pendente. |
| 9   | **Sem paginação.** `listInboxContacts` devolve todos os contatos do workspace sem limite; listas de console e funil seguem o mesmo padrão.                                                                                                                                                             | `server/db.ts:3018`                                                                                                                                        | Degradação previsível com alguns milhares de contatos; hoje não há aviso nem fallback.                          |
| 10  | **Estágios do funil sem validação no servidor.** `moveStage` aceita qualquer string de 1 a 80 caracteres; a lista canônica de 11 estágios existe apenas no código de demonstração do cliente.                                                                                                          | `server/routers.ts:1645`, `client/src/lib/demoData.ts:67`                                                                                                  | Estágios divergentes, colunas fantasmas e lixo no Kanban — o "Não classificado" previsto no plano de auditoria. |
| 11  | **Workspace suspenso devolve mensagem errada.** A suspensão usa `active = 0`, e o guard então responde "Sua conta não possui exatamente um workspace ativo", como se fosse problema de membership.                                                                                                     | `server/platform-admin.ts:1122`, `server/_core/trpc.ts:21`                                                                                                 | Suporte e cliente não sabem distinguir suspensão de vínculo ausente.                                            |
| 12  | **Fallback para o workspace demo ainda existe em caminhos vivos.** `resetWorkspaceDevelopmentData(workspaceId?)` cai em `ensureDemoWorkspace()` e apaga `workspaceSettings` (inclusive segredos criptografados); o módulo legado `whatsappChannels` continua sendo lido no console e apagado no reset. | `server/db.ts:2183`, `server/db.ts:1036`, `server/db.ts:191`, `server/routers.ts:12`                                                                       | Reset destrutivo com alvo implícito e modelo de canal duplicado convivendo com `whatsappInstances`.             |
| 13  | **`DEMO_MODE` é fail-open.** O modo demo é considerado ativo quando a variável está ausente (`!== "false"`), então qualquer execução fora do Compose cria workspace demo e semeia contatos.                                                                                                            | `server/db.ts:973`, `server/db.ts:2423`                                                                                                                    | Um staging com variável esquecida nasce com dados fictícios e o workspace `forte-demo`.                         |
| 14  | **Branding fixo em um único cliente.** Título do app, descrição do Dashboard e um rótulo da sidebar citam "Gabriel"; os seeds também.                                                                                                                                                                  | `client/index.html:7`, `client/src/pages/PanelPages.tsx:326`, `client/src/components/PanelLayout.tsx:550`, `server/db.ts:2537`                             | Produto multiempresa vazando identidade de um cliente específico.                                               |
| 15  | **Rótulo de navegação divergente da tela.** A página foi renomeada para Conexão WhatsApp, mas a sidebar ainda mostra "Canais conectados".                                                                                                                                                              | `client/src/components/PanelLayout.tsx:105`, `client/src/pages/PanelPages.tsx:2317`                                                                        | Incoerência direta com o P1.1 já executado.                                                                     |
| 16  | **Página de faturamento duplicada com dados fictícios.** Existem duas `BillingPage`: a rota usa a persistida; `PanelPages.tsx` mantém uma versão com dados de demonstração, ainda importada e empacotada. O Kanban e o detalhe do contato também leem `stageOrder`, `getContact` e campos demo.        | `client/src/pages/BillingPage.tsx`, `client/src/pages/PanelPages.tsx:2123`, `client/src/pages/PanelPages.tsx:2192`, `client/src/pages/PanelPages.tsx:2233` | Código morto empacotado, risco de tela "falsa" reaparecer e confusão de manutenção.                             |
| 17  | **Índices ausentes nos caminhos de leitura quentes.** `quotes` não tem índice por `(workspaceId, createdAt)` embora a listagem ordene por data; `messages` não tem índice por `(conversationId, createdAt)` para a thread.                                                                             | `drizzle/schema.ts:795`, `server/db.ts:3417`, `server/db.ts:3048`                                                                                          | Consultas com scan conforme o volume cresce.                                                                    |

### 2.3 Engenharia, higiene e DX (P2)

| #   | Achado                                                                                                                                                                                                                                                                          | Evidência                                                                                           | Impacto                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 18  | **Sem lint e sem typecheck/build em PR.** Não há ESLint nem script de lint; o workflow de PostgreSQL roda apenas migrations e testes, e `pnpm check`/`pnpm build` só aparecem no workflow de publicação, disparado na `main`.                                                   | `package.json`, `.github/workflows/postgres-integration.yml`, `.github/workflows/publish-image.yml` | Erro de tipo e de build entra na `main` sem barreira.                               |
| 19  | **Configuração pnpm ignorada.** O `package.json` mantém `pnpm.patchedDependencies` e `pnpm.overrides`, campos que o pnpm 10 não lê mais; o patch de `wouter` pode não estar sendo aplicado. O install também ignora os scripts de build de `@tailwindcss/oxide` e `esbuild`.    | saída de `pnpm install`, `package.json`, `patches/wouter@3.7.1.patch`                               | Patch silenciosamente inativo e risco de binding nativo faltando em clone limpo/CI. |
| 20  | **Artefatos de template e código morto versionados.** `template.json`, `ComponentShowcase.tsx` (1.437 linhas, sem rota), `client/public/__manus__/debug-collector.js` (25 kB servido publicamente) e `scripts/*.py` de patch pontual com caminhos absolutos `/home/ubuntu/...`. | `git ls-files`, `scripts/replace_inbox.py`                                                          | Peso, ruído e risco de exposição desnecessária no build de produção.                |
| 21  | **Árvore de migrations legada duplicada.** `drizzle/` contém SQL com sintaxe MySQL (`AUTO_INCREMENT`, backticks) e `drizzle/migrations` vazio, enquanto `drizzle-pg/` é a árvore canônica do PostgreSQL.                                                                        | `drizzle/0000_melted_skin.sql`, `drizzle-pg/meta/_journal.json`                                     | Ambiguidade sobre qual árvore é a verdade; convite a erro de migration.             |
| 22  | **Repositório sem README nem LICENSE, com 29 documentos e sobreposição.** Três documentos de roadmap/handoff se cruzam e não há porta de entrada para quem chega novo.                                                                                                          | `git ls-files`, raiz do repositório                                                                 | Custo de onboarding alto e risco de decisão tomada sobre documento desatualizado.   |
| 23  | **Sem observabilidade de correlação.** Existe heartbeat do worker e readiness, mas não há `correlationId`/`requestId` no tRPC/API nem logging estruturado.                                                                                                                      | `server/_core/index.ts`, `server/platform-admin.ts:252` (apenas `requestId` de sessão de suporte)   | Diagnóstico de produção depende de logs soltos.                                     |
| 24  | **LGPD apenas planejada.** Nenhuma tabela ou procedure de consentimento, exportação, anonimização/exclusão ou retenção de contato/mensagem; só buckets de uso têm retenção.                                                                                                     | busca por `consent`/`lgpd`/`retenção` sem resultado no servidor                                     | Gate obrigatório antes de cadastro público, já previsto em P3.                      |
| 25  | **`.env.local.example` com bloco duplicado.** As variáveis `BAILEYS_*` aparecem duas vezes.                                                                                                                                                                                     | `.env.local.example:31-39`                                                                          | Erro de configuração por copiar/colar.                                              |
| 26  | **Bundle único de 691 kB.** Build passa, com aviso de chunk acima de 500 kB; `PanelPages.tsx` (2.466 linhas) e `PlatformAdminPage.tsx` (1.400 linhas) concentram tudo.                                                                                                          | saída de `pnpm build`                                                                               | LCP/INP ruim em 3G, já mapeado no P1.3.                                             |

### 2.4 Não refazer

Continuam válidos e não devem ser reabertos: tenancy com `workspaceId` do contexto, quotas por workspace/usuário com janela de minuto, worker outbound com `queued`, alertas de 70%/90%, console interno com sessão escopada e auditoria, prompt versionado com rollback, criptografia de segredos em repouso, lock de sessão Baileys e backup/restore local. O trabalho aqui é **adicionar produto por cima**, não reescrever a fundação.

## 2.5 Achados adicionais reutilizáveis da auditoria de CRM e atendimento

A segunda auditoria anexada complementa a primeira com pontos de operação que não estavam explícitos no documento original:

- **Efeito colateral de auditoria cross-tenant:** `moveContactStage`/`setContactAi` podem não alterar nenhuma linha quando recebem um `contactId` de outro workspace, mas ainda assim gravar `auditLogs` com o ID recebido. Toda mutação deve conferir `rowCount` antes de gerar evento.
- **Integridade relacional incompleta:** `conversations` não carrega `workspaceId` próprio e `messages` depende do join via conversation/contact. Além de `contacts.workspaceId NOT NULL`, criar FKs/constraints e decidir se `workspaceId` redundante em conversation/message/media será usado como barreira adicional.
- **Telefone não normalizado:** formatos `+55`, `55`, pontuação e JID podem criar contatos duplicados. Implementado no slice atual: chave canônica compartilhada antes do upsert, identidade `lid:`/`group:` separada quando aplicável e JID normalizado preservado para o roteamento. A auditoria somente leitura está disponível em `pnpm exec tsx scripts/audit-contact-duplicates.ts --workspace=<id> --json`; a migração de registros históricos equivalentes continua sendo uma tarefa de staging, sem consolidação automática.
- **Canal de resposta pode estar errado:** `sendManualMessage` resolve instância por `defaultPapiWebhook`, em vez de usar a instância de origem da conversa/última mensagem. Toda resposta deve sair pelo `channelId/instanceId` validado da conversa.
- **Caixa compartilhada versus ACL:** hoje todo membro ativo pode listar, enviar, pausar IA, adicionar notas e mover contatos. Isso pode ser uma decisão válida para caixa compartilhada, mas precisa ser registrada; se não for, implementar assignment, equipe e ACL por contato/mídia.
- **`awaiting_response` não é unread:** deve ser derivado da última inbound versus última outbound válida, separadamente de leitura por usuário (`lastReadMessageId`/cursor). Abrir a thread deve marcar leitura de forma transacional, sem alterar a lógica de resposta pendente.
- **Estados da mensagem precisam aparecer:** `queued`, `processing`, `sent` e `failed` hoje podem parecer apenas um Check na UI. Inbox deve mostrar estado, erro sanitizado e retry, além de invalidar/refrescar após webhook e worker.
- **Métricas ainda artificiais:** `daysNoReply = 0`, `receivedMonthCents = 0`, snapshots em memória e limites de hoje/mês pelo timezone do processo. KPIs devem ser agregados server-side a partir de mensagens/contatos/orçamentos/agendamentos, usando `workspace.timezone`.
- **Funil precisa de histórico:** além de validar os 11 estágios, persistir `fromStage`, `toStage`, ator, motivo, timestamp, duração/SLA e terminalidade `open/won/lost`. `Sem retorno` e `Perdido` não devem ser tratados como etapas abertas comuns.
- **Contato precisa de ciclo de vida e proveniência:** separar lead/cliente, origem, responsável, opt-out, data de conversão e vínculo com `services` em vez de manter `serviceRequested` como texto livre sem origem.
- **Testes obrigatórios adicionais:** cross-tenant audit side effect, mesmo telefone em formatos diferentes, resposta pela mesma instância, unread/read/awaiting, timezone, status outbound, stage desconhecido e concorrência de webhook.

Esses pontos devem entrar no B1/B2 antes de liberar o lead intake por áudio em beta ampliado.

### 2.6 Decisão de acesso para o cadastro público

O produto terá duas camadas de identidade, que não devem ser misturadas:

1. **Cadastro público do cliente do Forte Panel:** e-mail + senha, com criação do owner e de um workspace em `onboarding`. O cadastro não pede segredo de deployment nem dá acesso ao console da plataforma.
2. **Administrador da plataforma:** bootstrap interno controlado por `LOCAL_ADMIN_EMAIL`, `LOCAL_ADMIN_PASSWORD`, `PLATFORM_ADMIN_OPEN_IDS`/`OWNER_OPEN_ID` e secrets do ambiente. Isso serve para operação e suporte do Forte Panel, não para cadastrar cada empresário.

Para produção, os valores de bootstrap devem vir de secret manager, ser fortes e rotacionáveis; não existe “senha global” compartilhada entre clientes. O signup público inicial pode funcionar sem confirmação de e-mail enquanto a entrega de e-mail não estiver configurada, mas deve manter rate limit, hash de senha, aceite versionado, recuperação preparada e opção de ativar `EMAIL_VERIFICATION_ENABLED=false` por configuração. Confirmação de e-mail e Google OAuth ficam planejados, feature-flagged e desligados até configurar e testar os provedores.

## 3. Parte 2 — Funil de cadastro e onboarding por áudio

### 3.1 Princípio

O lead entra, conversa por áudio sobre o próprio negócio e sai com uma empresa configurada, revisada por ele e pronta para operar. O áudio é **um atalho de entrada**, não a fonte de verdade: a fonte de verdade é o dado estruturado que o dono confirma. Nada é publicado sem revisão explícita, e nenhuma credencial ou dado sensível deve ser pedido por voz.

Fluxo macro:

```text
convite/beta ou cadastro público
→ conta pública com e-mail + senha
→ confirmação de e-mail (fase posterior, feature flag desligada até provedor configurado)
→ workspace criado com status "onboarding"
→ funil guiado por blocos (áudio ou formulário, o lead escolhe)
→ transcrição + estruturação por LLM com validação de schema
→ perguntas de acompanhamento nos campos vazios ou de baixa confiança
→ pré-preenchimento do catálogo, agenda, equipe e perfil da IA
→ revisão bloco a bloco pelo dono
→ simulação de conversa
→ publicação da versão do agente
→ conectar WhatsApp
→ revisão financeira (como recebe)
→ workspace passa a "active" e o checklist vira operação
```

### 3.2 Blocos do funil, perguntas e campos

Cada bloco tem pergunta falada sugerida, campos estruturados obrigatórios, destino no modelo e critério de conclusão.

| #   | Bloco                | Pergunta falada sugerida                                                                                          | Campos estruturados                                                                                               | Destino                                       |
| --- | -------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 0   | Conta e acesso       | (formulário)                                                                                                      | nome, e-mail, senha, aceite de termos/política versionados, fuso, idioma                                          | `users`, `consentRecords`, `workspaces`       |
| 1   | Identidade           | "Fale o nome do seu negócio, o que você faz, para quem e desde quando."                                           | nome, segmento, descrição curta, cidade/UF, área de atendimento (bairros/raio), tempo de mercado                  | `workspaces`, `onboardingProfile.business`    |
| 2   | Oferta               | "Quais serviços você vende, quanto costuma cobrar e quanto tempo leva cada um?"                                   | lista de serviços com nome, modelo de preço (`fixed`/`starting_at`/`quote`), valor ou faixa, duração, observações | `services` + `onboardingProfile.offer`        |
| 3   | Execução             | "Quem executa esses serviços e quantas pessoas atendem?"                                                          | profissionais (nome, especialidade), vínculo serviço↔profissional                                                | `professionals`, `professionalServices`       |
| 4   | Agenda               | "Quais dias e horários vocês atendem? Trabalham sábado, domingo, feriado? Tem intervalo de almoço?"               | jornada por dia da semana, intervalo, duração padrão, prazo mínimo para agendar, política de reagendamento        | `availability`, `onboardingProfile.schedule`  |
| 5   | Atendimento e IA     | "Como você quer que a IA fale com o cliente? O que ela nunca deve dizer ou prometer?"                             | tom de voz, palavras/condutas proibidas, FAQ aprovada, quando transferir para humano, critérios de qualificação   | `onboardingProfile.tone/faq/handoff`          |
| 6   | Política comercial   | "Como funciona sinal, cancelamento e orçamento sem compromisso?"                                                  | política de cancelamento, sinal, validade do orçamento, política de negociação                                    | `onboardingProfile.policy` (alimenta Parte 3) |
| 7   | Recebimento          | "Como você costuma receber: Pix, dinheiro, cartão, transferência? Costuma pedir sinal? Parcela em quantas vezes?" | meios aceitos, chave Pix e titular, CNPJ/CPF, % de sinal padrão, máximo de parcelas, juros, dados do recibo       | `workspacePaymentSettings` (Parte 3)          |
| 8   | Canal                | "Você já tem o número de WhatsApp que vai usar para atendimento?"                                                 | decisão de número (novo/existente), confirmação de que o número não está em uso comercial crítico                 | conexão Baileys                               |
| 9   | Revisão e publicação | (tela de revisão + simulação)                                                                                     | confirmação bloco a bloco, prompt gerado, versão publicada                                                        | `agentPromptVersions`                         |

Regras de fluxo:

- **Escolha por bloco:** "responder por áudio" ou "preencher formulário". O formulário é o caminho garantido quando transcrição falha, está desligada por feature flag ou o ambiente não tem o serviço de voz.
- **Retomável:** o lead pode sair e voltar; o estado fica em `onboardingSessions.currentStep`.
- **Não bloqueia o essencial:** blocos 1, 2 e 5 são obrigatórios para publicar o agente; 3, 4 e 7 podem ficar como pendência visível no checklist, com a IA respondendo "consultar a equipe" nos temas não configurados.
- **Confirmação explícita:** cada bloco termina com "confere isso?" mostrando os campos extraídos, com botões _Editar_, _Falar de novo_ e _Confirmar_.
- **Áudio curto:** 20 a 120 segundos por resposta, com transcrição incremental e feedback visual de duração/nível.

### 3.3 Pipeline de conversão de áudio em dado estruturado

1. **Captura** no navegador via `MediaRecorder` (opus/webm), limite de duração e de tamanho, indicador de gravação e opção de regravar.
2. **Upload** em storage privado com URL assinada, referência por workspace. Hoje existe apenas o proxy de leitura `/manus-storage/*` e não há endpoint de upload — esta é a primeira peça nova a ser construída.
3. **Transcrição** com o serviço já existente (`server/_core/voiceTranscription.ts`), hoje sem nenhuma rota ligada a ele. Precisa de um `voice.transcribe` tenant-aware, com `language: "pt"`, limite de duração e erro tratado (`FILE_TOO_LARGE`, `INVALID_FORMAT`, `SERVICE_ERROR`).
4. **Estruturação** por LLM com saída validada por schema Zod específico do bloco, retornando por campo: valor, origem (`audio`/`form`), confiança e trecho de evidência. Campos com confiança baixa viram pergunta de acompanhamento.
5. **Pergunta de acompanhamento** apenas para o que faltou: "Você comentou que trabalha sábado, mas não disse o horário. Qual o horário de sábado?"
6. **Pré-preenchimento** das entidades reais (serviços, profissionais, disponibilidade) em estado de rascunho, sem efeito colateral em agenda nem em envio externo.
7. **Revisão e publicação** pelo dono; a publicação gera nova versão do prompt e registra auditoria.

Guardas obrigatórios:

- **Consentimento de voz:** finalidade, base legal e retenção registrados em `consentRecords` antes da primeira gravação.
- **Retenção do áudio bruto:** padrão excluir o arquivo após transcrição confirmada (por exemplo, 30 dias configurável), mantendo transcrição e dado estruturado.
- **Sem segredos por voz:** se a transcrição detectar termos como senha, token, chave, cartão ou código, o campo é descartado e a tela pede entrada manual.
- **PII mínima:** áudio não é enviado a terceiros além do provedor de transcrição já configurado, e isso precisa constar na política de privacidade.
- **Fail-closed:** sem provedor configurado, o bloco oferece formulário, nunca fica travado.

### 3.4 Modelo de dados proposto

| Tabela                     | Papel                            | Campos principais                                                                                                                                               |
| -------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onboardingSessions`       | instância do funil por workspace | `workspaceId`, `status` (`em_andamento`, `aguardando_revisao`, `concluido`, `abandonado`), `currentStep`, `startedAt`, `completedAt`, `createdByUserId`         |
| `onboardingStepAnswers`    | resposta estruturada por bloco   | `sessionId`, `stepKey`, `source` (`audio`/`form`/`llm`), `transcript`, `structured` (jsonb), `confidence` (jsonb por campo), `confirmedAt`, `confirmedByUserId` |
| `onboardingAudioAssets`    | áudio bruto e seu ciclo de vida  | `sessionId`, `stepKey`, `storageKey`, `mimeType`, `durationMs`, `sizeBytes`, `transcriptStatus`, `expiresAt`                                                    |
| `onboardingChecklistItems` | checklist visível de pendências  | `workspaceId`, `key`, `required`, `status`, `blockedReason`, `completedAt`                                                                                      |
| `consentRecords`           | consentimento versionado         | `workspaceId`, `subjectUserId`, `document` (`terms`/`privacy`/`voice`), `documentVersion`, `purpose`, `legalBasis`, `acceptedAt`, `ip`, `userAgent`             |


Para o **lead intake conversacional**, não reutilizar essas tabelas como se fossem o cadastro do empresário:

| Tabela | Papel | Campos principais |
| --- | --- | --- |
| `leadIntakeSessions` | entrevista ativa por conversa | `workspaceId`, `contactId`, `conversationId`, `channelId`, `instanceId`, `version`, `status`, `currentQuestionId`, `consentId`, `controlVersion`, `startedAt`, `lastActivityAt`, `completedAt`, `expiresAt` |
| `leadIntakeQuestions` | roteiro versionado | `workspaceId`, `version`, `key`, `sequence`, `promptText`, `promptAudioStorageKey`, `fallbackText`, `expectedType`, `validationSchema`, `required`, `retryLimit`, `enabled` |
| `leadIntakeAnswers` | resposta confirmável | `workspaceId`, `sessionId`, `questionId`, `sourceMessageId`, `transcriptId`, `normalizedValue`, `fieldKey`, `confidence`, `confirmationStatus`, `confirmedAt`, `correctedByUserId` |
| `leadConsents` | consentimento por finalidade | `workspaceId`, `contactId`, `sessionId`, `purpose`, `legalBasis`, `policyVersion`, `noticeTextHash`, `channel`, `sourceMessageId`, `decision`, `grantedAt`, `withdrawnAt`, `expiresAt` |
| `mediaAssets` | arquivo privado de áudio/mídia | `workspaceId`, `messageId`, `storageKey`, `privateState`, `mimeType`, `sizeBytes`, `durationMs`, `sha256`, `instanceId`, `retentionUntil`, `deletedAt` |
| `transcriptions` | resultado assíncrono do STT | `workspaceId`, `mediaAssetId`, `messageId`, `status`, `provider`, `model`, `language`, `text`, `segments`, `confidence`, `errorCode`, `retryCount`, `retentionUntil` |
| `conversationHandoffs` | máquina de controle humano/IA | `workspaceId`, `contactId`, `conversationId`, `sessionId`, `state`, `reasonCode`, `assignee`, `controlVersion`, `acceptedAt`, `resolvedAt` |

Complementos necessários:

- `workspaces.status = "onboarding"` passa a ser usado de verdade: empresa nasce em onboarding e só vira `active` quando o checklist obrigatório fecha (ou por liberação manual auditada do suporte).
- `onboardingProfile` deixa de ser um blob de texto livre e passa a ser **projeção derivada** das respostas estruturadas, mantendo o formato atual apenas para compatibilidade do gerador de prompt.
- Convites: `workspaceInvites` (e-mail/usuário, papel, token, expiração, aceito por) e `passwordResetTokens` completam o ciclo de identidade.

### 3.5 Checklist de operação (o que o dono vê depois)

1. Empresa identificada e revisada.
2. Ao menos um serviço ativo com modelo de preço definido.
3. Ao menos um profissional ativo com serviços vinculados.
4. Jornada semanal cadastrada para cada profissional ativo.
5. Perfil da IA publicado (versão visível).
6. Formas de recebimento configuradas.
7. WhatsApp conectado.
8. Teste de conversa simulado aprovado.
9. Convite da equipe (opcional para operar, recomendado).

## 4. Parte 3 — Orçamentos, meios de pagamento e conciliação

### 4.1 Situação atual

A tela de faturamento cria um orçamento com contato, nome do serviço, valor, descrição e vencimento, além de permitir trocar status e marcar como pago; existe uma lista de status de sete valores e um total simples. Não há itens, validade, desconto, histórico, recibo, nem registro estruturado de como o cliente final pagou. O texto da tela assume corretamente "controle manual, sem gateway de pagamento". A decisão de produto desta etapa é manter assim: o Forte Panel **não cobra o cliente final, não processa cartão, não cria checkout e não terá gateway para cobrança do cliente do empresário**. Ele apenas permite enviar a chave Pix do próprio empresário pelo WhatsApp e registrar manualmente o recebimento informado pelo empresário ou por seus funcionários, seja por Pix, maquininha, dinheiro, transferência ou outro meio usado na loja.

Referências: `client/src/pages/BillingPage.tsx`, `server/routers.ts:1125`, `server/db.ts:3438`, `server/db.ts:3508`, `drizzle/schema.ts:795`.

### 4.2 Escolhas que faltam (o que o produto precisa oferecer)

**Composição do orçamento**

- Itens vindos do catálogo (`services`) ou linha livre, com quantidade, valor unitário e duração.
- Desconto em valor ou percentual, com motivo.
- Validade da proposta ("válida até"), prazo de execução, escopo/endereço e observações de materiais.
- Soma automática de total, sinal e saldo, sem permitir divergência entre itens e total.

**Condição comercial registrada no orçamento**

O sistema não monta uma cobrança nem cobra o cliente final. Ele registra a condição combinada para organização interna e para o follow-up:

- pagamento antes do procedimento, no dia, depois do procedimento ou sinal combinado;
- valor esperado, data combinada e observação livre;
- desconto autorizado, quando houver;
- opcionalmente, parcelas/promessas internas para acompanhamento — sem gerar checkout, boleto, cobrança automática ou link de pagamento.

**Meios informativos e registro manual**

- Pix: chave do workspace que pode ser copiada e enviada pela conversa do WhatsApp; o sistema não confirma automaticamente que o Pix caiu.
- Maquininha: registrar bandeira/forma apenas como informação opcional, sem integração com a máquina.
- Dinheiro, transferência, débito, crédito ou outro: registrar manualmente o meio informado pelo empresário/funcionário.
- O lançamento exige `paidAt`, valor, meio, responsável pelo registro e observação; pode anexar referência/recibo externo, mas não captura dados de cartão.
- Não haverá boleto, link de pagamento, checkout, recorrência, cobrança automática, split, conciliação bancária ou webhook de PSP nesta fase.

**Status financeiro mais granular**

`rascunho` → `enviado` → `em_negociacao` → `aprovado` → `aguardando_sinal` → `sinal_recebido` → `em_execucao` → `concluido` → `pago` / `pago_parcialmente` → `vencido` → `cancelado` / `estornado`.

Os sete valores atuais (`orcamento`, `aguardando_aprovacao`, `aprovado`, `sinal_pendente`, `parcialmente_pago`, `pago`, `cancelado`) precisam de migration com mapa explícito, preservando histórico.

**Documentos e comprovação**

- Recibo simples por recebimento, com número sequencial por workspace.
- Orçamento imprimível/PDF para enviar ao cliente.
- Extrato por período: recebido, a receber, vencido, taxas.
- Exportação CSV para contabilidade.

**Conciliação e segurança financeira**

- Ledger de recebimentos imutável (nada de sobrescrever contador).
- Toda mutação financeira auditada com `actorUserId` e motivo.
- Estorno com referência ao recebimento original.
- Permissões: visualizar, registrar recebimento, conceder desconto acima do limite e cancelar com valores.
- Nenhum dado de cartão trafega ou é armazenado pelo Forte Panel; não existe PSP nesta fase.

### 4.3 Modelo de dados proposto

| Tabela                     | Papel                           | Campos principais                                                                                                                                                                                                                                                                                             |
| -------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `quotes` (evoluir)         | cabeçalho do orçamento          | manter `workspaceId`, `contactId`, `status`, `dueDate`; adicionar `quoteNumber`, `currency`, `validUntil`, `subtotalCents`, `discountCents`, `discountReason`, `totalCents`, `paymentPlanType`, `depositCents`, `installments`, `executionWindow`, `termsSnapshot`, `approvedAt`, `sentAt`, `createdByUserId` |
| `quoteItems`               | itens do orçamento              | `quoteId`, `workspaceId`, `serviceId`, `description`, `quantity`, `unitCents`, `durationMinutes`, `position`                                                                                                                                                                                                  |
| `quoteInstallments`        | plano de pagamento previsto     | `quoteId`, `workspaceId`, `sequence`, `dueDate`, `amountCents`, `kind` (`sinal`/`parcela`/`saldo`), `status`                                                                                                                                                                                                  |
| `quotePayments`            | registro manual de recebimento | `quoteId`, `workspaceId`, `installmentId`, `amountCents`, `method` (`pix`/`maquininha`/`dinheiro`/`debito`/`credito`/`transferencia`/`outro`), `paidAt`, `externalRef`, `notes`, `receiptId`, `recordedByUserId` |
| `paymentReceipts`          | recibo emitido                  | `workspaceId`, `quoteId`, `paymentId`, `number`, `issuedAt`, `issuedByUserId`, `snapshot`                                                                                                                                                                                                                     |
| `workspacePaymentSettings` | dados exibidos para recebimento manual         | `workspaceId`, `acceptedMethods` (jsonb), `pixKeyType`, `encryptedPixKey`, `holderName`, `holderDocument`, `legalName`, `defaultDepositPercent`, `maxInstallments`, `installmentInterestPercent`, `defaultValidityDays`, `receiptFooter`, `termsText`                                                         |

Regras:

- `receivedCents` de `quotes` passa a ser **campo derivado** da soma de `quotePayments` (mantido por compatibilidade, recalculado em transação), e `contacts.quoteCents` deixa de ser a fonte do Dashboard.
- `workspacePaymentSettings` guarda dados sensíveis com o mesmo padrão já usado para segredos de provider (criptografia em repouso e retorno mascarado).
- Migração inicial cria uma parcela única para cada orçamento existente, preservando o valor já recebido como um recebimento de método "não informado".

### 4.4 Integração com o atendimento

- A IA e o operador podem montar o orçamento a partir do catálogo e enviar ao cliente com itens, validade e plano de pagamento.
- Mensagem de orçamento com resumo da condição combinada; quando solicitado, enviar a chave Pix/copia e cola do workspace.
- Link entre orçamento e conversa para rastrear envio, aprovação e follow-up interno.
- Follow-up de vencido: lembrete ao cliente e alerta interno (respeitando política anti-spam).
- Lançamento manual de pagamento gera recibo e pode disparar mensagem de agradecimento opcional; não há confirmação automática de liquidação.

### 4.5 Limite de escopo financeiro

1. **Escopo atual — manual + Pix estático.** Registro manual, Pix copia e cola, recibo e extrato interno. Nenhuma cobrança real, nenhum dado de cartão e nenhuma confirmação automática de liquidação.
2. **Futuro não contratado.** Qualquer integração com PSP/gateway fica fora do roadmap atual e só poderia existir após uma decisão de produto separada; não criar abstrações, adapters ou webhooks de provider agora.
3. **Cobrança do próprio SaaS.** É um assunto separado do financeiro do cliente: `saasProducts`, `planPrices`, `workspaceSubscriptions`, `invoices`, `usageLedger`, conforme já previsto em P2.3. O rate limit por minuto continua sendo técnico, nunca faturamento.

Decisões registradas: o Forte Panel **não é instituição de pagamento, não cobra o cliente final, não oferece gateway, não integra maquininha e não retém valores**; o dinheiro vai diretamente para o empresário/equipe por maquininha, dinheiro ou Pix próprio, e o painel registra o que foi informado. A emissão de documento fiscal (NF-e/NFS-e) está **fora do escopo** desta fase — os campos `invoiceRequired` e `fiscalDocNumber` ficam reservados, sem promessa ao cliente.

## 5. Parte 4 — Ordem de execução proposta

Nada abaixo antecipa o lançamento público; P0 do plano de auditoria continua sendo a barreira.

| Bloco | Conteúdo                                                                                                                                                                          | Depende de | Gate de saída                                                                |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------- |
| B0    | Fechar P0 vigente e provar dois tenants, workspace suspenso e billing em PostgreSQL/staging                                                                                       | —          | Evidência em staging, sem banco manual                                       |
| B1    | Segurança de identidade: rate limit no login, checagem de origem, unread/leitura, índice de mensagens e quotes, `messages.externalId` por tenant, `contacts.workspaceId NOT NULL` | B0         | Testes negativos cobrindo cada item                                          |
| B2    | Identidade e cadastro: signup público inicial com e-mail + senha, convite por workspace, recuperação de senha e consentimento versionado; confirmação de e-mail e Google OAuth ficam feature-flagged/desligados até configurar provedores; `workspaceInvites`, `passwordResetTokens`, `consentRecords`; matriz de capacidades conforme `GUIA-CONVITES-E-PERMISSOES.md` | B1 | Cadastro e aceite de convite ponta a ponta em staging sem depender de e-mail externo; testes negativos de papel/escopo; fluxo posterior de confirmação validado quando o provedor estiver configurado |
| B3    | Onboarding estruturado sem áudio: sessão retomável, núcleo de 10 blocos, perguntas condicionais, prévia curta da regra após cada área, checklist e `workspaces.status = onboarding` | B2 | Empresa nova sai do onboarding sem banco manual e confirma o resumo sem ler o prompt inteiro |
| B4    | Onboarding por áudio: upload, transcrição tenant-aware, estruturação com schema, proveniência/confiança, acompanhamento de campos, retenção e consentimento de voz | B3 | Fluxo por áudio concluído ponta a ponta com fallback por formulário |
| B5    | Autoatendimento e suporte: mover onboarding/configuração de IA para owner/gerente; console admin vê versões e sugere correções com acesso justificado, sem publicação silenciosa | B3 | Owner configura/publica e suporte consegue ajudar com auditoria |
| B6    | Financeiro: itens, condição comercial, chave Pix, registro manual de recebimentos, recibo, extrato e `workspacePaymentSettings` | B3         | Orçamento com condição registrada, Pix enviado pela conversa, lançamento manual e extrato coerente |
| B7    | Higiene: lint + `check`/`build` em PR, config pnpm migrada, remoção de artefatos de template e árvore drizzle legada, README/licença, branding por tenant                         | paralelo   | CI bloqueando regressão; raiz do repositório limpa                           |
| B8    | Observabilidade e LGPD: correlation ID, logging estruturado, retenção/exclusão/exportação e política publicada                                                                    | B2/B6      | Gate de lançamento satisfeito                                                |

Critérios de aceite transversais:

- Toda nova leitura/mutação recebe `workspaceId` do contexto e tem teste negativo de outro tenant.
- Nenhum dado sensível (chave Pix, segredo, cartão) retorna em claro para o cliente ou aparece em log.
- Fluxos novos têm estado de erro, vazio e carregando com texto simples, sem jargão técnico.
- Áudio nunca é a única via: formulário sempre disponível.
- Toda ação financeira e de configuração é auditada.

## 6. Parte 5 — Validação desta etapa e limitações

Validação executada no repositório clonado nesta sessão, apenas para registrar o baseline (nenhuma alteração de código):

- `pnpm install --frozen-lockfile`: concluído, com avisos de configuração pnpm ignorada e scripts de build não aprovados (achados 19).
- `pnpm check`: aprovado, sem erros de tipo.
- `pnpm test`: **69 testes aprovados, 31 ignorados** (17 arquivos aprovados, 11 ignorados) — os ignorados dependem de `DATABASE_URL`.
- `pnpm build`: aprovado, com o aviso conhecido de chunk inicial de 691,20 kB.

Limitações que permanecem:

- Nada foi implementado nesta etapa; o documento é plano e as pendências continuam abertas.
- A prova de isolamento, suspensão, billing e migrations continua dependente de PostgreSQL/staging real.
- O serviço de transcrição depende de provedor configurado no ambiente; o caminho por formulário é o fallback obrigatório.
- Cálculo de custo por minuto de áudio e volume esperado de onboarding ainda não foi medido; medir antes de ligar o áudio para todos os leads.

## 7. Registro de decisões

1. O levantamento é progressivo: núcleo obrigatório curto, perguntas condicionais e aprofundamento posterior; áudio e texto são equivalentes como entrada.
2. O funil por áudio é **entrada opcional com confirmação obrigatória**, nunca fonte de verdade automática.
3. A IA transcreve, estrutura e redige um rascunho de prompt; o prestador confirma antes da publicação e o administrador só presta suporte com acesso auditado.
4. O dono do negócio passa a configurar a própria empresa e a IA; o console da plataforma permanece como suporte escopado.
5. O financeiro evolui para **ledger de recebimentos** com plano de pagamento e meios escolhidos pelo workspace; a primeira fase é manual, com Pix estático e sem PSP.
6. Nenhum dado de cartão é armazenado pelo Forte Panel e nenhum valor é retido pela plataforma nesta fase.
7. Documento fiscal fica fora do escopo desta fase, com campos reservados.
8. O lançamento público continua condicionado a P0, gate de staging, LGPD e observabilidade.
