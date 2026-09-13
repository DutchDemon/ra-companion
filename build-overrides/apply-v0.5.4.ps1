$ErrorActionPreference = 'Stop'

$patchParts = @(Get-ChildItem 'build-overrides/v0.5.4.patch.part*.b64' | Sort-Object Name)
if ($patchParts.Count -ne 4) { throw "Expected 4 v0.5.4 patch chunks, found $($patchParts.Count)." }
$patchPath = Join-Path $env:RUNNER_TEMP 'ra-companion-v0.5.4.patch'

# Reassemble small source-controlled chunks and decode byte-exactly. The final
# patch hash is pinned before git is allowed to apply anything.
$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) { throw 'Python is required to decode the v0.5.4 patch archive.' }
& python -c "import base64,gzip,pathlib,glob,sys; s=''.join(pathlib.Path(p).read_text().strip() for p in sorted(glob.glob(sys.argv[1]))); pathlib.Path(sys.argv[2]).write_bytes(gzip.decompress(base64.b64decode(s)))" 'build-overrides/v0.5.4.patch.part*.b64' $patchPath
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $patchPath)) { throw 'v0.5.4 patch decompression failed.' }
$patchHash = (Get-FileHash $patchPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($patchHash -ne '294e90193f2a605c40dd2a32edaa8e413328593056ec461d283e91b135edf8b6') { throw "v0.5.4 patch SHA256 mismatch: $patchHash" }

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
