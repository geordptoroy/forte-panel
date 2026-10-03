# Forte Panel — índice de documentação

**Atualizado:** 2026-10-03. Este índice substitui as instruções antigas sobre branches, tags e próximos passos.

## Leia primeiro — autoridade atual

1. [`AGENTS.md`](./AGENTS.md) — regras permanentes para agentes e colaboradores.
2. [`docs/STATUS-ATUAL.md`](./docs/STATUS-ATUAL.md) — estado da candidata, decisões, gates e próxima ação.
3. [`docs/WORKFLOW-DESENVOLVIMENTO-E-RELEASE.md`](./docs/WORKFLOW-DESENVOLVIMENTO-E-RELEASE.md) — fluxo único baseado em `main`, publicação GHCR `latest` e script local.
4. [`PRODUCT_SCOPE.md`](./PRODUCT_SCOPE.md) — escopo do produto; o único canal WhatsApp é Baileys.
5. [`API_CONTRACT.md`](./API_CONTRACT.md) — contratos REST e do gateway.

Em caso de conflito, seguir esta ordem e confirmar o estado atual do Git. Os ficheiros antigos com o banner **DOCUMENTO HISTÓRICO** são registos datados; não executar neles branches, comandos, tags ou tarefas pendentes.

## WhatsApp — implementação ativa

- [`docs/BAILEYS-INTEGRATION.md`](./docs/BAILEYS-INTEGRATION.md) — contrato técnico entre Panel e gateway Baileys.
- [`forte-whatsapp/README.md`](./forte-whatsapp/README.md) — execução, pairing e testes do gateway.
- [`FORTE-MEDIA-PROVIDERS.md`](./FORTE-MEDIA-PROVIDERS.md) — arquitetura operacional Baileys-only.

## Engenharia e histórico técnico

- [`MIGRACAO-PAPI-BAILEYS.md`](./MIGRACAO-PAPI-BAILEYS.md) — **referência de engenharia apenas**: histórico da remoção de código legado; não define providers do produto.
- [`docs/AUDITORIA-API-OPERACIONAL-PAPI-1.5.1.md`](./docs/AUDITORIA-API-OPERACIONAL-PAPI-1.5.1.md) e [`docs/AUDITORIA-REVERSA-PAPI-1.5.1-PARA-FORTE.md`](./docs/AUDITORIA-REVERSA-PAPI-1.5.1-PARA-FORTE.md) — análise técnica de comportamento upstream, sem dependência ou integração no produto.
- [`docs/AUDITORIA-BAILEYS-INTERACTIVE-AUDIO.md`](./docs/AUDITORIA-BAILEYS-INTERACTIVE-AUDIO.md), [`docs/MATRIZ-COBERTURA-INBOX-EVENTOS.md`](./docs/MATRIZ-COBERTURA-INBOX-EVENTOS.md) e [`docs/PLANO-CORRECAO-INBOX-BAILEYS.md`](./docs/PLANO-CORRECAO-INBOX-BAILEYS.md) — auditorias e plano técnico da Inbox.
- [`docs/AUDITORIA-UNIFICACAO-REPOSITORIO-E-PRONTIDAO-PUBLICA.md`](./docs/AUDITORIA-UNIFICACAO-REPOSITORIO-E-PRONTIDAO-PUBLICA.md) — comparação das histórias Git, decisão sobre PR #3 e prontidão.

## Operação e beta

- [`docs/AUDITORIA-BETA-COMPLETA-2026-10-03.md`](./docs/AUDITORIA-BETA-COMPLETA-2026-10-03.md) — auditoria estática completa da candidata, com 94 achados e evidência por domínio.
- [`docs/PLANO-REMEDIACAO-BETA.md`](./docs/PLANO-REMEDIACAO-BETA.md) — sequência de correções, critérios de aceitação e gates para beta segura.
- [`BETA-OPERATIONS-CHECKLIST.md`](./BETA-OPERATIONS-CHECKLIST.md) — checklist a rever contra o estado atual antes de qualquer beta.
- [`docs/AUDITORIA-COMPLETA-INBOX-BAILEYS.md`](./docs/AUDITORIA-COMPLETA-INBOX-BAILEYS.md) — evidências, limites e testes da auditoria da Inbox.

Não existem providers selecionáveis além do canal Baileys. Referências técnicas antigas ficam limitadas aos documentos de engenharia acima e às migrations históricas necessárias para upgrades seguros; não adicionar credenciais, variáveis, adapters ou UI para outros canais.
