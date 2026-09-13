$ErrorActionPreference = 'Stop'

$readerPath = 'app/tools/ram-reader.ps1'
if (-not (Test-Path $readerPath)) { throw 'v0.5.4 RAM reader is missing.' }

$reader = Get-Content $readerPath -Raw
$hadUShortArray = $reader.Contains('[ushort[]]')
$hadUShortScalar = $reader.Contains('[ushort]')
if (-not $hadUShortArray -and -not $hadUShortScalar) {
  throw 'Expected the v0.5.4 ushort actor-scan cast, but no ushort cast was found.'
}

# Windows PowerShell 5.1 does not reliably resolve the C#-style [ushort]
# type name in this code path. The live actor scan runs inside a guarded
# try/catch, so that failure was silently converted into zero nearby actors.
# System.UInt16's PowerShell accelerator is [uint16], which is compatible with
# both Windows PowerShell 5.1 and modern PowerShell.
$reader = $reader.Replace('[ushort[]]', '[uint16[]]')
$reader = $reader.Replace('[ushort]', '[uint16]')
[IO.File]::WriteAllText((Resolve-Path $readerPath), $reader, [Text.UTF8Encoding]::new($false))

$fixedReader = Get-Content $readerPath -Raw
if ($fixedReader.Contains('[ushort[]]') -or $fixedReader.Contains('[ushort]')) {
  throw 'Unsupported ushort cast remains in the RAM reader.'
}
if (-not $fixedReader.Contains('[uint16')) {
  throw 'UInt16 compatibility cast was not written to the RAM reader.'
}
if (-not $fixedReader.Contains('public static class ActorMemoryScanner')) {
  throw 'Live actor scanner regressed while applying v0.5.5.'
}
if (-not $fixedReader.Contains('$PROC_DOG = 0x010C')) {
  throw 'Dog actor mapping regressed while applying v0.5.5.'
}
if (-not $fixedReader.Contains('$PROC_CUCCO = 0x0108')) {
  throw 'Cucco actor mapping regressed while applying v0.5.5.'
}
if (-not $fixedReader.Contains('$_.Action -eq 15')) {
  throw 'Cucco ACTION_PLAY detection regressed while applying v0.5.5.'
}

$pkgPath = 'app/package.json'
$pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
if ($pkg.version -ne '0.5.4') { throw "Expected package version 0.5.4 before v0.5.5 bump, got $($pkg.version)" }
$pkg.version = '0.5.5'
[IO.File]::WriteAllText((Resolve-Path $pkgPath), ($pkg | ConvertTo-Json -Depth 100) + "`n", [Text.UTF8Encoding]::new($false))

$lockPath = 'app/package-lock.json'
if (Test-Path $lockPath) {
  $lock = Get-Content $lockPath -Raw | ConvertFrom-Json
  if ($lock.version -eq '0.5.4') { $lock.version = '0.5.5' }
  $rootPackage = $lock.packages.PSObject.Properties['']
  if ($rootPackage -and $rootPackage.Value.version -eq '0.5.4') {
    $rootPackage.Value.version = '0.5.5'
  }
  [IO.File]::WriteAllText((Resolve-Path $lockPath), ($lock | ConvertTo-Json -Depth 100) + "`n", [Text.UTF8Encoding]::new($false))
}

$finalPkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
if ($finalPkg.version -ne '0.5.5') { throw "Expected app version 0.5.5, got $($finalPkg.version)" }

Write-Host 'Applied RA Companion v0.5.5 Windows PowerShell live-actor compatibility fix.'
