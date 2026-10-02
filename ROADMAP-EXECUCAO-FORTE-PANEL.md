# Forte Panel — Roadmap executável de produto público

**Status:** ativo e canônico para execução por fatias
**Data:** 2026-09-30
**Base:** `FORTE-PANEL-FONTE-DE-VERDADE.md` + auditoria do código e documentação
**Regra de continuidade:** cada mensagem `próximo` executa uma fatia por vez, registra commit em branch empilhada e abre PR para revisão; nunca mesclar automaticamente.

> **Preflight obrigatório para qualquer nova IA:** o bloco “CONTINUIDADE OBRIGATÓRIA” no topo de `HANDOFF-PROXIMO-CHAT-IA.md` é a primeira fonte operacional. Antes de tocar no código, confirmar `git status --short --branch`, `git log -1 --oneline --decorate`, `git remote -v`, `git fetch origin` e `git rev-parse HEAD`; a branch, PR, commit remoto e próximo slice do bloco devem coincidir. Se houver divergência, parar a implementação, preservar a branch e corrigir o contexto antes de editar. Nunca usar `main` como branch de continuidade quando o handoff indicar uma branch empilhada.

> Este documento transforma a estratégia de reposicionamento em trabalho executável. Não é uma lista de ideias: cada fatia tem escopo, saída verificável e critério de conclusão.

---

## 1. Como vamos trabalhar

A execução seguirá uma fatia por vez. Para cada fatia, o agente deve:

1. ler o estado atual do repositório e esta fila;
2. inspecionar o código relacionado, não apenas a documentação;
3. implementar backend, UI, migration e contratos necessários;
4. atualizar testes compatíveis com a camada, sem declarar validação que não foi executada;
5. executar os gates disponíveis e registrar limitações;
6. atualizar o estado da fatia neste documento e no handoff;
7. fazer commit com mensagem específica;
8. publicar uma branch e abrir/atualizar PR para revisão; nunca mesclar automaticamente;
9. responder com o commit, o PR, o que mudou, os gates executados e a próxima fatia.

**Não fazer:** reset destrutivo, apagar migrations aplicadas, declarar staging real sem executar staging, ligar `CORE_ONLY_MODE` de uma vez, misturar demo com produção ou implementar uma tela isolada sem fechar seu contrato de dados.

### Estados

- `PENDENTE`: ainda não iniciada.
- `EM ANDAMENTO`: fatia atualmente sendo implementada.
- `BLOQUEADA`: depende de ambiente, credencial, decisão ou prova externa; registrar exatamente o bloqueio.
- `CONCLUÍDA`: código, contrato, UX, validação e documentação da fatia foram fechados.
- `ADIADA`: conscientemente fora do núcleo público atual.

### Definition of Done por fatia

- backend e UI reais quando a fatia tiver superfície de produto;
- autorização server-side e isolamento por `workspaceId`;
- migration/journal coerentes quando houver persistência nova;
- estados loading, erro, vazio, retry e sucesso;
- auditoria para ações sensíveis;
- idempotência para efeitos externos ou mutações repetíveis;
- teste compatível com o nível da implementação;
- `pnpm check`, build relevante e `git diff --check`, quando aplicáveis;
- documentação/handoff/índice atualizados;
- commit publicado no Git;
- nenhum texto de demo ou beta apresentado como capacidade pública.

---

## 2. Ordem estratégica

A ordem não é por quantidade de telas. É por risco e valor:

```text
Saneamento público
  → onboarding simples
  → WhatsApp confiável
  → lead e Inbox
  → orçamento
  → agenda
  → recebimento
  → IA supervisionada
  → Console Admin de produção
  → planos, cobrança e escala
```

O produto público só pode sair do modo de contenção quando o caminho essencial estiver fechado e demonstrável.

---

## 3. Estado atual da fila

