---
title: Porting idea100-blade-01 against the HTML-assignment contract, and the eleven places the contract broke
date: 2026-09-10
branches: [claude/html-assignment-manifest-contract-8xazmp]
migrations: []
subsystems: [classroom, html-assignment, foundry-adjacent]
---

Ledger 0128, the fourth of four lanes building the HTML assignment effort against
one normative contract. The other three build modules; this one ports a real
document and reports whether the contract survives it. **It does, for text. It
does not, for images, for tables, or for the document's own typography**, and
those three findings are the deliverable.

## What was built

`src/routes/dev/html-assignment/fixtures/idea100-blade-01.ported.html` is a copy
of the live IDEA100 assignment with a `schemaVersion: 3` manifest authored into
its head and its persistence layer replaced by the bridge. **The original is
untouched** and the test asserts it still carries `saveToStorage` and
`downloadHTML` and still contains no `idea:change`, so a later bundle cannot
quietly edit the file students are working in and call it a port.

`src/routes/dev/html-assignment/fixtures/+page.svelte` is the harness: a real
`sandbox="allow-scripts"` iframe over a `blob:` URL, answered by a STUB bridge
listener that implements nothing and logs every message verbatim. The blob URL
is the load-bearing choice. A document served from a route of ours would sit on
the dev origin and prove nothing; a blob document inside that sandbox lands in an
opaque origin, which is where `localStorage` throws and where the fonts fail.
The harness also applies the contract's CSP as a `<meta http-equiv>`, minus
`frame-ancestors`, which a meta policy cannot carry and which is therefore left
out rather than written down in a form that silently does nothing.

## The port, and it was mechanical

Thirty replacements, each asserted to match exactly once before it applied, so a
drifted anchor is a refusal rather than a silent no-op. Deleted: `saveToStorage`,
`loadFromStorage`, `collectData`, `downloadHTML`, the 30-second autosave
interval, the `__IB_DATA__` boot block and the whole `openedAsCopy` read-only-copy
mechanism, which existed only to stop one browser's storage eating another
student's file and has nothing left to protect. Deleted with them: the Download
with Data and Save Progress controls, the two submission-checklist rows naming
the download, and module 04's storage warning. `loadData` survives as the
`idea:state` receiver. Every widget, counter, demo and print rule is untouched,
and the test pins nine of them by name.

**`window.parent.postMessage(msg, '*')` is correct in the frame and is not a
missing check.** The document sits in an opaque origin and has no way to name its
parent's origin; the validation that matters is the parent's, on `event.origin`,
on every message it receives. Nothing in the ported document ever sends a
`block_id` -- it sends `field`, and the test sweeps the executable source for
both spellings of the other thing.

## What was measured, in the container's Chromium (141.0.7390.37)

**The opaque origin is real.** From inside the frame: `window.origin` is
`"null"`; `localStorage`, `document.cookie` and `window.parent.document` each
throw `SecurityError`.

**Eighteen frame-to-parent messages, all conforming.** One `idea:ready`, eight
`idea:change`, eight `idea:height`, one `idea:image`, checked against the
contract's shapes key by key and key-count by key-count. A negative control -- an
`idea:change` carrying `value: 12` -- correctly fails the same predicate, so the
pass is not vacuous.

**Read-only is structural, both directions.** Editable render: 44 writable
fields, 1 drop zone, 1 add-row control, 3 danger controls. Under
`readOnly: true`: 0, 0, 0, 0 -- and a REAL input event dispatched at
`blade-name` produced **0** bridge messages.

**`window.print()` is dead and says nothing.** Chromium logs `Ignored call to
'print()'. The document is sandboxed, and the 'allow-modals' keyword is not set.`
and `print()` returns without throwing. The Print / Export PDF control is
therefore silently inert.

**The document loses all three of its typefaces**, measured by rendered width
rather than by `document.fonts.check`. Against an unknown-family baseline of
714.56px, Rajdhani, Orbitron and Share Tech Mono each measure 714.56px, while an
installed family (monospace) measures 838.06px -- so the instrument can tell a
loaded family apart and none of the three is loaded. `document.fonts.check('48px
Rajdhani')` claims **true** with **0** `@font-face` rules in the document, which
is the vacuous reading: with the stylesheet refused there is no rule to be
pending, so `check()` answers true for a font that does not exist. The
discriminator for instrument-versus-policy is the one `CLAUDE.md` prescribes: a
CSP refusal names its directive, and with the harness CSP switched off the
refusal disappears while the container's own network block remains.

## The rubric levels this bundle authored

Every rubric in this document is flat -- a criterion and a point value, sixteen
of them, not just module 05's three. The prompt named module 05 because it is the
hardest, but the authoring job was all nineteen criteria (`identity` has five)
and sixty-six levels. They were written top-down from the document's own
criterion text, which is the only authority available: the existing sentence
becomes the top level, and each lower level is defined by what is missing from
the one above, per `IDEA_RUBRIC_STANDARDS` 1.2. Four levels where the criterion
has room for a real middle distinction; three where a fourth would be invented.

**A 1-point criterion cannot be leveled without half points, and module 05 has
one.** `criterionIssues` requires strictly decreasing points, top equal to the
maximum and bottom equal to 0, and `IDEA_RUBRIC_STANDARDS` 1.2 forbids two
levels outright ("a two-level criterion is a checklist item"). On a 1-point
criterion those two rules leave exactly one shape: `1 / 0.5 / 0`. That is what
`manufacturing.justification` carries. It is legal and it is the first half point
in the system, which is a decision somebody should make deliberately rather than
discover in a grading console.

## The contract findings, in the order they cost something

