

## 45. O7.14 — Contrato de provider de storage — 2026-09-30

Foi criada a interface `WorkspaceMediaStore` com listagem paginada e delete condicionado por `ifMatch`/etag. O reconciliador percorre páginas, usa a política O7.13 e mantém `dryRun` como padrão. Mesmo em modo destrutivo explícito, objetos sem etag são preservados.

O adapter Forge configurado no projeto só oferece presign de PUT/GET; listagem e delete reais não foram inventados nem ativados. Validação local: reconciliação base 2 testes, provider 2 testes, `pnpm check` e `git diff --check` passaram.

**Próximo passo:** O7.15 — métricas, auditoria e ensaio do provider.
