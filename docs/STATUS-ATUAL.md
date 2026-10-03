# Estado atual — Forte Panel

**Atualizado:** 3 de outubro de 2026, 08:57 (UTC−3)
**Repositório:** `geordptoroy/forte-panel`  
**Estado:** candidata de remediação publicada numa branch de handoff; **não integrada em `main` nem publicada como release/imagem**.

## Git e decisão de integração

| Referência | SHA observado | Estado |
|---|---|---|
| `origin/main` | `f67548570f44b8c8fe79082911d7de557a8a3650` | Base canónica observada antes da candidata; confirmar de novo antes de promover. |
| `origin/feat/o7.15-storage-reconciliation-observability` | `61d8a13703b3146727987b6f00b34785bfdcfb87` | Linha de desenvolvimento que está a ser reconciliada localmente com a main. |
| PR #3, `docs/ai-admin-core-plan-2026-09-27` | `d90bba2edc6601e73db9bd18601b9d97a2b2bef4` | Auditoria concluída: **não integrar a ref inteira**. As capacidades Baileys principais já estão em main/O7; a arquitetura multi-canal antiga não faz parte do produto. |
| Base da candidata | branch `integration/beta-candidate-2026-10-02`, commit de remediação `cdaa811ec47243ad17fc2ab24c45b17421329a4f` | Junção main+O7 originalmente auditada em `445d4cc`; remediações validadas e commitadas/pushadas para a branch de handoff. `main` continua em `f67548570f44b8c8fe79082911d7de557a8a3650`. |

**Conclusão da auditoria:** main+O7 já contém o modelo multi-instância Baileys, pairing/readiness, polling de estado, CRUD, settings/profile, integração REST opt-in e os gates mais recentes. As migrations 0038/0039 do PR são byte-a-byte iguais às refs atuais; o candidato conserva também as migrations 0040–0044 de main e 0045–0058 de O7. A ref antiga do PR carrega uma arquitetura multi-canal fora do escopo e uma UI alternativa que remove settings/profile e o atalho Inbox; trazer a branch inteira é regressivo e conflitante. Nenhuma alteração do PR #3 foi copiada.

O possível conflito de nonce foi revisto: o gateway gera nonce aleatório com 18 bytes (144 bits), e a aplicação usa um segredo global de assinatura; a unicidade por workspace/provider é intencional para detetar replay independentemente da instância. Não foi feita alteração ao índice.

Foi publicado o commit `cdaa811` apenas em `integration/beta-candidate-2026-10-02` para permitir continuação por outra IA. Não houve merge/push para `main`, publicação GHCR, acesso ao Supabase, reset Docker nem teste contra a instância real do utilizador. O push não disparou workflows; PR #3 permanece sem alteração remota.

## Alterações feitas apenas na candidata

- Restaurada a relação `appointments.quoteId` no schema e no contrato REST, com migration PostgreSQL aditiva 0059.
- Corrigida a corrida do webhook outbox e adicionada cobertura determinística.
- Atualizados contratos de testes que pertenciam à API anterior; bloqueada a criação de dados demo em produção e removido o endpoint público de seed da Inbox.
- Compose local alinhado às imagens operacionais GHCR `:latest`; workflow de publicação restringido à `main` e sem tag `:dev`.
- Script de atualização consolidado: modo normal preserva volumes; reset elimina apenas os recursos/dados da stack Forte Panel. Os restantes projetos Docker ficam preservados. O nome antigo `dev-reinstall.ps1` é um alias.
- Criados `AGENTS.md` e o procedimento único de desenvolvimento/release.
- Removidas variáveis Meta dos exemplos de ambiente, atualizado o contrato/escopo para Baileys-only e generalizada a deteção de nomes de credenciais.
- Normalizados avisos de documento histórico nos planos, prompts, handoffs e auditorias antigas. As menções remanescentes à PAPI estão limitadas à regra explícita de escopo e a referências de engenharia; não há uso no runtime nem nos exemplos de ambiente.

## Autoridade documental

Para esta candidata, a ordem é: `AGENTS.md` (regras da IA) → `docs/STATUS-ATUAL.md` (estado e decisões) → `docs/WORKFLOW-DESENVOLVIMENTO-E-RELEASE.md` (processo). Os handoffs, prompts, `todo.md`, fonte de verdade e relatórios com o banner **DOCUMENTO HISTÓRICO** preservam o passado; não se devem executar neles branches, tags `:dev`, comandos ou próximos passos antigos.

O utilizador confirmou em 2026-10-02: **Baileys é o único canal do produto**; PAPI pode aparecer apenas em revisão de engenharia, e Meta não é suportada. Estas alterações continuam locais. Não reintroduzir adapters, configurações ou opções de outros canais; qualquer mudança de UX deve preservar os contratos atuais.

## Auditoria beta completa — 2026-10-03