| ID | Onda | Fatia | Estado | Saída principal |
|---|---|---|---|---|
| P0.1 | Fundação pública | Inventário de superfícies demo/beta e classificação de release | **CONCLUÍDA** | Matriz de telas públicas, internas, simulação e removidas |
| P0.2 | Fundação pública | Remover DemoBanner e dados estáticos do cliente | **CONCLUÍDA** | Rotas operacionais sem dados fictícios |
| P0.3 | Fundação pública | Isolar `ensureDemo*`, seeds e bootstrap | **CONCLUÍDA** | Demo somente em ambiente QA/dev |
| P0.4 | Fundação pública | Limpar linguagem beta do Console Admin | **CONCLUÍDA** | Console com linguagem de produção |
| P0.5 | Fundação pública | Catálogo de estados e release gate por rota | **CONCLUÍDA** | `release-catalog.ts` governa estados e exposição incremental |
| O1.1 | Onboarding | Wizard público de 6 passos | **CONCLUÍDA** | Owner configura negócio sem conhecer IA técnica |
| O1.2 | Onboarding | Serviços, preços, duração e disponibilidade | **CONCLUÍDA (código)** | Catálogo operacional persistido, modos de preço e jornada semanal; prova com PostgreSQL/UI real permanece pendente |
| O1.3 | Onboarding | Regras de atendimento e revisão de exemplos | **CONCLUÍDA (código)** | Revisão humana vinculada ao candidato exato; prova persistida com PostgreSQL permanece pendente |
| O1.4 | Onboarding | Retomada, autosave, missing/conflict e empty states | **CONCLUÍDA (código)** | Etapa retomável, autosave serializado e estados de loading/erro; prova persistente pendente |
| O2.1 | Canal | Saúde do WhatsApp e ciclo de conexão | **CONCLUÍDA (código)** | Backoff exponencial limitado; logout explícito permanece final |
| O2.2 | Canal | Inbound idempotente e histórico sem efeitos colaterais | **CONCLUÍDA (código)** | Lease recuperável com fencing e filtros do histórico; migration 0046 exige prova PostgreSQL |
| O2.3 | Canal | Outbound com `instanceId`, fila e reconciliação | **CONCLUÍDA (código)** | Fila e recibos sent/delivered/read tenant/instância-scoped e monotônicos |
| O2.4 | Canal | Mídia privada e capacidades do composer | **CONCLUÍDA (código)** | Upload privado autenticado até 8 MB e envio por URL HTTPS assinada; prova real pendente |
| O3.1 | Comercial | Lead unificado entre contato, conversa e oportunidade | **CONCLUÍDA (código)** | Migration 0047 e 7 integrações passaram no PostgreSQL CI; PRs #6/#7 abertos e CI verde; smoke persistente/staging e WhatsApp real pendentes |
| O3.2 | Comercial | Inbox operacional com assignment e follow-up | **CONCLUÍDA (código)** | PR #8 aberto sobre O3.1; migration 0048 aplicada no CI; run `36708180817` passou 285 testes/72 arquivos sem skips; staging e WhatsApp real continuam pendentes |
| O3.3 | Comercial | Funil canônico sem duplicação de estado | **CONCLUÍDA (código + CI PostgreSQL)** | PR #9 aberta; run `36710769990` aplicou 0049 e passou 72 arquivos/285 testes sem skips; staging e WhatsApp real continuam pendentes |
| O3.4 | Comercial | Orçamento com itens, validade e aprovação | **CONCLUÍDA (código + CI PostgreSQL)** | PR #10 aberta; run `36720148370` passou com migration 0050; staging e revisão final continuam pendentes |
| O3.5 | Comercial | Agenda com conflito, profissional e status | **CONCLUÍDA (código + CI PostgreSQL)** | PR #11 aberta; run `36723304885` passou; staging e revisão final continuam pendentes |
| O3.6 | Comercial | Recebimento, ledger operacional e recibo | **CONCLUÍDA (código + CI PostgreSQL)** | PR #12 aberta; run `36729522644` passou após correção da FK composta; staging e revisão final continuam pendentes |
| O3.7 | Comercial | Dashboard de decisões do dia | **CONCLUÍDA (código + CI PostgreSQL)** | PR #13 aberta; run `36730266465` passou; staging e revisão final continuam pendentes |
| O4.1 | IA | Contexto comercial seguro para o agente | **CONCLUÍDA (código + CI PostgreSQL)** | PR #14 aberta; run `36730874541` passou; staging e revisão final continuam pendentes |
| O4.2 | IA | Ferramentas somente leitura e confirmação mutável | **CONCLUÍDA (código + CI PostgreSQL)** | PR #15 aberta; run `36731684085` passou; staging e revisão final continuam pendentes |
| O4.3 | IA | Transferência para humano e kill switch | **CONCLUÍDA (código + CI PostgreSQL)** | PR #16 aberta; run `36732396958` passou; staging e revisão final continuam pendentes |
| O4.4 | IA | Métricas de resolução, custo, latência e receita | **CONCLUÍDA (código + CI PostgreSQL)** | PR #17 aberta; run `36733294007` passou; staging e revisão final continuam pendentes |
| O5.1 | Admin | Workspaces como contas de produção | **CONCLUÍDA (código + CI PostgreSQL)** | PR #18 aberta; run `36734540609` passou; staging e revisão final continuam pendentes |
| O5.2 | Admin | Suporte, tickets e sessões auditadas | **CONCLUÍDA (código + CI PostgreSQL)** | PR #19 aberta; run `36735198506` passou; staging e revisão final continuam pendentes |
| O5.3 | Admin | Health de gateway, filas, storage e providers | **CONCLUÍDA (código + CI PostgreSQL)** | PR #20 aberta; run `36735603600` passou; staging e revisão final continuam pendentes |
| O5.4 | Admin | Quotas, planos, retenção e lifecycle | **CONCLUÍDA (código + CI PostgreSQL)** | PR #21 aberta; run `36735977815` passou; staging e revisão final continuam pendentes |
| O6.1 | Confiabilidade | Testes negativos de tenancy e papéis | **CONCLUÍDA (código + CI PostgreSQL)** | PR #22 aberta; run `36736288990` passou; staging e revisão final continuam pendentes |
| O6.2 | Confiabilidade | Backup, restore e retenção | **CONCLUÍDA (código + CI PostgreSQL)** | PR #23 aberta; run `36736764694` passou; restore persistente em ambiente limpo continua pendente |
| O6.3 | Confiabilidade | Browser desktop/mobile e acessibilidade | **CONCLUÍDA (código + CI PostgreSQL)** | PR #24 aberta; run `36737154671` passou; smoke autenticado de staging continua pendente |
| O7.1 | Monetização | Plano, quota e cobrança SaaS separados | **CONCLUÍDA (código + CI PostgreSQL)** | PR #25 aberta; run `36737881060` passou; checkout/billing real continuam desativados |
| O7.2 | Monetização | Trial, upgrade, downgrade, cancelamento e retenção | **CONCLUÍDA (código + CI PostgreSQL)** | PR #26 aberta; run `36738425579` passou; provider de billing ainda não configurado |
| O7.3 | Escala | Observabilidade, incidentes e release público | **EM REVISÃO (código + Docker local parcial)** | PR #27; CI `36738759085` passou; Docker local validou health/readiness, migrations, pareamento, inbound e outbound; 5 eventos históricos na outbox ainda reportam `webhook_http_400`; staging/release público permanecem bloqueados |
| MVP.1 | Aceite MVP | Núcleo operacional e comercial básico | **ACEITE MANUAL PARCIAL — NÃO É MVP COMPLETO** | Conta criada por `/signup`, login/logout, sidebar, conexão WhatsApp, Inbox inbound/outbound, refresh, Kanban com mudança persistida, Contatos, Serviços, Profissionais, Agenda e Integrações validados pelo operador; intervalos intradiários por profissional agora têm persistência, validação e UI; IA de resposta, transcrição, visão e moderação ainda não foram validadas end-to-end |
| MVP.2 | Aceite MVP | IA de atendimento multimodal e moderação | **CONFIGURAÇÃO BASE + GATE DE SEGURANÇA + FALLBACK + OBSERVABILIDADE + ÁUDIO + VISÃO/DOCUMENTO IMPLEMENTADOS; ACEITE PENDENTE — BLOQUEADOR DO MVP** | Política do agente por workspace agora fica separada de providers/segredos do Console Admin; gate runtime detecta prompt injection, exfiltração de credenciais e sinais de alto risco antes do provider, desliga a IA do contato, envia handoff neutro e registra execução transferida; conexões secundárias da mesma capability fazem fallback explícito, com chaves criptografadas/mascaradas; agentRuns registra provider, capability, tentativas e códigos de falha sanitizados; áudio inbound usa mídia privada na capability `audio`, injeta a transcrição no contexto e segue para resposta textual; imagem e documento usam as capabilities `vision`/`document`, geram contexto factual e seguem para resposta textual; ainda validar fluxo real no WhatsApp e kill switch |
| O7.4 | Escala | Reconciliação de histórico Baileys não importável | **CONCLUÍDA (código + CI + Docker + smoke)** | PR #28; CI `36743491124` passou; 5 históricos deixaram a fila ativa (`pending=0`) sem apagar volume; smoke inbound e outbound passaram com `eventos=1`, `entregues=1`, `falhas=0` em cada direção |
| O7.5 | Escala | Dead-letter para falhas permanentes do webhook | **CONCLUÍDA (código + CI + Docker + smoke)** | PR #29; CI `36744892337` passou; 5 envelopes preservados em `outbox/<instanceId>/dead-letter` (`deadLetter=5`); smoke bidirecional passou |
| O7.6 | Escala | Observabilidade da dead-letter no status da instância | **CONCLUÍDA (código + CI + Docker + smoke)** | PR #30; CI `36746224303`, imagem `36748842030` e restart passaram; status `connected`, `pending=0`, `deadLetter=5`; inbound/outbound passaram em ambos os sentidos |
| O7.9 | Confiabilidade | Idempotência outbound fim a fim no gateway | **CONCLUÍDA (código + testes locais)** | Ledger durável por instância/chave, replay seguro e falha fechada para resultado externo inconclusivo; staging e teste físico permanecem pendentes |
| O7.10 | Confiabilidade | Inbound transacional e retry sem duplicação | **CONCLUÍDA (código + testes locais)** | Transação única protege contato, conversa, lead/oportunidade, mensagem, unread e `message.received`; compensação de mídia e prova persistente ficam para o gate externo |
| O7.11 | Confiabilidade | Hardening de sessão, webhook, headers e rate limit | **CONCLUÍDA (primeira fatia local)** | Headers globais, bearer constant-time, origem/CSRF e rate limits cobertos; revogação/rotação, rate limit distribuído e staging continuam pendentes |
| O7.12 | Confiabilidade | Runbook, restore e compensação de storage | **CONCLUÍDA (primeira fatia local)** | Manifesto verificado antes do restore, alvo separado e tar de sessão vazio válido; off-host, DB/mídia/sessão real, RPO/RTO e rollback seguem pendentes |
| O7.13 | Operação | Restore rehearsal e compensação de blobs | **CONCLUÍDA (política local)** | Classificação segura por workspace, referências e janela de proteção; provider list/delete, retenção e restore real seguem pendentes |
| O7.14 | Operação | Provider de storage com listagem/remoção condicionada | **CONCLUÍDA (contrato + dry-run)** | Interface paginada, `ifMatch`/etag e dry-run padrão; adapter Forge real não oferece list/delete e continua sem operação destrutiva |
| O7.15 | Operação | Métricas, auditoria e ensaio do provider | **CONCLUÍDA (métricas locais)** | Métricas agregadas sem chaves, limite anti-loop e dry-run; provider autorizado, auditoria persistida e restore real seguem pendentes |
| O7.16 | Operação | Provider real, auditoria persistida e restore rehearsal | **PENDENTE** | Conectar API autorizada, alertas, retenção, execução controlada e ambiente limpo |
| A1 | Adiado | TTS, múltiplos canais e automações genéricas | ADIADA | Só após o núcleo gerar valor recorrente |

