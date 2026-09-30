

## 42. O7.11 — Hardening HTTP, sessão e webhook — 2026-09-30

A primeira fatia de hardening aplica headers globais de segurança no Express, HSTS somente sob HTTPS, comparação constant-time do bearer no gateway e cobertura explícita da política de origem/CSRF e rate limits existentes. Não foram declarados concluídos rotação/revogação de secrets, rate limit distribuído, browser smoke, staging ou revisão legal.

Validação local: headers 2 testes, request security 9 testes e contrato HTTP do gateway 16 testes passaram; typecheck do Panel e gateway passaram; `git diff --check` passou.

**Próximo passo:** O7.12 — runbook, restore e compensação de storage.
