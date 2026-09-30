## Etapa 5 — Claim atômico de idempotência HTTP — concluída

A idempotência das rotas mutáveis deixou de usar o padrão inseguro `SELECT` antes do handler e `INSERT` depois do handler.

Agora o fluxo é:

1. `INSERT ... ON CONFLICT DO NOTHING` cria a chave em estado `processing`.
2. Apenas a requisição que conseguiu inserir executa o efeito.
3. Requisições concorrentes com o mesmo payload recebem `idempotency_in_progress` e `Retry-After: 2`.
4. Ao concluir, o registro passa a `completed` e guarda status/body para replay.
5. Payload diferente para a mesma chave continua retornando conflito.
6. Se o processo cair, o lease expira e uma nova tentativa pode reassumir a chave.

A tabela ganhou `status`, `leaseUntil` e `updatedAt`. Migration:

```text
drizzle-pg/0014_api_idempotency_claim.sql
```

Isso protege contatos, memória de lead, agendamentos, mensagens, lotes, mudança de etapa e cancelamentos que usam o helper HTTP `idempotent`.

Validação: typecheck, testes, build, journal JSON e diff check passaram. O teste de concorrência com PostgreSQL real continua planejado para a suíte de integração, sem exigir ação manual do usuário.

## Handoff de continuidade

Foi criado `HANDOFF-CONTINUIDADE-FORTE-PANEL.md` com o contexto completo para outra IA: decisões de arquitetura, commits, migrations, variáveis, comandos WSL/Docker, estado real da auditoria, limitações, smoke test adiado e próximo bloco recomendado.

## Etapa 6 — Ledger idempotente das tools do agente — concluída

Foi criada a tabela `agentEffects` com chave única por `workspaceId + eventId + toolCallId`. Ela guarda fingerprint dos argumentos, status, resultado estruturado e lease expirável.

As tools mutáveis protegidas são `atualizar_lead`, `registrar_nota`, `criar_agendamento` e `transferir_humano`. As consultas `buscar_lead` e `consultar_agenda` não criam efeitos.

Se uma tool já foi concluída, o resultado salvo é reproduzido. Se outra execução possui o lease, o efeito não é executado novamente. O reset de desenvolvimento também limpa o ledger.

Migration: `drizzle-pg/0015_agent_effects.sql`.

Validação: `pnpm check`, `pnpm test` (39 aprovados; 13 ignorados), `pnpm build`, journal JSON e diff check passaram.

Limitações para a próxima etapa: teste PostgreSQL real de crash/concorrência, estado `unknown` depois de mutação antes de persistir o resultado e fencing de handoff humano.

## Visão de produto comercial — Onboarding Conversacional Assistido por IA

A experiência final desejada é permitir que um cliente configure o Forte Panel sem precisar entender variáveis de ambiente, prompts ou detalhes técnicos. Depois do login inicial, um chat de onboarding conversa com o responsável pela empresa e descobre, em linguagem natural:

- nome, segmento e região da empresa;
- serviços oferecidos;
- público e perfil dos clientes;
- diferenciais, restrições e políticas comerciais;
- horários, profissionais e regras de agenda;
- tom de voz desejado;
- perguntas frequentes e respostas aprovadas;
- limites do agente e situações que exigem atendimento humano;
- canais/instâncias de WhatsApp que serão conectados.

O resultado não deve ser um prompt livre salvo diretamente. O fluxo recomendado é:

```text
chat de descoberta
→ perfil estruturado da empresa
→ rascunho de system prompt + políticas
→ revisão visual pelo proprietário
→ simulação de conversas
→ aprovação explícita
→ publicação de versão do agente
```

### Nome recomendado

Nome técnico da feature: **Onboarding Conversacional Assistido por IA**.

Nomes comerciais possíveis:

- **Configuração Inteligente**;
- **Assistente de Ativação**;
- **Setup Guiado por IA**;
- **DNA da Empresa** — nome mais marcante para o perfil estruturado.

Se “Jev” for o nome de uma ferramenta/produto específico que o usuário tem em mente, validar o contrato e a licença antes de adotá-lo. Por enquanto, o roadmap usa o nome genérico e independente de fornecedor.

### Requisitos de segurança e produto

- O proprietário continua sendo o único aprovador final.
- A IA pode sugerir, mas não publica configuração comercial sem aprovação.
- Toda publicação gera uma versão do prompt e permite rollback.
- Segredos, API keys e credenciais nunca entram no prompt.
- O chat deve separar fatos informados pelo cliente de sugestões inferidas pela IA.
- O cliente pode editar qualquer resposta antes da publicação.
- O agente deve ter limites explícitos: quando transferir para humano, o que não pode prometer e quais ações exigem confirmação.
- Deve existir preview/teste com conversas simuladas antes de ativar.
- O perfil estruturado deve ser reutilizável por prompt, FAQ, treinamento, mensagens e futuras campanhas.

### Fase planejada

Esta é uma fase de **produto comercial**, depois da contenção de segurança, tenancy, confiabilidade do worker e ledger/handoff do agente. O primeiro MVP pode ser implementado sem provisionamento Cloud: usar o agente nativo existente, salvar o perfil estruturado e gerar uma versão revisável do prompt.

## Roadmap de interface — evolução sem alterar o branding

A interface deve evoluir por refinamento, não por redesign. Manter a identidade atual: fundo escuro, superfícies/cards, paleta existente, badges de status, verde para confirmação, âmbar para atenção, vermelho para falha, tipografia, ícones lineares e linguagem visual do Forte Panel.

### Prioridade 1 — Clareza operacional

- reorganizar navegação em Operação, Automação, Configuração e Sistema;
- transformar o dashboard em painel orientado a ações;
- tornar cards do dashboard clicáveis e ligados à ação correspondente;
- criar checklist de configuração inicial;
- substituir estados técnicos por mensagens operacionais traduzidas;
- padronizar loading, erro, retry e empty states;
- impedir que erros apareçam como listas vazias ou números zero.

### Prioridade 2 — Operação diária

- destacar claramente `IA ativa`, `Humano assumiu` e `IA pausada` na Inbox;
- criar ações visíveis `Assumir conversa` e `Devolver para IA`;
- mostrar a instância PAPI que recebeu a mensagem;
- mostrar timeline operacional do agente sem expor raciocínio privado do modelo;
- manter composer e ações essenciais acessíveis no mobile;
- corrigir `.page-actions` e grids rígidos para responsividade.

### Prioridade 3 — Configuração comercial

- criar a tela **Configuração Inteligente**;
- integrar o Onboarding Conversacional Assistido por IA;
- exibir chat de descoberta com progresso;
- mostrar na lateral o perfil estruturado da empresa sendo preenchido;
- separar fatos informados de sugestões da IA;
- permitir revisão, simulação e publicação pelo proprietário;
- criar versionamento e rollback do perfil/prompt.

### Prioridade 4 — Integrações sem complexidade desnecessária

A tela Canais conectados deve ter duas camadas:

1. visão simples: nome, provider, status e uso atual;
2. detalhes avançados: `instanceId`, deployment, webhook, API key mascarada, último erro e sincronização.

IDs, headers e detalhes técnicos não devem dominar a primeira experiência do cliente.

