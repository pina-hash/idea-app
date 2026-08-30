---
title: "Three fixture follow-ups, and two tokens measured rather than changed (code-only; NO migration)"
date: 2026-08-20
branches: []
migrations: []
subsystems: ["Build, theme, tests, conventions"]
record_order: 93
---

The three follow-ups the nested-bullet bundle named in its own "left undone",
plus a measurement pass that deliberately changes nothing.

### The third impossible fixture

`tests/classroom-body-render.test.ts` fed the WHOLE chain -- normalizer, SQL
gate, `classroom_create_item`, a real read back, the shipping `ItemBody`
component -- a document ProseMirror cannot hold: a `bulletList` sitting as a
SIBLING of its list items. Every assertion in that file, including the stored
shape and the rendered markup, was made against it. It is now built through
`editorDoc(itemSchema, ...)` from `tests/rich-text-fixtures.ts`, with the
sublist inside the list item above it where it really lives, and the file
carries the unbuildable-sibling assertion with the positive control beside it.

**The expected output did not move.** The real nesting flattens to the same
three items (`A ruler`, `Graph paper`, `Sharp pencil`), so `EXPECTED_DOC`, the
`<ul>` assertion and the tag-order assertion are unchanged. That is a result,
not a coincidence to gloss over: the sibling branch and the descend-into-the-
list-item branch agree on THIS document, which is exactly why the old fixture
passed for two releases while real nested lists were being concatenated. What
changed is that the file now proves the chain over a document the composer can
actually produce. The comment on the `<ul>` assertion no longer describes the
dead branch; it names the sublist's real parent.

### The grading console's spec fixture

`SPEC` was `{ version: '1.1', title: ... }` behind `as unknown as
AssignmentSpec` -- no `schemaVersion`, no `meta`, and a `version` key no
revision of the format has had. It now carries `schemaVersion: 1` and a real
`meta` whose `totalPoints` (8) equals the module points, and the cast is gone.

**Checked against both halves of the pair.** A runnable `validateSpec` guard
sits in the file with a positive control (the old shape still produces errors).
The SQL boundary was checked separately: the exact object was run through
`public._classroom_check_spec` on a real embedded Postgres with the
0086/0092/0095 chain applied and was ACCEPTED, and the shape it replaces was
REFUSED there. That was a throwaway test file, deleted after the run -- this
file has no database and should not grow one.

**Nothing in the file depended on the malformed shape.** `rubricFromSpec` and
`levelShort` are the only readers and both walk `modules`; the 35 existing
assertions pass unchanged and the file is now 36.

### The heading clamp, re-framed rather than deleted

`tests/classroom-item-doc.test.ts`'s clamp test was framed as "a paste carrying
an h1", which `transformPastedHTML` makes unreachable. The clamp is live -- a
hand-rolled POST to `/api/classroom/item`, or a direct PostgREST call on the RPC
behind it, reaches `normalizeItemDoc` with no editor in front of it -- so the
test stays and now says which path it covers, following
`tests/notebook-note-route.test.ts:200`. The same mis-framing in
`headingType`'s own doc comment (`src/lib/server/classroom-doc.ts`) is corrected
in the same change, because a comment that says a paste is what this catches is
how the misconception gets rediscovered.

### `--hairline`, measured everywhere it is used -- AND LEFT ALONE

The grading-console bundle raised one boundary to `--text-3` scoped to that
surface and noted the token was presumably failing elsewhere. It is, at every
one of its 152 uses in `src/`, and the numbers are here so the decision can be
made rather than assumed.

Measured in the Browser pane with transitions disabled, by resolving
`--hairline` through a probe element inside each themed scope (a custom
property's declared value is NOT resolved by `getPropertyValue`, so comparing
against it silently matches nothing), compositing the token over the opaque
colour actually painted behind the element's border box, and computing the WCAG
ratio. 382 rendered instances across the classroom harness's 25 views, the two
notebook harnesses on all three plates, and the reference and phase-1
harnesses.

