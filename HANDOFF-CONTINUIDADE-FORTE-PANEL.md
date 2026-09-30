

## 40. O7.9 — Idempotência outbound fim a fim — 2026-09-30

A próxima fatia de hardening implementa um ledger durável por instância no gateway Baileys. O `Idempotency-Key` agora é obrigatório nos endpoints autenticados de envio. Uma chave concluída reaproveita o mesmo `externalId` sem chamar o socket; payload diferente retorna conflito; resultado externo inconclusivo permanece `started` e falha fechado após restart, evitando reenvio automático potencialmente duplicado.

A validação desta fatia deve ser feita primeiro no Sandbox: testes do ledger, contrato HTTP, typecheck e build. Ficam deliberadamente adiados para a etapa final os testes que exigem a máquina do usuário: restart real do container com timeout após aceitação do provedor, sessão WhatsApp física, Docker com volume existente, staging persistente, browser autenticado e restore completo.

**Estado:** concluída em código e testes locais.
**Validação:** gateway `79 testes`, Panel `271 aprovados / 55 skipped`, typechecks do gateway/Panel e build do gateway passaram. Os skips dependentes de PostgreSQL/staging permanecem deliberadamente para a etapa final.
**Próximo passo:** O7.10 — tornar o inbound transacional e idempotente sem duplicar contato, conversa, mensagem ou unread em retry/crash.
