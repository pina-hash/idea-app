# IDEA // GAUNTLET SolidWorks Add-in

A .NET Framework 4.8 SOLIDWORKS COM add-in (C#, `ISwAddin`) that replaces the
two VBA capture macros (`static/gauntlet/idea-gauntlet-start.bas` and
`idea-gauntlet-submit.bas`) with a persistent task pane. It reads the active
part, verifies Speedrun runs, and submits them to the IDEA portal using the
exact same server contract as the macros, so the two stay interchangeable,
even mid-run.

## What the task pane shows

- **Active part** name, its **unit system** (IPS, MMGS, CGS, MKS, or
  Custom, detected from the document), and its **applied material** (amber
  "none applied (required to pass)" until one is).
- **Live mass**, primary readout in the part's own convention: **lb for IPS,
  g for MMGS/metric**, with the other unit always shown alongside. This
  resolves the "modeled in IPS but the challenge asks for grams" mismatch
  natively. Volume (mm3), surface area (mm2), and feature count are shown too.
  The live poll reads through `GetMassProperties2` (status-checked, computes
  from current geometry) rather than a one-shot `IMassProperty` object, which
  returns zeros when created mid-command; see `PartReader.cs`.
- A **target mass** field (typed from the challenge screen, unit selectable
  g/lb) with a live delta, so students can sanity-check before submitting.
- The **code field** (the 8-character single-use code from the GAUNTLET
  Speedrun screen), **START RUN** and **SUBMIT RUN** buttons, and a status box
  with the server's verdict (pass/fail, server-timed seconds, rank).

The pane is styled as a neutral, host-matched panel (SOLIDWORKS 2025 light
theme) with a restrained IDEA-green accent; the icon (task pane tab and the
Add-Ins dialog) is an original hex-boss-with-bore mark generated at runtime by
`AddinIcons.cs`, so no binary image ships in the repo.

## The run flow (identical to the macros)

1. On the website, open a Speedrun challenge and press Start: the site calls
   `gauntlet_speedrun_reveal`, which shows the drawing and mints the
   8-character code.
2. In SOLIDWORKS, on a **new, blank part**, enter the code and press
   **START RUN**. The add-in verifies zero solid volume locally, then POSTs
   the start event; the server stamps `started_at` and returns a `run_id`,
   which is written into the part as the `GAUNTLET_RUN_ID` custom property
   (the same property the Start macro writes).
3. Model the part, and **apply the challenge's material**. Do not close the
   part; the run id lives in the open document.
4. Press **SUBMIT RUN**. The add-in reads mass properties in system (SI)
   units, normalizes to mm3 / mm2 / g, reads the applied material name, and
   POSTs them with the code and run id. The server computes elapsed time from
   its own start stamp, verifies correctness **on volume** within the
   challenge tolerance, and **requires the material to match the challenge's
   material** (case-insensitive; a missing or wrong material is rejected
   outright with a clear message and nothing recorded, so fix it and submit
   again on the same clock). The result is displayed in the pane.

Solo runs may submit repeatedly with the same code (each re-times from the
start event; only correct runs rank). The code is single-use per reveal and
expires about 30 minutes after reveal.

## Server contract (must stay in lockstep with the site)

Both calls are PostgREST RPC POSTs to the same Supabase project the website
uses, authenticated with the **public anon key** (not a secret; the code is
the credential). Defined in `supabase/migrations/0016_gauntlet_speedrun_start.sql`,
`0017_gauntlet_run_status.sql`, and `0026_gauntlet_material_gate.sql`.

```
POST https://<project>.supabase.co/rest/v1/rpc/gauntlet_macro_start
  headers: apikey: <anon>, Authorization: Bearer <anon>, Content-Type: application/json
  body:    { "p_code": "<8-char code>", "p_volume_mm3": 0 }
  returns: { "run_id": "<uuid>", "started_at": "<timestamptz>" }

POST https://<project>.supabase.co/rest/v1/rpc/gauntlet_macro_submit
  body:    { "p_code": "...", "p_run_id": "<uuid from GAUNTLET_RUN_ID>",
             "p_volume_mm3": n, "p_surface_area_mm2": n,
             "p_feature_count": n, "p_mass_g": n,
             "p_material": "<applied material name, or null>" }
  returns: { "is_correct", "mode", "elapsed_ms", "score_metric", "rank",
             "target_volume_mm3", "your_volume_mm3", "tolerance_pct" }
```

Timing and grading are entirely server-side; the add-in never sends a clock or
a correctness flag. If a migration changes these RPCs, update
`GauntletClient.cs` in the same change.

## Building

Prerequisites: SOLIDWORKS installed locally (any recent version; the interop
assemblies ship with it under `api\redist`) and .NET Framework 4.8 (in
Windows 10/11 by default).

**With Visual Studio 2019/2022 or Build Tools:**

```
msbuild IdeaGauntletAddin.sln /p:Configuration=Release
```

If SOLIDWORKS is installed somewhere non-standard, point at its interops:

```
msbuild IdeaGauntletAddin.sln /p:Configuration=Release /p:SolidWorksApiDir="D:\SOLIDWORKS\api\redist"
```

**Without Visual Studio** (uses the compiler inside the .NET Framework; the
sources are kept C# 5-compatible for this):

```
powershell -ExecutionPolicy Bypass -File build.ps1
```

Output: `IdeaGauntletAddin\bin\Release\IdeaGauntletAddin.dll` with the three
`SolidWorks.Interop.*.dll` copied beside it. Keep them together; regasm and
SOLIDWORKS resolve the interops next to the add-in.

The project references the interops from the local SOLIDWORKS install and
does not pin a version: no SOLIDWORKS version is hardcoded anywhere, the
add-in detects the running version via `ISldWorks.RevisionNumber()` and shows
it in the pane footer. Interop assemblies are forward-compatible, so a DLL
built against one version loads in that version and newer.

## Registering (COM) and loading in SOLIDWORKS

**Easiest, double-click:** after building (above), use the scripts in this
folder. Right-click **`register.bat`** and choose **Run as administrator** (a
plain double-click works too: it requests elevation itself). It locates the
built DLL next to itself (no path to type), registers it with the 64-bit RegAsm
using `/codebase`, and prints a clear success or failure message, then pauses so
you can read it. **`unregister.bat`** reverses it the same way. If the DLL has
not been built yet, the script tells you to run `build.ps1` first. The RA0000
"not signed" warning is expected and harmless.

**Manual, fallback:** from an **elevated** (administrator) prompt, using the
**64-bit** regasm:

```
C:\Windows\Microsoft.NET\Framework64\v4.0.30319\RegAsm.exe /codebase "<full path>\IdeaGauntletAddin\bin\Release\IdeaGauntletAddin.dll"
```

- `/codebase` lets COM load the DLL from where it sits (no GAC). The RA0000
  "not signed" warning is expected and harmless.
- Registration also writes the SOLIDWORKS add-in keys automatically
  (`HKLM\SOFTWARE\SolidWorks\Addins\{...}` and the per-user
  `AddInsStartup` key), so the add-in appears in SOLIDWORKS immediately.

Start SOLIDWORKS, open **Tools > Add-Ins**, and check **IDEA // GAUNTLET**
(both columns to load now and at startup). The pane appears in the task pane
tab strip on the right.

To unregister, run **`unregister.bat`** (as above), or manually:

```
C:\Windows\Microsoft.NET\Framework64\v4.0.30319\RegAsm.exe /u "<full path>\IdeaGauntletAddin.dll"
```

After rebuilding to the same path, re-registration is not needed; just restart
SOLIDWORKS.

## Troubleshooting

- **Add-in not listed in Tools > Add-Ins:** regasm was probably run from the
  32-bit framework (`Framework` instead of `Framework64`) or without elevation.
- **"Could not load file or assembly SolidWorks.Interop..."**: the interop
  DLLs are not next to `IdeaGauntletAddin.dll`; rebuild or copy them beside it.
- **Network errors on submit:** the add-in needs HTTPS egress to
  `*.supabase.co` (TLS 1.2, enabled explicitly by the add-in).
- **"This part is not blank" on start:** the server (and the pane) require a
  truly empty part, zero solid volume, so all modeling happens on the clock.
- **"No material applied" / "Wrong material" on submit:** apply the
  challenge's material (right-click Material in the FeatureManager tree) with
  the exact library name the challenge states, then submit again; the clock
  keeps running, nothing was recorded.

SOLIDWORKS is a registered trademark of Dassault Systemes SolidWorks Corp.
This project is not affiliated with or endorsed by Dassault Systemes; the name
is used only to identify compatibility.
