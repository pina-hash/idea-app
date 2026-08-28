---
title: "Three loose ends from the notebook work (code-only; NO migration)"
date: 2026-08-20
branches: []
migrations: []
subsystems: ["Digital notebook"]
record_order: 90
---

## Three loose ends from the notebook work (code-only; NO migration)

Follow-up to `0121` and the surrounding notebook/classroom bundles: one
reported-but-unfixed contrast value, and one route that had never been
verified because no harness reproduced its actual nesting.

### `--nb-ink-faint` on the light plate

Measured 3.66:1 against `--nb-surface` (`#ffffff`) -- below 4.5:1, and the
token behind `--text-3` inside `.nb-root`, so it carried the light plate's
column dates, counts, free-form note lines and the grid legend. Reported as
pre-existing rather than silently altered when `6376ad4` found it.

Darkened `--nb-ink-faint` from `#8b857a` to `#706b62`. The binding constraint
was `--nb-surface-dim` (`#f2f1ea`), not the lighter page background or card
surface -- a darker background does not automatically buy more contrast
against a fixed foreground once the three surfaces are this close in
lightness. Measured (WCAG relative luminance):

| Surface | Before | After |
| --- | --- | --- |
| `--nb-bg` `#fafaf7` | 3.50:1 | 5.06:1 |
| `--nb-surface` `#ffffff` | 3.66:1 | 5.29:1 |
| `--nb-surface-dim` `#f2f1ea` | 3.23:1 | 4.67:1 |

The dark and IDEA plates' own `--nb-ink-faint` values were re-measured, not
just assumed fine: dark (`#918a79`) is 4.90-5.66:1 across its three surfaces,
IDEA (`#7a8f83`) is 5.07-5.66:1. Neither needed a change.

### `/classroom/view-as/[studentEmail]/notebook`: two mastheads, one hand-rolled notice

`6376ad4` found and correctly left both, since a token sweep was not the place
to restructure a page:

- **Two mastheads.** `ClassroomShell` (mounted by `/classroom/+layout.svelte`,
  `minimal` in the view-as tree) renders its own `.app-header`; `NotebookView`
  unconditionally rendered a second one via `NotebookMasthead`. `NotebookView`
  gained a `masthead` prop (default `true`); the view-as notebook page passes
  `masthead={false}`. `homeHref` still has no effect when `masthead` is false,
  since there is no bar left to carry the link -- the way back is
  `ClassroomShell`'s own minimal-mode link.
- **A hand-rolled second copy of `NotebookNoAccountNotice`.** The page had its
  own inline `.nb-noaccount` markup and styles, byte-different from
  `NotebookNoAccountNotice.svelte` (the shared component `0106`/`0117` already
  extracted for `/notebook/review/student/[studentEmail]`). Replaced with the
  import. Proved it is one implementation the way the earlier extractions did:
  added a marker string to the shared component, confirmed it rendered through
  the new harness below, then reverted (`git diff --stat` clean afterward).

### The missing harness

No harness reproduced `.nb-root` nested inside `.cr-root` -- the one structural
shape the view-as notebook page actually renders -- so this route had never
been verified in a browser. Added
`src/routes/dev/classroom-view-as-notebook` (dev-only, 404s in production),
mounting the same three components the real route tree nests, in the same
order: `.cr-root` + `ClassroomShell` (`minimal`), `ImpersonationBanner`, then
either `NotebookView` (`masthead={false}`) or `NotebookNoAccountNotice`, picked
the same way the real page picks between them. A student-picker toggle drives
both branches.

Verified through it (computed DOM reads, not screenshots -- the Browser pane
does not composite): `.app-header` count is 1 on both branches (was 2 on the
NotebookView branch before the `masthead` prop), `.cr-root`/`.nb-root`/`.imp-bar`
each count 1, and with `colorScheme: light` forced, `--text-3` inside `.nb-root`
resolves to the new `#706b62`.

`svelte-check` 0 errors / 36 warnings (baseline, unmoved). Full suite 66 files
/ 1587 tests green.

### The classroom update log

Checked whether `25064cf` (the accept-control session, per `0121`'s deferral)
appended the required entry about `reviewed_at` blocking student delete/
unsubmit. It had -- "Your instructor can mark a notebook entry reviewed" already
states plainly that a reviewed entry can no longer be deleted or moved back to
drafts by the student, and to ask the instructor. Nothing changed here.

### NOT verified

- **No live Supabase project, no real signed-in admin session.** The view-as
  route needs an admin grant and a real student roster row; both the fix and
  the harness were verified with in-memory fixtures only.
- **No screenshots.** The Browser pane does not composite; every claim above is
  a measured DOM/computed-style read.

---

