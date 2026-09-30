# Forte Panel — índice de documentação

Este arquivo organiza a documentação do projeto e aponta qual documento consultar em cada decisão.

> **Fonte única de verdade consolidada (2026-09-29):** consulte [`FORTE-PANEL-FONTE-DE-VERDADE.md`](./FORTE-PANEL-FONTE-DE-VERDADE.md) primeiro. Ele consolida produto, arquitetura, Console Admin, IA, prompt canônico, UX, auditoria documental e roadmap. Os documentos abaixo são referências especialistas ou registros históricos; quando houver conflito, a fonte única de verdade e o código atual prevalecem.

> **Fila de execução ativa:** consulte [`ROADMAP-EXECUCAO-FORTE-PANEL.md`](./ROADMAP-EXECUCAO-FORTE-PANEL.md). Cada mensagem `próximo` executa a primeira fatia pendente, atualiza o estado, registra validações e publica um commit no Git.
> Para cada fatia concluída, preservar branch/PR de revisão; não mesclar automaticamente.

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

0. [`FORTE-PANEL-FONTE-DE-VERDADE.md`](./FORTE-PANEL-FONTE-DE-VERDADE.md) — decisão consolidada e roadmap único.

1. [`ROADMAP-EXECUCAO-FORTE-PANEL.md`](./ROADMAP-EXECUCAO-FORTE-PANEL.md) — fila operacional por fatias e estado a atualizar a cada `próximo`.
2. [`AUDITORIA-SUPERFICIES-RELEASE-2026-09-29.md`](./AUDITORIA-SUPERFICIES-RELEASE-2026-09-29.md) — matriz atual de rotas, dados demo, simulações e prontidão pública.
3. [`HANDOFF-CONTINUIDADE-FORTE-PANEL.md`](./HANDOFF-CONTINUIDADE-FORTE-PANEL.md) — histórico de execução, decisões e próximo passo.
4. [`HANDOFF-PROXIMO-CHAT-IA.md`](./HANDOFF-PROXIMO-CHAT-IA.md) — contexto operacional e instruções para O3.4.
5. [`O1.1-ENTREGA-ONBOARDING-WIZARD.md`](./O1.1-ENTREGA-ONBOARDING-WIZARD.md) — decisões e critérios da entrega do wizard de seis passos.
6. [`O1.2-ENTREGA-CATALOGO-OPERACIONAL.md`](./O1.2-ENTREGA-CATALOGO-OPERACIONAL.md) — catálogo, modos de preço, disponibilidade, segurança, migration e validação.
7. [`O1.3-ENTREGA-REGRAS-E-REVISAO-EXEMPLOS.md`](./O1.3-ENTREGA-REGRAS-E-REVISAO-EXEMPLOS.md) — simulação, revisão humana, gate de publicação e validação.
8. [`O1.4-O2.4-ENTREGA-ONBOARDING-WHATSAPP.md`](./O1.4-O2.4-ENTREGA-ONBOARDING-WHATSAPP.md) — retomada, confiabilidade Baileys, recibos e anexos privados; [`O3.1-ENTREGA-LEAD-UNIFICADO.md`](./O3.1-ENTREGA-LEAD-UNIFICADO.md) — Lead/Opportunity; [`O3.2-ENTREGA-INBOX-OPERACIONAL.md`](./O3.2-ENTREGA-INBOX-OPERACIONAL.md) — assignment e próxima ação. [`O3.3-ENTREGA-FUNIL-CANONICO.md`](./O3.3-ENTREGA-FUNIL-CANONICO.md) — estágio canônico e histórico; [`O3.4-ENTREGA-ORCAMENTOS-APROVACAO.md`](./O3.4-ENTREGA-ORCAMENTOS-APROVACAO.md) — itens, validade, aprovação e recebimento manual; [`O3.5-ENTREGA-AGENDA-CONFLITOS-STATUS.md`](./O3.5-ENTREGA-AGENDA-CONFLITOS-STATUS.md) — conflito, profissional, status e reagendamento.
9. [`todo.md`](./todo.md) — checklist vivo da implementação.
10. [`PLANO-INTERMEDIARIO-FORTE-PANEL.md`](./PLANO-INTERMEDIARIO-FORTE-PANEL.md) — sequência de blocos técnicos e riscos.
11. [`BETA-OPERATIONS-CHECKLIST.md`](./BETA-OPERATIONS-CHECKLIST.md) — manual histórico de operação, migrations, quotas e segurança.
12. [`STATUS-COMPLETO-E-PLANO-BETA.md`](./STATUS-COMPLETO-E-PLANO-BETA.md) — visão histórica do que funciona e pendências.
13. [`AUDITORIA-DOCUMENTACAO-E-ROADMAP-2026-09-26.md`](./AUDITORIA-DOCUMENTACAO-E-ROADMAP-2026-09-26.md) — auditoria de divergências e roadmap histórico.
14. [`PLANO-AUDITORIA-E-EXECUCAO-2026-09-27.md`](./PLANO-AUDITORIA-E-EXECUCAO-2026-09-27.md) — plano histórico P0–P3.
15. [`AUDITORIA-FEEDBACK-E-HANDOFF-2026-09-27.md`](./AUDITORIA-FEEDBACK-E-HANDOFF-2026-09-27.md) — auditoria e decisões históricas.
16. [`PLANO-CADASTRO-AUDIO-E-PAGAMENTOS-2026-09-27.md`](./PLANO-CADASTRO-AUDIO-E-PAGAMENTOS-2026-09-27.md) — referência especialista de onboarding e financeiro.
17. [`GUIA-LEVANTAMENTO-ONBOARDING-ASSISTIDO-IA.md`](./GUIA-LEVANTAMENTO-ONBOARDING-ASSISTIDO-IA.md) — referência especialista de onboarding.
18. [`GUIA-CONVITES-E-PERMISSOES.md`](./GUIA-CONVITES-E-PERMISSOES.md) — referência especialista de RBAC/ABAC.
19. [`GUIA-UX-CLAREZA-E-FACILIDADE.md`](./GUIA-UX-CLAREZA-E-FACILIDADE.md) — referência especialista de UX.
20. [`CAPABILITY-MATRIX.md`](./CAPABILITY-MATRIX.md) — capacidade, código, evidência e ambiente validado.
21. [`LOCAL-DOCKER-TESTE.md`](./LOCAL-DOCKER-TESTE.md) — reset opcional, Docker, migrations e PostgreSQL local.

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
8. [`O1.4-O2.4-ENTREGA-ONBOARDING-WHATSAPP.md`](./O1.4-O2.4-ENTREGA-ONBOARDING-WHATSAPP.md) — retomada, confiabilidade Baileys, recibos e anexos privados; [`O3.1-ENTREGA-LEAD-UNIFICADO.md`](./O3.1-ENTREGA-LEAD-UNIFICADO.md) — Lead/Opportunity; [`O3.2-ENTREGA-INBOX-OPERACIONAL.md`](./O3.2-ENTREGA-INBOX-OPERACIONAL.md) — assignment e próxima ação; [`O3.3-ENTREGA-FUNIL-CANONICO.md`](./O3.3-ENTREGA-FUNIL-CANONICO.md) — estágio canônico e histórico.
