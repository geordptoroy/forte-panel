

## 41. O7.10 — Inbound transacional e retry sem duplicação — 2026-09-30

A ingestão inbound agora executa em uma transação PostgreSQL única. A transação cobre deduplicação por `externalId`, grupo/participante, contato, conversa, lead/oportunidade, mensagem, evento `message.received`, unread, controle humano e timestamps. O helper de lead recebeu o executor da transação para não abrir uma segunda conexão no caminho inbound.

Validação local: `pnpm test` passou com 271 testes e 55 skips dependentes de PostgreSQL/staging; os testes focados de webhook passaram com 14 testes e 8 skips; `pnpm check` e `git diff --check` passaram. Mídia continua sendo persistida antes da transação por usar storage externo; compensação de blobs órfãos, crash real, restore e staging permanecem gates externos.

**Próximo passo:** O7.11 — hardening de sessão, webhook, headers, CSRF e rate limit.