### Prioridade 5 — Qualidade visual e acessibilidade

- consolidar botões, badges, cards e estados em componentes reutilizáveis;
- remover excesso de estilos inline;
- melhorar hierarquia tipográfica e espaçamento;
- adicionar `:focus-visible`;
- adicionar `aria-label` em botões somente com ícone;
- revisar contraste;
- usar animações discretas apenas para transições e feedback;
- fazer code splitting por rota;
- separar `PanelPages.tsx` por domínio.

### Ordem recomendada de implementação

```text
estados/loading/erro/vazio
→ dashboard orientado a ações
→ Inbox IA/humano
→ mobile/responsividade
→ Canais em duas camadas
→ checklist inicial
→ Configuração Inteligente conversacional
→ simulador/versionamento do agente
```

Toda melhoria deve preservar o branding atual e ser validada em desktop e mobile.

---

## Nova direção principal — SaaS público multi-conta e logins de funcionários (2026-09-25)

Esta decisão do usuário **substitui prioridades anteriores de produto que pressupunham uma instalação por empresa com um único login proprietário**. O Forte Panel passa a ser planejado como app público: uma conta master cria uma empresa/workspace e pode criar acessos individuais para funcionários com nome, identificador e senha inicial; cada membro tem papel/permissões e a sessão deve ser revogável.

Não confundir:

- conta master/funcionário = identidade de login;
- empresa/workspace = tenant e fronteira dos dados;
- instância/conexão WhatsApp = canal vinculado ao tenant.

A estratégia detalhada, definições, critérios de aceite e fases está em `ESTRATEGIA-PRODUTO-PUBLICO-MULTICONTA.md`. O primeiro bloco de código passa a ser **tenancy real, contexto de workspace validado por membership, revogação de sessão e testes PostgreSQL de isolamento**; em seguida, cadastro/login master e gestão de funcionários. O projeto já tem hashes, memberships e papéis internos reutilizáveis, mas ainda precisa remover o bootstrap global e dependências do workspace demo/global.

### WhatsApp próprio — fase futura, condicionada

O usuário informou que a PAPI usada já é construída sobre Baileys e propôs usar Baileys ou o repositório `intrategica/papi-free:1.5.1` como base para construir uma API REST própria. O repositório usa `intrategica/papi-free:1.5.2` nos Compose mais atuais; a tag 1.5.1 está publicada, porém anterior. O Docker Hub consultado não mostra source repo nem licença da imagem. Portanto, **não fazer fork nem distribuir/modificar a imagem até confirmar código-fonte, licença e autorização com o mantenedor**. O MIT do projeto Baileys não cobre a PAPI.

O futuro gateway REST pode ser um fork autorizado da PAPI (preferível se houver fonte/licença adequadas) ou serviço próprio sobre Baileys. Deve permanecer um serviço/adapter isolado, com storage de autenticação em banco durável e criptografado, QR protegido, reconexão/locks, callbacks assinados, idempotência, monitoramento e migração reversível. A PAPI atual permanece como provider de transição e Meta Cloud API como alternativa oficial. Revisar termos e riscos do provider não oficial antes de beta comercial. Não implementar Baileys nesta fase.

### Sequência ativa

1. Preparar mapa de tabelas/rotas/queries que exigem tenant e plano de backfill sem perda dos dados demo existentes.
2. Corrigir contexto de usuário/master e workspace/membership.
3. Fazer teste com dois tenants e provar isolamento de rotas, workers, storage, webhooks e mensagens.
4. Implementar onboarding público/master e gestão de logins/papéis.
5. Validar o provider WhatsApp atual por workspace.
6. Só depois avaliar o fork/API própria PAPI/Baileys e o lançamento gradual.

A tarefa de fencing/ledger PostgreSQL continua válida como requisito de confiabilidade antes do uso comercial do agente, mas deixa de ser o próximo bloco isolado: deve ser encaixada após a fronteira de tenancy e login estar segura.

---

## Atualização de execução — 2026-09-26

A migração de tenancy avançou para o domínio CRM/Inbox. Contatos, conversas, mensagens, notas, lead-memory, inbound/outbound, seleção de canais e chamadas do agente agora propagam `workspaceId` explícito a partir do contexto tRPC, da API REST vinculada e do evento do worker. A superfície REST mantém fail-closed sem `FORTE_API_WORKSPACE_ID`, sem alterar o contrato de validação de payload/idempotência.

Validação concluída: `pnpm check`, `pnpm test` (43 aprovados, 19 ignorados sem PostgreSQL), `pnpm build` e `git diff --check`.

Próxima sequência: migrar onboarding/configuração e gestão histórica de instâncias PAPI; depois versionar migration para `auditLogs`, `webhookEvents` e `apiIdempotency` com escopo composto por workspace; executar isolamento com PostgreSQL real antes de abrir novos tenants.

---

## Atualização de execução — 2026-09-26 09:58

Onboarding, prompt publicado, configuração/runtime do agente e gestão de instâncias/webhooks PAPI foram migrados para `workspaceId` explícito. O armazenamento PAPI não aceita mais chamadas sem tenant e o fallback global de `PAPI_INSTANCE_ID` foi removido do caminho tenant-aware.

Decisão operacional para beta: uma chave de provedor mantida no backend pode servir várias empresas/conversas; a separação deve ser feita por autenticação, membership, workspace, rate limit, quota e observabilidade do Forte Panel. Não distribuir a chave do provedor aos testadores. Próximo bloco: migration de auditoria/idempotência/eventos composta por workspace, limites por tenant e teste PostgreSQL de isolamento.

---

## Atualização de execução — 2026-09-26 10:03

Foi adicionada a proteção operacional inicial do beta: buckets persistidos por minuto e workspace, limites REST e de execução da IA, headers de rate limit e reentrega adiada de eventos quando a cota da IA é atingida. A migration é `0016_workspace_usage_buckets.sql` e o teste de isolamento está em `server/workspace-usage.test.ts`.

Defaults: 120 requests REST/minuto e 60 execuções de IA/minuto por workspace, configuráveis por `FORTE_WORKSPACE_API_REQUESTS_PER_MINUTE` e `FORTE_WORKSPACE_AI_REQUESTS_PER_MINUTE`. Próximo bloco: aplicar migration em PostgreSQL real, verificar concorrência, adicionar limites por plano/usuário e fechar escopos compostos de auditoria/idempotência/webhooks.

---

## Atualização de execução — 2026-09-26 10:11

Foi concluída a migração do núcleo de deduplicação para escopo composto por workspace. Idempotência REST, eventos de webhook, domain events e auditoria não dependem mais de chaves globais; a auditoria voltou a ser exibida apenas ao workspace atual.

A migration `0017_tenant_scoped_deduplication.sql` contém backfill seguro com fallback explícito para `forte-demo`. Próximo passo operacional: aplicar em PostgreSQL real, validar o backfill e a concorrência dos índices compostos; depois revisar isolamento de tokens/segredos e implementar limites por plano/usuário.

---

## Atualização de execução — 2026-09-26 10:14

A revisão de segredos foi concluída. A cópia dos segredos de webhook PAPI em `workspaceSettings` agora usa AES-256-GCM, respostas do frontend permanecem mascaradas e foi adicionada cobertura unitária contra exposição e ciphertext adulterado.

