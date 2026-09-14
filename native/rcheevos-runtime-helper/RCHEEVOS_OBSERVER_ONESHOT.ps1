$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

Write-Host '==================================================' -ForegroundColor Cyan
Write-Host ' RA Companion v0.7 - rcheevos Observer One-Shot'
Write-Host '==================================================' -ForegroundColor Cyan
Write-Host ''
Write-Host 'This test is READ-ONLY. It does not submit achievements, start an RA session, or write Dolphin memory.'
Write-Host 'The achievement definition below is a synthetic measured probe, not a real RetroAchievements unlock.'
Write-Host ''

$helper = Join-Path $PSScriptRoot 'ra-runtime-helper.exe'
if (-not (Test-Path $helper)) {
    Write-Host '[ERROR] ra-runtime-helper.exe must be in the same folder as this script.' -ForegroundColor Red
    pause
    exit 2
}

$all = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -match '^Dolphin' })
if ($all.Count -eq 0) {
    Write-Host '[ERROR] No Dolphin process found. Start a GameCube game first.' -ForegroundColor Red
    pause
    exit 3
}

$target = $all |
    Sort-Object @{ Expression = {
        if ($_.MainWindowTitle -match 'Twilight\s+Princess') { 0 }
        elseif (-not [string]::IsNullOrWhiteSpace($_.MainWindowTitle)) { 1 }
        else { 2 }
    }}, Id |
    Select-Object -First 1

$probeId = 700000001
$startStageRaAddress = 0x0040AFC0
$probeDefinition = 'M:0xH0040AFC0>=255'

# Windows PowerShell 5.1 may serialize operator characters using JSON unicode escapes.
# The native helper protocol currently expects the raw rcheevos ASCII definition, so
# construct this diagnostic command literally. Electron's JSON.stringify path does
# not have this PowerShell-specific behavior.
$attachJson = '{"id":1,"command":"attachDolphin","pid":' + [string]([int]$target.Id) + '}'
$readJson = '{"id":2,"command":"readMemory","address":4239296,"numBytes":13}'
$activateJson = '{"id":3,"command":"activateAchievement","achievementId":700000001,"definition":"M:0xH0040AFC0>=255"}'
$frame1Json = '{"id":4,"command":"evaluateFrame"}'
$frame2Json = '{"id":5,"command":"evaluateFrame"}'
$statusJson = '{"id":6,"command":"achievementStatus","achievementId":700000001}'
$shutdownJson = '{"id":7,"command":"shutdown"}'

$commands = @(
    $attachJson,
    $readJson,
    $activateJson,
    $frame1Json,
    $frame2Json,
    $statusJson,
    $shutdownJson
)

try {
    $rawLines = @($commands | & $helper)
    if ($LASTEXITCODE -ne 0) { throw "ra-runtime-helper.exe exited with code $LASTEXITCODE." }
    $messages = @($rawLines | Where-Object { $_ } | ForEach-Object { $_ | ConvertFrom-Json })

    $ready = $messages | Where-Object { $_.type -eq 'ready' } | Select-Object -First 1
    $attach = $messages | Where-Object { $_.command -eq 'attachDolphin' } | Select-Object -First 1
    $memory = $messages | Where-Object { $_.command -eq 'readMemory' } | Select-Object -First 1
    $activation = $messages | Where-Object { $_.command -eq 'activateAchievement' } | Select-Object -First 1
    $frames = @($messages | Where-Object { $_.command -eq 'evaluateFrame' })
    $status = $messages | Where-Object { $_.command -eq 'achievementStatus' } | Select-Object -First 1

    if (-not $ready -or -not $ready.observerEvaluation) { throw 'Helper did not advertise observer evaluation.' }
    if (-not $attach -or -not $attach.ok -or -not $attach.attached) { throw 'Could not attach read-only to Dolphin.' }
    if (-not $memory -or -not $memory.ok) { throw 'Could not read the StartStage bytes.' }
    if (-not $activation -or -not $activation.ok) { throw 'Synthetic rcheevos measured probe could not be activated.' }
    if ($frames.Count -ne 2 -or @($frames | Where-Object { -not $_.ok }).Count -ne 0) { throw 'rcheevos frame evaluation failed.' }
    if (-not $status -or -not $status.ok -or -not $status.measured) { throw 'rcheevos did not expose measured progress for the probe.' }

    $expectedByte = [Convert]::ToInt32($memory.hex.Substring(0, 2), 16)
    $measuredMatches = ([int]$status.measuredValue -eq $expectedByte -and [int]$status.measuredTarget -eq 255)

    Write-Host ('Dolphin PID:       {0}' -f $target.Id)
    Write-Host ('Window:            {0}' -f $target.MainWindowTitle)
    Write-Host ('rcheevos:          {0} ({1})' -f $ready.rcheevosVersion, $ready.rcheevosTag)
    Write-Host ('Mapping:           {0}' -f $attach.mappingName)
    Write-Host ('Read-only:         {0}' -f $attach.readOnly)
    Write-Host ('Game code:         {0}' -f $attach.gameCode)
    Write-Host ('Stage raw:         {0}' -f $memory.hex)
    Write-Host ('Stage text:        {0}' -f $memory.ascii)
    Write-Host ''
    Write-Host '--- rcheevos observer ---' -ForegroundColor Cyan
    Write-Host ('Probe definition:  {0}' -f $probeDefinition)
    Write-Host ('Trigger state:     {0}' -f $status.state)
    Write-Host ('Measured:          {0} / {1}' -f $status.measuredValue, $status.measuredTarget)
    Write-Host ('Expected byte:     {0} (0x{1})' -f $expectedByte, $memory.hex.Substring(0, 2))
    Write-Host ('Runtime events:    {0} + {1}' -f $frames[0].eventCount, $frames[1].eventCount)
    Write-Host ''

    if ($measuredMatches) {
        Write-Host '[OK] rc_runtime_do_frame read the same live Dolphin byte through the rcheevos peek callback.' -ForegroundColor Green
        Write-Host '[OK] End-to-end observer path confirmed: rcheevos -> native GameCube bridge -> Dolphin RAM.' -ForegroundColor Green
    } else {
        Write-Host '[FAIL] Measured progress did not match the byte read directly from the native bridge.' -ForegroundColor Red
        exit 5
    }
}
catch {
    Write-Host ('[ERROR] {0}' -f $_.Exception.Message) -ForegroundColor Red
    Write-Host ''
    Write-Host 'Raw helper output:' -ForegroundColor DarkYellow
    $rawLines | ForEach-Object { Write-Host $_ }
    pause
    exit 4
}

Write-Host ''
Write-Host 'No official achievement state was changed.'
pause
