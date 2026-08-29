---
title: "A running app survives full screen: the claim SSR cannot express, the feedback contact field, and a Tiptap probe that came back green (`claude/dom-test-ssr-conversion-ftk6cj`, no migration)"
date: 2026-08-29
branches: [claude/dom-test-ssr-conversion-ftk6cj]
migrations: []
subsystems: ["Testing", "Foundry", "Feedback", "Classroom", "Notebook", "Toolchain"]
---

## A running app survives full screen: the claim SSR cannot express, the feedback contact field, and a Tiptap probe that came back green (`claude/dom-test-ssr-conversion-ftk6cj`, no migration)

The bundle before this one (`claude/dom-test-project-setup-bwcuyk`) converted four
SSR files whose own comments said they could not make the claim they existed to
make, and listed three more candidates. This is those three, plus a probe that
decides whether there is a fourth bundle after it.

The specification was that entry's reasoning, not a summary of it: keep every
SSR file, because its structural claims assert what a browser RECEIVES and that
is a different question from what the browser then does; delete an assertion
only when it is an explicit proxy for something now asserted directly; and name
every deletion beside its replacement.

### 1. Foundry: the claim that had no home anywhere

`AppStage`'s header states the constraint twice and `AppFrame`'s `fill` prop
repeats it: full screen adds a class to the stage while **the `<iframe>` is
never unmounted and its `src` is never rewritten**, so a running bundle keeps
its state, its timers and its audio. "Anything that swapped the frame would
restart every app anybody maximised."

**Nothing asserted it, and `tests/foundry-gallery.test.ts` structurally could
not.** This is not a claim about one render. It is a claim about the
RELATIONSHIP between two renders -- DOM identity across a state change -- and
`svelte/server`'s `render()` hands back a string with no node in it to be
identical to anything. So the file had no assertion to delete and no proxy to
replace; the claim simply had nowhere to live.

It is the worst shape of silent regression this repo names. A remount renders a
**pixel-identical** full-screen app. What is lost is a student's half-finished
game at the moment they asked for more room, and the person who notices is a
student mid-lesson who reads it as the app crashing.

`tests/dom/foundry-app-stage-mount.test.ts` (10 tests) mounts the real stage and
presses the real controls:

* **The headline.** Launch, capture the frame node, press Full screen: the stage
  carries `is-full` and `data-full="overlay"`, the button word flips, AND
  `expect(during).toBe(before)` on the node itself, with `src` unmoved. Then Exit
  and the same three again in reverse. `fill` reaching the frame is asserted as
  the inline height being DROPPED and `is-fill` appearing -- an attribute read,
  never a measurement.
* **The identity instrument's own positive control**, which matters more here
  than usual: `toBe` on a node passes if the component is right and also passes
  if the test never re-rendered anything. So one test stops the app and launches
  it again and asserts the node comes back **different** while the `src` string
  is the same -- proving the instrument can see a replacement, and proving why
  comparing `src` strings could not have substituted for comparing nodes.
* **The native path**, driven by installing a `requestFullscreen` on the stage --
  the same hook the component feature-detects with. `data-full` becomes `native`,
  the class is the same class, the node still survives.
* **Which Escape this viewer has**, both sentences, present only while full.
* **Stop app**, asserted as the element being REMOVED (`isConnected` false), not
  blanked and not hidden; leaving full screen on the way out so no empty overlay
  is left behind; and both controls still on screen while full, because an app
  can wedge in full screen too.
* **A change of subject** tearing the frame down and leaving full screen, driven
  by moving `versionId` on a live mount the way the gallery and the review queue
  actually do.

**Nothing was deleted from `tests/foundry-gallery.test.ts`.** A header note says
where the behavioural half went and why none of it came out of that file.

### 2. Feedback: five source strings replaced by the payload

`tests/feedback-coverage.test.ts` named its own proxy, in the test that owns the
rule: *"The box is closed until the trigger is pressed, so what is asserted here
is the SOURCE wiring plus the note both renders would carry."* The optional
contact field's whole contract was therefore a set of string searches over two
files, including `expect(box).toContain('...(askContact ? { contact } : {})')`.

`tests/dom/feedback-contact-field-mount.test.ts` (8 tests) presses the trigger,
opens the real box, types into the real controls and reads **the entry the
transport was actually handed**.

The half that matters is not the visible one. A stray field on a signed-in
report fails loudly. A `contact` key carrying an empty string looks like nothing
on screen, arrives at a write path whose entire design (0126) is that an account
and an address never sit on one row, and is discoverable only by reading the
payload. So the assertion is `'contact' in entry`, not a value comparison:
`{ contact: '' }` and no key at all are different rows and must be different
results.

**The five deletions, each beside its replacement:**

| deleted from `feedback-coverage.test.ts` | replaced by |
| --- | --- |
| `expect(site).toContain('askContact={anonymous}')` | the field appears for an anonymous reporter and not for a signed-in one, through the real `SiteFeedback` with the real prop |
| `expect(box).toContain('{#if askContact}')` | the same pair, read off the mounted box |
| `expect(box).toContain('...(askContact ? { contact } : {})')` | `'contact' in entry` on the object `submit` received, both directions |
| `expect(box).toContain('(optional)')` | the RENDERED label text of `#fb-contact` |
| `expect(box).toContain('Leave it empty and the report is still read.')` | the rendered note beside it |

