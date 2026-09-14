@echo off
setlocal
cd /d "%~dp0"
title RA Companion - RAM Diagnostics

set "PS64=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if exist "%SystemRoot%\Sysnative\WindowsPowerShell\v1.0\powershell.exe" set "PS64=%SystemRoot%\Sysnative\WindowsPowerShell\v1.0\powershell.exe"

"%PS64%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\ram-diagnostics.ps1"
echo.
echo Diagnostics stopped.
pause
endlocal
