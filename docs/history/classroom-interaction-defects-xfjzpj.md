---
title: "The classroom typing collapse is reproduced, measured and left with a proven four-line patch it cannot apply; the jumping list, the clamped open-post title, the composer's second save control and the bulk bar's silence are fixed (`claude/classroom-interaction-defects-xfjzpj`, no migration)"
date: 2026-09-02
branches: [claude/classroom-interaction-defects-xfjzpj]
migrations: []
subsystems: ["Classroom", "Testing"]
---

Prompt 0012, six instructor reports on the classroom feed and item surfaces.
One of them is a real, reproducible defect; the rest are interaction quality.
Four are fixed here. Two live in files this bundle does not own, and this entry
carries the measurement and the patch for whoever does.

Files owned: the six `src/lib/classroom/` components named in the ledger,
`src/routes/dev/classroom-interaction/**`,
`tools/browser-verify/routes/classroom-interaction-*.mjs`, the generated counts
block, the ledger entry and this file. `classroom.css` was read-only throughout
(decision 09, the 24px instructor density contract). `git diff --stat` names
`ClassView.svelte`, `ContentComposer.svelte`, the new dev route, the two new
route specs, the counts block and `classroom-updates.json`; nothing else under
`src/` moved.

## The typing collapse: what it actually is

Reported as: "Occasionally, while starting to type, random modules or other
drop down menus will suddenly minimize and entirely throw the viewing to the
bottom of the page. Also it deselects the text box."

Three symptoms, one line of code. `Disclosure.svelte` reads its `collapseWhen`
prop LIVE:

    const open = $derived(disclosureOpen(chosen, collapseWhen));

and `SpecRenderer` derives BOTH of the signals on an assignment from the
responses being typed -- `complete` on the module body, `started` on the
instructions panel inside it. The collapsed region is hidden with
`display: none`, and `display: none` on an ancestor of the focused element
blurs it and removes the region's height from the document. So the panel shuts,
the caret is gone, and the page moves. They are not three bugs.

The hypothesis the prompt offered -- a keystroke re-creating the list nodes, so
component-local collapse state dies with them -- was WRONG, and worth recording
because it is the plausible one. Every collapse state on these surfaces already
outlives a re-render: `ClassroomFeed` takes `collapsed` as a prop with an
`onToggle` callback and holds nothing; `ClassView`'s `expanded` is a
`$state<Record<string, boolean>>` keyed by item id; the section layout persists
folded units in `profiles.preferences`; every `{#each}` on the path is keyed on
a stable id (`group.id`, `entry.key`, `item.id`). Nothing is destroyed. The
panels are told to close.

"Occasionally" is the tell that it is a state transition rather than a re-render:
it fires at the exact keystroke that takes a module from incomplete to complete,
which is once per module and never again.

### Measured, on the real components

`/dev/classroom-interaction?case=typing` mounts the real `ItemDetail` -- and
through it the real `AssignmentEngine`, `SpecRenderer` and `Disclosure` -- with
one module holding two constrained blocks, one of them already answered. So the
module sits at 1/2 and one character finishes it. At 1440x900, typing into the
second field with playwright's real `keyboard.type`:

| | before the keystrokes | after |
| --- | --- | --- |
| `module-body` `aria-expanded` | `true` | `false` |
| `document.activeElement` | `TEXTAREA#tf-tf2` | `BODY` |
| `window.scrollY` | 1024 | 1471 |
| `document.scrollHeight` | 2839 | 2371 |
| the field's own box | visible | `display: none` |

All five on one uninterrupted sequence. The 447px scroll move is the browser's,
not the app's: the document lost 468px from under the viewport.

### The two existing tests do not catch this. They pin it.

The prompt asked whether `tests/dom/classroom-module-collapse-mount.test.ts` or
`tests/dom/disclosure-instructions-collapse-mount.test.ts` would have caught it.
They would not, and the reason is sharper than "they do not cover it": both
assert the defect is correct.

- `classroom-module-collapse-mount.test.ts` -> "stays open through the halfway
  state and closes on the last field", which is precisely the moment the panel
  shuts over the field being typed into.