Antes do beta, configurar `JWT_SECRET` forte e persistente no servidor, aplicar as migrations 0016/0017 no PostgreSQL real e executar as suites de isolamento com dois workspaces.

---

## Atualização de execução — 2026-09-26 10:19

Foi adicionada política de limites por plano e bucket individual por operador. O endpoint manual do Inbox já impede que um único usuário consuma toda a capacidade do workspace. A migration 0018 cria a persistência do bucket individual.

Próximo passo: executar as três migrations em PostgreSQL real, validar concorrência entre usuários e criar uma visão operacional de consumo antes de abrir o beta.

---

## Atualização de execução — 2026-09-26 10:22

A tela de Integrações passou a exibir o consumo do workspace e dos operadores, com limites derivados do plano e atualização automática. O endpoint usa `requireManager`, mantendo a visibilidade operacional restrita a gestores.

Próximo passo: validar as migrations em PostgreSQL real e fechar o limite do worker outbound.

---

## Atualização de execução — 2026-09-26 10:45

O worker agora aplica o limite de outbound do workspace antes do envio externo. Mensagens limitadas permanecem na fila sem consumir tentativa, sendo retomadas na janela seguinte.

Próximo passo: validação em PostgreSQL real e alertas operacionais de consumo.

---

## Atualização de execução — 2026-09-26 10:53

O sistema ganhou alertas in-app de consumo em 70% e 90%, entregues aos responsáveis ativos e deduplicados por janela, métrica e threshold. A documentação do beta foi consolidada no manual operacional e no índice de documentação.

Próximo passo: executar build final, publicar este bloco e realizar a validação real das migrations e concorrência em PostgreSQL.

---

## Atualização de execução — 2026-09-26 11:03

A validação PostgreSQL que estava pendente foi executada localmente. Migrations, constraints de tenancy, isolamento entre dois workspaces, quotas e alertas foram exercitados; 72 testes passaram sem skips.

Próximo passo: repetir migrations e a mesma suíte no staging real, sem apagar volumes, antes de convidar os 10 beta testers.

---

## Atualização de execução — 2026-09-26 11:24

Foi adicionada retenção diária dos buckets de consumo, configurável por `FORTE_USAGE_RETENTION_DAYS` e protegida por teste PostgreSQL. O padrão de 30 dias evita crescimento indefinido antes do beta.

Próximo passo: validar no staging e observar o custo/volume real.

---

## Atualização de execução — 2026-09-26 11:27

Foi adicionado healthcheck/readiness para a API e heartbeat periódico do worker. A suíte PostgreSQL passou com 74 testes e o typecheck passou.

Próximo passo: instalar esses sinais no staging real e confirmar que o monitoramento diferencia processo vivo de serviço pronto.

---

## Atualização de execução — 2026-09-26 11:31

Foi documentado e priorizado como P0 o Console Administrativo da Plataforma. Ele deve entrar antes do beta real e inclui gestão de contas, suporte escopado, observabilidade por workspace e configuração versionada do agente.

O documento consolidado é `STATUS-COMPLETO-E-PLANO-BETA.md`. O próximo bloco de implementação deve criar as permissões de plataforma, as sessões de suporte e o CRUD de rascunho/publicação/rollback do agente.

---

## Atualização de execução — 2026-09-26 16:23

### Decisão P0 — Gateway WhatsApp próprio sobre Baileys

A PAPI self-hosted/Cloud deixa de ser o caminho principal para o produto. A operação local revelou uma limitação estrutural: a licença da PAPI vincula o `Machine ID` ao servidor e o serviço pode bloquear uma reinstalação Docker com `machine mismatch`, além de o suporte não oferecer o nível necessário para o desenvolvimento.

Foi decidido construir um gateway próprio, chamado provisoriamente **forte-whatsapp**, no mesmo repositório e no mesmo Compose do Forte Panel, mas como serviço isolado. O código será original e usará Baileys conforme sua licença MIT; não será feito fork, engenharia reversa ou remoção de validação da imagem proprietária da PAPI.

### Escopo inicial

1. Uma instância WhatsApp por vez no MVP.
2. Sessão Baileys persistente em volume Docker.
3. QR Code/status de conexão.
4. Envio e recebimento de texto.
5. Webhook assinado para o Forte Panel.
6. API interna autenticada por chave do ambiente.
7. Isolamento por `workspaceId + instanceId`.
8. Health/readiness, reconexão e logs sem segredos.

### Estratégia de transição

- PAPI continua como provider legado durante a transição.
- Meta Cloud API continua como alternativa oficial.
- O Forte Panel mantém `WhatsappAdapter`; o novo provider será `baileys`.
- Inbox, CRM, IA, agenda, quotas, auditoria e worker permanecem no Forte Panel.
- O gateway não mantém uma segunda base de CRM; apenas sessão e metadados de conexão.

### Ordem ativa

```text
registrar contrato e scaffold
→ serviço Baileys com uma instância e texto
→ webhook inbound no Panel
→ adapter outbound no worker
→ UI de QR/status por workspace
→ mídia/botões/múltiplas instâncias
→ backup, reconciliação e operação de produção
```

Critério de aceite do primeiro bloco: `forte-whatsapp` sobe sem PAPI, responde health/readiness, mantém a estrutura de sessão em volume e oferece contratos internos testáveis; nenhuma credencial real deve entrar no Git ou nos exemplos.

## Atualização de execução — 2026-09-26 21:28

A revisão do handoff foi retomada no commit `929c467`, com typecheck, testes e build inicialmente aprovados. O console interno `platform_admin` já possui configuração versionada do agente por workspace, incluindo rascunho, simulação local sem provider externo, publicação, histórico e rollback.

Foi corrigido um bloqueio operacional na aba do agente: versões arquivadas agora podem ser selecionadas para rollback; o backend publica o conteúdo como uma nova versão, preservando a cadeia histórica. Após salvar rascunho, simular, publicar ou executar rollback, a tela atualiza o snapshot protegido do workspace e mantém os campos editados sincronizados.

Validação após a correção:

```text
pnpm check ✅
pnpm test ✅ — 57 aprovados, 24 ignorados por dependências externas
pnpm build ✅
git diff --check ✅
```

Próxima etapa ainda pendente antes do beta: validar as mutações do console e o isolamento de autorização no PostgreSQL/staging real, sem abrir cadastro público nem executar smoke test Cloud.

## Atualização de execução — 2026-09-26 21:39

Foi criada a suíte `server/platform-support-session.test.ts`, condicionada a PostgreSQL real, cobrindo:

- vínculo exato entre `platformAdminId`, `sessionId` e `workspaceId`;
- sessão `read_only` recusada para mutações de operador;
- revogação com bloqueio imediato;
- expiração automática antes da leitura;
- rejeição de tentativa de usar uma sessão em outro workspace.

No sandbox sem `DATABASE_URL`/Docker, a suíte fica corretamente marcada como ignorada; os testes locais de autorização continuam aprovados. A execução contra staging PostgreSQL permanece o próximo gate operacional antes dos convites beta.

## Atualização de execução — 2026-09-26 21:40

