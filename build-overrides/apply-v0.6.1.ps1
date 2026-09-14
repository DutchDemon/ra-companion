$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$tempGz = Join-Path $env:RUNNER_TEMP 'ra-companion-v061.py.gz'
$tempPy = Join-Path $env:RUNNER_TEMP 'ra-companion-v061.py'

$parts = Get-ChildItem (Join-Path $PSScriptRoot 'v0.6.1-transform.part*.b64') | Sort-Object Name
if ($parts.Count -lt 1) {
    throw 'Missing v0.6.1 transform payload parts.'
}
$payloadB64 = ($parts | ForEach-Object { (Get-Content $_.FullName -Raw).Trim() }) -join ''
[IO.File]::WriteAllBytes($tempGz, [Convert]::FromBase64String($payloadB64))

$input = [IO.File]::OpenRead($tempGz)
try {
    $gzip = [IO.Compression.GZipStream]::new($input, [IO.Compression.CompressionMode]::Decompress)
    try {
        $output = [IO.File]::Create($tempPy)
        try {
            $gzip.CopyTo($output)
        } finally {
            $output.Dispose()
        }
    } finally {
        $gzip.Dispose()
    }
} finally {
    $input.Dispose()
}

Push-Location $repoRoot
try {
    & python $tempPy
    if ($LASTEXITCODE -ne 0) {
        throw "v0.6.1 transform failed with exit code $LASTEXITCODE"
    }
} finally {
    Pop-Location
    Remove-Item $tempGz, $tempPy -Force -ErrorAction SilentlyContinue
}