- `disclosure-instructions-collapse-mount.test.ts` -> a case named
  `POSITIVE CONTROL: the identical typing collapses a panel nobody chose`,
  asserting `aria-expanded` is `'false'` after an `input` event.

They are not wrong about the STANDARD they were written from.
`IDEA_INTERFACE_STANDARDS` 1 asks that reading be expanded the first time and
out of the way "on every visit after that" -- a statement about ARRIVAL. What
neither test can see is the difference between arriving collapsed and folding
under someone's hands, because happy-dom has no layout engine: nothing there
blurs on a hide and there is no scroll position to lose. A green suite is what
this defect has always had.

### The fix, proven and then removed

Four lines in `src/lib/Disclosure.svelte`: sample `collapseWhen` once per
`storageKey` instead of tracking it.

    let sampledKey: string | null = untrack(() => storageKey);
    let sampledCollapse = $state(untrack(() => collapseWhen));
    $effect(() => {
        const key = storageKey;
        if (key === sampledKey) return;
        sampledKey = key;
        sampledCollapse = untrack(() => collapseWhen);
    });
    const open = $derived(disclosureOpen(chosen, sampledCollapse));

Re-sampled on `storageKey` rather than on mount because a caller may swap
`scope` without remounting -- the same reason `override` is already keyed on it.

Applied to a scratch copy and measured on the identical sequence: `module-body`
stays `true`, focus stays `TEXTAREA#tf-tf2`, `scrollY` 1024 -> 1024 (delta 0),
the field stays visible. The arrival behaviour is unchanged in the same run --
the instructions panel and the item body still come up collapsed on an item
with work already in it, which is the standard's actual rule. The browser check
went from 4 measurements outside threshold to 0.

**It is not applied on this branch.** `Disclosure.svelte` is out of scope, and
it is a shared primitive -- the notebook, GAUNTLET, Foundry, the spec importer
and the classroom all mount it -- which is exactly the kind of file an ownership
boundary exists to protect from an unowned edit. Applying it also reddens 3
assertions across the two `tests/dom/` files above, which are equally not owned
here; those tests have to be rewritten in the same change, because the behaviour
they pin is the behaviour being removed.

`src/lib/Disclosure.svelte` was restored from a copy (never `git checkout --`)
and verified md5-identical at `54b3255530536d4ead84d03f2647820f`, and the
harness reports the defect again on the restored tree.

## The harness, and why it is red on purpose

`/dev/classroom-interaction` renders raw DOM facts only -- `document.activeElement`,
`window.scrollY`, the real `aria-expanded` attributes -- and decides nothing.
Every judgement is in the two route specs, against a baseline the spec itself
stashed, so the harness cannot satisfy an assertion by agreeing with itself.

`classroom-interaction-case-typing.mjs` is RED on the tree that ships it, and
that is the finding rather than a defect in it. `verify:browser` exits 0 with
findings by design and is deliberately outside CI, so it blocks no deploy. It
goes green on the four-line fix with nothing in it to edit.
`classroom-interaction-case-fresh.mjs` is its control and is green: nothing
answered, every panel arrives open. It exists because the cheapest wrong fix for
the typing collapse is to stop the signal reaching the panel at all, which would
pass the typing check and silently delete the standard's arrival rule.

Both required positive controls were run:

1. With the fix applied, the typing check goes green at both widths (0 of 34
   outside threshold, from 4). So the check is measuring the defect and not
   something incidental to the fixture.
2. With the fix applied and everything green, a deliberate `blur()` injected as
   an extra prepare step flips exactly one field -- `focus=kept` ->
   `focus=lost-to-body` -- and nothing else. The focus assertion reaches its
   oracle rather than being satisfied by there being nothing to check. The spec
   was restored from a copy and md5-verified.

### Two things the instrument taught, both found by the controls

**`height=` measured the wrong thing, and only control 1 said so.** The first
draft asserted the DOCUMENT's height was held. With the fix applied that
assertion still reddened: `SpecRenderer`'s answer fields auto-resize, so the
page legitimately loses 136px at 1440 while typing, against 468px with the
defect. A document-height assertion therefore fails on both trees and tells them
apart only by a magic number. It now measures the disclosure's own body, which
either has a box or does not.

