# Auditoria técnica completa — Forte Panel

**Data:** 2026-09-25
**Escopo:** segurança, autenticação/autorização, multi-tenant, backend, banco, agente nativo, PAPI/Meta, frontend, Docker, CI/CD, operação e testes.
**Método:** inspeção estática do repositório, revisão dos fluxos e execução de validações locais. Nenhum código de produto foi alterado para produzir este relatório.

## Resumo executivo

O projeto tem uma base boa para evolução: TypeScript strict, validação Zod, PostgreSQL/Drizzle, índices de deduplicação, locks para agenda, worker separado, retries de eventos, adapter PAPI com `Idempotency-Key` e documentação de contratos.

Entretanto, **eu não consideraria a stack pronta para produção multi-tenant com agente autônomo** antes de corrigir os itens P1 abaixo. Os maiores riscos são:

1. **Segredos e credenciais versionados** em Compose/documentação.
2. **Webhook PAPI individual sem autenticação obrigatória** — a URL funciona como bearer credential.
3. **Storage proxy público** sem autorização de sessão/workspace.
4. **Sessões JWT com duração de um ano e sem revogação server-side.**
5. **Membros desativados ainda conseguem acessar/mutar várias rotas.**
6. **Workspace resolvido globalmente**, não pela membership da sessão.
7. **Idempotência check-then-act**, permitindo efeitos duplicados em concorrência.
8. **Worker sem lease robusto**, outbox não transacional .
9. **Agente nativo sem idempotência de efeitos**, com corrida entre LLM e handoff humano.
10. **Múltiplas instâncias PAPI podem responder pelo número errado**, porque o `instanceId` não é carregado até o evento do agente.
11. **CI publica imagem sem executar testes, typecheck, build, scan ou smoke test.**
12. **Compose usa tags mutáveis, portas expostas, Redis sem autenticação e containers sem usuário não-root.**

Não foi confirmado P0 nesta auditoria, mas há vários P1 que devem ser tratados antes de ampliar o uso do agente ou expor a aplicação à internet.

## Validações executadas

- `pnpm check`: passou.
- `pnpm test`: **38 testes passaram; 13 foram ignorados** por dependerem de banco/configuração.
- `pnpm build`: passou.
- `git diff --check`: passou.
- O bundle principal ficou em aproximadamente **634 kB minificado / 172 kB gzip**, com aviso do Vite.
- Não há testes dedicados suficientes para o ciclo completo do agente nativo, concorrência de idempotência ou integração real com PostgreSQL/PAPI.

## Pontos fortes

- Schemas Zod limitam payloads, enums e tamanhos.
- Senhas usam scrypt e comparação em tempo constante.
- JWT é verificado com algoritmo explícito e expiração.
- Webhooks têm registro idempotente e detecção de conflito de payload.
- Há índices únicos para contatos, conversas, mensagens e eventos.
- Agenda usa transação, lock de profissional e validação de conflito.
- PAPI envia `Idempotency-Key`.
- O worker é separado do servidor HTTP.
- Há retries/backoff em eventos de domínio.
- O frontend usa tRPC tipado e possui alguns fluxos com rollback otimista.
- A integração PAPI já suporta o conceito de múltiplos webhooks e instâncias, mas precisa de hardening antes de ser considerada segura.

# Prioridade P1 — corrigir antes de produção

## 1. Rotacionar segredos e retirar valores utilizáveis do Git

**Problema:** existem credenciais, senhas, API keys, JWT/webhook secrets e outros valores sensíveis ou com aparência de utilizáveis em arquivos Compose e exemplos rastreados.

**Risco:** acesso ao PostgreSQL, PAPI, API do Panel, webhooks ou provedores externos caso algum valor tenha sido usado fora de ambiente descartável.

**Ações:**

- Considerar comprometidos todos os segredos que já foram usados.
- Rotacionar credenciais PAPI, PostgreSQL, Panel, JWT, webhook signing e chaves de provedores.
- Remover valores reais e defaults fracos do Git e revisar o histórico.
- Usar `.env` fora do repositório, Docker secrets ou Secret Manager.
- Fazer o processo falhar quando uma variável obrigatória tiver valor de exemplo.
- Separar claramente `local`, `staging` e `production`.

## 2. Tornar a autenticação dos webhooks obrigatória

**Problema:** a rota parametrizada do webhook PAPI aceita o UUID da URL como único fator de autenticação.

**Risco:** quem obtiver a URL pode injetar eventos e alterar contatos/mensagens/estado do atendimento.

**Ações:**