1. **`img-src data: blob:` with `style-src 'unsafe-inline'` costs the document
   its entire visual identity.** The `@import url('https://fonts.googleapis.com/...')`
   is refused by name. `style-src` needs the Google Fonts host and there is no
   `font-src` at all, so the font files would fall to `default-src 'none'` even
   if the sheet loaded. Measured above. This is the same shape as the Foundry
   `/_platform/fonts.css` problem in a new place, and the fix is the same kind of
   thing: serve the faces from an origin the policy names, with
   `access-control-allow-origin: *`, because a `@font-face` request from an opaque
   origin is CORS-mode by specification.

2. **`idea:image` is add-only, so module 04 cannot round-trip.** The document's
   image model is an ordered list with a caption per image and a remove control.
   The contract carries `{field, name, bytes}` and nothing else: there is no
   message that unsends an image, no field for a caption, and no id by which the
   parent and the frame could agree which image is which. The port leaves the
   caption input and the remove button wired to the local array with a comment
   saying they reach nobody, because deleting them would hide the hole.

3. **`idea:state` cannot carry images back down**, so a student who reopens the
   assignment gets their text and an empty sketch list. `values` is
   `Record<string, string | boolean>`; images are neither. Module 04 is 10 of the
   50 points and its evidence does not survive a page reload.

4. **`type: 'table'` has no workable meaning.** Module 05's manufacturing table
   is 20 `data-field` cells. One block of `type: 'table'` maps 20 change events to
   nothing; 20 blocks of `type: 'text'` store the work but make the contract's
   own table type unused and the row structure invisible to the parent. The port
   takes the second, because it is the only one where the work persists.

5. **A repeating group has no vocabulary at all, and it loses work silently.**
   `addMfgRow()` mints `mfg-06-p` and onward at runtime. Those fields are in no
   manifest, so the parent's map has no `block_id` for them and must drop them --
   student typing, gone, with nothing on screen saying so. **This is the exact
   failure mode the contract's own `id`/`field` split exists to prevent**, arriving
   through a door the split does not cover. The port emits the changes anyway
   rather than suppressing them locally, so the hole stays visible to whichever
   lane closes it.

6. **Blocks that belong to no module have nowhere to live.** Student name, team
   name, team members, date, the rulebook acknowledgement, the integrity
   declaration and four checklist boxes are the submission's identity, not any
   module's content. `blocks` exists only inside `HtmlModule`, and `points` is
   required, so the port invents a `package` module worth 0 with an empty
   `criteria` array. That is a seventh module in a six-module assignment and it
   will render in the grading console. The contract needs either a module-level
   `graded: false` or a manifest-level `blocks` array outside `modules`.

7. **`window.print()` needs `allow-modals` and the contract does not grant it.**
   The Print / Export PDF control and every `@media print` rule in the document
   are unreachable, silently. The print rules are a real feature here: the
   document carries a `print-mirror` for every field and an instructor scoring
   table that exists only on paper.

8. **`target="_blank"` needs `allow-popups`, and the rulebook link is required
   reading.** `window.open` returns `null` in the sandbox, measured. The link
   also points at `/assignments/IDEA-Blade_Rulebook_v2_2`, which on
   `sandbox.ideabosco.com` resolves to a host that does not serve it. The
   acknowledgement checkbox beside it asks a student to confirm they read
   something they cannot open. **The link belongs in parent chrome**, beside
   Submit.

9. **`idea:state` and `idea:saved` carry no `schemaVersion`.** `idea:ready`
   announces 3 and nothing answers in kind, so a frame cannot tell a parent that
   speaks its version from one that does not.

10. **`idea:saved` has an `ok: false` and no reason.** The port renders "Not
    saved. Your work is still on screen; it has not reached the server." because
    that is the only true sentence available. A refusal and a transient failure
    are different outcomes and the frame cannot tell them apart, which is the
    distinction `$lib/save-state.svelte.ts` exists to make.

11. **Nothing in the contract says who owns the completeness check.** The
    document's `runPreflight` guarded both print and submission; submission is now
    parent chrome, and the parent cannot run `countSentences`. The port keeps the
    pre-print half and the pre-submission half has no owner.

## What is NOT verified

- **Nothing was run against a real frame host**, because none exists: ledger 0126
  owns `HtmlAssignmentFrame` and `/hx/[docId]`. The parent side of every message
  above is a stub in a dev harness. The `event.origin` check the contract
  requires of the parent is therefore unexercised.
- **No live Supabase, no `classroom_responses` row, no upload.** No block id in
  this manifest has ever been written to a database.
- **`frame-ancestors https://ideabosco.com` is untested**, because a `<meta>` CSP
  cannot carry it and there is no served document to put it on a header.
- **The 20 MB / real-photo path is untested.** The upload proof used an 8x5 PNG.
  What a 4 MB phone photo costs as a base64 structured clone across `postMessage`
  is unmeasured, and it is the case module 04 will actually meet.
- **`prefers-reduced-motion: reduce` was not exercised**, so the document's
  `initAnimations` reduced-motion branch is unverified in the sandbox.
- **No visual pass at 375px.** The frame was driven at 1440px only; `idea:height`
  reported 6157 to 6312px, which is the number the parent will size on, but the
  narrow width was not measured.

## What was deferred, and why

`tools/browser-verify/README.md`'s **static** counts region was regenerated
(`97` to `98` `/dev` pages) because adding a dev page is exactly what obliges it,
and the two-line diff is entirely that. Its **measured** region was left alone:
`tests/derived-numbers.test.ts` fails five assertions on `origin/integration`'s
tip because eleven classroom specs have never been measured, which predates this
bundle, belongs to the classroom lane, and needs a full harness pass this lane
should not be taking while three others are pushing.
