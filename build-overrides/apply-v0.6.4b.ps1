$ErrorActionPreference = 'Stop'

$testPath = 'app/src/__tests__/v064.overlay-stability.test.ts'
if (-not (Test-Path $testPath)) { throw 'v0.6.4 regression test is missing before test-fix patch.' }

$test = Get-Content $testPath -Raw
$bad = @"
    expect(electron).not.toContain('overlayWindow.setPosition(
    Math.round(overlayMoveSession.startBounds.x + dx)');
"@
$good = "    expect(electron).not.toContain('overlayWindow.setPosition(');"

if (-not $test.Contains($bad)) {
  if (-not $test.Contains($good)) { throw 'Could not find malformed v0.6.4 overlay test assertion.' }
} else {
  $test = $test.Replace($bad, $good)
  [IO.File]::WriteAllText((Resolve-Path $testPath), $test, [Text.UTF8Encoding]::new($false))
}

Write-Host 'Applied v0.6.4b regression-test literal fix.'
