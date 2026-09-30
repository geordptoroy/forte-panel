# Forte Panel — Restore rehearsal plan

**Data:** 2026-09-30  
**Estado:** plano preparado; gate offline automatizado adicionado no O7.25; nenhuma restauração real foi executada.  
**Escopo:** PostgreSQL, mídia/blob, Redis, sessão Baileys, chaves, readiness, tenancy e rollback.

## 1. Objetivo e regra de segurança

Validar que um backup do Forte Panel pode ser restaurado em um ambiente limpo, isolado e sem tráfego de produção, preservando a capacidade de operar um workspace sem reutilizar uma sessão Baileys ativa ou expor segredos.

Este ensaio **não** deve ser executado contra:

- o PostgreSQL de produção;
- o volume ativo `forte_whatsapp_sessions`;
- o número WhatsApp atualmente pareado;
- buckets de mídia de produção sem uma cópia/namespace de ensaio;
- Redis compartilhado com workers ativos.

Toda URL, senha, token, chave de criptografia e identificador real deve ser fornecido apenas por secret manager ou variável local protegida. Os comandos abaixo usam placeholders intencionais.

## 2. Escopo de recuperação

| Componente | Fonte do backup | Alvo do ensaio | Critério mínimo |
|---|---|---|---|
| PostgreSQL | `postgres-*.dump` + manifesto | Banco vazio e isolado | `pg_restore` concluído; migrations/health/tenancy válidos |
| Mídia/blob | Inventário + cópia versionada do provider | Bucket/prefixo de ensaio | URLs privadas e objetos referenciados abrem; nenhum cross-tenant |
| Redis | Snapshot/export ou reconstrução documentada | Redis isolado | Filas/leases transitórios reconstruídos sem duplicar efeitos |
| Sessão Baileys | `whatsapp-sessions-*.tar.gz` + hash | `RESTORE_SESSION_DIR` novo | Gateway inicia sem usar sessão ativa; readiness coerente |
| Chaves | Secret manager/backup criptografado | Secrets de ensaio correspondentes | Descriptografia de dados restaurados validada sem imprimir segredo |
| Configuração | Manifesto, digest de imagens e `.env` redigido | Compose/staging descartável | Imagens imutáveis e `CORE_ONLY_MODE=true` |

**Importante:** o script atual `scripts/backup-restore.sh` cobre estruturalmente PostgreSQL e sessão Baileys. Mídia, Redis e chaves ainda precisam de adapter/exportação operacional antes de o ensaio completo ser considerado aprovado.

## 3. Pré-condições

1. Criar ambiente limpo e isolado, com PostgreSQL, Redis, Panel, worker e gateway em rede própria.
2. Parar tráfego de entrada e saída do ensaio; nenhum webhook deve apontar para produção.
3. Fixar os digests das imagens do Panel e gateway; registrar os digests no relatório.
4. Obter backup completo e manifesto de uma janela conhecida.
5. Obter inventário de mídia referenciada por workspace e a cópia dos blobs no mesmo ponto de recuperação.
6. Definir RPO alvo, RTO alvo e o identificador do ensaio (`RESTORE_REHEARSAL_ID`).
7. Confirmar que `CORE_ONLY_MODE=true`, IA/outbound não essenciais desativados e números reais não serão pareados durante a primeira rodada.
8. Criar banco, Redis, bucket/prefixo e diretório de sessão exclusivos para o ensaio.

## 4. Execução controlada

### 4.1 Verificação offline do pacote

Executar no host de ensaio, sem apontar para o banco de produção. Defina o diretório e valide primeiro o contrato completo, que exige também o inventário de mídia:

```bash
export BACKUP_DIR=/secure/restore-rehearsal/<RESTORE_REHEARSAL_ID>
pnpm verify:restore-rehearsal "$BACKUP_DIR"
```

Depois execute a verificação estrutural legada:

```bash
./scripts/backup-restore.sh verify "$BACKUP_DIR"
```

Registrar:

- nome do manifesto;
- hashes declarados e hashes calculados;
- tamanho dos artefatos;
- horário UTC de criação;
- resultado de `pg_restore --list` e `tar -tzf`.

Se qualquer hash, arquivo ou estrutura divergir, **parar**. Não executar restore parcial.

O gate offline falha deliberadamente quando o manifesto não contém `media_inventory_file` e `media_inventory_sha256`; banco e sessão sozinhos não constituem um rehearsal completo.

Após a validação offline e a execução controlada, gerar o relatório redigido:

