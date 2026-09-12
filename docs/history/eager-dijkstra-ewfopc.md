---
title: "IdeaCAD sharing and part checkout: the surfaces for 0205 and 0207, and the two defects only rasterizing caught (`claude/eager-dijkstra-ewfopc`, ledger 0190)"
date: 2026-09-12
branches: [claude/eager-dijkstra-ewfopc]
migrations: []
subsystems: ["IdeaCAD", "Testing"]
---

`0205` (document sharing) and `0207` (assembly parts and checkout) were both
applied to production and landed on `main`, and **nothing in the repository
rendered either of them.** Both lanes shipped deliberately with no `.svelte`
file -- 0179's Owns line says "NO UI IN THIS BUNDLE" and 0183's says the same --
so between them there were fourteen RPCs, two pure client modules and zero ways
for a student to use any of it. This bundle is the surface.

No migration. `Claims: none.`

## What was audited before anything was built

`BladeEditor` mounts the feature tree, the PropertyManager, the materials panel,
the viewport, the readouts rail and the concept strip. It mounts **no sharing
control and no parts list**, and `transports.ts` carried the five `0205` sharing
functions with no caller. `assembly.ts` carried all nine of `0207`'s and was not
even wired into `IdeacadTransports` -- its own header says why (that file
belonged to another lane in flight), and closing that was named there as one
line for whoever owned `transports.ts` next.

## Mr. Pina's model, and where each half of it landed

*Like Google Docs. Private by default. The owner shares with named classmates as
view-only or editor. He and Mr. Cosso see and edit everything without asking.*
That is `0205` and `sharing.ts` already; what was missing was the control.
`SharePanel.svelte` is it: an address box, a two-option role picker, the list of
who has it, and a two-step Remove.

*An IDEA-Blade is multiple parts and one person holds a part at a time.
Switching who holds what must be extremely easy and intuitive. The assembly
owner reassigns teammates to parts live.* `PartsPanel.svelte` gives each part
**one primary control whose word is the state** -- Take this part when it is
free, Release when it is yours, and no button at all when somebody else has it.
One tap, one row, no mode. The owner gets a picker per row listing the people
the document is shared with plus themselves, with Nobody clearing the part;
taking a part back is reassigning it to yourself rather than a second verb.

## The controller, and the one decision that is not Mr. Pina's

`checkout.ts` is new: the object between `assembly.ts`'s types and the panel. It
holds the assembly, keeps the caller's hold alive, and turns every structured
refusal into a sentence.

**The staleness window is ours, not his** -- `0207`'s own header says so -- and
the client's obligation is to be honest about it. The prompt's rule is that a
student whose hold lapsed must SEE that rather than discover it on a refused
write, and the ordinary route to that truth is a heartbeat coming back `lost` or
`lapsed`. **That route needs the network, which is exactly what is missing in
the case it matters most.** So the controller runs a second, independent clock
against the `holdWindowSeconds` the payload carried and goes terminal on its own
once the window has passed with no successful beat. Two routes to one state, and
the one that does not need a server is the one that covers the disconnection.

The window itself is never written down in client code. `_ideacad_hold_window()`
is its one statement, `ideacad_assembly` returns it, and every predicate takes it
as a parameter -- including the warning threshold, which is a FRACTION
(`IDEACAD_HOLD_WARN_FRACTION`, 25%) rather than a number of seconds, so
shortening the window in the database still warns proportionally instead of
warning from the first second.

**The terminal state is `store.ts`'s `conflict`, reused rather than reinvented.**
Losing a part is the same event one layer up from a stale save: the work on
screen is still the student's, it is no longer saveable here, and continuing to
write would overwrite whoever holds it now. So the heartbeat stops, no write is
attempted, the local copy is untouched, and the only way out is a deliberate
re-claim. A refresh alone does not clear it -- the part being free again is not
the student having decided to take it back.

**A failed beat is NOT a lost hold**, and that distinction is load-bearing:
nothing was decided, the hold may well still be ours, and only the local clock
may end it. A network failure gets its own notice (`IDEACAD_CHECKOUT_OFFLINE`)
separate from every refusal, because reporting an undecided round trip as a
refusal is a lie about what happened.