### Trabalho explicitamente adiado

- **Oracle Cloud/OCI, deploy público e promoção final das imagens ARM64:** ficam depois do MVP controlado estar demonstrável e dos gates de staging, browser, segurança, restore e WhatsApp físico estarem fechados. A publicação multi-arquitetura já pode existir como preparação técnica, mas não é a próxima fatia e não autoriza deploy público.

---

## 4. Onda P0 — Fundação pública

### P0.1 — Inventário de superfícies demo/beta

**Objetivo:** saber exatamente o que pode ser exposto.

**Inspecionar:** `CORE_ONLY_MODE`, `demoData.ts`, `DemoBanner`, `ensureDemo*`, seeds, Component Showcase, rótulos beta, rotas públicas e queries de produção.

**Entregável:** matriz com rota, fonte de dados, autorização, estado de release, decisão e responsável técnico.

### P0.2 — Remover demo da experiência autenticada

- retirar imports de `client/src/lib/demoData` de telas operacionais;
- substituir valores fixos por queries tenant-scoped ou empty states honestos;
- remover banners que dizem que a tela é demo;
- impedir que totais, exemplos e contatos fictícios apareçam como KPI.

### P0.3 — Isolar bootstrap demo

- separar `ensureDemoWorkspace`, `ensureDemoInbox`, `ensureDemoAgenda` e seeds de funções de signup;
- garantir que signup nunca injeta entidades fictícias;
- exigir ambiente explicitamente autorizado para `DEMO_MODE`;
- proteger comandos de reset/dev contra uso em produção.

