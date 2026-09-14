@echo off
setlocal
for %%I in ("%~f0") do set "HERE=%%~dpI"
set "PS64=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if exist "%SystemRoot%\Sysnative\WindowsPowerShell\v1.0\powershell.exe" set "PS64=%SystemRoot%\Sysnative\WindowsPowerShell\v1.0\powershell.exe"
"%PS64%" -NoProfile -ExecutionPolicy Bypass -File "%HERE%RCHEEVOS_OBSERVER_ONESHOT.ps1"
endlocal