The refusal words are a `Record` over `IdeacadHoldReason`, so a reason added in
`assembly.ts` without a sentence here is a type error rather than a blank line on
a student's screen -- the `RANK_STATES` shape. Every sentence says what the next
press is; `held` names the holder, because the person is three feet away and a
name is something a fifteen-year-old can act on where "somebody else" is not.

## A viewer is never shown a control that would be refused

`canWrite` false makes every row's action `none`, so there is no button in the
markup at all -- absent, not disabled -- and `canShare` is false for everyone but
the owner, an instructor included, which is `0205`'s rule. `IDEACAD_CHECKOUT_VIEW_ONLY`
is the sentence that says why, because a list with nothing pressable and no
explanation reads as broken rather than as read-only.

Measured both directions on one fixture: at `role=viewer`, 3 part rows, 0 Take,
0 Release, 0 reassign picker, 0 share form; at `role=owner` on the identical
three parts, 3 Take and 3 pickers and 1 share form. Zero alone is a selector that
might simply be wrong.

## Two defects that only rasterizing caught, and a third the numbers missed

Every browser check passed on the first run. Then the pages were rendered at 375
and 1440 and looked at, which is what the prompt asks for and what ledger 0186's
experience says is not optional.

**1. A select sized by its longest option rather than by its field.** The
viewer-or-editor picker came out **103px inside a 176px field**, with 80px of
dead gap before the Share button, at BOTH widths. The cause is a percentage
width inside an implicit `auto` grid track: the track's size depends on the item,
so the browser falls back to the item's intrinsic width, which for a `<select>`
is its widest option text ("View only"). `grid-template-columns: minmax(0, 1fr)`
makes the track definite and the percentage resolves; measured 103 -> 176 at both
widths. **The reassign picker had the same bug and escaped only by luck** -- its
options are email addresses, which are wider than its 13rem box -- so it is fixed
too, and the harness now asserts BOTH pickers fill their field. This is 0186's
clipped-select defect in a different costume, and no content check can see it.

**2. An email holder line wrapping to two lines beside a floating marker.** At
375 the holder line is an address, which wrapped inside a 230px column while "In
use" floated on the right beside a 55px block. Fixed with a **container query**
rather than a media query -- CLAUDE.md's rule, because this panel is mounted
inside somebody else's pane and the viewport says nothing about its width -- and
the threshold was measured in both directions before being chosen: the panel is
343px at a 375px viewport and 416px at 1440, so 24rem fires on one and not the
other. A breakpoint a container never reaches is dead code nothing reports.

**3. The terminal notice's mark beside the middle line.** At 375 the sentence
wraps to three lines and `align-items: center` put the "!" beside line two, where
it reads as an interruption rather than a marker. `flex-start`, plus a
`min-width: 0` on the sentence so the mark does not get pushed onto a line of its
own at all.

## And one the harness caught about itself

`state=expiring` originally seeded an old heartbeat and nothing else. The chip
read **"Your part for 10 min 00 s"**: the harness mounts the SHIPPING controller,
whose heartbeat landed against the in-memory transport and renewed the hold,
correctly. A live client keeps its own hold alive, so the only shape in which a
hold runs down is one whose beats are NOT landing -- so the fixture now throws
from `beatPart`, which is the real case the warning exists for. The route then
measures "Your part for 39 s", marked expiring, still held, not terminal: the
controller's own clock, ticking with every server answer failing, which is the
whole mechanism and could not be proved anywhere else.

## What was measured

- **`svelte-check`: 0 errors, 37 warnings in 20 files**, re-derived on
  `origin/integration` at branch time with `.env` written before the sync, and
  identical after the change. The breakdown held at 31
  `state_referenced_locally`, 5 `css_unused_selector`, 1 `perf_avoid_nested_class`.
  One transient regression was found and fixed on the way: the harness declares
  `$state`, so it is in runes mode, and a plain `let role` reassigned from the
  query string and read in the template earned `non_reactive_update` -- 38 in 21.
  Reading the query once into a `const` returns it. `/dev/ideacad` gets away with
  the reassigning form only because it declares no rune at all.
- **The full suite**, and the three new files: 13 sharing-panel, 19
  checkout-panel, 22 controller.
