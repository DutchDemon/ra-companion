$ErrorActionPreference = 'Stop'

function Replace-Exactly {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Old,
    [Parameter(Mandatory = $true)][string]$New,
    [int]$Expected = 1
  )

  if (-not (Test-Path $Path)) { throw "Missing file: $Path" }
  $text = Get-Content $Path -Raw
  $count = ([regex]::Matches($text, [regex]::Escape($Old))).Count
  if ($count -ne $Expected) {
    throw "Expected $Expected occurrence(s) in $Path, found $count for: $Old"
  }
  $text = $text.Replace($Old, $New)
  [IO.File]::WriteAllText((Resolve-Path $Path), $text, [Text.UTF8Encoding]::new($false))
}

$mainPath = 'app/electron/main.cjs'
$preloadPath = 'app/electron/preload.cjs'
$typesPath = 'app/src/global.d.ts'
$uiPath = 'app/src/main.tsx'

# The game-progress endpoint is authoritative. Recent-achievement history must never
# re-create an unlock that RetroAchievements says is currently locked/reset.
Replace-Exactly $mainPath 'const RA_PROGRESS_CACHE_MS = 60000;' 'const RA_PROGRESS_CACHE_MS = 15000;'
Replace-Exactly $mainPath 'async function getRaProgress(gameId = TWILIGHT_PRINCESS_GAME_ID) {' 'async function getRaProgress(gameId = TWILIGHT_PRINCESS_GAME_ID, force = false) {'
Replace-Exactly $mainPath 'if (sameTarget && raProgressCache.result && now - raProgressCache.fetchedAt < RA_PROGRESS_CACHE_MS) {' 'if (!force && sameTarget && raProgressCache.result && now - raProgressCache.fetchedAt < RA_PROGRESS_CACHE_MS) {'
Replace-Exactly $mainPath 'if (sameTarget && raProgressCache.pending) {' 'if (!force && sameTarget && raProgressCache.pending) {'
Replace-Exactly $mainPath 'async function getSnapshot() {' 'async function getSnapshot(forceRa = false) {'
Replace-Exactly $mainPath '    getRaProgress(gameId),' '    getRaProgress(gameId, forceRa),'
Replace-Exactly $mainPath '  const progress = mergeRecentHardcoreUnlocks(baseProgress, recent, gameId);' '  const progress = baseProgress;'
Replace-Exactly $mainPath "  ipcMain.handle('snapshot:get', () => getSnapshot());" "  ipcMain.handle('snapshot:get', (_event, forceRa) => getSnapshot(Boolean(forceRa)));"

# Allow the renderer to explicitly bypass the short RA cache after account changes
# or when the user requests a real refresh.
Replace-Exactly $preloadPath "  getSnapshot: () => ipcRenderer.invoke('snapshot:get')," "  getSnapshot: (forceRa = false) => ipcRenderer.invoke('snapshot:get', forceRa),"
Replace-Exactly $typesPath '      getSnapshot: () => Promise<Snapshot>;' '      getSnapshot: (forceRa?: boolean) => Promise<Snapshot>;'
Replace-Exactly $uiPath '  async function refresh() {' '  async function refresh(forceRa = false) {'
Replace-Exactly $uiPath '      setSnapshot(await window.raCompanion.getSnapshot());' '      setSnapshot(await window.raCompanion.getSnapshot(forceRa));'

$ui = Get-Content $uiPath -Raw
$saveRefreshPattern = "setTimeout\(\(\) => setSaved\(''\), 1600\);\s*refresh\(\);"
$saveRefreshMatches = [regex]::Matches($ui, $saveRefreshPattern)
if ($saveRefreshMatches.Count -ne 1) { throw "Expected one settings refresh call, found $($saveRefreshMatches.Count)." }
$ui = [regex]::Replace(
  $ui,
  $saveRefreshPattern,
  "setTimeout(() => setSaved(''), 1600);`n    refresh(true);",
  1
)
[IO.File]::WriteAllText((Resolve-Path $uiPath), $ui, [Text.UTF8Encoding]::new($false))

