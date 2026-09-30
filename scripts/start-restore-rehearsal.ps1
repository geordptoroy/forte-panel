[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$BackupDir,
    [int]$PanelPort = 3102,
    [int]$BaileysPort = 3110,
    [string]$ProjectName = "forte-rehearsal",
    [switch]$StartApplication
)

$ErrorActionPreference = "Stop"

function Fail([string]$Message) {
    throw $Message
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$envFile = Join-Path $repoRoot ".env"
$composeFile = Join-Path $repoRoot "docker-compose.local.yml"
$backupPath = (Resolve-Path $BackupDir -ErrorAction Stop).Path
$baseComposeFile = Join-Path $env:TEMP "forte-restore-rehearsal-$ProjectName.base.yml"
$overrideFile = Join-Path $env:TEMP "forte-restore-rehearsal-$ProjectName.override.yml"

if (-not (Test-Path $envFile)) { Fail ".env não encontrado: $envFile" }
if (-not (Test-Path $composeFile)) { Fail "Compose local não encontrado: $composeFile" }
if (-not (Test-Path (Join-Path $backupPath "media.json"))) { Fail "Pacote sem media.json: $backupPath" }
if (-not (Get-ChildItem $backupPath -Filter "manifest-*.txt" -File)) { Fail "Pacote sem manifesto: $backupPath" }
if (-not (Get-ChildItem $backupPath -Filter "postgres-*.dump" -File)) { Fail "Pacote sem dump PostgreSQL: $backupPath" }
if (-not (Get-ChildItem $backupPath -Filter "whatsapp-sessions-*.tar.gz" -File)) { Fail "Pacote sem sessão Baileys: $backupPath" }
if ($PanelPort -lt 1024 -or $PanelPort -gt 65535) { Fail "PanelPort inválida" }
if ($BaileysPort -lt 1024 -or $BaileysPort -gt 65535) { Fail "BaileysPort inválida" }
if ($PanelPort -eq $BaileysPort) { Fail "PanelPort e BaileysPort não podem ser iguais" }

$baseCompose = Get-Content -Path $composeFile -Raw
$baseCompose = [regex]::Replace($baseCompose, '(?m)^\s*container_name:\s*.*(?:\r?\n|$)', '')
$baseCompose = [regex]::Replace($baseCompose, '(?ms)^\s{4}ports:\s*\r?\n(?:^\s{6}-.*(?:\r?\n|$))+', '')
$baseCompose = [regex]::Replace($baseCompose, '(?m)^\s{4}ports:\s*\[.*\]\s*(?:\r?\n|$)', '')
Set-Content -Path $baseComposeFile -Value $baseCompose -Encoding utf8

$override = @"
services:
  forte-panel-migrations:
    command: ["sh", "-c", "exit 0"]
  forte-panel:
    ports:
      - "127.0.0.1:$PanelPort`:3000"
    environment:
      FORTE_PUBLIC_API_ENABLED: "false"
      PUBLIC_APP_URL: "http://localhost:$PanelPort"
  forte-whatsapp:
    ports:
      - "127.0.0.1:$BaileysPort`:3010"

networks:
  panel-network:
    name: ${ProjectName}-panel-network
    internal: true
  whatsapp-network:
    name: ${ProjectName}-whatsapp-network
    internal: true
"@

Set-Content -Path $overrideFile -Value $override -Encoding utf8
$composeArgs = @(
    "--project-name", $ProjectName,
    "--env-file", $envFile,
    "--file", $baseComposeFile,
    "--file", $overrideFile
)

& docker info --format "Docker Engine {{.ServerVersion}}" | Out-Host
if ($LASTEXITCODE -ne 0) { Fail "Docker Desktop não está disponível." }

Write-Host "Validando a configuração da stack isolada..."
& docker compose @composeArgs config | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "Compose do rehearsal inválido; nada foi iniciado." }

Write-Host "Subindo somente PostgreSQL e Redis isolados do rehearsal '$ProjectName'."
Write-Host "Panel, worker e gateway serão iniciados somente depois do restore."
Write-Host "Não executando restore, não removendo volumes e não conectando WhatsApp real."
& docker compose @composeArgs up --detach --remove-orphans --pull never postgres_panel redis_panel
if ($LASTEXITCODE -ne 0) { Fail "Falha ao subir a stack isolada." }

if ($StartApplication) {
    Write-Host "Iniciando Panel, worker e gateway após restore explícito..."
    & docker compose @composeArgs up --detach --remove-orphans --pull never forte-panel forte-panel-worker forte-whatsapp
    if ($LASTEXITCODE -ne 0) { Fail "Falha ao iniciar a aplicação do rehearsal." }
}

Write-Host ""
Write-Host "Infraestrutura isolada iniciada. Estado:"
& docker compose @composeArgs ps
Write-Host ""
Write-Host "Próximo passo: restaurar o pacote no PostgreSQL isolado; somente depois iniciar Panel/gateway."
if ($StartApplication) {
    Write-Host "Panel do rehearsal: http://localhost:$PanelPort"
    Write-Host "Gateway do rehearsal: http://localhost:$BaileysPort"
}
Write-Host "Compose base temporário: $baseComposeFile"
Write-Host "Para descartar SOMENTE esta stack depois do ensaio: docker compose $($composeArgs -join ' ') down --volumes --remove-orphans"
