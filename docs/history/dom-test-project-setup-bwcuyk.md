---
title: "Four SSR files stopped standing in for a browser: the toggle, the write boundary, the drag and the collapse are driven now (`claude/dom-test-project-setup-bwcuyk`, no migration)"
date: 2026-08-29
branches: [claude/dom-test-project-setup-bwcuyk]
migrations: []
subsystems: ["Testing", "Classroom", "Disclosure", "Classroom files", "Toolchain"]
---

The DOM vitest project landed one bundle earlier (`claude/vitest-dom-ssr-projects-5xp8ks`,
on `integration`). It arrived with one test in it. This bundle spends it.

Four test files in `tests/` had, between them, five claims they could not
reach and said so in their own comments. Three of the four named the same
missing thing, in almost the same words:

* `disclosure-instructions-collapse.test.ts` -- "There is no DOM or
  event-dispatch harness in this repo (`environment: 'node'`, `svelte/server`'s
  `render()` only)", so pressing the trigger "belongs in the harness
  (/dev/classroom), not here."
* `classroom-manager-spec-visibility.test.ts` -- "There is no input to dispatch
  TO, which is the strongest available claim short of an actual DOM."
* `classroom-upload-picker-parity.test.ts` -- "this repo has no
  DOM/event-dispatch harness, so an SSR structural assertion is the strongest
  claim available without one".
* `src/lib/file-drop.ts` says it too, in the header that explains why its
  stateful half was split into plain functions.

Those sentences are the specification, and they are now out of date. Each is
corrected in place, pointing at the file that does the thing it said could not
be done.

### The one that was not a test-quality point

**The per-viewer disclosure key had no assertion anywhere in the repo.**

`disclosureKey` had a unit test proving two viewer strings produce two strings.
Nothing proved `Disclosure.svelte` ever puts a viewer into the key it writes
under, nothing proved the write and the read agree, and nothing proved the
answer survives a reload. The viewer segment exists because these are shared
shop workstations: two students sign into the same machine, open the same
assignment, and one of them collapsing the instructions must not hide them from
the other. A regression to a single shared key -- the tidier shape, and the one
a future session would write -- passed every assertion in the repo.

`tests/dom/disclosure-instructions-collapse-mount.test.ts` now asserts it as the
rule it is: viewer A collapses the panel, viewer B opens the same item on the
same store and gets the default, B's own choice goes to a second key, the store
holds exactly two keys, and A's answer is still A's after a remount. The key
strings are spelled out in the test rather than imported from `$lib/disclosure`,
because an expected value taken from the code under test cannot fail.

Measured: dropping the viewer segment from `disclosureKey` reddens three of that
file's seven tests, including that one.

### What each file gained

**1. `tests/dom/disclosure-instructions-collapse-mount.test.ts` (7 tests).**
The press itself (`aria-expanded` moving because a person clicked, and the word
on the control moving with it, `Hide` <-> `Show`); that only a press writes, and
what it writes (`open`/`closed` under the real key); the manual override as a
TRANSITION rather than as two fixtures -- one mounted panel, opened by hand,
staying open while `collapseWhen` flips underneath it as the student types --
with a positive control proving the identical keystroke collapses a panel nobody
chose; the per-viewer rule above; per-item separation for one person across two
assignments; and the signed-out `anon` key.

**2. `tests/dom/classroom-manager-spec-visibility-mount.test.ts` (4 tests).**
The boundary rather than its shape: the manager's render mounted, every control
enumerated from the live tree, real `input`/`change` fired at them with a write
transport injected that a real manager page never passes.

One measurement changed the shape of that file and is worth writing down because
it is counter-intuitive. **`dispatchEvent` at a control carrying `disabled`
still runs its listener** -- firing `change` at the manager render's two
disabled checklist boxes called SpecRenderer's `toggleItem` twice. That is not a
component defect and not a happy-dom quirk: `disabled` bars a control from USER
interaction, it does not unregister listeners, and an explicit `dispatchEvent`
is not user interaction. A browser will never deliver a person's click there.

So the claim is stated in the two halves that are actually true. (a) The
manager's render exposes NO ENABLED CONTROL -- 0 of 2, against 4 of 4 enabled on
the student's render of the identical spec. (b) ABSENCE IS THE MECHANISM:
mounted the way `ItemDetail` mounts it, with no `onvalue`/`onupload`/
`ondeletefile`/`oncaption` at all, the whole dispatch sweep including the
disabled controls writes nothing, because there is nothing to call. A file
asserting only (a) would pass over a render whose controls were enabled but
inert; one asserting only (b) would pass over a render full of live inputs. The
SSR file's source assertions are therefore the load-bearing half rather than a
supplement, and its header now says so.

**3. `tests/dom/classroom-upload-picker-parity-mount.test.ts` (9 tests).**
A real drag sequence (`dragenter` -> the overlay and the `is-drop-active`
outline appear and `preventDefault` is set; `dragleave` -> both go), which is
the half nobody had: only the ABSENCE before a drag was asserted anywhere, which
a component that never showed the overlay at all satisfies perfectly. A drag
carrying no files leaving the surface dark. A real drop and a real image paste
reaching the same `stage` the picker's `onchange` reaches, and a plain-text
paste passing through with no `preventDefault`.

