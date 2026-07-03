@echo off
setlocal EnableExtensions

REM ============================================================================
REM  IDEA // GAUNTLET SolidWorks add-in - one-click COM UNregistration.
REM
REM  Right-click this file and choose "Run as administrator" (or just
REM  double-click it: it re-launches itself elevated). This reverses register.bat.
REM
REM  It finds the add-in DLL relative to this folder - either flat next to this
REM  script (the downloaded zip layout) or under IdeaGauntletAddin\bin\Release
REM  (the build.ps1 source-tree output) - so nothing is hardcoded, and
REM  unregisters it with the 64-bit .NET Framework RegAsm using /unregister.
REM ============================================================================

title IDEA // GAUNTLET add-in - Unregister

REM --- Auto-elevate: relaunch as administrator if we are not already. The
REM     relaunched copy carries a marker arg so it never re-checks (no loop). ---
if "%~1"=="/elevated" goto main
net session >nul 2>&1
if %errorlevel% neq 0 goto elevate
goto main

:elevate
echo Requesting administrator privileges...
powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList '/elevated' -Verb RunAs"
exit /b

:main
REM Prefer the downloaded-zip layout (DLL flat beside this script); fall back to
REM the source-tree build output (build.ps1 -> IdeaGauntletAddin\bin\Release).
set "DLL=%~dp0IdeaGauntletAddin.dll"
if not exist "%DLL%" set "DLL=%~dp0IdeaGauntletAddin\bin\Release\IdeaGauntletAddin.dll"
set "REGASM=%SystemRoot%\Microsoft.NET\Framework64\v4.0.30319\RegAsm.exe"

echo ============================================================
echo   IDEA // GAUNTLET SolidWorks add-in - UNREGISTER
echo ============================================================
echo.
echo   Add-in DLL: "%DLL%"
echo.

if not exist "%DLL%" (
    echo   [X] Add-in DLL not found at the path above.
    echo       RegAsm needs the DLL present to unregister it. If you deleted the
    echo       build, restore it ^(run build.ps1^) and try again.
    echo.
    pause
    exit /b 1
)

if not exist "%REGASM%" (
    echo   [X] 64-bit .NET Framework RegAsm was not found at:
    echo       "%REGASM%"
    echo       Install .NET Framework 4.8 and try again.
    echo.
    pause
    exit /b 1
)

echo   Unregistering with 64-bit RegAsm ^(/unregister^)...
echo.
"%REGASM%" /unregister "%DLL%"
set "RC=%errorlevel%"
echo.

if "%RC%"=="0" (
    echo   [OK] Unregistered successfully. The add-in will no longer load in
    echo        SOLIDWORKS. Run register.bat to add it back.
) else (
    echo   [X] Unregister FAILED ^(RegAsm exit code %RC%^).
    echo       Make sure this ran as administrator.
)
echo.
pause
endlocal
exit /b %RC%
