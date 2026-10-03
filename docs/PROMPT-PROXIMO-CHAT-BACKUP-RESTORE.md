# Handoff — próximo chat de IA

## Objetivo imediato

Continuar a remediação do Forte Panel a partir do **rehearsal completo de backup/restore**, depois de o staging local Docker ter passado os testes funcionais de conta, instância Baileys, readiness e persistência de sessão.

Não declarar a beta pública pronta. O próximo resultado deve ser uma evidência redigida, reproduzível e fail-closed de:

1. backup da base PostgreSQL;
2. backup da sessão Baileys;
3. fingerprint da `WHATSAPP_SESSION_ENCRYPTION_KEY` sem revelar a chave;
4. restore numa base/volume isolado;
5. validação de hashes e inventário de blobs/media;
6. medição de RPO/RTO;
7. comportamento correcto quando a chave não corresponde;
8. retenção em dry-run, sem apagar dados;
9. limitações explícitas do adapter Forge/S3 actual.

## Estado exacto

- Repositório: `geordptoroy/forte-panel`
- Branch: `integration/beta-candidate-2026-10-02`
- HEAD actual: `690b68a352182a3199f3154d379a40cba4a1aa7c`
- Último commit: `docs: record functional local staging evidence`
- `origin/main` continua sem promoção; não fazer merge, force-push ou promoção automática.
- A documentação canónica é [`docs/STATUS-ATUAL.md`](./STATUS-ATUAL.md).
- O plano é [`docs/PLANO-REMEDIACAO-BETA.md`](./PLANO-REMEDIACAO-BETA.md).
- Regras permanentes: [`AGENTS.md`](../AGENTS.md) e [`docs/WORKFLOW-DESENVOLVIMENTO-E-RELEASE.md`](./WORKFLOW-DESENVOLVIMENTO-E-RELEASE.md).

Antes de editar, confirmar:

```bash
git remote -v
git branch --show-current
git status --short --branch
git rev-parse HEAD
git rev-parse origin/main
```

## Evidência de staging já obtida

O utilizador executou o staging no próprio PC com as imagens publicadas:

```text
ghcr.io/geordptoroy/forte-panel:sha-06cc98e
ghcr.io/geordptoroy/forte-whatsapp:sha-06cc98e
```

Digests observados:

```text
Panel:   sha256:e8534f713f28c33930471f828d16813df60180b2f4ae75dbb1bd6249bb82e99b
Gateway: sha256:968c2241b0b71bd069a0aea9912619822c9869cf9240eb807cad8355088f928b
```

Resultados:

- Panel, worker e Gateway ficaram `Up`;
- PostgreSQL e Redis ficaram `healthy`;
- migrations terminaram com `Exited (0)`;
- Panel health: `HTTP 200`;
- Gateway health: `HTTP 200`;
- sem sessão: readiness `HTTP 503`, esperado;
- depois de criar uma conta/workspace e conectar uma instância Baileys: readiness `HTTP 200`;
- depois de reiniciar apenas o Gateway: readiness continuou `HTTP 200`;
- Gateway final: `running`, `restart_count=0`, `exit_code=0`;
- endpoint legado `/api/v1/webhooks/inbound/whatsapp`: `404`;
- webhook Baileys sem credencial: `401`;
- não houve build local, pairing adicional, WhatsApp de produção ou remoção de volumes de outros projectos.

Nota importante: as imagens GHCR foram construídas a partir do commit de código `06cc98e5ffeb5e6c1ca9c40e58cced8983488bfa`. O checkout `63c7bba` acrescentou o mapeamento da chave no `docker-compose.local.yml`; a imagem não precisou de rebuild porque a alteração foi apenas de Compose local. Não confundir o SHA do checkout com o SHA do conteúdo das imagens.

## Trabalho já implementado

