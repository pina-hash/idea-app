---
title: "Unblocking main's CI: one line of three.js, five assertions that described deleted controls, and one record a session must not write (`claude/ideacad-unblock-0258`, no migration)"
date: 2026-09-14
branches: [claude/ideacad-unblock-0258]
migrations: []
subsystems: ["IdeaCAD", "CI", "Testing"]
---

Ledger 0258. `main` had been red on BOTH CI gates since #104 -- `check` and
`test` -- which blocks every lane in the repository, not just the one that
found it. This bundle is authorised to reach outside a single bundle's owned
surface for exactly that reason, and it reaches no further than it has to.

## What was actually red, and what each one was

Measured on `origin/main` at `eabed627` in a clean worktree, never inferred:

| gate | failure | whose |
|---|---|---|
| `check` | `picking.ts` passes `Vector2Like` where three.js wants `Vector2` | ledger 0245 |
| `check` | `tests/ideacad-tree-ops.test.ts:51` `'body' is possibly 'undefined'` | ledger 0252 |
| `test` | 5 assertions in `tests/dom/ideacad-ui-mount.test.ts` | ledgers 0240, 0250, 0252 |
| `test` | `ideacad-tree-ops` station bounds | ledger 0252 |
| `test` | `migrations-applied-record`: no record for `0215` | ledger 0234 |

This bundle fixes the first and the third. **It deliberately fixes neither of
ledger 0252's, and deliberately does not write the `0215` record.**

## The one-line fix

`raycastFeatures` takes a `Vector2Like` -- the loose structural `{x, y}` --
and handed it straight to `Raycaster.setFromCamera`, which wants a real
`Vector2`. Constructing one from the same two numbers is behaviour-identical.
The PUBLIC signature stays `Vector2Like`, because narrowing it would push the
construction onto every call site instead.

## Five assertions that described controls a product decision removed

The failing tests were not a regression: every one of them pinned behaviour a
later lane deliberately deleted. **The padlocks were not restored.** Each
assertion was re-pointed at the mechanism that replaced it, so the RULE each
one served keeps its coverage:

- **A single click now opens the editor.** Ledger 0240 wired `onclick` to
  select-and-edit, because the old two-step (click to look, double-click to
  edit) was the discoverability defect the owner reported as "I don't know how
  to do anything". The test now pins the shipped contract and that the older
  double click still lands on the same panel rather than toggling it shut.
- **The blanket "cannot be renamed or deleted" note became a per-row VIEW
  chip**, because with features editable the sentence had stopped being true.
  The interface rule is unchanged -- a control absent for a reason says the
  reason -- so the test asserts the chip lands on the rows that really are
  read-only, **with a positive control that an editable row carries none**, so
  it cannot pass by the chip being everywhere.
- **`.pm .standing` became `.actions`, and its sentence became
  `.feature-state`**, a chip reading FIXED FEATURE whose `title` carries the
  two verbs. The reason is still stated in the pane the student is working in,
  which is what that assertion is for.
- **The tree is FLAT now**: ledgers 0250 and 0252 removed the expander and
  moved station editing into the direct-manipulation profile editor. Rather
  than delete the two tests that drove it, they pin the DECISION -- no
  expander, no `aria-expanded`, no `Station N` rows, eight rows -- so a lane
  re-introducing child rows reddens here. The drag model that replaced them
  keeps its own coverage in `tests/ideacad-profile-drag.test.ts`.

**Nothing was weakened to get green.** The one assertion removed was one *this
session added* an hour earlier: an `aria-selected` check after a pointer click,
which the original test never made and which the sibling keyboard test already
covers. It is gone because it was widening, not because it was inconvenient.

**The count grew from three to five while this was being written**, because
ledgers 0250 and 0252 landed in between. The two extra are the same category.

## The `0215` record is NOT written, and no session may write it

`supabase/migrations/0215_short_link_reserve_ideacad.sql` reserves the
`ideacad` slug, moves any existing short link off it into
`app_short_link_reserved_moves`, and rewrites `_app_short_link_reserved`.
**It has never been applied to production.** The record is missing because the
migration is genuinely unapplied, not because paperwork was skipped, and
`tools/record-applied.mjs` writes from Mr. Pina's own verification output
rather than from anything a session believes. So
`migrations-applied-record` stays RED until he pastes the migration and the
record is written from what production answers. The read-only verification
query is in this PR's body for him.

**Writing that record from here would have turned a true "this is not applied"
into a false "this is applied", in the one file whose entire job is to be
trustworthy about that.** It is the cheapest possible green and the most
expensive possible lie.

## What was measured

- `tests/dom/ideacad-ui-mount.test.ts`: **36 passed (36)** on this branch,
  against **5 failed | 31 passed (36)** on `eabed627`.
- `svelte-check`: **1 error, 37 warnings in 21 files**, against **2 errors, 37
  warnings in 22 files** on `eabed627`. The surviving error is ledger 0252's,
  named above and out of this bundle's grant.

## Not verified

- **Ledger 0252's two failures are untouched and this branch does not make CI
  green on its own.** Its test's own loop adds five stations to a four-station
  default and then asserts the ninth succeeded, so the arithmetic is off by one
  and `ops.ts` is right; the type error beside it is `body` not being narrowed
  across the `while`. Both are one-line fixes in a file this bundle's grant
  excluded in as many words, and they landed after that grant was written.
- No browser pass: nothing here changes what renders.
- The updated assertions were run as a file, not driven in a browser.
