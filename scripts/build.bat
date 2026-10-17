@echo off
setlocal EnableExtensions

REM ─────────────────────────────────────────────────────────────────────
REM  scripts\build.bat — Windows launcher for scripts\build.ps1
REM
REM  Runs the PowerShell build script with an execution-policy bypass,
REM  so users never need to change their system policy to build Nova.
REM  The PowerShell script handles its own end-of-run pause, so this
REM  launcher only pauses if it fails to launch PowerShell in the first
REM  place.
REM
REM  Usage (from the repo root, or from this folder):
REM    scripts\build.bat                 standard release build
REM    scripts\build.bat -Clean          wipe caches, then build
REM    scripts\build.bat -FrontendOnly   frontend only
REM    scripts\build.bat -NoBundle       raw executable, no installers
REM    scripts\build.bat -SkipInstall    skip npm install (for CI)
REM    scripts\build.bat -NoPause        skip the final Enter-to-exit pause
REM ─────────────────────────────────────────────────────────────────────

REM Move to this script's own directory so relative paths work no matter
REM where the user invokes it from.
cd /d "%~dp0"

REM Prefer PowerShell 7+ (pwsh) if available, otherwise fall back to
REM Windows PowerShell 5.1 which ships with every modern Windows.
set "PS_EXE="
where pwsh >nul 2>nul
if %ERRORLEVEL% equ 0 (
    set "PS_EXE=pwsh"
) else (
    where powershell >nul 2>nul
    if %ERRORLEVEL% equ 0 (
        set "PS_EXE=powershell"
    )
)

if not defined PS_EXE (
    echo.
    echo [!!] PowerShell not found. This script requires either pwsh or powershell.
    echo      Install PowerShell 7:  https://aka.ms/powershell
    echo.
    pause
    exit /b 1
)

REM Verify the companion script is present next to this .bat.
if not exist "%~dp0build.ps1" (
    echo.
    echo [!!] build.ps1 not found next to build.bat.
    echo      Both files must sit in the same scripts\ folder.
    echo.
    pause
    exit /b 1
)

REM Launch the PowerShell script. It pauses at the end on its own, so
REM no additional `pause` is needed here — that would just prompt twice.
"%PS_EXE%" -NoProfile -NoLogo -ExecutionPolicy Bypass -File "%~dp0build.ps1" %*

endlocal & exit /b %ERRORLEVEL%