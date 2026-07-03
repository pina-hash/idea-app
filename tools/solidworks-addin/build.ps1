# Builds IdeaGauntletAddin.dll WITHOUT Visual Studio, using the C# compiler
# that ships inside the .NET Framework itself (C# 5; the sources are kept
# C# 5-compatible on purpose, enforced by LangVersion=5 in the csproj).
#
# With Visual Studio or Build Tools installed, prefer:
#   msbuild IdeaGauntletAddin.sln /p:Configuration=Release
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File build.ps1
#   powershell -ExecutionPolicy Bypass -File build.ps1 -SolidWorksApiDir "D:\SOLIDWORKS\api\redist"

param(
    [string]$SolidWorksApiDir = "C:\Program Files\SOLIDWORKS Corp\SOLIDWORKS\api\redist",
    [string]$Configuration = "Release",
    # -Package also zips the build into the repo at
    # static/tools/idea-gauntlet-addin.zip, which the site serves DIRECTLY (no
    # Supabase Storage bucket; see ADDIN_DOWNLOAD_PATH in src/lib/gauntlet.ts).
    # Commit the updated zip and bump the "addin" version in
    # static/tools/tools-manifest.json so the Tools page shows the new version.
    [switch]$Package
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$src = Join-Path $root "IdeaGauntletAddin"
$out = Join-Path $src "bin\$Configuration"

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
# regasm and SOLIDWORKS resolve them beside the add-in DLL.
foreach ($name in "sldworks", "swconst", "swpublished") {
    Copy-Item (Join-Path $SolidWorksApiDir "SolidWorks.Interop.$name.dll") $out -Force
}

# System.Web.Extensions (JavaScriptSerializer) lives in the GAC, not the
# framework directory, on some installs; resolve it from either.
$webExtensions = Join-Path $fw "System.Web.Extensions.dll"
if (-not (Test-Path $webExtensions)) {
    $webExtensions = Get-ChildItem "$env:windir\Microsoft.NET\assembly\GAC_MSIL\System.Web.Extensions" -Recurse -Filter "System.Web.Extensions.dll" |
        Select-Object -First 1 -ExpandProperty FullName
    if (-not $webExtensions) { throw "System.Web.Extensions.dll not found; is .NET Framework 4.8 fully installed?" }
}

$sources = Get-ChildItem $src -Recurse -Filter *.cs |
    Where-Object { $_.FullName -notmatch '\\(bin|obj)\\' } |
    Select-Object -ExpandProperty FullName

$dll = Join-Path $out "IdeaGauntletAddin.dll"

& $csc /nologo /target:library /optimize+ /platform:anycpu /warn:4 `
    "/out:$dll" `
    "/r:$(Join-Path $out 'SolidWorks.Interop.sldworks.dll')" `
    "/r:$(Join-Path $out 'SolidWorks.Interop.swconst.dll')" `
    "/r:$(Join-Path $out 'SolidWorks.Interop.swpublished.dll')" `
    "/r:$(Join-Path $fw 'System.Net.Http.dll')" `
    "/r:$webExtensions" `
    $sources
if ($LASTEXITCODE -ne 0) { throw "csc failed with exit code $LASTEXITCODE" }

Write-Host ""
Write-Host "Built $dll"
Write-Host "Next: double-click register.bat and choose Run as administrator."
Write-Host "Or manually, from an elevated prompt:"
Write-Host "  $env:windir\Microsoft.NET\Framework64\v4.0.30319\RegAsm.exe /codebase `"$dll`""

if ($Package) {
    # Bundle the DLL + interops + the install wrappers + README into the zip that
    # students download. register.bat / unregister.bat self-locate and self-elevate,
    # so unzip-and-run is the whole student install. The zip is written straight to
    # static/tools/ so the site serves it directly (no upload step).
    $staticTools = Join-Path $root "..\..\static\tools"
    New-Item -ItemType Directory -Force $staticTools | Out-Null
    $zip = Join-Path $staticTools "idea-gauntlet-addin.zip"
    $staging = Join-Path $out "_pkg"
    if (Test-Path $staging) { Remove-Item -Recurse -Force $staging }
    New-Item -ItemType Directory -Force $staging | Out-Null
    Get-ChildItem $out -Filter *.dll | Copy-Item -Destination $staging -Force
    foreach ($f in "register.bat", "unregister.bat", "README.md") {
        $p = Join-Path $root $f
        if (Test-Path $p) { Copy-Item $p $staging -Force }
    }
    if (Test-Path $zip) { Remove-Item -Force $zip }
    Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $zip -Force
    Remove-Item -Recurse -Force $staging
    Write-Host ""
    Write-Host "Packaged $zip"
    Write-Host "It is already in static/tools, served directly by the site."
    Write-Host "Commit it and bump the 'addin' version in static/tools/tools-manifest.json."
}
