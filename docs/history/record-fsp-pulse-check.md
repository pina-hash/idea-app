---
title: "FSP Pulse Check"
date: 2026-07-11
branches: []
migrations: []
subsystems: ["FRC / FSP / feedback"]
record_order: 71
---

## FSP Pulse Check

`/fsp-pulse` is a **separate, later tool from `/fsp-tech-selection` above**.
The earlier tool's specific proposal (a 4-of-6 ranking framed as tech
selection) was rejected; `/fsp-pulse` is NOT a revival of it and never uses the
"Tech Selection" name or framing. It is a **non-binding interest pulse**: a
snapshot to help staff plan FSP outreach and support, with **no bearing on
official pathway assignment** (said explicitly in-component, both as a
prominent banner above the form and a short reminder near the save status).
`/fsp-tech-selection` and its `$lib/fsp/*` code are untouched and unlinked (no
longer referenced from `/fsp`); do not delete them, they just have no more
entry points.

- **Forked, not shared**, into its own `src/lib/fsp-pulse/` directory (own
  `client.ts`, `FspPulse.svelte`), except the six-pathway data, which is
  re-exported from `$lib/fsp/techs.ts` (`src/lib/fsp-pulse/techs.ts`) rather
  than duplicated. Reuses `$lib/fsp/fsp-theme.css` (the neutral Bosco Tech
  navy/gold theme) as-is.
- **Two differences from the original tool's ranking:** all **six** pathways
  are rankable (`MAX_PICKS = FSP_TECHS.length`, was capped at 4), and ranking
  is only one of two independent questions now.
- **FRC interest, a second independent question.** A single-select segmented
  control (Yes / Maybe / Not sure yet / No) stored as `frcInterest` in the same
  payload. **Neither question gates the other**: autosave fires once a name is
  entered AND at least one of (a pathway is picked, FRC interest is answered)
  is true, so a student who only answers the FRC question (no ranking at all)
  still saves, and vice versa. See `hasAnswered` in `FspPulse.svelte`.
- **Not Supabase, separate Apps Script deployment.** Writes directly to
  `PUBLIC_FSP_PULSE_APPS_SCRIPT_URL` (its own env var, read at RUNTIME via
  `$env/dynamic/public`, distinct from `PUBLIC_FSP_APPS_SCRIPT_URL`). Same
  upsert-by-email, current-state-only contract as the original tool, documented
  at the top of `src/lib/fsp-pulse/client.ts`; GET/POST payloads additionally
  carry `frcInterest`.
- **Auth** mirrors the original tool exactly: reuses Google OAuth restricted to
  `@boscotech.net`, with the same prototype-phase `@boscotech.edu` allowance
  (must revert before real FSP use, per the on-page banner).
- **`/fsp-pulse/preview`** is the same static, no-auth Sheets-style staff demo
  pattern, extended with an FRC Interest column (leftmost data column,
  color-coded Yes/Maybe/Not sure yet/No) and six ranked-choice columns instead
  of four.
- **Dev harness** `/dev/fsp-pulse` (404 in production, no auth/network) mounts
  the real `FspPulse` with a mock signed-in student and an injected fake save
  endpoint, following the same pattern as `/dev/fsp-tech-selection`, plus entry
  states for an FRC-only partial save.
- **`/fsp/class`** (the FSP class-materials page) links to this tool under a
  "Pulse Check" divider, card id "Pathway Pulse".