### P0.4 — Linguagem de produção

- substituir “Workspaces beta”, “Contas beta”, “operação do beta” e referências a staging no Console;
- preservar “beta” somente em documentação histórica ou ambiente privado;
- revisar motivos, empty states, banners, títulos e auditoria visível.

### P0.5 — Release gate

Criar um contrato único para classificar cada rota como `public_ready`, `internal_only`, `simulation_only` ou `not_ready`. O `core-mode` poderá usar esse contrato para contenção sem esconder uma promessa pública indefinida.

**Saída da Onda P0:** nenhum usuário final vê dados fictícios, linguagem de demo ou rota que promete mais do que entrega.

---

## 5. Onda O1 — Onboarding público

### Jornada final

1. **Negócio:** nome, segmento, tom e identidade.
2. **Serviços:** serviço, preço, duração, área e regras básicas.
3. **Operação:** horários, profissionais, regiões e capacidade.
4. **Atendimento:** perguntas de triagem, limites e transferência humana.
5. **Revisão:** exemplos reais simulados de forma explícita.
6. **Ativação:** conectar WhatsApp e publicar configuração aprovada.

Provider, modelo, prompt técnico, tokens, fallback e webhook permanecem bastidor administrativo.

**Saída da Onda O1:** owner consegue ativar o primeiro atendimento sem assistência técnica.

