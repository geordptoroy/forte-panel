# Forte Panel — índice de documentação

Este arquivo organiza a documentação do projeto e aponta qual documento consultar em cada decisão.

> **Auditoria e proteção de ingestão WhatsApp/IA (2026-09-28):** consulte [`docs/AUDITORIA-WHATSAPP-IA-2026-09-28.md`](./docs/AUDITORIA-WHATSAPP-IA-2026-09-28.md). A primeira fatia de proteção agora filtra `append`/backfill e texto-placeholder e verifica ownership da instância antes de salvar mídia; a importação histórica e o Console unificado de IA continuam pendentes.
>
> **Core ativo (2026-09-27):** consulte [`WHATSAPP-CONNECTION-FLOW-2026-09-27.md`](./WHATSAPP-CONNECTION-FLOW-2026-09-27.md) para a fase 1: CRUD de instâncias Baileys, consumo, decisões de escopo e sequência solicitada das próximas etapas. Não iniciar o console de modelos nem respostas automáticas antes da revisão do usuário.
>
> **Limpeza estrutural Baileys-only (execução em fatias):** [`MIGRACAO-PAPI-BAILEYS.md`](./MIGRACAO-PAPI-BAILEYS.md) registra a remoção do adapter Cloud e dos helpers/configurações legados sem consumidores ativos. O schema e as migrations históricas ainda preservam valores antigos para permitir migração segura de dados; não apagar volumes nem editar migrations já aplicadas. A 0042 só foi corrigida porque o CI confirmou que sua versão original não aplicava em banco vazio.
>
> **Inventário de dados antes da convergência:** [`docs/BAILEYS-DATA-INVENTORY.md`](./docs/BAILEYS-DATA-INVENTORY.md) documenta o backup, restore separado e o comando read-only que mede provider, instâncias, mensagens pendentes, settings legados e colisões de `instanceId` sem retornar secrets ou alterar registros. O ambiente de desenvolvimento inventariado tem 1 workspace e nenhuma entidade WhatsApp persistida.
>
> **Auditoria de IA/Admin:** [`AUDITORIA-IA-CONSOLE-ADMIN-E-CORE-2026-09-27.md`](./AUDITORIA-IA-CONSOLE-ADMIN-E-CORE-2026-09-27.md) registra capacidades, agentes, credenciais e redesign futuro; é referência da etapa 2, não do código ativo agora.
>
> **Roadmap do Console Admin de suporte:** [`docs/PLATFORM-ADMIN-SUPPORT-ROADMAP.md`](./docs/PLATFORM-ADMIN-SUPPORT-ROADMAP.md) filtra as decisões úteis da arquitetura conceitual: isolamento por workspace, sessões `read_only`/`operator`, auditoria e sequência de instâncias, Inbox, operação e diagnóstico. Ideias teóricas não comprovadas permanecem explicitamente fora do escopo atual.
>
> **Ambiente e integrações:** [`DEVELOPMENT-CONTEXT-AND-INTEGRATION-POLICY.md`](./DEVELOPMENT-CONTEXT-AND-INTEGRATION-POLICY.md) registra Docker/WSL/PowerShell, OCI como destino futuro, ausência de n8n, API REST empresarial fechada por padrão e preferência de commits/push por fatia.
>
> **Publicação/teste local:** [`LOCAL-DOCKER-TESTE.md`](./LOCAL-DOCKER-TESTE.md) documenta o comando PowerShell de reset do projeto, pull de imagens `dev` publicadas e inicialização sem build local.

## Começar pela continuidade

