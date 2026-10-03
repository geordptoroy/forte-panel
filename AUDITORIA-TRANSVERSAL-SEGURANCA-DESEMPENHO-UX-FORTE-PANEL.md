# Forte Panel — Auditoria transversal completa

> **DOCUMENTO HISTÓRICO — revisto em 2026-10-02.** Este ficheiro preserva decisões e evidências de um estado anterior e não define o produto ou os procedimentos atuais. O único canal do produto é Baileys. Não executar opções de canal, comandos, branches, tags ou tarefas pendentes daqui; consultar `AGENTS.md`, `PRODUCT_SCOPE.md`, `docs/STATUS-ATUAL.md` e `docs/WORKFLOW-DESENVOLVIMENTO-E-RELEASE.md`.




**Data:** 2026-09-28  
**Escopo:** segurança, autorização, desempenho, escalabilidade, engenharia, dados, migrações, testes, CI/CD, operação, confiabilidade, UI/UX, acessibilidade e aderência ao produto.  
**Decisões fixas:** somente Baileys; gateway Node.js/TypeScript; beta com 10 empresas; Console Admin com controle total temporário dos workspaces, sempre auditado; branding Forte Panel preservado.

## Limitações da auditoria

Esta revisão foi feita sobre o código, migrations, workflows, Compose, documentação e testes disponíveis. Não foi executado benchmark, navegador real, leitor de tela, Docker, restore real, PostgreSQL alvo ou número WhatsApp real nesta rodada. Portanto, fatos observados estão separados de riscos inferidos. A ausência de um problema reproduzido não deve ser interpretada como garantia de segurança ou prontidão.

## Resumo executivo

A base é aproveitável, mas ainda não deve ser liberada para as 10 empresas. Foram encontrados sete bloqueadores de release:

1. **Baileys-only não é um invariant executável.** Contratos, schema, defaults, adapters, roteamento, Compose e UI ainda permitem ou exibem providers fora da decisão.
2. **A idempotência não alcança o efeito externo.** O painel envia `Idempotency-Key`, mas o gateway não a lê nem mantém um ledger; timeout ou retry pode duplicar mensagens.
3. **Inbound não é transacional.** Webhook, mídia, contato, conversa, mensagem, unread e domain events são gravados em etapas separadas.
4. **Mídia usa payload grande e base64 no caminho síncrono.** Isso pode multiplicar memória, WAL, CPU, rede e storage.
5. **O caminho publicado não entrega o produto prometido.** O modo atual restringe a aplicação a Conexões e Inbox, enquanto CRM, agenda, métricas, onboarding e Console Admin operacional ficam fora ou incompletos.
6. **O pipeline pode publicar com testes críticos ignorados.** A execução local observada passou 198 testes e ignorou 47; E2E Baileys real, restore, browser e coorte de 10 workspaces não são gates obrigatórios.
7. **O controle administrativo pode escapar da sessão ou perder auditoria.** Existem rotas legadas fora do fluxo de suporte e mutações que auditam depois da alteração.

## Matriz de bloqueadores P0

| Domínio | Achado | Evidência | Ação | Critério de aceite |
|---|---|---|---|---|
| Arquitetura | Baileys-only não é forçado | `server/integrations/contracts.ts`, `server/integrations/whatsapp.ts`, `drizzle/schema.ts`, `server/db.ts`, Compose e UI ainda possuem caminhos antigos | Migration de convergência, remover defaults/adapters/call sites e criar policy test | Nenhuma rota, enum, configuração ou tela operacional seleciona algo diferente de Baileys |
| Outbound | Idempotência para no painel | `whatsapp.ts` envia chave; `forte-whatsapp/src/server.ts` não persiste nem consome | Ledger durável por `instanceId + Idempotency-Key`, single-flight e resultado reaproveitável | Timeout após envio, restart e concorrência nunca geram segunda mensagem |
| Inbound | Efeito dividido em várias gravações | `server/api.ts` e `server/db.ts` registram e ingerem em chamadas separadas | Transação PostgreSQL para estado de domínio; outbox/compensação para storage externo | Crash em qualquer etapa gera commit completo ou nenhum efeito; retry não duplica unread/contato/mensagem |
| Performance | Mídia base64 síncrona | Parser global de 50 MB, `mediaData` de até 50 milhões e payload bruto em `webhookEvents` | Upload/streaming, limites em bytes e referência de objeto | Banco guarda metadata/referência, não bytes; teste de 10 tenants mantém heap/WAL sob SLO |
| Produto | Beta publicado incompleto | `core-mode.ts` e `App.tsx` restringem rotas a Conexões/Inbox | Definir e liberar a fatia beta real, incluindo onboarding, CRM, agenda e Console Admin | Owner e platform admin executam o fluxo acordado sem editar banco/código |
| Release | CI falso-verde | `publish-image.yml` não depende de PostgreSQL; execução observada teve 47 skips | Quality gate único com DB, migration, testes, policy e staging | Zero skips críticos; artefatos de testes e staging anexados ao release |
| Administração | Mutação pode perder auditoria/escopo | Rotas legadas em `routers.ts`; reset usa demo; audit ocorre depois da mutação | Centralizar em `platform-router`, support session obrigatória e transação com audit | Sem sessão/reason/workspace explícitos falha; falha do audit faz rollback |

