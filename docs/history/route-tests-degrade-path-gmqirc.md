---
title: "Two route tests come off `loadSectionRoster`'s degrade rung, the rung keeps a test of its own, and 0138's manager exclusion reaches a payload for the first time (`claude/route-tests-degrade-path-gmqirc`, no migration)"
date: 2026-08-29
branches: [claude/route-tests-degrade-path-gmqirc]
migrations: []
subsystems: ["Testing", "Classroom"]
---

Follow-on to `docs/history/postgrest-shim-set-returning-57e7a3.md`, which fixed
the PostgREST shim's set-returning path and, in doing so, found that every
shim-driven route test reaching a roster had been exercising
`loadSectionRoster`'s DEGRADE rung. **No migration and no `src/` change.** Three
test files and four history entries.

### The list is TWO files, not six, and the arithmetic closes exactly

The brief said six. Verified rather than taken:

- `loadSectionRoster` has five call sites in `src/` -- the home load, the People
  load, the Grades load, and the transports' `loadGrading` and `loadRoster`.
- Ten test files drive the shared shim. Nine of them lack 0138. Of those nine,
  **exactly two import a load that can reach any of those call sites**:
  `tests/classroom-feed-false-counts.test.ts` (the home load) and
  `tests/classroom-units.test.ts` (People and Grades).
  `tests/classroom-course-categories.test.ts` builds real transports but calls
  only `loadCategorySuggestions`; the other six drive notebook, GAUNTLET or
  item-level reads that never touch a roster.
- **The measured call count reconciles to the row.** The previous bundle's
  instrumented run counted 8 `classroom_section_roster` calls in the whole
  suite. `classroom-units` makes 4 (two callers x People + Grades; every other
  `runPeople`/`runGrades` in that file 404s or 303s *before* the roster read)
  and `classroom-feed-false-counts` makes 4 (four `runHomeLoad` calls). 4 + 4 =
  8, with no room for a ninth from a seventh file.

So "six shim-driven files still degrade" was true of the CHAINS and not of the
CALLS: six of them would have degraded had they asked, and never asked. Widening
their chains would have bought nothing and cost their subjects.

### Widening the two, one at a time

**`tests/classroom-units.test.ts` -- 18 tests to 23.**

Chain gained `0106`, `0116`, `0117`, `0118`, `0138`, in that order, with `0137`
still last. The four notebook files are 0138's own prerequisites, found by
applying and reading the failures rather than by copying another file's chain:
`0138`'s `_notebook_section_roster` reads `notebook_entries.deleted_at` (0116)
and `.submitted_at` (0118), and 0118 needs `notebook_manages_student` (0106).

- **Before:** People and Grades were driven, and every assertion about them was
  an assertion about the fallback -- `managesReady` false, the plain
  `classroom_enrollments` select, no `manages` column on any row. The file did
  not know, and nothing on either payload said so.
- **Now:** the same two loads run the wide rung, and five new tests state it:
  `removalReady` is true, every row carries a boolean `manages`, People SHOWS
  the manager row (it is the row somebody came to remove), Grades DROPS it, and
  the chair -- who manages through `is_admin()` rather than through
  teacher-of-record -- gets the identical flags.
- **Nothing it previously covered is now uncovered.** All 18 original tests pass
  unchanged, and pass with 0138 removed again (mutant A below).
- **The fixture gained two enrollments**, both stated in the file: the teacher of
  record in her own P1, which is the ordinary state 0138 exists for and is what
  makes the exclusion observable rather than applied to a roster with nobody to
  drop; and `otherTeacher`, a `@boscotech.edu` address in P2 who manages nothing
  there, which is the discriminator for a rule keyed on the email domain instead
  of on the flag. Nothing else in the file reads either section's enrollments.

