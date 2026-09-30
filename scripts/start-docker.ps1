[CmdletBinding()]
param(
    [string]$ComposeFile = "docker-compose.local.yml",
    [string]$EnvFile = ".env"
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$composePath = Join-Path $repoRoot $ComposeFile
$envPath = Join-Path $repoRoot $EnvFile
$services = @(
    "postgres_panel",
    "redis_panel",
    "forte-panel",
    "forte-panel-worker",
    "forte-whatsapp"
)

if (-not (Test-Path $envPath)) {
    throw "Arquivo .env não encontrado em $envPath. Crie-o a partir do exemplo local antes de iniciar a stack."
}

if (-not (Test-Path $composePath)) {
    throw "Arquivo Compose não encontrado em $composePath."
}

& docker info --format "Docker Engine {{.ServerVersion}}" | Out-Host
if ($LASTEXITCODE -ne 0) {
    throw "Docker Desktop não está disponível. Inicie o Docker Desktop e tente novamente."
}

$composeArgs = @(
    "compose",
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

    & docker @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw $FailureMessage
    }
}

Write-Host "Atualizando imagens publicadas da branch dev..."
Invoke-Compose `
    -Arguments ($composeArgs + @("pull") + $services) `
    -FailureMessage "Falha ao baixar as imagens. Verifique o Docker Desktop, a rede e o acesso ao GHCR."

Write-Host "Iniciando Forte Panel sem apagar volumes..."
Invoke-Compose `
    -Arguments ($composeArgs + @("up", "--detach", "--force-recreate") + $services) `
    -FailureMessage "Falha ao iniciar a stack. Consulte os logs com: docker compose --env-file .env --file docker-compose.local.yml logs"

Write-Host ""
Write-Host "Stack iniciada. Estado atual:"
Invoke-Compose `
    -Arguments ($composeArgs + @("ps")) `
    -FailureMessage "A stack iniciou, mas não foi possível consultar o estado dos serviços."

Write-Host ""
Write-Host "Painel: http://localhost:3002"
Write-Host "Não foram removidos volumes, containers de outros projetos ou imagens locais."
