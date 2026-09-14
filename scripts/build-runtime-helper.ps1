param(
  [ValidateSet('Debug', 'Release')]
  [string]$Configuration = 'Release'
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$sourceDir = Join-Path $root 'native/rcheevos-runtime-helper'
$buildDir = Join-Path $sourceDir 'build'
$appToolsDir = Join-Path $root 'app/tools'

Write-Host "Configuring RA runtime helper ($Configuration)..."
cmake -S $sourceDir -B $buildDir -A x64
if ($LASTEXITCODE -ne 0) { throw "CMake configure failed with exit code $LASTEXITCODE." }

cmake --build $buildDir --config $Configuration --parallel
if ($LASTEXITCODE -ne 0) { throw "CMake build failed with exit code $LASTEXITCODE." }

$helper = Join-Path $buildDir "$Configuration/ra-runtime-helper.exe"
if (-not (Test-Path $helper)) { throw "Runtime helper was not produced at $helper" }

New-Item -ItemType Directory -Force -Path $appToolsDir | Out-Null
Copy-Item $helper (Join-Path $appToolsDir 'ra-runtime-helper.exe') -Force
Copy-Item (Join-Path $sourceDir 'THIRD_PARTY_NOTICES.md') (Join-Path $appToolsDir 'rcheevos-THIRD-PARTY-NOTICES.md') -Force

$selfTestOutput = & $helper --self-test
if ($LASTEXITCODE -ne 0) { throw "Runtime helper self-test failed with exit code $LASTEXITCODE." }
$selfTest = $selfTestOutput | ConvertFrom-Json
if (-not $selfTest.ok -or -not $selfTest.runtimeParser) { throw 'Runtime helper self-test did not report a healthy rcheevos parser.' }
if ($selfTest.rcheevosTag -ne 'v12.5.0') { throw "Unexpected rcheevos tag: $($selfTest.rcheevosTag)" }

Write-Host "Built $helper"
Write-Host $selfTestOutput