Auditoria read-only de 10 domínios no commit `445d4cc2747366b3a27976ba0b0046e8fbba102c`: **94 achados (2 critical, 38 high, 41 medium, 13 low)**. Ver [`docs/AUDITORIA-BETA-COMPLETA-2026-10-03.md`](./AUDITORIA-BETA-COMPLETA-2026-10-03.md) e o roteiro [`docs/PLANO-REMEDIACAO-BETA.md`](./PLANO-REMEDIACAO-BETA.md). O achado crítico de migration `0017` exige fixtures com dados legados; o gate de lançamento público continua corretamente fechado até existirem as oito evidências reais. A auditoria não alterou código, não usou Supabase nem publicou imagens.

## Validação já concluída

| Verificação na candidata | Resultado |
|---|---|
| PostgreSQL local descartável, versão 16 | **61 migrations** numa base vazia; upgrade `main`→candidata aplicou 45 + 16 migrations com sucesso. |
| `pnpm check` | Passou. |
| Regressões focadas após generalizar a deteção de credenciais | **4 ficheiros / 18 testes passaram** (`platform-admin`, `secret-safety`, `baileys-policy`, `message-routing`). |
| Procura de providers no runtime/env e links do índice | **Zero referências operacionais/variáveis antigas; 17 links documentais válidos.** Testes negativos continuam a provar que valores legados são rejeitados. |
| Segurança P0 e regressões de tenancy | Storage proxy, REST/queue e SSRF têm guards; `setWorkspaceLifecycleStatus`, `setWorkspacePlan` e mutations de incidentes exigem sessão operadora do admin/workspace correctos e registam `supportSessionId`; o Kanban inicia sessão curta antes de suspender/reativar. O delete Baileys prova ownership; `0017` remove o fallback `forte-demo`; `0060` aplica fencing REST fail-closed. |
| Migration 0043 e preflight | **4 superfícies legadas bloqueiam sem mutação** e preservam rows/enum; inventário read-only reporta os quatro counts e referências a credenciais sem revelar valores. |
| Express 4 async REST | 17 callbacks async protegidos por `asyncRoute`; erros não tratados devolvem JSON 500 genérico; as 6 rotas idempotentes passaram a `return await`; 8 regressões cobrem 7 endpoints e claim failed. |
| Suite root com `DATABASE_URL` local | **120 ficheiros / 442 testes passaram** na execução completa após esta remediação; sem skips nesta execução. |
| Validator de configuração de produção | Passou com configuração sintética segura; sem credenciais reais. |
| `pnpm build` do painel | Passou; emite aviso de bundle JavaScript principal com cerca de 1,1 MB (minificado). |
| Gateway Baileys | Suite completa incluída nos 442 testes; typecheck e build `tsc` directos passaram. O comando pnpm isolado foi travado pela política de scripts de dependências; nenhum script foi aprovado/executado. |
| Compose | YAML analisado com Prettier; `docker compose config` não pôde ser executado porque a CLI Docker não está instalada neste sandbox. Nenhum container/volume foi iniciado ou alterado. |
| Workflow de publicação | YAML validado; `main` apenas, migrations PostgreSQL e zero-skips antes de `publish`. Ainda não executado no GitHub. |

A suite root também passou sobre a base atualizada de 45 migrations da `main` para 61 da candidata. A base era descartável e não continha dados de negócio; isto prova compatibilidade do SQL de upgrade, **não** preservação de dados reais existentes. Os testes não cobriram WhatsApp real, browser do utilizador, envio de mensagens, Supabase nem imagem Docker executada.

## Pendências antes de promover

1. Completar a Fase 1: o tratamento async Express 4 está implementado; seguem-se limites de body/rate e revisão dos restantes endpoints. O gate de supportSession para status/plano/incidentes está implementado e testado. O fencing REST da `0060` falha fechado em resultado ambíguo; a reconciliação operacional continua pendente.
2. A `0017` foi corrigida e testada. A `0043` continua fail-closed; inventário e teste protegem a transição, mas a política de arquivo/resolução dos dados PAPI/Meta históricos precisa de decisão explícita antes de qualquer upgrade com esses dados.
3. Resolver os demais high de segurança e transporte Baileys, inclusive encriptação de auth state, limites de media/body e semântica real de queued/sent/failed.
4. Fechar os gates de dados e operação: backup/restore completo, readiness, shutdown, email real ou promessa removida, observabilidade e staging controlado.
5. Repetir typecheck, testes root/gateway, suite PostgreSQL sem skips, builds e workflow no mesmo SHA/digest quando as correções estiverem concluídas.
6. Manter `publicSignup` fechado até as oito evidências do controlled release estarem comprovadas. Nenhum commit de promoção em `main`, publicação GHCR ou alteração da instalação Docker foi feito.

## Próxima ação

**Continuar pela Fase 1 (limites de body/rate e revisão dos restantes endpoints) e decidir a política de preservação para a 0043**, sempre em PostgreSQL local descartável. O wrapper Express 4 foi validado em 7 rotas idempotentes; a `0060` impede replays automáticos de resultados ambíguos, mas a ferramenta de reconciliação ainda falta. A prova actual da `0043` demonstra bloqueio sem mutação, não resolve nem autoriza limpar/arquivar dados históricos; a candidata não é release beta pública e não deve ser instalada no ambiente do utilizador.
