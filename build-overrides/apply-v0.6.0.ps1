$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$payload = Join-Path $PSScriptRoot 'v0.6.0-transform.py.gz.b64'
$tempGz = Join-Path $env:RUNNER_TEMP 'ra-companion-v060.py.gz'
$tempPy = Join-Path $env:RUNNER_TEMP 'ra-companion-v060.py'

if (-not (Test-Path $payload)) {
    throw "Missing v0.6.0 transform payload: $payload"
}

[IO.File]::WriteAllBytes($tempGz, [Convert]::FromBase64String((Get-Content $payload -Raw).Trim()))

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
        throw "v0.6.0 transform failed with exit code $LASTEXITCODE"
    }
} finally {
    Pop-Location
    Remove-Item $tempGz, $tempPy -Force -ErrorAction SilentlyContinue
}