- Exigir sempre `X-PAPI-Webhook-Secret`, HMAC ou API key, inclusive na URL individual.
- Comparar o segredo em tempo constante.
- Nunca tratar UUID da URL como substituto de autenticação.
- Entregar o segredo somente uma vez após criação, com máscara depois disso.
- Adicionar rotação/revogação por webhook.
- Registrar auditoria de criação, rotação, uso inválido e remoção.
- Limitar webhook à instância e workspace correspondentes.

## 3. Proteger o storage proxy

**Problema:** `/manus-storage/*` aparentemente gera URL assinada usando credencial interna sem autenticar sessão, API key ou ownership do objeto.

**Risco:** leitura de arquivos privados por caminho conhecido/adivinhado.

**Ações:**

- Exigir sessão ativa ou API key com escopo.
- Associar cada arquivo a workspace/usuário.
- Validar prefixo e ownership no backend.
- Não aceitar caminho arbitrário fornecido pelo usuário.
- Usar URLs assinadas curtas e registrar acesso.

## 4. Corrigir sessão, logout e membros desativados

**Problema:** sessões podem durar um ano e logout apenas remove o cookie local. Várias rotas usam `protectedProcedure`, que valida apenas existência de usuário, sem `memberActive`.

**Risco:** token roubado continua válido; membro desativado continua lendo e alterando Inbox, billing e outras áreas.

**Ações:**

- Trocar para access token curto + refresh token rotativo.
- Registrar sessões com `jti`, revogação e versão de credencial.
- Invalidar sessões na troca de senha, desativação e logout.
- Aplicar `requireActiveMember` como middleware padrão em operações de workspace.
- Criar matriz de permissões por papel e função operacional.
- Testar cookie emitido antes da desativação.

## 5. Implantar tenancy real

**Problema:** várias consultas usam um workspace global derivado de configuração, em vez de workspace selecionado/validado pela membership da sessão.

**Risco:** o desenho não oferece fronteira confiável para duas empresas no mesmo banco.

**Ações:**

- Derivar `workspaceId` da sessão/membership ativa.
- Validar membership em cada request.
- Passar escopo explicitamente para funções de dados.
- Remover helpers globais sem workspace.
- Adicionar testes com dois workspaces.
- Considerar Row-Level Security no PostgreSQL como defesa adicional.
- Associar canais, instâncias, contatos, conversas, mensagens e webhooks ao workspace.

## 6. Corrigir idempotência da API

**Problema:** a API faz `SELECT` da Idempotency-Key, executa o handler e somente depois grava o resultado.

**Risco:** duas requisições concorrentes executam o mesmo efeito antes de uma colidir no índice único.

**Ações:**

- Fazer claim atômico com `INSERT ... ON CONFLICT DO NOTHING` antes do handler.
- Persistir estados `processing`, `completed`, `failed` e `unknown`.
- Fazer a segunda requisição aguardar ou devolver o resultado do primeiro executor.
- Tratar timeout externo como estado desconhecido, não como prova de falha.
- Criar testes `Promise.all` para contatos, agenda, mensagens, stage e webhooks.

## 7. Implementar outbox transacional e leases de worker

**Problemas:**

- Mensagem e evento de domínio são persistidos fora de uma transação única.
- O startup redefine todo `processing` para `queued/pending` sem verificar proprietário/idade.
- Falta `workerId`, `claimedAt` e `leaseUntil`.

**Riscos:** perda de eventos, execução duplicada após restart e reprocessamento durante chamada externa ainda em andamento.

**Ações:**

- Persistir mutação de negócio + evento na mesma transação.
- Usar outbox transacional.
- Claim com `FOR UPDATE SKIP LOCKED` quando aplicável.
- Adicionar lease expirável por worker.
- Recuperar somente leases expirados.
- Registrar tentativa, erro, duração e resultado externo.

## 8. Corrigir o ciclo do agente nativo

### 8.1 Efeitos não são idempotentes

O agente pode executar nota, atualização, agendamento, handoff e resposta. Se falhar depois de uma tool, o retry pode executar tudo novamente.

**Correção:** ledger de efeitos por `eventId + toolCallId`, chaves determinísticas por mutação e dedupe de resposta por evento/índice.

### 8.2 Corrida com handoff humano

O worker verifica `aiEnabled/humanControlled` antes de chamar o LLM. O operador pode assumir a conversa enquanto o LLM está processando; ao terminar, a resposta de IA ainda pode ser enfileirada.

**Correção:** usar versão/fencing token da conversa; revalidar controle humano antes de inserir e antes de enviar a resposta.

### 8.3 Comandos de controle não estão implementados

A documentação menciona `#humano`, `#assumir`, `#pausar`, `#retomar`, `#bot` e `#voltar`, mas não há parser executável encontrado. Mensagens `fromMe` seguem a regra genérica e desligam a IA.

