$ErrorActionPreference = 'Stop'

$patchArchive = 'build-overrides/v0.5.1.patch.gz.b64'
if (-not (Test-Path $patchArchive)) { throw 'v0.5.1 source patch archive is missing.' }
$patchPath = Join-Path $env:RUNNER_TEMP 'ra-companion-v0.5.1.patch'
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
$packagePath = 'app/package.json'
$lockPath = 'app/package-lock.json'

if (-not (Test-Path 'app/src/main.tsx')) { throw 'Patched app source is missing.' }
if (-not (Test-Path 'app/tools/ram-reader.ps1')) { throw 'RAM reader source is missing.' }

Push-Location 'app'
try {
  & git apply --check --ignore-space-change --ignore-whitespace $patchPath
  if ($LASTEXITCODE -ne 0) { throw 'v0.5.1 patch preflight failed.' }
  & git apply --ignore-space-change --ignore-whitespace $patchPath
  if ($LASTEXITCODE -ne 0) { throw 'v0.5.1 patch application failed.' }
} finally {
  Pop-Location
}

$package = Get-Content $packagePath -Raw | ConvertFrom-Json
$package.version = '0.5.1'
$package | ConvertTo-Json -Depth 100 | Set-Content -Path $packagePath -Encoding utf8

if (Test-Path $lockPath) {
  $lock = Get-Content $lockPath -Raw | ConvertFrom-Json
  $lock.version = '0.5.1'
  if ($lock.packages -and $lock.packages.PSObject.Properties.Name -contains '') {
    $lock.packages.''.version = '0.5.1'
  }
  $lock | ConvertTo-Json -Depth 100 | Set-Content -Path $lockPath -Encoding utf8
}

$main = Get-Content 'app/src/main.tsx' -Raw
$profile = Get-Content 'app/src/profiles/twilightPrincess.ts' -Raw
$stateEngine = Get-Content 'app/src/profiles/twilightPrincessState.ts' -Raw
$ramReader = Get-Content 'app/tools/ram-reader.ps1' -Raw
$types = Get-Content 'app/src/global.d.ts' -Raw
$patchedPackage = Get-Content $packagePath -Raw | ConvertFrom-Json

if ($patchedPackage.version -ne '0.5.1') { throw "Expected app version 0.5.1, got $($patchedPackage.version)" }
if (-not $main.Contains("buildTwilightAchievementStates")) { throw 'Full-set Twilight achievement state engine is not wired into the UI.' }
if (-not $main.Contains("String(liveRam?.gameCode || '') === 'GZ2E01'")) { throw 'USA-only GZ2E01 live detection is missing.' }
if ($main.Contains('GZ2P01') -or $main.Contains('GZ2J01')) { throw 'Non-USA Twilight builds are still accepted by the renderer.' }
if (-not $main.Contains('stateFlags: effectiveRam?.stateFlags')) { throw 'Fine-grained RAM state flags are not passed into context evaluation.' }
if (-not $main.Contains("'missed' | 'completed'")) { throw 'Missed/ineligible filter was not applied.' }
if (-not $main.Contains('RA Companion v0.5.1')) { throw 'v0.5.1 UI version label is missing.' }
if (-not $profile.Contains("buzzHiveDroppedSlingshot")) { throw 'Buzz Off hive-state gate is missing.' }
if (-not $profile.Contains('explicitLiveRule')) { throw 'Explicit RAM rules are not authoritative in strict mode.' }
if (-not $stateEngine.Contains("TWILIGHT_GAME_STATE_ENGINE = 'tp-gz2e01-v1'")) { throw 'Twilight Game State Engine module is missing.' }
if (-not $stateEngine.Contains("title === 'buzz off'")) { throw 'Buzz Off deep state rule is missing.' }
if (-not $stateEngine.Contains("title === 'smiling politely'")) { throw 'Smiling Politely deep state rule is missing.' }
if (-not $stateEngine.Contains("title === 'doing anything for money'")) { throw 'Doing Anything for Money deep state rule is missing.' }
if (-not $stateEngine.Contains("title === \"ordon't worry\"")) { throw "Ordon't Worry live progress rule is missing." }
if (-not $ramReader.Contains("'GZ2E01' =")) { throw 'GZ2E01 RAM version table is missing.' }
if ($ramReader.Contains("'GZ2P01' =") -or $ramReader.Contains("'GZ2J01' =")) { throw 'RAM reader still contains unsupported PAL/JP versions.' }
if (-not $ramReader.Contains("gameStateEngine = 'tp-gz2e01-v1'")) { throw 'RAM reader does not expose the new game-state engine.' }
if (-not $ramReader.Contains('buzzHiveDroppedHawk')) { throw 'Beehive world-state mapping is missing.' }
if (-not $ramReader.Contains('eventBitsHex')) { throw 'Persistent event-bit table is not exposed.' }
if (-not $ramReader.Contains('tempBitsHex')) { throw 'Temporary event-bit table is not exposed.' }
if (-not $types.Contains('stateFlags?: Record<string, boolean>')) { throw 'Renderer RAM state typings are missing.' }

Write-Host 'Applied RA Companion v0.5.1 GZ2E01 full-set Game State Engine.'