Foi criado `.github/workflows/postgres-integration.yml`. O workflow inicia PostgreSQL 16, aplica a árvore versionada `drizzle-pg`, executa as suítes críticas de isolamento e falha se qualquer uma for ignorada. Ele roda em pull requests, pushes na `main` e execução manual.

A validação local confirmou a formatação do YAML e `git diff --check`. A execução efetiva depende do runner GitHub Actions, pois o sandbox atual não possui Docker nem PostgreSQL.

## Atualização de execução — 2026-09-26 21:45

Foi adicionada a suíte `server/worker-heartbeat.test.ts`. Em PostgreSQL real, ela confirma que o heartbeat é upsertado por serviço e que o console classifica corretamente o worker como `healthy`, `degraded` após erro e `stale` quando o sinal ultrapassa o limite de 180 segundos. O contrato HTTP de `/api/v1/health` e `/api/v1/ready` já estava coberto por `server/api.contract.test.ts`; agora o sinal persistido do worker também está protegido no CI.

## Atualização de execução — 2026-09-26 23:05

Foi criado `scripts/staging-smoke.sh` para validar liveness e readiness após deploy, além do workflow manual `.github/workflows/staging-smoke.yml`. A URL é fornecida por `STAGING_BASE_URL` como variável de repositório ou pelo input manual `base_url`; nenhuma credencial é necessária ou exposta. O script foi validado com `bash -n` e com um servidor HTTP local simulado, confirmando `health=ok` e `ready=ready`.

## Atualização de execução — 2026-09-26 23:15

O pacote `forte-whatsapp` recebeu `src/server.test.ts` e `vitest.config.ts` locais. Os oito testes cobrem health/readiness, autenticação e envio de texto, imagem, áudio, vídeo e documento contra um `InstanceManager` simulado, sem pareamento ou número real. O workflow de publicação passou a executar testes, typecheck e build do gateway antes de publicar as imagens. O E2E com número dedicado continua separado e pendente de staging configurado.

## Atualização de execução — 2026-09-26 23:21

Foi criado `.github/workflows/staging-e2e.yml`, manual e sem execução em push. Ele injeta `STAGING_BASE_URL`, `STAGING_FORTE_API_KEY`, `STAGING_ADMIN_EMAIL` e `STAGING_ADMIN_PASSWORD` apenas durante o job e executa `scripts/validate-flow.mjs`. Como o fluxo cria dados operacionais, a documentação exige staging descartável/autorizado e proíbe execução em produção.

## Atualização de execução — 2026-09-26 23:32

O workflow E2E foi endurecido: agora exige confirmação explícita de staging descartável/autorizado, possui grupo de concorrência único e timeout de dez minutos. A validação de configuração ocorre antes da execução do script, evitando chamadas acidentais contra ambiente sem URL ou credenciais.

## Atualização de execução — 2026-09-26 23:40

O gateway recebeu `forte-whatsapp/src/session-lock.ts`, com lock atômico `.session.lock` por instância, detecção de processo ativo, recuperação segura de lock obsoleto e liberação idempotente no ciclo `start/stop`. A suíte `session-lock.test.ts` cobre exclusividade, release e recuperação; `npm test`, `npm run check` e `npm run build` passaram com 10 testes. Isso evita duas conexões concorrentes no mesmo diretório, mas não substitui um store de autenticação durável/criptografado nem um teste de restore.

## Atualização de execução — 2026-09-26 23:42

As sessões Baileys agora normalizam permissões privadas: diretórios `0700` e arquivos `0600`, incluindo o lock, com tratamento recursivo de subdiretórios. A suíte do gateway passou com 11 testes, typecheck e build. Isso reduz exposição acidental no volume, mas não equivale a criptografia em repouso; a troca do `useMultiFileAuthState` por store durável/criptografado e o restore continuam pendentes.

## Atualização de execução — 2026-09-26 23:43

Foi adicionada a camada `forte-whatsapp/src/encrypted-auth-state.ts`, compatível com `AuthenticationState` do Baileys. Quando `WHATSAPP_SESSION_ENCRYPTION_KEY` está configurada, creds e Signal keys são persistidos com AES-256-GCM, escrita atômica, permissões privadas e migração automática de JSON legado sob o lock da instância. A suíte `encrypted-auth-state.test.ts` cobre cifragem, restore, chave errada e migração. O gateway passou com 14 testes, typecheck e build. Store externo/durável e failover continuam pendentes antes de escala.

## Atualização de execução — 2026-09-26 23:54

Antes do teste na máquina do usuário, foram entregues três blocos verificáveis sem staging: `scripts/backup-restore.sh` com backup/verify/restore protegido por confirmação e hashes; `server/media-storage.ts` com storage privado opcional, limite por arquivo, referência por workspace e URL assinada para o agente; e suporte REST/DB para tipos estruturados Baileys com `metadata.payload`. O Inbox agora consulta os canais do workspace e mostra claramente se o canal está pronto ou ainda precisa de configuração. A validação local passou com typecheck, 62 testes aprovados, build web/backend e 14 testes/build do gateway. Ficam para staging real: ativar storage privado, validar backup restaurado, usar número WhatsApp controlado e agendar cópia externa.


---
## Etapa seguinte — leitura transacional da Inbox por operador — 2026-09-27

Foi implementada a separação entre **mensagem inbound não lida pelo operador** e `awaitingResponse`. A migration `drizzle-pg/0025_conversation_reads.sql` cria `conversationReads`, com cursor por workspace, conversa e usuário. A listagem da Inbox recebe o usuário autenticado e deriva o unread a partir das mensagens posteriores ao cursor; a procedure `inbox.markRead` grava o último ID visto em transação e não atravessa o workspace do contato.

O frontend marca a conversa como lida ao abrir a thread e o shell passou a exibir o contador para qualquer membro ativo com `canUseInbox`. Também foram formalizadas capabilities server-side (`canUseInbox`, `canSendMessages`, `canManageInbox`) e guards nas procedures da Inbox. A política atual segue caixa compartilhada até existir modelo de assignment/fila; portanto isso não é ainda a matriz final de escopo por equipe/profissional.

Cobertura adicionada em `server/inbox-read-state.test.ts`: dois operadores independentes, dois workspaces, rejeição de contato cruzado e nova mensagem após leitura. Sem `DATABASE_URL`, a suíte PostgreSQL fica skipped; o typecheck, suíte local, build e diff check passaram.


---
## Etapa seguinte — signup público inicial — 2026-09-27

Foi entregue `auth.signup` com hash de senha, rate limit por IP/e-mail, consentimento versionado e criação transacional de workspace `onboarding`, usuário owner, membership, auditoria e sessão automática. A migration é `0026_consent_records`; a UI pública está em `/signup` e o fluxo só é habilitado quando `LOCAL_AUTH_ENABLED=true`. O segredo `LOCAL_ADMIN_PASSWORD` continua exclusivo do bootstrap do administrador de plataforma e não é necessário para o login posterior de owners públicos.

O próximo corte é **recuperação de senha one-time** sem expor token ou segredo na API, seguido da migração do onboarding/configuração histórica para owner/admin. O cadastro não deve ser aberto em produção antes de aplicar migrations em PostgreSQL/staging, revisar termos/privacidade e validar antiabuso.


