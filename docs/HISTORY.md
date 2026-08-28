# idea-app engineering history -- moved to `docs/history/`

**This file is a pointer. The record lives in [`docs/history/`](history/), one
file per entry. Do not add an entry here.**

`CLAUDE.md` and older entries link to this path, so it stays. Nothing is
appended to it again, which is the point: a file nobody edits is a file that
never conflicts.

---

## Why it was split

Every session appended a new `##` section to the end of one 35,000-line file,
and updated the same three indexes near its top. Two sessions working in
parallel therefore always wrote to the same handful of lines, so their branches
could never merge cleanly -- this file blocked an automatic merge on four
consecutive batches, and GitHub eventually refused to resolve it in the web
editor at all.

The fix is that **a new entry is a new file**, and a new file conflicts with
nothing. There is no shared append point left to contend for, and no index
line for two sessions to both rewrite.

The 168 entries that were in this file on 2026-08-28 are now 168 files under
`docs/history/`, byte for byte. Nothing was summarised, shortened or dropped.

## Where an entry goes now

**Create `docs/history/<your branch slug>.md`** -- your session's git branch
with the `claude/` or `lane/` prefix removed. On
`claude/history-merge-split-vx1fmk` that is
`docs/history/history-merge-split-vx1fmk.md`.

The name is your branch and nothing else, because the harness mints one branch
per session and a branch name cannot be taken twice. Two sessions running at
the same time therefore write two different filenames and touch no line in
common. There is nobody who consolidates these back into one file later, and
there must not be: merging them back would restore the exact write point this
split removed.

The 168 pre-split entries are named `record-<slug of the heading>.md`.
**`record-` is a reserved prefix**: it names a closed set, written once by the
split, and nothing is ever added to it. `npm run history:verify` refuses a
`record-` file that is not one of the originals, and refuses a branch-slug file
that pretends to be one.

## The shape of an entry file

YAML front matter, one blank line, then the entry, opening with its own `##`
heading:

```
---
title: "A check-in dated in the future is scheduled, not missing (`0140`)"
date: 2026-08-27
branches: [claude/scheduled-checkin-future-status-vqlnpu]
migrations: ["0140"]
subsystems: ["Digital notebook"]
---

## A check-in dated in the future is scheduled, not missing (`0140`)

...the entry, in the shape the record has always used: what changed, the
load-bearing decisions and why, what was measured, what is explicitly NOT
verified, and what was deferred.
```

- `title` must match the `##` heading exactly. `npm run history:verify` compares
  them, so the two cannot drift.
- `migrations` is quoted (`"0140"`, not `0140`, which YAML reads as octal) and
  is `[]` for a code-only bundle.
- `subsystems` uses the group names `docs/history/_tools/index.mjs` sorts by;
  an unlisted one still prints, at the end.
- `record_order` appears only on the 168 `record-` files. It is the position the
  entry held in this file before the split, and it exists so the split can be
  proven lossless. **A new entry does not have one and must not add one** -- that
  would be a number two sessions could both pick, which is the shared write
  point again under a different name.

## Finding an entry

**`grep -r` over `docs/history/` is the primary way**, which is why the front
matter carries everything the indexes key on -- date, branch, migration numbers,
subsystem -- as plain greppable text.

```bash
grep -rl '"0133"' docs/history          # every entry documenting migration 0133
grep -rl 'IDEA Foundry' docs/history    # every Foundry entry
grep -rn 'title:' docs/history          # every entry's title
```

For the three indexes this file used to carry -- by subsystem, inside GREENLINE,
and by migration -- run:

```bash
npm run history:index                       # print them
npm run history:index -- --out              # write docs/history/_generated/INDEX.md
```

**They are generated and never committed.** A committed index is the same
single write point moved: it would have to be edited by every session and would
conflict exactly as often. The migration table in particular is inverted from
each entry's own `migrations:` list, so the many-to-many mapping is derived
rather than maintained, and it takes its rows from `supabase/migrations/` on
disk, so a migration no entry documents still gets a row and says so.

## The scripts

| Command | What it does |
|---|---|
| `npm run history:index` | Prints the three indexes from the entries' front matter. |
| `npm run history:verify` | The split's control: reassembles the 168 `record-` files in `record_order` and proves the result is byte-identical to this file's body as it stood at `ea9f043b6ca0be58085c253e865ad77687363044`. |

`history:verify` is kept so the losslessness can be rechecked at any time, and
so a later edit to an archived entry is caught rather than assumed away. It
also checks the things the reassembly cannot see on its own: unique filenames,
a contiguous `record_order`, and every `title` matching its heading.

Both live in `docs/history/_tools/`.

## What was here before

The record body -- 168 entries, 2,252,747 bytes -- plus three indexes over it.
Every byte of the body is in `docs/history/`; the indexes are generated now.
The last commit at which this file held the whole record is
`ea9f043b6ca0be58085c253e865ad77687363044`, and its own split entry is
[`docs/history/history-merge-split-vx1fmk.md`](history/history-merge-split-vx1fmk.md).