**`scroll=` does not discriminate under synthetic input, and the spec says so
rather than dropping it.** Setting `.value` and dispatching `input` -- even one
character at a time -- does not make Chromium scroll a caret into view, so
`scrollY` reads `held` on both trees. Under real key events it is the
1024 -> 1471 in the table above. The assertion is kept as the thing actually
wanted, with `region=` (its cause) measured beside it as the discriminating half.

## The four fixed in scope

**The jumping list.** Opening a post is not a layout decision but lands as one:
`ClassSplit` gives the nav pane the whole measure while nothing is open and 26rem
once something is, and `.stream` is an `auto-fit` grid. Measured at 1440 on
`/dev/classroom-split` with twenty rows, the pane goes 1376px -> 416px and the
stream goes three 426px columns to one 366px column, so every row moves. The
columns are NOT the bug and are not removed -- a list handed the full measure and
rendering one narrow column is the defect one level in. What is wrong is that the
reflow moves the row the person just pointed at, so that row is put back:
`scrollIntoView({ block: 'nearest', behavior: 'instant' })`. Rightmost-column row
i-13 went from top 1380 in a 730px pane (out of view) to top 818 (in view); an
already-visible row leaves `.cr-nav` at `scrollTop` 0, unmoved, which is the
claim that this can only undo a jump and never create one.

Two drafts of it were wrong and both were caught by measuring rather than by
reading:

- The first returned an effect cleanup cancelling its own rAF and timeout. The
  effect re-runs while the pane is settling, the teardown cancels the scheduled
  call, and the re-run then hits the `id === lastKeptInView` guard and never
  reschedules. Measured doing nothing at all.
- The second let whichever of the rAF and the timeout fired first win. That is
  the animation frame, and split.css eases `grid-template-columns` over 180ms --
  so at rAF time the pane is still wide, the stream is still three columns and
  the row is still on screen, which is exactly when `block: 'nearest'` correctly
  declines to move anything. Both calls now run; `scrollIntoView` is idempotent,
  and under reduced motion the frame call is the one that does the work.

**The clamped title on an open post.** `.row-name` is `-webkit-line-clamp: 2`
with a `title` tooltip as its only escape, which IDEA_INTERFACE_STANDARDS 10
already rules out (not discoverable, and a phone cannot hover). Opening an item
narrows the row's own box from 217px to 157px, so the selected row is clamped at
exactly the moment it stopped being a summary and became the answer to "which one
am I reading". The selected row alone drops the clamp: an 89-character title now
renders in full at 157px (4 lines, 75px), while all 19 other rows keep
`line-clamp: 2`. The element stays a `-webkit-box`, so a short title renders
byte-identically to before. The item page's own `h1` was measured first and is
NOT truncated at either width -- `overflow: visible`, no clamp, full text -- so
the report is about the list row and not the hero.

**The composer's second save control.** The actions row is the last thing in a
~420-line form, after the body editor, dates, links, attachments, deck, spec,
rubric, check-in and class targets. There is now a sticky copy at the top. It is
ONE snippet rendered twice rather than a second row of buttons, so `submit(true)`
and `submit(false)` still have exactly one spelling each; the `SaveIndicator`
rides the top row too, because an acknowledgement 400 lines below the person who
pressed the button is no acknowledgement.

**The bulk bar's silence.** `busy` already greyed every control, which is a
refusal and not an acknowledgement: a manager publishing twelve items watched the
bar go flat and was told nothing until the whole batch answered. Publish, file
and delete now name what they are doing through the shared `Pending`. Deliberately
NOT covered: `loadExportStatuses` (best-effort instrumentation, and its chips are
their own arrival), `fetchPreview` (CLAUDE.md forbids a pending state there --
`LinkPreviewCard` renders a working link from the first frame), the composer's own
submit (it has `SaveIndicator`), and single-row pin/duplicate/file, which are one
round trip with the row itself as the acknowledgement.

## Out of scope, reported and unchanged

