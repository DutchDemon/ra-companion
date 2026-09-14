@echo off
setlocal
cd /d "%~dp0"
title RA Companion - Installeren

where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo [ERROR] Node.js is niet gevonden.
    echo Installeer Node.js 20 of nieuwer vanaf https://nodejs.org/
    echo en voer daarna INSTALL.bat opnieuw uit.
    echo.
    pause
    exit /b 1
)

echo.
echo [RA Companion] Dependencies installeren/updaten...
echo.
call npm install

if errorlevel 1 (
    echo.
    echo [ERROR] Installatie is mislukt.
    echo.
    pause
    exit /b 1
)

echo.
echo [OK] RA Companion is klaar voor gebruik.
echo Je kunt voortaan gewoon START.bat dubbelklikken.
echo.
pause
endlocal
