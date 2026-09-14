$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$reader = Join-Path $scriptDir 'ram-reader.ps1'

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
Write-Host 'Starting live diagnostics. Press Ctrl+C to stop.'
Write-Host ''

& $reader -TargetPid ([int]$target.Id) -PollMs 300
