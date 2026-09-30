

## 43. O7.12 — Restore seguro e runbook operacional — 2026-09-30

O script `scripts/backup-restore.sh` passou a verificar manifesto, dump PostgreSQL, tar de sessão e hashes antes de executar qualquer ação destrutiva. O restore rejeita o diretório de sessão ativo, exige destino separado e confirmação explícita. Backup sem diretório de sessão agora gera tar gzip vazio válido. O runbook mínimo de backup, verify, restore, readiness, tenant, mídia, DLQ e rollback foi documentado.

Validação local: `scripts/backup-restore.test.ts` passou com 3 testes; `bash -n scripts/backup-restore.sh` passou; `git diff --check` passou. Restore real, backup off-host, mídia/Redis/sessão em ambiente limpo, RPO/RTO e rollback por digest continuam gates externos.

**Próximo passo:** O7.13 — restore rehearsal e compensação de blobs órfãos.
