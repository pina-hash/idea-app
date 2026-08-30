---
title: "Four branch-and-migration rules into IDEA_instructions 4.14 and two control-cannot-fail rules into IDEA_VERIFICATION_ADDENDA 2.2, as pure insertions while three lanes were live (`claude/standards-maps-p1-rules-h2k7wq`, no migration)"
date: 2026-08-30
branches: [claude/standards-maps-p1-rules-h2k7wq]
migrations: []
subsystems: ["Standards", "Documentation"]
---

### 1. What landed

Documentation only: two files under `docs/standards/` and their two rows in
`REGISTER.md`. No application code, no migration, no test.

`IDEA_instructions.md` 4.13 -> 4.14 gains four rules. Two are about the shape
of this repository's branching: that `integration` falls behind `main` **by
design**, because migrations go straight to `main` and never through a branch,
so a branch cut from `integration` lacks them and reddens on any test pinned to
the migration chain; and that a migration and the test pinning its behaviour
cannot be separated, because `tests/db/` runs the real chain and either half
landing alone turns `main` red. One is about a measurement instrument:
`raw.githubusercontent.com` is CDN-cached, so a merge confirmed by `curl`
within minutes of a push reads the pre-push file and reports landed work as
absent. The fourth is a correction rather than a new rule, and is treated as
one below.

`IDEA_VERIFICATION_ADDENDA.md` 2.1 -> 2.2 gains rules 31 and 32, both about a
control that cannot fail: a negative control that DROPS a published-only RLS
policy makes the anonymous caller see nothing, so the draft-invisibility
assertion passes vacuously; and a `--depth 1` clone runs history commands
successfully and returns fiction, `git log -1 --name-only` listing the entire
tree as the single commit's file set.

### 2. The safety argument, which is the deletion count

Both files are edited by many chats and three lanes were live in this
repository while this bundle was written. Every edit was therefore a pure
INSERTION after a named anchor, and every anchor was verified to match **exactly
once** before anything was written -- the applying script exits on any other
count rather than searching for somewhere else to put the text. All eight
anchors (two version headers, four insertion points in
`IDEA_instructions.md`, two in `IDEA_VERIFICATION_ADDENDA.md`) matched once.

**Deletions against the merge-base, which is the number the whole approach
rests on: ONE per standards file, and in each case it is the version header
line being bumped.** `IDEA_instructions.md` +60 / -1, where the -1 is
`**Version 4.13 - 2026-08-30**`. `IDEA_VERIFICATION_ADDENDA.md` +11 non-blank
(+19 lines gross) / -1, where the -1 is `**Version 2.1 - 2026-08-29**`.
`REGISTER.md` is +2 / -2, its two rows, which is what a cell edit looks like in
a line-oriented diff and is the change that was asked for.

A deletion count is a weaker claim than it sounds, though, because it says
nothing about ORDER -- a diff can report zero deletions while content has been
reshuffled. So the stronger property was measured directly: **every line
present at the merge-base is still present in the new file, in order.** Old
2516 lines -> new 2576 for `IDEA_instructions.md`, old 251 -> new 270 for the
addenda, and in both cases the count of old lines not found in the new file as
an ordered subsequence is **0**. That is pure insertion proven rather than
asserted, and it is what makes these edits safe to land under running lanes:
nothing another chat wrote can have been displaced.

### 3. The fork check, which is the reason to look before writing

The brief said to stop if either file was already at the target version, on the
grounds that a matching version number from another chat is a fork rather than
a duplicate. Checked wider than asked: not just `integration` and `main` but
**every remote branch**, since a lane could be carrying 4.14 without having
merged anywhere yet. All three refs at the time (`origin/main`,
`origin/integration`, `origin/claude/coin-anon-projection-test-fix-r3m6g4`)
read `Version 4.13` and `Version 2.1`. No fork; clear to proceed.

Two branches were auto-deleted between this session's first fetch and its
second -- `claude/idea-maps-admin-editor-65iyd4` and
`claude/maps-reserved-slug-te00c3` -- both merged into `integration` by
`.github/workflows/integrate.yml`, which is the workflow behaving correctly and
not a loss.

### 4. The branch this landed on is not the one the session started with

Worth writing down because it is a consequence of a rule this repository
already has. `docs/history/` names an entry for its branch, and that filename is
collision-free **by construction** only because a branch name cannot be taken
twice. This session began on `claude/maps-reserved-slug-te00c3`, which had
already spent its name on `docs/history/maps-reserved-slug-te00c3.md` in the
previous bundle. Reusing it would have collided with a file already on `main`,
so this work took a fresh branch, `claude/standards-maps-p1-rules-h2k7wq`, cut
from `origin/main`.

`origin/main` rather than `origin/integration` because, measured at the time,
`integration` was **0 commits behind `main`** and 15 ahead -- `main` was already
an ancestor of it -- so a branch cut from `main` merges into `integration`
adding only its own commit. That is worth stating rather than assuming, because
the rule inserted in 1A above is precisely that the gap normally exists and
that closing it by the back door, under running lanes, is the thing not to do.
On this occasion there was no gap to close: the maps branches merging into
`integration` had already carried `main`'s history across, including `0166`.

### 5. Verification

- **`tests/standards-version-header.test.ts`: 20 passed / 20.** It checks each
  file's header against its own newest changelog entry and that `REGISTER.md`
  names each file at its own version. Both files were built to satisfy it and
  did; nothing was edited to make it pass.
- **Deletion count: 1 per standards file, both version headers**, plus the two
  authorised `REGISTER.md` rows. Subsequence proof of pure insertion: 0 old
  lines missing from either new file. Section 2 has the numbers.
- **Structure read back rather than assumed.** The addenda's headings run
  `## 30 -> ## 31 -> ## 32 -> ## Note on internal organization -> ## Changelog`,
  so the two new rules sit inside the numbered sequence and ahead of the note,
  which is where the anchor put them. The four `IDEA_instructions.md`
  insertions were each read in context to confirm the bullet nesting and the
  two-space continuation indent match the list they joined -- 1C in particular,
  which is a new paragraph inside an existing bullet rather than a new bullet.
- **`npm run history:verify`:** lossless, 168 entries reassembled of 168
  expected, 2252747 bytes, sha256 identical to the reference.
- **`npm run check`: 0 errors, 37 warnings, 20 files with problems** -- the
  documented baseline, held. Breakdown intact at 31 `state_referenced_locally`,
  5 `css_unused_selector`, 1 `perf_avoid_nested_class`.

### 6. Not verified

- **No test suite run beyond the standards header file.** This bundle changes
  no application code, no SQL and no test; `npm run check` and the standards
  test are the checks that can say anything about it. The full suite was run in
  the previous bundle on this same base and was green there.
- **Nothing rendered.** These are Markdown documents in a directory that is not
  served and is on no import path, so there is no browser pass to run.
- **The claims inside the new rules are recorded, not re-measured here.** The
  CDN-cache behaviour, the shallow-clone `--name-only` behaviour and the
  RLS-drop control were established elsewhere; this bundle is the write-down.
  The one exception is the `CREATE OR REPLACE ... preserves ACL` correction in
  1C, which was measured on `0166` in the previous bundle -- `proacl` after two
  applies held `postgres` and `service_role` and nothing else.
- **Not merged.** The branch is pushed and left standing; `main` is untouched.