---
## Etapa seguinte — recuperação de senha one-time — 2026-09-27

Foi entregue a base segura de reset: migration `0027_password_reset_tokens`, hash SHA-256, expiração de 30 minutos, revogação de tokens anteriores, lock transacional, consumo único, rotação de `sessionVersion`, auditoria e rate limit por IP/e-mail. As rotas públicas são `auth.requestPasswordReset` e `auth.resetPassword`; as telas são `/forgot-password` e `/reset-password`.

A solicitação pública responde genericamente e não retorna token. A entrega transacional por e-mail continua pendente até configurar provider, domínio, remetente e secrets. O próximo corte é integrar esse provider sem imprimir token em logs e depois liberar o onboarding de negócio para owner/admin, mantendo o console de plataforma separado.


---
## Etapa seguinte — adapter de e-mail preparado sem envio — 2026-09-27

A opção escolhida foi preparar sem envio agora. O projeto recebeu `server/_core/email.ts`, configuração segura em `env.ts` e documentação no `.env.local.example`. O adapter monta o conteúdo e a URL do reset, mas não tem dependência de rede, não chama provider e permanece atrás de `EMAIL_DELIVERY_ENABLED=false`/`EMAIL_PROVIDER=none`.

O próximo bloco funcional é mover onboarding/configuração histórica para owner/admin. Quando um provider for escolhido, a entrega deve ser conectada sem devolver tokens na API, sem logs sensíveis e com `PUBLIC_APP_URL`/remetente/domínio validados.


---
## Etapa seguinte — onboarding textual para owner/admin — 2026-09-27

`onboarding.profile` e `onboarding.save` agora aceitam owner/admin com `canManageTeam` e continuam aceitando `platform_admin` para suporte. O frontend ganhou `OnboardingGuard`, o link aparece na sidebar administrativa e cada salvamento/publicação gera auditoria. Configuração de IA, prompt e reset continuam protegidos por `requirePlatformAdministrator`/`PlatformOnlyGuard`.

Próximo corte: revisar o onboarding estruturado de negócio e separar capabilities de configuração operacional de secrets/prompts administrativos, sem ampliar acesso por conveniência.


---
## Etapa seguinte — checklist estruturado do onboarding — 2026-09-27

O perfil de onboarding agora expõe checklist, percentual, próximo passo e critério `readyToPublish`. A publicação é bloqueada no backend quando identidade, oferta, operação ou limites de atendimento estão incompletos; o rascunho continua salvável. A UI mostra o progresso e não abre secrets/configuração administrativa da IA.

O próximo passo deve escolher entre modelar `onboardingSessions`/respostas por bloco ou implementar autosave/retomada sobre o perfil atual. Áudio e estruturação por LLM ficam depois dessa fundação.


---
## Etapa seguinte — autosave e retomada do onboarding — 2026-09-27

O onboarding agora possui `onboarding.autosave`, disparado 1,2 segundo após a última alteração, sem publicar e sem criar auditoria a cada tecla. A tela exibe o estado do rascunho e `onboarding.profile` retoma o último conteúdo salvo ao reabrir.

O item ainda pendente é “fazer depois”/retomada por sessões e blocos explícitos; depois disso pode ser modelada a primeira `onboardingSession` antes de adicionar áudio e LLM.


---
## Etapa seguinte — sessão persistente do onboarding — 2026-09-27

A migration `0028_onboarding_sessions` adiciona uma sessão por workspace com estados `active`, `paused` e `completed`, cursor de etapa e timestamps. A UI inicia/retoma automaticamente, oferece **Fazer depois** e marca a sessão concluída quando o checklist inteiro é publicado. O autosave atualiza o cursor sem publicar.

As respostas ainda vivem no perfil estruturado atual. O próximo passo é adicionar cartão de retomada no dashboard ou `onboardingStepAnswers`; áudio e LLM ficam depois dessa decisão de modelo.


---
## Etapa seguinte — cartão de retomada no dashboard — 2026-09-27

Sessões administrativas `active` ou `paused` agora aparecem no dashboard com o próximo `currentStep` e CTA direto para `/onboarding`. Sessões concluídas ficam ocultas e perfis sem `canManageTeam` não executam a query protegida.

Próxima decisão: modelar respostas por bloco (`onboardingStepAnswers`) ou adicionar lembrete/retomada mais rica; áudio e LLM continuam depois da modelagem do dado estruturado.


---
## Etapa seguinte — respostas estruturadas por bloco — 2026-09-27

A migration `0029_onboarding_step_answers` adiciona respostas tenant-aware por sessão e bloco. O autosave e o salvamento manual fazem upsert de identidade, oferta, operações, guardrails e voz; publicação confirma os blocos. O perfil JSON continua sendo a fonte compatível enquanto a UI bloco a bloco não é criada.

Próximo corte: usar `stepAnswers` em uma revisão por bloco com confirmação humana, ou adicionar áudio apenas depois de definir consentimento, retenção e confiança por campo.


---
## Etapa seguinte — revisão humana por bloco — 2026-09-27

`stepAnswers` agora aparece em cards de revisão, com confirmação individual para identidade, oferta, operações e guardrails. O backend preserva confirmações quando o conteúdo não mudou, rebaixa blocos editados para `draft` e bloqueia publicação sem confirmação humana dos blocos obrigatórios.

Próximo corte: adicionar confirmação para blocos opcionais e histórico de revisões, ou iniciar o desenho de consentimento/retensão para áudio. Nenhuma extração por LLM deve publicar sem passar por este mesmo gate.


---
## Etapa seguinte — histórico de revisões e confirmação opcional — 2026-09-27

A migration `0030_onboarding_step_answer_revisions` mantém histórico imutável por bloco e a UI exibe as últimas revisões. O bloco `voice` ganhou confirmação explícita opcional; somente os quatro blocos essenciais continuam bloqueando a publicação.

Próximo corte: adicionar campos `source`, `confidence`, `missing` e `conflict` ao contrato estruturado, antes de conectar qualquer transcrição de áudio ou LLM.


---
## Etapa seguinte — qualidade e provenance dos blocos — 2026-09-27

`onboardingStepAnswers` e seu histórico agora carregam `source`, `confidence`, `missing` e `conflicts`. O formulário preenche provenance humana e ausências derivadas, enquanto transcrição/LLM permanecem fontes futuras sem bypass do gate de confirmação.

Próximo corte: especificar valores permitidos de `source`, política de confiança e resolução de conflitos antes de conectar áudio ou LLM.


---
## Etapa seguinte — política de provenance e conflitos — 2026-09-27

As fontes aceitas são `human_form`, `transcription`, `llm` e `import`; a confiança é validada entre 0 e 100, com formulário humano fixado em 100. Conflicts impedem confirmação e publicação dos blocos obrigatórios. A regra está no backend e não depende apenas do frontend.

Próximo corte: definir o contrato de resolução de conflitos e a política de retenção/consentimento caso uma fonte automática seja conectada.


---
## Etapa seguinte — resolução auditável de conflitos — 2026-09-27

A resolução agora aceita `accepted_current` ou `dismissed`, exige nota, preserva snapshot e registra ator/tempo em `onboardingConflictResolutions`. Qualquer decisão rebaixa o bloco para `draft` e exige nova confirmação antes da publicação.

