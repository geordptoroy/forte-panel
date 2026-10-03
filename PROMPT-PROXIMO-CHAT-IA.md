# Prompt operacional para a próxima IA — Forte Panel

> **DOCUMENTO HISTÓRICO — revisto em 2026-10-02.** Este ficheiro preserva decisões e evidências de um estado anterior e não define o produto ou os procedimentos atuais. O único canal do produto é Baileys. Não executar opções de canal, comandos, branches, tags ou tarefas pendentes daqui; consultar `AGENTS.md`, `PRODUCT_SCOPE.md`, `docs/STATUS-ATUAL.md` e `docs/WORKFLOW-DESENVOLVIMENTO-E-RELEASE.md`.



> ## PRIMEIRO BLOCO A EXECUTAR — CONTINUIDADE
>
> O bloco “CONTINUIDADE OBRIGATÓRIA” no topo de `HANDOFF-PROXIMO-CHAT-IA.md` é a fonte primária de branch, PR, último commit e próximo slice. Antes de qualquer leitura técnica ou edição, rode `git status --short --branch`, `git log -1 --oneline --decorate`, `git remote -v`, `git fetch origin` e `git rev-parse HEAD`; confirme que `HEAD` e a branch remota correspondem ao bloco. Se não corresponderem, não edite e não faça checkout de `main` por conveniência: reconstrua o contexto correto, preserve dados e mantenha a PR sem merge automático.

Você é a próxima IA responsável por continuar o desenvolvimento do **Forte Panel**, um SaaS de operações comerciais via WhatsApp. Trabalhe como colaborador técnico sênior: avance uma fatia por vez, investigue o repositório antes de editar, implemente, valide, documente e publique a fatia completa. Não pare apenas na análise.

## 1. Repositório e estado obrigatório

- Repositório GitHub: `geordptoroy/forte-panel`
- Branch de trabalho: `feat/o7.15-storage-reconciliation-observability`
- Último commit funcional publicado: `b4ae056 docs: close platform health contract continuity`
- PR aberta: #39
- Não fazer merge automático de PRs ou branches empilhadas.
- O working tree deve começar limpo; confirme isso antes de editar.
- O usuário desenvolve principalmente no Windows 11 com Docker Desktop + WSL2 Ubuntu.
- Sandbox atual histórico: `/home/ubuntu/forte-panel`. Revalide o ambiente, o dispositivo e a disponibilidade antes de reutilizar qualquer caminho.

Comandos iniciais obrigatórios:

```bash
cd /home/ubuntu/forte-panel
git status --short --branch
git log -5 --oneline --decorate
git remote -v
git fetch origin
git rev-parse HEAD
```

Leia antes de planejar:

```text
ROADMAP-EXECUCAO-FORTE-PANEL.md
HANDOFF-PROXIMO-CHAT-IA.md
AUDITORIA-GAPS-MVP-2026-09-30.md
ACEITE-MVP-1-2026-09-30.md
```

## 2. Regras não negociáveis do usuário

1. Avançar **uma fatia por vez**.
2. Documentar cada fatia no roadmap e no handoff.
3. Não repetir backup/restore: esse ensaio já foi executado e documentado.
4. Não repetir pareamento de número real: já existe uma instância WhatsApp pareada para aceite posterior.
5. Não usar, pedir ou inventar secrets reais.
6. Nunca revelar valores de `.env`, API keys, cookies ou credenciais.
7. Manter `CORE_ONLY_MODE = true` até prova de produção/staging suficiente.
8. Priorizar funcionalidade de produto sobre Oracle/OCI; deployment Oracle está adiado.
9. Nunca desligar proteções só para fazer teste passar.
10. Não executar merges automáticos.
11. O usuário pediu para **pular testes manuais na máquina dele neste momento**. Faça validações técnicas no Sandbox/CI e deixe o aceite manual claramente documentado para depois.
12. Não repetir testes que o usuário já declarou concluídos, especialmente backup/restore, login básico, sidebar, Inbox textual, Kanban, Agenda, Contatos, Serviços, Profissionais e Integrações.

## 3. Arquitetura resumida

- Node.js 22, pnpm, TypeScript, Docker Compose.
- PostgreSQL + Drizzle ORM, Redis.
- Gateway WhatsApp baseado em Baileys.
- Multi-tenancy por `workspaceId`.
- IA nativa com providers configuráveis e capabilities:
  - `text`
  - `audio`
  - `vision`
  - `document`
- Configuração de providers/segredos fica no Console Admin; política de comportamento fica por workspace.
- O agente possui ferramentas e confirmação humana para mutações.
- O agente possui gate de segurança contra prompt injection, exfiltração de credenciais e conteúdo de alto risco.
- Fallback de provider é explícito, limitado e com chaves criptografadas/mascaradas.
- `agentRuns` registra outcome, provider, capability, tentativas, fallback, falha sanitizada, tokens, latência e telemetria de mídia.

