$ErrorActionPreference = 'Stop'

$patchArchive = 'build-overrides/v0.5.7.patch.gz.b64'
if (-not (Test-Path $patchArchive)) { throw 'v0.5.7 source patch archive is missing.' }
$patchPath = Join-Path $env:RUNNER_TEMP 'ra-companion-v0.5.7.patch'
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
if ($patchHash -ne '712c145455170a1777d8c1783571f3fa964fa72141e95773a7c5b220d61e9c0d') {
  throw "v0.5.7 patch SHA256 mismatch: $patchHash"
}

if (-not (Test-Path 'app/src/profiles/twilightPrincessState.ts')) { throw 'v0.5.6 state engine is missing.' }
if (-not (Test-Path 'app/src/profiles/twilightPrincess.ts')) { throw 'v0.5.6 context engine is missing.' }

& git apply --check --ignore-space-change --ignore-whitespace --directory=app $patchPath
if ($LASTEXITCODE -ne 0) { throw 'v0.5.7 patch preflight failed.' }
& git apply --ignore-space-change --ignore-whitespace --directory=app $patchPath
if ($LASTEXITCODE -ne 0) { throw 'v0.5.7 patch application failed.' }

$pkgPath = 'app/package.json'
$pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
if ($pkg.version -ne '0.5.6') { throw "Expected package version 0.5.6 before v0.5.7 bump, got $($pkg.version)" }
$pkg.version = '0.5.7'
[IO.File]::WriteAllText((Resolve-Path $pkgPath), ($pkg | ConvertTo-Json -Depth 100) + "`n", [Text.UTF8Encoding]::new($false))

$lockPath = 'app/package-lock.json'
if (Test-Path $lockPath) {
  $lock = Get-Content $lockPath -Raw | ConvertFrom-Json
  if ($lock.version -eq '0.5.6') { $lock.version = '0.5.7' }
  $rootPackage = $lock.packages.PSObject.Properties['']
  if ($rootPackage -and $rootPackage.Value.version -eq '0.5.6') {
    $rootPackage.Value.version = '0.5.7'
  }
  [IO.File]::WriteAllText((Resolve-Path $lockPath), ($lock | ConvertTo-Json -Depth 100) + "`n", [Text.UTF8Encoding]::new($false))
}

$profile = Get-Content 'app/src/profiles/twilightPrincess.ts' -Raw
$stateEngine = Get-Content 'app/src/profiles/twilightPrincessState.ts' -Raw
$renderer = Get-Content 'app/src/main.tsx' -Raw
$finalPkg = Get-Content $pkgPath -Raw | ConvertFrom-Json

if ($finalPkg.version -ne '0.5.7') { throw "Expected app version 0.5.7, got $($finalPkg.version)" }
if (-not (Test-Path 'app/src/__tests__/v057.regression.test.tsx')) { throw 'v0.5.7 regression tests are missing.' }
if (-not $profile.Contains('isFaronTearObjectiveActive')) { throw 'Faron Tear objective stage gate is missing.' }
if (-not $profile.Contains("stageCode || '').trim() === 'F_SP108'")) { throw 'Faron Woods stage gate is missing.' }
if (-not $profile.Contains('activeFaronTearObjectives')) { throw 'Faron Tears current-objective prioritization is missing.' }
if (-not $profile.Contains('strictRamBeat && isFaronTearAchievement(achievement)')) { throw 'Inactive Faron Tear story fallback guard is missing.' }
if (-not $stateEngine.Contains('prevents a stale 0-16 metric from following the player into')) { throw 'Forest Temple Tear counter guard is missing.' }
if (-not $renderer.Contains('isFaronTearObjectiveActive')) { throw 'Renderer Tear counter guard is missing.' }

Write-Host 'Applied RA Companion v0.5.7 Faron Tears current-objective and Forest Temple counter gating.'