Próximo corte: definir retenção e consentimento para dados de fontes automáticas, mantendo o mesmo fluxo de revisão humana.


---
## Etapa seguinte — governança de fontes automáticas — 2026-09-27

A governança agora possui consentimentos versionados para `transcription`/`llm`, política de retenção por workspace e guard reutilizável `assertOnboardingSourceConsent`. A UI permite revisar consentimentos e ajustar retenção dentro dos limites aprovados.

Importante: isso prepara e bloqueia o uso sem autorização, mas ainda não executa limpeza automática nem conecta provedores de áudio/LLM.

Próximo corte: implementar job/rotina de expiração que respeite `rawArtifactDays` e `derivedDataDays`, com dry-run e testes de isolamento, antes de integrar ingestão automática.


---
## Etapa seguinte — gate de transcrição — 2026-09-27

O adaptador de voz agora possui `transcribeAudioForWorkspace`, que verifica `transcription` antes de qualquer chamada remota e falha fechado quando o consentimento não existe ou a verificação do banco falha.

A procedure pública continua deliberadamente pendente: antes dela, criar `onboardingAudioAssets`/`transcriptions`, upload privado por workspace, ownership, MIME/tamanho/duração, URLs assinadas curtas e política de expiração. Não aceitar `audioUrl` arbitrária diretamente do cliente.

---
## Etapa seguinte — assets de áudio e transcrição tenant-aware — 2026-09-27
A fundação de áudio do onboarding foi conectada sem aceitar URL arbitrária do cliente.

### Implementado

- Migration `0034_onboarding_audio_assets.sql` e journal atualizado com `onboardingAudioAssets` e `onboardingTranscriptions`.
- O asset guarda `workspaceId`, `sessionId`, bloco, `storageKey`, MIME, tamanho, duração, hash SHA-256, status e `expiresAt` derivado da política de retenção do workspace.
- `voice.upload` exige o guard de onboarding, consentimento vigente para `transcription`, sessão do próprio workspace, MIME permitido (`webm`, `mp3`, `wav`, `ogg`, `m4a`), duração máxima de 120 segundos e tamanho real máximo de 16 MB. O cliente envia apenas base64 limitado; o servidor decodifica e grava em storage sob chave opaca `workspaces/{workspaceId}/onboarding-audio/{sessionId}/...`.
- `voice.transcribe` recebe somente `assetId`. O backend valida ownership, exige consentimento novamente, obtém URL assinada internamente, chama `transcribeAudioForWorkspace` e persiste texto, idioma, segmentos, provider/modelo e status. A URL de storage não é recebida do browser nem vai para o provedor sem consentimento.
- Claim condicional evita duas transcrições concorrentes do mesmo asset; erro deixa o asset em `failed` para retry e processamento preso há mais de cinco minutos pode ser reassumido.
- Upload e transcrição geram auditoria sem conteúdo bruto. O reset autorizado de desenvolvimento limpa os registros novos; objetos órfãos de storage continuam sem referência porque a camada de storage não expõe remoção.
- Testes unitários cobrem MIME, duração, base64, limite, hash e chave opaca. `server/onboarding-audio-db.test.ts` cobre isolamento entre workspaces, deduplicação por sessão/hash, claim único e persistência do resultado em PostgreSQL quando `DATABASE_URL` estiver disponível.

### Limitações e próximo corte

- A UI ainda não captura `MediaRecorder` nem exibe player/status do asset; o formulário textual continua sendo o fallback obrigatório.
- O worker de retenção ainda precisa expirar/remover assets e dados derivados conforme `rawArtifactDays`/`derivedDataDays`, com dry-run e auditoria.
- Estruturação por LLM, confiança por campo, pergunta de acompanhamento e projeção para `onboardingStepAnswers` continuam bloqueadas até revisão humana.
- A migration foi validada como SQL/JSON e por typecheck/build; o teste PostgreSQL ficou skipped nesta sandbox porque não há `DATABASE_URL`/PostgreSQL local. Aplicar `0034` e executar a suíte de integração no CI/staging antes de beta.

Validação desta etapa: `pnpm check` ✅; `pnpm test` ✅ — 106 aprovados, 37 skipped por dependências externas/PostgreSQL; `pnpm build` ✅; `git diff --check` ✅; journal JSON ✅.


---
## Etapa seguinte — captura de voz no onboarding — 2026-09-27
A `OnboardingPage` agora integra o backend de voz em uma experiência revisável e mobile-first. O operador escolhe o bloco, concede consentimento na seção de governança, grava pelo `MediaRecorder`, acompanha o limite de dois minutos, escuta uma prévia e decide quando enviar. O navegador não inicia o microfone sem consentimento ativo.

O cliente envia o blob serializado em base64 para `voice.upload`; depois do upload bem-sucedido chama `voice.transcribe` somente com o `assetId`. Estados distintos exibem gravação, envio, transcrição, conclusão e erro. Uma falha mantém o formulário textual disponível e permite retry sem gravar novamente. A transcrição concluída aparece como rascunho e pode ser inserida no FAQ sem publicar o prompt; nenhuma resposta de voz altera automaticamente o agente.

Também foram adicionados descarte/regravação, preview local com `URL.createObjectURL`, encerramento automático em 120 segundos, parada das tracks do microfone e revogação das URLs no cleanup. Formatos suportados são negociados com `MediaRecorder` (`webm`, `mp4` ou `ogg`) e normalizados antes do envio.

Validação: `pnpm check` ✅; `pnpm test` ✅ — 106 aprovados, 37 skipped; `pnpm build` ✅; `git diff --check` ✅. O warning conhecido de bundle inicial acima de 500 kB permanece. A próxima etapa é expiração real dos assets, depois correção/extração por bloco com revisão e confiança.


---
## Etapa seguinte — retenção automática de áudio — 2026-09-27
A política de retenção do onboarding agora é executada pelo worker em ciclo diário. `cleanupOnboardingAudioRetention` considera `expiresAt` dos assets brutos e `derivedDataDays` da política do próprio workspace para transcrições, com fallback seguro de 180 dias quando não há política explícita.

A rotina aceita `dryRun`, `now` injetável para testes e lote limitado a 500 registros por ciclo (máximo configurável de 2.000). No modo real remove somente as linhas expiradas de `onboardingAudioAssets` e `onboardingTranscriptions`; no modo dry-run não altera dados e retorna a contagem agrupada por workspace. O worker registra auditoria sem operador humano (`actorUserId` ausente), usando ações separadas para simulação e limpeza aplicada, e emite log operacional com os totais.

O storage Forge configurado não expõe endpoint de delete físico no template. Por isso, a limpeza remove a referência privada do banco, que é a única forma de alcançar o objeto pela aplicação; não foi inventada uma chamada destrutiva não documentada ao provedor. O arquivo deixa de ser servido pelo fluxo do produto, enquanto a remoção física fica dependente do lifecycle/retention do próprio storage.

Foi adicionada cobertura PostgreSQL para dry-run sem deleção, política derivada por workspace e isolamento: um workspace com política curta é limpo, enquanto outro workspace com asset/transcrição equivalentes permanece intacto.

