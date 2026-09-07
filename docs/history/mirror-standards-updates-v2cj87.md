---
title: Mirror the standards updates (0100)
date: 2026-09-07
branches: ["claude/mirror-standards-updates-v2cj87"]
migrations: []
subsystems: ["docs/standards"]
---

Prompt 0100. Mirrored three files delivered by the router chat, built from
`origin/main` at `01cb9cb1`, wholesale into `docs/standards/`:
`IDEA_instructions.md` (4.22 -> 4.23), `IDEA_VERIFICATION_ADDENDA.md`
(2.3 -> 2.4), and `REGISTER.md`.

## What changed and why

No code changed. This is a documentation mirror only, per the standing rule
that `docs/standards/` is the freshness authority for files authored in
project knowledge. The delivered files were copied over the tree's copies
without merging by hand or editing their content, per the prompt's explicit
instruction that the delivered files are the record.

4.23 of `IDEA_instructions.md` adds, per its own changelog entry: the three
fetches (`git fetch --unshallow`, `git fetch origin integration`, the git
identity check) every Claude Code prompt now opens with, after five sessions
independently rediscovered the shallow-clone trap and two mistook it for a
defect in `apply-migration.mjs`; migration and prompt numbers being
allocated in the prompt rather than derived by a session; agents splitting
inside a lane and never across lanes; the four-of-eight rate at which an
open closeout item turns out already shipped; a report to the router chat
not constituting a record; never routing Mr. Pina through GitHub Actions;
and the permanence of a cloud container's inability to reach the database.

2.4 of `IDEA_VERIFICATION_ADDENDA.md` adds five ways a measurement lies (a
cold `vite dev` first load, a collapsed module reading zero, an unhonoured
`until` in a prepare step, a cached CI API snapshot read as a stalled job,
and a waiter loop that greps for its own command line), the clean-tree
requirement for `verify:readme`, the red-merge-green-parents shape (47
cross-file tests, a version-string collision invisible to git and to the
version test alike), and `aria-disabled` disabling nothing, alongside the
in-flight write guard that the investigation into it actually needed.

## One correction made to the delivered content

The delivered `IDEA_VERIFICATION_ADDENDA.md`'s newest changelog entry was
written `- **2026-09-07 (2.4)** - ...` (date-first), while every other entry
in that file's changelog, and `tests/standards-version-header.test.ts`'s
`ENTRY_VERSION` regex, expect the version-first shape
`- **X.Y (date)** - ...`. Under the date-first shape the test's changelog
parser skipped the newest entry and read the version off the entry below it
(2.3), reporting the header (2.4) as having fallen behind its own changelog
-- even though header, changelog and `REGISTER.md` all agreed on 2.4 by eye.

Reported to Mr. Pina rather than resolved silently. Given a choice between
reformatting the one line (version/date order only, no content change) and
halting the whole prompt to wait for a redelivered file, he chose the
reformat. Changed exactly the bold lead-in of the top changelog entry from
`**2026-09-07 (2.4)**` to `**2.4 (2026-09-07)**`; no other character in
either delivered file was touched. The test then passes 21/21.

## What was measured

- Version triples for both files (header / newest changelog entry /
  `REGISTER.md` row) agreed before this correction and after it: 4.23 /
  2026-09-07 for `IDEA_instructions.md`, 2.4 / 2026-09-07 for
  `IDEA_VERIFICATION_ADDENDA.md`.
- `npx vitest run tests/standards-version-header.test.ts`: 21/21 passed
  after the one-line correction above (1 failure before it).
- `git status --short`: exactly the three standards files modified, no
  other file moved.
- `npx svelte-kit sync && npx svelte-check`: **0 errors, 37 warnings**
  (31 `state_referenced_locally`, 5 `css_unused_selector`, 1
  `perf_avoid_nested_class`), matching the CLAUDE.md baseline exactly. Run
  against a fresh `npm ci` checkout with a placeholder `.env` copied from
  `.env.example` (per the fresh-checkout trap), removed again afterward.
- `npm test`: **326 files, 6504 tests, all passed**, matching the baseline
  prompt 0099 left `main` at. Run started 11:02:09 AM America/Los_Angeles
  on 2026-09-07.
- `npx vitest run tests/derived-numbers.test.ts`: 18/18 passed, confirming
  no regeneration was needed rather than assuming it.

## What was deferred / not verified

Nothing. This is a zero-code, zero-migration documentation mirror; every
claim above was measured directly rather than assumed.

## classroom-updates.json

No entry added. Nothing a student sees changes -- this bundle touches only
`docs/standards/`, the prompt ledger and this history entry.
