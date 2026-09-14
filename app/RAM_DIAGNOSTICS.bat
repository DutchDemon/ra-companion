@echo off
setlocal
for %%I in ("%~f0") do set "APPDIR=%%~dpI"
cd /d "%APPDIR%"
title RA Companion - RAM Diagnostics

set "PS64=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if exist "%SystemRoot%\Sysnative\WindowsPowerShell\v1.0\powershell.exe" set "PS64=%SystemRoot%\Sysnative\WindowsPowerShell\v1.0\powershell.exe"

"%PS64%" -NoProfile -ExecutionPolicy Bypass -File "%APPDIR%tools\ram-diagnostics.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if /I "%~1"=="-SelfTest" (
  echo Diagnostics self-test finished with exit code %EXIT_CODE%.
) else (
  echo Diagnostics stopped.
  pause
)
endlocal & exit /b %EXIT_CODE%
