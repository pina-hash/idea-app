# 0138 The HTML assignment write gate: widen `classroom_save_response`, do not add a second write path

- Issued: 2026-09-10
- By: a follow-up to ledger 0134, which shipped the whole ported-HTML-assignment
  subsystem to `integration` and stopped short of `main` because a student could
  open a ported worksheet and not save a word of it. The premise 0134 worked
  under -- that answers land through the existing `classroom_save_response`
  unchanged, and that needing a migration would mean the design had drifted --
  was wrong, and the correction is this bundle's whole subject.
- Owns:
  - `src/lib/classroom/html-assignment/**`
  - `src/routes/hx/**`
  - the HTML-assignment regions of `ContentComposer.svelte`,
    `ItemDetail.svelte`, `ItemBody.svelte`, `GradingConsole.svelte` and
    `src/lib/classroom/transports.ts`
  - `src/routes/dev/html-assignment/**`
  - `tests/html-assignment*`, `tests/dom/html-assignment*`,
    `tests/db/html-assignment*`
  - `tools/browser-verify/routes/html-assignment*.mjs` and the generated
    regions of `tools/browser-verify/README.md`
  - `supabase/migrations/0197_*.sql`
  - `docs/prompt-ledger/entries/0138-*`, and its own `docs/history/` entry
- Migration permitted: exactly one.
- Claims: 0197.
- Lands on: NOT `main`. The migration is not applied, so the branch stops at
  `integration`.
- Status: pushed
- Branch: `claude/html-assignment-ledger-0138-9third`, branched from
  `origin/integration` at `b2581959`.
- Notes:

  **DUPLICATE CHECK, CLEAN.** Every remote ref was swept by `git ls-tree` for
  `docs/prompt-ledger/entries/0138-*` and for `supabase/migrations/0197_*`:
  zero hits on both, on `main`, on `integration` and on all 40-odd standing
  `claude/**` branches. `origin/main` tops out at 0196;
  `origin/integration` tops out at 0196. `git fetch --unshallow origin`
  succeeded and the repository is not shallow; `git fetch origin integration`
  succeeded; `git config user.name` is `Claude` and `user.email` is
  `noreply@anthropic.com`.

  **THE FIVE CLAIMS WERE CONFIRMED BEFORE ANYTHING WAS BUILT**, against
  `0086_classroom_assignment_engine.sql`, `0133`, `0134` and the applied
  catalog: the spec read and its raise, the block resolution inside that spec,
  the `('textField', 'table', 'checklist')` type gate against a manifest's six
  types (overlap: one word, `table`), the identical gate in
  `classroom_add_submission_file`, and that it is the ONLY function in the
  schema writing `classroom_responses`. One thing the prompt did not name and
  the file had to respect: `classroom_add_submission_file` has TWO arities, and
  the EIGHT-argument form holds the body while 0086's seven-argument form is a
  thin wrapper 0133 keeps alive. 0197 replaces the wide one only.

  **0197 IS ONE BRANCH IN EACH FUNCTION AND TWO PRIVATE HELPERS.**
  `_classroom_html_manifest(item)` is the engine discriminator, keyed on
  `classroom_items.assignment_schema_version` -- the same column
  `htmlAssignmentMount` reads, so the write path and every rendering surface
  cannot disagree about which document an item is. `_classroom_html_block`
  resolves an id across the header AND the modules. Signatures unchanged, so no
  drop, no overload and no deploy ordering; the self-check reads `pg_proc` back
  and asserts one row for `classroom_save_response`, two for
  `classroom_add_submission_file`, and `pronargdefaults = 0` on the wide form.

  **NOT A SECOND WRITE FUNCTION AND NOT A SHADOW SPEC ROW.**
  `IDEA_CLASSROOM_REBUILD_PLAN.md` decision 12 was read before deciding
  anything: it refused a second scoring path beside
  `classroom_grade_submission` and the FACTS export, and a second definition of
  what an ANSWER is fails one step earlier for the same reason. A generated
  companion spec would manufacture 0134's own Surface A bug on purpose.

  **A SPEC-BACKED ASSIGNMENT ANSWERS EXACTLY AS IT DID, PROVEN THE WAY
  CLAUDE.md ASKS.** `tests/db/html-assignment-spec-path-unchanged.test.ts` puts
  a corpus of 26 calls to the DEPLOYED functions on one database, resets the
  mutable state, applies 0197 over that same database, and re-runs the
  identical corpus: **26 cases compared, 0 differences**, refusal text and
  refusal ORDER included. Two ported calls are the positive control and DID
  change, so a silently-failed apply cannot pass.

  **`tests/db/html-assignment-write-gate.test.ts` IS DELETED, NOT INVERTED**,
  which is what 0134 wrote it for. `CLAUDE.md`'s rule naming it was rewritten in
  place; the file then joined `ABSENT_BY_DESIGN` in
  `tools/claude-md-check.mjs` with its reason, and the pinned length in
  `tests/claude-md.test.ts` moved 13 -> 14. Those two files are outside this
  bundle's declared paths and are named here rather than left to be found.

  **THE PASTE TRAP: ZERO.** The comment portion of every line of 0197 contains
  no dollar-quote token (`awk` over the text after `--`), and all 14 tokens in
  the file sit on code lines in 7 balanced pairs. The verification query is
  entirely inside `--` comments and carries no `$` at all.

  **MEASURED.** svelte-check 0 errors / 37 warnings / 31-5-1, exactly baseline,
  re-derived after `npx svelte-kit sync` with the two `PUBLIC_SUPABASE_*`
  placeholders exported. Full suite 368 files / 7319 tests, all passed (baseline
  368 / 7314: one file deleted, one added, five net tests).
  `npm run verify:readme` **362 runs / 6310 measurements / 0 outside threshold /
  925.9s on `983ccec`** (baseline 360 / 6282 / 0; the +2 runs and +28
  measurements are the new worksheet route spec at both widths), regenerated
  once at the end on a clean committed tree with Vite started by hand on 5199
  and every one of its 156 URLs warmed to HTTP 200 first -- 155 of 156, the one
  exception being `/dev/foundry-admin/refusal`, whose 403 is that fixture's own
  subject. `--selftest` 70 controls (36 negative, 34 positive), 0 instrument
  failures. `derived-numbers` green afterwards.

  **NOT VERIFIED. 0197 IS NOT APPLIED**, and this container cannot apply it: the
  agent proxy accepts a CONNECT to 5432 and carries no bytes. No Docker daemon
  and no Supabase CLI, so no PostgREST, auth or storage stack; every database
  claim is against embedded Postgres with the real migration files, none against
  the live project, and no signed-in surface was driven. The client answer path
  is still unwired, which is now a client fact rather than a database one and
  sits outside these paths.

  **NOTHING OUTSIDE THIS BUNDLE'S PATHS WAS TOUCHED FOR THE OTHER TWO LANES.**
  `docs/standards/IDEA_HTML_ASSIGNMENT_SPEC.md` (0136),
  `src/lib/legacy/assignments/_TEMPLATE.html` and
  `docs/standards/IDEA_HTML_ASSIGNMENT_TEMPLATE.md` (0137) and
  `docs/standards/REGISTER.md` are unchanged.
