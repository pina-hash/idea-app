# Direct modeler verification · 2026-09-15

Baseline: `db4ddbe659fdcb3d489e4bf0a3b07b508c48aa33`.
Workspace: `C:/idea-app`. Implementation branch: `codex/ideacad-direct-modeler`.

## Results

| Check | Measured result |
| --- | --- |
| All IdeaCAD tests, file parallelism disabled | 72 files, 1,077 passed, zero failed |
| Final database/engine subset after sketch validation | 83 passed |
| Migration readiness | 27 returned rows, all true |
| Real-browser bracket | Exact volume 2.1714606235490135 in³ after hole and concave fillet |
| Reopen and backup import | Same volume and BREP content; import undo/redo passed |
| Corrupt backup | Refused; open geometry preserved |
| Blank-render negative control | GPU draws disabled: painted fraction 0; acceptance assertion failed |
| Phone canvas | 375 × 734, painted fraction 0.0721163, horizontal overflow 0 |
| DXF | 977 bytes; analytic outline, arc and circular hole; mm units |
| Browser console | Zero page errors in the modeler/export run |
| Concurrent save recovery | Cancel, discard/reopen and durable undo passed; 1280/375 px fit, zero overflow |
| Typecheck | Zero errors, 37 warnings in 20 files, matching baseline |
| Build | Node 24.21.0 compiled and packaged with a local Windows junction fallback |

The original full `npm test` run reported 46 failed/444 passed files and
97 failed/8,778 passed/52 skipped tests. The subsequent focused run above fixes
all IdeaCAD failures. The 39 unrelated failed files were compared with a detached
baseline: 38 failed identically (91 failed tests); the remaining notebook case
reproduced when only its baseline migration's line ending was changed to match
this working copy. All 109 unrelated failure headings matched; see
`baseline-comparison.json`. This is not a claim that the full suite is green.

The Windows build fails without the local fallback because adapter-vercel creates
directory symlinks without a Windows junction type. A process-local preload,
restricted to `.vercel/output/functions`, retried 582 aliases as junctions.
No dependency or production config was modified. That absolute-junction output
is unsuitable for deployment. The default Node 26 host is also outside the
adapter's supported versions; use Node 24 for a normal Linux/CI build.

`npm run history:verify` hit the existing Windows URL-path bug
(`C:\C:\idea-app\docs\history`). The new history entry was separately checked
with the repository's `parseEntry` parser, including its branch, quoted migration,
date and derived-heading shape. No historical entry or shared parser was changed.

## Reproduce

- The original kernel spike: `node tools/ideacad-kernel-spike/serve.mjs`, then
  `node tools/ideacad-kernel-spike/measure.mjs remus`. It uses the committed
  Remus artifacts. The optional OCCT comparison requires `occt-wasm` 5.0.0
  outside the app dependency tree; set `IDEACAD_OCCT_DIST` to its `dist` directory
  before starting the server, then run `measure.mjs occt`.
- `npx vitest run ideacad --no-file-parallelism`
- `npm run check`
- `node tools/ideacad-kernel-spike/dev-server.mjs`, then
  `node tools/ideacad-kernel-spike/verify-workspace.mjs` (installed Chrome).
- `node node_modules/vitest/vitest.mjs run --config tools/ideacad-kernel-spike/browser-bridge.config.mjs --configLoader native --no-file-parallelism`
  starts the isolated PostgreSQL browser fixture. It writes the loopback endpoint
  and random fixture token to `.output/ideacad-browser/browser-bridge-info.json`.
  Open `/dev/ideacad-app?endpoint=<endpoint>&token=<token>&actor=owner` on Vite;
  available synthetic roles are owner/editor/viewer/teacher/stranger/admin.
  POST `/finish` with its fixture header to stop it. These routes are stripped
  from production builds; no production authentication path changes.
- With a fresh running browser fixture, `node tools/ideacad-kernel-spike/verify-recovery.mjs`
  tests concurrent save rejection, responsive recovery, Cancel, discard/reopen and
  subsequent Undo. It stops the fixture when complete.

The browser fixture uses real SQL/RLS through the local PostgREST shim. It does
not test Supabase Auth or deployed PostgREST itself. See `BROWSER_VERIFICATION.md`
for every actual UI action and `browser-ui-replay.mjs` under the tool directory
for recorded interaction helpers.

The final desktop/phone images were opened and visually inspected. The admin and
archive images in the earlier report predate the final chooser reset; their
dialogs fit. `bracket-fillet.png` and `phone.png` are the final export/import run.

## Storage and provenance

One 26-operation exact-box edit corpus stored 26 immutable artifacts: 111,150
logical BREP bytes, 26,392 measured PostgreSQL artifact-row bytes, 51 action rows
occupying 15,177 bytes, plus a 296-byte origin. These are row/corpus measurements,
not a production capacity estimate including indexes, TOAST and future edits.
BREP artifacts are retained for durable undo; retention/compaction is not built.

The frozen Remus JS/WASM provenance, hashes and license live under
`src/lib/ideacad/kernel/vendor/remus`. Kernel comparison evidence is in
`../kernel-spike`. Full school-device/network and novice acceptance remain open.