- Baileys é o único provider suportado; não reintroduzir PAPI, Meta ou providers genéricos.
- Isolamento multi-tenant, guards de ownership, SSRF, fencing de idempotência e support sessions foram endurecidos.
- Limites globais e por rota de body/media, autenticação pré-parse do webhook e rate limits foram implementados.
- Endpoint genérico inbound foi encerrado com `404`.
- Gateway usa AES-256-GCM obrigatório em produção via `WHATSAPP_SESSION_ENCRYPTION_KEY`.
- Readiness verifica DB, worker e Gateway conectado; health é separado de readiness.
- Shutdown gracioso, healthchecks Compose e worker heartbeat foram implementados.
- `scripts/backup-restore.sh` exige a chave, guarda apenas fingerprint SHA-256 e falha fechado em mismatch.
- `scripts/backup-restore.sh retention` é dry-run e não apaga ficheiros.
- `pnpm verify:media-backup INVENTORY.json` exige conteúdo exportado e prova de restore com hashes reais para declarar `restore_proven`; com o adapter Forge actual, `inventory_only` é resultado não-zero.
- Transporte opcional de observabilidade externa foi implementado, mas ainda falta ligar sink autorizado e provar alertas/deduplicação.

## Ficheiros prioritários

Ler primeiro:

- `scripts/backup-restore.sh`
- `scripts/prepare-restore-rehearsal.ts`
- `scripts/run-restore-rehearsal-preflight.ts`
- `scripts/media-backup-evidence.ts`
- `docs/O6-PROVA-PERSISTENTE-RUNBOOK.md`
- `docs/TESTE-LOCAL-RESET-E-IMAGEM-PINADA.md`
- `docs/STATUS-ATUAL.md`
- `docs/PLANO-REMEDIACAO-BETA.md`

Depois localizar os testes associados:

```bash
rg -n -S 'backup|restore|rehearsal|retention|media-backup|RPO|RTO|inventory_only|restore_proven' scripts docs server --glob '*.ts' --glob '*.sh' --glob '*.md'
```

## Regras do próximo chat

- Não usar Supabase.
- Usar apenas PostgreSQL local/descartável ou ambiente Docker explicitamente autorizado.
- Não usar WhatsApp real de produção.
- Não criar mensagens/contactos/media fictícios na instância real.
- Não apagar volumes sem autorização explícita.
- Não executar `docker system prune`, `docker volume prune` ou `docker container prune`.
- Não fazer build local apenas para o rehearsal se as imagens publicadas bastarem.
- Não alterar `main`, não fazer merge e não publicar `latest`.
- Não revelar segredos, `.env`, tokens, passwords, chaves AES, cookies, QR ou números.
- Não declarar restore bem-sucedido com base apenas em inventário/presigned URLs.
- Se o Forge/S3 só fornecer presign e não exportar conteúdo, declarar `inventory_only` e manter o gate fechado.
- Qualquer operação destrutiva deve ter preflight, alvo isolado e confirmação explícita; preferir dry-run.

## Critérios de aceitação

O rehearsal só pode ser marcado como verde se houver evidência de:

- backup criado com manifesto e fingerprint da chave;
- restore da DB numa base isolada;
- restore da sessão num volume/diretório isolado;
- aplicação arrancando com a chave correcta;
- mismatch de chave recusado antes de alterar dados;
- hashes reais de media comparados antes/depois, ou resultado explicitamente `inventory_only` não-verde;
- RPO/RTO medidos e documentados;
- retenção verificada em dry-run sem apagar nada;
- logs redigidos;
- SHA/digest do artefacto registado.

Executar os testes existentes antes de criar novos. Se for necessário alterar código, fazer mudança pequena, adicionar regressão, executar `pnpm check`, testes focados e actualizar o estado canónico.

## Resultado esperado do próximo chat

Actualizar `docs/STATUS-ATUAL.md` e `docs/PLANO-REMEDIACAO-BETA.md` com:

- comando/ambiente usado;
- SHA e digest;
- artefactos criados sem segredos;
- RPO/RTO;
- resultado de DB/sessão/blobs;
- resultado da chave errada;
- retenção;
- limitações;
- próxima única acção.

Se o ambiente não tiver Docker, storage off-host ou credenciais autorizadas, não simular o rehearsal: executar apenas o preflight local e registar o bloqueio real.
