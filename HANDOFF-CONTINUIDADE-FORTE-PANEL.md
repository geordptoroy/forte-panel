

## 18. Roadmap filtrado do Console Admin e próximo smoke test — 2026-09-29

O usuário confirmou que o login do Console Admin agora abre `/platform-admin`. A causa do redirecionamento indevido foi corrigida em `d6d0494`: `CORE_ONLY_MODE` estava redirecionando toda rota não permitida para `/whatsapp-connection`, incluindo as rotas administrativas. O Console Admin foi incluído no allowlist e o typecheck, teste de rotas e build passaram.

A partir da arquitetura conceitual fornecida pelo usuário, foi criado `docs/PLATFORM-ADMIN-SUPPORT-ROADMAP.md`. Foram incorporadas somente decisões aplicáveis ao código atual: workspace como fronteira absoluta, sessão de suporte explícita, modos `read_only` e `operator`, auditoria de mutações, reaproveitamento dos contratos Baileys/Inbox existentes e Baileys como provider único. MRR, billing completo, 2FA, tracing distribuído, espelhamento automático completo, replay externo e revelação de credenciais ficaram como backlog, não como capacidade disponível.

A próxima fatia de produto é o Console Admin de suporte: primeiro detalhe de workspace e instâncias Baileys; depois Inbox escopada ao workspace selecionado; por fim contatos, agenda, funil e diagnóstico. O cabeçalho deve mostrar workspace, modo e expiração da sessão. Nenhuma consulta ou mutação administrativa deve operar apenas por contexto implícito.

O smoke test real ficou pausado até a publicação da correção documental/administrativa e será retomado depois da validação da imagem `dev`. O roteiro é: health/readiness, estado da instância `dev-smoke`, recebimento de texto, envio para o segundo número de teste `553899034689`, confirmação na Inbox, outbox zerada e conferência do workspace/instância responsáveis. Não apagar volumes, sessões ou banco local durante esse teste.


## 19. Primeira fatia do Console Admin de suporte publicada — 2026-09-29

O commit `6937a2a` adicionou ao resumo do detalhe de workspace o card **Instâncias WhatsApp**. Ele consome o payload já tenant-scoped de `getPlatformWorkspaceDetail`, que usa `listBaileysInstances(workspaceId)`, e mostra somente nome, `instanceId`, status e data de atualização. Nenhuma credencial ou sessão do gateway é exposta. A alteração foi validada com typecheck, 44 arquivos de teste aprovados (204 testes aprovados, 47 skipped), build e push para `main`.

O workflow de publicação `Publish Forte Panel image` foi disparado para o SHA `6937a2a`; o sandbox não possui Docker local para executar o smoke test do número pareado. O próximo passo de código continua sendo a Inbox de suporte com fachada administrativa, sempre exigindo `workspaceId` e `supportSessionId`; não reutilizar diretamente o contexto `/inbox` do cliente, pois ele pode resolver o tenant do usuário logado.