- **`npm run verify:browser -- --route ideacad-team`: 8 route/width runs, 158
  measurements, 0 outside threshold.** Four states at 375 and 1440. No new CHECK
  KIND was added, so no `--selftest` or `--break` preset was owed; every claim
  rides an existing check whose negative control already exists.
- **Mutation proof, 12 mutants, all caught, every file restored byte-identical**
  (md5 checked at both ends, restored from an in-memory copy and never with
  `git checkout --`).

## The mutation proof found three real gaps before it found none

Three mutants survived the first run, and each was a genuine hole rather than a
bad mutant:

- **A lapsed hold still naming its holder** was aimed at the panel suite when the
  rule lives in `partRows`; it now runs against both files, and a mount-level
  assertion for the lapsed row was added (it must read Free and offer Take,
  because `ideacad_claim_part` takes over a hold outside the window).
- **A stale read tearing down a live hold** survived because the fixture kept the
  caller as the holder. The case that separates `holdLostAgainst` from a bare "is
  it still mine" is a poll answering from BEFORE the claim -- somebody else
  holding it at a revision BEHIND ours -- and that fixture was added.
- **The heartbeat surviving a loss** is DEFENCE IN DEPTH and neither layer was
  removed on the strength of one of them surviving alone. `lose()` stops the
  beat, `runBeat` returns early on a null hold, and `lose()` nulls the hold;
  opening any one reddens nothing, correctly. Opening all three reddens the
  beat-count assertion (4 beats before, 9 after), which is the proof that the
  test would catch a beat that genuinely continued.

## What is NOT verified, stated rather than left to be discovered

- **Nothing was run against the live Supabase project.** The local `.env` is the
  placeholder project; no RPC in `0205` or `0207` was called for real from this
  container. Every claim here is about the client against fixtures whose shapes
  were read off the migration files.
- **No signed-in surface was driven.** `/dev/ideacad-team` needs no session by
  construction; the real classroom item page was not opened, because that needs a
  Bosco Tech Google account.
- **Production was unreachable from this container**: `curl https://ideabosco.com/`
  answered `curl: (56) CONNECT tunnel failed, response 403` and `000`, and so did
  `apps.ideabosco.com`. The same proxy allows `raw.githubusercontent.com` and
  `api.github.com` freely -- all three opening fetches succeeded -- so this is
  host-specific refusal and not a container with no network. Ledger 0188 recorded
  the identical refusal the day before.
- **`prefers-reduced-motion` is `no-preference` in the harness**, so that path is
  not exercised. Nothing in either panel animates, so there is nothing for it to
  gate; that is an argument, not a measurement.
- **Text is measured in the fallback stack.** The harness blocks every
  non-loopback request, so `fonts.googleapis.com` never answers and Rajdhani and
  Share Tech Mono are not the faces the contrast figures were taken against.

## What was deliberately left undone

**Neither panel is mounted on the real classroom item page.** `ItemDetail.svelte`
is ledger 0178's file and the item page's IdeaCAD region belongs to it and to
0171; this bundle owns the surfaces, not the landing. What is left for whoever
takes that on is genuinely one decision -- where the two panels sit relative to
the editor -- and the wiring is already there: `IdeacadTransports.assembly` is
populated by `createIdeacadTransports`, `probeIdeacadAssembly` and
`withoutIdeacadAssembly` are the ladder onto a pre-`0207` deployment, and the
sharing transports have had their probe since 0179.

**A teacher still cannot EDIT a shared document**, which `sharing.ts`'s
`CAPABILITIES` table already records as a gap rather than a rule: decision 24
says Mr. Pina and Mr. Cosso see and edit everything, `0201` gave them read only
and `0205` deliberately did not change it. `manager` therefore renders with no
write control on either panel, which is what the database actually does today.
When teacher edit ships, that table is the line that moves.

**`/dev/ideacad` carries no `+page.server.ts` dev guard**, which is fine -- the
whole `/dev` tree is stubbed at build time by the rule
`tests/dev-routes-excluded.test.ts` enforces, and that sweep is generalized
rather than enumerated so it picked up `/dev/ideacad-team` with no change. Noted
because a reader comparing it against `/dev/gauntlet-rank-state`, which does
carry one, would otherwise read the absence as a defect.