# Regression coverage for account isolation, progress resets and forced refreshes.
$testPath = 'app/src/__tests__/v059.ra-authoritative-progress.test.ts'
$test = @'
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('v0.5.9 authoritative RetroAchievements progress', () => {
  const electron = readFileSync(resolve(process.cwd(), 'electron/main.cjs'), 'utf8');
  const preload = readFileSync(resolve(process.cwd(), 'electron/preload.cjs'), 'utf8');
  const ui = readFileSync(resolve(process.cwd(), 'src/main.tsx'), 'utf8');
  const types = readFileSync(resolve(process.cwd(), 'src/global.d.ts'), 'utf8');

  it('never promotes recent-history entries back into completed progress', () => {
    expect(electron).toContain('const progress = baseProgress;');
    expect(electron).not.toContain('const progress = mergeRecentHardcoreUnlocks(baseProgress, recent, gameId);');
  });

  it('keys cached progress by user and keeps cache lifetime short', () => {
    expect(electron).toContain("raProgressCache.username === config.username");
    expect(electron).toContain('const RA_PROGRESS_CACHE_MS = 15000;');
  });

  it('supports a forced authoritative RA refresh end-to-end', () => {
    expect(electron).toContain('async function getRaProgress(gameId = TWILIGHT_PRINCESS_GAME_ID, force = false)');
    expect(electron).toContain('getRaProgress(gameId, forceRa)');
    expect(electron).toContain("ipcMain.handle('snapshot:get', (_event, forceRa) => getSnapshot(Boolean(forceRa)))");
    expect(preload).toContain("getSnapshot: (forceRa = false) => ipcRenderer.invoke('snapshot:get', forceRa)");
    expect(types).toContain('getSnapshot: (forceRa?: boolean) => Promise<Snapshot>;');
    expect(ui).toContain('async function refresh(forceRa = false)');
    expect(ui).toContain('window.raCompanion.getSnapshot(forceRa)');
    expect(ui).toContain('refresh(true);');
  });

  it('still clears all RA caches when account settings are saved', () => {
    expect(electron).toContain("raProgressCache = { gameId: null, username: '', fetchedAt: 0, result: null, pending: null };");
    expect(electron).toContain("raRecentCache = { username: '', fetchedAt: 0, result: null, pending: null };");
    expect(electron).toContain("raProfileCache = { username: '', fetchedAt: 0, result: null, pending: null };");
  });
});
'@
[IO.File]::WriteAllText((Join-Path (Get-Location) $testPath), $test + "`n", [Text.UTF8Encoding]::new($false))

# Version bump.
$pkgPath = 'app/package.json'
$pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
if ($pkg.version -ne '0.5.8') { throw "Expected package version 0.5.8 before v0.5.9 bump, got $($pkg.version)" }
$pkg.version = '0.5.9'
[IO.File]::WriteAllText((Resolve-Path $pkgPath), ($pkg | ConvertTo-Json -Depth 100) + "`n", [Text.UTF8Encoding]::new($false))

$lockPath = 'app/package-lock.json'
if (Test-Path $lockPath) {
  $lock = Get-Content $lockPath -Raw | ConvertFrom-Json
  if ($lock.version -eq '0.5.8') { $lock.version = '0.5.9' }
  $rootPackage = $lock.packages.PSObject.Properties['']
  if ($rootPackage -and $rootPackage.Value.version -eq '0.5.8') {
    $rootPackage.Value.version = '0.5.9'
  }
  [IO.File]::WriteAllText((Resolve-Path $lockPath), ($lock | ConvertTo-Json -Depth 100) + "`n", [Text.UTF8Encoding]::new($false))
}

$finalMain = Get-Content $mainPath -Raw
$finalPkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
if ($finalPkg.version -ne '0.5.9') { throw "Expected app version 0.5.9, got $($finalPkg.version)" }
if (-not (Test-Path $testPath)) { throw 'v0.5.9 regression test is missing.' }
if ($finalMain.Contains('const progress = mergeRecentHardcoreUnlocks(baseProgress, recent, gameId);')) { throw 'Recent-achievement history still overrides authoritative RA progress.' }
if (-not $finalMain.Contains('const progress = baseProgress;')) { throw 'Authoritative progress assignment is missing.' }

Write-Host 'Applied RA Companion v0.5.9 authoritative RA progress hotfix.'
