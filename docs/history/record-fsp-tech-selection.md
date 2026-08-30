---
title: "FSP tech selection"
date: 2026-07-08
branches: []
migrations: []
subsystems: ["FRC / FSP / feedback"]
record_order: 69
---

`/fsp-tech-selection` is a **schoolwide** (not IDEA-branded) live tech-ranking
tool for incoming freshmen during the Freshman Summer Program (FSP), reached
COLD from a QR code (no prior idea-app visit assumed). It is the one place that
deliberately breaks the app's IDEA-green / Orbitron aesthetic: neutral Bosco
Tech navy/gold with a standard system-sans stack, all scoped under `.fsp-root`
(opaque, `z-index:1`, so the root `.bg-fx` scanlines never show through, like
`.frc-root`). Theme tokens live in `src/lib/fsp/fsp-theme.css`.

- **Not Supabase.** This tool writes DIRECTLY to a Google Apps Script web app;
  it touches no Supabase table. The endpoint URL is `PUBLIC_FSP_APPS_SCRIPT_URL`,
  read at RUNTIME via `$env/dynamic/public` so an unset placeholder never breaks
  the build (the picker still works, it just shows "saving is not configured
  yet"). Contract the deployed Apps Script must honor is documented at the top of
  `src/lib/fsp/client.ts`: GET `?email=` returns the student's current row for
  prefill; POST (JSON body, `text/plain` to stay a CORS simple request) UPSERTS
  keyed on email. **Only current state is kept, no history**; a returning student
  over FSP days 1-3 overwrites their own row.
- **Auth reuses the existing Google OAuth flow**, restricted to `@boscotech.net`
  (a client-side domain check plus a Google `hd` hint; wrong-domain accounts get
  a "switch account" screen). Sign-in returns to `/fsp-tech-selection`
  (`/auth/callback` honors `next`). No new auth system.
- **The registry** `src/lib/fsp/techs.ts` (plain data, client-safe) lists the six
  pathways as ranking options, reusing the `$lib/pathways` identity colors + icons
  for the chips while the chrome stays neutral.
- **The tool UI + save orchestration** is `src/lib/fsp/FspTechSelection.svelte`
  (factored out so the harness mounts the exact same component): name/ID fields
  gate the picker (Last Name, First Name, and "Student ID (if known)", which may
  be blank); a tap-to-rank picker builds an ordered list of EXACTLY 4 of 6 with a
  hard **no-duplicate** guard (a chosen chip shows its rank and the remaining
  chips disable once 4 are picked) and free remove/reorder; on every change to a
  complete selection it **debounces ~800ms** then saves. Saving is
  **last-write-wins** (state read fresh each attempt, a mid-flight edit coalesces
  into one more run) with **retry + exponential backoff** (5 attempts, capped 8s),
  a persistent **saving / saved / error** indicator (never a silent failure; an
  exhausted save shows a Retry and keeps slow-retrying while the page is open),
  and a `sendBeacon` flush on page hide as a durability net. A native
  `<form action>` + `<noscript>` plain-select fallback posts the same fields so
  the page still functions with JS disabled.
- **`/fsp-tech-selection/preview`** is a STATIC, no-auth demo of the staff
  tracking sheet (Google Sheets-style: toolbar, frozen header with sort arrows,
  six color-coded tech columns, sample rows, a 1st-choice tally). It touches no
  real data and never calls the Apps Script endpoint. Linked from the top of the
  tool as "See how staff view this". The sample rows/layout are a faithful
  stand-in; swap in the exact standalone mockup HTML when ready.
- **Dev harness** `/dev/fsp-tech-selection` (404 in production, no auth /
  network) mounts the REAL `FspTechSelection` with a mock signed-in student and
  an injected fake save endpoint (toggle latency, "always fail", or "queue N
  failures"), plus an on-screen endpoint log, so the ranking interaction, the
  duplicate guard, the debounce collapsing, and the error/retry/backoff are
  browser-verifiable end to end without OAuth or the live sheet.
- **FSP Pawn Build Wizard (SolidWorks add-in, `tools/fsp-pawn-addin/`):** a
  second .NET Framework 4.8 SOLIDWORKS COM add-in (own GUID, task pane "PAWN
  BUILD"), structurally mirroring the GAUNTLET add-in (C# 5 sources so the
  no-VS `build.ps1` framework-csc path works; framework MSBuild also builds
  it; four interops referenced, `swcommands` added because the Revolve
  RunCommand id lives there, not in `swconst`). It replaces the FSP 13-step
  paper guide with a five-phase wizard for freshmen with no CAD experience:
  Phase 0 BUILDS the starting part itself (no classroom template file) via
  `NewDocument`/`NewPart`, sets it to IPS with a SINGLE
  `swUnitSystem = swUnitSystem_IPS` call (setting `swUnitsLinear` as well flips
  the system to "Custom", verified against live SOLIDWORKS), sketches a Y-axis
  construction centerline on the front plane, renames that sketch feature to
  `Pawn_Profile`, and saves it as `[name]_pawnN.sldprt` into an `IDEA_FSP`
  Desktop folder it creates if missing (OneDrive-redirected Desktop honored);
  then one-click open of the `Pawn_Profile` sketch, a 2 s closed-loop poll
  (`ISketch.GetSketchContours`, which returns only closed contours) gating the
  REVOLVE button, auto-launched Revolved Boss/Base with the construction
  centerline pre-selected and a 1 s feature-count poll detecting completion,
  then auto-save + STEP AP214 export + a pre-filled Gmail compose to the
  teacher. AP214 is forced via the `swStepAP` system preference (the shipped
  interops have no `IExportStepData`). Classroom values (teacher email,
  subject/body, folder/sketch names) are constants at the top of
  `PawnWizardPanel.cs`, each overridable WITHOUT a recompile by a
  `pawn-wizard-config.txt` dropped next to the DLL. Not part of the SvelteKit
  build; install/registration (self-elevating `register.bat` around 64-bit
  RegAsm) is in its `README-install.md`.