## Segurança e autorização

### Problemas prioritários

- Auth state Baileys pode ser persistido sem criptografia quando a chave não existe; Compose não injeta a chave.
- Logout apenas limpa cookie; JWT roubado permanece utilizável até expirar ou até mudança de senha.
- Proxy de storage valida autenticação e sintaxe, mas não comprova ownership do `workspaceId` antes de assinar a URL.
- Troca de canal ainda está acessível a `protectedProcedure`, permite provider incompatível e não registra actor/before/after.
- Webhook aceita segredos globais e não possui timestamp, nonce ou janela anti-replay.
- CSRF depende de headers que podem estar ausentes; cookie HTTPS usa `SameSite=None`; trust proxy não é explícito.
- Rate limits são Maps locais por processo e não protegem adequadamente escala horizontal, flooding e reset abuse.
- Parser global aceita 50 MB; gateway lê body inteiro sem limite equivalente.
- Não há hardening completo de CSP, HSTS, CORS, `frame-ancestors`, Referrer-Policy e Permissions-Policy.
- Base URL de provider configurável exige bloqueio de SSRF e separação de chave de provider da chave JWT.

### Critério de segurança para o beta

Produção deve falhar ao iniciar sem chave de sessão Baileys forte; usar sessão revogável; validar ownership de storage; assinar webhook por instância/workspace; exigir CSRF; aplicar rate limit distribuído; restringir destinos HTTPS; publicar headers de segurança; e testar cross-tenant, cookie roubado, replay, payload grande e suporte expirado.

## Desempenho e escalabilidade

- Há um worker principal com lote 10, intervalo de 1.500 ms e outbound serial. O limite teórico bruto é cerca de 6,67 itens/s antes de banco, Baileys, IA e auditoria.
- Redis é provisionado, mas não há consumidor de fila equivalente; o fluxo principal permanece polling PostgreSQL.
- Mensagens não apresentam claim atômico robusto com `FOR UPDATE SKIP LOCKED`, lease, workerId e `nextAttemptAt` no caminho observado.
- Inbox carrega históricos grandes e faz leitura adicional para unread; a UI não usa cursor de paginação.
- Faltam índices compostos para as consultas principais de messages, notes e audit logs.
- Thread e agente podem buscar histórico maior que o necessário e assinar mídia antiga individualmente.
- Webhook faz autenticação, ingestão e marcação antes de responder 202.
- QR/status usam polling fixo, e snapshots de dashboard/agenda não possuem janela suficiente.
- Não há retenção demonstrada para `webhookEvents` e `domainEvents`.

### Plano de desempenho

Escolher Redis Streams/BullMQ ou fila PostgreSQL com claim atômico; separar outbound, eventos/LLM e manutenção; limitar concorrência por workspace, instância e conversa; implementar backoff, jitter, DLQ e circuit breaker; paginar Inbox; criar índices; externalizar mídia; medir p50/p95/p99, heap/GC, WAL, pool, queue age e throughput com exatamente 10 workspaces.

## Engenharia e arquitetura

- `server/db.ts`, `server/routers.ts` e `server/platform-admin.ts` são hotspots monolíticos com alto blast radius.
- Payloads externos ainda usam `any`, casts e `Record` sem contrato compartilhado versionado.
- `Idempotency-Key` não é contrato fim a fim entre painel e gateway.
- O banco não declara FKs, checks ou relações estruturais suficientes para entidades tenant-scoped.
- Há drift entre schema PostgreSQL, journal e snapshots; existe histórico legado paralelo.
- Errors podem devolver `error.message` e logs de worker não possuem correlação operacional completa.
- Há divergência de gerenciamento de dependências entre root/pnpm e gateway/npm.

### Recomendação de refatoração

Usar estratégia strangler: manter fachadas compatíveis, extrair bounded contexts de identidade/workspace, WhatsApp/Inbox, agenda, onboarding, agente e platform admin. Criar pacote de contratos Zod/JSON Schema versionado. Introduzir `WorkspaceContext` obrigatório nos repositories. Adotar `ErrorCode`, `correlationId` e logger estruturado. Escolher uma única fonte de migration PostgreSQL e testar paridade schema/journal/snapshot em CI.

## Dados e consistência