1. [`HANDOFF-CONTINUIDADE-FORTE-PANEL.md`](./HANDOFF-CONTINUIDADE-FORTE-PANEL.md) — histórico de execução, decisões e próximo passo.
2. [`todo.md`](./todo.md) — checklist vivo da implementação.
3. [`PLANO-INTERMEDIARIO-FORTE-PANEL.md`](./PLANO-INTERMEDIARIO-FORTE-PANEL.md) — sequência de blocos técnicos e riscos.
4. [`BETA-OPERATIONS-CHECKLIST.md`](./BETA-OPERATIONS-CHECKLIST.md) — manual consolidado de operação do beta, migrations, quotas e segurança.
5. [`STATUS-COMPLETO-E-PLANO-BETA.md`](./STATUS-COMPLETO-E-PLANO-BETA.md) — visão completa do que funciona, como funciona, plano do console admin e pendências antes do beta.
6. [`AUDITORIA-DOCUMENTACAO-E-ROADMAP-2026-09-26.md`](./AUDITORIA-DOCUMENTACAO-E-ROADMAP-2026-09-26.md) — auditoria de divergências e roadmap canônico por fases.
7. [`PLANO-AUDITORIA-E-EXECUCAO-2026-09-27.md`](./PLANO-AUDITORIA-E-EXECUCAO-2026-09-27.md) — plano priorizado P0–P3 para console, operação, QR, UX, produto, planos e LGPD.
8. [`AUDITORIA-FEEDBACK-E-HANDOFF-2026-09-27.md`](./AUDITORIA-FEEDBACK-E-HANDOFF-2026-09-27.md) — feedback da validação local, auditoria dos dois painéis, refatoração Baileys, IA global, Funil, profissional executor e recebimentos.
9. [`PLANO-CADASTRO-AUDIO-E-PAGAMENTOS-2026-09-27.md`](./PLANO-CADASTRO-AUDIO-E-PAGAMENTOS-2026-09-27.md) — auditoria de melhoria contínua, funil de cadastro com respostas em áudio e modelo de orçamento, chave Pix e registro manual de recebimentos.
10. [`GUIA-LEVANTAMENTO-ONBOARDING-ASSISTIDO-IA.md`](./GUIA-LEVANTAMENTO-ONBOARDING-ASSISTIDO-IA.md) — perguntas progressivas, entrada por áudio/texto, geração de prompt com confirmação e suporte administrativo auditado.
11. [`GUIA-CONVITES-E-PERMISSOES.md`](./GUIA-CONVITES-E-PERMISSOES.md) — convite de funcionários, RBAC/ABAC, matriz de visibilidade, escopos de Inbox e critérios de aceite.
12. [`GUIA-UX-CLAREZA-E-FACILIDADE.md`](./GUIA-UX-CLAREZA-E-FACILIDADE.md) — checklist de primeiro acesso, linguagem para leigos, estados vazios, ajuda contextual, previews e métricas de abandono.
13. [`CAPABILITY-MATRIX.md`](./CAPABILITY-MATRIX.md) — capacidade, código, evidência de teste e ambiente efetivamente validado.
14. [`LOCAL-DOCKER-TESTE.md`](./LOCAL-DOCKER-TESTE.md) — reset destrutivo opcional, inicialização Docker, migrations e testes PostgreSQL locais.

## Produto e tenancy

- [`PRODUCT_SCOPE.md`](./PRODUCT_SCOPE.md) — limites do produto, público e modelo multi-conta.
- [`ESTRATEGIA-PRODUTO-PUBLICO-MULTICONTA.md`](./ESTRATEGIA-PRODUTO-PUBLICO-MULTICONTA.md) — estratégia de produto público multi-tenant.
- [`FASE-1-SEGURANCA-CONTENCAO.md`](./FASE-1-SEGURANCA-CONTENCAO.md) — regras de contenção e segurança da primeira fase.
- [`AUDITORIA-TECNICA-E-ROADMAP.md`](./AUDITORIA-TECNICA-E-ROADMAP.md) — auditoria, prioridades e riscos técnicos.

> Para decisões atuais, use o roadmap datado acima. Os planos intermediários e handoffs continuam como histórico de execução e não substituem a fonte de verdade atual.

## API, agente e integrações

- [`API_CONTRACT.md`](./API_CONTRACT.md) — endpoints REST, payloads, idempotência, webhooks, quotas e erros.
- [`docs/BAILEYS-INTEGRATION.md`](./docs/BAILEYS-INTEGRATION.md) — contrato técnico ativo gateway ↔ Panel e ciclo tenant-scoped de instâncias.
- [`forte-whatsapp/README.md`](./forte-whatsapp/README.md) — operação e validação do gateway Baileys.
- [`CONFIGURACAO-MULTIMODEL-AGENTE.md`](./CONFIGURACAO-MULTIMODEL-AGENTE.md) — configuração multi-modelo do agente.
- [`AI_AGENT_PROMPT_FORTE_PANEL.md`](./AI_AGENT_PROMPT_FORTE_PANEL.md) — prompt operacional do agente.
- [`AI_AGENT_PROMPT_GABRIEL_FORTE_PANEL_COMPLETO.md`](./AI_AGENT_PROMPT_GABRIEL_FORTE_PANEL_COMPLETO.md) — prompt completo de referência.
- [`CONTINUATION_2026-09-24_IN_APP_NOTIFICATIONS.md`](./CONTINUATION_2026-09-24_IN_APP_NOTIFICATIONS.md) — contrato e histórico das notificações internas.
- [`CONTINUATION_2026-09-24_CATALOG_AND_ISOLATION.md`](./CONTINUATION_2026-09-24_CATALOG_AND_ISOLATION.md) — catálogo e isolamento.
- [`CONTINUATION_2026-09-24_PROFESSIONAL_PORTAL.md`](./CONTINUATION_2026-09-24_PROFESSIONAL_PORTAL.md) — portal profissional.
- [`CONTINUATION_2026-09-24_SCHEDULE_VALIDATION.md`](./CONTINUATION_2026-09-24_SCHEDULE_VALIDATION.md) — agenda, fuso e validações.

