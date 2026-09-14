$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$reader = Join-Path $scriptDir 'ram-reader.ps1'
$helper = Join-Path $scriptDir 'ra-runtime-helper.exe'

Write-Host '=============================================='
Write-Host ' RA Companion - RAM Hook Diagnostics'
Write-Host '=============================================='
Write-Host ''
Write-Host 'Make sure Twilight Princess is currently running in Dolphin.'
Write-Host 'This tool is READ-ONLY and only prints RAM hook diagnostics.'
Write-Host ("PowerShell 64-bit: {0}" -f [Environment]::Is64BitProcess)
Write-Host ("PowerShell path:   {0}" -f (Get-Process -Id $PID).Path)
Write-Host ''

if (-not [Environment]::Is64BitProcess) {
    Write-Host '[ERROR] Diagnostics is running in 32-bit PowerShell.' -ForegroundColor Red
    Write-Host 'Use RAM_DIAGNOSTICS.bat from the RA Companion folder; it forces the native 64-bit host.'
    exit 3
}

$all = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -match '^Dolphin' })
if ($all.Count -eq 0) {
    Write-Host '[ERROR] No Dolphin process was found.' -ForegroundColor Red
    Write-Host 'Open Dolphin, start Twilight Princess, then run this again.'
    exit 1
}

# Prefer a Dolphin process whose window title mentions Twilight Princess,
# then any Dolphin process with a visible window, then the first Dolphin process.
$target = $all |
    Sort-Object @{ Expression = {
        if ($_.MainWindowTitle -match 'Twilight\s+Princess') { 0 }
        elseif (-not [string]::IsNullOrWhiteSpace($_.MainWindowTitle)) { 1 }
        else { 2 }
    }}, Id |
    Select-Object -First 1

if ($null -eq $target -or $target.Id -le 0) {
    Write-Host '[ERROR] Dolphin was detected, but no usable process ID was returned.' -ForegroundColor Red
    Write-Host 'Detected Dolphin processes:'
    $all | ForEach-Object { Write-Host ("  {0}  PID={1}  Window='{2}'" -f $_.ProcessName, $_.Id, $_.MainWindowTitle) }
    exit 2
}

Write-Host ("Dolphin process: {0}" -f $target.ProcessName)
Write-Host ("Dolphin PID:     {0}" -f $target.Id)
Write-Host ("Window title:    {0}" -f $target.MainWindowTitle)
Write-Host ''

if (Test-Path $helper) {
    Write-Host '--- Native v0.7 GameCube memory bridge ---' -ForegroundColor Cyan
    try {
        # rcheevos GameCube logical address 0x0040AFC0 maps to guest 0x8040AFC0.
        # The existing TP reader uses that guest address for the StartStage structure.
        $startStageRaAddress = 0x0040AFC0
        $commands = @(
            (@{ id = 1; command = 'attachDolphin'; pid = [int]$target.Id } | ConvertTo-Json -Compress),
            (@{ id = 2; command = 'memoryStatus' } | ConvertTo-Json -Compress),
            (@{ id = 3; command = 'readMemory'; address = $startStageRaAddress; numBytes = 13 } | ConvertTo-Json -Compress),
            (@{ id = 4; command = 'shutdown' } | ConvertTo-Json -Compress)
        )
        $rawLines = @($commands | & $helper)
        if ($LASTEXITCODE -ne 0) { throw "Native runtime helper exited with code $LASTEXITCODE." }
        $messages = @($rawLines | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | ForEach-Object { $_ | ConvertFrom-Json })
        $ready = $messages | Where-Object { $_.type -eq 'ready' } | Select-Object -First 1
        $attach = $messages | Where-Object { $_.command -eq 'attachDolphin' } | Select-Object -First 1
        $status = $messages | Where-Object { $_.command -eq 'memoryStatus' } | Select-Object -First 1
        $stage = $messages | Where-Object { $_.command -eq 'readMemory' } | Select-Object -First 1

        if (-not $ready -or -not $ready.gameCubeMemoryBridge) { throw 'Native helper did not advertise the GameCube memory bridge.' }
        if (-not $attach -or -not $attach.ok -or -not $attach.attached) { throw 'Native helper could not attach to Dolphin.' }

        Write-Host ("rcheevos:        {0} ({1})" -f $ready.rcheevosVersion, $ready.rcheevosTag)
        Write-Host ("Mapping:          {0}" -f $status.mappingName)
        Write-Host ("Read-only:        {0}" -f $status.readOnly)
        Write-Host ("Memory size:      0x{0:X8} ({1} bytes)" -f [int]$status.memorySize, $status.memorySize)
        Write-Host ("Game code:        {0}" -f $status.gameCode)
        Write-Host ("GameCube magic:   {0}" -f $status.gameCubeMagic)
        Write-Host ("RA 0x0040AFC0 -> guest 0x8040AFC0 -> shared +0x0040AFC0")
        if ($stage -and $stage.ok) {
            Write-Host ("Native stage raw: {0}" -f $stage.hex)
            Write-Host ("Native stage text:{0}" -f $stage.ascii)
        }

        if ($status.gameCode -eq 'GZ2E01' -and $status.gameCubeMagic) {
            Write-Host '[OK] Native bridge sees the expected Twilight Princess USA GameCube image.' -ForegroundColor Green
        } else {
            Write-Host '[WARN] Native bridge attached, but the GameCube header is not the expected GZ2E01 image.' -ForegroundColor Yellow
        }
    }
    catch {
        Write-Host ("[ERROR] Native bridge diagnostic failed: {0}" -f $_.Exception.Message) -ForegroundColor Red
    }
    Write-Host ''
} else {
    Write-Host '[INFO] Native ra-runtime-helper.exe is not present in this build; skipping native comparison.' -ForegroundColor Yellow
    Write-Host ''
}

Write-Host '--- Existing PowerShell live reader ---' -ForegroundColor Cyan
Write-Host 'Compare its gameCode/stageCode with the native values above.'
Write-Host 'Starting live diagnostics. Press Ctrl+C to stop.'
Write-Host ''

& $reader -TargetPid ([int]$target.Id) -PollMs 300