What stays in the SSR test is the claim about SERVED markup -- both
configurations render, and each serves exactly one trigger -- with a second
`triggers({ anonymous: false })` added, because the surviving half should assert
both configurations rather than one. No test was removed; the node project's
test count is unchanged at 3364.

**A mutation caught this file over-claiming, and the test was strengthened
rather than the claim softened.** Reporting `writing` as `saved` -- a dispatch
presented as an acknowledgement, which is a rule `CLAUDE.md` states outright --
left all eight green, because a transport that resolves immediately never leaves
the box in the state where the two differ. The transport now optionally HOLDS
the write open, so there is a moment to look at: in flight, the entry has been
handed over, the button reads `SENDING`, the box does NOT thank anybody and the
person's words are still on screen; released, only then the acknowledgement and
the cleared field. The mutation reddens now.

### 3. Category suggestions: the file was right, and the gap was next to it

The instruction was to establish what
`tests/classroom-category-suggestions.test.ts` still uniquely covers and to
change nothing if the existing composer mount test covers it.

**It is not superseded, and it is unchanged.** Its six `courseCategorySuggestions`
tests are a pure function's contract -- ordering by use count, first-seen tie
break, the real raw spelling rather than a rewritten casing, null and
whitespace dropping -- which a mount cannot improve on and which
`classroom-composer-effect-mount.test.ts` touches only incidentally, through one
deduplicated fixture. Its three SSR tests are claims about SERVED markup: the
control is `type="text"`, gains no `required` or select-shaped constraint, and
carries no datalist before any suggestion has loaded. The last of those is
genuinely about the server's output, not a stand-in for a browser's.

**But asserting what it covers turned up something neither file covered.** The
existing mount test reads `datalist option` values, so it proves the options
EXIST. Nothing anywhere proved the input is WIRED to them -- the pairing of the
input's `list` with the datalist's `id`, both computed from `categoryListId`. A
mismatch renders a perfectly ordinary field beside a perfectly ordinary datalist
that nothing points at: no error, no empty state, and a teacher who never sees a
suggestion again. And it is mount-only, because the datalist does not exist in a
server render at all -- which is precisely what the SSR file asserts.

That is a NEW claim rather than a second version of an existing one, so it went
into the existing mount file (three tests now) rather than a new one, with
`composer-mount.ts` reporting the two raw attribute values rather than a boolean
so a failure says which half moved.

### 4. The Tiptap probe: green, and not migrated

The notebook `EditBaseline` dirty-signal surfaces were flagged as candidates with
the caveat that Tiptap under happy-dom was unprobed. Probed against the real
`NoteEditor.svelte`, three questions, three answers:

* **Does it mount?** Yes. No throw, the editor element renders and carries a real
  `pmViewDesc`.
* **Does it produce a document?** Yes. `onready` fires once with
  `{"type":"doc","content":[{"type":"paragraph"}]}`.
* **Does an edit fire the dirty signal?** Yes. A real `paste` `ClipboardEvent`
  carrying `text/html` reaches ProseMirror and `onchange` returns the edited
  document.

And the detail that decides whether those files are worth converting: **`onchange`
fires ONCE AT MOUNT, from the seeding transaction, before anybody has typed** --
which is exactly the defect `EditBaseline` exists to absorb, and it absorbs it
here. Seeded on the ready doc, `changed()` is `false` for that seeding
transaction and `true` after the paste. So the behaviour those files describe is
reproducible in this project.

**They were not migrated, deliberately** -- the instruction was to let the answer
decide whether they are a next bundle, and the answer is that they are. The
finding is recorded in `tests/dom/README.md` so the next session does not re-probe
it. The pane's keyboard limitation still applies and is written down with it:
drive an editor with a `paste` event, never with dispatched Enter/Tab keys.

### The environment fact that cost the most time here

**happy-dom navigates an `<iframe>` for real.** Every mount in the Foundry file
opened an actual network request to `apps.ideabosco.com`, and the teardown
aborted it, printing a page of `AsyncTaskManager` and `NetworkError` traces per
run. That is worth refusing on its own terms and not for tidiness: a suite that
reaches a production host is one whose result depends on that host being up.

The obvious setting is the wrong one. `disableIframePageLoading` does stop the
network, but happy-dom then reports every blocked navigation to the page console
-- **12 `NotSupportedError` traces** for the ten tests -- and its
`handleDisabledFileLoadingAsSuccess` setting is not read on the iframe path at
all, only by script and link elements (checked in the installed source). The
setting that works is a **fetch interceptor**,
`window.happyDOM.settings.fetch.interceptor`, which answers the frame from
memory: no socket, no console output, and the element behaves exactly as the
component expects. Nothing in this file is a claim about what a bundle serves --
every assertion is about the element's identity, attributes and connectedness,
all of which hold for a frame that loaded nothing.

