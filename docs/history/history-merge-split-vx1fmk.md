---
title: "The record becomes one file per entry, because a shared append point cannot be merged (`claude/history-merge-split-vx1fmk`, docs only, no migration)"
date: 2026-08-28
branches: [claude/history-merge-split-vx1fmk]
migrations: []
subsystems: ["Build, theme, tests, conventions"]
---

## The record becomes one file per entry, because a shared append point cannot be merged (`claude/history-merge-split-vx1fmk`, docs only, no migration)

`docs/HISTORY.md` had blocked an automatic merge on four consecutive batches and
GitHub had stopped offering to resolve it in the web editor. The cause was not
the file's size on its own: it was that **every session wrote to the same two
places in it** -- a new `##` section at the very end, and a row in the migration
index near the top. Two branches that both shipped a bundle therefore always
conflicted, in the same lines, every time, no matter how unrelated the work was.
A merge tool has nothing to work with when both sides append to the identical
byte offset.

This bundle merged the two outstanding branches so the file was resolved for the
last time, then split it: **168 files under `docs/history/`, one per entry**, and
`docs/HISTORY.md` reduced to a pointer that is never edited again.

Nothing under `src/`, `supabase/`, `tests/` or `tools/` was touched except what
the two merges brought.

### The two merges, first, and why in that order

`origin/claude/foundry-telemetry-harness-b1k8sm` then
`origin/claude/grading-category-datalist-z7hloe`, both `--no-ff`. Each conflicted
in `docs/HISTORY.md` and in nothing else, which is the whole diagnosis in one
line: two sessions, two unrelated features, one file, guaranteed conflict.

Both sides were kept in full on both merges. That was proved rather than eyeballed
-- for each merge, the pre-merge body was confirmed to be a byte prefix of the
result, and each side's own added block confirmed present verbatim in it. The
entry count went 171 -> 172 -> 173 `##` sections (including the five index
headings), which is +1 per merge with nothing lost.

Where the two sides disagreed about the separator before a new entry -- one
branch wrote `\n---\n\n##`, the other wrote `\n##` -- the resolution used the
file's own dominant form (`---`, on 57 of the entries against 3 without). That
choice is baked into the pre-split body the control below is pinned against, so
it is a fact about the archive rather than a loose end.

### The naming scheme, and why two sessions cannot collide under it

**A new entry is `docs/history/<your branch slug>.md`** -- the session's own git
branch with the `claude/` or `lane/` prefix removed.

That is collision-free by construction and not by anyone checking: the harness
mints one branch per session, and a branch name cannot be created twice. Two
sessions running at the same time are on two different branches, so they write
two different filenames, so their diffs share no line for git to have an opinion
about. The conflict is not resolved, it is made impossible.

**A sequence number was the obvious alternative and is the wrong answer.** A
counter (`0169-...`) is the same shared write point wearing a different hat: two
parallel sessions would both read 168 and both pick 169, and the conflict would
move from a section boundary to a filename. Anything a session has to CHOOSE,
rather than read off state it already uniquely owns, has this problem. The branch
is state the session already uniquely owns.

**The 168 pre-split entries are `record-<slug of the heading>.md`.** They are a
CLOSED set, named once, here. Nothing is ever added to it, so the scheme only has
to be internally unique -- which it is: all 168 heading slugs are distinct, and
still distinct truncated to the 80 characters the filenames use. `record-` is
reserved, and `npm run history:verify` refuses both halves of a mix-up: a
`record-` file without a `record_order`, and a branch-slug file that carries one.

Where a heading already named its branch, that branch is in the file's front
matter (`branches:`), not in its filename. Two historical entries shipped on
`lane/attach-any-type` and two more on `lane/foundry-manage`, so branch names are
NOT unique across the archive and could not have been the archive's filenames.
They are unique going forward, which is the only place it matters.

### Lossless, and the control that proves it

`docs/history/_tools/verify-split.mjs`, wired as `npm run history:verify`,
reassembles every `record_order`-carrying file in order from the bytes after its
front matter and compares the result against the pre-split body two ways: a real
byte comparison against `ea9f043b6ca0be58085c253e865ad77687363044:docs/HISTORY.md`
(which produces a diff on failure), and a pinned sha256 (which works in a clone
too shallow to reach that commit). A run that can do neither says it verified
nothing and exits 1.

Measured:

