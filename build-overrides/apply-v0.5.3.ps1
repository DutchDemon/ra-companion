$ErrorActionPreference = 'Stop'

$patchArchive = 'build-overrides/v0.5.3.patch.gz.b64'
if (-not (Test-Path $patchArchive)) { throw 'v0.5.3 source patch archive is missing.' }
$patchPath = Join-Path $env:RUNNER_TEMP 'ra-companion-v0.5.3.patch'
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

if (-not (Test-Path 'app/src/main.tsx')) { throw 'v0.5.2 working source is missing.' }
if (-not (Test-Path 'app/src/profiles/twilightPrincessState.ts')) { throw 'Twilight Princess state engine is missing.' }

& git apply --check --ignore-space-change --ignore-whitespace --directory=app $patchPath
if ($LASTEXITCODE -ne 0) { throw 'v0.5.3 patch preflight failed.' }
& git apply --ignore-space-change --ignore-whitespace --directory=app $patchPath
if ($LASTEXITCODE -ne 0) { throw 'v0.5.3 patch application failed.' }

$pkg = Get-Content 'app/package.json' -Raw | ConvertFrom-Json
$main = Get-Content 'app/src/main.tsx' -Raw
$pages = Get-Content 'app/src/AppPages.tsx' -Raw
$stateEngine = Get-Content 'app/src/profiles/twilightPrincessState.ts' -Raw
$guide = Get-Content 'app/src/profiles/twilightPrincessGuide.ts' -Raw
$electron = Get-Content 'app/electron/main.cjs' -Raw
$preload = Get-Content 'app/electron/preload.cjs' -Raw
$types = Get-Content 'app/src/global.d.ts' -Raw

if ($pkg.version -ne '0.5.3') { throw "Expected app version 0.5.3, got $($pkg.version)" }
if (-not (Test-Path 'app/src/__tests__/v053.regression.test.tsx')) { throw 'v0.5.3 regression tests are missing.' }
if ($main.Contains('function SettingsPage(') -or $main.Contains('function Dashboard(') -or $main.Contains('function UpdateCard(')) { throw 'Page components are still nested in App and can remount during live refresh.' }
if (-not $main.Contains('<AppViewContext.Provider value={appView}>')) { throw 'Stable page context wiring is missing.' }
if (-not $main.Contains('whatMattersAchievements')) { throw 'Deep live missables are not wired into What Matters Now.' }
if (-not $pages.Contains('export function SettingsPage()')) { throw 'Top-level SettingsPage is missing.' }
if (-not $pages.Contains('RA Companion v{version}')) { throw 'Dynamic update-card version rendering is missing.' }
if ($pages.Contains('RA Companion v0.5.1') -or $pages.Contains('RA Companion v0.5.2') -or $pages.Contains('RA Companion v0.5.3')) { throw 'A hardcoded app version remains in the page UI.' }
if (-not $electron.Contains("ipcMain.handle('app:version', () => app.getVersion())")) { throw 'Dynamic Electron app-version IPC is missing.' }
if (-not $preload.Contains('getAppVersion')) { throw 'App-version preload API is missing.' }
if (-not $types.Contains('getAppVersion: () => Promise<string>')) { throw 'App-version renderer type is missing.' }
if (-not $stateEngine.Contains("id === '449436'")) { throw 'Pump up the King achievement-ID rule is missing.' }
if (-not $stateEngine.Contains('bottleSlotPresent')) { throw 'Filled bottle inventory fallback is missing.' }
if (-not $stateEngine.Contains("state('tracked', 'Challenge save eligible'")) { throw 'Challenge eligibility noise reduction is missing.' }
if (-not $guide.Contains("'pump up the king': guide(")) { throw 'Pump up the King guide mapping is missing.' }
if (-not $pkg.scripts.'test:regressions') { throw 'Regression test script is missing.' }

Write-Host 'Applied RA Companion v0.5.3 focus, dynamic-version and Pump up the King fixes.'