**Correção:** parser autenticado antes de criar `message.received`, máquina de estados explícita, supressão de resposta comercial e auditoria do operador.

### 8.4 `instanceId` é perdido antes do agente

O webhook salva `instanceId` no metadata da mensagem, mas o payload do evento `message.received` não o transporta para o `NativeAgentEvent`. O agente então usa a instância padrão.

**Risco:** em múltiplas instâncias, a resposta pode sair pelo número errado.

**Correção:** carregar `instanceId` no payload do domínio, no evento do agente e no outbound. Validar instância pertencente ao workspace/canal.

### 8.5 Mídia não chega ao modelo

O código escolhe capacidade de visão/áudio/documento pelo tipo, mas não envia URL/MIME/conteúdo multimídia ao LLM. O modelo pode receber somente caption ou `[mídia recebida]`.

**Correção:** transportar metadados e construir input multimodal real. Se não houver capacidade, responder explicitamente e transferir para humano.

### 8.6 Chamadas LLM sem timeout

O worker aguarda `fetch` do LLM sem `AbortController`, timeout ou circuit breaker. O worker é sequencial.

**Correção:** timeout total por evento, retry somente para erros transitórios, circuit breaker e concorrência controlada.

### 8.7 Erros de tools deixam o cliente sem resposta

Falhas de argumentos, agenda, memória ou provedor são lançadas e o evento apenas é reprogramado.

**Correção:** converter erro em resultado estruturado para o modelo ou resposta segura; falha terminal deve criar tarefa/notificação humana.

### 8.8 Histórico do agente tem duplicação e papéis incorretos

A mensagem atual já está no histórico e é acrescentada novamente como `Nova entrada`. Mensagens `human/system` são tratadas como `user`; mensagens `failed/queued` podem aparecer como se fossem válidas.

**Correção:** remover duplicação, mapear papéis explicitamente, filtrar status e limitar por tokens.

## 9. Corrigir canais e integrações

- Meta tem adapter de envio, mas não possui webhook nativo completo de entrada/challenge/assinatura.
- Credenciais PAPI/Meta são globais no ambiente, não realmente por canal/workspace.
- Meta não tem estratégia equivalente de idempotência.
- `workspaceSettings` não tem unique `(workspaceId, key)` e usa read-then-insert.
- Não há FKs/checks suficientes para impedir órfãos e associações inválidas.
- Telefones são normalizados em alguns caminhos, mas não em todos.

# Prioridade P2 — próximo ciclo

## Backend e banco

- Adicionar FKs e CHECK constraints após auditoria de órfãos.
- Consolidar `drizzle-pg` como única árvore de migrations.
- Criar unique `(workspaceId, key)` para settings e usar upsert atômico.
- Separar `failureAttemptCount` de `debounceDeferrals`.
- Adicionar backoff/`availableAt` também para mensagens outbound.
- Criar rotina de reconciliação de mensagens inbound sem evento.
- Definir atomicidade explícita para `/messages/batch`.
- Persistir `channelId`/`instanceId` na conversa/mensagem.

## Frontend e UX

- Não converter erro/loading em lista vazia ou zero.
- Criar componentes padronizados de loading, erro, retry e empty state.
- Adicionar `onError` a todas as mutations; não limpar rascunho antes de confirmação.
- Manter CTAs visíveis no mobile; atualmente `.page-actions` desaparece.
- Corrigir timezone de criação de agenda para o fuso do workspace.
- Remover botões sem implementação: filtro, anexos, menu de conversa e “Configurar”.
- Mascarar segredo de webhook e nunca renderizar valor completo.
- Adicionar `:focus-visible` e `aria-label` em botões icon-only.
- Corrigir grids inline que impedem responsividade.
- Não mostrar stack trace do ErrorBoundary em produção.
- Separar `PanelPages.tsx` em módulos por domínio e remover BillingPage/demo duplicado.
- Fazer code splitting por rota; o bundle inicial está grande.

## Docker e operação

- Usar imagem por digest ou SHA imutável, nunca `latest` em produção.
- Rodar container como usuário não-root.
- Separar redes de ingress, aplicação, banco e Redis.
- Não publicar PAPI, PostgreSQL ou Redis diretamente.
- Configurar autenticação/ACL do Redis.
- Adicionar healthcheck real do Panel e readiness que valide banco/migrations.
- Separar migration em job único com lock e backup verificado.
- Criar backup PostgreSQL off-host, retenção e teste periódico de restore.
- Adicionar limites de CPU/memória/PIDs e rotação de logs.
- Parametrizar bind mount WSL; remover caminho absoluto específico de uma máquina.
- Implementar shutdown gracioso do servidor HTTP.
- Adotar logs estruturados, correlation ID, redaction, métricas e alertas.
- Reduzir os vários Compose a um arquivo oficial por ambiente.

