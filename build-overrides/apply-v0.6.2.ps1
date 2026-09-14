$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$appRoot = Join-Path $repoRoot 'app'
$packagePath = Join-Path $appRoot 'package.json'
$buildDir = Join-Path $appRoot 'build'
$sourceIconPath = Join-Path $buildDir 'ra-icon-square.webp'
$iconPath = Join-Path $buildDir 'ra-icon.png'

if (-not (Test-Path $packagePath)) {
    throw "Missing reconstructed package.json at $packagePath"
}

New-Item -ItemType Directory -Path $buildDir -Force | Out-Null

# Official RetroAchievements square logo, pinned to the RAWeb revision used
# when this RA Companion release was prepared. Only format conversion/resizing
# is performed; the artwork itself is not altered.
$iconUrl = 'https://raw.githubusercontent.com/RetroAchievements/RAWeb/56cd88e57c6dc6994e130a918e3967f9b74e9eb9/public/assets/images/ra-icon-square.webp'
Invoke-WebRequest -Uri $iconUrl -OutFile $sourceIconPath -UseBasicParsing

if (-not (Test-Path $sourceIconPath)) {
    throw 'RetroAchievements icon download failed.'
}

# Pillow's Windows wheel includes WebP support and gives us a deterministic
# 512x512 PNG that electron-builder can turn into the executable icon.
& python -c "import PIL" 2>$null
if ($LASTEXITCODE -ne 0) {
    & python -m pip install --disable-pip-version-check --quiet Pillow
    if ($LASTEXITCODE -ne 0) { throw 'Could not install Pillow for icon conversion.' }
}

$srcEscaped = $sourceIconPath.Replace("'", "''")
$dstEscaped = $iconPath.Replace("'", "''")
$python = "from PIL import Image; src=Image.open(r'$srcEscaped').convert('RGBA'); assert src.width == src.height, f'RA icon is not square: {src.width}x{src.height}'; src.resize((512,512), Image.Resampling.LANCZOS).save(r'$dstEscaped', format='PNG')"
& python -c $python
if ($LASTEXITCODE -ne 0) { throw 'RetroAchievements icon conversion failed.' }

if (-not (Test-Path $iconPath)) {
    throw 'Converted RetroAchievements PNG icon is missing.'
}

$bytes = [IO.File]::ReadAllBytes($iconPath)
$pngSignature = [byte[]](137,80,78,71,13,10,26,10)
if ($bytes.Length -lt 1024) {
    throw "RetroAchievements icon is unexpectedly small ($($bytes.Length) bytes)."
}
for ($i = 0; $i -lt $pngSignature.Length; $i++) {
    if ($bytes[$i] -ne $pngSignature[$i]) {
        throw 'Converted RetroAchievements icon is not a PNG file.'
    }
}

Add-Type -AssemblyName System.Drawing
$image = [System.Drawing.Image]::FromFile($iconPath)
try {
    if ($image.Width -ne 512 -or $image.Height -ne 512) {
        throw "RetroAchievements icon conversion produced unexpected dimensions: $($image.Width)x$($image.Height)."
    }
    Write-Host "Using official RetroAchievements square icon: $($image.Width)x$($image.Height), $($bytes.Length) bytes"
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
