@echo off
setlocal EnableExtensions

REM ============================================================================
REM  IDEA FSP Pawn Build SolidWorks add-in - one-click COM UNregistration.
REM  Counterpart of register.bat; see that file for how the DLL is located.
REM ============================================================================

title IDEA FSP Pawn Build add-in - Unregister

if "%~1"=="/elevated" goto main
net session >nul 2>&1
if %errorlevel% neq 0 goto elevate
goto main

:elevate
echo Requesting administrator privileges...
powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList '/elevated' -Verb RunAs"
exit /b

:main
set "DLL=%~dp0FspPawnAddin.dll"
if not exist "%DLL%" set "DLL=%~dp0bin\Release\FspPawnAddin.dll"
set "REGASM=%SystemRoot%\Microsoft.NET\Framework64\v4.0.30319\RegAsm.exe"

echo ============================================================
echo   IDEA FSP Pawn Build SolidWorks add-in - UNREGISTER
echo ============================================================
echo.
echo   Add-in DLL: "%DLL%"
echo.

if not exist "%DLL%" (
    echo   [X] DLL not found; nothing to unregister from this folder.
    echo.
    pause
    exit /b 1
)

if not exist "%REGASM%" (
    echo   [X] 64-bit .NET Framework RegAsm was not found at:
    echo       "%REGASM%"
    echo.
    pause
    exit /b 1
)

echo   Unregistering with 64-bit RegAsm...
echo.
"%REGASM%" /u "%DLL%"
set "RC=%errorlevel%"
echo.

if "%RC%"=="0" (
    echo   [OK] Unregistered. SOLIDWORKS will no longer list the add-in.
) else (
    echo   [X] Unregistration FAILED ^(RegAsm exit code %RC%^).
    echo       Make sure this ran as administrator.
)
echo.
pause
endlocal
exit /b %RC%