| Room | Token | Surface behind it | Line | Ratio | 3:1 |
| --- | --- | --- | --- | --- | --- |
| classroom / portal | `rgba(255,255,255,.08)` | `--surface-0` `#0a0c0b` | `#1e1f1f` | **1.19** | FAIL |
| classroom / portal | `rgba(255,255,255,.08)` | `--surface-1` `#101312` | `#232625` | **1.22** | FAIL |
| classroom / portal | `rgba(255,255,255,.08)` | `--surface-2` `#161a18` | `#292c2a` | **1.25** | FAIL |
| classroom / portal | `rgba(255,255,255,.08)` | `--green-tint` `#0e3b1f` | `#214b31` | **1.27** | FAIL |
| classroom / portal | `rgba(255,255,255,.08)` | `--bg0` `#121a12` | `#252c25` | **1.24** | FAIL |
| classroom / portal | `rgba(255,255,255,.08)` | `--bg1` `#1a2a1a` | `#2c3b2c` | **1.27** | FAIL |
| classroom / portal | `rgba(255,255,255,.08)` | `--bg2` `#222e22` | `#343f34` | **1.28** | FAIL |
| notebook light | `#e8e5dd` | `--nb-bg` `#fafaf7` | `#e8e5dd` | **1.20** | FAIL |
| notebook light | `#e8e5dd` | `--nb-surface` `#ffffff` | `#e8e5dd` | **1.26** | FAIL |
| notebook light | `#e8e5dd` | `--nb-surface-dim` `#f2f1ea` | `#e8e5dd` | **1.11** | FAIL |
| notebook dark | `#2e2a21` | `--nb-bg` `#16140f` | `#2e2a21` | **1.29** | FAIL |
| notebook dark | `#2e2a21` | `--nb-surface` `#201d16` | `#2e2a21` | **1.18** | FAIL |
| notebook dark | `#2e2a21` | `--nb-surface-dim` `#0f0d09` | `#2e2a21` | **1.36** | FAIL |
| notebook idea | `#232f28` | `--nb-bg` `#0b1410` | `#232f28` | **1.34** | FAIL |
| notebook idea | `#232f28` | `--nb-surface` `#101c16` | `#232f28` | **1.26** | FAIL |
| notebook idea | `#232f28` | `--nb-surface-dim` `#060e09` | `#232f28` | **1.40** | FAIL |

Best case anywhere is 1.40:1; the worst is 1.11:1. **Nothing was changed.** The
token is doing what `colors.css` says it does -- "deliberately below any text
threshold because a divider is not text" -- and 3:1 is the threshold for a
boundary that CARRIES MEANING, which a decorative rule between two paragraphs
does not. The grading console's roster row is a different case (an option
control whose boundary IS the affordance), which is why that one was raised
locally. Deciding which of the other 152 are affordances and which are
decoration is a design pass with a real blast radius, not a token edit.

### `.btn.tiny`, measured at both widths

`.cr-root .btn.tiny` is `font-size: 0.65rem; padding: 0.28rem 0.6rem` with no
`min-height`. Measured heights, identical at 1440px and at 375px at every site:

- **22.9px** -- AdminConsole "Save course"/"Edit"/"Close"; PeoplePanel "Edit",
  "Deactivate", "Reactivate", "Add", "Import n rows", "Edit details", "Archive
  class", "Delete class", "Save correction", "Save class"; UnitManager "Add
  unit"; ContentComposer "+ Add link", "+ Add instructor link", "Unlink", "Post
  to more", the attachment remove; ClassView "New post", "Units (n)", "Close
  units"; ItemDetail "Edit", "Pin", "Copy", "Delete", "Detach check-in";
  SpecImporter "Import spec", "Replace spec", "Remove spec"; RubricBuilder
  "Edit rubric", "Add criterion", "Save rubric", "Cancel", "Generate from
  spec", "Remove"; FeedbackConsole "New", "Seen", "Resolved"; ShortLinkManager
  "Add link", "Edit", "Turn off", "Delete", "Re-point"; the publish toggle's
  "Publish"/"Unpublish".
