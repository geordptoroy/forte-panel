[CmdletBinding()]
param(
    [switch]$ResetData,
    [string]$ResetConfirmation = ""
)

$ErrorActionPreference = "Stop"
$canonicalScript = Join-Path $PSScriptRoot "start-docker.ps1"
if (-not (Test-Path $canonicalScript)) {
    throw "Script oficial não encontrado: $canonicalScript"
}

if ($ResetData) {
    & $canonicalScript -Reset -ResetConfirmation $ResetConfirmation
} else {
    & $canonicalScript
}

if ($LASTEXITCODE -ne 0) {
    throw "Falha ao atualizar a imagem principal. Consulte a mensagem do script oficial."
}
