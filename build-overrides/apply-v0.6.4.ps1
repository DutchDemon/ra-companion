$ErrorActionPreference = 'Stop'

& (Join-Path $PSScriptRoot 'apply-v0.6.4-core.ps1')
if ($LASTEXITCODE -ne 0) { throw "v0.6.4 core transform failed with exit code $LASTEXITCODE." }

& (Join-Path $PSScriptRoot 'apply-v0.6.4b.ps1')
if ($LASTEXITCODE -ne 0) { throw "v0.6.4 test-fix transform failed with exit code $LASTEXITCODE." }

Write-Host 'Applied complete RA Companion v0.6.4 transform.'
