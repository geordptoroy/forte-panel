# Plano review-only: Forte Panel com Baileys como único provider

**Data:** 2026-09-27
**Estado:** plano para revisão do usuário — nenhuma remoção de código, migration, registro de banco, volume Docker ou histórico Git foi executada nesta etapa.
**Alvo:** remover por completo do estado final do projeto o suporte, nomes, configurações e documentação de PAPI e Meta Cloud API; manter Baileys como único transporte WhatsApp.
**Ambiente de desenvolvimento registrado:** Windows Terminal/PowerShell com Docker Desktop e WSL; trabalho diário no repositório local dentro do WSL. A futura implantação na Oracle Cloud é uma fase separada, não autorizada por este plano.

> Este plano substitui as versões anteriores deste documento que diziam que PAPI ainda seria mantida para drenar filas ou que Meta permaneceria como alternativa opcional. O código atual ainda contém esses adapters; portanto, a limpeza **não** deve ser considerada concluída até uma implementação posterior e a verificação final descrita aqui.

## 1. Decisão pretendida

1. **Baileys será o único provider/canal de WhatsApp.** Não haverá seleção, adapter, webhook ou credencial de PAPI ou Meta.
2. O WhatsApp será acessado pelo serviço interno `forte-whatsapp`, com sessões multi-instância próprias, Bearer key entre Panel/worker/gateway e webhook inbound assinado.
3. **Não haverá integração n8n nem API empresarial aberta.** As chamadas do browser continuam no tRPC autenticado do Panel. Removeremos as rotas REST empresariais que só serviriam a consumidores externos; manteremos probes operacionais e o callback interno e autenticado do Baileys.
4. O `FORTE_PUBLIC_API_ENABLED` existente permanece somente durante a transição, se ainda necessário para o E2E de staging; depois que esse teste for refeito sem a REST API, remover a flag, a chave correspondente e as rotas empresariais.
5. O Console Administrativo e a área do workspace não oferecerão alternativas de provider. Chaves de modelos de IA continuam sendo uma área futura separada e **não** são chaves do WhatsApp/Baileys.
6. **Dados de trabalho não serão apagados para simplificar a migration.** Preservar workspaces, usuários, conversas, mensagens e auditoria; remover segredos e configurações dos providers antigos após backup e validação. Sessões antigas não serão presumidas como portáveis: cada número precisará ser pareado no registry Baileys se não houver migração de auth comprovadamente compatível.

## 2. Estado atual verificado