`reactive-props.svelte.ts` is the other new instrument, and it is small: `mount(C,
{ props })` reads props off the object it is handed, so an ordinary object is a
one-shot and an effect keyed on a prop can never be made to re-run. Wrapping it
in `$state` gives the component the same reactive reads a real parent gives it,
which is the only way the change-of-subject teardown is reachable. It is a
`.svelte.ts` module because runes need one; `mount.ts` beside it stays plain
TypeScript so the four files already importing it do not move.

### Mutation proof

Fourteen mutations, each in the real component, each restored from a **copy taken
before the first one** and md5-checked. `git checkout --` was not used at any
point: it restores from HEAD, and against an uncommitted tree it silently
discards the session's own work.

| # | mutation | reddened |
| --- | --- | --- |
| 1 | full screen wraps the frame in `{#key full}` (the exact regression) | 2 of 10 stage-mount |
| 2 | `fill` never reaches the frame (`fill={false}`) | 1 of 10 |
| 3 | `stop()` leaves `running` true | 3 of 10 |
| 4 | `stop()` forgets `leaveFull()` | 1 of 10 |
| 5 | `enterFull` sets the class in the API's callback, not first | 5 of 10 |
| 6 | the change-of-subject effect drops `leaveFull()` | 1 of 10 |
| 7 | `contact` always on the entry (the empty-string row 0126 refuses) | 1 of 8 feedback-mount |
| 8 | the contact field is offered to everybody | 1 of 8 |
| 9 | "(optional)" drops out of the label | 1 of 8 |
| 10 | `SiteFeedback` stops threading `anonymous` down | 2 of 8 |
| 11 | the send gate stops reading the message | 1 of 8 |
| 12 | `writing` reported as `saved` (dispatch as acknowledgement) | **0 of 8, then 1 of 8** -- see above |
| 13 | the category input loses its `list` attribute | 1 of 3 composer-mount |
| 14 | the input's `list` and the datalist's `id` drift apart | 1 of 3 |

(13) and (14) each left the file's two pre-existing tests green, which is the
gap they were written to close.

`git diff --stat src/` is empty, and every touched component's md5 matches the
copy taken before the first mutation.

### Measurements

| | before | after |
| --- | --- | --- |
| full suite | 156 files, 3395 tests, 113.33s | 158 files, 3414 tests, 113.70s |
| node project | 150 files, 3364 tests | 150 files, 3364 tests |
| DOM project | 6 files, 31 tests, 4.15s (1.08s test time) | 8 files, 50 tests, 4.33s (1.58s test time) |
| `svelte-check` | 0 errors / 37 warnings (31/5/1) | 0 errors / 37 warnings (31/5/1) |

`verify:browser` was run as a control: **40 route/width runs, 306 measurements,
4 outside threshold, exit 0**. The four are two `tap-target [harness controls]`
readings (the dev harness's own controls, 26.2px) and two `presence` readings on
the notebook free-entry title/folder fields. **They are properties of the base
commit, not of this bundle** -- `git diff --stat src/` is empty and
`tools/browser-verify/` was not touched, so nothing in this diff is reachable by
that harness. It was NOT run before the work as a paired measurement, so this is
an absolute reading rather than a before/after.

**The suite is not meaningfully slower.** 113.33s to 113.70s, i.e. inside
run-to-run noise, for 19 more tests. The node project's test count is IDENTICAL,
which is the tell that this bundle deleted assertions and not tests.

Per test the DOM project runs at ~32ms against the node project's ~1.5ms, which
is the same ~22x the previous bundle measured and the figure that should decide
where a future file goes: worth paying for a behavioural claim, not worth paying
for one a `render()` string already settles.

### Not verified

* Nothing was run against the live Supabase project. There is no migration here
  and no RPC was called.
* No signed-in surface was driven. These mounts hold no session; `anonymous` is
  a prop a test set, not a real absence of a JWT.
* **No geometry, contrast or tap-target claim is made anywhere in this bundle.**
  happy-dom has no layout engine, so those read zero and pass vacuously; that
  full screen actually FILLS a viewport, and that the report trigger clears
  44px, remain `verify:browser`'s claims. Each new file says so in its header.
* The native full-screen path is driven by installing a `requestFullscreen` on
  the stage element, because happy-dom has none (measured: `undefined`). What is
  exercised is the component's own feature detection and its two branches, NOT a
  real browser promoting an element to the top layer.
* `prefers-reduced-motion` is `no-preference` in both instruments, so that path
  is not exercised.
* The Tiptap probe was run and then DELETED; the notebook dirty-signal files are
  unchanged and uncovered. What is recorded is the probe's result, not a test.

### What this bundle deliberately did not do

* **It did not touch `src/`.** Every mutation was reverted from a pre-mutation
  copy and md5-checked.
* **It did not touch `tests/classroom-category-suggestions.test.ts`.** The
  analysis above is the reason, and it is here rather than in that file because
  the file needed no change at all.
* **It did not migrate the notebook `EditBaseline` files.** They are a next
  bundle, and the probe is why that is now a statement rather than a guess.
* **It asserted nothing about `/dev/foundry-gallery`.** The harness route is
  still where a person looks at this.
