---
title: "Who made this edit: decision 27 answered deliberately, and ledger 0196's timeline landed 34 commits later"
date: 2026-09-13
branches: [claude/eager-curie-6s4xcz, claude/gracious-hopper-a46lec]
migrations: []
subsystems: ["IDEACAD", "Classroom"]
---

Ledger 0196 built the IdeaCAD history timeline, retired the in-memory undo
stack, and found that `0209`'s two RPCs had no caller in `src/` at all. It was
good work and it never landed: the branch sat 34 behind `integration` and 3
ahead, and it was the branch `integrate.yml` reported as conflicting on every
run. This bundle merges it forward and answers the question it satisfied by
luck.

Mr. Pina, 2026-09-13, decision 27: a shared editor gets FULL history and undo,
and every entry is ATTRIBUTED PER PERSON the way Google Docs does it -- anyone
with access sees ALL the history, and each entry clearly shows who made it.

## The accident, and why it was worth fixing rather than accepting

Ledger 0206 measured that `HistoryTimeline.svelte:178` already rendered
`entry.actor`, which agrees with decision 27. It does, in the sense that a row
carried a value naming a person. **What it rendered was a raw email address,**
because `actor` is one -- `0209` says so in its own header, where it is called
"AN EMAIL AND IS THE WIDEST COLUMN HERE".

That is the letter of "each entry clearly shows who made it" and none of its
point. A fifteen-year-old scanning eight rows for the one their partner
changed cannot read eight copies of `firstname.lastname@boscotech.net`, and the
address is wider than the pane it sits in at 375px, which is a phone.

## There is no name to look up, and that is not an oversight

Every identity in IdeaCAD is email-keyed: `ideacad_editors` grants by address,
`actor` stores an address, `SharePanel` asks for an address. There is no display
name anywhere in the subsystem to join to. Projecting a roster name would mean
putting `_notebook_email_for_user` inside reach of a client, which `0137`
deliberately closed -- a migration AND a disclosure decision, and this bundle
carries neither.

So the label is derived from the address, and every rule is about deriving it
**honestly**.

- **The reader's own rows say "You".** This is the whole legibility win, and it
  is what Google Docs does: in a two-author history the first question is which
  rows are mine.
- **Anybody else is their address's local part, printed VERBATIM.** Not
  title-cased. Turning `alejandro.pina` into "Alejandro Pina" invents a person's
  name formatting from a string that is not one, and it is wrong the first time
  it meets `jdoe2`. What is printed is a truthful projection of what is stored.
- **A non-person is never named as a classmate.** `0209` has exactly three
  producers: `current_user_email()`, the literal `system` (a definer path with
  no session), and the literal `migration:0209` (its own backfill). That backfill
  row deliberately does NOT claim a student created the part -- naming it at a
  student would be the fabricated record `0209` refused to write -- so both
  non-address values read `system`, in italic, which is the one word in that
  column that is not upright.
- **Two addresses sharing a local part both fall back to the full address.**
  This school issues `@boscotech.edu` to staff and `@boscotech.net` to students
  off the same name, so `a.pina@boscotech.edu` and `a.pina@boscotech.net` both
  shorten to `a.pina`. Rendered that way, two people appear under one name with
  nothing on screen saying so -- which is WORSE than the raw address, because it
  is wrong rather than merely unreadable.
- **The reader's own address is counted into that collision set**, even though
  the reader renders as "You". Otherwise a reader at `a.pina@boscotech.edu`
  sees a classmate at `a.pina@boscotech.net` rendered as `a.pina` -- their own
  shortened name, on somebody else's edits.

That last rule is why `timelineActors` is a pass over the WHOLE log rather than
a per-row function: the collision cannot be decided from one row.

## The ink ranks the names; the word carries them

A classmate's name steps up to `--text-1` and the reader's own "You" sits at
the meta row's `--text-2`. On a part you worked on alone -- which is most parts
-- every row is yours, and eight rows of emphasised "You" is eight rows of noise
that make the one row somebody else touched HARDER to find, which is the
opposite of what decision 27 is for.

**Colour is never the only signal here and could not be**: every row prints a
name either way, so a reader who cannot see the difference reads exactly the
same list.

## No migration, verified by reading rather than assumed

`0209` line 184 declares `actor text not null`; `ideacad_concept_history`
projects `h.actor` at line 551. Both were read. Nothing in this bundle is SQL.

## Both fixtures were emitting a shape the database cannot produce

This is the finding worth keeping.

The dev harness seeded `'you'` and `'A. Reyes'`; `tests/dom/ideacad-timeline-mount.test.ts`
seeded `'you'`. **Neither is a value anything can write.** `CLAUDE.md` calls
this a fixture the producer cannot emit, and names the cost exactly: a green
test on an impossible document is a claim of coverage over the case that is
broken.

Here it cost the whole defect. 0196's browser pass reported **60 measurements, 0
outside threshold** on this surface, and the surface was printing a raw email
address the entire time -- because the made-up actor values *already read like
names*. Nothing on screen looked wrong, because nothing on screen was the thing
that ships. Both fixtures seed addresses now, and the pure suite's cases are the
three shapes `0209` actually writes.

## What a rasterized reading found this time

Two things, and the interesting half is that both were NOT defects.

**"Materials / Spin direction clockwise to counter-clockwise"** looked wrong --
spin direction is a tree-level setting, not a material. `describeTarget` groups
`/rotation` under Materials by an explicit `joined === 'rotation'` term, and
0196's own entry says why: spin direction is drawn by `BladeEditor`'s 0208
materials panel, and the timeline names the panel whose control the student
turned. Correct, and reading the reasoning is what stopped it being "fixed".