And the one that was unasserted end to end in either direction: **Retry after a
partial failure retries exactly the remainder.** Three files dropped, the middle
one refused; all three are attempted (the failure did not cancel the third,
which is the engine-side defect this component was written to end); only the
failure stays staged, with the transport's own message rendered verbatim; Retry
sends `['b.txt']` and not `['a.txt','b.txt','c.txt']`. It is asserted as the
ARGUMENT LISTS the transport was called with, so "retried the remainder" and
"retried everything again" are different results rather than the same green
tick, which a count-only assertion could not tell apart.

**4. `tests/dom/classroom-module-collapse-mount.test.ts` (6 tests).**
Collapsing on BECOMING complete: the module is finished a field at a time on one
mounted panel, and the chip and `aria-expanded` are read at each step --
`0/2 done` open, `1/2 done` still open (the halfway case a collapse keyed on
`started` would bury), `2/2 done` closed. Re-opening on its own when the work is
taken back out, which is what "derived, never stored" buys and a stamped flag
would not. The manual override from a real click, in both directions, surviving
a remount. And the module panel and the instructions panel remembering
separately.

### The one deletion, and why only one

The instruction for this bundle was to keep each SSR file: its structural claims
assert what a browser RECEIVES, which is a different question from what a
browser then does, and a `<textarea>` in served markup is a regression before a
single effect has run. An SSR assertion comes out only when it is an explicit
proxy for something now asserted directly.

**Deleted: `classroom-module-collapse.test.ts`'s "lets a person's own toggle
override the completion signal in both directions".** It installed a fake
`localStorage` on `globalThis`, wrote `open`/`closed` under the panel's key with
`writeDisclosure`, and re-rendered -- SIMULATING the value a press would have
produced. It was a pure stand-in for a client, not a claim about a server
render: on a real server there IS no `localStorage`, `readDisclosure` returns
null, and the branch it exercised cannot execute. The only configuration it ever
described was a browser's. **Replaced by** the mount file's "holds a finished
module open while it is being finished" and "holds an unfinished module closed,
and the answer survives a remount", which press the real trigger, write the real
store and read the answer back after a remount. Its now-dead `fakeStore()`
helper and the `disclosureKey`/`writeDisclosure` imports went with it, and a
note where it sat says where it went.

**Nothing else was deleted**, and the near-misses are worth naming so the next
session does not think they were missed:

* The three `renders no drop-active class or overlay before any drag happens`
  tests are half of a claim whose other half is now asserted directly -- but the
  half that remains is about the SERVED markup, and they cover three separate
  surfaces (FileUploadPanel, DeckPanel, ContentComposer) that one mounted panel
  says nothing about.
* `classroom-manager-spec-visibility.test.ts`'s structural absences are framed
  by its own header as the proxy, but each is independently a true claim about
  what is served, and the mount file cannot see a server's output.
* `disclosure-instructions-collapse.test.ts`'s `readDisclosure`/`writeDisclosure`
  tests also use a fake store, but they call the module directly -- they are the
  module's own contract, not a simulated render.

Where the replacement could not be named, the proxy stayed.

### Mutation proof

Ten mutations, each in the real component, each restored byte-identically and
md5-checked against a pristine copy taken before the first one.
`git diff --stat src/` is empty.

| # | mutation | reddened |
| --- | --- | --- |
| 1 | `disclosureKey` drops the viewer segment (one shared key) | 3 of 7 disclosure-mount |
| 2 | `disclosureOpen` ignores the stored choice (`return !collapseWhen`) | 4 of 7 |
| 3 | `Disclosure.toggle()` records nothing | 5 of 7 |
| 4 | `canEdit` drops `!readonly` | 3 of 4 manager-mount |
| 5 | module `collapseWhen={complete}` -> `{started}` | 2 of 6 module-mount |
| 6 | failed files not kept (`entries = []` after a batch) | 5 of 9 upload-mount |
| 7 | the batch stops after the first file | 6 of 9 |
| 8 | `retryOne` drops the entry even when refused | 1 of 9 |
| 9 | `dragEnter` never calls `setActive(true)` | 1 of 9 |
| 10 | `isFileDrag` ignores the `'Files'` type | 1 of 9 |
| 11 | a plain-text paste is `preventDefault`ed | 1 of 9 |

(6), (7) and (8) were re-run after a fixture correction, below, and reddened
identically.

`svelte-check` caught the one thing that would have made the upload file green
and wrong: the refusal fixture used `gate: 'size'`, which is not a member of
`UploadGate`, and its success shape omitted the required `storageKey`. That is
the repo's own "a fixture must be something its real producer can emit" rule,
enforced by the type system because `tests/**` is inside `svelte-check`'s
include. Corrected to `too_large` and a real `storageKey`.

