# IDEA // GAUNTLET SolidWorks Add-in

A .NET Framework 4.8 SOLIDWORKS COM add-in (C#, `ISwAddin`) that replaces the
two VBA capture macros (`static/gauntlet/idea-gauntlet-start.bas` and
`idea-gauntlet-submit.bas`) with a persistent task pane. It reads the active
part, verifies Speedrun runs, and submits them to the IDEA portal using the
exact same server contract as the macros, so the two stay interchangeable,
even mid-run.

## What the task pane shows

- **Active part** name and its **unit system** (IPS, MMGS, CGS, MKS, or
  Custom, detected from the document).
- **Live mass**, primary readout in the part's own convention: **lb for IPS,
  g for MMGS/metric**, with the other unit always shown alongside. This
  resolves the "modeled in IPS but the challenge asks for grams" mismatch
  natively. Volume (mm3), surface area (mm2), and feature count are shown too.
- A **target mass** field (typed from the challenge screen, unit selectable
  g/lb) with a live delta, so students can sanity-check before submitting.
- The **code field** (the 8-character single-use code from the GAUNTLET
  Speedrun screen), **START RUN** and **SUBMIT RUN** buttons, and a status box
  with the server's verdict (pass/fail, server-timed seconds, rank).

## The run flow (identical to the macros)

1. On the website, open a Speedrun challenge and press Start: the site calls
   `gauntlet_speedrun_reveal`, which shows the drawing and mints the
   8-character code.
2. In SOLIDWORKS, on a **new, blank part**, enter the code and press
   **START RUN**. The add-in verifies zero solid volume locally, then POSTs
   the start event; the server stamps `started_at` and returns a `run_id`,
   which is written into the part as the `GAUNTLET_RUN_ID` custom property
   (the same property the Start macro writes).
3. Model the part. Do not close it; the run id lives in the open document.
4. Press **SUBMIT RUN**. The add-in reads mass properties in system (SI)
   units, normalizes to mm3 / mm2 / g, and POSTs them with the code and run
   id. The server computes elapsed time from its own start stamp, verifies
   correctness **on volume** within the challenge tolerance, and returns the
   result, which the pane displays.

Solo runs may submit repeatedly with the same code (each re-times from the
start event; only correct runs rank). The code is single-use per reveal and
expires about 30 minutes after reveal.

## Server contract (must stay in lockstep with the site)

Both calls are PostgREST RPC POSTs to the same Supabase project the website
uses, authenticated with the **public anon key** (not a secret; the code is
the credential). Defined in `supabase/migrations/0016_gauntlet_speedrun_start.sql`
and `0017_gauntlet_run_status.sql`.

```
POST https://<project>.supabase.co/rest/v1/rpc/gauntlet_macro_start
  headers: apikey: <anon>, Authorization: Bearer <anon>, Content-Type: application/json
  body:    { "p_code": "<8-char code>", "p_volume_mm3": 0 }
  returns: { "run_id": "<uuid>", "started_at": "<timestamptz>" }

POST https://<project>.supabase.co/rest/v1/rpc/gauntlet_macro_submit
  body:    { "p_code": "...", "p_run_id": "<uuid from GAUNTLET_RUN_ID>",
             "p_volume_mm3": n, "p_surface_area_mm2": n,
             "p_feature_count": n, "p_mass_g": n }
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

From an **elevated** (administrator) prompt, using the **64-bit** regasm:

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

To unregister:

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

SOLIDWORKS is a registered trademark of Dassault Systemes SolidWorks Corp.
This project is not affiliated with or endorsed by Dassault Systemes; the name
is used only to identify compatibility.