- Ingestão inbound não usa uma transação única.
- `messages.externalId` é unique global enquanto outras deduplicações são tenant-scoped.
- Não há FKs/checks/deletedAt suficientes.
- Agenda usa locks em aplicação, mas não tem chave idempotente ou constraint de intervalo no banco.
- Cleanup remove linhas de áudio, mas não demonstra remoção do blob.
- Reset de desenvolvimento pode apagar dados e audit logs.
- Backup/restore não inclui claramente blobs, Redis, chave de sessão e ensaio de restauração automatizado.
- Migration 0041 aparece no SQL, mas não está refletida de forma completa no journal/snapshot observado.

### Critério de dados

Detectar e corrigir órfãos/cross-tenant; adicionar FKs e chaves compostas gradualmente; usar `UNIQUE(workspaceId, provider, externalId)` ou equivalente; adicionar checks de dinheiro/horário; implementar soft delete e retenção; separar reset de desenvolvimento; tornar backup restaurável com DB, blobs e sessões Baileys.

## UI/UX e acessibilidade

### Achados

- Branding aparece como **Forte Media** com imagem externa de skull em parte do shell, contrariando Forte Panel.
- UI expõe Meta Cloud API, incompatível com Baileys-only.
- Muitos textos têm 8–11 px e cores muted escuras; contraste e leitura diária são preocupantes.
- Login, signup, recuperação e convite usam toast como único erro.
- Dialog de conexão referencia título inexistente e não implementa foco completo; drawer da Inbox também não gerencia foco.
- Labels de Agenda/CRM não estão sempre associados por `htmlFor/id`.
- Métodos QR não usam radio group/`aria-pressed` adequadamente.
- Inbox não anuncia conversa selecionada e fica estreita em mobile.
- Kanban depende de drag-and-drop e não anuncia a movimentação.
- Tabs/toggles/badges usam aparência sem semântica completa.
- Console Admin não torna suficientemente visíveis workspace, modo, expiração, motivo e recibo auditável de cada mutação.
- Onboarding é uma página longa com jargão e baixa percepção de progresso.

### Recomendação UX

Criar tokens visuais Forte Panel, texto corrente mínimo de 14 px, contraste medido, foco visível e alvos de toque. Criar componentes compartilhados `Field`, `AsyncState`, `Dialog`, `Drawer`, `StatusLive` e `AuditReceipt`. Transformar onboarding em wizard de cinco etapas. Fazer fluxo Inbox lista→conversa no mobile. Tornar ações acessíveis por teclado e anunciar loading, erro, cópia, QR, mudança de status e publicação.

## Testes e qualidade

O resultado observado foi:

```text
raiz: 42 arquivos passados, 18 ignorados; 198 testes passados, 47 ignorados
gateway: 10 arquivos e 62 testes passados
```

Isso não é suficiente porque:

- testes DB dependem de `DATABASE_URL` e podem ser ignorados;
- publish de imagem não depende do workflow PostgreSQL;
- não há cobertura instrumentada/threshold;
- não há Playwright/Cypress/testing-library rastreado;
- gateway usa FakeRegistry/FakeManager em testes HTTP;
- não há E2E real Baileys com número dedicado;
- não há teste de browser para Console Admin, branding, mobile e acessibilidade;
- contratos Inbox/Agenda são rasos;
- `validate-flow.mjs` cria dados e não demonstra teardown robusto;
- não há matriz parametrizada para dez workspaces;
- documentação diverge sobre o que foi realmente validado.

### Quality gate obrigatório

O release precisa rodar PostgreSQL real com migrations limpas, check/build, gateway test/build, policy Baileys-only, integração, Playwright/axe, coverage, testes de concorrência, staging Baileys, backup/restore e smoke pós-deploy. Skips críticos devem falhar o gate, não apenas aparecer como informação.

## Operação e confiabilidade

- Compose tem healthcheck apenas para Postgres/Redis; Panel, worker e gateway não possuem probes adequados.
- Readiness do Panel verifica essencialmente DB; gateway verifica apenas primeira/default instância.
- Imagens usam tags mutáveis; deploy faz pull/up/force-recreate sem canário ou rollback automático.
- Reconnect Baileys usa intervalo fixo, sem backoff/jitter/circuit breaker.
- Outbox em arquivo não tem DLQ, limite de idade, bytes ou alerta externo.
- Backup é local e não há restore rehearsal validado.
- Chave de criptografia de sessão não é obrigatória no Compose.
- Um processo gateway concentra várias instâncias sem orçamento explícito de CPU/memória/disco.
- Logs do worker não estão centralizados com métricas e paging.
- Não há runbook completo com RPO/RTO, incidentes, replay, reconnect, restore e comunicação aos clientes.

### Recomendação operacional

