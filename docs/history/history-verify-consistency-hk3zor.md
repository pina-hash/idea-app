---
title: "`npm run history:verify` derives an entry's `##` heading from its title instead of asking two hand-typed copies to agree, and the wall-clock concurrency proofs are confirmed to hold under load (`claude/history-verify-consistency-hk3zor`, docs and tests only, no migration)"
date: 2026-08-29
branches: [claude/history-verify-consistency-hk3zor]
migrations: []
subsystems: ["Testing", "docs/history tooling"]
---

**Starting state, checked before doing anything.** `git fetch origin` at
session start: local/`origin/main` tip `d8405a3` (PR #50 merge), `origin/main`
had just been force-updated onto that same sha, and `origin/integration` was
ahead at `86c537e` (`main` and `integration` have forked -- neither is an
ancestor of the other, same shape a sibling session records independently in
`btn-tap-target-floor-verify-6vj8r9.md`). Per this repo's own branching
correction precedent, branched from `origin/integration`, not from `main` or
from whatever this session's branch name had been rooted on before.

**Checked for duplicate work first, as instructed.**
`git log --oneline origin/main..origin/integration` showed 17 commits. One of
them, `e17f8b0` ("Prove the concurrency tests bite, and replace the two that
did not", merged at `86c537e`), already does everything this session's task
item 2 asked for: it replaces the classroom-song-queue and coin-contract
bursts with an externally-held-lock instrument, a `waitedMs > 500` /
`uncontendedMs < 400` pair with a positive control on the same clock, proven
against a mutated lock 3/3, and documents the `for no key update` vs.
`for update` foreign-key trap in `docs/history/concurrency-test-audit-l32vmw.md`.
That is a byte-for-byte match for "the audit that replaced two vacuous burst
tests used a 500ms floor and a 400ms control" in the task description. **Not
redone.** What this session added instead, since the task also asked whether
those thresholds hold under load: reran `tests/coin-contracts.test.ts` and
`tests/classroom-song-queue-race.test.ts` three times with four CPU-bound
busy-loop processes pinned against this container's four cores (`while
true; do :; done`, started ~2s before each run so they were already
consuming CPU). All three runs passed, 26/26 tests each time; the two
externally-held-lock tests landed at 1210-1238ms per run (dominated by the
fixed 1200ms `pg_sleep` HOLD_MS plus the 250ms acquire-wait, not by test
overhead), comfortably inside the `>500`/`<400` margins with no sign of the
margin thinning under contention. This is a spot check, not a statistical
guarantee -- three runs on one loaded container is the same single-machine
limitation the task's own premise names -- but it found no flakiness to act
on, so nothing in that instrument was touched. `docs/history/` and the
concurrency test files under `tests/` are this session's files to own; task
item 2 needed neither touched.

## Task item 1: the title/heading duplication, fixed and then removed

**The immediate red.** `npm run history:verify` failed on
`btn-tap-target-floor-verify-6vj8r9.md`: front-matter `title` read `The .btn
tap-target coverage...` (no backticks around `.btn`) while the body's `##`
heading read `` The `.btn` tap-target coverage... `` (backticked). Exactly
the class of failure `speedrun-clock-standby-contrast-vos27u.md` already
fixed once, for a different entry
(`gauntlet-tolerance-test-fix-u79q4y.md`), by hand-retyping the heading to
match the title. That session's own writeup asked "should the heading be
derived from the title instead of retyping it beside it?", answered yes, and
scoped what it would take without building it (drop the `## <title>` line
from every body, teach `verify-split.mjs`'s reassembly to synthesize it back
at read time, update `docs/history/`'s own stated convention) -- deliberately
left as a follow-up bundle rather than folded into that session's task.

**Decision: derive it, not retype it a third time.** Two independent
sessions had now hit the same failure mode in three different entries
(`gauntlet-tolerance-test-fix-u79q4y`, and `btn-tap-target-floor-verify-6vj8r9`
twice -- once caught and fixed, once recurring). CLAUDE.md names this exact
shape as the thing to avoid elsewhere ("Do not duplicate a rule ... a second
implementation of a check ... is the thing that quietly stops matching"),
and the previous session's scoping showed the migration was mechanical and
bounded to three files (`verify-split.mjs`, `front-matter.mjs`'s doc
comment, and every entry body) rather than open-ended. The one real cost --
a raw `.md` file viewed outside the repo's own tooling (e.g. on GitHub) no
longer shows a rendered `##` title, only the YAML `title:` line as plain
text -- was judged smaller than a fourth recurrence, especially since
`docs/history/`'s own stated finding method is `grep -r`, not casual
browsing, and the front-matter `title` line is exactly as greppable either
way.

**What was verified before touching 212 files.** A script read every entry
with the existing `front-matter.mjs` reader and confirmed the shape was
uniform first: all 212 entries' bodies opened with a `## ` line followed
immediately by a blank line (no entry deviated), and exactly one entry
(`btn-tap-target-floor-verify-6vj8r9.md`) had a title/heading mismatch. That
made the migration safe to run unconditionally rather than needing
per-file judgment calls.

**The migration: `docs/history/_tools/derive-headings.mjs`.** For every
entry file: if the body's `## ` heading text differs from front-matter
`title`, the front-matter `title` is corrected to the heading's text (the
heading was the more carefully written copy in the one observed case --
it carried the backtick formatting the title had dropped, not the reverse)
-- then the heading line and its following blank line are stripped from the
body, leaving the body opening directly at its first real content. Not
idempotent by design: run twice, it throws on the first already-migrated
file (`body does not open with a ## heading`), which is the guard against
someone reintroducing a hand-typed heading and running the script over it
again by habit rather than by reading what it does.

Ran once: `migrated 212 entries (1 needed their front-matter title
corrected first)`.

**`verify-split.mjs` updated to match.** The per-entry check that used to
compare `body.split('\n')[0]` against `` `## ${title}` `` is now two
checks: `title` must be present, and the body must NOT start with `## `
(a regression guard -- if a future entry's body opens with a heading line
again, that is now flagged as the mistake, not the missing-match case it
used to catch). The reassembly that reconstructs the 168 pre-split
`record-*.md` files for the byte-identical comparison against
`ea9f043b6c:docs/HISTORY.md` now synthesizes the heading back in per
entry: `` `## ${e.title}\n\n${e.body}` `` joined across all 168 in
`record_order`, rather than concatenating stored bodies that already
carried it. Reassembled bytes, sha256 and the git byte-compare against the
pinned reference are all unchanged (2,252,747 bytes,
`a7eac686...45`), because deriving the heading changes nothing about
what those 168 files reassemble to -- it only moves where the heading text
lives on disk.

```
entries reassembled : 168 (expected 168)
reassembled bytes   : 2252747 (expected 2252747)
reassembled sha256  : a7eac6860e43db23090a933931107fb791066784c9cc2a2534e4d982056a0545
reference sha256    : a7eac6860e43db23090a933931107fb791066784c9cc2a2534e4d982056a0545
git byte compare    : IDENTICAL against ea9f043b6c:docs/HISTORY.md
sha256 compare      : IDENTICAL

OK: the split is lossless. Every byte of the pre-split record body is present, in order.
```

168 entries reassembled and proven byte-identical to the pre-split
reference; the check now also structurally forbids the failure class that
required this bundle, rather than only detecting one drifted instance of
it.

**`front-matter.mjs`'s doc comment corrected** to say the body starts
directly at its first real content and that the heading is derived, not
stored.

**`CLAUDE.md` updated in place** (not a second, newer statement beside the
old one, per this file's own "when a rule here changes, edit it IN PLACE"):
the "Front matter, then one blank line, then the entry opening with its own
`##` heading" bullet under "Keeping the documentation current" now states
the derived shape and names `derive-headings.mjs` and the three prior
occurrences. It also flags that `docs/HISTORY.md` still describes the old
retyped-heading shape in its own "shape of an entry file" section and says
in words why that is not corrected: `docs/HISTORY.md` is a frozen pointer
file (CLAUDE.md's own "is never edited again"), and that freeze was written
for a different reason (no shared append point) but reads the same way here
-- a stale sentence in a file nobody edits is a smaller cost than reopening
a file whose entire point is to never be a write target again. `CLAUDE.md`
is stated as authoritative over `docs/history/`-adjacent prose exactly for
this kind of disagreement.

**What this does NOT touch.** `docs/history/_tools/index.mjs`, the
generator for the three by-subsystem/GREENLINE/by-migration indexes, was
already building its output from `title` alone (`` `[${e.title}](${e.file})` ``
and `` `### ${e.title}` `` for a multi-bundle GREENLINE subsection) and never
echoed a body heading, so it needed no change. Verified after the
migration: `npm run history:index` still runs and produces output (spot
checked, not diffed against a pre-migration baseline byte for byte, since
its output is explicitly gitignored and generated, and its inputs --
`title`, `date`, `branches`, `migrations`, `subsystems` -- are exactly the
front-matter fields the migration left untouched other than the one
corrected `title`).

## What was measured

- `svelte-check`: 0 errors, 37 warnings (31 `state_referenced_locally`, 5
  `css_unused_selector`, 1 `perf_avoid_nested_class`) -- matches the stated
  baseline exactly. Re-derived with `npx svelte-kit sync && npx svelte-check`
  after exporting placeholder `PUBLIC_SUPABASE_URL`/`PUBLIC_SUPABASE_ANON_KEY`
  into `.env` (uncommitted, gitignored). First pass reported 11 phantom
  errors because `svelte-kit sync` had been run once before `.env` existed;
  re-running `sync` after writing `.env` cleared them, matching the documented
  trap exactly.
- `npm test`: **171 files passed, 3663 tests passed**, 0 failed, in 144.12s
  (`Duration` line) / 2m25s wall clock including npm/vitest startup. This is
  the full suite after both the docs/history migration and the CLAUDE.md
  edit; neither touches `src/`, `supabase/migrations/`, or test logic, so no
  change in behaviour was expected or found. Not re-run a second time
  "before" the fix as a separate baseline, because the only files this
  session's changes affect are `docs/history/`, `docs/history/_tools/`, and
  `CLAUDE.md` -- none of which any test in `tests/` reads for content (a
  handful reference `docs/history` or `CLAUDE.md` in prose comments only,
  checked by grep, not in an assertion).
- `npm run history:verify`: **OK, 168 entries reassembled**, byte-identical
  against the pinned pre-split reference, as quoted above.
- Concurrency thresholds under load: 3 runs of
  `tests/coin-contracts.test.ts` + `tests/classroom-song-queue-race.test.ts`
  with 4 CPU-bound busy loops pinned against 4 cores, 26/26 passing each
  run, externally-held-lock tests measuring 1210-1238ms (fixed 1200ms hold +
  250ms acquire-wait dominates; well clear of the 500ms floor) with the
  uncontended controls staying under the 400ms ceiling in the same runs.

## What was explicitly NOT verified

- No live Supabase project, no Drive round trip, no signed-in session, no
  screenshots -- none of this bundle's changes touch anything that would
  need them.
- The concurrency-threshold check under load is a spot check (3 runs, one
  container, one load shape: 4 tight busy loops), not a statistical claim
  about flake rate. If CI infrastructure differs meaningfully from this
  container (more contended cores, a noisier neighbour), that difference is
  not covered here.
- `npm run history:index`'s generated output was spot-checked to run and
  produce the three indexes, not diffed line-for-line against a
  pre-migration capture, since it is gitignored and rebuilds from front
  matter that the migration left semantically unchanged (one title
  correction aside, which is a content fix, not a structural one).

## What was deferred

- `docs/HISTORY.md`'s "shape of an entry file" section still shows the
  retyped-heading example. Left alone deliberately (see above); a session
  that decides the freeze should lift for exactly this kind of drift is a
  different bundle with its own justification for touching a file this
  repo's own convention says is never edited again.
