---
title: The gallery opens on most played, and the play figures reach the page a student lands on
date: 2026-09-12
branches: ["claude/awesome-keller-pj6hkc"]
migrations: []
subsystems: ["foundry"]
---

Mr. Pina used the Foundry on 2026-09-12, after the mosaic landed. He liked the
mosaic and said so. Two things were wrong with it, and both are the same kind of
defect: a decision he had already made, recorded in a document, with nothing
holding it to the code.

## One: the gallery still opened on Recent

`docs/decisions/entries/04-gallery-default-most-played.md` was answered MOST
PLAYED FIRST on 2026-09-12 -- against the default this assistant had proposed,
which was to keep Recent. Ledger 0173 recorded the answer the same day, and the
entry's own Build line names the line to change: `FoundryGallery.svelte` line
127, `$state<FoundryGallerySort>('recent')`. No lane changed it. The gallery
went on opening on Recent for the rest of the day and he found it by opening the
page.

The fix is one word. What is worth writing down is that the fix is NOT one word:
the value is now `FOUNDRY_GALLERY_DEFAULT_SORT` in `telemetry.ts`, imported by
the component, because the failure here was not a wrong string -- it was a
decision and a literal being two statements of one thing with nothing able to
compare them. A named export gives the answer one home, and
`tests/dom/foundry-sort.test.ts` asserts the component TAKES the constant rather
than spelling `'played'` a second time at the mount site, which would have been
the same defect in a test.

**The default and the button order are separate values and a test pins that they
can disagree.** `recent` is still the first control, because the row reads from
the plainest ordering to the narrowest window; a reader who assumed "the default
is whichever is first" would reintroduce this the next time somebody reordered
the array for layout reasons.

### The tiebreak, which the prompt asked to be checked rather than assumed

`sortGallery` sorts by `counts[id].plays` descending and has **no second term in
its comparator**. Stability comes from `Array.prototype.sort`, which has been
required to be stable since ES2019, so equal counts keep `foundry_list_apps`'s
own order (`updated_at desc, created_at desc`). That is correct, and decision 04
depends on it in as many words: "a gallery where nothing has been played yet is
every app tied at zero and renders in exactly the order Recent shows."

Two things follow.

**The property moved from incidental to load-bearing.** Under the old default a
tie was only ever seen by somebody who pressed a popularity tab. Under this one,
a gallery where nothing has been played IS every app tied at zero, so the tie
order is the first thing every student sees, and a comparator that shuffled
equals would reorder the whole page between two loads.