**The hide/show control.** It is `ClassroomShell.svelte`'s `nav-collapse-toggle`
plus a `:has()` rule in `classroom.css` -- neither owned, and `classroom.css` is
read-only here. It does exactly one thing: hide `.cr-nav` beside an open item, at
1024px and up, on the item page only. The label is not lying about the mechanism;
it is incomplete about the blast radius, because on the item page `.cr-nav` holds
the whole `ClassView` -- the class heading, the pane tools (New post, Units,
Notebook), the bulk bar and all the rows. "Hide other items" names the rows and
takes the controls with them, which is why it reads as hiding the page. It could
not be driven from any dev harness: `canCollapseNav` keys on
`locateClassroom(path).place === 'item'`, which no `/dev/` path satisfies, so
this is read from source rather than measured.

**Post organisation and sorting** were excluded by the prompt as a design
question.

## Claims in the prompt the tree contradicted

- The typing collapse was expected in the six owned components. It is in
  `Disclosure.svelte` and `SpecRenderer.svelte`, neither owned.
- The counts block's flaky rows were given as `/dev/notebook` @375 and
  `/dev/gauntlet-shell-countdown` @1440. Neither appears in the committed block
  or in a fresh full run. The four pre-existing findings are `/dev/pathways`
  `tap-target` at both widths and `horizontal-scroll` at 375 on `/dev/coins` and
  `/dev/coins-signedin-1`, and all four keep their identity across the
  regeneration.

## Verification

- `npx svelte-kit sync && npx svelte-check`: **0 errors, 37 warnings**, breakdown
  **31 `state_referenced_locally` / 5 `css_unused_selector` / 1
  `perf_avoid_nested_class`**, with the two `PUBLIC_SUPABASE_*` placeholders
  exported before the sync.
- `npm test`: **230 files, 4751 tests, all passing**, 218.1s.
- `npm run verify:browser`: 68 specs over 38 routes, 136 route/width runs, 1772
  measurements, 8 outside threshold, 308.8s. Four are pre-existing and unchanged;
  four are this bundle's deliberate typing check.
- `npm run verify:readme` rewrote only lines 31-59, the region between
  `<!-- counts:begin -->` and `<!-- counts:end -->`.

**A NUMBER IN CLAUDE.md THAT HAS DRIFTED, and it is not this bundle's file to
correct.** The Verification standard records that a checkout with no `.env`
reports **11 phantom errors across eight files**. Measured here, `npm run check`
on this tree reports **12 errors across nine files** -- nine
`PUBLIC_SUPABASE_URL` and three `PUBLIC_SUPABASE_ANON_KEY`. The warnings are
unaffected and the errors land only in files no change here touched, which is
the tell the rule itself gives for a phantom rather than a regression. Whoever
owns `CLAUDE.md` next should move that line to 12/9.

## Not verified

- **The real classroom, signed in.** No cloud session holds a Bosco Tech Google
  account, so nothing behind `/classroom/[sectionId]` was opened. Everything here
  was driven through `/dev/` harnesses mounting the real components.
- **The hide/show control's actual behaviour on screen** -- see above; read from
  source only.
- **The local Supabase stack.** This container has a `docker` CLI with no daemon
  and no WSL, so no stack was started and none was running. Nothing in this
  bundle needs one: there is no migration and no RPC change.
- **Real key input inside the browser harness.** The 1024 -> 1471 scroll figure
  comes from a direct playwright script, not from a route spec; the spec's own
  input is synthetic and says so.
- **`prefers-reduced-motion`.** The harness runs at `no-preference`, so the
  reduced-motion path through the B2 scroll correction (where the rAF call is the
  one that does the work) is reasoned from the code, not measured.

## Left undone

- The four-line `Disclosure.svelte` patch above, and the rewrite of the 3
  assertions in the two `tests/dom/` files that currently pin the defect.
- `ClassroomShell.svelte` / `classroom.css`: the hide/show control's label.
- No `tests/dom/classroom-interaction-*.test.ts` was added. The guarantees this
  bundle changed all fail visibly, and the one that would regress silently -- that
  an already-visible row is never scrolled -- is a layout claim happy-dom cannot
  make (`tests/dom/mount.ts`: `getBoundingClientRect()` answers all zeroes). It
  belongs in a browser spec on `/dev/classroom-split`, whose specs are not owned
  here.
