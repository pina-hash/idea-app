@echo off
setlocal EnableExtensions

REM ============================================================================
REM  IDEA // GAUNTLET SolidWorks add-in - one-click COM registration.
REM
REM  Right-click this file and choose "Run as administrator" (or just
REM  double-click it: it re-launches itself elevated). unregister.bat reverses it.
REM
REM  It finds the add-in DLL relative to this folder - either flat next to this
REM  script (the downloaded zip layout) or under IdeaGauntletAddin\bin\Release
REM  (the build.ps1 source-tree output) - so nothing is hardcoded, and registers
REM  it with the 64-bit .NET Framework RegAsm using /codebase.
REM ============================================================================

title IDEA // GAUNTLET add-in - Register

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
echo   IDEA // GAUNTLET SolidWorks add-in - REGISTER
echo ============================================================
echo.
echo   Add-in DLL: "%DLL%"
echo.

if not exist "%DLL%" (
    echo   [X] The add-in has not been built yet - DLL not found above.
    echo.
    echo   Build it first, then run this again:
    echo       - open PowerShell in this "solidworks-addin" folder and run
    echo             powershell -ExecutionPolicy Bypass -File build.ps1
    echo       - or build IdeaGauntletAddin.sln in Visual Studio ^(Release^).
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

echo   Registering with 64-bit RegAsm ^(/codebase^)...
echo.
"%REGASM%" /codebase "%DLL%"
set "RC=%errorlevel%"
echo.

if "%RC%"=="0" (
    echo   [OK] Registered successfully.
    echo        Start SOLIDWORKS, open Tools ^> Add-Ins, and tick
    echo        "IDEA // GAUNTLET" to load it. Run unregister.bat to remove it.
    echo        ^(A "RA0000: not signed" warning above is expected and harmless.^)
) else (
    echo   [X] Registration FAILED ^(RegAsm exit code %RC%^).
    echo       Make sure this ran as administrator and that the DLL built OK.
)
echo.
pause
endlocal
exit /b %RC%
