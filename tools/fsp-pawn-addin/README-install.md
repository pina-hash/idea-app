# IDEA FSP Pawn Build - SolidWorks Add-in

A .NET Framework 4.8 SOLIDWORKS COM add-in (C#, `ISwAddin`, WinForms task
pane) that walks incoming FSP freshmen through building and submitting a
chess pawn. It replaces the 13-step paper guide with a five-phase wizard in
a persistent "PAWN BUILD" task pane: copy + rename + open the classroom
template, one-click open of the `Pawn_Profile` sketch, live closed-loop
detection while the student draws, an auto-launched Revolve with the axis
pre-selected, then auto-save, STEP AP214 export, and a pre-filled Gmail
compose for submission to the teacher.

Same structure and build conventions as the GAUNTLET add-in
(`tools/solidworks-addin/`), with its own identity:

- Title: **IDEA FSP Pawn Build** - Description: *Pawn build wizard for FSP
  students* - Task pane: **PAWN BUILD**
- Class GUID `{4D61B045-40AC-4FE7-9B65-51C2CD1CA138}` (unique; not the
  GAUNTLET add-in's GUID)

## Building (Release)

Prerequisites: SOLIDWORKS installed locally (any recent version; the interop
assemblies ship with it under `api\redist` and are forward-compatible, so a
DLL built against 2022 interops loads in 2025) and .NET Framework 4.8 (in
Windows 10/11 by default). Four interops are referenced: `sldworks`,
`swconst`, `swpublished`, and `swcommands` (the Revolve command id lives in
`swcommands`, not `swconst`).

**With MSBuild** (Visual Studio, Build Tools, or the in-box framework
MSBuild that every Windows machine has):

```
C:\Windows\Microsoft.NET\Framework64\v4.0.30319\MSBuild.exe FspPawnAddin.csproj /p:Configuration=Release
```

**Without any of that** (uses the C# compiler inside the .NET Framework; the
sources are kept C# 5-compatible for this):

```
powershell -ExecutionPolicy Bypass -File build.ps1
```

If SOLIDWORKS is installed somewhere non-standard, point at its interops with
`/p:SolidWorksApiDir="D:\SOLIDWORKS\api\redist"` (msbuild) or
`-SolidWorksApiDir "D:\..."` (build.ps1).

Output: `bin\Release\FspPawnAddin.dll` with the four
`SolidWorks.Interop.*.dll` copied beside it. Keep them together; regasm and
SOLIDWORKS resolve the interops next to the add-in.

## Registering on each classroom computer

SOLIDWORKS discovers COM add-ins through the **Windows registry**, not
through manifest files - there is no Tools > Add-ins > Browse in SOLIDWORKS.
The `FspPawnAddin.addin` file in this folder is a deployment descriptor
(the canonical record of the add-in's identity for scripts and humans); the
actual registration is one of these:

**Easiest, double-click:** after building, copy this folder (or just the
DLLs + the two `.bat` files) to the classroom machine, then right-click
**`register.bat`** and choose **Run as administrator** (a plain double-click
works too: it requests elevation itself). It locates `FspPawnAddin.dll` next
to itself or under `bin\Release`, registers it with the 64-bit RegAsm using
`/codebase`, and prints a clear success or failure message. **`unregister.bat`**
reverses it. The RA0000 "not signed" warning is expected and harmless.

**Manual, fallback:** from an elevated prompt, using the **64-bit** regasm:

```
C:\Windows\Microsoft.NET\Framework64\v4.0.30319\RegAsm.exe /codebase "<full path>\FspPawnAddin.dll"
```

Registration also writes the SOLIDWORKS add-in keys automatically
(`HKLM\SOFTWARE\SolidWorks\Addins\{...}` and the per-user `AddInsStartup`
key), so the add-in appears in SOLIDWORKS immediately. Start SOLIDWORKS,
open **Tools > Add-Ins**, and check **IDEA FSP Pawn Build** (both columns to
load now and at startup). The PAWN BUILD tab appears in the task pane strip
on the right.

Note: the `AddInsStartup` key is per-user, written for the user who ran the
elevated registration. If students log in under a different Windows account,
they can still enable the startup column themselves once in Tools > Add-Ins.

## Classroom folder setup (per machine / per student account)

The wizard expects, on the **Desktop** of the signed-in student:

```
%USERPROFILE%\Desktop\IDEA_FSP\
    COPY ME - CHESS PAWN TEMPLATE.sldprt
```

The template part must already contain a sketch feature named
**`Pawn_Profile`** with a **vertical construction centerline** on the Y axis
(that centerline is what the wizard pre-selects as the revolve axis, and it
is the "vertical orange line" the on-screen copy refers to).

If the machine's Desktop is OneDrive-redirected, the wizard checks
`%USERPROFILE%\Desktop\IDEA_FSP` first and then the redirected Desktop, so
either location works.

Students' output stays in the same folder: `[name]_pawn1.sldprt` (numbered
up automatically if it exists) plus the exported `[name]_pawn1.stp`.

## Changing the recipient, subject, folder, etc. WITHOUT a recompile

All classroom-facing values live as constants at the top of
`PawnWizardPanel.cs` (`DefaultTeacherEmail`, `DefaultEmailSubject`,
`DefaultEmailBody`, `DefaultFspFolderName`, `DefaultTemplateFileName`,
`DefaultProfileSketchName`) - those are the compiled-in defaults.

To override any of them **without rebuilding**, drop a plain-text file named
**`pawn-wizard-config.txt`** next to `FspPawnAddin.dll` on the classroom
machine, one `KEY=VALUE` per line (`#` starts a comment; keys are
case-insensitive; missing keys keep their defaults):

```
# IDEA FSP Pawn Build overrides
TeacherEmail=someone.else@boscotech.edu
EmailSubject=pawn
EmailBody=Hi, here is my pawn file.
FspFolderName=IDEA_FSP
TemplateFileName=COPY ME - CHESS PAWN TEMPLATE.sldprt
ProfileSketchName=Pawn_Profile
```

The file is read once when the task pane loads (restart SOLIDWORKS after
editing it). A malformed or missing file is ignored and the defaults stand.

Student **name handling** (trimming, filename sanitizing, the `_pawnN`
numbering) is code, in `SanitizeForFileName` / `OnBeginClick` in
`PawnWizardPanel.cs`; changing that logic does require a rebuild.

## STEP AP214 note

The shipped SOLIDWORKS interops expose no `IExportStepData`
(`swExportDataFileType_e` contains only the PDF member), so the export sets
AP214 the documented way instead: the `swStepAP` system preference is set to
`214` immediately before the `SaveAs` call, which is what the STEP
translator reads. Side effect: the machine's Tools > Options > Export > STEP
setting is left on AP214 afterward, which is the desired classroom default
anyway.

## Troubleshooting

- **Add-in not listed in Tools > Add-Ins:** regasm was probably run from the
  32-bit framework (`Framework` instead of `Framework64`) or without
  elevation.
- **"Could not load file or assembly SolidWorks.Interop..."**: the interop
  DLLs are not next to `FspPawnAddin.dll`; rebuild or copy them beside it.
- **"IDEA_FSP ... not found on Desktop":** the folder is missing for that
  student account, or named differently; create it (or set `FspFolderName`
  in the config file).
- **"Pawn_Profile sketch not found":** the template on that machine is stale
  or was re-saved without the sketch; restore the correct template (or set
  `ProfileSketchName` in the config file).
- **Status stuck on "Keep drawing":** the profile has a gap. The wizard's
  STUCK? panel tells the student to reconnect the last point to the first
  and zoom out to check for gaps.
- **Gmail did not open:** the wizard shows the export path anyway; the
  student can open Gmail manually and drag the `.stp` file in (the error
  banner names the recipient and subject).

SOLIDWORKS is a registered trademark of Dassault Systemes SolidWorks Corp.
This project is not affiliated with or endorsed by Dassault Systemes; the
name is used only to identify compatibility.