**THE PAYLOAD THAT CHANGES, MEASURED IN BOTH DIRECTIONS.** Three people are
enrolled in P1 and the Grades denominator is **2** on the wide rung and **3** on
the degrade rung. That is 0138's whole point -- "an instructor enrolled in their
own class was one more head here and no row there, which is a fraction that could
never reach its own bottom" -- and it had never appeared in a test payload. The
assertion pins the enrolled count (3) BESIDE the denominator (2) deliberately: a
bare `roster === 2` is satisfied just as well by a fixture with two people in it,
which is how an exclusion test passes for the wrong reason.

**`tests/classroom-feed-false-counts.test.ts` -- 14 tests to 17.**

Chain gained `0138` alone; it already ran the full classroom+notebook chain
through 0121, which is 0138's prerequisite set exactly.

- **Before:** the home load's `loadSectionRoster(supabase, null)` answered
  PGRST202 and `feedManagerEmails` was `{}` for every caller. `feedFor` has
  always threaded that map into `buildFeed`; the plumbing was there and had never
  carried a value.
- **Now:** a fourth false count joins the three the file is named for, and it is
  the same shape as the other three -- the number is simply larger than the work
  is, and one extra head in a to-grade tally looks exactly like one more student
  who handed something in. The fixture enrolls the teacher in her own class and
  gives her an undated assignment that she and bruno both hand in. **The
  teacher's to-grade count on it is 1 on the wide rung and 2 on the degrade rung,
  measured.**
- **Positive controls on the same read**, per this file's own standard: both
  submissions ARE in `feedSubmissions` (the exclusion is a tally decision, not a
  missing row), the two items only a student handed in still count 1 each, and
  alice's chip is the same 2 it has been through sections 1 to 3.
- **A disclosure assertion with its control:** a student's `feedManagerEmails` is
  `{}` -- `classroom_section_roster(null)` gates per row on
  `classroom_manages_section`, so alice does not get even her own row -- and the
  manager's read on the same fixture is non-empty, so the empty answer is a fact
  about her and not about the migration being absent.
- **Nothing it previously covered is now uncovered.** All 14 original tests pass
  unchanged; the new item is undated, so it ranks for no student (which section 1
  is itself the proof of) and no existing count moves.

### The rung the widening would have left uncovered

**`tests/classroom-roster-degrade.test.ts` is new, and it is the "if a file needs
both, it needs both" answer.** Before this bundle the degrade rung was exercised
by accident, by files that did not know they were on it, and asserted by nothing.
After widening the only two files that touched it, it would have been exercised
by nothing at all -- and it is a supported production state, because migrations
here are pasted in by hand separately from the deploy.

It runs the SAME fixture on the SAME chain minus 0138 (plus the four notebook
prerequisites 0138 alone needs), so the two files differ in one migration and the
difference between their answers is attributable to it. Six tests:

- the chain really is the pre-0138 world (`classroom_section_roster` absent from
  `pg_proc`, with a positive control naming a function that IS there, so zero is
  an answer about the name rather than about the query);
- **the null section SHORT-CIRCUITS** -- an empty list with the table untouched.
  A fallback that ran the section select with a null id would answer the whole
  enrollment table for the ladder's widest question, and the section-scoped call
  beside it proves that path is reachable and would have returned rows;
- the rows are the right rows, and `manages` is UNDEFINED rather than false --
  absent is not a claim the database never made;
- `splitRoster` therefore keeps every row, with a control that hands it the same
  rows carrying the flag the wide rung would have supplied, so it is not simply
  incapable of dropping anybody;
- People renders the roster and `removalReady` is false, which is what removes
  the Remove;
- **Grades answers 3.** Pinned as a value, so the difference between the two
  rungs lives in the suite rather than in a comment.

### Mutation proof

Required here: an exclusion whose wrong result is invisible in normal use. Every
mutant is in the PERMISSIVE direction (the pre-0138 world, which is the state
that counts too many people), every mutation is inside a file this bundle owns,
and each file was restored from an in-memory copy and md5-checked --
`git checkout --` was used nowhere.

