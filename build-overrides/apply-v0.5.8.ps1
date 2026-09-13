$ErrorActionPreference = 'Stop'

$profilePath = 'app/src/profiles/twilightPrincess.ts'
if (-not (Test-Path $profilePath)) { throw 'v0.5.7 Twilight Princess context engine is missing.' }

$profile = Get-Content $profilePath -Raw
$gatePattern = "String\((?<stage>(?:[A-Za-z_$][A-Za-z0-9_$]*\.)?stageCode)\s*\|\|\s*''\)\.trim\(\)\s*===\s*'F_SP108'"
$gateMatches = [regex]::Matches($profile, $gatePattern)
if ($gateMatches.Count -ne 1) {
  Write-Host 'F_SP108 source context:'
  ($profile -split "`r?`n" | Where-Object { $_ -like '*F_SP108*' }) | ForEach-Object { Write-Host $_ }
  throw "Expected exactly one v0.5.7 Faron Tear stage gate, found $($gateMatches.Count)."
}
$stageExpression = $gateMatches[0].Groups['stage'].Value
$newGate = "['F_SP108', 'R_SP108', 'D_SB10'].includes(String($stageExpression || '').trim())"
$profile = [regex]::Replace($profile, $gatePattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $newGate }, 1)
[IO.File]::WriteAllText((Resolve-Path $profilePath), $profile, [Text.UTF8Encoding]::new($false))

$testPath = 'app/src/__tests__/v058.regression.test.ts'
$test = @'
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('v0.5.8 Faron Tear Hunt subarea coverage', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/profiles/twilightPrincess.ts'), 'utf8');

  it('keeps the Tear objective active in Faron Woods, Faron Woods House and the Faron Woods Tunnel', () => {
    expect(source).toMatch(/\['F_SP108', 'R_SP108', 'D_SB10'\]\.includes\(String\((?:[A-Za-z_$][A-Za-z0-9_$]*\.)?stageCode \|\| ''\)\.trim\(\)\)/);
  });

  it('removes the single-stage-only v0.5.7 gate', () => {
    expect(source).not.toMatch(/String\([^\n]*stageCode \|\| ''\)\.trim\(\) === 'F_SP108'/);
  });

  it('does not broaden the Tear Hunt gate to Forest Temple', () => {
    const gate = source.match(/\['F_SP108', 'R_SP108', 'D_SB10'\]\.includes\([^\n]+\)/)?.[0] || '';
    expect(gate).not.toContain('D_MN05');
  });
});
'@
[IO.File]::WriteAllText((Join-Path (Get-Location) $testPath), $test + "`n", [Text.UTF8Encoding]::new($false))

$pkgPath = 'app/package.json'
$pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
if ($pkg.version -ne '0.5.7') { throw "Expected package version 0.5.7 before v0.5.8 bump, got $($pkg.version)" }
$pkg.version = '0.5.8'
[IO.File]::WriteAllText((Resolve-Path $pkgPath), ($pkg | ConvertTo-Json -Depth 100) + "`n", [Text.UTF8Encoding]::new($false))

$lockPath = 'app/package-lock.json'
if (Test-Path $lockPath) {
  $lock = Get-Content $lockPath -Raw | ConvertFrom-Json
  if ($lock.version -eq '0.5.7') { $lock.version = '0.5.8' }
  $rootPackage = $lock.packages.PSObject.Properties['']
  if ($rootPackage -and $rootPackage.Value.version -eq '0.5.7') {
    $rootPackage.Value.version = '0.5.8'
  }
  [IO.File]::WriteAllText((Resolve-Path $lockPath), ($lock | ConvertTo-Json -Depth 100) + "`n", [Text.UTF8Encoding]::new($false))
}

$finalProfile = Get-Content $profilePath -Raw
$finalPkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
if ($finalPkg.version -ne '0.5.8') { throw "Expected app version 0.5.8, got $($finalPkg.version)" }
if (-not (Test-Path $testPath)) { throw 'v0.5.8 regression tests are missing.' }
if (-not $finalProfile.Contains("['F_SP108', 'R_SP108', 'D_SB10'].includes(String(")) { throw 'Faron Tear Hunt subarea gate is missing.' }
if ($finalProfile -match "String\([^\n]*stageCode \|\| ''\)\.trim\(\) === 'F_SP108'") { throw 'Single-stage Faron Tear gate is still present.' }

Write-Host 'Applied RA Companion v0.5.8 Faron Tear Hunt subarea coverage fix.'
