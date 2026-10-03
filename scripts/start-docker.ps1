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

Write-Host "Verificando/baixando imagens publicadas do GHCR (sem build local)..."
Invoke-Compose `
    -Arguments ($composeArgs + @("pull") + $services) `
    -FailureMessage "Falha ao baixar imagens do GHCR. O reset foi abortado e nenhum dado local foi removido. Verifique a tag/imagem, a rede e a autenticação GHCR."

if ($Reset) {
    if ($ResetConfirmation -ne "APAGAR-TUDO") {
        throw "Reset abortado. Para apagar containers, volumes, imagens e redes da stack Forte Panel, use -ResetConfirmation APAGAR-TUDO."
    }

    Write-Warning "Reset destrutivo: os dados locais do PostgreSQL, Redis e sessão WhatsApp serão apagados."
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
