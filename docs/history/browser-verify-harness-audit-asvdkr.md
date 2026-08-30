---
title: "Two sessions each tripped over a green assertion measuring nothing; auditing the whole browser harness found thirty (`claude/browser-verify-harness-audit-asvdkr`, no migration)"
date: 2026-08-30
branches: [claude/browser-verify-harness-audit-asvdkr]
migrations: []
subsystems: ["Testing"]
---

Two sessions on unrelated bundles each independently discovered, without looking
for it, that an assertion in `tools/browser-verify` was green while measuring
nothing. Two findings from two accidental samples is not two bugs, it is an
estimate of a rate -- and a verification layer's coverage is itself a claim
requiring verification, which nobody had ever made about this one.

**Nothing in `src/` was changed by this bundle.** Everything below is the
instrument, plus the specs that describe surfaces the instrument was not
actually reading.

## What was examined, and what was found

**29 route specs on `main`, 266 assertion rows and 24 prepare steps**, read file
by file and then enumerated mechanically (the same sweep over the 36 specs and
362 rows the `integration` branch carries, so a core change could be judged
against the tree `main` is heading for rather than only the one in front of it).

**Thirty rows could not fail**: seven on `main`, twenty-three on `integration`,
every one of them a `presence` row written `expectPresent: 0`. Three more were
half-vacuous -- an absence stated with `maxVisible: 0`, where the ceiling closes
the visible half and the present half is still a bare floor.

**Fifteen prepare steps were structurally exposed** to `clickUntil`'s pre-click
short-circuit, and none of them was firing it on `main` the day this was
measured. That is the shape of the trap rather than an acquittal: the two real
occurrences both arrived when an unrelated change made a predicate true at rest.

## The four things proved by mutation

Each was run against a scratch copy and restored from that copy, md5-verified
identical -- never `git checkout --`, which is a discard-to-HEAD.

1. **`expectPresent: 0` is `present >= 0`, which holds for anything.** An
   `<svg>` inserted into `TrademarkFooter.svelte` -- the exact compliance
   regression `docs/GAUNTLET-DESIGN.md`'s "nominative text only, never the logo
   or a lookalike" forbids -- produced
   `ok presence [no mark of any kind inside the footer] present 1, visible 1`
   and a run reporting **0 measurements outside threshold**.
2. **A prepare click whose `until` holds at rest never fires, and says
   "clicked".** `SongQueue`'s `notice` seeded non-null made
   `[data-testid="song-queue-notice"]` present before any press: the step
   reported `1 matched, 0 attempt(s), already satisfied`, the aria-disabled
   click-through contract that route exists to prove went entirely unexercised,
   and the run again reported **0 outside threshold**. Nothing else on the route
   moved.
3. **A count floor does not measure the exclusion its own prose states.**
   `/dev/foundry-gallery`'s play-count row says "2 chips painted, never 3";
   giving the deliberately-zero fixture app `plays: 7` painted a third chip and
   the row came back `ok ... present 3` against `>= 2`, label unchanged.
4. **A prepare step that fails outright was not a measurement at all.** A spec
   handed three broken steps at once -- an `evaluate` that throws, a `click`
   whose selector matches nothing, a `waitFor` that times out -- reported
   `4 measurement(s), 0 outside threshold` and **`--strict` exited 0**, over a
   route whose every number described a state the run never reached.

## The fixes, and why two of them are in the core

**`expectPresent: 0` now implies `maxPresent: 0`** (`checks.mjs`). The default is
the fix rather than the parameter: a caller asking for zero is stating an
absence in every one of the thirty rows that do it, and a floor of zero is not a
weaker assertion than they wanted, it is no assertion -- so there is no
legitimate `>= 0` to take away. A row that genuinely wants a floor above zero
(`/dev/pathways` counts chips across every stage on purpose) is untouched.
`maxPresent` is also settable explicitly, which is what the specs whose own
prose states a count now use. **A per-spec fix would have left the next spec to
rediscover this**, which is exactly what had already happened: the
`classroom-discoverability` lane measured the same defect independently, wrote
it up in `classroom-inspector-case-sparse-open-1.mjs`, and closed it with
`maxVisible: 0` plus an `orderResult` count on three rows -- while sixteen more
of its own rows kept the bare floor.

