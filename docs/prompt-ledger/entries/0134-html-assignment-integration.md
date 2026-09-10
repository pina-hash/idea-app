# 0134 Finish the HTML assignment system, and land it on `main`

- Issued: 2026-09-10
- By: an integration session. Four lanes (0126, 0127, 0128, 0129) built the
  pieces of the ported-HTML-assignment feature and none of them touch: the
  manifest contract, the rubric derivation, the serving route and the frame,
  and the store. Nothing renders and nothing saves. This bundle is the wiring,
  one security change, and the deploy.
- Owns:
  - `src/lib/classroom/html-assignment/**` (all of it)
  - `src/routes/hx/**`
  - the HTML-assignment regions of `ContentComposer.svelte`,
    `ItemDetail.svelte`, `ItemBody.svelte`, `GradingConsole.svelte` and
    `src/lib/classroom/transports.ts`
  - `src/routes/dev/html-assignment/**`
  - `tests/html-assignment*`, `tests/dom/html-assignment*`,
    `tests/db/html-assignment*`
  - `tools/browser-verify/routes/html-assignment*.mjs` and the generated
    regions of `tools/browser-verify/README.md`
  - `CLAUDE.md` (the HTML-assignment section it owes), `.env.example`
  - `docs/prompt-ledger/entries/0134-*`, and its own `docs/history/` entry
- Migration permitted: none.
- Claims: none.
- Lands on: NOT `main`. The branch is pushed and released to the
  `integration` sweep; the merge to `main` did not happen and must not, until
  the write gate below is resolved.
- Status: pushed
- Branch: `claude/html-assignment-integration-a6ibch`, branched from
  `origin/integration` at `00623a40`.
- Notes:

  **DUPLICATE CHECK, CLEAN.** No `docs/prompt-ledger/entries/0134-*` existed on
  any ref before this entry (`git log --all --diff-filter=A` over that glob:
  zero hits; `origin/main` and `origin/integration` both top out at `0133`).
  Every remote `claude/**` branch was swept for a commit touching a `0134`
  path: zero hits.

  **NO MIGRATION, AND THAT IS THE DESIGN RATHER THAN AN OMISSION.** Answers
  land in `classroom_responses` through the EXISTING `classroom_save_response`,
  unchanged. Needing a migration would mean the design drifted, and the
  standing instruction for that is to stop and report rather than write one.
  `0193` through `0196` are all applied to production.

  **THE SECURITY CHANGE IS THE GATE ON EVERYTHING ELSE.** 0126 measured that
  the served document's CSP carries no `sandbox` directive, so a DIRECT
  navigation to `/hx/<docId>` is not placed in an opaque origin the way a
  framed one is -- only the iframe's own `sandbox` attribute does that. With
  `PUBLIC_HX_SANDBOX_ORIGIN` unset in production the route answers on
  `ideabosco.com`, the cookie-carrying host. This bundle adds
  `sandbox allow-scripts` to the served document's CSP and proves it by direct
  navigation in the container's real Chromium. If that proof does not pass,
  nothing lands and `/hx` stays off the trunk.

  **THE BUNDLE STOPPED SHORT OF `main`, AND THE REASON IS A DATABASE GATE.**
  `classroom_save_response` is the only function in the schema that writes
  `classroom_responses`, and a ported assignment cannot use it. Measured
  against the real chain through 0195
  (`tests/db/html-assignment-write-gate.test.ts`): it reads
  `classroom_assignment_specs` and raises without one; it resolves the block id
  AGAINST that spec, so manifest block ids are unknown to it; and its type gate
  accepts `textField`, `table`, `checklist` where a manifest declares `text`,
  `longText`, `checkbox`, `radio`, `image`, `table` -- an overlap of ONE. So
  giving the item a companion spec is not a repair either.
  `classroom_add_submission_file` carries the identical gate, so an image
  cannot land. The prompt's own instruction for this case is to stop and report
  rather than write a migration, and that is what happened: no migration, no
  second write path, no merge to `main`.

  **THE FEATURE IS INERT AND THAT IS STRUCTURAL.** No route supplies
  `htmlAssignmentTransports` and none calls `createHtmlAnswerTransports`, so
  nothing can create a schema-3 item, the composer's import panel is removed by
  the absent transport, and a schema-3 item would render read-only. `/hx/`
  serves a table with no rows. `integrate.yml` can only merge a green
  `claude/**` branch into `integration`; `main` needs a person to type a
  confirmation.

  **STEP 2 PASSED AND WAS THE GATE ON EVERYTHING ELSE.** The served CSP now
  carries `sandbox allow-scripts`, built from `HX_SANDBOX_FLAGS` -- the same
  constant the iframe attribute reads. Proven by DIRECT NAVIGATION in the
  container's Chromium with a cookie planted on the serving origin as a
  positive control: baseline `window.origin` `"null"`, `document.cookie` and
  `localStorage` `SecurityError`, credentialed `fetch` `TypeError`; remove the
  directive and all three reach, reading the planted token back. With
  `connect-src` opened and the sandbox intact the fetch still refuses, and only
  dropping both lets it through with 200 -- which is the discriminator 0126's
  own comment asked for. Both mutated files restored from a copy and md5-checked
  identical. `PUBLIC_HX_SANDBOX_ORIGIN` is now defence in depth rather than a
  prerequisite, and remains the stronger deployment.

  **STEP 4's IMPORT LEG FAILED FIRST, FOR A SEPARATE REASON, AND WAS
  REPAIRED.** The ported Blade fixture was refused by `validateHtmlManifest`
  with 66 errors while `tests/html-assignment-port.test.ts` held 26 green
  assertions over the same bytes and never called that validator. Re-ported
  under explicit instruction; the live
  `src/lib/legacy/assignments/idea100-blade-01.html` was not touched and is
  md5-verified unchanged (`2211141fc0d2e08ee6c005d3d0d639d3`). The
  standard-versus-0195 conflict it exposed is
  `docs/decisions/entries/22-a-one-point-leveled-criterion-is-unrepresentable.md`,
  `Status: open`.

  **MEASURED.** svelte-check 0 errors / 37 warnings / 31-5-1, exactly baseline.
  Full suite 368 files / 7314 tests, all passed (baseline 363 / 7166; five new
  files). `npm run verify:readme` 360 runs / 6282 measurements / 0 outside
  threshold / 941.2s on `d122168`, regenerated once at the end on a clean
  committed tree.

  **NOT VERIFIED.** The step 4 walk never completed, so nothing here is that
  walk. No Docker daemon and no Supabase CLI in this container, so no
  PostgREST, auth or storage stack: every database claim is against embedded
  Postgres with the real migrations, none against the live project, and no
  signed-in surface was driven. No browser pass over the mounted frame. No
  production deploy and therefore no footer sha read back.
