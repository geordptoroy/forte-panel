[CmdletBinding()]
param(
    [string]$ComposeFile = "docker-compose.local.yml",
    [string]$EnvFile = ".env",
    [switch]$Reset,
    [string]$ResetConfirmation = ""
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

if ($Reset) {
    if ($ResetConfirmation -ne "APAGAR-TUDO") {
        throw "Reset abortado. Para apagar containers, volumes, imagens, redes e cache, use -ResetConfirmation APAGAR-TUDO."
    }

    Write-Warning "Reset destrutivo: os dados locais do PostgreSQL, Redis e sessão WhatsApp serão apagados."
    Invoke-Compose `
        -Arguments ($composeArgs + @("down", "--volumes", "--remove-orphans", "--rmi", "all")) `
        -FailureMessage "Falha ao remover a stack local."

    # Limpeza global do Docker: também pode remover recursos não utilizados de outros projetos.
    & docker system prune --all --force --volumes
    if ($LASTEXITCODE -ne 0) { throw "Falha no docker system prune." }
    & docker builder prune --all --force
    if ($LASTEXITCODE -ne 0) { throw "Falha no docker builder prune." }
    & docker network prune --force
    if ($LASTEXITCODE -ne 0) { throw "Falha no docker network prune." }
    & docker volume prune --all --force
    if ($LASTEXITCODE -ne 0) { throw "Falha no docker volume prune." }
}

Write-Host "Baixando imagens publicadas do GHCR (sem build local)..."
Invoke-Compose `
    -Arguments ($composeArgs + @("pull") + $services) `
    -FailureMessage "Falha ao baixar imagens do GHCR. Verifique a rede e a disponibilidade das imagens."

Write-Host "Iniciando Forte Panel a partir das imagens baixadas..."
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
if ($Reset) {
    Write-Host "Dados locais foram apagados antes do pull. Nenhum build local foi executado."
} else {
    Write-Host "Nenhum volume ou dado foi removido. Nenhum build local foi executado."
}