| mutant | reddened |
| --- | --- |
| `classroom-units`: 0138 removed from the chain | **5 of 5** new tests; the 18 original ones stayed green. Grades answered **3**, People's `manages` came back `undefined`. |
| `classroom-units`: 0138 kept, the teacher's enrollment removed | **3** -- the two People assertions and the denominator. It is why the enrolled count is asserted beside the denominator. |
| `classroom-feed-false-counts`: 0138 removed from the chain | **2**, at `feedManagerEmails`. With the rung assertion temporarily lifted so the tally was reached, the count answered **2 where the wide rung answers 1**. |
| `classroom-roster-degrade`: 0138 ADDED to the chain | **6 of 6**. The file genuinely tests the fallback and not something true of both rungs. |

**What is NOT mutation-proved, deliberately:** `splitRoster` and `buildFeed`
themselves. `src/` was off limits for this bundle (two other sessions live), and
the chain mutants exercise the same question from the other end -- they toggle
the input those two functions branch on.

### `npm run history:verify` is green, and the mechanism was never the problem

It had been red for days and four sessions reported it as pre-existing. `1fbdf87`
made an entry's `##` heading DERIVED from its front-matter `title`, so a body
that still opens with a retyped `##` line is a duplicate. The brief named two
entries; the verifier named **four**, and the two extra ones landed after the
brief was written.

**All four postdate `1fbdf87`.** It committed at 07:33:38 and the four entries at
07:34:15, 08:12:01, 08:40:11 and 09:07:19 the same day. So this is not a backlog
of pre-mechanism files draining out -- it is a convention that keeps being
re-broken, and it will keep being re-broken, because:

- **`docs/HISTORY.md` still instructs the old way.** Its "The shape of an entry
  file" section says "YAML front matter, one blank line, then the entry, opening
  with its own `##` heading", shows a worked example WITH the duplicated line,
  and adds "`title` must match the `##` heading exactly". That is the document
  `CLAUDE.md` points at as stating the full convention.
- **`CLAUDE.md` says it too**, in "Keeping the documentation current": "Front
  matter, then one blank line, then the entry opening with its own `##`
  heading".
- **`npm run history:verify` is in neither `npm test` nor `.github/workflows/ci.yml`.**
  CI runs `npm run check`, `npm test` and `tools/check-vanguard-changelog.mjs`.
  So the only thing that reports the breakage is a script a session has to choose
  to run, and the only thing instructing sessions tells them to break it.

Fixing all four rather than the two named is deliberate. Both extra entries belong
to bundles already merged into `integration` -- no live session owns them -- and
the edit removes a line the tooling now generates rather than correcting anybody's
account. "Correctly declining to touch another session's record" is precisely what
has kept this red, and a one-line mechanical duplicate is not the record.

Neither `docs/HISTORY.md`, `CLAUDE.md` nor `ci.yml` was edited here: all three are
outside this bundle's stated ownership, `CLAUDE.md` is the repo's most contended
file with two sessions live, and `CLAUDE.md` itself says `docs/HISTORY.md` is
never edited again. **The durable fix is one of the three above and it is somebody
else's line to write**, but until one of them lands a fifth recurrence is the
expected outcome, not a surprise.

Verifier output after the fix: **168 entries reassembled, 2252747 bytes, sha256
`a7eac686...` identical to the pinned pre-split body, byte-identical against
`ea9f043b6c:docs/HISTORY.md`.** The heading rule runs over all **221** entry
files, not only the 168 with a `record_order`; 0 of them now open with a `##`.

### The 23 set-returning functions: who has a test, and of what kind

Re-derived independently rather than taken from the previous entry, by parsing
every `create [or replace] function` in `supabase/migrations/` past its argument
list to its `returns` clause: **23 distinct names across 35 create statements**,
agreeing exactly.

"Has a test" is the wrong axis on its own, though, because that is what let this
bundle's defect hide: `classroom_section_roster` had a test the whole time and
the ROUTE reading it was on the fallback. Three kinds:

