# Auditoria de unificação do repositório e prontidão para produção

**Data da auditoria:** 2 de outubro de 2026  
**Repositório:** `geordptoroy/forte-panel`  
**Modo:** leitura estática e análise das referências Git/PR; sem edição de código, merge, rebase, publicação GHCR, deploy, migração, reset Docker ou teste contra serviço real.

## Resumo executivo

**Não recomendo criar outro repositório.** O problema observado está no mesmo repositório: uma `main` e uma cadeia de branches/PRs divergentes, documentação com estados antigos e duas rotas de publicação Docker que usam tags diferentes.

A divergência não é apenas «uma branch está algumas alterações à frente». Na data da auditoria:

- `origin/main` era `f67548570f44b8c8fe79082911d7de557a8a3650`.
- `feat/o7.15-storage-reconciliation-observability` era `61d8a13703b3146727987b6f00b34785bfdcfb87`.
- A base comum era `f83ec85beb278ddfbac59c75405cc187476a1f7a`.
- Desde essa base, havia **18 commits exclusivos de main e 146 exclusivos de O7.15**.
- O PR #3 é uma linha paralela com **21 commits exclusivos**; não está incluído no head O7.15.
- PRs #4–#39 formam uma cadeia empilhada; o PR #39, sozinho, acrescenta 91 commits ao PR anterior.
- Há **32 ficheiros** alterados dos dois lados; o diff tip-a-tip envolve 260 ficheiros.

A análise de patch-id não encontrou commits com patch-id repetido entre SHAs diferentes nas refs analisadas. Portanto, **não há prova de commits literalmente duplicados**. A repetição de tarefas parece ser causada sobretudo pela cadeia de PRs, estados de branch diferentes e documentos/handoffs contraditórios, não por uma cópia exata dos mesmos patches.