**"Blade stock Carbon or unknown steel"** looked like a mangled fallback and is
the harness's own material name, from its fixture library.

Both are recorded because the next session will see them too.

`tools/browser-verify/_shot.mjs` is the rasterizer, and it exists because 0196
had to hand-roll one and so did this bundle. It reads the spec's OWN `path` and
`prepare`, so the picture cannot be of a state the checks never ran against.
**It cost two silent screenshots of the wrong state before that was true**: the
harness wraps a prepare step as `page.evaluate(`(${expr})()`)` because Playwright
evaluates a string as an EXPRESSION, so an arrow-function source handed over
bare becomes a function object that is never called. A second copy of that
workaround is precisely what `browser.mjs` warns about, and writing one produced
a screenshot of the FeatureManager that looked like a working run.

## What the checks could not see, and now can

The spec measured `.meta` once, labelled "who and when". With two inks on that
row, one reading measures one of them and says nothing about the other. Three
contrast checks now, one per ink, all held to the TEXT threshold because the
word is the signal and not a tint on one. The text check gained `@` as a
forbidden phrase -- the whole of "no raw address on screen" in one character,
safe as a blanket ban because no other word on this panel carries one -- and
`migration:0209`.

## What was measured

- **Full suite: 459 files / 8726 tests green**, against a branch-time baseline
  of **457 files / 8673** measured on `origin/integration` at `34a44f2d` in a
  clean worktree before any change. The +2 files are 0196's two test files,
  which were never on `integration`; of the +53 tests, 17 are this bundle's
  (11 pure namer cases and 6 rendering cases) and the rest are 0196's.
- **`svelte-check`: 0 errors, 37 warnings in 20 files**, 31
  `state_referenced_locally` / 5 `css_unused_selector` / 1
  `perf_avoid_nested_class` -- identical to the baseline re-derived on
  `origin/integration` at branch time. This bundle adds no warning.
  **The `CLAUDE.md` figure was correct this time and needed no correction**,
  which is the first reading in six not to move it.
- **Browser pass: 66 measurements across the timeline's 2 route/width runs, 0
  outside threshold** (60 before; the 6 are the 3 new contrast checks at 2
  widths). Contrast on the row ground `rgb(22,26,24)`: the reader's own rows
  **6.84:1**, a classmate's name **14.5:1**, the origin **6.84:1**. On the
  `.here` ground `rgb(16,19,18)`, measured separately by pressing a real row and
  letting it flush: **7.27:1** and **15.42:1**, at both widths.
- **The widest label the namer can produce fits.** A full address is the
  collision fallback, and a 37-character one measures **219.8px in a 341px row
  at 375** and 200.0px in 252px at 1440, with **0px document overflow** at both.
- **`--break` bites on all four presets**: overflow 4, invisible 20, tiny-taps
  8, low-contrast **26**. 0196 fixed these by adding `.ideacad` to two presets'
  selector lists and that fix survived the merge; low-contrast rising from
  0196's 20 to 26 is exactly the three new contrast checks at two widths, which
  is a positive control on the additions themselves. `--selftest`: 70 controls,
  36 negative, 34 positive, **0 instrument failures**.
- **Mutation proof, 6 mutants, all PERMISSIVE, 6 killed**, with a positive
  control on the clean tree first (0 failed | 59 passed) -- a "killed" verdict
  means nothing without one. Every verdict was read off vitest's `Tests N
  failed | M passed` SUMMARY LINE and never off its exit code, and a run whose
  summary could not be found would have been an instrument failure rather than a
  pass. Every restore was from an in-memory copy taken before the mutation and
  md5-checked afterwards, never `git checkout --`.
  The mutants: the collision rule off, the reader excluded from the collision
  set, non-person actors named as people, the raw address rendered again, the
  address in the accessible sentence, and the viewer never matched.

## What was NOT verified

- **Nothing was applied anywhere and this container cannot reach the production
  database.** There is no migration in this bundle. `DEPLOY_PROBE_URL` and
  `IDEA_MIGRATION_URL` are both unset and there is no `.env`.
- **No signed-in surface was driven.** The browser pass covers `/dev` routes
  only. The real chain -- the item route's `data.claims.email` into
  `ItemDetail`, `BladeEditor` and the timeline -- is asserted by type checking
  and by reading, not by a session.
- **Two editors on one shared document were not driven through the timeline**,
  which is the case decision 27 is ABOUT. The two-author rendering is proven on
  a two-author log in the harness and in `tests/dom/`, but no browser pass put
  two real clients on one part. That remains 0196's open item and is now also
  this one's.
- **Web fonts do not load under the harness** (the proxy blocks
  `fonts.googleapis.com`), so every contrast and tap-target figure is measured
  in the fallback stack, and `prefers-reduced-motion` is `no-preference`.

## What was deferred

- **A paged timeline**, unchanged from 0196: `readWholeHistory` holds the whole
  log in memory.
- **A name that is actually a name.** The label is derived from an address
  because nothing else is reachable. The fix, when it is wanted, is the same
  shape `CLAUDE.md` already names for the IdeaCAD materials hole: a roster
  projection inside a definer, not a policy and not a client-side join.
- **`migration:0209` and `system` read identically.** They mean slightly
  different things and a student needs neither distinction; the stored value is
  kept verbatim on the actor so a future surface can tell them apart without a
  second pass over the log.