```bash
pnpm report:restore-rehearsal "$BACKUP_DIR/evidence.json" "$BACKUP_DIR/report.json"
```

O relatório só pode resultar em `approved` quando todos os componentes passam, readiness existe, RPO/RTO estão dentro dos alvos, não houve tráfego de produção e rollback foi demonstrado. Qualquer falha resulta em `blocked`; qualquer evidência ausente ou `unknown` resulta em `inconclusive`. Não existe aprovação parcial.

Antes do restore destrutivo e antes de abrir qualquer tráfego, validar o isolamento:

```bash
pnpm check:restore-rehearsal-isolation "$BACKUP_DIR/evidence.json"
```

Esse gate exige `CORE_ONLY_MODE=true`, tráfego bloqueado, outbound desativado, endpoints fora dos hosts de produção, sessão restaurada em diretório separado, rollback preparado e readiness aprovada.

Para executar os gates em uma única ordem, usar o preflight:

```bash
pnpm preflight:restore-rehearsal "$BACKUP_DIR" "$BACKUP_DIR/evidence.json" "$BACKUP_DIR/preflight.json"
```

O preflight verifica o pacote primeiro, depois o isolamento e por fim gera a decisão/relatório. Se o pacote falhar, nenhum passo posterior é executado. Se isolamento ou relatório não forem aprovados, o processo termina com código diferente de zero e o restore não deve começar.

### 4.2 Preparação do banco

Usar um `DATABASE_URL` novo, com usuário e banco exclusivos:

```bash
export DATABASE_URL='postgresql://<RESTORE_DB_USER>:<RESTORE_DB_PASSWORD>@<RESTORE_DB_HOST>:5432/<RESTORE_DB_NAME>'
export PGPASSWORD='<RESTORE_DB_PASSWORD>'
```

Aplicar o restore somente depois de confirmar que o alvo está vazio ou explicitamente descartável. Registrar duração do `pg_restore`; não copiar a URL para logs, tickets ou screenshots.

### 4.3 Restore da sessão Baileys em diretório separado

```bash
export WHATSAPP_SESSION_DIR=/app/sessions-active
export RESTORE_SESSION_DIR=/restore-data/<RESTORE_REHEARSAL_ID>/sessions
export CONFIRM_RESTORE=YES
./scripts/backup-restore.sh restore "$BACKUP_DIR"
```

O destino deve ser diferente do diretório ativo. O gateway do ensaio deve ser iniciado apontando para o diretório restaurado somente após o restore terminar e com o tráfego bloqueado.

Não escanear QR, não conectar um telefone real e não reabrir outbound nesta primeira rodada. O objetivo inicial é provar leitura, readiness e isolamento.

### 4.3a Stack Docker local isolada

No Windows/PowerShell, a segunda stack pode ser criada sem tocar na stack ativa usando:

```powershell
.\scripts\start-restore-rehearsal.ps1 `
  -BackupDir "C:\Users\<usuario>\Desktop\restore-rehearsal\rr-local-01"
```

O script exige o pacote já verificado (`manifest-*.txt`, dump, sessão e `media.json`), valida o Compose e sobe inicialmente somente PostgreSQL e Redis do projeto `forte-rehearsal`, com volumes e redes separados. Panel, worker e gateway ficam para depois do restore, evitando migrations que dependam de rede externa antes de o banco ser restaurado. As redes são internas, a API pública fica desligada e o script não executa restore nem remove volumes. O QR não deve ser escaneado nesse ambiente.

Para descartar somente o ambiente de ensaio, depois de registrar as evidências:

```powershell
docker compose --project-name forte-rehearsal --env-file .env `
  --file docker-compose.local.yml `
  --file "$env:TEMP\forte-restore-rehearsal-forte-rehearsal.override.yml" `
  down --volumes --remove-orphans
```

### 4.4 Restore de mídia/blob

O provider deve fornecer uma operação equivalente a:

```text
source: <encrypted-off-host-copy>
backup_point: <UTC_BACKUP_TIMESTAMP>
target_bucket: <RESTORE_BUCKET>
target_prefix: restore/<RESTORE_REHEARSAL_ID>/
```

Após a cópia:

1. comparar quantidade e hashes dos objetos do inventário;
2. confirmar que o prefixo de ensaio não é público;
3. gerar URLs privadas temporárias somente para validação;
4. validar uma amostra de cada MIME suportado;
5. executar a reconciliação em `dryRun=true`;
6. confirmar que não existem candidatos cross-tenant;
7. não executar deleção durante a primeira rodada.