Usar digest imutável, promoção staging→produção, healthchecks por serviço/instância, probes independentes do autoStart, reconnect com backoff, métricas de outbox/heartbeat/disco/fila, backups off-host criptografados, restore periódico e runbook de incidentes. Para as 10 empresas, medir o blast radius de um único processo gateway antes de aceitar a coorte.

## Produto e aderência à promessa

O código possui peças reais de Baileys, Inbox, agente, agenda e auditoria, mas o produto atualmente não oferece o fluxo completo no caminho publicado:

- modo atual prioriza Conexões e Inbox;
- Console Admin não possui ainda controle total operacional de conversas, CRM, catálogo, agenda, instâncias, fila e equipe;
- onboarding publica prompt, mas não fecha claramente todas as entidades canônicas;
- Billing/Dashboard ainda apresentam dados demo/estado local/valores fixos;
- não há enforcement transacional de 10 workspaces;
- mídia privada não é obrigatória;
- staging real ainda é necessário.

A promessa correta para o primeiro beta deve ser uma implantação assistida de uma empresa com uma conexão Baileys, Inbox, IA/humano, CRM e agenda reais, repetida com observabilidade para dez empresas. Não prometer funcionalidades que só existem em fixtures, páginas inacessíveis ou mocks.

## Roadmap 30/60/90

### 0–30 dias — bloqueadores de release

1. Forçar Baileys-only no domínio, API, runtime, Compose e UI.
2. Implementar idempotência no efeito outbound.
3. Tornar ingestão inbound transacional.
4. Retirar base64/mídia bruta do webhook síncrono.
5. Definir e liberar o caminho beta real.
6. Completar controle operacional do Console Admin com support session e auditoria atômica.
7. Corrigir migration 0041/journal/snapshot.
8. Tornar chave de sessão obrigatória em produção.
9. Corrigir branding para Forte Panel.
10. Criar quality gate PostgreSQL com zero skips críticos.

### 31–60 dias — robustez da coorte

1. Fila com claim/lease/backoff/DLQ e workers separados.
2. Webhook por instância com replay protection.
3. Revogação de sessão, CSRF e storage ownership.
4. Índices, paginação e projeções da Inbox.
5. FKs/chaves tenant-scoped graduais.
6. Deploy por digest, probes e rollback.
7. Reconnect com backoff/jitter/circuit breaker.
8. Wizard de onboarding, métricas reais e quota 10/10.
9. Playwright, axe, contratos compartilhados e matriz de dez workspaces.
10. Restore ensaiado com DB, blobs e sessão.

### 61–90 dias — endurecimento e operação assistida

1. Retenção, particionamento, soft delete e deleção de blobs.
2. Rate limits distribuídos, CSP/CORS/appId/SSRF.
3. Budget de pool e teste de capacidade.
4. Refatoração incremental por bounded context.
5. Soak, repeat, flake e visual regression.
6. Runbooks, paging, RPO/RTO e postmortems.
7. Liberar as 10 empresas somente após critérios assinados.
8. Bloquear expansão até métricas de p95, fila, heap, reconnect, auditoria e restore permanecerem dentro do SLO.

## O que preservar

- Node.js/TypeScript e Baileys;
- Inbox, agenda, agente, suporte temporário e outbox como bases aproveitáveis;
- migrations aplicadas, usando convergência em vez de reescrita;
- support sessions, modos read-only/operator, expiração, reason e auditoria;
- lógica existente de IA/humano, com correção de efeitos, transações e observabilidade;
- branding Forte Panel, aplicando correções incrementais e componentes compartilhados;
- idempotência parcial e testes existentes, completando as lacunas em vez de descartá-los.

## Conclusão

O Forte Panel não precisa de um rewrite cego. Precisa de uma reconstrução incremental orientada por invariantes. O maior risco não é a falta de telas; é liberar uma operação multiempresa em que Baileys não é obrigatório, mensagens podem duplicar, inbound pode ficar parcial, mídias podem pressionar o processo, auditoria pode faltar e o pipeline pode publicar com testes ignorados.

A recomendação é **não convidar as 10 empresas ainda**. Primeiro fechar os sete bloqueadores P0, executar staging Baileys com restore e dois workspaces, depois repetir com dez workspaces descartáveis e evidência de release. Só então iniciar a implantação assistida real.


## Atualização de execução — 2026-09-29

O bloqueador P0 de Baileys-only avançou: seleção, factory operacional, Compose oficial, defaults novos, API pública e UI não usam mais adapters PAPI/Meta; o adapter, contrato runtime, data layer operacional e configuração agora são Baileys-only. O bloqueador permanece aberto para a convergência de schema/dados, porque enum, campos históricos, settings antigos e migrations já aplicadas ainda carregam valores legados. A aceitação final exige migration testada em banco vazio e restaurado, scan de rotas ativas e confirmação de que nenhuma configuração histórica pode voltar ao caminho operacional.