Esta auditoria é do working tree da branch `docs/ai-admin-core-plan-2026-09-27`, commit `ed20e45`; PR aberto: [#3 — CRUD multi-instância Baileys no core](https://github.com/geordptoroy/forte-panel/pull/3).

### Runtime e configuração

- `server/integrations/contracts.ts`: union `WhatsappProvider` inclui três valores e interfaces específicas dos três adapters.
- `server/integrations/whatsapp.ts`: ainda contém os adapters PAPI e Meta, normalização inbound legada e uma factory que pode cair em PAPI como default.
- `server/integrations/papi-cloud.ts`: provisionamento/gestão de instância PAPI Cloud.
- `server/_core/env.ts`: variáveis de ambiente PAPI Cloud/deployment ainda definidas.
- `server/db.ts`: funções de configuração/provider default, CRUD de instâncias e webhooks PAPI; lê/escreve `papi_webhooks`, `papi_default_webhook` e `default_whatsapp_provider`; caminhos inbound/outbound ainda contêm fallback legado PAPI.
- `server/api.ts`: ainda há validação/bifurcação de mensagem por Meta e rotas/configuração de webhooks de providers. O callback Baileys é necessário e deve permanecer.
- `server/routers.ts` e `server/platform-admin.ts`: seleção de provider e dados agregados de instâncias antigas ainda têm consumidores administrativos.
- `client/src/pages/PanelPages.tsx`, `client/src/pages/PlatformAdminPage.tsx` e `client/src/lib/demoData.ts`: há UI/demonstrações e estados para provider que não deve permanecer.
- `docker-compose.yml`, `docker-compose.local.yml`, `.env.docker.example` e `.env.local.example`: ainda passam variáveis `META_*`; os exemplos devem terminar contendo somente as configurações realmente necessárias ao Baileys e aos outros serviços ativos.
- `.github/workflows/publish-image.yml`: o detector de segredos contém o nome de uma chave PAPI; substituir por detecção genérica de credenciais, sem nomes dos providers removidos.
- `server/_core/message-routing.ts`, `server/integrations/whatsapp.test.ts`, `server/_core/message-routing.test.ts` e `server/secret-safety.test.ts`: lógica e testes ainda codificam providers antigos.

### Banco e migrations

- `drizzle.config.ts` aponta para PostgreSQL e `drizzle-pg/`; esse é o conjunto ativo do migrator atual.
- O diretório PostgreSQL tem **40 arquivos SQL** e **13 snapshots**; o enum inicial contém os providers antigos, e uma migration posterior adiciona Baileys.
- As migrations `0038` e `0039` atuais expressam os índices Baileys como `provider NOT IN (...)`. Isso existe por causa da história/transação de enum — não é a forma final desejada.
- `drizzle/schema.ts` ainda mantém esses valores no enum e defaults antigos em `whatsappInstances` e `messages`.
- `drizzle/` também contém **8 SQLs e 7 snapshots MySQL antigos**. O config atual aponta para PostgreSQL, mas o uso desse conjunto legado por algum workflow/deploy tem que ser confirmado antes de apagá-lo.
- `whatsappChannels`, `whatsappInstances` e `messages` ainda armazenam provider; a fila e alguns roteamentos usam o campo para escolher o adapter. O CRUD multi-instância Baileys recém-criado usa `instanceId`, workspace e o gateway interno, mas a migração completa ainda exige remover a dependência genérica do provider.
- `whatsappInstances` guarda campos próprios da configuração antiga — deployment, API key, webhook ID/segredo. As mensagens podem guardar `provider` e metadados de roteamento. Não apagar tabelas nem converter filas sem inventário por workspace e backup.

### API e integrações externas

- A busca do repositório não encontrou fluxo n8n ativo nem caller do frontend para a REST empresarial. O workflow E2E de staging é um consumidor conhecido e precisa ser adaptado antes de remover essa API.
- O gate REST de negócios já fica `false` por padrão em Compose; isso **não** significa que as rotas PAPI/Meta foram removidas do código.
- Probes de saúde/readiness e `POST /api/v1/webhooks/providers/baileys` têm finalidade operacional/interna e permanecem. O callback precisa continuar autenticado e vinculado a uma sessão/workspace válidos.

## 3. Verificação pública de `intrategica/papi-free:1.5.1`

A imagem foi consultada somente como metadado público; **não foi puxada, extraída ou executada**.

- [Docker Hub — repositório da imagem](https://hub.docker.com/r/intrategica/papi-free): a página não fornece overview, link de source ou licença.
- [Docker Hub — metadados da tag 1.5.1](https://hub.docker.com/v2/repositories/intrategica/papi-free/tags/1.5.1): tag ativa, imagem Linux `amd64`, digest do índice `sha256:e3f58bde5a4bcf5f58caf8546883e375f5c236e65e36cd96753500989036b5b8`, digest da imagem `sha256:efc1c7cd27d84e849b436371e1dbfdc8391df444498a4ea5e99908bd4556db2e`, tamanho informado de 191.985.103 bytes e último push em 2026-02-21.
- A página do repositório destaca `1.5.2` como tag recente; a solicitação nomeou especificamente `1.5.1`.
- A consulta pública do GitHub à organização `intrategica` retornou 404, e a busca de repositórios pelo nome não encontrou um source repo público. Isso **não prova** que não exista source privado ou em outro endereço; significa apenas que nenhum link de source/licença foi encontrado nas fontes públicas consultadas.

### Procedimento proposto para investigar endpoints sem copiar código

1. Preferir obter do mantenedor o source oficial, licença e documentação/OpenAPI da versão exata `1.5.1`.
2. Se o source não estiver disponível, após aprovação do plano, avaliar **somente inspeção estática isolada** das camadas/metadata da imagem para localizar rotas, método HTTP, autenticação, formatos de QR/status/pairing e contratos de mensagens/webhooks. Não executar a imagem no ambiente principal e não copiar código, segredos ou assets proprietários para o Forte Panel.
3. Criar uma matriz de compatibilidade por comportamento observado e implementar apenas o contrato necessário no gateway próprio `forte-whatsapp`, testando-o com dados fictícios. Não presumir que PAPI e a API interna do nosso gateway têm os mesmos paths.
4. Qualquer necessidade de executar a imagem, conectá-la a uma conta WhatsApp ou fazer tráfego de rede dinâmico fica como nova etapa e exige confirmação específica, ambiente isolado e número de teste.

> A imagem pode ajudar a descobrir **como** outra aplicação organizou endpoints Baileys, mas não é uma dependência de runtime nem uma fonte verificada de código/licença neste momento.

## 4. Alvo técnico recomendado

- Um caminho de conexão: UI → tRPC autenticado/tenant-scoped → Panel → gateway `forte-whatsapp` autenticado → Baileys.
- O gateway mantém `InstanceRegistry` e uma sessão/diretório por `instanceId`; criação não conecta sozinha. Conexão/QR, pareamento, status, disconnect/logout e exclusão são operações por ID.
- O ID tem que ser globalmente único no gateway compartilhado; autorização do Panel sempre valida workspace antes de chamar o gateway.
- Inbound: manter apenas callback Baileys assinado, com resolução de owner/instância ativa; payload de sessão removida/inativa é rejeitado.
- Outbound: enviar somente com `instanceId` explícito associado à conversa/canal; não cair em sessão `default` global quando faltar vínculo.
- REST de integração com consumidores externos: removida após migrar o único consumer automatizado conhecido (E2E de staging). Manter apenas health/readiness e callback assinado do gateway. O frontend não recebe Bearer key do gateway.
- Persistência: retirar as bifurcações de provider do runtime. A decisão de conservar ou eliminar colunas genéricas `provider` será fechada após mapear todos os call sites; a regra obrigatória do estado final é **nenhum valor/nome/caminho PAPI ou Meta no schema ativo**. Se o campo genérico ainda for necessário por compatibilidade interna, sua única representação no runtime final será Baileys.

## 5. Plano ordenado — sem executar até a sua aprovação

### Fase 0 — Freeze e inventário de dados

1. Conferir branch/commit, `git status` limpo e versão da stack local.
2. Identificar nome do Compose project, volumes PostgreSQL/Redis/sessões e path do `.env`; nunca imprimir segredos nos logs/chat.
3. Fazer backup verificado do PostgreSQL (`pg_dump`) e inventário de contagens por provider/estado, workspace e `instanceId`; preservar o volume original.
4. Contar mensagens `queued`/`processing` e associações de outbound a instâncias. Pausar ou colocar essas mensagens em estado que não seja enviado até haver mapeamento comprovado.
5. Conferir colisões de IDs entre workspaces e IDs especiais como `default`, pois o registry usa caminhos físicos baseados em ID.
6. Confirmar se `drizzle/` MySQL aparece em pipeline/deploy ativo; não apagar por suposição.

### Fase 1 — Contrato Baileys e compatibilidade de IDs

1. Escrever matriz de endpoints e estados usados pelo Panel versus gateway atual e versus `papi-free:1.5.1` somente quando houver source/inspeção autorizada.
2. Resolver IDs legados duplicados antes de impor unicidade global; manter um mapa temporário do ID antigo para o novo fora de logs públicos.
3. Para cada instância antiga, decidir explicitamente: sessão não portável → novo registro Baileys `needs_pairing` e QR; não copiar nem apagar state de sessão sem validar formato/criptografia.
4. Preservar conversas e mensagens. Mensagens sem `instanceId` atual verificável não podem gerar resposta automática; exigir seleção de instância ou revisão manual.

### Fase 2 — Remover código/configuração antigos

1. Reduzir `server/integrations/contracts.ts` ao contrato necessário ao único transporte ou remover a abstração se não houver benefício.
2. Reescrever `server/integrations/whatsapp.ts` como adapter Baileys-only; excluir `server/integrations/papi-cloud.ts` e os blocos PAPI/Meta.
3. Remover defaults, setters, webhooks e serializadores legados de `server/db.ts`; remover rotas/procedures de provider e as superfícies administrativas que exibem provider em `server/routers.ts` e `server/platform-admin.ts`.
4. Em `server/api.ts`, remover rotas/webhooks PAPI/Meta e endpoints empresariais genéricos que não terão consumidor; manter probes e callback Baileys. Reescrever o E2E de staging para validar tRPC/serviços internos, então apagar `FORTE_PUBLIC_API_ENABLED` e credenciais da API empresarial.
5. Limpar `server/_core/env.ts`, Compose, arquivos `.env.example`, scripts, release workflow e filtros/testes de segredo; reter somente segredos Baileys necessários. Não imprimir valores.
6. Remover a seleção/status antigo de provider da UI, os registros de demonstração e os testes PAPI/Meta; adicionar testes de unicidade Baileys e falha segura para mensagens sem instância autorizada.
7. Não remover tabelas/colunas imediatamente; primeiro completar a migration validada na Fase 3.

### Fase 3 — Dados e schema sem referências antigas

1. Aplicar a migração somente em cópia restaurada do banco local; validar contagens e relacionamentos antes/depois.
2. Preservar workspaces, usuários, contatos, conversas, mensagens, anexos, auditoria e IDs não conflitantes.
3. Reidentificar instâncias legadas com colisões; associar cada conversa/message outbound apenas quando houver prova de vínculo. Mensagem pendente sem rota fica retida/revisão manual — não enviada por um número arbitrário.
4. Converter ou retirar as configurações antigas de conexão; limpar de forma direcionada os campos de credencial/webhook obsoletos e settings `default_whatsapp_provider`/webhooks antigos depois de confirmar backup e contagem.
5. Refatorar o enum/colunas com estratégia que resulte em schema ativo sem os nomes removidos. Para um enum de um só valor, criar um tipo novo que só permita `baileys`, migrar as colunas necessárias de maneira transacional e substituir o tipo antigo; então recriar os índices parciais sem predicates `NOT IN` de nomes antigos.
6. Confirmar que os IDs preservados são globais e únicos, que cada workspace que precisa operar tem instância Baileys explícita e que sessões novas aparecem em `forte-whatsapp` após pareamento.
7. Validar a migration em duas situações: banco vazio a partir do baseline novo e banco local restaurado do estado anterior. Não editar migration já aplicada em base ativa; a substituição do histórico por baseline ocorre apenas após o procedimento de adoção estar testado.

### Fase 4 — Limpar histórico de migrations e documentação

A solicitação de zero referências no estado atual do repositório conflita com as migrations/snapshots históricos que já foram aplicados. A limpeza segura será em duas etapas:

1. Primeiro migrar/validar os bancos existentes com a cadeia versionada; nunca apagar a trilha necessária para atualizar esses bancos.
2. Depois consolidar um baseline PostgreSQL Baileys-only e um procedimento explícito de adoção para bancos já migrados; testar o migrator em DB vazio e restaurado.
3. Só então substituir no branch ativo as migrations/snapshots antigos que nomeiam os providers removidos. Se o diretório MySQL não estiver ativo, retirá-lo junto com seus snapshots; se estiver ativo, criar baseline equivalente ou preservar trilha fora do caminho ativo, sem deixar docs/arquivos correntes obsoletos.
4. Revisar `API_CONTRACT.md`, `MIGRACAO-PAPI-BAILEYS.md`, `docs/BAILEYS-INTEGRATION.md`, `WHATSAPP-CONNECTION-FLOW-2026-09-27.md`, handoffs, roadmap, README e `.env` examples. Apagar ou reescrever passos que apresentem conexão alternativa como opção.
5. A busca final em tracked files deve ficar sem os tokens de providers removidos; este plano contém os nomes de propósito para permitir sua revisão e deverá sair do conjunto operacional após a aprovação/execução, ou ser movido para uma nota externa de histórico antes do scan final.

### Fase 5 — Verificação e release

- `pnpm check`, suíte de testes completa, `pnpm build`, `npm ci && npm test && npm run check && npm run build` no gateway.
- Testes de integração PostgreSQL: baseline vazio; upgrade a partir do banco anterior; dados/mensagens preservados; segredo antigo limpo; nenhuma mensagem pendente enviada; IDs de instâncias únicos entre tenants.
- CRUD por workspace: criar/renomear/excluir, QR, pareamento, reconnect, callback assinado, callback de sessão inativa, `instanceId` inexistente e tentativa de acesso cross-tenant.
- Testes de segurança: nenhuma chave no bundle, logs ou browser; nenhuma rota empresarial acessível; Baileys Bearer/webhook só na rede interna; nenhum fallback global `default`.
- Varredura final de tracked files/config/migrations/docs por provider antigo; revisão manual dos falsos positivos da palavra genérica “meta” (por exemplo, metadata) para não apagar código sem relação.
- Atualizar PR e checklist; registrar que o Oracle Cloud só será preparado quando o usuário iniciar essa próxima fase.

## 6. Como testar a versão atual da branch (sem fazer limpeza de dados)

O Compose padrão puxa `latest` do GHCR; se apenas executar o script, isso pode testar uma imagem publicada antiga, não o código desta branch. Para testar o código atual, construir as duas imagens locais com as tags que o Compose espera antes de subir.

**Como você está no Windows Terminal/PowerShell**, execute o bloco abaixo no PowerShell, na raiz do clone (o caminho da pasta pode ter qualquer nome). Cada `docker build` fica em uma linha completa: `\` não é continuação de linha no PowerShell.

```powershell
# Confirme que o prompt está na raiz do repositório e na branch do PR.
git status --short --branch
git fetch origin
git switch docs/ai-admin-core-plan-2026-09-27
git pull --ff-only

# Converte a pasta atual em caminho WSL e cria .env apenas se ainda não existir.
$RepoInWsl = (wsl.exe wslpath -u "$PWD").Trim()
wsl.exe -e bash -lc "cd '$RepoInWsl' && ./scripts/docker-init-local.sh"

# Baixa somente as dependências de infraestrutura. As imagens do app serão locais.
docker pull postgres:16-alpine
docker pull redis:7-alpine

# Builds da branch, com o contexto restrito à pasta do repositório.
docker build -f infra/Dockerfile -t ghcr.io/geordptoroy/forte-panel:latest .
docker build -f forte-whatsapp/Dockerfile -t ghcr.io/geordptoroy/forte-whatsapp:latest ./forte-whatsapp

# Sobe usando as imagens locais, mesmo que o Compose declare pull_policy: always.
docker compose --env-file .env -f docker-compose.yml up -d --pull never --remove-orphans

# Estado e logs
docker compose --env-file .env -f docker-compose.yml ps
docker compose --env-file .env -f docker-compose.yml logs -f forte-panel forte-panel-worker forte-whatsapp
```

Se preferir abrir uma sessão Bash no WSL e executar dali, use `docker build` em uma linha por comando e `docker compose ... up -d --pull never`; não cole atribuições Bash (`FORTE_PULL=0`) diretamente no prompt PowerShell. `--pull never` é importante porque o Compose deste repositório declara `pull_policy: always` para as imagens do app.

Depois do startup, abrir `http://localhost:3002` e usar o login local indicado pelo `.env`. Na tela **Instâncias WhatsApp**, criar uma instância de teste, editar o nome e excluir apenas essa instância para validar o CRUD. Para testar QR, conectar uma linha/número dedicado de teste e escanear o QR; **criar** não inicia a sessão automaticamente.

- Esta versão valida somente a primeira etapa do core (CRUD/conexão/consumo). Envio de todos os tipos de mensagem e resposta automática de IA são etapas seguintes, ainda não fazem parte desse teste.
- Em erro de migration ou startup, preservar os volumes e coletar `docker compose ... logs`; não tentar resolver com `down -v`, `docker volume rm` ou script de reset.
- Para parar sem remover dados: `docker compose --env-file .env -f docker-compose.yml stop`.

## 7. Referências de continuidade

- [`WHATSAPP-CONNECTION-FLOW-2026-09-27.md`](./WHATSAPP-CONNECTION-FLOW-2026-09-27.md) — escopo e estado da primeira etapa do core.
- [`docs/BAILEYS-INTEGRATION.md`](./docs/BAILEYS-INTEGRATION.md) e [`forte-whatsapp/README.md`](./forte-whatsapp/README.md) — contrato do gateway e rotas internas atuais.
- [`todo.md`](./todo.md) — próxima sequência: modelos/admin → mensagens multimodais → agente com prompt fictício; avançar somente após revisão de cada documento/fatia.
- [`DEVELOPMENT-CONTEXT-AND-INTEGRATION-POLICY.md`](./DEVELOPMENT-CONTEXT-AND-INTEGRATION-POLICY.md) — Docker/WSL/PowerShell, API externa fechada e fluxo de Git informado pelo usuário.