---

## 6. Onda O2 — Canal confiável

O canal deve ter estados verdadeiros: `idle`, `connecting`, `qr`, `pairing`, `connected`, `reconnecting`, `disconnected`, `logged_out` e `error`.

Cada mensagem precisa preservar `workspaceId`, `instanceId`, JID, `externalId`, direção e status. O outbound deve falhar fechado sem instância explícita. Histórico/backfill não pode criar unread, notificação ou IA.

**Saída da Onda O2:** o cliente sabe se o WhatsApp está conectado, se a mensagem foi aceita, enviada, entregue ou falhou — e o operador sabe como recuperar.

---

## 7. Onda O3 — Núcleo comercial

### Modelo de dados mínimo

```text
workspace
  └── whatsapp_instance
        └── conversation
              ├── contact / lead
              ├── opportunity / stage
              ├── quote / quote_items
              ├── appointment / professional
              ├── service_execution
              └── payment / receipt
```

As relações devem ser explícitas, tenant-scoped e auditáveis. Não usar campos soltos ou cópia manual como integração entre módulos.

### Jornada de telas

- **Inbox:** conversa, lead, próxima ação e botão “gerar orçamento”.
- **Lead/contato:** dados, origem, estágio, orçamento, agenda e pagamentos.
- **Funil:** estágios canônicos, valor, próxima ação e SLA.
- **Orçamento:** itens, validade, desconto, condição, aprovação e envio pelo WhatsApp.
- **Agenda:** disponibilidade, conflito, profissional, confirmação, reagendamento e conclusão.
- **Recebimento:** valor, meio, data, responsável, recibo e conciliação manual.
- **Dashboard:** leads sem resposta, orçamentos parados, agenda do dia, recebimentos pendentes e saúde do canal.