**Every prepare step is a measurement** (`run.mjs`, with the three result
builders in `checks.mjs` beside the other checks). They were strings pushed onto
a `prepared` array and printed above the results, which is why proof 4 was
possible. A click step now passes only when the click ACTUALLY FIRED
(`attempts >= 1`) under a predicate that then confirmed its effect, so the
short-circuit of proof 2 is a red row rather than the word "clicked". The two
ways out are both deliberate and both visible: write a predicate naming
something only the click can produce -- which is what the `classroom` lane did,
`bulk-count` rather than `bulk-bar` -- or pass `force: true`, which annotates
its own row `[force: predicate not required to discriminate]` so the next reader
learns it from the line rather than from the spec file. `waitFor` returning at
0ms is deliberately NOT a finding: waiting is not supposed to cause anything.

**The threshold column now says `visible unconstrained`** where the visible half
has no ceiling. Those remaining rows are deliberate (`.gt-tree` paints at 1440
and not at 375, and the spec says so), but deliberate and invisible are
different things, and `>= 0 visible` reads like a measurement.

## What the core cannot fix, and what was done about it instead

**An absence row cannot tell "the rule holds" from "the selector was renamed."**
`present 0` is the identical reading and no ceiling separates them. Every
absence row in `routes/` was checked for a positive control in the same spec and
every one has one -- the footer's own `.gt-tm`, the song queue's
`[aria-disabled]` twin, the 30 grid cells beside the two absent cell states, the
25 student rows beside `classroom-view-class-bulk-student`'s eleven manager-only
exclusions. `--selftest` now carries a control that PROVES the limit rather than
leaving it to be found again: its `bad` slot is the one expected to PASS.

**Twelve specs had a floor standing in for an equality their own prose states**
and were tightened with `maxPresent` -- the play-count chips, the four verdict
mounts and every clock state, the five hall-pass action blocks ("5, never 6"),
the eight-row legend, the twelve mark cells (a thirteenth would be swept by
nothing, since `GATED` is a hand-kept list), the two spec tables. Floors were
KEPT where the label makes no count claim (`h1, .note` "page copy", the home
feed's rendered rows) and the comment now says so.

## The real defects the tightening exposed

**`/dev/notebook-review-student` described behaviour the component does not
have, and the floor hid it.** The spec's header said ana's two deleted entries
render "a Restore control on the first, a bare refusal reading on the second"
and its row asserted `expectPresent: 1`. It has been reading `present 2` at both
widths for as long as the route has been listed: `NotebookDeletedZone` renders a
Restore control for every row it is handed whenever `restoreEntry` is present,
deliberately -- the dev fixture says so in as many words ("the RPC's own gate is
what actually decides who may restore what, not a flag this page keeps in sync
with it"). The spec was wrong, not the app; it is corrected to 2 with a ceiling
and the false paragraph is replaced with the reason.

Two findings the README carried no longer reproduce and are named rather than
deleted: `/dev/coin-preview`'s student picker measures **352x44** (was 19px
tall) and `/dev/short-links`'s composer save control **112.8x44** (was 76.1x24).

## Measured

- **58 route/width runs, 580 measurements, 2 outside threshold**, 151.5s. The
  two are the one documented `/dev/pathways` tap-target finding at both widths.
  532 -> 580 with no route added: 24 prepare steps at two widths. +7.4s, about
  0.15s per extra measurement.
- **`--selftest`: 64 controls (32 negative, 32 positive), 0 instrument
  failures**, up from 52. New groups: `expectPresent 0` as an equality; the
  renamed-selector LIMIT; a prepare predicate satisfied at REST; a click with no
  `until`; a failing `evaluate`/`waitFor`.
- Every fix carries a positive control: re-running each mutation after the fix
  reddens exactly the row it should, and proof 4 now exits **1** under
  `--strict` where it exited 0.

## Not verified

- **Nothing here was run against a signed-in surface or the live Supabase
  project.** `/dev` routes only, which is the harness's standing boundary.
- **The `integration` tree was exercised in a scratch worktree, not on a
  deploy.** No Vercel preview was built (the account is rate limited); this
  bundle needs none.
- **`expectVisible: 0` with a floor above zero on `expectPresent` is still an
  unconstrained half** on four rows, all of them deliberate and all now saying
  so in the threshold column. Closing them means `maxVisible`, which
  `/dev/gauntlet-shell` already measured to be the wrong tool for an element
  hidden by being moved off the viewport.
- **A `force: true` click can still hide an undiscriminating predicate.** It is
  annotated in the report rather than refused, because `/dev/notebook` genuinely
  needs it: `selectedSession` starts null before the mount effect settles it and
  `.pick.free`'s `aria-pressed` IS that comparison, so no predicate on that
  route can name something only the click produces.