## 4. O que já está implementado

### Produto operacional já validado manualmente

O usuário validou localmente:

- criação de conta via `/signup`;
- login/logout e refresh;
- sidebar operacional;
- conexão e pareamento de WhatsApp;
- Inbox com recebimento textual e resposta manual;
- Kanban com criação/abertura, mudança de etapa e persistência após refresh;
- Agenda;
- Contatos;
- Serviços;
- Profissionais;
- Integrações;
- intervalos intradiários de profissionais.

Há um gap antigo de áudio na UI — botão de gravar/anexar duplicado e reprodução de áudio ainda não validada no painel — mas o próximo trabalho atual é o runtime da IA, não repetir essa investigação visual agora.

### Runtime de IA já implementado

- Política de agente por workspace em `WorkspaceAgentPage`.
- Gate de segurança em `server/agent-safety.ts`.
- Fallback explícito em `server/llm-providers.ts`.
- Observabilidade do runtime e migration `drizzle-pg/0057_agent_runs_provider_observability.sql`.
- Transcrição inbound em `server/audio-transcription.ts`:
  - resolve mídia privada;
  - chama capability `audio`;
  - injeta transcrição no contexto textual;
  - registra telemetria de provider/tentativas.
- Análise inbound de imagem/documento em `server/media-analysis.ts`:
  - chama `vision` ou `document`;
  - extrai contexto factual;
  - sinaliza incerteza no prompt;
  - aplica fallback;
  - segue para a resposta textual;
  - não repassa desnecessariamente a mídia à chamada textual posterior.
- Campos de telemetria adicionados a `agentRuns`:
  - `transcriptionProvider`
  - `transcriptionAttempts`
  - `mediaAnalysisProvider`
  - `mediaAnalysisAttempts`
- Testes sintéticos de áudio, visão, documento, fallback, agente e migration journal.

Commits recentes:

```text
ba265d8 feat: expose aggregate agent health to platform console
9ce527c test: prove agent metrics authorization isolation
5235360 feat: govern agent metrics access and period
2c1ae37 feat: expose agent fallback health metrics
6d7583c test: prove capability fallback and failure telemetry
28723f3 test: align synthetic model assertions with routing
3866a96 test: prove controlled native agent resume
db243df test: prove paused agent events remain reprocessable
4705446 test: close integrated native agent kill switch gate
15bb144 docs: add operational prompt for next AI handoff
3915b9d feat: analyze inbound images and documents
b5edcf4 feat: transcribe inbound audio for AI agent
aa8e403 docs: preserve complete AI handoff
2a03d14 docs: hand off GHCR publication state
78a8487 feat: add AI provider execution observability
```

## 5. GHCR e CI

O workflow de publicação mais recente terminou com sucesso:

- Run: `36858548178`
- Verify passou.
- Build/publicação multi-arch passou para `linux/amd64` e `linux/arm64`.

Tags esperadas para a revisão atual:

```text
ghcr.io/geordptoroy/forte-panel:dev
ghcr.io/geordptoroy/forte-panel:sha-3915b9d
ghcr.io/geordptoroy/forte-whatsapp:dev
ghcr.io/geordptoroy/forte-whatsapp:sha-3915b9d
```

A tag `latest` permanece reservada à branch padrão `main`. Não sobrescrever `latest` a partir da branch de feature.

Quando houver um novo commit funcional, publique a imagem novamente executando:

```bash
gh workflow run publish-image.yml \
  --repo geordptoroy/forte-panel \
  --ref feat/o7.15-storage-reconciliation-observability
```

Depois acompanhe o run retornado com `gh run watch <RUN_ID> --repo geordptoroy/forte-panel --exit-status` e só informe sucesso após Verify e Publish concluírem.

## 6. Próxima fatia autorizada

### O próximo slice é: kill switch + contrato integrado das quatro capabilities

O kill switch já possui base anterior, mas precisa ser fechado como gate de aceite da IA atual. Inspecione primeiro:

```bash
rg -n "kill|Kill|agent\.metrics|agentRuns|capability|transcription|mediaAnalysis|CORE_ONLY_MODE" server client/src drizzle-pg drizzle/schema.ts
```

Objetivos da próxima fatia:

1. Confirmar que o kill switch tenant-scoped bloqueia **text, audio, vision e document** antes de chamar qualquer provider.
2. Garantir que mensagens recebidas durante a pausa não sejam perdidas e permaneçam reprocessáveis/pending conforme o contrato existente.
3. Garantir que o modelo não consiga reativar o agente.
4. Registrar motivo/auditoria sanitizada do bloqueio.
5. Criar/ajustar testes de contrato para as quatro capabilities sem usar provider real.
6. Preservar fallback, tenancy, confirmação humana, idempotência e telemetria.
7. Não fazer teste manual na máquina Windows nesta etapa; valide com testes unitários/CI/fixtures sintéticos.
8. Se o kill switch já estiver totalmente coberto, não reimplemente: faça uma auditoria focada e avance para o contrato integrado das quatro capabilities.

