@echo off
setlocal
cd /d "%~dp0"
title RA Companion - Clean Reinstall

echo.
echo [RA Companion] node_modules wordt verwijderd en opnieuw geinstalleerd.
echo Dit kan problemen met beschadigde dependencies oplossen.
echo.

if exist "node_modules\" rmdir /s /q "node_modules"
if exist "package-lock.json" del /q "package-lock.json"

call npm install
if errorlevel 1 (
    echo.
    echo [ERROR] Opnieuw installeren is mislukt.
    echo.
    pause
    exit /b 1
)

echo.
echo [OK] Clean reinstall voltooid.
echo Start de app nu met START.bat.
echo.
pause
endlocal
