---
title: "The typing collapse: `collapseWhen` becomes an arrival condition, latched per panel, so nothing but a person's own press folds a panel they are inside (`claude/typing-collapse-fix-4iq5qg`, no migration)"
date: 2026-09-03
branches: [claude/typing-collapse-fix-4iq5qg]
migrations: []
subsystems: ["Classroom", "Components and UI", "Notebook", "Testing"]
---

Prompt 0012 built the harness that proves this defect, proved it catches it, and left
the defect deliberately because it did not own `Disclosure.svelte`. This bundle is the
fix and nothing else: the oracle was read-only here, and the two browser specs went
from red to green with nothing in them edited.

The instructor report, verbatim: "while starting to type, random modules or drop down
menus suddenly minimize and entirely throw the viewing to the bottom of the page, and
it deselects the text box." All three symptoms are one line. `disclosureOpen(stored,
collapseWhen)` returned `stored ?? !collapseWhen` with `collapseWhen` read LIVE, and
`SpecRenderer` derives both of an assignment's signals from the responses being typed
(`complete` on the module body, `started` on the instructions). The disclosure's region
is hidden with `display: none`, so the moment a signal flips, the browser blurs whatever
inside it held focus and the document loses that region's height in the same frame.

### What was measured before anything changed

`npm run verify:browser -- --route classroom-interaction`, on `5d79b6f`, both widths:

| | before | after |
| --- | --- | --- |
| `module=` | `false` | `true` |
| `focus=` | `lost-to-body` | `kept` |
| `scroll=` | `held` | `held` |
| `region=` | `removed-332px-from-the-document` | `kept` |
| `field=` | `hidden` | `visible` |

Plus `presence [the answer field being typed into]`, which read `present 1, visible 0`
with a `0.0x0.0` box and now reads `present 1, visible 1`. Four measurements outside
threshold across the two widths, and zero after. `scroll=` is the one that does not
discriminate from here, exactly as the spec's own header says it does not: synthetic
`input` events do not make Chromium scroll a caret into view, and `region=` is that
symptom's cause measured in its place.

`classroom-interaction-case-fresh` was green before and is green after, at both widths.

### The design decision, which is the whole bundle

`collapseWhen` is LATCHED per panel, and the latch falls and never rises.

`disclosureLatch(prev, key, collapseWhen)` in `$lib/disclosure` is the rule, pure and
assertable without a browser like everything else in that module: an unsampled latch or
one minted under a different key re-samples; a latch already holding `false` ignores a
rise; a latch holding `true` honours a fall. `Disclosure.svelte` keeps it in `$state`
keyed to `storageKey`, exactly as `override` already is, so a caller that swaps `scope`
without remounting (a different item, a different check-in) falls back to the new
panel's own history rather than carrying the last one's. The keying is not a precaution:
`override` is keyed for that reason already and a second piece of per-panel state with
weaker discipline would have been the thing that disagreed with it.

**Falling and not rising, rather than sampling once.** The oracle's own header proposes
"sample `collapseWhen` per `storageKey` instead of tracking it", and a sample-once fix
passes both browser cases. It also silently kills a real caller: `SpecImporter` starts
its JSON panel collapsed and flips `collapseWhen` to false when a clipboard copy is
REFUSED, which is the one moment the reading is what the person came for. Sampled once,
that panel never opens and nothing anywhere reports it. So exactly one direction is
allowed, and it is the one that takes nothing away from anybody: closing an open panel
is the reported defect, opening a closed one is not. Once fallen it stays fallen, so a
flickering signal cannot fold the panel back up on the way past.

**No seed in the `$state` initializer, and that is not a style choice.** Reading
`storageKey` or `collapseWhen` there is a `state_referenced_locally` warning apiece --
measured, two more than this tree's 37 -- and the derived's fallback makes a seed
unnecessary: an unsampled latch and a latch from another panel are the same answer, so
the live signal IS the first frame. That is also what makes `svelte/server` correct with
no effects run at all, and what keeps a `scope` swap from showing one frame of the
previous panel's arrival state.

The effect follows CLAUDE.md's rule for the shape: `storageKey` and `collapseWhen` are
read TRACKED at the top and only the latch's own read-and-write is `untrack`ed, so an
effect that writes what it reads cannot re-trigger itself.
`tests/classroom-composer-effect-reactivity.test.ts` passes over it (19 tests).

**No call site was changed.** The fix is in the component, so it covers every
`collapseWhen` caller at once: `ItemDetail`'s `started`, `SpecRenderer`'s `complete` and
`started`, and -- reported rather than edited, since the notebook is out of this
bundle's ownership -- `NotebookView`'s `composerStarted`, which is
`notebookComposerHasWork({staged, title, noteDraft})` and therefore flips on the first
character a student types into a check-in. The defect existed there too and is fixed by
the same change. `SpecImporter`'s `!copyRefused` and `NotebookEntryCard`'s and one dev
route's constant `true` are unaffected. What did change at the call sites is the
COMMENTS: three of them stated `collapseWhen` as a live instruction to close, which is
now wrong, and CLAUDE.md does not allow a rule to stand written two ways.

### The standard, read again

IDEA_INTERFACE_STANDARDS 1 says reading material "does not sit between a person and
their work on every return visit" and panels "collapse once the person has started
working". The second clause was implemented as a live signal; the first clause says what
it is about, which is ARRIVAL -- what somebody is HANDED. A live reading of an arrival
condition is what folded a panel over a caret. Nothing about the arrival behaviour
moved: a student coming back to started work is still handed a collapsed panel, which is
what `classroom-interaction-case-fresh` and ten assertions in the vitest suite hold.

### Two assertions pinned the defect, not three

The prompt expected three across the two `tests/dom/` files. Measured, exactly two moved:

* `disclosure-instructions-collapse-mount.test.ts`, "POSITIVE CONTROL: the identical
  typing collapses a panel nobody chose" -- which named the defect in its own title.
* `classroom-module-collapse-mount.test.ts`, "stays open through the halfway state and
  closes on the last field" -- the closing half.

The third candidate, "re-opens on its own when the work is taken back out", stays GREEN,
and it is green because of the falls-and-never-rises choice above. Under a sample-once
fix it would have been the third, and it is the same behaviour `SpecImporter` needs.

**Two more assertions were rewritten because the fix made them VACUOUS**, which is a
different failure and worth naming separately: "keeps one panel open while the student
starts work underneath it" and "holds a finished module open while it is being
finished" both proved a stored choice beat a live signal. Nothing closes an open panel
now, so both would pass with an empty store. Under this rule the stored choice does its
work on ARRIVAL, so both were moved there: a panel that arrives collapsed, opened by
hand, is still open on the next mount. Each is paired with the arrival it is overriding,
so neither can pass without the store.

Added: an arrival positive control ("the identical value ARRIVES collapsed") in the
instructions file, and four pure `disclosureLatch` cases in
`tests/disclosure-instructions-collapse.test.ts`.

### Controls

**Positive control.** The pre-fix `Disclosure.svelte` and `disclosure.ts` were copied
back over the tree (`cp` from a copy taken before the edit, never `git checkout --`,
which discards uncommitted work to HEAD). The typing case reddened on all four
measurements at both widths, identical values to the baseline table above. The six
rewritten or added assertions reddened with it: the two `tests/dom/` ones on
`expected 'false' to be 'true'`, and the four latch cases on the function not existing.
Restored from the saved copies and md5-checked identical
(`6b71dd7c8c10ff6960fb2ccbde8ddcbc`, `089caa397f5e1e432924fb52d85c5374`).

**Second control, and it is a FINDING ABOUT THE ORACLE.**
`classroom-interaction-case-fresh` does NOT redden when `collapseWhen` is ignored
outright (`const collapsed = $derived(false)`). Both browser cases came back with 0
outside threshold. The reason is the fixture rather than the assertions: `?case=fresh`
answers nothing, so every `collapseWhen` on that page is already false at arrival, and
"all three panels are open" cannot tell "honours a false signal" from "ignores the
signal". The file's header states the guard it intends and the fixture cannot supply it.

The behaviour IS guarded, by the vitest suite: the same mutation reddens ten assertions
across four files, including the arrival control this bundle added. And the browser
could guard it too with no fixture change, on the spec that already loads the right
state -- measured on `?case=typing` at 1440 through a scripted Chromium:

| arrival on `?case=typing` | `module-body` | `module-instructions` | `item-body-disclosure` |
| --- | --- | --- | --- |
| with this fix | `true` | `false` | `false` |
| `collapseWhen` ignored | `true` | `true` | `true` |

Two of those three would discriminate. Adding them is a change to
`classroom-interaction-case-typing.mjs` or a third case file, which this bundle does not
own and did not touch.

### Verification

* `npm run verify:browser -- --route classroom-interaction`: 4 route/width runs, 34
  measurements, **0 outside threshold**, both widths. Was 4 outside.
* `npm test`: **242 files, 5122 tests, all passing** (`main` was 242 / 5117; the five
  are the four latch cases and one added arrival control).
* `npm run check`: **0 errors, 37 warnings**, 20 files, breakdown 31
  `state_referenced_locally` / 5 `css_unused_selector` / 1 `perf_avoid_nested_class` --
  the baseline, unmoved. Re-derived after `svelte-kit sync` with the two
  `PUBLIC_SUPABASE_*` placeholders exported, per the fresh-checkout rule.
* `tests/derived-numbers.test.ts`: green, 7 tests. It checks the STATIC counts against a
  live derivation from `routes.mjs` plus the block's internal consistency, and says in
  its own header that a block "honest but stale in its measured half passes here on
  purpose". No spec and no `src/routes/dev/` directory was added, so nothing static
  moved and the block was NOT regenerated.

### Not verified, and one thing left standing

* **No signed-in surface was driven.** The harness covers `/dev` routes only; the real
  classroom needs a Bosco Tech Google session no cloud session holds. The confirmation
  that the reported defect is gone in front of students is Mr. Pina's, on a real
  assignment, starting from a panel he has never toggled.
* **No local Supabase stack.** This container has no Docker and no WSL; nothing on ports
  54321/54322. No migration was written or permitted, and this is client state.
* `prefers-reduced-motion` is `no-preference` in the harness and web fonts are blocked,
  so text was measured in the fallback stack. Neither bears on this change.
* **`classroom-updates.json` IS OWED AN ENTRY AND DID NOT GET ONE HERE.** Panels no
  longer folding mid-keystroke is a change to what a class sees, which CLAUDE.md's
  standing directive says always earns a dated student-readable entry. That file is
  outside this bundle's stated ownership, and it is a single JSON array every lane
  appends to -- the shared write point the history split exists to avoid -- so it was
  reported rather than edited. The entry, ready to paste:
  `{ "date": "2026-09-03", "title": "Instructions and modules stay put while you type",
  "body": "Panels no longer close themselves while you are working in them. Before, a
  module or an instructions panel could fold away in the middle of a sentence, jump the
  page and take your cursor with it. They still open expanded the first time and arrive
  tidied away once you have started, and Show and Hide still work exactly as before.",
  "tags": ["classroom", "fix"] }`
* **`tools/browser-verify/README.md`'s generated counts block is now stale in its
  measured half and was deliberately left alone** -- it is outside this bundle's
  ownership. Its four `/dev/classroom-interaction?case=typing` rows are fixed, so a
  regeneration would take `Measurements outside threshold` from 8 to 4, leaving the two
  `/dev/pathways` `tap-target` rows and the two `horizontal-scroll` rows on `/dev/coins`
  and `/dev/coins-signedin-1`. A session that owns that file should run
  `npm run verify:readme`.
