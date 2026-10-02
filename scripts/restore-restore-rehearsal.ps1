[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$BackupDir,
    [string]$ProjectName = "forte-rehearsal",
    [switch]$ConfirmRestore
)

$ErrorActionPreference = "Stop"

function Fail([string]$Message) {
    throw $Message
}

if (-not $ConfirmRestore) {
    Fail "Restore protegido: execute novamente com -ConfirmRestore. Nenhuma operação foi executada."
}
if ($ProjectName -ne "forte-rehearsal") {
    Fail "Por segurança, este script só aceita o projeto forte-rehearsal."
}

$backupPath = (Resolve-Path $BackupDir -ErrorAction Stop).Path
$dump = Get-ChildItem $backupPath -Filter "postgres-*.dump" -File | Select-Object -First 1
$session = Get-ChildItem $backupPath -Filter "whatsapp-sessions-*.tar.gz" -File | Select-Object -First 1
if (-not $dump) { Fail "Dump PostgreSQL não encontrado em $backupPath" }
if (-not $session) { Fail "Backup de sessão não encontrado em $backupPath" }
if (-not (Test-Path (Join-Path $backupPath "media.json"))) { Fail "media.json não encontrado em $backupPath" }

$postgres = (& docker ps --filter "label=com.docker.compose.project=$ProjectName" --filter "label=com.docker.compose.service=postgres_panel" --format "{{.Names}}" | Select-Object -First 1).Trim()
if (-not $postgres) { Fail "PostgreSQL do projeto $ProjectName não está rodando" }
if ($postgres -eq "forte_postgres_panel" -or $postgres -notlike "forte-rehearsal-*") {
    Fail "Destino PostgreSQL inseguro: $postgres"
}

$health = (& docker inspect --format "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" $postgres).Trim()
if ($health -ne "healthy") { Fail "PostgreSQL do rehearsal não está healthy: $health" }

Write-Host "Destino confirmado: $postgres"
Write-Host "Dump: $($dump.Name)"
Write-Host "Sessão: $($session.Name)"
Write-Host "A operação altera somente a stack $ProjectName."

$remoteDump = "/tmp/restore-rehearsal.dump"
& docker cp $dump.FullName "${postgres}:$remoteDump"
if ($LASTEXITCODE -ne 0) { Fail "Falha ao copiar o dump para o PostgreSQL isolado" }
try {
    & docker exec $postgres pg_restore --clean --if-exists --no-owner -U forte_panel -d forte_panel $remoteDump
    if ($LASTEXITCODE -ne 0) { Fail "pg_restore falhou no PostgreSQL isolado" }
} finally {
    & docker exec $postgres rm -f $remoteDump | Out-Null
}

$volume = "${ProjectName}_forte_whatsapp_sessions"
Write-Host "Restaurando sessão somente no volume $volume..."
$mountBackup = "type=bind,source=$backupPath,target=/backup,readonly"
$mountSession = "type=volume,source=$volume,target=/restore"
& docker run --rm --mount $mountBackup --mount $mountSession postgres:16-alpine sh -c "rm -rf /restore/* /restore/.[!.]* /restore/..?* 2>/dev/null || true; tar -xzf '/backup/$($session.Name)' -C /restore; chmod -R u=rwX,go= /restore"
if ($LASTEXITCODE -ne 0) { Fail "Falha ao restaurar a sessão no volume isolado" }

Write-Host "Restore do PostgreSQL e da sessão concluído no destino isolado."
Write-Host "Panel/worker/gateway ainda não foram iniciados."
Write-Host "Próximo passo: subir a aplicação do rehearsal e validar readiness sem escanear QR."