Validação desta etapa: `pnpm check` ✅; `pnpm test` ✅ — 106 aprovados, 39 skipped por dependências externas/PostgreSQL; `git diff --check` e build final ainda devem ser executados antes do commit/push.


---
## Etapa seguinte — correção e proposta estruturada — 2026-09-27
A tela de onboarding agora permite corrigir a transcrição diretamente em uma textarea e iniciar uma regravação curta de até 30 segundos. O modo curto é enviado no mesmo storage privado, mas o backend aplica o teto independentemente do cliente (`voice.upload` com `correction=true`). A correção continua sujeita ao consentimento de transcrição e o áudio original permanece preservado conforme a retenção.

Foi adicionada `onboarding.extractProposal`. Ela exige consentimento vigente para `llm`, recebe somente o bloco e o texto revisado, chama o helper server-side `invokeLLM` com saída JSON Schema estrita e aplica guardrails para não inventar preço, prazo, disponibilidade, serviço, política ou promessa. A saída contém apenas os campos permitidos do bloco, `missing`, `conflicts` e confiança de 0–100. O resultado é persistido por workspace/sessão como `draft`, com `source=llm` e nova revisão imutável; não confirma bloco nem publica prompt.

A UI exibe a confiança retornada e exige revisão explícita. O formulário textual continua sendo a fonte de fallback. A pergunta de acompanhamento dedicada para cada campo ausente/ambíguo e a publicação versionada permanecem pendentes.

Validação desta etapa: `pnpm check` ✅; `pnpm test` ✅ — 109 aprovados, 39 skipped por dependências externas/PostgreSQL; `pnpm build` ✅; journal JSON e `git diff --check` ✅.


---
## Etapa seguinte — perguntas de acompanhamento — 2026-09-27
A revisão do onboarding agora cria perguntas explícitas para cada campo `missing` e para cada item de `conflicts`. Campos ausentes podem receber uma resposta manual, ou o responsável pode registrar `decidir depois`; a resposta atualiza somente o bloco em `draft`, troca a proveniência para `human_form`, define confiança 100 e grava nova revisão imutável.

Conflitos possuem um segundo fluxo: o responsável informa qual versão aprovada deve valer. O esclarecimento é registrado em `onboardingConflictResolutions` com `resolution=follow_up`, snapshot da resposta anterior e auditoria; o conflito só sai da lista quando há esclarecimento real. `decidir depois` fica registrado como `deferred` e mantém o conflito aberto para impedir confirmação/publicação prematura.

As procedures `onboarding.answerFollowUp` e `onboarding.answerConflict` são tenant-aware, validam o campo contra o bloco correto, aplicam limites de tamanho e não publicam nem confirmam automaticamente. A UI mostra a pergunta no card de revisão e invalida o perfil após salvar para refletir missing/conflicts e o novo histórico.

Validação desta etapa: `pnpm check` ✅; `pnpm test` ✅ — 112 aprovados, 39 skipped por dependências externas/PostgreSQL; `pnpm build` ✅; journal JSON e `git diff --check` ✅.


---
## Etapa seguinte — telemetria de qualidade e custo — 2026-09-27
Foi criada a migration `0035_onboarding_telemetry`, com eventos tenant-aware e sem conteúdo de resposta/transcrição. Cada evento pode registrar sessão, bloco, fonte, duração, tokens de entrada/saída/total, correção e metadata operacional limitada.

A sessão registra início, retomada, pausa e conclusão; uploads registram duração, tamanho/MIME e se eram correção curta; transcrições registram sucesso/falha e provider; propostas LLM registram modelo e tokens; follow-ups registram contagem de correções humanas e esclarecimentos. O texto do operador, prompt e transcrição não entram na telemetria.

A procedure protegida `onboarding.metrics` retorna resumo por workspace e janela de 1–90 dias: sessões iniciadas/concluídas, abandono estimado para sessão sem atividade há 7 dias, correções, follow-ups, duração de áudio, chamadas/tokens LLM e duração média de sessões concluídas. A UI apresenta esses indicadores no onboarding. Tokens são explicitamente tratados como proxy de custo enquanto o catálogo de preço por modelo não estiver configurado.

Validação desta etapa: `pnpm check` ✅; migration/journal JSON e diff SQL serão validados antes do release; a suíte completa e `pnpm build` permanecem como gates finais.


---
## Etapa seguinte — publicação versionada e rollback — 2026-09-27
A publicação deixou de sobrescrever diretamente o setting atual. A migration `0036_onboarding_published_versions` mantém snapshot imutável de perfil, prompt, autor, versão, data e origem de rollback por workspace.

`publishOnboardingDraft` só publica quando os quatro blocos obrigatórios (`identity`, `offering`, `operations`, `guardrails`) estão `confirmed`, sem `missing`, sem conflitos e com checklist obrigatório completo. O perfil publicado é projetado a partir dos blocos confirmados, evitando publicar uma cópia visual stale do formulário. O versionamento é incremental e o setting compatível `ai_prompt_published` continua atualizado atomicamente com o snapshot.

`onboarding.versions` lista o histórico protegido. `onboarding.rollback` recupera uma versão do mesmo workspace, gera nova versão incremental com `rollbackOfId`, atualiza o perfil publicado e repõe o histórico de respostas; nunca apaga ou reescreve uma versão anterior. A UI apresenta o histórico e a ação de publicar uma versão anterior como novo rollback.

Validação desta etapa: `pnpm check` ✅; teste PostgreSQL condicional de gate/publicação/rollback adicionado (skipped no sandbox sem PostgreSQL); suíte local: 112 aprovados e 41 skipped; migration/journal e build permanecem gates finais.


---
## Etapa operacional — Docker local para prova PostgreSQL — 2026-09-27
Foi preparado um caminho local para o próximo gate: `LOCAL-DOCKER-TESTE.md` documenta o Compose, o `.env` gerado, o start, logs, migrations e os testes de publicação. O PostgreSQL é publicado apenas em localhost; Redis, painel, worker e gateway continuam na rede Docker.

O reset global é separado e protegido por token explícito para reduzir acidentes. Ele pode remover volumes, imagens, redes e cache de outros projetos Docker da máquina, portanto não é executado automaticamente pelo agente. A execução real do teste PostgreSQL fica para a máquina do usuário, onde Docker e o espaço local estão disponíveis.

---
## Etapa seguinte — catálogo operacional de onboarding — 2026-09-29

O passo Serviços do onboarding agora usa o catálogo persistido existente: nome, descrição, duração, modo de preço (`fixed`, `starting_at`, `quote`) e vínculo opcional a profissionais ativos. A migration `0045_service_price_mode.sql` adiciona o enum, mantendo registros existentes como preço fixo e limpando valor numérico quando o modo é “sob consulta”. O passo Operação cadastra profissionais e grava disponibilidade semanal por dia. O campo livre do onboarding ficou explicitamente complementar; o responsável pode optar por usar o catálogo ou “decidir depois”.

A tela administrativa de Serviços passou a exibir/editar os modos de preço; a projeção REST `/api/v1/availability` e o snapshot usado pela ferramenta `consultar_agenda` também retornam `priceType`. O prompt publicado exige consultar o catálogo/agenda atual, não tratar jornada semanal como vaga e não prometer um agendamento antes do sucesso da ferramenta. Vínculos com profissionais continuam tenant-scoped e agora recusam IDs estrangeiros antes de substituir a associação.