**Saída da Onda O3:** uma mensagem recebida pode virar oportunidade, orçamento, agendamento e recebimento sem redigitação.

---

## 8. Onda O4 — IA que gera resultado

- contexto comercial filtrado por workspace;
- ferramentas de consulta para serviços, disponibilidade, lead e orçamento;
- tools mutáveis sempre exigem confirmação/autorização backend;
- transferência humana por regra, confiança, tema ou falha;
- kill switch global e por workspace;
- métricas: resolução, handoff, conversão, orçamento, agendamento, custo, latência e erro.

**Saída da Onda O4:** a IA é avaliada por atendimento e receita, não por quantidade de prompts ou tokens.

---

## 9. Onda O5 — Console Admin de produção

O Console terá cinco grupos:

- **Operação:** Overview, contas, tickets, auditoria;
- **Inteligência:** providers, rotas, prompts, simulações;
- **Canais:** instâncias, saúde, reconciliação e Inbox de suporte;
- **Governança:** sessões, incidentes, retenção, privacidade;
- **SaaS:** planos, quotas, consumo, cobrança e lifecycle.

Suporte read-only é padrão. Acesso operator exige expiração, motivo, autorização, before/after sanitizado e auditoria transacional.

**Saída da Onda O5:** a equipe Forte Panel consegue operar contas reais com segurança e sem acessar livremente o tenant.

---

## 10. Onda O6 — Provas de produção

- dois ou mais workspaces com testes negativos de isolamento;
- todos os papéis e revogações;
- PostgreSQL persistente e migrations limpas;
- QR/inbound/outbound/reconexão/mídia em número de teste;
- backup e restore de banco, mídia e sessão;
- browser desktop/mobile e acessibilidade;
- worker, gateway, fila, DLQ, storage e provider monitorados;
- termos, privacidade, retenção, exportação e exclusão revisados.

**Saída da Onda O6:** existe evidência de funcionamento real; build verde sozinho não é aceito como prova.

---

## 11. Onda O7 — Monetização e escala

Somente depois do núcleo comercial:

- planos `starter`, `pro` e `business` com limites claros;
- quotas técnicas separadas de custo e cobrança;
- trial, upgrade, downgrade, cancelamento e retenção;
- billing SaaS real e painel administrativo;
- alertas de uso e prevenção de surpresa;
- incidentes, comunicação e rollback de release.

Múltiplos canais, TTS, automações genéricas e relatórios avançados ficam depois do caminho que gera receita.

---

## 12. Protocolo de cada mensagem “próximo”

Quando o usuário disser **próximo**, executar exatamente a primeira fatia `PENDENTE` ou `BLOQUEADA` que possa ser resolvida no ambiente atual:

