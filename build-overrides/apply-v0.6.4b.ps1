$ErrorActionPreference = 'Stop'

$testPath = 'app/src/__tests__/v064.overlay-stability.test.ts'
if (-not (Test-Path $testPath)) { throw 'v0.6.4 regression test is missing before test-fix patch.' }

$test = Get-Content $testPath -Raw
$malformed = @"
    expect(electron).not.toContain('overlayWindow.setPosition(
    Math.round(overlayMoveSession.startBounds.x + dx)');
"@
$overbroad = "    expect(electron).not.toContain('overlayWindow.setPosition(');"
$targeted = "    expect(electron).toContain('overlayWindow.setBounds({');"

if ($test.Contains($malformed)) {
  $test = $test.Replace($malformed, $targeted)
} elseif ($test.Contains($overbroad)) {
  $test = $test.Replace($overbroad, $targeted)
} elseif (-not $test.Contains($targeted)) {
  throw 'Could not find the v0.6.4 overlay move test assertion to repair.'
}

[IO.File]::WriteAllText((Resolve-Path $testPath), $test, [Text.UTF8Encoding]::new($false))
Write-Host 'Applied targeted v0.6.4 overlay move regression-test fix.'
