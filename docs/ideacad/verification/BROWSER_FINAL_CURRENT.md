# Final IdeaCAD browser fixture verification

Date: 2026-09-15 (local work session). This supplements `BROWSER_VERIFICATION.md`.

## Harness and database

Ran the permanent portable harness exactly:

```powershell
node node_modules/vitest/vitest.mjs run --config tools/ideacad-kernel-spike/browser-bridge.config.mjs --configLoader native --no-file-parallelism
```

It applied the current complete migration chain through 0216 to a new embedded
PostgreSQL database and served the actual `/ideacad` loader, transports, and
`IdeaCadApp` through `/dev/ideacad-app`. All identities and records were synthetic
local fixtures. There was no production access. The final 0216 readiness SELECT
was run in a read-only transaction on this same fixture: **27/27 true**, including
the sketch helper and authenticated/anonymous grant checks. Evidence:
`browser-final-readiness.json`. The readiness SELECT is the final statement in
`supabase/migrations/0216_ideacad_direct_documents.sql`.

`POST /finish` completed normally: **1 test file / 1 test passed**, 501.40 seconds.
Permanent harness output: `.output/ideacad-browser/browser-bridge-evidence.json`.

## Reproducible administrator CAS flow

1. Open two browser tabs with the dev route's `actor=admin`, using the endpoint
   and token from the current `.output/ideacad-browser/browser-bridge-info.json`.
2. In each tab click **IdeaBlade limits**. Both display Revision 1 / 680 g.
3. In tab A change **Assembly mass maximum (g)** to 650; click **Save limits**.
4. In tab B change the same field to 700; click **Save limits**.
5. Tab B displays the stale-revision error and retains its draft 700. The server
   retains only revisions 1 and 2, with revision 2 at 650 g; it never stores 700.
6. Tab B: **Close advisory settings**, then **IdeaBlade limits**. This loads
   Revision 2 and 650 g without a full page reload.

Both final settings screenshots were visually inspected:

- `admin-final-1440.png`: 1440 × 900, initial revision 1.
- `admin-final-375.png`: 375 × 812, recovered revision 2 / 650 g.

At 375 the actual main element has max-width `none` and padding `0px`; no element
had horizontal overflow more than 2 px. Controls and the Save limits button fit.
The optional `admin-stale-1440.png` capture is actually 1280 × 720 (the second tab
had the browser's default viewport before the explicit phone override); use the
two `admin-final-*` images for documentation.

## Reproducible concurrent document save recovery

Use two owner tabs against the same private seed. For renames use native input:
click **Document name**, Ctrl+A, type, Tab. Click **Documents** to flush the save.
The browser tool's programmatic fill does not reliably reproduce native change
events on this field.

1. Both tabs opened the same saved `Recovery saved A` at revision 2. (A first
   rename had already saved before a development rebuild refreshed both tabs.)
2. Tab A renamed it to `Recovery saved A2`, clicked **Documents**, and the chooser
   showed the new saved title at revision 3.
3. Tab B renamed it to `Recovery unsaved B`, clicked **Documents**, and stayed in
   the modeler with the **Save recovery** panel. Its stale save was refused.
4. **Reopen saved model** → **Cancel** retained `Recovery unsaved B` and the
   unsaved error state.
5. **Reopen saved model** → **Discard and reopen** loaded `Recovery saved A2`,
   displayed **Saved**, and removed the recovery panel.
6. **Undo** restored `Recovery saved A`. **Documents** saved successfully and the
   chooser showed that title. SQL proves revision 4 with `undoes_seq=2`, meaning
   the refreshed server history was used rather than the discarded local action.

The accepted title history is seq 1→revision 2, seq 2→revision 3, and seq 3→revision
4 undoing seq 2. There is no history entry for the rejected `Recovery unsaved B`.
Evidence: `browser-final-current-evidence.json` and inspected
`save-recovery-1440.png` (1440 × 900).

**Save backup** was present and enabled, but its download was not separately
executed in this pass. Recovery used a zero-body seed; solid geometry and normal
backup/export paths have separate verification by the kernel/UI worker.

At 1280 width the long header save-error text overflowed vertically, while the
recovery panel stayed usable. At 1440 the header fitted. This visual limitation
was corrected before handoff. A fresh database fixture and the permanent
`tools/ideacad-kernel-spike/verify-recovery.mjs` replay passed at 1280 and 375 px:
the header, save indicator and recovery panel fit with zero horizontal overflow.
The phone error state reserves enough footer height for its Retry control.
The replay also verified Cancel, Discard/reopen and subsequent durable Undo.
See the visually inspected `save-recovery-1280.png`, `save-recovery-375.png` and
`recovery-layout-report.json`. The replay recorded zero page errors.

The final owner tab recorded no console errors or warnings:
`browser-final-current-console.json`. Temporary browser tabs were closed and the
viewport override was reset before finishing the bridge.