## Cadastro, onboarding e financeiro

- [`PLANO-CADASTRO-AUDIO-E-PAGAMENTOS-2026-09-27.md`](./PLANO-CADASTRO-AUDIO-E-PAGAMENTOS-2026-09-27.md) — funil de cadastro por áudio, checklist de onboarding, modelo de orçamento, chave Pix, registro manual de recebimentos e recibos.
- [`GUIA-LEVANTAMENTO-ONBOARDING-ASSISTIDO-IA.md`](./GUIA-LEVANTAMENTO-ONBOARDING-ASSISTIDO-IA.md) — guia operacional do núcleo obrigatório, perguntas condicionais, prompt rascunho/publicado, revisão do prestador e suporte do administrador.

## Infraestrutura e desenvolvimento

- [`infra/LOCAL_TEST.md`](./infra/LOCAL_TEST.md) — comandos de execução/teste local.
- [`infra/VPS_STACK.md`](./infra/VPS_STACK.md) — stack de VPS e produção.
- [`ATUALIZACAO-STACK-DESENVOLVIMENTO.md`](./ATUALIZACAO-STACK-DESENVOLVIMENTO.md) — atualização da stack.

## Regras de manutenção documental

Ao concluir um bloco técnico:

1. atualizar `todo.md`;
2. anexar um registro datado ao handoff;
3. atualizar o plano intermediário;
4. atualizar `API_CONTRACT.md` se houver mudança de contrato;
5. atualizar este índice se surgir documentação nova;
6. registrar validações reais e o que continua dependente de PostgreSQL;
7. publicar o commit apenas após `pnpm check`, `pnpm test`, `pnpm build` e `git diff --check`.

## Estado atual resumido

- Tenancy explícito nas superfícies CRM, Inbox, onboarding, agente, Baileys, idempotência, eventos e auditoria.
- Segredos de IA e webhook criptografados em repouso e mascarados nas respostas.
- Quotas por workspace e usuário com janela de um minuto.
- Painel de consumo em Integrações.
- Worker protegido para IA e outbound.
- Alertas in-app de 70% e 90% para gestores.
- Retenção de buckets, readiness `/api/v1/ready` e heartbeat JSON do worker.
- Validação PostgreSQL no CI aprovada com migrations limpas e nenhuma suíte ignorada; staging real ainda pendente.
- Console interno de plataforma possui código, migration, UI e cobertura de autorização, sessões, mutações, auditoria e saúde; staging real ainda pendente.
- Configuração da IA possui rascunho, simulação local, publicação, histórico e rollback; validação visual/staging e fallback explícito continuam pendentes.
- Auditoria de 27/09 encontrou `/kanban` sem rota, retorno administrativo inadequado, dead-end de workspace suspenso, divergência entre mensagens/contatos/unread/stages, QR abaixo da primeira dobra mobile, billing ainda com caminho demo e ausência de modelo SaaS/LGPD; o bloco P0 foi executado, mas os gates de staging continuam antes de novos convites.
- A auditoria de melhoria contínua de 27/09 acrescentou 26 achados novos; signup inicial, convites, recuperação, limite/origem, onboarding textual owner/admin e governança de fontes já avançaram. O funil de áudio agora possui migration, upload privado, `voice.transcribe` tenant-aware, UI MediaRecorder com preview/retry, worker diário de retenção, proposta estruturada em draft, perguntas de acompanhamento para missing/conflicts, telemetria e publicação versionada com rollback; falta validação PostgreSQL/staging antes do beta. O mesmo documento planeja o financeiro operacional completo (itens, plano de pagamento, meios, ledger, recibo e conciliação).