Não altere a definição de MVP para “concluída” ainda. O aceite end-to-end real pelo WhatsApp continua pendente.

## 7. Padrão de execução para cada fatia

### Fase A — inspeção

- Ler o arquivo relevante e os testes existentes.
- Mapear tenancy, authorization, migrations e efeitos externos.
- Identificar o menor patch seguro.
- Se a tarefa envolver cinco ou mais itens comparáveis, usar o skill/workflow de orquestração apropriado; para este slice normalmente não é necessário.

### Fase B — implementação

- Alterar somente o escopo da fatia.
- Reutilizar helpers existentes.
- Não expor secrets ou mídia privada.
- Fail closed quando a decisão de segurança estiver ausente.
- Manter mensagens e erros sanitizados.
- Não reformatar arquivos históricos inteiros. Evite `prettier --write` em arquivos legados; prefira patches mínimos e `prettier --check`.

### Fase C — validação no Sandbox

Executar, no mínimo:

```bash
pnpm check
pnpm exec vitest run <testes-focados>
pnpm build
git diff --check
git status --short --branch
```

Se uma suíte depender de PostgreSQL e não houver `DATABASE_URL`, não falsifique o resultado: registre como não executada e prefira o CI PostgreSQL.

### Fase D — documentação

Atualizar:

- `ROADMAP-EXECUCAO-FORTE-PANEL.md`;
- `HANDOFF-PROXIMO-CHAT-IA.md`;
- este prompt, somente se o próximo passo/estado mudar.

O handoff deve ser anexado, nunca sobrescrito. Use `cat >>` ou `write` com `append=true`.

### Fase E — publicação

```bash
git diff --check
git add <arquivos-da-fat ia>
git commit -m "<mensagem objetiva>"
git push origin feat/o7.15-storage-reconciliation-observability
```

Não faça merge. Se a fatia alterar runtime ou imagem Docker, publique o workflow GHCR e aguarde o resultado real.

## 8. Como operar o Docker local quando chegar a hora

O usuário utiliza PowerShell no Windows. O script seguro não apaga volumes:

```powershell
cd C:\Users\Rafae\Desktop\forte-panel

git pull --ff-only origin feat/o7.15-storage-reconciliation-observability

.\scripts\start-docker.ps1
```

O script constrói o código atual localmente e sobe a stack sem destruir volumes. Não instruir `docker compose down -v` sem uma autorização explícita e específica. Não pedir secrets reais.

## 9. Critério honesto de conclusão do MVP

O MVP só pode ser chamado de completo quando houver evidência de:

- signup/onboarding/conexão WhatsApp;
- Inbox inbound/outbound;
- resposta IA textual real;
- transcrição de áudio real;
- análise de imagem real;
- análise de documento real;
- moderação/prompt-injection e kill switch;
- isolamento tenant-scoped;
- observabilidade de execuções;
- backup/restore já ensaiado;
- CI verde;
- prova controlada da operação em ambiente adequado.

Até lá, use termos como **implementado em código**, **validado por testes sintéticos** ou **aceite manual pendente**. Nunca declare que um provider real, OCR, visão ou transcrição funcionou end-to-end sem evidência.

## 10. Formato da resposta para o usuário

- Responda em português brasileiro, salvo pedido contrário.
- Ao iniciar/resumir trabalho, diga em uma frase o que será feito.
- Seja direto e não repita testes já validados.
- Explique por que cada próximo passo existe.
- Ao terminar uma fatia, informe: o que mudou, validações, commit, CI/GHCR e próximo slice.
- Não peça confirmação para edições/commits/push dentro do escopo já autorizado.
- Peça decisão somente se houver escolha material de produto, permissão nova ou ação externa de alto impacto.

## Estado final desta continuidade — O5.7

- Último commit de implementação: `32e074c test: fix aggregate health key ordering`.
- Último commit documental/estado: `b4ae056 docs: close platform health contract continuity`.
- Entrega canônica: `O5.7-ENTREGA-CONTRATO-PLATFORM-HEALTH.md`.
- CI PostgreSQL verde: run `36941127598`, sem skips.
- Contrato: `server/platform-health.contract.integration.test.ts`.
- Próxima ação: revisar/aceitar a PR #39 sem merge automático e preparar a Onda O6 com infraestrutura persistente.
- Não repetir backup/restore, pareamento real ou aceite manual já concluídos.
- Antes de editar, repetir o preflight do topo deste prompt e conferir o bloco prioritário do `HANDOFF-PROXIMO-CHAT-IA.md`.