Se o provider não suportar listagem/hash/versionamento, o resultado é **inconclusivo**, não aprovado.

### 4.5 Redis e filas

Restaurar apenas dados necessários para o comportamento do ensaio. Locks, leases, filas transitórias e retries podem ser reconstruídos se houver evidência de que não geram duplicação.

Validar:

- conectividade do Panel/worker;
- ausência de jobs apontando para endpoints de produção;
- nenhum lease antigo bloqueando o worker;
- DLQ e contadores compatíveis com o ponto de recuperação;
- idempotência de um evento de teste sintético.

Não importar Redis de produção diretamente para um cluster compartilhado.

### 4.6 Chaves e configuração

Injetar as chaves correspondentes através do secret manager de ensaio. Nunca colocar chaves no backup Git ou no manifesto em texto puro.

Validar sem imprimir valores:

- leitura de uma configuração criptografada restaurada;
- geração de uma URL privada de mídia;
- inicialização do gateway;
- rejeição de segredo ausente ou incompatível;
- `CORE_ONLY_MODE=true`.

## 5. Validação pós-restore

Executar nesta ordem, mantendo o tráfego bloqueado:

1. `/health` do Panel, worker e gateway.
2. `/ready` do gateway, confirmando `instanceId`, estado esperado e ausência de erro de outbox.
3. migrations e versão do schema.
4. contagem de workspaces, membros, instâncias, conversas e mensagens no banco restaurado.
5. isolamento negativo: workspace A não acessa contatos, mensagens, mídia ou audit logs de B.
6. leitura de mídia de pelo menos uma conversa por workspace.
7. auditoria persistida da reconciliação, sem chaves de mídia no resumo.
8. DLQ/outbox: nenhuma duplicação ou publicação acidental.
9. worker: um job sintético processa uma vez e não reaparece após restart controlado.
10. gateway: restart sem novo QR **somente se a sessão restaurada for autorizada para esse ensaio**; caso contrário, validar apenas que o estado é seguro e desconectado.

## 6. Critérios de aprovação

O ensaio só pode ser marcado como aprovado se todos forem verdadeiros:

- [ ] pacote verificado antes de qualquer mutação;
- [ ] RPO calculado e dentro do alvo;
- [ ] RTO medido do início da preparação até readiness;
- [ ] PostgreSQL restaurado e migrations/queries críticas válidas;
- [ ] blobs restaurados com inventário e hashes compatíveis;
- [ ] Redis isolado e sem jobs de produção;
- [ ] sessão Baileys restaurada em diretório separado, sem sobrescrever a ativa;
- [ ] chaves de ensaio válidas e não expostas;
- [ ] isolamento entre dois workspaces comprovado;
- [ ] `/health` e `/ready` aprovados;
- [ ] dry-run de reconciliação sem cross-tenant;
- [ ] nenhum envio real ou webhook de produção ocorreu;
- [ ] evidências anexadas ao relatório do ensaio;
- [ ] rollback executado ou demonstrado em procedimento reversível.

Qualquer item pendente resulta em **inconclusivo/bloqueado**, nunca em aprovado parcial.

## 7. Rollback e descarte

1. Bloquear o tráfego do ambiente de ensaio.
2. Parar Panel, worker e gateway.
3. Descartar banco, Redis, bucket/prefixo e diretório de sessão do ensaio conforme política de retenção.
4. Revogar tokens e secrets temporários.
5. Confirmar que nenhum webhook, DNS, fila ou volume de produção foi alterado.
6. Preservar somente manifesto, hashes, métricas, logs redigidos e relatório.

Não apagar o backup de origem como parte do rollback.

## 8. Evidências e relatório

O relatório deve conter apenas dados redigidos:

- `RESTORE_REHEARSAL_ID`;
- commit e digests das imagens;
- ponto de backup e horário UTC;
- RPO/RTO alvo e observado;
- tabela de componentes com resultado;
- contagens agregadas por workspace;
- falhas, divergências e decisão;
- referência aos logs redigidos e ao audit log persistido.

Não incluir DATABASE_URL, senhas, bearer tokens, QR, conteúdo de mensagens ou chaves.

## 9. Resultado atual

Este documento prepara o ensaio, mas não substitui sua execução em Docker/staging persistente. O sandbox validou o contrato do script e a persistência redigida de métricas; ainda falta uma prova externa com provider de mídia, Redis, banco e sessão Baileys em ambiente limpo.
