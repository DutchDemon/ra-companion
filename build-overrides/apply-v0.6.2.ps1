$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$appRoot = Join-Path $repoRoot 'app'
$packagePath = Join-Path $appRoot 'package.json'
$buildDir = Join-Path $appRoot 'build'
$iconPath = Join-Path $buildDir 'ra-icon.png'

if (-not (Test-Path $packagePath)) {
    throw "Missing reconstructed package.json at $packagePath"
}

New-Item -ItemType Directory -Path $buildDir -Force | Out-Null

# Official RetroAchievements logo, pinned to the RAWeb revision used when this
# RA Companion release was prepared. This avoids silently changing branding if
# RAWeb replaces the asset later.
$iconUrl = 'https://raw.githubusercontent.com/RetroAchievements/RAWeb/56cd88e57c6dc6994e130a918e3967f9b74e9eb9/public/assets/images/ra-icon-mail.png'
Invoke-WebRequest -Uri $iconUrl -OutFile $iconPath -UseBasicParsing

if (-not (Test-Path $iconPath)) {
    throw 'RetroAchievements icon download failed.'
}

$bytes = [IO.File]::ReadAllBytes($iconPath)
$pngSignature = [byte[]](137,80,78,71,13,10,26,10)
if ($bytes.Length -lt 1024) {
    throw "RetroAchievements icon is unexpectedly small ($($bytes.Length) bytes)."
}
for ($i = 0; $i -lt $pngSignature.Length; $i++) {
    if ($bytes[$i] -ne $pngSignature[$i]) {
        throw 'Downloaded RetroAchievements icon is not a PNG file.'
    }
}

Add-Type -AssemblyName System.Drawing
$image = [System.Drawing.Image]::FromFile($iconPath)
try {
    if ($image.Width -lt 256 -or $image.Height -lt 256) {
        throw "RetroAchievements icon is too small for a Windows application icon: $($image.Width)x$($image.Height)."
    }
    if ($image.Width -ne $image.Height) {
        throw "RetroAchievements icon must be square: $($image.Width)x$($image.Height)."
    }
    Write-Host "Using official RetroAchievements icon: $($image.Width)x$($image.Height), $($bytes.Length) bytes"
} finally {
    $image.Dispose()
}

$pkg = Get-Content $packagePath -Raw | ConvertFrom-Json
$pkg.version = '0.6.2'
if (-not $pkg.build) { throw 'package.json build configuration is missing.' }
if (-not $pkg.build.win) { throw 'package.json Windows build configuration is missing.' }
$pkg.build.win | Add-Member -NotePropertyName icon -NotePropertyValue 'build/ra-icon.png' -Force
$pkg | ConvertTo-Json -Depth 30 | Set-Content $packagePath -Encoding UTF8

$verify = Get-Content $packagePath -Raw | ConvertFrom-Json
if ($verify.version -ne '0.6.2') { throw 'Failed to set v0.6.2 package version.' }
if ($verify.build.win.icon -ne 'build/ra-icon.png') { throw 'Failed to configure RetroAchievements Windows icon.' }

Write-Host 'v0.6.2 official RetroAchievements app icon applied.'