### Measurements

| | before | after |
| --- | --- | --- |
| full suite | 151 files, 3349 tests, 116.34s | 155 files, 3374 tests, 114.80s |
| node project | 149 files, 3344 tests | 149 files, 3343 tests |
| DOM project | 2 files, 5 tests, 3.37s | 6 files, 31 tests, 4.15s |
| `svelte-check` | 0 errors / 37 warnings (31/5/1) | 0 errors / 37 warnings (31/5/1) |
| `verify:browser` | 34 runs, 258 measurements, 2 outside threshold | identical |

The node project lost one test: the deletion above. **The suite is not
meaningfully slower** -- the wall clock moved 116.34s -> 114.80s, i.e. inside
run-to-run noise, for 25 more tests.

Per test, though, a mount is not free, and the apples-to-apples figure is worth
having because it is the one that should decide where a future file goes. Same
four components, same fixtures:

| | tests | test time | per test |
| --- | --- | --- | --- |
| the four SSR files (node) | 46 | 71ms | ~1.5ms |
| the four mount files (dom) | 26 | 871ms | ~33ms |

About 22x. Cheap in absolute terms, and worth paying for a behavioural claim;
not worth paying for one a `render()` string already settles. That is now in
`tests/dom/README.md`.

`verify:browser` shares no configuration with vitest, so it was re-run as a
control: 34 route/width runs, 258 measurements, **2 outside threshold**, exit 0,
before and after, with an identical distribution of check outcomes. The only
textual differences between the two reports are the harness's own
retry-until-effect attempt counts and one `net::ERR_ABORTED` on a
`__data.json` invalidation request landing on a different route -- both
run-to-run, neither a measurement.

### Two environment facts written into `CLAUDE.md`

Both were measured this week and neither has a local detector, which is what
makes them rules rather than history.

**happy-dom has no layout engine.** `getBoundingClientRect()` answers
`{x:0, y:0, width:0, height:0}`, `offsetWidth` is `0`, and
`getComputedStyle(el).color` is the EMPTY STRING. So a geometry, contrast or
tap-target claim written in `tests/dom/` reads zero and PASSES VACUOUSLY --
arriving as a green tick, which is the shape of instrument defect that hid in
the browser harness for weeks. Those claims belong to `verify:browser` and
nowhere else. The trap inside the trap is that some computed reads ARE real:
`getComputedStyle(el).display` answers `"block"` correctly, because the cascade
runs even though layout does not, so one computed-style read working is not
evidence the next one will. Nothing in this bundle asserts a box, a colour or a
44px target, and every new file says so in its header.

**`npm install` rewrites `package-lock.json` to match `package.json`'s
indentation.** npm reads the lockfile's formatting off the manifest beside it and
writes the whole file back in that style, silently, exit 0. This repo is exactly
the divergent case, measured: `package.json` is TAB-indented,
`package-lock.json` is TWO-SPACE indented, and the lockfile is 4,649 lines -- so
a one-package add here produces a 4,649-line diff, which is the prettier problem
one file over with the same cost. `npm ci` never does it (it installs FROM the
lockfile and does not write it), which is why a fresh checkout is always `npm
ci`. When a dependency genuinely has to be added: read
`git diff --stat package-lock.json` before committing, and either restore the
lockfile and add the entry so the two styles already agree, or commit the
reformat separately -- never let it ride along inside another change.

### What this bundle deliberately did not do

* **It did not touch `src/`.** Two comments in shipped source are now out of
  date -- `src/lib/file-drop.ts`'s header ("this repo has no DOM/event-dispatch
  harness ... a test cannot construct a real `<div>` and fire a real
  `DragEvent` at it") and the reasoning it hangs on that. The split it argues
  for is still right and `createDropController` is still the cheaper place for
  the drag-depth arithmetic, but the sentence is false and should be corrected
  by whoever next has that file open. `tests/dom/drag-events.ts` records the
  correction on the test side.
* **It did not migrate the ~20 hand-rolled disclosures** to `Disclosure.svelte`.
  Still migration candidates, still not a second sanctioned pattern.
* **It asserted nothing about `/dev/classroom`.** The harness route is still the
  place a person looks at this; nothing here replaces that.

### Not verified

* Nothing was run against the live Supabase project. There is no migration in
  this bundle and no RPC was called.
* No signed-in surface was driven. `verify:browser` covers `/dev` routes only,
  and these mount tests hold no session -- `page.data.claims.sub` is a string
  put there by the test, not a real JWT.
* `prefers-reduced-motion` is `no-preference` in both instruments, so that path
  is not exercised anywhere in this bundle.
* The `disabled`-control measurement in (2) above was made in happy-dom. That an
  explicit `dispatchEvent` runs a disabled control's listener is specified
  behaviour rather than an implementation detail, but it was NOT re-measured in
  a real Chromium here. What matters for the assertion either way is that a
  browser never delivers a USER's event there, and the file rests on the absent
  transport rather than on `disabled`.
