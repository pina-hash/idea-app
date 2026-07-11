# Builds FspPawnAddin.dll WITHOUT Visual Studio, using the C# compiler that
# ships inside the .NET Framework itself (C# 5; the sources are kept
# C# 5-compatible on purpose, enforced by LangVersion=5 in the csproj).
#
# With Visual Studio or Build Tools installed, prefer:
#   msbuild FspPawnAddin.csproj /p:Configuration=Release
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File build.ps1
#   powershell -ExecutionPolicy Bypass -File build.ps1 -SolidWorksApiDir "D:\SOLIDWORKS\api\redist"

param(
    [string]$SolidWorksApiDir = "C:\Program Files\SOLIDWORKS Corp\SOLIDWORKS\api\redist",
    [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Join-Path $root "bin\$Configuration"

$fw = Join-Path $env:windir "Microsoft.NET\Framework64\v4.0.30319"
$csc = Join-Path $fw "csc.exe"
if (-not (Test-Path $csc)) {
    throw "The .NET Framework compiler was not found at $csc. Install .NET Framework 4.8 (or build with Visual Studio)."
}
if (-not (Test-Path (Join-Path $SolidWorksApiDir "SolidWorks.Interop.sldworks.dll"))) {
    throw "SOLIDWORKS interop assemblies not found in `"$SolidWorksApiDir`". Pass -SolidWorksApiDir pointing at your install's api\redist folder."
}

New-Item -ItemType Directory -Force $out | Out-Null

# Copy the interops next to the output (same as the csproj's Private=True), so
# regasm and SOLIDWORKS resolve them beside the add-in DLL. swcommands holds
# swCommands_e (the RunCommand ids); it is NOT part of swconst.
foreach ($name in "sldworks", "swconst", "swpublished", "swcommands") {
    Copy-Item (Join-Path $SolidWorksApiDir "SolidWorks.Interop.$name.dll") $out -Force
}

$sources = Get-ChildItem $root -Recurse -Filter *.cs |
    Where-Object { $_.FullName -notmatch '\\(bin|obj)\\' } |
    Select-Object -ExpandProperty FullName

$dll = Join-Path $out "FspPawnAddin.dll"

& $csc /nologo /target:library /optimize+ /platform:anycpu /warn:4 `
    "/out:$dll" `
    "/r:$(Join-Path $out 'SolidWorks.Interop.sldworks.dll')" `
    "/r:$(Join-Path $out 'SolidWorks.Interop.swconst.dll')" `
    "/r:$(Join-Path $out 'SolidWorks.Interop.swpublished.dll')" `
    "/r:$(Join-Path $out 'SolidWorks.Interop.swcommands.dll')" `
    $sources
if ($LASTEXITCODE -ne 0) { throw "csc failed with exit code $LASTEXITCODE" }

Write-Host ""
Write-Host "Built $dll"
Write-Host "Next: double-click register.bat and choose Run as administrator."
Write-Host "Or manually, from an elevated prompt:"
Write-Host "  $env:windir\Microsoft.NET\Framework64\v4.0.30319\RegAsm.exe /codebase `"$dll`""
