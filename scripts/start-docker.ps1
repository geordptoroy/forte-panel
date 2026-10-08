[CmdletBinding()]
param(
    [string]$ComposeFile = "docker-compose.local.yml",
    [string]$EnvFile = ".env",
    [switch]$Reset,
    [string]$ResetConfirmation = "",
    [switch]$UseLocalImages
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$composePath = Join-Path $repoRoot $ComposeFile
$envPath = Join-Path $repoRoot $EnvFile
$services = @(
    "postgres_panel",
    "redis_panel",
    "forte-panel-migrations",
    "forte-panel",
    "forte-panel-worker",
    "forte-whatsapp",
    "local-ai"
)

if (-not (Test-Path $envPath)) {
    throw "Arquivo .env não encontrado em $envPath. Crie-o a partir do exemplo local antes de iniciar a stack."
}

$localAiKeyLine = Get-Content -Path $envPath | Where-Object { $_ -match '^\s*LOCALAI_API_KEY\s*=' } | Select-Object -Last 1
$localAiKey = ""
if ($localAiKeyLine -match '^\s*LOCALAI_API_KEY\s*=\s*(.*)$') {
    $localAiKey = $Matches[1].Trim().Trim([char]34).Trim([char]39)
}
if (-not $localAiKey -or $localAiKey -match 'CHANGE_ME|configure-in-your-env|<|>') {
    throw "Defina LOCALAI_API_KEY no .env com um segredo aleatório forte antes de iniciar a stack. Use o mesmo segredo na ligação LocalAI do Console Admin."
}
$localAiKey = $null

if (-not (Test-Path $composePath)) {
    throw "Arquivo Compose não encontrado em $composePath."
}

& docker info --format "Docker Engine {{.ServerVersion}}" | Out-Host
if ($LASTEXITCODE -ne 0) {
    throw "Docker Desktop não está disponível. Inicie o Docker Desktop e tente novamente."
}

$composeExecutable = "docker"
$composeArgs = @("compose")
$composeVersionExit = 0
cmd /c "docker compose version >nul 2>nul"
$composeVersionExit = $LASTEXITCODE
if ($composeVersionExit -ne 0) {
    $legacyCompose = Get-Command docker-compose -ErrorAction SilentlyContinue
    if (-not $legacyCompose) {
        throw "Docker Compose não está disponível. Instale o plugin docker compose ou o binário docker-compose e tente novamente."
    }
    $composeExecutable = $legacyCompose.Source
    $composeArgs = @()
    Write-Warning "Plugin docker compose indisponível; usando o binário compatível docker-compose."
}
$composeArgs += @(
    "--env-file", $envPath,
    "--file", $composePath
)

function Invoke-Compose {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,
        [Parameter(Mandatory = $true)]
        [string]$FailureMessage
    )

    & $composeExecutable @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw $FailureMessage
    }
}

if ($UseLocalImages) {
    Write-Warning "Modo local explícito: não será feito pull. Serão usadas as imagens já presentes no Docker definidas no .env."
} else {
    Write-Host "Verificando/baixando imagens publicadas do GHCR e LocalAI (sem build local)..."
    Invoke-Compose `
        -Arguments ($composeArgs + @("pull") + $services) `
        -FailureMessage "Falha ao baixar imagens da stack. O reset foi abortado e nenhum dado local foi removido. Verifique a tag/imagem, a rede e a autenticação necessária."
}

if ($Reset) {
    if ($ResetConfirmation -ne "APAGAR-TUDO") {
        throw "Reset abortado. Para apagar containers, volumes, imagens e redes da stack Forte Panel, use -ResetConfirmation APAGAR-TUDO."
    }

    Write-Warning "Reset destrutivo: serão apagados PostgreSQL, Redis, sessão WhatsApp e modelos LocalAI baixados."
    Invoke-Compose `
        -Arguments ($composeArgs + @("down", "--volumes", "--remove-orphans", "--rmi", "all")) `
        -FailureMessage "Falha ao remover a stack local."
}

Write-Host "Iniciando Forte Panel a partir das imagens baixadas..."
Invoke-Compose `
    -Arguments ($composeArgs + @("up", "--detach", "--force-recreate") + $services) `
    -FailureMessage "Falha ao iniciar a stack. Corrija a causa indicada pelo script e tente novamente."

Write-Host ""
Write-Host "Stack iniciada. Estado atual:"
Invoke-Compose `
    -Arguments ($composeArgs + @("ps")) `
    -FailureMessage "A stack iniciou, mas não foi possível consultar o estado dos serviços."

Write-Host ""
Write-Host "Painel: http://localhost:3002"
if ($Reset) {
    Write-Host "Dados e recursos da stack Forte Panel foram apagados; outros projetos Docker foram preservados. Nenhum build local foi executado."
} else {
    Write-Host "Nenhum volume ou dado foi removido. Nenhum build local foi executado."
}