1. atualizar esta fatia para `EM ANDAMENTO`;
2. fazer auditoria dirigida no código real;
3. implementar a menor mudança completa;
4. validar o que for possível;
5. se houver bloqueio externo, parar nessa fatia e registrar o bloqueio, sem pular silenciosamente;
6. atualizar estado e evidências;
7. commitar, publicar uma branch e abrir/atualizar PR para revisão; nunca mesclar automaticamente;
8. responder com:
   - fatia executada;
   - arquivos alterados;
   - comportamento antes/depois;
   - validações executadas e não executadas;
   - commit e PR publicados;
   - próxima fatia.

Se uma fatia crescer demais, dividir em subfatias no próprio documento antes de implementar. Não abrir uma nova frente só porque uma tela parece mais fácil.

---

## 13. Estado de publicação

| Campo | Valor inicial |
|---|---|
| Branch | `feat/o1.3-attendance-rule-simulation` |
| Base auditada | `cad2b8a` |
| Última fatia concluída | `P0.3` — seeds e bootstrap isolados por ambiente |
| Última fatia concluída por este roadmap | `O3.3` — estágio canônico e histórico com CI PostgreSQL verde |
| Último commit de implementação deste roadmap | `6f5a812` — `feat: add consent-gated onboarding example review` |
| Pull request | [#5](https://github.com/geordptoroy/forte-panel/pull/5) — aberto, empilhado sobre o PR #4 (O1.2); não mesclado |
| Bloqueios externos | staging persistente, número WhatsApp de teste, restore comprovado e billing SaaS |

Este quadro deve ser atualizado a cada fatia. O documento canônico continua sendo a autoridade de produto; este arquivo é a fila operacional.

## Atualização de estado — O5.7 — 2026-10-01

- [x] Expor saúde agregada do agente no Console Admin sem conteúdo privado (`ba265d8`).
- [x] Criar contrato integrado de `platform.health` no boundary do router (`5a22ec5`, corrigido em `32e074c`).
- [x] Provar no PostgreSQL que provider, modelo, failure code, IDs de tenant/contato/evento e tokens não são serializados.
- [x] Validar retry PostgreSQL verde sem skips: run [`36941127598`](https://github.com/geordptoroy/forte-panel/actions/runs/36941127598).
- [x] Publicar a imagem do Console Admin agregado: run [`36939943370`](https://github.com/geordptoroy/forte-panel/actions/runs/36939943370).

**Próxima fatia:** revisão/aceite da PR #39 e preparação da Onda O6 para prova persistente de produção. Não repetir backup/restore, pareamento real ou aceite manual já concluídos.


## Atualização de estado — contrato integrado do kill switch — 2026-10-01
- [x] Confirmar gate tenant-scoped antes de qualquer provider para `text`, `audio`, `vision` e `document`.
- [x] Preservar eventos pausados como `pending`/reprocessáveis, sem criar `agentRuns`.
- [x] Registrar auditoria redigida `native_agent_kill_switch_blocked` com capability, evento truncado e motivo sanitizado; sem conteúdo de mensagem, URL ou secret.
- [x] Ampliar o contrato PostgreSQL em `server/agent-runtime.integration.test.ts` para provar as quatro auditorias e ausência de execução.
- [x] Validações locais: `pnpm check`, build, `git diff --check` e testes focados passaram; a integração PostgreSQL ficou skip no Sandbox por ausência de `DATABASE_URL`.
- [ ] Executar CI PostgreSQL sem skips para fechar a evidência da fatia.
**Próxima fatia:** acompanhar o CI PostgreSQL desta alteração e, se verde, revisar/aceitar a PR #39 sem merge automático e preparar a Onda O6 de infraestrutura persistente.


## Atualização de estado — revisão da PR #39 e transição para O6 — 2026-10-01
- [x] CI PostgreSQL no head `2cbc5c4`: run [`36941988050`](https://github.com/geordptoroy/forte-panel/actions/runs/36941988050), concluído com sucesso e sem skips.
- [x] Verify/Publish GHCR no head `2cbc5c4`: run [`36941988213`](https://github.com/geordptoroy/forte-panel/actions/runs/36941988213), concluído com sucesso.
- [x] Revisão técnica da PR #39 concluída; a PR está `OPEN` e `CLEAN`, sem merge automático.
- [ ] Aprovação formal externa: a conta autora não pode aprovar a própria PR (`Review Can not approve your own pull request`).
- [ ] Preparar prova O6 em PostgreSQL persistente/staging com dois ou mais workspaces, sem repetir backup/restore ou pareamento já concluídos.
**Próxima fatia:** obter revisão de outro mantenedor ou manter a PR aguardando revisão e preparar o ambiente persistente da Onda O6; não executar merge automático.


## Atualização de estado — preparação da Onda O6 — 2026-10-01
- [x] Verificar dispositivos autorizados: somente o Manus Sandbox está disponível nesta sessão.
- [x] Criar `docs/O6-PROVA-PERSISTENTE-RUNBOOK.md` com topologia, gates, variáveis, workflow E2E e evidências exigidas.
- [x] Confirmar que o workflow `.github/workflows/staging-e2e.yml` já falha fechado sem URL descartável e secrets de staging.
- [ ] Executar O6 em ambiente persistente autorizado; bloqueado até existir staging/Cloud Computer ou ambiente equivalente com autorização explícita.
- [ ] Não executar `staging-e2e`, browser smoke ou tráfego WhatsApp contra URL desconhecida.
**Próxima fatia:** quando houver ambiente persistente autorizado, executar os gates A–D do runbook; até lá, manter O6 como `BLOQUEADA`, não inventar evidência e não repetir backup/restore ou pareamento real.


## Atualização de estado — validação com conta criada pela UI — 2026-10-01
O script `scripts/validate-flow.mjs` agora aceita `VALIDATION_EMAIL` e `VALIDATION_PASSWORD`, correspondentes à conta criada pelo `/signup`, mantendo `LOCAL_ADMIN_EMAIL`/`LOCAL_ADMIN_PASSWORD` apenas como fallback legado. Se o login falhar, o fluxo encerra imediatamente em vez de produzir uma cascata de falsos erros de autorização.

O requisito de produto para o próximo slice ficou registrado: o Console Admin deve possuir um workspace operacional administrativo próprio, separado do workspace público, com as capacidades de workspace (instância WhatsApp, Inbox, Agenda, Serviços, Profissionais e IA) para suporte real pela plataforma. O acesso deve ser exclusivo às contas do Console Admin, com isolamento explícito de dados, instâncias e permissões; não implementar essa mudança junto com a adaptação do teste.


## Atualização de estado — Console Admin IA e simulação obrigatória — 2026-10-01
- [x] Corrigir o contrato de conexões de IA para permitir múltiplas conexões ativas por capability; a primeira permanece primária e as seguintes viram fallback.
- [x] Manter chaves criptografadas no banco, mascaradas no Console Admin e nunca serializadas em auditorias/respostas.
- [x] Tornar explícito o retorno `mode: simulation_only` nas simulações global e por instância; provider externo e gateway Baileys continuam bloqueados.
- [x] Exigir uma simulação concluída depois do último salvamento do rascunho antes de publicar uma versão do agente.
- [ ] Configurar credenciais reais de provider e executar testes externos; fica para depois, conforme solicitado.
**Próxima fatia:** validar os fluxos reais de provider/WhatsApp no ambiente do usuário e, somente após aceite, discutir liberação supervisionada de respostas automáticas.


## Atualização de estado — workspace operacional do Console Admin — 2026-10-02
Foi criada a rota interna `/platform-admin/support-workspace`, separada da operação dos workspaces clientes. O snapshot tenant-scoped do suporte agora inclui instâncias WhatsApp, catálogo de serviços, profissionais e agenda, além do agente já existente. A página oferece atalhos para Inbox, instâncias, prompts e providers e deixa explícito que o tenant interno não mistura dados públicos.

Typecheck, testes focados de autorização/tenancy e `git diff --check` passaram. A próxima fatia do mesmo escopo é expor mutações de catálogo e agenda para o operador autorizado; não envolve provider real nem pareamento automático.
