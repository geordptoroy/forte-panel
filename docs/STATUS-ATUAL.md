# Estado atual — Forte Panel

**Atualizado:** 2 de outubro de 2026, 23:09 (UTC−3)
**Repositório:** `geordptoroy/forte-panel`  
**Estado:** candidata local em validação; **não publicada**.

## Git e decisão de integração

| Referência | SHA observado | Estado |
|---|---|---|
| `origin/main` | `f67548570f44b8c8fe79082911d7de557a8a3650` | Base canónica observada antes da candidata; confirmar de novo antes de promover. |
| `origin/feat/o7.15-storage-reconciliation-observability` | `61d8a13703b3146727987b6f00b34785bfdcfb87` | Linha de desenvolvimento que está a ser reconciliada localmente com a main. |
| PR #3, `docs/ai-admin-core-plan-2026-09-27` | `d90bba2edc6601e73db9bd18601b9d97a2b2bef4` | Auditoria concluída: **não integrar a ref inteira**. As capacidades Baileys principais já estão em main/O7; a arquitetura multi-canal antiga não faz parte do produto. |
| Candidata | branch `integration/beta-candidate-2026-10-02`, `HEAD=f675485` | Junção main+O7 ainda sem commit; alterações de integração locais e staged/unstaged, zero conflitos não resolvidos no último check. |

**Conclusão da auditoria:** main+O7 já contém o modelo multi-instância Baileys, pairing/readiness, polling de estado, CRUD, settings/profile, integração REST opt-in e os gates mais recentes. As migrations 0038/0039 do PR são byte-a-byte iguais às refs atuais; o candidato conserva também as migrations 0040–0044 de main e 0045–0058 de O7. A ref antiga do PR carrega uma arquitetura multi-canal fora do escopo e uma UI alternativa que remove settings/profile e o atalho Inbox; trazer a branch inteira é regressivo e conflitante. Nenhuma alteração do PR #3 foi copiada.

O possível conflito de nonce foi revisto: o gateway gera nonce aleatório com 18 bytes (144 bits), e a aplicação usa um segredo global de assinatura; a unicidade por workspace/provider é intencional para detetar replay independentemente da instância. Não foi feita alteração ao índice.

Não houve `push`, merge remoto, publicação GHCR, acesso ao Supabase, reset Docker nem teste contra a instância real do utilizador. PR #3 permanece sem alteração remota; o seu destino na plataforma GitHub não foi mudado.

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

## Validação já concluída

| Verificação na candidata | Resultado |
|---|---|
| PostgreSQL local descartável, versão 16 | **60 migrations** numa base vazia; upgrade `main`→candidata aplicou 45 + 15 migrations com sucesso. |
| `pnpm check` | Passou. |
| Regressões focadas após generalizar a deteção de credenciais | **4 ficheiros / 18 testes passaram** (`platform-admin`, `secret-safety`, `baileys-policy`, `message-routing`). |
| Procura de providers no runtime/env e links do índice | **Zero referências operacionais/variáveis antigas; 17 links documentais válidos.** Testes negativos continuam a provar que valores legados são rejeitados. |
| Suite root com `DATABASE_URL` local | **112 ficheiros / 407 testes passaram; zero skipped** na execução completa anterior à última alteração do validador; a cobertura focada foi repetida depois dela. |
| Validator de configuração de produção | Passou com configuração sintética segura; sem credenciais reais. |
| `pnpm build` | Passou; emite aviso de bundle JavaScript principal com cerca de 1,1 MB (minificado). |
| Gateway Baileys | **16 ficheiros / 84 testes passaram;** typecheck e build passaram. |
| Workflow de publicação | YAML validado; `main` apenas, migrations PostgreSQL e zero-skips antes de `publish`. Ainda não executado no GitHub. |

A suite root também passou sobre a base atualizada de 45 migrations da `main` para 60 da candidata. A base era descartável e não continha dados de negócio; isto prova compatibilidade do SQL de upgrade, **não** preservação de dados reais existentes. Os testes não cobriram WhatsApp real, browser do utilizador, envio de mensagens, Supabase nem imagem Docker executada.

## Pendências antes de promover

1. O escopo Baileys-only está confirmado; não há decisão pendente de provider.
2. Manter a UI atual; só portar a variante visual/formulário do PR #3 se for explicitamente desejada, preservando settings/profile, o atalho Inbox e os contratos atuais.
3. Rever as migrations que bloqueiam dados legacy/duplicados e o preflight necessário antes de uma futura atualização de uma base com dados reais; os testes usaram apenas bases descartáveis.
4. O gate PostgreSQL/migrations/zero-skips já foi acrescentado ao workflow local de publicação; após promover, confirmar no GitHub que `verify` termina verde antes de `publish` começar.
5. Resolver a localização das settings pnpm antes de regenerar o lockfile; a instalação congelada atual aplica o patch Wouter, mas continua a emitir aviso.
6. Rever o aviso de bundle e os gaps de signup/isolamento/readiness descritos na auditoria completa; repetir os gates após qualquer alteração.
7. Só após revisão, confirmar a `main` remota mais recente e pedir autorização para promover/publicar. Esperar o workflow GHCR terminar por completo antes de entregar o procedimento local.

## Próxima ação

**Manter a candidata main+O7, sem importar PR #3; rever as migrations de dados legacy e repetir todos os gates antes de qualquer promoção.** O upgrade de schema main→candidata passou numa base descartável, mas a candidata não é uma release beta pública e não deve ser instalada no ambiente do utilizador.
