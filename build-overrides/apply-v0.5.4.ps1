$ErrorActionPreference = 'Stop'

$patchArchive = 'build-overrides/v0.5.4.patch.gz.b64'
if (-not (Test-Path $patchArchive)) { throw 'v0.5.4 source patch archive is missing.' }
$patchPath = Join-Path $env:RUNNER_TEMP 'ra-companion-v0.5.4.patch'
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

if (-not (Test-Path 'app/src/main.tsx')) { throw 'v0.5.3 working source is missing.' }
if (-not (Test-Path 'app/src/AppPages.tsx')) { throw 'v0.5.3 stable page module is missing.' }

& git apply --check --ignore-space-change --ignore-whitespace --directory=app $patchPath
if ($LASTEXITCODE -ne 0) { throw 'v0.5.4 patch preflight failed.' }
& git apply --ignore-space-change --ignore-whitespace --directory=app $patchPath
if ($LASTEXITCODE -ne 0) { throw 'v0.5.4 patch application failed.' }

$pkg = Get-Content 'app/package.json' -Raw | ConvertFrom-Json
$main = Get-Content 'app/src/main.tsx' -Raw
$pages = Get-Content 'app/src/AppPages.tsx' -Raw
$stateEngine = Get-Content 'app/src/profiles/twilightPrincessState.ts' -Raw
$reader = Get-Content 'app/tools/ram-reader.ps1' -Raw
$styles = Get-Content 'app/src/styles.css' -Raw

if ($pkg.version -ne '0.5.4') { throw "Expected app version 0.5.4, got $($pkg.version)" }
if (-not (Test-Path 'app/src/__tests__/v054.regression.test.tsx')) { throw 'v0.5.4 regression tests are missing.' }

# Startup update banner. The existing startup check must remain silent on network failure.
if (-not $main.Contains('checkForUpdates(false)')) { throw 'Automatic startup update check is missing.' }
if (-not $main.Contains('<UpdateBanner />')) { throw 'Global update banner is not mounted.' }
if (-not $main.Contains('dismissedUpdateVersion')) { throw 'Session-only update dismissal state is missing.' }
if (-not $pages.Contains('export function UpdateBanner()')) { throw 'UpdateBanner component is missing.' }
if (-not $pages.Contains('Update now')) { throw 'Update-now action is missing from banner.' }
if (-not $pages.Contains('Later')) { throw 'Later action is missing from banner.' }
if (-not $styles.Contains('.v5-update-banner')) { throw 'Amber update banner styling is missing.' }

# Generic read-only live actor scan + first two achievement consumers.
if (-not $reader.Contains('public static class ActorMemoryScanner')) { throw 'Live actor memory scanner is missing.' }
if (-not $reader.Contains('$PROC_DOG = 0x010C')) { throw 'Dog process mapping is missing.' }
if (-not $reader.Contains('$PROC_CUCCO = 0x0108')) { throw 'Cucco process mapping is missing.' }
if (-not $reader.Contains('fopAcStts_CARRY_NOW_e')) { throw 'Carry-now actor state detection is missing.' }
if (-not $reader.Contains('$_.Action -eq 15')) { throw 'Cucco ACTION_PLAY control detection is missing.' }
if (-not $reader.Contains('actors = $actors')) { throw 'Actor summary is not exported to renderer state.' }
if (-not $stateEngine.Contains("id === '419985'")) { throw 'The Hero of Puppies live actor rule is missing.' }
if (-not $stateEngine.Contains("id === '419988'")) { throw 'McFly Cucco live actor rule is missing.' }
if (-not $stateEngine.Contains("'Puppy nearby'")) { throw 'Puppy nearby guidance is missing.' }
if (-not $stateEngine.Contains("'Cucco control active'")) { throw 'Cucco control guidance is missing.' }
if (-not $stateEngine.Contains("TWILIGHT_GAME_STATE_ENGINE = 'tp-gz2e01-v2'")) { throw 'v2 actor-aware Game State Engine marker is missing.' }

# Preserve the important v0.5.3 regressions.
if ($main.Contains('function SettingsPage(')) { throw 'SettingsPage regressed to a nested component.' }
if (-not $pages.Contains('RA Companion v{version}')) { throw 'Dynamic packaged version UI regressed.' }
if (-not $stateEngine.Contains("id === '449436'")) { throw 'Pump up the King v0.5.3 rule regressed.' }
if (-not $pkg.scripts.'test:regressions') { throw 'Regression test script is missing.' }

Write-Host 'Applied RA Companion v0.5.4 startup-update banner and live actor detection patch.'