- **23.9px** -- UnitManager's row actions ("Rename", "Remove", the two arrows),
  which carry a glyph.
- **27.6px** -- the anchor-shaped ones and the file pickers: ItemDetail's
  "Open grading console" `<a>`, AssignmentEngine's "Take a photo", "Choose
  photos", "Choose files", ClassView's "Grade", AdminConsole's "People" and
  "Grades".
- **44px** -- everything inside `.cr-console` (Export CSV, Close, Approve, Save
  draft, Return to student, and the three dirty-bar actions), which is the
  grading console's scoped override, plus the roster row itself at 44px. Also
  44px by declaration in RevisionHistory's `.tool-actions :global(.btn.tiny)`;
  that panel could not be rendered in any harness state reachable here, so its
  44px is READ FROM THE RULE, not measured.

The 44px guideline is missed at 40-odd controls. **Nothing was changed**: the
shared rule is what makes a chip beside a heading a chip, and inflating it
globally is the change the console override was scoped to avoid.

### Casts still standing under `tests/`

Reported, not chased. Two hide a shape a real producer cannot emit:

- **`tests/notebook-shell.test.ts:267`** -- `{ file } as unknown as StagedPhoto`
  omits `enhanced`, which `StagedPhoto` requires and `PhotoStager` always sets.
  Inert today (`notebookComposerHasWork` only reads `staged.length`), and the
  fix is `enhanced: null` with no cast.
- **`tests/classroom-export.test.ts:910-911`** -- `SPEC as never` and
  `[] as never` on `setSpec`/`setRubric`. `SPEC` there IS a valid v1 spec
  shape; the cast is only there because the stub client beside it is
  `as never`, and it takes the domain types down with it.

The rest are not domain-shape casts and are judged fine:

- **`(GET|POST|DELETE|load) as unknown as (event: unknown) => Promise<...>`**
  in nine files -- casting a SvelteKit handler so a hand-built event can be
  passed. This is the repo's own convention for driving the REAL handler, and
  the route genuinely accepts an arbitrary request. It does hide whether the
  fake event matches `RequestEvent`; a typed `event()` helper would close that
  and is a separate change.
- **`as unknown as typeof fetch`** (classroom-export 198, 839) and
  **`client as never` / `supabase as never`** (476, 901) -- deliberate test
  doubles standing in for a whole third-party surface.
- **`} as never` on a `toEqual`** (classroom-decks 729) and
  **`rows[0] as unknown as Record<string, boolean>`**
  (notebook-documentation-check 429) -- assertion-side casts over values
  Postgres produced. Nothing about a producer is hidden.
- **`as never` on `render(..., { props })`** (notebook-entry-controls 65, 83,
  94, 201, 216, 234; notebook-shell 95) -- these are the prop casts. They exist
  because Svelte's generated props type is not nameable from a test, and the
  omitted-transport tests need to pass a props object with a transport
  deliberately ABSENT. The cast is what allows the absence, which is the thing
  under test. Worth revisiting only if Svelte's `ComponentProps` can express a
  partial.

### NOT verified

- **No live Supabase project and no signed-in session.** The SQL check on the
  grading-console spec ran against embedded Postgres with the real migration
  files, not against production.
- **No screenshot.** The Browser pane does not composite; every number above is
  a computed-style, geometry or hit-test read, taken with
  `* { transition: none }` injected first.
- **RevisionHistory's restore button was not rendered.** Its 44px is read from
  its own CSS rule; no harness state reachable in this session produced a
  revision row with tool actions.
- **`.btn.tiny` sites not individually rendered**: UnitManager's inline
  "Save" during a rename, and ShortLinkManager's save in the create form (its
  edit-mode twin "Re-point" WAS measured at 22.9px). Both take the same shared
  rule as the 40 measured beside them.
- **Nothing outside the classroom and notebook rooms was swept for
  `--hairline`.** grep says there is nothing to sweep (GAUNTLET, GREENLINE, FRC,
  FSP and Tournaments never name it), but only the two rooms were driven in a
  browser.