**A three-element fixture is not an instrument for stability.** Engines have
historically used insertion sort under a length threshold (V8's was 10) and the
general algorithm only above it, so a small fixture can be stable by accident on
an unstable implementation. The test ties **sixty** apps, well past any such
threshold, in both play windows, and the ids are deliberately not in the
fixture's own order so a comparator falling back to sorting by id is visible.

**No index term was added.** It would be a second statement of an ordering the
runtime already guarantees. What the tie needed was a test, not a comparator
term. The comment in `sortGallery` claiming "the index fallback is a statement of
intent rather than a workaround" described a fallback that is not in the code and
never was -- a sentence a reader could only resolve by concluding the tiebreak
lived somewhere they could not see. It is corrected.

## Two: the public figures were reachable only through the admin controls

`0204` (decision 07, answered FULLY PUBLIC in two layers) opened `players`,
`seconds_played` and `last_played_at`, and added `foundry_my_play_stats(uuid)`, a
caller-scoped read with no identity parameter. The only surfaces holding a
`playStats` transport were `/foundry/mine` and `/foundry/review`. **The detail
page a student lands on after tapping a card had neither**, so Mr. Pina could
read an app's numbers through the review console and nowhere else -- the exact
inverse of what "public" was answered to mean.

Both layers are on that page now. The public totals reuse `FoundryPlayStats`; the
viewer's own row is a second, separately optional transport on the same
component, so `/foundry/mine` and `/foundry/review` -- which pass only `load` --
render precisely what they rendered before, which is asserted rather than
assumed.

### Where it is mounted, and why not inside `FoundryDetail`

In `FoundryGallery`'s own `.fdy-gal-detail` wrapper, below `FoundryDetail`, which
is the arrangement `staffHref` already takes and for the same reason:
`FoundryDetail` is the ONE render path the gallery and the review queue share and
has no staff branch in it. A block added inside it would appear a second time in
the review console, where `FoundryInspector` is already mounting this component
beside it.

Below "How this was built", because that is the end of what the student wrote and
these are what happened to it afterwards.

### The rules the second layer carries

- **A viewer who has never played sees the totals and no personal row.**
  `hasOwnPlaytime` is the one statement of it, keyed on `plays` and **not** on
  `seconds_played`: a session that started and ended inside the same second is a
  real play with a duration of zero, and keying on the duration would tell a
  student they had never opened something they had. A mutant doing exactly that
  reddens one test.
- **The gate on the whole block is `load`, so the personal transport alone
  renders nothing.** The personal row has no heading that would be true of it on
  its own and no total to be read against. Pinned by a test rather than left to
  be discovered.
- **The n=1 case is accepted and nothing suppresses it.** Mr. Pina was asked
  precisely whether totals that identify a single player are acceptable and said
  they are. No threshold, no floor, no rounding, and decision 07 is not reopened.
  A test renders `1 / 1 person / 44s` unrounded, so a later "improvement" has
  something to break.
- **`formatPlayStamp` is now the one timestamp formatter.** It was a private
  `stamp()` inside `FoundryPlayStats.svelte` while one surface showed one date;
  the personal layer shows two more.
- **Both transports degrade to null on anything**, including the `PGRST202` a
  deployment without 0204 answers -- migrations here go on by hand, one file at a
  time, so that is a real state.

## What was measured

**`svelte-check`: 0 errors, 37 warnings in 20 files** (31 `state_referenced_locally`,
5 `css_unused_selector`, 1 `perf_avoid_nested_class`), on the working tree --
**identical to the branch point**, re-derived in a clean `git worktree` at
`origin/integration` `b0a8101d` rather than on the tree under test.

**`CLAUDE.md`'s stated baseline says 38 in 21 and is stale by one.** The drift is
again entirely `state_referenced_locally`, 32 down to 31, and again downward. That
is the FIFTH time that line has been found wrong and the second downward. It was
NOT corrected here: `CLAUDE.md` is outside this lane's Owns, and ledger 0177
(`claude/busy-newton-trto6y`, `pushed`, unmerged) carries a pending edit to that
exact paragraph, so an edit from here would be a guaranteed conflict on a file
this lane does not own. Reported instead, as ledgers 0175 and 0176 did.

**Full suite** and **one `verify:browser` pass scoped to `--route foundry`**: 20
route/width runs, **394 measurements, 0 outside threshold**, 63.5s. One
`verify:readme -- --route foundry`, 10 specs, 64.6s; the store now holds 201
specs, 402 runs, 7130 measurements, 0 outside threshold.

Measured on the new spec, both widths: the block heading and both notes at
**7.26:1**, the figure labels at **6.99:1**, the figures themselves at **15.4:1**,
0px horizontal overflow at 375 and 1440, and the two figure grids at **2 columns
at 375 and 4 at 1440**.

**The 375 column count is a case of the expectation being wrong rather than the
page.** The first draft of that check expected one column at 375 and reddened.
The track is `minmax(min(9rem, 100%), 1fr)` -- 144px -- and the detail pane at
375 holds two of them with the gap. Two short figures side by side on a phone is
what that rule exists to produce; the expectation moved, not the stylesheet.

### Fourteen mutants, all reddening, restored from copies

Eleven against `tests/dom/` and three against the browser specs. Every restore is
from a `cp` taken by the script and verified by md5; nothing used
`git checkout --`, which is a discard-to-HEAD and has silently eaten five
sessions' uncommitted work inside scripts shaped exactly like this one.

**One of the first eight reddened nothing, and that was the finding.** Deleting
both props from `src/routes/foundry/+page.svelte` -- which is the defect this
bundle exists to fix -- left every test green, because every assertion mounted
`FoundryGallery` directly and nothing drove the route. So
`tests/dom/foundry-detail-stats.test.ts` now mounts the REAL
`src/routes/foundry/+page.svelte` with a `supabase` whose `rpc` records what it
was called with, and four route mutants redden: dropping both props, dropping
only the personal one, naming the wrong RPC, and sending a player id alongside
the app id.

## Two instrument findings, both caused by the default moving

**A browser check had been passing vacuously and started telling the truth.**
`/dev/foundry-mosaic` focuses a card and asserted the name plate is revealed. It
passed at both widths -- because while `Most played` was the state that spec
measured, every plate carried a count and was exempt from the hover rule already,
so the predicate held before the focus. The harness said so in as many words:
`the predicate ALREADY HELD before the step ran -- it does not discriminate`.
Pressing `Recent` removed the exemption and the honest answer came back: opacity
0 at 1440.

**The component is right and the harness cannot reach it.** The reveal is
`:focus-visible`, which is correct -- a mouse click must not pop the plate, only a
keyboard arrival should -- and Chromium does not match `:focus-visible` for a
programmatic `element.focus()`. A prepare step is `click`, `waitFor` or
`evaluate`; none can produce a trusted keypress, and a `KeyboardEvent` built in
page script is untrusted. **So the rendered keyboard reveal is NOT VERIFIED by
this harness, and saying so is the result.** What replaced the vacuum: the step
now reports that focus landed, that `:focus` matched, that `:focus-visible` did
not (with the reason), and the plate's real opacity -- 1 at 375 where the plate is
permanent, 0 at 1440 where it is hover-hidden; and a new `orderResult` sweeps the
real stylesheets for the reveal rules, finding `hover reveal` and
`focus-visible reveal`, with the hover one as the positive control. The walk tests
the declaration first and recurses only on `r.cssRules?.length`, because
`CSSStyleRule` has a `cssRules` property under CSS Nesting and an empty
`CSSRuleList` is truthy -- the ordinary shape comes back with zero matches and
reads exactly like a clean result. Dropping the `:focus-visible` selector reddens
it.

**Two specs now establish their own sort state instead of inheriting a default.**
`foundry-mosaic` presses `Recent` (ten chips before, none after -- a real
discriminator) and `foundry-gallery` presses `Recent` then `Most played`, so both
clicks move the page rather than one landing on a control that is already pressed.
A spec whose measured state depends on which order happens to be the default is
one that goes quietly wrong the next time the default moves, which is the defect
this bundle was written to fix one level up.

## What is NOT verified

- **The live Supabase project.** The local `.env` is the placeholder ref
  (`example-ref`), and `IDEA_MIGRATION_URL`, `DEPLOY_PROBE_URL` and
  `SUPABASE_SERVICE_ROLE_KEY` are all unset. No RPC here was called against
  production, and `0204` being applied there is taken from the prompt.
- **`0204` is not on `integration` or `main`.** The migration file and every
  mention of `foundry_my_play_stats` live on `claude/busy-newton-trto6y` (ledger
  0177, `pushed`, unmerged); on `integration` the name appears only as prose in
  two documents. So no `tests/db/` coverage of either function was possible from
  this branch -- the chain here stops at 0203 -- and none was written. What IS
  proved is the client contract: which RPC is named, with which keys, and what
  each answer renders. The 0177 edits to `telemetry.ts`, `transports.ts` and
  `FoundryPlayStats.svelte` are comment-only and well away from the lines touched
  here, checked before editing.
- **A signed-in session.** Every browser measurement is `/dev` routes against
  fixtures; `/foundry` itself needs a Bosco Tech Google session no automated run
  holds.
- **Web fonts.** The harness blocks every non-loopback request, so all text above
  is measured in the fallback stack, and `prefers-reduced-motion` is
  `no-preference`, so that path is not exercised.

## Outside the stated Owns, named rather than hidden

- `src/lib/foundry/FoundryPlayStats.svelte` -- the optional second layer. The
  alternative was rendering the personal row inside `FoundryGallery`, which would
  have meant a second `stamp()` (a formatter, which is exactly what this
  repository says quietly stops matching), a second coverage note or none, and a
  presentational block in the component that owns the gallery's arrangement.
- `src/lib/foundry/transports.ts` -- `FoundryMyPlayStatsTransport`, three lines
  beside its twin. Putting it in `telemetry.ts` instead would have been a third
  place to look for a transport type.
- `src/lib/foundry/FoundryCard.svelte` -- one sentence that called `Recent` "the
  default and the state this gallery is normally looked at in", made false by
  this change. The rule it describes is untouched.
- `tests/dom/foundry-card-mosaic.test.ts` -- one assertion **generalised, not
  deleted**. It read "under Recent NO card shows a count", mounted with nothing
  pressed, and so asserted the count rule and the default together; it now presses
  each order and says the same thing about the count rule under any default.
- `src/routes/dev/foundry-gallery/+page.svelte` -- the harness gets both stats
  transports and a control that turns the personal one off, so the deployment
  without 0204 is a state a drive can produce. An absence nobody can produce is an
  absence nobody has checked.
- `classroom-updates.json` -- an entry, per the standing directive. Eight Foundry
  entries are already in that log, so this surface counts. The JSON was
  round-tripped and byte-compared BEFORE inserting, because a naive re-serialise
  un-escaped a `’` in an unrelated entry on the first attempt; the committed
  diff is 8 insertions and 0 deletions.