A recomendação é fazer **uma única reconciliação temporária** a partir da `main` atual, preservando todas as refs originais. Nessa candidata, integrar os heads relevantes (a cadeia #4–#39 e, se ainda for parte do produto, o PR paralelo #3), resolver cada colisão semanticamente e só depois promover uma versão validada para `main`. Não fazer merge direto de O7.15 para `main`, não rebasear a cadeia e não cherry-pickar tudo às cegas.

**Não considero a aplicação pronta para um lançamento público completo.** Há evidência forte de demo-seeding condicionado, mas persistem resíduos simulados e, mais importante, divergência sobre `CORE_ONLY_MODE` e um gate de release que, embora definido na branch mais recente, não está ligado ao endpoint de signup.

---

## 1. Estado Git e origem da divergência

### Refs verificadas

| Ref | SHA observado | Significado |
|---|---|---|
| `origin/main` | `f67548570f44b8c8fe79082911d7de557a8a3650` | Tem 18 commits que não estão em O7.15. |
| `origin/feat/o7.15-storage-reconciliation-observability` | `61d8a13703b3146727987b6f00b34785bfdcfb87` | Tem 146 commits que não estão em main. |
| Merge-base | `f83ec85beb278ddfbac59c75405cc187476a1f7a` | Último antepassado comum usado nesta comparação. |
| PR #3 | head `d90bba2edc6601e73db9bd18601b9d97a2b2bef4` | Linha paralela: 21 commits exclusivos, 130 ficheiros no diff contra main. |

Os PRs #5–#39 são reportados como mergeáveis contra as respetivas bases empilhadas — **não** significa que a cadeia completa seja mergeável contra a `main` atual. Os PRs #3 e #4 estavam assinalados como conflituosos contra a base atual. Além disso, os campos de base de #3/#4 incluem um SHA antigo (`9387c6e...`), diferente da `main` observada na auditoria.

A partir do merge-base, O7.15 altera 239 ficheiros e main 53; 32 caminhos são tocados dos dois lados. Entre os conflitos semânticos identificados estão `drizzle/schema.ts`, `server/db.ts`, `server/api.ts`, `server/routers.ts`, `client/src/core-mode.ts`, migrations, contratos, documentação e testes. O head de O7.15 também não contém automaticamente os 21 commits do PR #3.

### O que isto significa

- Integrar **só** o head mais recente não preserva tudo que está em main nem tudo que está na linha paralela do PR #3.
- Escolher «o mais novo por data» pode mudar comportamento de produto, não apenas acrescentar ficheiros.
- Os 18 commits exclusivos de main precisam ser preservados; os 146 de O7.15 também; a inclusão dos 21 do PR #3 precisa de ser uma decisão explícita.
- A inexistência de patch-id repetidos não prova equivalência funcional nem ausência de trabalho repetido em documentos ou decisões.

### Estratégia segura de unificação

1. **Congelar e registar** os SHAs das branches e PRs antes de tocar em qualquer uma; não apagar, resetar, rebasear nem force-pushar as refs atuais.
2. Criar uma **branch temporária de integração a partir da main atual**, sem substituir a cópia de trabalho ou mudar a imagem Docker.
3. Integrar a cadeia #4–#39 através do head O7.15 (que contém os antepassados da cadeia) e integrar separadamente o head do PR #3 caso esse trabalho ainda pertença ao produto. Se o PR #3 for excluído, registar o motivo e o conteúdo descartado.
4. Resolver os ficheiros sobrepostos por intenção funcional: schema e migrations coerentes, contratos de API, UI, permissões e documentação. Não usar `ours`/`theirs` para «resolver rápido».
5. Validar que a candidata mantém os commits de main e os heads que o utilizador decidiu preservar; executar os gates de CI, staging e release definidos neste relatório.
6. Só depois da revisão promover **uma candidata** para `main`. As branches temporárias e PRs antigos só são arquivados/fechados depois de a integração ter sido comprovada.

**Escolha técnica:** merges na branch temporária preservam a história original e são preferíveis a rebase global ou cherry-pick global neste caso. A integração temporária é exceção única; depois da reconciliação, não manter uma cadeia permanente de branches empilhadas.

---

## 2. Documentação e contexto perdido entre chats

### Evidência de fragmentação

- Foram encontrados **106 ficheiros Markdown na raiz** e 12 em `docs/`.
- A fonte intitulada `FORTE-PANEL-FONTE-DE-VERDADE.md` identifica como base técnica `cad2b8a` e tem data de consolidação 29/09/2026, embora o checkout e a linha de trabalho já estejam em O7.15.
- `AUDITORIA-SUPERFICIES-RELEASE-2026-09-29.md` documenta base `main` em `47bf199`; várias alegações precisam de ser revalidadas. Por exemplo, afirma que `PanelPages.tsx` importa `demoData`, mas a pesquisa no código atual não encontrou essa importação. O ficheiro `client/src/lib/demoData.ts` existe, mas não foram encontrados consumidores no cliente.
- O mesmo relatório antigo regista `CORE_ONLY_MODE=true`; isso corresponde ao head O7.15 atual, mas **não** ao head de main, onde é `false`.
- `HANDOFF-PROXIMO-CHAT-IA.md` conserva uma regra operacional para usar as tags `:dev`, enquanto o Compose raiz usa `:latest` e o pedido operacional do utilizador é manter a imagem principal e a atualização habitual.
- O handoff também documenta uma forma destrutiva de reset Docker; a regra segura deve ser que reset não é atualização normal e não é executado sem pedido explícito.
- Não foi encontrado um `AGENTS.md`, `CONTRIBUTING.md` ou README na raiz a definir um procedimento obrigatório e único para a IA.

### Organização recomendada

Não criar mais uma «fonte de verdade» concorrente. Criar, quando autorizado a levar a política para main:

1. **`AGENTS.md` na raiz:** regras permanentes para qualquer IA que abra o repositório — branch canónica, preflight, imagem, reset, verificações obrigatórias e documentos que deve ler.
2. **Um único `docs/STATUS-ATUAL.md`:** estado volátil da execução (branch/HEAD, PR ou run, SHA da imagem, decisão seguinte). Atualizado em cada tarefa; não repetir a história completa.
3. **Um documento de produto/arquitetura:** decisões duradouras e estado real das superfícies.
4. **Um roadmap:** fila de trabalho e critérios de aceite; uma tarefa concluída não fica copiada em vários handoffs ativos.
5. Mover os handoffs antigos para histórico ou marcá-los claramente como **ARQUIVO — NÃO USAR COMO ESTADO ATUAL**. Não os apagar antes de preservar a referência.

Um `AGENTS.md` é preferível a uma skill como mecanismo primário: fica junto ao repositório e acompanha o contexto quando a pasta é selecionada, enquanto uma skill depende do ambiente/agente estar configurado para a carregar.

### Regras permanentes propostas para `AGENTS.md`

- `main` é a única linha de produto canónica. Não começar trabalho a partir de uma branch escolhida pelo contexto antigo do chat.
- Antes de alterar, confirmar repositório, branch, HEAD, estado limpo e SHA remoto de main. Se não coincidir com o estado esperado, parar e explicar; não trocar de branch silenciosamente.
- Não criar branches de longa duração nem PRs empilhados. Se a proteção GitHub exigir PR, usar apenas PR curto diretamente para main, nunca PR sobre outro PR.
- Não mudar o caminho GHCR nem criar uma tag operacional alternativa. Apenas uma publicação de produto, originada em main e depois dos gates; tags SHA podem existir para rastreabilidade, não para substituir a imagem que o operador atualiza.
- Depois de publicar, esperar o workflow terminar e confirmar que a execução e o digest correspondem ao commit da main. Só então indicar o procedimento de atualização documentado.
- Usar o caminho normal **não destrutivo** do script de atualização existente. Reset de volumes, imagens ou Docker global só com pedido explícito e depois de esclarecer que apaga dados.
- Em handoff, registar um único SHA, resultado real de CI/GHCR e próxima ação; nunca dizer «publicado» com workflow em execução.

---

## 3. GHCR, tags, Compose e script de atualização

### Estado observado

- O Compose raiz (`docker-compose.yml`) consome `ghcr.io/geordptoroy/forte-panel:latest` e `ghcr.io/geordptoroy/forte-whatsapp:latest`.
- O Compose local (`docker-compose.local.yml`) consome `:dev` (na branch atual também admite overrides `FORTE_PANEL_IMAGE` e `FORTE_WHATSAPP_IMAGE`).
- `publish-image.yml` publica as duas imagens; `latest` é condicional ao default branch, mas `dev` e `sha-*` são publicados também por branches autorizadas. A versão da branch O7.15 inclui a própria feature branch no trigger; a versão da main analisada inclui main e a branch de documentação. Assim, pushes de desenvolvimento/documentação podem sobrescrever `:dev`.
- O workflow de publicação depende apenas do seu próprio job `verify`. A integração PostgreSQL é workflow separado; staging smoke e staging E2E são manuais. Não há prova no workflow de que a publicação espere todos esses gates.
- A instalação PowerShell normal usa `docker-compose.local.yml`, logo aponta para `:dev`; a instalação shell normal usa o Compose raiz, logo aponta para `:latest`. `docker-up-local.sh`, apesar do nome, também usa Compose raiz por padrão.
- `scripts/start-docker.ps1` tem caminho normal de pull/recriação e caminho `-Reset` destrutivo. O reset remove volumes e recursos Docker, e pode executar prune global. `scripts/dev-reinstall.ps1` não é o caminho normal seguro: requer a opção de reset de dados. Os scripts portanto não têm uma única interpretação operacional.

### Recomendação operacional — sem mudar os caminhos GHCR

- Preservar exatamente os endereços GHCR atuais e manter **`:latest` como a imagem operacional principal**, publicada apenas pela `main` depois dos gates.
- Não usar `:dev` no caminho normal do utilizador. A alteração a fazer no código/documentação futuro é alinhar Compose e script normal ao mesmo `:latest`; não inventar outro repositório, caminho ou nome de imagem.
- Manter SHA/digest como prova e rastreabilidade em CI, mas não pedir ao utilizador para escolher tags diferentes a cada chat.
- Fazer com que a publicação de `:latest` só comece após CI de aplicação, PostgreSQL/migrations e testes de imagem; usar o digest efetivamente testado, não reconstruir um segundo artefacto.
- Depois da publicação, esperar o resultado final do workflow da main. Para atualizar a máquina do utilizador, seguir apenas o `git pull` e o script existente no seu modo normal, depois de o script apontar para a imagem principal. **Não usar o reset como atualização.**

O script normal atual precisa de ser corrigido/alinhado antes de se afirmar que «baixar a imagem principal» atualiza a instalação: hoje, o caminho PowerShell normal usa `:dev`.

---

## 4. Demo, mocks e prontidão funcional pública

### O que está protegido

- `server/db.ts:isDemoRuntimeAllowed` requer `DEMO_MODE=true` e ambiente development/test ou `DEMO_ENVIRONMENT=qa`.
- `ensureDemoInbox`, `ensureDemoAgenda` e outros helpers de seed verificam essa condição; `server/routers.ts` também bloqueia a mutation `inbox.seed` quando o modo demo não está autorizado.
- Os Compose observados definem `DEMO_MODE=false` por omissão/explicitamente.
- Portanto, os contactos/mensagens de exemplo não parecem ser semeados no runtime normal de produção com essas configurações. **Isto não significa que todas as superfícies de demo tenham sido removidas.**

### Resíduos e gaps concretos

1. **`CORE_ONLY_MODE` contraditório:** `client/src/core-mode.ts:10` está `false` em `origin/main` e `true` no head O7.15. A alteração muda quais páginas aparecem no frontend. Não se deve aceitar automaticamente um dos lados durante a integração.
2. **É uma restrição de interface, não autorização:** o comentário de `core-mode.ts` diz que RBAC do backend protege as procedures. Com `CORE_ONLY_MODE=false`, a UI deixa de aplicar a contenção de rotas; ainda assim, isso não deve ser confundido com autorização pública para cada operação.
3. **Catálogo de release não é um gate completo:** `release-catalog.ts` classifica Inbox e conexão WhatsApp como `not_ready`, embora permitidos em core. A aplicação precisa de aplicar estes estados deliberadamente, em vez de depender de um booleano geral divergente entre branches.
4. **Gate de signup não ligado:** a branch O7.15 contém `evaluateControlledRelease`, que calcula `publicSignupEnabled` e bloqueia em memória quando faltam provas. Mas as referências de runtime encontradas usam `getControlledReleasePolicy` para a consulta `platform.controlledReleasePolicy`; o signup em `server/routers.ts` continua num `publicProcedure` que chama `createPublicSignup` e controlo de tentativas. Não encontrei uma chamada a `evaluateControlledRelease` no endpoint de signup. Logo, esse contrato/teste não demonstra que o signup real esteja bloqueado pelos gates.
5. **O gate e o validator não estão em main:** `server/controlled-release.ts` e `scripts/validate-production-config.ts` estão na linha O7.15, mas não no snapshot `origin/main` auditado. A main tem `CORE_ONLY_MODE=false` e não possui o validator de configuração observado na feature branch.
6. **Validator limitado:** na linha O7.15, `validate-production-config.ts` rejeita `DEMO_MODE=true`, bootstrap explícito e segredos placeholder e valida alguns requisitos condicionais. Não encontrei esse validator a ser chamado pelo entrypoint do container. Uma validação sintética no CI não valida os segredos nem conectividade do runtime real.
7. **Mocks/resíduos não roteados:** `client/src/lib/demoData.ts` existe, mas a pesquisa atual não encontrou importadores; `ComponentShowcase.tsx` contém resposta de chat simulada, mas não está importado/registado em `App.tsx`; `client/src/components/Map.tsx` usa `DEMO_MAP_ID` e não tem consumidor encontrado. Devem ser removidos do bundle/caminho público ou preservados explicitamente como ferramenta isolada, após confirmação de que não há importação dinâmica.
8. **Simulação administrativa explícita:** `server/platform-admin.ts` devolve `mode: "simulation_only"` e `providerCalled: false`. É um fluxo sem efeito externo, diferente de um provider real; pode existir para revisão/QA, mas não pode ser apresentado como envio ou integração real e deve continuar restrito a plataforma/admin.
9. **Cuidado com `DemoBanner`:** a classe CSS `demo-banner` também é usada para mensagens de estado/erro. Uma remoção global pelo nome pode retirar feedback legítimo. Limpar os componentes e fluxos concretos, não apagar a classe indiscriminadamente.

### Limites da afirmação «sem dados mock/demo»

A auditoria encontrou um seed real e guardas explícitas, alguns resíduos e uma simulação administrativa. Não foi feita uma análise linha a linha de todos os adapters/providers nem uma prova de build que mostre exatamente quais componentes entram no bundle público. A conclusão correta é: **o seed principal está condicionado; ainda não há evidência suficiente para garantir que todo o produto público esteja livre de simulações ou totalmente funcional.**

---

## 5. CI e evidências de lançamento

- `publish-image.yml` executa validações/builds no job `verify` e depois publica; o job `publish` tem `needs: verify`.
- `postgres-integration.yml` executa PostgreSQL, migrations e rejeita testes pulados nesse workflow, mas é separado da publicação. Não é evidência de que publish espere o job PostgreSQL.
- Staging smoke e staging E2E são acionados manualmente. O smoke cobre readiness; E2E tem ambiente/fluxo externo e cria dados. A definição dos workflows não comprova que os testes tenham corrido contra o mesmo digest que vai ser publicado.
- Nos testes do painel há 23 suites server condicionais à disponibilidade de base de dados. Se o job de publicação correr sem `DATABASE_URL`, essas suites podem ser puladas; o workflow PostgreSQL separado tem uma política mais forte, mas não está ligado ao publish.
- O build das imagens não executa as imagens construídas num Compose isolado. Não foi observada prova no workflow de smoke do container, SBOM, assinatura, attestation/proveniência ou rollback por digest.
- `server/controlled-release.ts` pede evidência explícita de readiness, PostgreSQL, isolamento de tenancy, backup/restore, E2E WhatsApp controlado, observabilidade, revisão legal e billing SaaS. A função é fail-closed como cálculo de política, mas não há prova de que essas evidências alimentem um gate de deploy/publicação.

### Gates mínimos antes de chamar isto de produção pública

1. `main` passa typecheck, build, testes unitários e testes de integração críticos sem skips silenciosos.
2. PostgreSQL limpo: migrations, journal e contratos de tenancy testados.
3. A imagem exata produzida é executada em Compose isolado: migration, `/health`, `/ready`, worker, Redis e gateway.
4. Staging smoke/E2E é obrigatório, associado ao mesmo commit/digest e com cleanup documentado.
5. Prova negativa de isolamento entre workspaces, backup/restore real e procedimento de rollback por digest.
6. Prova real e controlada de QR/reconexão/envio WhatsApp antes de declarar o caminho de mensagens pronto.
7. Signup realmente consulta o gate fail-closed; legal/privacidade/termos e billing são configurados quando o escopo é SaaS público.
8. Branch protection/required checks e ambiente de publicação protegidos no GitHub; confirmar configuração externa, pois não é demonstrável apenas por ficheiros do repo.

---

## 6. Plano de refatoração para produção

### Fase 0 — Congelar a fonte de verdade

- Decidir se PR #3 pertence ao produto e confirmar o escopo dos PRs #4–#39.
- Fixar a main atual como base de reconciliação; preservar refs e dados.
- Escrever as regras permanentes em `AGENTS.md` e consolidar status dinâmico num único documento.

### Fase 1 — Uma reconciliação, sem perder evolução

- Criar uma única candidata temporária a partir de main.
- Integrar a cadeia principal e a linha paralela escolhida.
- Rever migrations e os 32 caminhos comuns; conservar alterações exclusivas de main.
- Executar testes e registrar por commit os conflitos decididos. Não publicar ainda.

### Fase 2 — Guardrails de produto reais

- Transformar a classificação de superfícies em enforcement consistente frontend + backend.
- Ligar o gate de release ao endpoint de signup e ao workflow que publica, não só a uma consulta administrativa.
- Definir deliberadamente que rotas ficam no core; não usar uma flag divergente `true/false` como substituto de critérios por rota.
- Provar que signup cria workspace vazio real e nunca cria seed; manter fixtures em testes, fora do runtime público.
- Remover ou isolar `demoData`, showcase e Map placeholder, e rotular simulações administrativas.

### Fase 3 — Integrações reais e fluxo comercial

- Validar com ambiente controlado as ligações WhatsApp, envio/recebimento, reconexão, mídia, filas e worker.
- Fechar onboarding, Inbox, agenda, orçamento/cobrança, email de recuperação e demais dependências externas da superfície que será vendida.
- Configurar tenancy, permissões, suporte, privacidade/termos e billing SaaS para o escopo escolhido.

### Fase 4 — Release e imagem principal

- Fazer da `main` a única origem operacional de imagem; manter os caminhos GHCR atuais e a tag principal `latest`.
- Não publicar `dev` de branches de trabalho/documentação. Manter SHA/digest como metadado de rastreio.
- Fazer todos os workflows necessários agregarem antes do publish e testar o digest exato que será usado.
- Alinhar os Compose e o caminho normal do script PowerShell ao `latest`; manter o reset como opção separada e claramente destrutiva.
- Aguardar conclusão real do workflow, verificar commit e imagem, só então atualizar a máquina com o procedimento existente não destrutivo.

### Fase 5 — Simplificação permanente

- Depois de main consolidada e publicada, encerrar a cadeia de PRs antigos e impedir novas PRs empilhadas.
- Usar main como única linha duradoura. Se a proteção exigir revisão, PR curto diretamente para main; nenhuma branch de trabalho serve de base para outra PR.
- Handoff passa a conter somente estado atual, SHA, resultado CI/GHCR e próxima tarefa; histórico fica arquivado.

---

## 7. Estado desta execução e próxima decisão

- Checkout observado: `feat/o7.15-storage-reconciliation-observability` em `61d8a137...`; estado de trabalho limpo.
- `origin/main` observado: `f675485...`.
- Esta auditoria **não** criou branch, não alterou ficheiros do repositório, não fez commit, não publicou GHCR, não executou Docker/serviços reais e não fez merge/rebase/cherry-pick.
- O relatório foi guardado fora do checkout para não acrescentar mais um documento não publicado a uma branch divergente.

**Próxima ação recomendada:** autorizar a criação de uma candidata temporária a partir de `main`, decidindo se o PR #3 (21 commits exclusivos) deve ser incluído juntamente com a cadeia #4–#39. Até essa decisão, não fazer merge para main nem publicar a imagem.
---

## Addendum — candidata local e validação posterior — 2026-10-02

Este addendum atualiza o **estado da execução**, não apaga a fotografia histórica descrita acima. A branch de trabalho é `integration/beta-candidate-2026-10-02`, baseada no `origin/main` observado em `f67548570f44b8c8fe79082911d7de557a8a3650`, com o conteúdo de O7.15 reconciliado na árvore local. A candidata ainda tem alterações staged/unstaged e não foi commitada nem publicada. Main e as branches remotas não foram reescritas.

### Evidência nova de testes

Foi instalado e iniciado um PostgreSQL 16 local e descartável no Sandbox, sem usar Supabase. A cadeia atual aplicou **60 migrations** numa base vazia. Com `DATABASE_URL` apontada apenas para essa base, passaram `pnpm check` e **112 suites / 407 testes root**, sem testes ignorados. O validator de configuração de produção passou com valores sintéticos seguros. `pnpm build` passou, embora mantenha um aviso de chunk JavaScript minificado com cerca de 1,1 MB.

No gateway Baileys passaram **16 suites / 84 testes**, `npm run check` e `npm run build`. Nenhum destes resultados prova integração real com WhatsApp, navegador ou imagem Docker; tais testes não foram executados.

A integração local também reparou a relação `appointments.quoteId` esperada pela aplicação: schema e snapshot foram alinhados, migration PostgreSQL aditiva 0059 foi acrescentada e `quoteId` foi transportado até ao contrato REST. A suíte completa que passou verifica as alterações de teste atuais. Ainda falta o cenário de upgrade de uma base que já tenha aplicado as migrations da main — até ele passar, a compatibilidade de upgrade não está provada.

### Regras de publicação e atualização aplicadas à candidata

O workflow foi restringido a pushes em `main`, mantém `latest` e `sha-*` como rastreio e deixa de publicar `dev`. O Compose local foi fixado aos caminhos principais `ghcr.io/geordptoroy/forte-panel:latest` e `ghcr.io/geordptoroy/forte-whatsapp:latest`. O script PowerShell normal continua a preservar dados; o reset foi limitado à stack Forte Panel, sem `docker system prune` global, para não apagar outros projetos da máquina. `dev-reinstall.ps1` e o reset shell antigo encaminham para os scripts canónicos.

Isto ainda é alteração local: não houve push, execução de GitHub Actions, publicação GHCR ou teste de instalação na máquina do utilizador. O workflow de publicação ainda precisa de depender, **no mesmo workflow**, dos testes PostgreSQL/migrations e de zero skips; a verificação PostgreSQL num workflow separado não é gate de publicação suficiente.

### PR #3: decisão ainda pendente

A consulta read-only ao GitHub confirmou PR #3 aberto e conflituoso contra `main`, intitulado **“feat: CRUD multi-instância Baileys no core”**, head `d90bba2edc6601e73db9bd18601b9d97a2b2bef4`. A comparação de nomes de ficheiro encontrou 59 paths no seu diff contra main, 28 também alterados por O7.15 e 31 exclusivos. Entre os exclusivos estão `client/src/pages/WhatsappConnectionPage.tsx`, `client/src/lib/baileys-status.ts`, `forte-whatsapp/src/pairing-code.ts`, as migrations 0038/0039 e contratos/testes associados. Portanto, não é seguro descartar o PR só porque a candidata O7 é maior. A auditoria funcional independente foi iniciada e a conclusão deve ser acrescentada a `docs/STATUS-ATUAL.md` antes de qualquer integração.

### Regras de continuidade

Foram criados na candidata `AGENTS.md`, `docs/WORKFLOW-DESENVOLVIMENTO-E-RELEASE.md` e `docs/STATUS-ATUAL.md` para retirar autoridade a handoffs antigos, fixar `main`/GHCR `latest`, impedir tags `:dev` e definir os testes e o script local. Estes ficheiros substituem as recomendações antigas de criar uma nova fonte de verdade.

A instalação local solicitada após a publicação fica limitada a `git pull` e `scripts/start-docker.ps1` em modo normal; o reset é uma opção explícita e destrutiva apenas para os dados da stack Forte Panel. Não se deve pedir ao utilizador comandos Docker avulsos.

### Pendências e limitação de configuração

Além da auditoria do PR #3 e do teste de upgrade PostgreSQL, o CLI pnpm mostra que `pnpm.patchedDependencies` e `pnpm.overrides` no `package.json` são ignorados. Uma tentativa local de migrar essas definições para `pnpm-workspace.yaml` não foi mantida porque não produziu um lockfile congelado compatível. Antes de editar a configuração, confirmar a sintaxe da versão efetivamente fixada na documentação oficial do [pnpm settings](https://pnpm.io/10.x/settings) e [pnpm-workspace.yaml](https://pnpm.io/10.x/pnpm-workspace_yaml), preservando o lockfile e exigindo `pnpm install --frozen-lockfile`.

Até passar o upgrade da main, resolver a cobertura do PR #3, ligar PostgreSQL ao gate de publish e confirmar as verificações de release, **não declarar beta pública nem publicar a imagem**.

### Complemento de validação — upgrade e gate de publicação

Após o addendum anterior, foi criado um segundo PostgreSQL descartável. Aplicaram-se primeiro **45 migrations da `main`** e depois as **15 migrations da candidata**, chegando às mesmas 60 migrations; a migration 0059 e a coluna `appointments.quoteId` foram verificadas. A suite root voltou a passar nesta base atualizada: **112 ficheiros / 407 testes, zero skipped**. Isto cobre o caminho de schema, mas a base não tinha dados de negócio e não demonstra preservação de dados reais.

O workflow local `publish-image.yml` foi atualizado para criar um serviço PostgreSQL 16, aplicar migrations e falhar se os testes indicarem skips; `publish` depende de `verify`. A sintaxe YAML e as condições main/latest foram validadas localmente. Como a candidata não foi enviada, o workflow **ainda não correu no GitHub**.

O warning do pnpm foi investigado: o lockfile contém o hash/entrada do patch Wouter e o ficheiro instalado confirma `__WOUTER_ROUTES__`, portanto o patch está presente nesta instalação congelada. Persiste, contudo, o aviso de configuração do `package.json`; não se deve regenerar o lockfile até a migração de settings ser resolvida e testada.

---

## Decisão final da auditoria — PR #3 vs main + O7 — 2026-10-02

### Veredito

**Não integrar nem fazer cherry-pick da ref inteira do PR #3.** A candidata deve manter a linha `main + O7`. A auditoria por cinco áreas confirmou que os fluxos de multi-instância Baileys, pairing/readiness, polling de estado e REST opt-in já estão em main/O7; vários ficheiros de pairing/status e as migrations 0038/0039 têm exatamente os mesmos blobs entre as refs.

O head `d90bba2` do PR #3 é essencialmente documental, mas a ref completa por trás do PR representa uma árvore anterior. Ela preserva adapters PAPI e Meta Cloud e defaults multi-provider que entram em conflito com a política Baileys-only atual. Também oferece uma variante de UI da página WhatsApp, mas essa versão retira settings/profile e o atalho para Inbox; não é um patch isolado e seguro para transportar. **Nenhuma alteração do PR #3 foi copiada para a candidata.**

### O que a decisão preserva e o que deixa em aberto

- Preserva Baileys-only, isolamento por instância, CRUD/status, settings/profile, Inbox, idempotência de envio, anti-replay, leases, delivery status, histórico/normalização e reconnect/backoff da linha main/O7.
- Mantém fora PAPI e Meta Cloud. Se ainda forem requisitos do produto, devem ser desenhados numa fatia nova, com provider/instância explícitos e testes de isolamento; não reintroduzir a árvore antiga nem o fallback global PAPI.
- Mantém a UI atual. A variante visual/formulário do PR #3 só deve ser portada se for escolhida como requisito e coberta por testes de telefone/E.164, acessibilidade, criação antes do pareamento e contratos atuais.
- PR #3 continua intocado no GitHub: não foi fechado, mergeado nem rebaseado.

### Lineage de migrations e preflight de dados

A candidata conserva `0038` e `0039` (iguais nas refs), os SQL `0040–0044` de main e os `0045–0058` de O7, seguidos da migration local `0059` que restaura `appointments.quoteId`. A preservação de `0040–0044` é importante: o journal O7 regista essa sequência, mas a árvore O7 isolada não continha todos esses ficheiros SQL.

O teste local aplicou 45 migrations de main e depois 15 da candidata; passaram 112 suites / 407 testes, sem skips. **A base era descartável e vazia de dados de negócio.** Antes de qualquer atualização de uma instalação real, ainda é necessário confirmar duplicados de `instanceId`, múltiplas instâncias default ativas e quaisquer rows/settings legadas PAPI/Meta: as migrations de unicidade e as checks/defaults Baileys podem falhar deliberadamente e não fazem deduplicação automática. O acesso ao Supabase e a dados do utilizador foi expressamente evitado.

### Webhook nonce

Foi verificada a preocupação com o índice de `0055_webhook_anti_replay.sql`, único por `(workspaceId, provider, webhookNonce)` sem `instanceId`. O gateway gera cada nonce com `crypto.randomBytes(18).toString("base64url")` (144 bits) e a verificação usa o segredo global configurado; a unicidade partilhada entre instâncias no workspace/provider é coerente com esse namespace e evita aceitar replay da mesma nonce noutra instância. Não foi encontrada razão suficiente para mudar o índice.

### Release e limites

A candidata mantém `main` → `:latest` nos caminhos principais e acrescenta PostgreSQL, migrations e zero-skips ao mesmo job de verificação que precede `publish`. O YAML foi validado no Sandbox, mas o workflow ainda não executou no GitHub. Nenhuma imagem foi publicada; não houve Docker no utilizador, WhatsApp real, Supabase ou alteração remota.

**Decisão confirmada pelo utilizador em 2026-10-02:** o produto é exclusivamente Baileys. A PAPI fica apenas como referência nos documentos técnicos de engenharia; não é provider, adapter ou dependência do produto. Meta não é suportada. Antes de promover, continua obrigatório fazer preflight seguro dos dados do ambiente de destino.
