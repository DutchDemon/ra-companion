$ErrorActionPreference = 'Stop'

function Replace-Exact {
  param(
    [Parameter(Mandatory = $true)][string]$Text,
    [Parameter(Mandatory = $true)][string]$Old,
    [Parameter(Mandatory = $true)][string]$New,
    [Parameter(Mandatory = $true)][string]$Label
  )

  if (-not $Text.Contains($Old)) {
    throw "Could not apply v0.4.6 patch: expected block '$Label' was not found."
  }
  return $Text.Replace($Old, $New)
}

$electronMainPath = 'app/electron/main.cjs'
$rendererMainPath = 'app/src/main.tsx'
$packagePath = 'app/package.json'
$lockPath = 'app/package-lock.json'

$electronMain = Get-Content $electronMainPath -Raw
$electronMain = Replace-Exact $electronMain `
  '    setTimeout(() => updater.quitAndInstall(false, true), 250);' `
  '    setTimeout(() => updater.quitAndInstall(true, true), 250);' `
  'silent updater install'
$electronMain = Replace-Exact $electronMain `
  '    const result = { ...status, installing: true, message: `Installing RA Companion ${status.latestVersion}…` };' `
  '    const result = { ...status, installing: true, message: `Installing RA Companion ${status.latestVersion} silently and restarting…` };' `
  'silent updater status'
Set-Content -Path $electronMainPath -Value $electronMain -Encoding utf8 -NoNewline

$rendererMain = Get-Content $rendererMainPath -Raw
$rendererMain = $rendererMain.Replace('0.4.5', '0.4.6')
Set-Content -Path $rendererMainPath -Value $rendererMain -Encoding utf8 -NoNewline

$package = Get-Content $packagePath -Raw | ConvertFrom-Json
$package.version = '0.4.6'
$package | ConvertTo-Json -Depth 100 | Set-Content -Path $packagePath -Encoding utf8

if (Test-Path $lockPath) {
  $lock = Get-Content $lockPath -Raw | ConvertFrom-Json
  $lock.version = '0.4.6'
  if ($lock.packages -and $lock.packages.PSObject.Properties.Name -contains '') {
    $lock.packages.''.version = '0.4.6'
  }
  $lock | ConvertTo-Json -Depth 100 | Set-Content -Path $lockPath -Encoding utf8
}

$patchedPackage = Get-Content $packagePath -Raw | ConvertFrom-Json
if ($patchedPackage.version -ne '0.4.6') {
  throw "Expected patched version 0.4.6, got $($patchedPackage.version)"
}

$patchedElectron = Get-Content $electronMainPath -Raw
if (-not $patchedElectron.Contains('quitAndInstall(true, true)')) {
  throw 'Silent quitAndInstall flag was not applied.'
}
if ($patchedElectron.Contains('quitAndInstall(false, true)')) {
  throw 'Interactive quitAndInstall call is still present.'
}

Write-Host 'Applied RA Companion v0.4.6 silent in-app updater patch.'