```
entries reassembled : 168 (expected 168)
reassembled bytes   : 2252747 (expected 2252747)
reassembled sha256  : a7eac6860e43db23090a933931107fb791066784c9cc2a2534e4d982056a0545
reference sha256    : a7eac6860e43db23090a933931107fb791066784c9cc2a2534e4d982056a0545
git byte compare    : IDENTICAL against ea9f043b6c:docs/HISTORY.md
sha256 compare      : IDENTICAL
```

Entry count before the split: **168**. After: **168**. The only bytes added are
each file's front matter and the single blank line under it, which is exactly
what the reassembler strips.

**The control was proved to bite, on four mutations**, each reverted and the file
restored md5-identical:

| Mutation | Reddened by |
| --- | --- |
| one character added inside an entry body | git byte compare AND sha256 |
| an entry file deleted | `record_order` contiguity (166 of them) |
| two `record_order` values swapped | git byte compare AND sha256 |
| a front-matter `title` edited away from its `##` heading | the title/heading equality check |

The last one is why that check exists at all: the reassembly cannot see front
matter, so a title silently drifting from the heading it names is invisible to it.

### The indexes are generated, and that is the same argument as the filenames

The file carried three indexes -- by subsystem, inside GREENLINE, and by
migration. **None is committed.** A committed index is one shared set of lines
that every session edits, which is the write point this split removed; it would
conflict exactly as often as the append point did, and the migration table would
conflict more, being sorted by number rather than appended to.

`docs/history/_tools/index.mjs` (`npm run history:index`) prints all three from
the entries' own front matter, and `--out` writes
`docs/history/_generated/INDEX.md`, which is gitignored.

- **The migration table is INVERTED from each entry's `migrations:` list**, so
  the many-to-many mapping is derived rather than maintained. It also takes its
  ROWS from `supabase/migrations/` on disk rather than from what the entries
  claim, so a migration nobody documented still gets a row and says so -- which
  is how the two that were already in that state (`0014`, `0031`) keep their
  "not documented in the record" line without anyone remembering to write it.
- Generated against the committed file, the migration index reproduces the
  original's mapping **exactly**: 140 rows, 171 (migration, entry) pairs,
  set-identical to the pre-split table.
- **The by-subsystem index was 78 entries out of date and nobody knew.** It
  listed 90 of the 168; the generated one lists all 168, a strict superset, so
  nothing was lost and the drift is closed. That drift is itself the argument:
  an index maintained by hand at a contended write point is an index that quietly
  stops being true.
- Foundry had no group at all in the committed index despite being a whole
  subsystem, so `IDEA Foundry` was added to the group vocabulary.

`grep -r` over `docs/history/` remains the primary way to find an entry, which is
why every field the indexes key on -- date, branch, migrations, subsystem -- is
plain greppable text in the front matter rather than something only the generator
can see.

### Where the dates came from, and the honest limit on them

Front matter needs a date and most entries do not state one: only 19 of 168
carried an ISO date anywhere in their body. The dates are therefore **derived
mechanically: the date of the earliest commit whose `docs/HISTORY.md` or
`CLAUDE.md` contained that exact `##` heading**, across all 460 commits touching
either file. Every one of the 168 resolved, spanning 2026-06-20 to 2026-08-28,
and the spot checks agree with the headings that do state a date (the entry
titled `IDEA Coin ledger: RETIRED (2026-08-12)` resolves to 2026-08-12).

**This required unshallowing the clone, and the first attempt was wrong because
of it.** The session's checkout is shallow: `git log` reached only to 2026-08-23,
so the first pass stamped 2026-08-23 on roughly 140 entries -- a plausible,
uniform, entirely fabricated answer that nothing on screen would have reported.
`git fetch --unshallow` took the history from 191 commits to 849 and the dates
became real. **A date derived from git in a shallow clone is worth nothing**, and
it fails silently in the direction of looking fine.

The limit that remains: a date is when the entry was WRITTEN DOWN, not
necessarily when the work shipped. For a bundle that wrote its record in the same
session, those are the same day; for the pre-split sections carried over from
`CLAUDE.md`, the date is when that section first appeared there.

### The subsystem assignments for the 78 the index had lost

