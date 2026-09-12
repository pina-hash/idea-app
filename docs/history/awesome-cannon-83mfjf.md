---
title: Six open decisions rewritten so they can be answered in under a minute
date: 2026-09-11
branches: ["claude/awesome-cannon-83mfjf"]
migrations: []
subsystems: ["docs", "classroom", "maps", "ideacad"]
---

Six decision entries were open not because the questions were hard but because each
one cost twenty minutes of reading before it could be answered. This bundle rewrote
all six to one shape -- the question in a sentence, what is true in the tree TODAY
with file and line, a cost table naming whether each option needs a migration and
whether it touches applied production state, a recommendation, and what happens if
nobody decides. **It decided nothing.** One entry turned out to be already answered
and is recorded as such with the evidence.

## What the measurements changed, as against what was recalled

Five of the six entries carried a claim that measurement contradicted or sharpened.

**22 was already decided, in three places.** Mr. Pina ruled on 2026-09-11 that a
1-point criterion merges into a sibling. That is resolution A, and both validators
already end their refusal with the literal words "or merge it into another
criterion" -- `supabase/migrations/0195_classroom_html_assignments.sql:474` and
`src/lib/classroom/html-assignment/manifest.ts:711` -- while
`docs/standards/IDEA_HTML_ASSIGNMENT_TEMPLATE.md:120`, the document an authoring
tool is handed, already instructs it. So the ruling ratifies what ships and needs no
code, no migration and no standards rewrite. Resolution C (half points) is closed by
`0195` being applied: `0195` is on `origin/main`, whose highest is `0198`.

**The entry's own framing was too strong and is corrected.** It said the standard and
`0195` "cannot both be satisfied". They can: by not writing a 1-point criterion,
which is exactly what the ruling formalises. What was really in conflict was an
author's expectation that a 1-point criterion must be expressible.

**23's constraint holds, re-measured rather than restated.** On Node v22.22.2 today:
`require.resolve('undici')` answers `MODULE_NOT_FOUND`, the only related lockfile
entry is `undici-types`, and `globalThis[Symbol.for('undici.globalDispatcher.1')]`
IS present after one `fetch` and IS an `Agent`. Ledger 0151's refusal to reach for
that symbol stands for the reason it gave: a Node upgrade that renames it drops the
protection silently. `package-lock.json` is still 4,649 lines and still two-space
indented against a tab-indented `package.json`, so the dependency add is still its
own commit.

**24 had a fact nobody had written down, and it is the decision-relevant one.**
`0201` is NOT applied and is NOT on `main`:
`git diff --name-only origin/main...origin/integration -- supabase/migrations/`
returns `0199` and `0201`. So `ideacad_documents`' `unique(item_id, student_email)`
(`0201:14`) and the ten `student_email = current_user_email()` pins across lines
27-33 are still an EDIT to an unapplied file, not a migration-plus-backfill of live
student work. **The window in which the answer is free closes at that apply.** The
entry now says so and adds a third option -- ship the student key, add a nullable
`team_id` beside it while the file is still editable -- which the original two-line
entry did not offer.

**26's default is already implemented, and the entry's own statement of it is
contradicted by the code.** `BladeEditor.svelte:16` gates exactly `inertiaGcm2` and
`radiusOfGyrationCm` behind the prediction; the Rules rail at `BladeEditor.svelte:13`
is outside the `{#if compare}` block entirely. But that rail renders
`result.rules.slice(0, 4)` and `evaluate` returns FIVE rules
(`blade/evaluate.ts:8`: diameter, height, hex-extension, mass, **engagement**), so
**`engagement` is never rendered at all** -- while the decision's own default says it
stays visible. Reported, not fixed: `src/lib/ideacad/**` belongs to ledger 0160 and
this bundle owns no file under `src/`.

**20's tree check was itself stale.** It listed eight maps migrations and blamed
`CLAUDE.md` for omitting two. There are nine on `origin/main`: it missed
`0166_short_link_reserve_maps.sql`. Corrected in the entry.

## What was not changed, and why

The `Raised:` line and attribution of every entry are preserved. Entry 19 records the
convention that a decision entry is dated reasoning rather than a description of the
tree; this bundle was explicitly commissioned to rewrite these six for legibility, so
the original reasoning is kept where it still holds and every correction is marked as
a correction rather than silently applied.

The house header block (`Raised` / `Status` / `Decision` / `Default this assistant
would pick` / `Why it is blocked on him` / `What it unblocks` / `Context`) is kept on
all six, and `tools/idea-status.py`'s own `parse_fields` was run against each
rewritten file to confirm it still reads `Status` and the default line. All six
parse; 22 reads `decided` and drops out of the owed list, 20 and 23 through 26 stay
`open`.

## Verification

- **`svelte-check`: 0 errors, 40 warnings in 22 files**, breakdown 34
  `state_referenced_locally` / 5 `css_unused_selector` / 1 `perf_avoid_nested_class`.
  **`CLAUDE.md` says 37 with a 31/5/1 breakdown, so the baseline has moved by three
  `state_referenced_locally`, all of them on `integration` before this branch was
  cut.** Two of the three are `src/lib/ideacad/BladeEditor.svelte`, which arrived with
  the IdeaCAD lane. Reported and not corrected in `CLAUDE.md`: this bundle owns no
  source file and no `CLAUDE.md`, and the correction belongs with whoever owns the
  lane that moved it. Measured with `PUBLIC_SUPABASE_URL` and
  `PUBLIC_SUPABASE_ANON_KEY` exported before `svelte-kit sync`, per `CLAUDE.md`.
- **Full suite: 389 of 390 files pass, 7600 of 7604 tests, 453.55s.** The one red file
  is `tests/grant-surface.test.ts`, 4 assertions, naming
  `ideacad_editors`, `ideacad_documents`, `ideacad_concepts`, `ideacad_predictions`
  and no other object. **It is red on `origin/integration` at branch time and ledger
  0161 (`claude/relaxed-goodall-lsudr8`, migration `0202`) is the lane that repairs
  it.** This bundle touched no `src/`, no test and no migration -- the diff is seven
  files, all under `docs/` -- so it cannot be the cause and is not the fix.
- **Production reachability: CANNOT SAY, and that is reported rather than assumed.**
  `node tools/deploy-probe.mjs` answers `DEPLOY_PROBE_URL is not set, so production's
  applied set cannot be read`; there is no `.env`; and the container's egress proxy
  refuses `ideabosco.com:443` outright (`connect_rejected`). So every claim in these
  entries about what is APPLIED is derived from `origin/main` membership, which is a
  claim about what has landed and not about what has been run. The entries say so
  where it matters, in 24 especially.
- **`verify:readme` deliberately not run**, per the prompt. No route spec is added.
- **`npm run verify:browser` not run**: no component, stylesheet or route changed, so
  there is no surface to measure.

## Deferred

- The sentence recording the merge rule belongs in `IDEA_RUBRIC_STANDARDS.md` 1.3
  beside "Never two". A rubric author reading the standard alone still reaches for a
  1-point criterion and is refused later by a validator, which is how this was found
  the first time. That is a standards bundle with its own version bump and changelog
  row; this bundle owns no standards file.
- `BladeEditor.svelte`'s `slice(0, 4)`, above.
- `CLAUDE.md`'s maps block still names seven migrations where nine exist, and the
  `svelte-check` warning baseline is three low.
