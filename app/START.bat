@echo off
setlocal
cd /d "%~dp0"
title RA Companion v0.4.4

where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo [ERROR] Node.js is niet gevonden.
    echo Installeer Node.js 20 of nieuwer en start daarna START.bat opnieuw.
    echo https://nodejs.org/
    echo.
    pause
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    echo.
    echo [ERROR] npm is niet gevonden.
    echo Installeer Node.js opnieuw en zorg dat npm is meegeinstalleerd.
    echo.
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo.
    echo [RA Companion] Eerste start - dependencies worden geinstalleerd...
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo [ERROR] Installatie is mislukt.
        echo Probeer INSTALL.bat of CLEAN_REINSTALL.bat.
        echo.
        pause
        exit /b 1
    )
)

echo.
echo [RA Companion v0.4.4] Starten...
echo [RA Companion] Overlay aan/uit: Ctrl+Shift+O
echo [RA Companion] Click-through: Ctrl+Shift+C
echo.
call npm run dev

if errorlevel 1 (
    echo.
    echo [ERROR] RA Companion is onverwacht gestopt.
    echo Je kunt CLEAN_REINSTALL.bat proberen als dit blijft gebeuren.
    echo.
    pause
)

endlocal
