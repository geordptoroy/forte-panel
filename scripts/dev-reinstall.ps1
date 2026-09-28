[CmdletBinding()]
param(
    [switch]$ResetData
)

$ErrorActionPreference = "Stop"

if (-not $ResetData) {
    throw "Este comando apaga o banco PostgreSQL, o Redis e as sessões Baileys do projeto local. Execute novamente com -ResetData para confirmar."
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$envFile = Join-Path $repoRoot ".env"
$composeFile = Join-Path $repoRoot "docker-compose.local.yml"
$projectName = "forte-local"

if (-not (Test-Path $envFile)) {
    Write-Host "Arquivo .env ausente; vou inicializar segredos locais via WSL."
    $wslPathOutput = & wsl.exe --exec wslpath -u $repoRoot
    if ($LASTEXITCODE -ne 0) {
        throw "Não consegui mapear o repositório no WSL. Instale/habilite WSL ou crie .env usando scripts/docker-init-local.sh."
    }
    $wslRepoRoot = ($wslPathOutput | Out-String).Trim()
    & wsl.exe --exec bash -lc "cd '$wslRepoRoot' && ./scripts/docker-init-local.sh"
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao criar .env no WSL."
    }
}

if (-not (Test-Path $composeFile)) {
    throw "Compose local não encontrado: $composeFile"
}

& docker info --format "Docker Engine {{.ServerVersion}}" | Out-Host
if ($LASTEXITCODE -ne 0) {
    throw "Docker Desktop não está disponível. Inicie Docker Desktop e tente novamente."
}

$composeBaseArgs = @(
    "--project-name", $projectName,
    "--env-file", $envFile,
    "--file", $composeFile
)

function Invoke-Compose {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,
        [Parameter(Mandatory = $true)]
        [string]$FailureMessage
    )

    & docker compose @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw $FailureMessage
    }
}

Write-Host "Removendo containers e volumes de desenvolvimento do projeto '$projectName'."
Invoke-Compose -Arguments ($composeBaseArgs + @("down", "--volumes", "--remove-orphans")) -FailureMessage "Falha ao remover a stack local; não vou continuar com a instalação."

Write-Host "Baixando as imagens públicas mais recentes da branch dev e as dependências."
Invoke-Compose -Arguments ($composeBaseArgs + @("pull")) -FailureMessage "Falha ao baixar imagens. Verifique acesso ao GHCR e tente novamente mais tarde."

Write-Host "Subindo a versão publicada; nenhum build é executado nesta máquina."
Invoke-Compose -Arguments ($composeBaseArgs + @("up", "--detach", "--remove-orphans")) -FailureMessage "Falha ao subir a stack. Consulte: docker compose --project-name $projectName --env-file .env --file docker-compose.local.yml logs"

Invoke-Compose -Arguments ($composeBaseArgs + @("ps", "--all")) -FailureMessage "A stack subiu, mas não consegui consultar o status."

Write-Host ""
Write-Host "Painel: http://localhost:3002"
Write-Host "Credenciais do administrador local: arquivo .env (LOCAL_ADMIN_EMAIL / LOCAL_ADMIN_PASSWORD)."
Write-Host "Demo mode está desligado. O bootstrap do administrador local é mantido para permitir login após um reset."
Write-Host "Os volumes apagados são somente os do projeto '$projectName'; imagens, cache e outros projetos Docker foram preservados."