Those entries had no group, so one was assigned per entry -- keyword-matched
against the existing vocabulary, then read and corrected by hand (ten matched
nothing and were assigned outright; several matched a group that was wrong for
them). **It is a classification, not a measurement.** It is cheap to be wrong
about: a group is one line of front matter in one file, the index is regenerated
on demand, and `grep -r` does not depend on it at all. The 90 entries that WERE
in the committed index kept their existing groups untouched.

### `docs/HISTORY.md` itself

It is not deleted -- `CLAUDE.md`, older entries, and a dozen code comments under
`src/` and `tests/` link to that path. It is now a 128-line pointer carrying the
reason for the split, the naming rule, the front-matter shape, how to grep, and
what the two scripts do. **Nothing is appended to it again**, which is what makes
it a file that can never conflict.

The stale references left in place deliberately: `src/lib/AppLauncher.svelte`,
`src/lib/foundry/preflight.ts`, two `/dev/classroom-view-as-notebook` files, five
test files and `docs/GAUNTLET.md` all cite `docs/HISTORY.md` in comments. They
still resolve, to a page that says where the record went. Rewriting them would
have meant editing `src/` and `tests/`, which this bundle's brief excluded, and
they cost a reader one extra hop rather than a dead end.

### `CLAUDE.md`

Six references updated, all of them in place:

1. The header pointer now names `docs/history/`, says `grep -r` is how you find
   an entry, and names `npm run history:index` for the generated indexes.
2. The disclosure-decision rule points at the directory.
3. The `app_feedback` two-path rule points at the directory, with the grep.
4. **The standing directive**, which is the one that matters: it now says create
   `docs/history/<your branch slug>.md`, states in the file's own voice that the
   reason is that a shared append point cannot be merged by two sessions, and
   says plainly that **nobody consolidates them back later and nobody may**. It
   also rules out a counter-derived name, states the front-matter shape, and
   records that there is no index to update for SQL or anything else.
5. The `CLAUDE.md`-is-authoritative line, plus the addition that an entry is
   written once and a correction is a NEW entry rather than an edit to the old.
6. The scope-guardrails pointer resolves to the exact file.

### What was measured

- `npm run history:verify` -- 168 entries, 2,252,747 bytes, byte-identical to the
  pre-split body against both the git object and the pinned sha256. Four
  mutations reddened it; the tree was restored md5-identical after each.
- Generated migration index vs the committed one: 140 rows, **171 pairs,
  set-identical**. Generated subsystem index: 168 entries against the committed
  90, a **strict superset**.
- `npx svelte-check`: **0 errors, 37 warnings**, mix 31 `state_referenced_locally`
  / 5 `css_unused_selector` / 1 `perf_avoid_nested_class` -- the pinned baseline,
  re-derived after `svelte-kit sync` with the two placeholder `PUBLIC_SUPABASE_*`
  values exported, per the fresh-checkout rule.
- `npm test`: **135 files, 3110 tests, all passing**, run after both merges. The
  split adds no test and touches no code, so this is the merged baseline.
- `npm run verify:browser`: **20 route/width runs, 146 measurements, 2 outside
  threshold**, which is the harness branch's own reported figure. Both findings
  are the same pre-existing one at both widths -- `/dev/pathways`, harness
  controls, smallest 194.7x26.2, min dimension 26.2px against the 44px target and
  above the 24px floor. The check and its selector are byte-identical at
  `a60ff67`, so it predates this session and nothing here touched it.

### What was NOT verified

- **No live Supabase project was reached.** Nothing here has a database side.
- **No migration** was written, applied or needed.
- `npm run build` was not run. The bundle changes no code.
- The browser pass covers `/dev` routes only and blocks non-loopback requests, so
  text is measured in the `@fontsource` fallback stack and
  `prefers-reduced-motion` is `no-preference`. Nothing in this bundle renders.
- The derived dates were spot-checked against the headings that state one, not
  audited entry by entry against what actually shipped when.
- The 78 subsystem assignments were read, not measured. See above.
- This branch was not merged to `main` and nothing was force-pushed.

### What was deferred

- The dozen `docs/HISTORY.md` references in code comments under `src/` and
  `tests/`, and three in `docs/GAUNTLET.md`. They resolve to the pointer.
- `classroom-updates.json` gets no entry: nothing a student sees changed.
- The two undocumented migrations (`0014_vanguard_runs.sql`,
  `0031_gauntlet_tools_bucket.sql`) are still undocumented. The generated index
  now says so on every run, which is a better prompt than the old hand-written
  cell was.
