$ErrorActionPreference = 'Stop'

$patchArchive = 'build-overrides/v0.5.6.patch.gz.b64'
if (-not (Test-Path $patchArchive)) { throw 'v0.5.6 source patch archive is missing.' }
$patchPath = Join-Path $env:RUNNER_TEMP 'ra-companion-v0.5.6.patch'
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

$patchHash = (Get-FileHash $patchPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($patchHash -ne 'c1b327887c3738e013116ad46e73c8a5f8e6fea4d741f005ceeb289c081e927b') {
  throw "v0.5.6 patch SHA256 mismatch: $patchHash"
}

if (-not (Test-Path 'app/src/profiles/twilightPrincessState.ts')) { throw 'v0.5.5 state engine is missing.' }
if (-not (Test-Path 'app/tools/ram-reader.ps1')) { throw 'v0.5.5 RAM reader is missing.' }
if (-not (Test-Path 'app/electron/main.cjs')) { throw 'v0.5.5 Electron main process is missing.' }

& git apply --check --ignore-space-change --ignore-whitespace --directory=app $patchPath
if ($LASTEXITCODE -ne 0) { throw 'v0.5.6 patch preflight failed.' }
& git apply --ignore-space-change --ignore-whitespace --directory=app $patchPath
if ($LASTEXITCODE -ne 0) { throw 'v0.5.6 patch application failed.' }

$lockPath = 'app/package-lock.json'
if (Test-Path $lockPath) {
  $lock = Get-Content $lockPath -Raw | ConvertFrom-Json
  if ($lock.version -eq '0.5.5') { $lock.version = '0.5.6' }
  $rootPackage = $lock.packages.PSObject.Properties['']
  if ($rootPackage -and $rootPackage.Value.version -eq '0.5.5') {
    $rootPackage.Value.version = '0.5.6'
  }
  [IO.File]::WriteAllText((Resolve-Path $lockPath), ($lock | ConvertTo-Json -Depth 100) + "`n", [Text.UTF8Encoding]::new($false))
}

$pkg = Get-Content 'app/package.json' -Raw | ConvertFrom-Json
$reader = Get-Content 'app/tools/ram-reader.ps1' -Raw
$stateEngine = Get-Content 'app/src/profiles/twilightPrincessState.ts' -Raw
$electron = Get-Content 'app/electron/main.cjs' -Raw

if ($pkg.version -ne '0.5.6') { throw "Expected app version 0.5.6, got $($pkg.version)" }
if (-not (Test-Path 'app/src/__tests__/v056.regression.test.tsx')) { throw 'v0.5.6 regression tests are missing.' }
if (-not $reader.Contains('$lightDropGetFlags = Read-ByteAtGuest $shared ($gameInfoGuest + [uint64]0x118)')) { throw 'Vessel of Light flag read is missing.' }
if (-not $reader.Contains('faronVesselObtained = (Test-FlagBit $lightDropGetFlags 0)')) { throw 'Faron Vessel flag mapping is missing.' }
if (-not $reader.Contains('eldinVesselObtained = (Test-FlagBit $lightDropGetFlags 1)')) { throw 'Eldin Vessel flag mapping is missing.' }
if (-not $reader.Contains('lanayruVesselObtained = (Test-FlagBit $lightDropGetFlags 2)')) { throw 'Lanayru Vessel flag mapping is missing.' }
if (-not $stateEngine.Contains("Coming soon · Vessel not received")) { throw 'Vessel-gated achievement state is missing.' }
if (-not $stateEngine.Contains("In progress · `${current}/16 Tears")) { throw 'Live Tear progress label is missing.' }
if (-not $stateEngine.Contains("target: 16")) { throw 'Original GameCube/Wii 16-Tear target is missing.' }
if (-not $electron.Contains("mainWindow.on('closed'")) { throw 'Main-window shutdown lifecycle fix is missing.' }
if (-not $electron.Contains('if (!appIsQuitting) app.quit();')) { throw 'Main-window close no longer quits the hidden overlay process.' }
if (-not $electron.Contains('focusOrCreateMainWindow();')) { throw 'Second-instance recovery is missing.' }
if (-not $electron.Contains("app.on('before-quit'")) { throw 'Quit lifecycle guard is missing.' }

Write-Host 'Applied RA Companion v0.5.6 Vessel of Light progress and clean shutdown/relaunch fixes.'
