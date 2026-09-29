

## 18. Roadmap filtrado do Console Admin e próximo smoke test — 2026-09-29

O usuário confirmou que o login do Console Admin agora abre `/platform-admin`. A causa do redirecionamento indevido foi corrigida em `d6d0494`: `CORE_ONLY_MODE` estava redirecionando toda rota não permitida para `/whatsapp-connection`, incluindo as rotas administrativas. O Console Admin foi incluído no allowlist e o typecheck, teste de rotas e build passaram.

A partir da arquitetura conceitual fornecida pelo usuário, foi criado `docs/PLATFORM-ADMIN-SUPPORT-ROADMAP.md`. Foram incorporadas somente decisões aplicáveis ao código atual: workspace como fronteira absoluta, sessão de suporte explícita, modos `read_only` e `operator`, auditoria de mutações, reaproveitamento dos contratos Baileys/Inbox existentes e Baileys como provider único. MRR, billing completo, 2FA, tracing distribuído, espelhamento automático completo, replay externo e revelação de credenciais ficaram como backlog, não como capacidade disponível.

A próxima fatia de produto é o Console Admin de suporte: primeiro detalhe de workspace e instâncias Baileys; depois Inbox escopada ao workspace selecionado; por fim contatos, agenda, funil e diagnóstico. O cabeçalho deve mostrar workspace, modo e expiração da sessão. Nenhuma consulta ou mutação administrativa deve operar apenas por contexto implícito.

O smoke test real ficou pausado até a publicação da correção documental/administrativa e será retomado depois da validação da imagem `dev`. O roteiro é: health/readiness, estado da instância `dev-smoke`, recebimento de texto, envio para o segundo número de teste `553899034689`, confirmação na Inbox, outbox zerada e conferência do workspace/instância responsáveis. Não apagar volumes, sessões ou banco local durante esse teste.
