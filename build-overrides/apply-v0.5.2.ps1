$ErrorActionPreference = 'Stop'

$patchArchive = 'build-overrides/v0.5.2.patch.gz.b64'
if (-not (Test-Path $patchArchive)) { throw 'v0.5.2 source patch archive is missing.' }
$patchPath = Join-Path $env:RUNNER_TEMP 'ra-companion-v0.5.2.patch'
$compressed = [Convert]::FromBase64String((Get-Content $patchArchive -Raw).Trim())
$inputStream = [IO.MemoryStream]::new($compressed)
$gzip = [IO.Compression.GZipStream]::new($inputStream, [IO.Compression.CompressionMode]::Decompress)
$outputStream = [IO.MemoryStream]::new()
try {
  $gzip.CopyTo($outputStream)
  [IO.File]::WriteAllBytes($patchPath, $outputStream.ToArray())
} finally {
  $gzip.Dispose()
  $inputStream.Dispose()
  $outputStream.Dispose()
}

if (-not (Test-Path 'app/src/main.tsx')) { throw 'v0.5.1 working source is missing.' }
if (-not (Test-Path 'app/src/profiles/twilightPrincessState.ts')) { throw 'Twilight Princess state engine is missing.' }

& git apply --check --ignore-space-change --ignore-whitespace --directory=app $patchPath
if ($LASTEXITCODE -ne 0) { throw 'v0.5.2 patch preflight failed.' }
& git apply --ignore-space-change --ignore-whitespace --directory=app $patchPath
if ($LASTEXITCODE -ne 0) { throw 'v0.5.2 patch application failed.' }

$pkg = Get-Content 'app/package.json' -Raw | ConvertFrom-Json
$main = Get-Content 'app/src/main.tsx' -Raw
$stateEngine = Get-Content 'app/src/profiles/twilightPrincessState.ts' -Raw
$styles = Get-Content 'app/src/styles.css' -Raw
$electron = Get-Content 'app/electron/main.cjs' -Raw
$preload = Get-Content 'app/electron/preload.cjs' -Raw
$types = Get-Content 'app/src/global.d.ts' -Raw

if ($pkg.version -ne '0.5.2') { throw "Expected app version 0.5.2, got $($pkg.version)" }
if (-not $stateEngine.Contains("title === 'pump up the king'")) { throw 'Pump up the King live rule is missing.' }
if (-not $stateEngine.Contains('ram.bottleCount > 0')) { throw 'Filled-bottle ownership semantics are missing.' }
if (-not $stateEngine.Contains('Number(item) === 0x67')) { throw 'Water-bottle ready-state detection is missing.' }
if (-not $main.Contains('deepLiveAchievements')) { throw 'Deep RAM opportunities are not promoted into the desktop/overlay UI.' }
if (-not $main.Contains('v5-account-connection')) { throw 'Account Connection interaction wrapper is missing.' }
if (-not $styles.Contains('-webkit-app-region: no-drag')) { throw 'Settings no-drag interaction guard is missing.' }
if (-not $styles.Contains('pointer-events: auto')) { throw 'Settings pointer-events interaction guard is missing.' }
if (-not $electron.Contains('registerShortcutBinding')) { throw 'Verified global shortcut registration is missing.' }
if (-not $electron.Contains("'CommandOrControl+Shift+O'")) { throw 'Primary overlay shortcut is missing.' }
if (-not $electron.Contains("'CommandOrControl+Alt+O'")) { throw 'Overlay shortcut fallback is missing.' }
if (-not $electron.Contains('app.requestSingleInstanceLock()')) { throw 'Single-instance shortcut protection is missing.' }
if (-not $preload.Contains('getShortcutState')) { throw 'Shortcut status preload API is missing.' }
if (-not $types.Contains('interface ShortcutState')) { throw 'Shortcut state renderer types are missing.' }
if (-not $main.Contains('<b>v0.5.2</b>')) { throw 'v0.5.2 UI version label is missing.' }

Write-Host 'Applied RA Companion v0.5.2 bottle, settings and global-hotkey fixes.'