| driven through | functions |
| --- | --- |
| **a real route load** (the shipped select strings, embeds, ladders and RLS) | `classroom_section_roster` (NEW here: People, Grades and the home load), `gauntlet_run_review` |
| **the shim, but not a route** | `admin_list`, `classroom_section_roster` (also driven directly through `loadSectionRoster`) |
| **raw SQL only** (16) | `_coin_public_roster`, `_notebook_section_roster`, `coin_admin_list_contracts`, `coin_admin_list_sections`, `coin_my_contract_claims`, `coin_public_contracts`, `coin_public_leaderboard`, `coin_public_reasons`, `coin_public_role_questions`, `coin_public_roles`, `coin_public_sections`, `coin_public_transactions`, `foundry_list_apps`, `foundry_play_counts`, `gauntlet_practice_pressure`, and `gauntlet_run_review`'s own SQL suites |
| **nothing, anywhere** (5) | `app_short_link_list`, `coin_admin_list_section_students`, `coin_role_admin_list_applications`, `coin_role_admin_list_holders`, `coin_role_admin_list_role_questions` |

**AFTER THIS BUNDLE AND THE PARALLEL ONE CLOSING THOSE FIVE, THE REMAINING HOLE
IS NOT EMPTY AND IS WORTH NAMING AS A LIST.** Every one of the 23 will have a
test; **21 of them will still have never been read through a client that answers
the way PostgREST answers.** For a `returns table` function that is not a
formality -- it is the exact gap the previous bundle closed in the shim and this
one closed in the two routes. The nearest four to a real surface, each with a
shipped reader that no test drives:

- `foundry_list_apps` -- the gallery and `/foundry/mine`;
- `coin_public_leaderboard` and `coin_public_transactions` -- the public,
  signed-out coin ledger, which is `anon`-granted;
- `app_short_link_list` -- the admin short-link console.

Nothing here is a claim that those functions are wrong. It is a claim about what
the suite has never asked them, which is the same claim that turned out to matter
for `classroom_section_roster`.

### Verification

- **`svelte-check`: 0 errors, 37 warnings** (31 `state_referenced_locally`, 5
  `css_unused_selector`, 1 `perf_avoid_nested_class`), re-derived on a fresh
  `npm ci` checkout with a placeholder `.env` written BEFORE `npx svelte-kit
  sync`. Identical before and after; the baseline in `CLAUDE.md` needed no
  correction.
- **Full suite: 179 files / 3794 tests before, 180 / 3808 after.** Both
  all-passing, `--no-file-parallelism` as `npm test` always runs it. The delta is
  exactly this bundle: +1 file (`classroom-roster-degrade`, 6), +5 in
  `classroom-units` (18 -> 23), +3 in `classroom-feed-false-counts` (14 -> 17).
  6 + 5 + 3 = 14; 3794 + 14 = 3808. **No pre-existing test moved**, in either
  direction, which the two chain mutants independently confirm.
- **`npm run history:verify`: green**, figures above.

### Not verified

- **The live project.** Nothing here touches it; no migration, no `src/`.
- **`src/` behaviour under mutation**, per the ownership note above.
- **No browser pass**, and none is relevant: this bundle renders nothing.

### For whoever is next

- **The five untested set-returning functions are somebody's bundle already**;
  the 21 never read through a PostgREST-shaped client are the list after it.
- **The `docs/HISTORY.md` / `CLAUDE.md` / `ci.yml` triple above** is the reason
  the heading convention keeps being re-broken. Whoever fixes it should fix the
  documents AND wire `history:verify` somewhere that reports, or the next session
  reads the old instruction from the file it was told to read.
- **The shim's `rpc` still maps EVERY error to `PGRST202`**, which is the same
  family of gap this bundle just closed one instance of: a fixture that answers
  `PGRST202` for everything puts a test on the degrade path for failures that
  should never reach it. Still its own bundle, per the previous entry.
