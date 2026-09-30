# Forte Panel — Roadmap executável de produto público

**Status:** ativo e canônico para execução por fatias
**Data:** 2026-09-29
**Base:** `FORTE-PANEL-FONTE-DE-VERDADE.md` + auditoria do código e documentação
**Regra de continuidade:** cada mensagem `próximo` executa a próxima fatia pendente, atualiza este arquivo e publica um commit no Git.

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
8. publicar no `origin/main`;
9. responder com o commit, o que mudou, os gates executados e a próxima fatia.

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
| O1.4 | Onboarding | Retomada, autosave, missing/conflict e empty states | **PRÓXIMA** | Onboarding tolerante a interrupções |
| O2.1 | Canal | Saúde do WhatsApp e ciclo de conexão | PENDENTE | QR, pairing, reconexão e erros acionáveis |
| O2.2 | Canal | Inbound idempotente e histórico sem efeitos colaterais | PENDENTE | Mensagem recebida uma vez, com status observável |
| O2.3 | Canal | Outbound com `instanceId`, fila e reconciliação | PENDENTE | Envio rastreável até gateway e telefone |
| O2.4 | Canal | Mídia privada e capacidades do composer | PENDENTE | Texto, imagem, áudio, vídeo e documento com limites claros |
| O3.1 | Comercial | Lead unificado entre contato, conversa e oportunidade | PENDENTE | WhatsApp cria/atualiza lead real |
| O3.2 | Comercial | Inbox operacional com assignment e follow-up | PENDENTE | Nenhum lead importante fica sem próxima ação |
| O3.3 | Comercial | Funil canônico sem duplicação de estado | PENDENTE | Lead atravessa estágios com auditoria |
| O3.4 | Comercial | Orçamento com itens, validade e aprovação | PENDENTE | Conversa pode gerar proposta rastreável |
| O3.5 | Comercial | Agenda com conflito, profissional e status | PENDENTE | Orçamento aprovado pode virar agendamento real |
| O3.6 | Comercial | Recebimento, ledger operacional e recibo | PENDENTE | Serviço concluído fecha ciclo de receita |
| O3.7 | Comercial | Dashboard de decisões do dia | PENDENTE | Usuário vê pendências, receita e saúde do canal |
| O4.1 | IA | Contexto comercial seguro para o agente | PENDENTE | IA consulta dados reais sem atravessar tenant |
| O4.2 | IA | Ferramentas somente leitura e confirmação mutável | PENDENTE | IA sugere; humano/backend autoriza efeitos |
| O4.3 | IA | Transferência para humano e kill switch | PENDENTE | Falha segura e controle operacional |
| O4.4 | IA | Métricas de resolução, custo, latência e receita | PENDENTE | IA medida por resultado, não por prompt |
| O5.1 | Admin | Workspaces como contas de produção | PENDENTE | Lifecycle, saúde, plano e incidente reais |
| O5.2 | Admin | Suporte, tickets e sessões auditadas | PENDENTE | Operador trabalha sem misturar tenants |
| O5.3 | Admin | Health de gateway, filas, storage e providers | PENDENTE | Console diagnostica problemas reais |
| O5.4 | Admin | Quotas, planos, retenção e lifecycle | PENDENTE | Console opera o SaaS, não apenas usuários |
| O6.1 | Confiabilidade | Testes negativos de tenancy e papéis | PENDENTE | Isolamento comprovado entre workspaces |
| O6.2 | Confiabilidade | Backup, restore e retenção | PENDENTE | Recuperação comprovada de banco, mídia e sessão |
| O6.3 | Confiabilidade | Browser desktop/mobile e acessibilidade | PENDENTE | Jornadas críticas operáveis por cliente real |
| O7.1 | Monetização | Plano, quota e cobrança SaaS separados | PENDENTE | Limite técnico não é billing |
| O7.2 | Monetização | Trial, upgrade, downgrade, cancelamento e retenção | PENDENTE | Ciclo comercial do próprio Forte Panel |
| O7.3 | Escala | Observabilidade, incidentes e release público | PENDENTE | Abertura controlada sem dependência manual |
| A1 | Adiado | TTS, múltiplos canais e automações genéricas | ADIADA | Só após o núcleo gerar valor recorrente |

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
7. commitar e publicar;
8. responder com:
   - fatia executada;
   - arquivos alterados;
   - comportamento antes/depois;
   - validações executadas e não executadas;
   - commit publicado;
   - próxima fatia.

Se uma fatia crescer demais, dividir em subfatias no próprio documento antes de implementar. Não abrir uma nova frente só porque uma tela parece mais fácil.

---

## 13. Estado de publicação

| Campo | Valor inicial |
|---|---|
| Branch | `feat/o1.3-attendance-rule-simulation` |
| Base auditada | `cad2b8a` |
| Última fatia concluída | `P0.3` — seeds e bootstrap isolados por ambiente |
| Última fatia concluída por este roadmap | `O1.3` — revisão de exemplos vinculada ao candidato publicado |
| Último commit de implementação deste roadmap | `6f5a812` — `feat: add consent-gated onboarding example review` |
| Pull request | [#5](https://github.com/geordptoroy/forte-panel/pull/5) — aberto, empilhado sobre o PR #4 (O1.2); não mesclado |
| Bloqueios externos | staging persistente, número WhatsApp de teste, restore comprovado e billing SaaS |

Este quadro deve ser atualizado a cada fatia. O documento canônico continua sendo a autoridade de produto; este arquivo é a fila operacional.