## Qualidade e testes

- Ativar testes PostgreSQL no CI e falhar quando suites críticas forem ignoradas.
- Adicionar `test:integration` e `test:e2e` reproduzíveis.
- Criar testes HTTP de sucesso para todos endpoints documentados.
- Criar testes concorrentes de idempotência, webhook e agenda.
- Criar testes dedicados do agente: retry, crash, handoff, comando, mídia, instância e tool failure.
- Incluir frontend no Vitest e adicionar E2E de login, Inbox, Agenda, Kanban e integrações.
- Adicionar lint, `format:check`, coverage e thresholds graduais.
- Incluir testes de tipos dos arquivos de teste.
- Corrigir configuração obsoleta do pnpm e fixar versão no CI/container.
- Fazer `validate-flow.mjs` aceitar `BASE_URL`, esperar healthcheck e iniciar ambiente efêmero.

# Roadmap recomendado

## Fase 0 — contenção imediata

1. Rotacionar todos os segredos expostos.
2. Tornar webhook individual dependente de segredo/HMAC obrigatório.
3. Ocultar segredos no frontend.
4. Proteger storage proxy.
5. Remover portas públicas e usar proxy/TLS.
6. Fixar imagens e parar de usar `latest` em produção.
7. Adicionar gates mínimos no CI: install, check, test, build e Compose config.

## Fase 1 — confiabilidade do agente e dados

1. Implementar `workspaceId`/membership real.
2. Aplicar `requireActiveMember` globalmente.
3. Corrigir idempotência concorrente.
4. Implementar outbox transacional e leases.
5. Preservar `instanceId` até o agente e outbound.
6. Implementar máquina de estados de handoff e comandos.
7. Criar ledger idempotente de tool calls e respostas.
8. Adicionar timeout/circuit breaker do LLM.
9. Transportar mídia corretamente.
10. Testar crash/retry com PostgreSQL real.

## Fase 2 — produto e operação

1. Implementar Meta inbound completo ou remover a promessa de suporte.
2. Resolver credenciais por canal/workspace.
3. Adicionar backups, restore testado e rollback por digest.
4. Implementar observabilidade, métricas e alertas.
5. Melhorar estados de erro/loading, mobile e acessibilidade.
6. Dividir frontend e fazer code splitting.
7. Consolidar Compose/migrations/documentação.
8. Fazer teste de carga do worker, PAPI e LLM.

# Critério para considerar pronto para produção

A recomendação é só marcar o sistema como pronto quando todos os pontos abaixo forem demonstrados em ambiente de staging:

- Nenhum segredo operacional no Git.
- Webhook exige autenticação criptográfica e permite rotação.
- Dois workspaces não conseguem ler/mutar dados um do outro.
- Membro desativado perde acesso imediatamente.
- Mesma Idempotency-Key concorrente produz um único efeito.
- Restart durante chamada PAPI/LLM não duplica mensagem nem tool.
- Handoff humano impede resposta de IA já em processamento.
- `instanceId` de entrada determina o canal de saída correto.
- Mídia chega ao modelo ou é encaminhada para humano sem falsa interpretação.
- Migrations, backup, restore e rollback foram testados.
- CI executa typecheck, lint, testes unitários, integração, E2E, scan e smoke test.
- Health/readiness, logs, métricas e alertas estão operacionais.

## Conclusão

O projeto está em uma boa fase de protótipo avançado/MVP, mas a evolução para operação com múltiplas instâncias PAPI e agente autônomo exige priorizar **segurança de credenciais, isolamento de tenant, idempotência, leases/outbox e controle humano do agente**. Essas melhorias reduzem o risco de vazamento, envio pelo número errado, resposta duplicada e ações automáticas repetidas — os quatro modos de falha mais perigosos para este produto.

---

## Atualização técnica — 2026-09-26 10:53

A auditoria avançou da contenção de tenancy para operação segura do beta: quotas por workspace/usuário, proteção do outbound automático, painel de consumo e alertas in-app de 70%/90% para responsáveis ativos. O risco prioritário deixou de ser apenas implementação e passou a ser validação operacional com PostgreSQL real, retenção dos buckets e definição comercial de planos.

A referência consolidada para abertura do beta é `BETA-OPERATIONS-CHECKLIST.md`; o mapa de todos os documentos está em `PROJECT_DOCUMENTATION_INDEX.md`.