Validação no Sandbox: `pnpm check` passou; `pnpm test` passou com 212 testes aprovados e 48 ignorados por dependências condicionais a PostgreSQL; `pnpm build` passou. O PostgreSQL não está disponível, portanto migrations e testes de isolamento persistidos não foram executados. `drizzle-kit generate` continua bloqueado por colisão histórica entre snapshots 0041/0043; a migration 0045 foi adicionada manualmente sem reescrever snapshots fora de escopo. O onboarding permanece `not_ready` até prova manual completa. Próxima fatia: O1.3 — regras de atendimento e revisão de exemplos.


---
## Etapa — regras de atendimento e revisão de exemplos (O1.3) — 2026-09-29
A etapa Revisão inclui cenários fixos seguros para serviço/preço fora do catálogo, horário específico e pedido de atendimento humano. A simulação com IA é opcional e exige consentimento `llm`; usa o candidato de publicação calculado no servidor, não consulta dados operacionais em tempo real, não aciona ferramentas e não persiste as respostas. Saídas estruturadas inválidas falham sem impedir revisão dos cenários estáticos.
A confirmação humana grava apenas fingerprint SHA-256, modo, data e autor em `workspace_settings`. Mudanças no candidato invalidam a revisão; o gate é repetido server-side em `publishOnboardingDraft`. Rollback continua versionado e registra a revisão explícita da versão restaurada. Cobertura adicionada para fingerprint e normalização; teste PostgreSQL de publicação/revisão/obsolescência/rollback adicionado, mas condicionado ao banco.
Validação: `pnpm check` passou; `pnpm test` passou — 214 passaram, 48 ignorados em 65 arquivos; `pnpm build` passou (aviso de bundle >500 kB); `git diff --check` passou. Sem PostgreSQL local, o teste persistido não foi executado. Nenhuma migration nova. A rota permanece `not_ready`.
Próxima fatia: **O1.4 — retomada, autosave, missing/conflict e estados vazios**.


---
## Continuidade — O1.4–O2.4 Onboarding e canal resiliente — 2026-09-30
O bloco O1.4–O2.4 concluiu retomada do onboarding, backoff/logoff final do gateway, lease de inbound com fencing, recibos monotônicos e upload privado de anexos. A entrega técnica e os limites estão em `O1.4-O2.4-ENTREGA-ONBOARDING-WHATSAPP.md`. Gates no Sandbox: check, testes (225 pass / 51 skip), build e diff check do Panel; check, 72 testes e build do gateway. A migration 0046 é aditiva/manual; 0045/0046 aguardam validação PostgreSQL persistente, e ainda falta prova física WhatsApp/storage. PR #6 está aberto e empilhado sobre O1.3, sem merge. Próxima fatia: O3.1 — introduzir Lead explícito e relacionar conversa/oportunidade, preservando isolamento e idempotência.


---
## Continuidade — O3.1 Lead unificado entre contato, conversa e oportunidade — 2026-09-30
O Contact passou a ter um Lead explícito tenant-scoped; cada Lead tem uma Opportunity e a Conversation guarda o vínculo direto. `Opportunity.stage` é canônico, com `contacts.stage` como espelho compatível. O inbound Baileys individual aceito ao vivo cria/atualiza essas entidades com upsert idempotente; grupos, `fromMe`, história/backfill e eventos inválidos/ignorados ficam de fora. `drizzle-pg/0047_unified_leads_opportunities.sql` faz backfill aditivo dos contatos individuais e links de conversa; não foi aplicado em PostgreSQL persistente.

A validação local passou: check, 228 testes (52 ignorados), build e diff check. O Sandbox não tem `DATABASE_URL`, mas o PostgreSQL CI aplicou 0047 e os 7 testes O3.1 passaram. O fixture preexistente dependente de demo foi corrigido no commit `9e3e48d` do PR #6. Ambos os jobs finais passaram: PR #6 run `36664794193` (70 arquivos/276 testes) e PR #7 run `36664802619` (71 arquivos/280 testes). Head O3.1 `805940b` está na branch `feat/o3.1-unified-leads`; PR #7 permanece aberto e empilhado sobre o PR #6, sem merge. CI efêmero não equivale a staging/produção: manter `CORE_ONLY_MODE`. Próxima fatia: O3.2 — assignment e follow-up operacional no Inbox.


---
## Continuidade — O3.2 Inbox operacional com assignment e próxima ação — 2026-09-30
A Opportunity passa a ter responsável opcional validado contra membership ativa do mesmo workspace; somente owner/admin/manager atribui. O Inbox mantém no máximo uma próxima ação aberta por Opportunity, com título e prazo, reprogramável/concluível e auditada. Desativar membro limpa assignments. A próxima ação é um lembrete operacional interno, sem worker, scheduler, mensagem ou mudança automática de stage. Migration aditiva 0048 registra `assignedMemberId` e `opportunityFollowUps`; procedimentos tRPC, projeções da lista/perfil e testes de tenancy foram acrescentados.

Validação: check, teste local (232 pass/53 skips condicionais a banco), build e diff-check passaram. O primeiro run do PR #8 falhou por um fixture de atribuição cruzado; fix no commit `d1b5ca8`. O run PostgreSQL `36708180817` passou as 72 suítes/285 testes sem skips e aplicou migration 0048. PR [#8](https://github.com/geordptoroy/forte-panel/pull/8) está aberto sobre O3.1 e sem merge. PostgreSQL efêmero não é staging/produção; `CORE_ONLY_MODE` continua ligado. Próxima fatia: O3.3 — estágio canônico e eliminação de estado duplicado.


---

## Execução comercial — O3.3 — 2026-09-30

A fonte canônica do funil agora é `Opportunity.stage`; `contacts.stage` é espelho de compatibilidade. A migration aditiva 0049 cria histórico imutável e baseline para oportunidades existentes. Toda mudança Inbox/REST/CRM/agente passa por serviço tenant-scoped que, na mesma transação, bloqueia e atualiza a Opportunity, sincroniza o espelho, registra histórico e auditoria e escreve `stage.changed` na outbox. No-op não cria evento; reparo de espelho não inventa transição. Projeções do Inbox, CRM/Kanban, Agenda e suporte priorizam o estado canônico.

`pnpm check`, `pnpm test` (232 pass/53 ignorados), `pnpm build` e `git diff --check` passaram no Sandbox. Sem `DATABASE_URL`, a validação PostgreSQL foi executada no CI da PR #9: run [`36710769990`](https://github.com/geordptoroy/forte-panel/actions/runs/36710769990) passou no commit `7dc0efc`, aplicou migration 0049 e executou 72 arquivos/285 testes, sem skips. O build mantém aviso conhecido de bundle >500 kB. Branch `feat/o3.3-canonical-opportunity-stage`, empilhada sobre O3.2/PR #8. Não mesclar automaticamente e manter `CORE_ONLY_MODE` até prova persistente.

**Próximo:** O3.4 — orçamento com itens, validade e aprovação humana, sem billing/Stripe. O CI PostgreSQL efêmero não equivale a staging persistente, restore ou prova WhatsApp real.
