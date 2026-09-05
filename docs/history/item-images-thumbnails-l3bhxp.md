---
title: "Pictures in an item body, and the assignment thumbnail that needed them (`claude/item-images-thumbnails-l3bhxp`, 0176)"
date: 2026-09-04
branches: [claude/item-images-thumbnails-l3bhxp]
migrations: ["0176"]
subsystems: ["IDEA Classroom", "Rich text", "Home feed", "Browser harness"]
---

Prompt 0030. An instructor asked for assignment thumbnails so a feed of items is
scannable rather than a wall of identical cards. Prompt 0026 audited it, found
the thumbnail was not derivable, built nothing and said so -- which was correct,
because the gap underneath it is that `ItemBlock` was `p | h3 | h4 | ul | ol`
and an item body could not hold a picture at all. An instructor writing an
assignment could not put a photograph of the part in it, on a surface whose
whole subject is making and measuring physical things.

Started from `origin/integration` at `0368dfc`, 54 commits ahead of `main`. The
container's git identity was already set (`Claude <noreply@anthropic.com>`), so
nothing had to be configured.

## Phase A, and the two audit claims the tree contradicted

**A4's premise was false, and it is the finding that shrank this bundle by a
column.** The prompt (quoting 0026) said "the feed's widest rung carries no
attachment, `ClassroomItem` has no attachment field". Both halves are wrong on
`integration`: `ITEM_SELECT` in `src/lib/classroom/transports.ts` has carried
`classroom_attachments(id, filename, mime_type, size_bytes, sort_order)` as an
embedded resource since attachments existed, `ClassroomItem.attachments` is
declared at classroom.ts:277 and filled by `normalizeItemRow`, and the home
feed's read (`src/routes/+page.server.ts`) goes through `selectItemsWithDoc`,
whose three widest rungs all carry `body_doc`.

So the cover is a **pure function of rows already in memory** and needs no
column, no backfill, no widened payload and no per-card round trip. Thirty
cards cost thirty array lookups. **0176 therefore carries no projection at
all** -- and a stored cover would additionally have been a second copy of
"which picture leads", which is the kind that stops matching: an author
reorders the body, the column still names yesterday's image, and nothing
reports it.

**A2's premise was true in substance and pointed somewhere else.**
`tests/classroom-figures.test.ts` does assert zero `img` from a hostile body
with a non-zero control -- but its subject is the MARKDOWN figure path
(`MarkdownText`, `ReferenceBlock`, `SpecRenderer`, `parseMarkdown`,
`resolveFigureSrc`), not `ItemBody`. Which means **this repo already had an
image path**, with a same-origin-only predicate, an `attachment:<filename>`
alias vocabulary, SVG refused from every source, and a caption-plus-marker
degradation for anything refused. The whole design of this bundle followed from
that: the image member reuses that predicate rather than inventing a second
one, and `classroom-figures.test.ts` passes **unchanged**.

## What an image block carries, and what it does not

    block := { type: 'img', src, alt }

**`src` is an authored reference, never a URL and never an id.** The prompt
proposed a storage key; CLAUDE.md's own rule ("an attachment ALIAS, never a
file id, in anything an author writes") and `resolveFigureSrc`'s header say
otherwise, and the reasons are the ones that already exist: a reference is
authored before the item exists, has to survive the file being re-uploaded
under a new id, and has to still mean something in the exported copy under
`materials/`. A key satisfies none of those, and a signed URL additionally
expires while a stored body must not.

**`alt` is required and has no empty form**, in four places: the TypeScript
type (`string`, not `string | undefined`), the editor's insert control, the
normalizer, and 0176's gate. A body cannot reach the table with a blank
description by any door.

**No intrinsic dimensions**, against the prompt's suggestion: they are not
knowable from a reference resolved later, so a stored width is a claim that
goes quietly wrong, and the layout that would use them is a CSS box the
renderer sets without them. **No caption either** -- `alt` is the one authored
sentence, exactly as it is for a markdown figure where one string is both.

## Every `ItemBlock` consumer, and what it got

| Consumer | What it did with an unknown member before | Branch it got |
| --- | --- | --- |
| `_classroom_doc_ok` (SQL gate) | refused it | accepts `img` **only** on the new 2-arg form |
| `_classroom_doc_text` / `richDocText` (projection) | **emitted an empty line** | unchanged -- see below |
| `richBlocksFrom` (shared walk) | walked it for text, found none, **DROPPED it** | opt-in `imageBlock` hook, consulted BEFORE the text walk |
| `normalizeItemDoc` | as above | claims the node; refuses a bad one rather than dropping |
| `looksStored` | **returned false**, so a stored body was treated as editor output and stored back EMPTY | its own arm for a block with `src`/`alt` and neither `runs` nor `items` |
| `docToTiptap` | fell to the list arm and read `.items` off nothing | emits the atom |
| `ItemBody.svelte` | fell to `{:else}` and rendered a list with no items | a `<figure>`, resolved through `resolveFigureSrc` |
| `markdownToItemDoc` | returned null (field falls back to a textarea) | a figure becomes an image block |
| `editorToMarkdown` | **silently dropped it** | writes the figure line back |
| `markdownUneditableReasons` | named "an image" as a reason | only a figure with no caption is |
| `hasGuidance` (notebook) | type error on `.items` | `'items' in block` narrowing |
| `ClassroomFeed` card | no cover concept | `feedCover`, with the glyph as fallback |

**`looksStored` is the one that would have been catastrophic.**
`normalizeItemDoc` routes an ALREADY-STORED document back through the editor
walk on every publish toggle, so before that arm existed a body with a picture
in it would have been walked for `content` it does not have and stored back
empty -- silently, on a click that says publish, for an item nobody was
editing.

**The projection is the one that got nothing, deliberately.** An image
contributes an EMPTY LINE to `classroom_items.body`, on both sides, and that is
a bounded decision rather than an oversight: `src/lib/rich-text-doc.ts` is not
an owned file in this bundle, its `else` arm reads `block.runs`, finds none and
emits `''`; the SQL `else` arm aggregates over
`jsonb_array_elements(b.value->'runs')`, which is zero rows for an absent key,
and `coalesce(...,'')` makes that `''` too. **They already agree by
construction, and widening either alone is what would have broken them.**
Measured on both sides in `tests/db/classroom-item-image-gate.test.ts`. The
visible consequence is stated rather than hidden: an item whose body is ONLY a
picture has an empty `body`, so an ANNOUNCEMENT still needs words, which 0085's
field check enforces exactly as it always has.

## The gate becomes a pair, and why that was forced

`_classroom_doc_ok` reads as classroom-only and is not: 0123 pointed
`notebook_sessions.guidance_doc` at it deliberately, one statement of "what may
a document contain". That decision is right and is not undone here. But a
note's guidance has no pictures -- `CheckInGuidance` cannot render one and the
notebook's normalizer supplies no hook that could emit one -- so widening the
shared gate would have let a guidance document reach the table carrying a block
its renderer walks straight past.

So the rule stays in ONE function and gains a parameter:

- `_classroom_doc_ok(jsonb, boolean)` -- the rule, **no defaults, ever**
- `_classroom_doc_ok(jsonb)` -- a thin wrapper delegating with `false`

This is CLAUDE.md's keep-both-arities exception, used for its second property
as well: every existing caller keeps working untouched, so **0176 has no deploy
ordering at all** and may be applied before or after the code. The wide form
carrying no default is what makes the pair unambiguous under any resolution
rule rather than under a particular one, and it is asserted structurally (both
arities present, `pronargdefaults = 0` on the wide one) rather than by a count
of two -- a count of two passes on exactly the arrangement that breaks every
call.

**The src predicate is a mirror, not a share.** `_classroom_figure_src_ok` is
the SQL twin of `resolveFigureSrc(src, [])`, the same relationship
`_classroom_safe_href` has to `safeHref`. It is the STRUCTURAL half only:
`unresolved` is about the attachment LIST rather than the string, and at
storage time the list is the wrong question -- an author writes a reference
before an upload lands, and an attachment removed next term must not
retroactively make a stored body unsavable. The 23-case corpus is put to BOTH
sides in one run, and the SQL prefix list is compared against
`FIGURE_STATIC_PREFIXES` element for element.

## The editor

`RichTextEditor` gains a node built with `@tiptap/core`'s `Node.create` from
`ITEM_IMAGE_NODE` -- one declaration the editor, the normalizer and the tests
all read. **No `@tiptap/extension-image` dependency**: that extension's whole
job is an arbitrary `src` URL, which is the one thing this feature must not
have, and adding it would rewrite a 4,649-line lockfile for a node that is
twelve lines.

**The node is NOT in `$lib/rich-text-schema.ts`**, which holds the StarterKit
options both features share. A note has no pictures, and putting it there would
widen what a note can be asked to hold because an item body grew.

**The insert control is the Link control's shape**, a toolbar button opening a
small inline form -- which is what makes the feature reachable in production
with no prop from any of the three surfaces that mount this editor, none of
which this bundle owns. `Add` is `aria-disabled` and the sentence explaining
why is present before anything is pressed.

## Verification

- **`svelte-check`: 0 errors, 37 warnings** (31 `state_referenced_locally`, 5
  `css_unused_selector`, 1 `perf_avoid_nested_class`), re-derived after
  `svelte-kit sync` with the two `PUBLIC_SUPABASE_*` placeholders exported.
- **Full suite: 255 files, 5361 tests, all passing**, up from `integration`'s
  253 / 5309 -- +2 files and +52 tests, all this bundle's.
- **`npm run verify:browser`: 190 route/width runs, 2666 measurements, 0
  outside threshold.** The counts block is regenerated on a clean tree at
  `2d0f79b`; the ZERO baseline holds and this bundle produced no new row.
- **`/dev/item-images` at 375 and 1440**, both green: 0px horizontal overflow;
  figure caption 7.27:1, refusal marker 6.06:1, the image form's
  required-description sentence 6.06:1, feed row title 12.09:1; feed rows
  341x59 at 375 and 542x60.6 at 1440, `0/3 under 44px`; 2 body images, 4
  refusal markers, 6 captions, 1 cover card, 2 glyph cards, all with exact
  ceilings so an extra `img` reddens.
- **The three feed rows are the SAME height** -- `[3 rows, 1 distinct height]`
  at both widths, an `order-result` rather than a tap-target reading, because
  the tap check reports the SMALLEST box and cannot say anything about
  equality.
- **The editor control is driven for real**, `clickUntil` retrying against its
  own predicate: **2 attempts at 375px, 1 at 1440px**. That is the hydration
  race the harness README warns about, sharpened here by Tiptap arriving
  through a dynamic import on top of it -- a single timed click would be a coin
  flip.

### Mutation proofs, all restored from `cp` copies and md5-verified

Never `git checkout --`, per CLAUDE.md's own warning about three sessions
losing their uncommitted work to it.

| Mutant | Result |
| --- | --- |
| SQL src clause opened | 3 tests red (`hostile src corpus`, `RPC refusal`, `UPDATE`) |
| SQL alt clause opened | 2 tests red (`blank description`, `RPC refusal`) |
| narrow wrapper widened to allow images | 2 tests red (`delegates`, `guidance did not move`) |
| alt requirement removed from the normalizer | 1 test red (`REFUSES rather than drops`) |
| `img` arm removed from `looksStored` | 1 test red (`is IDEMPOTENT`) |
| `img` branch dropped from `ItemBody` | 6 tests red |
| feed rows shrunk to 18px | tap-target row red: `smallest 542x18, 3/3 under 44px` |
| a cover made its row 80px tall | equal-height row red: `[3,2]` against `[3,1]` |

The first three needed the migration's own section-5 behavioural guard stripped
as well: **it fires first and aborts `beforeAll`**, which proves the guard bites
but not that the test's assertions do. Both readings are worth having and both
are recorded.

`--break invisible` reddened 10 measurements and `--break low-contrast` 4 on
this route. **`--break tiny-taps` reddened 0**, and that is a gap in the PRESET
rather than in the check: it targets `button, [role="button"], a.btn` and a feed
row is `a.assignment-item.linked`, which `/dev/home-feed` has too. Hence the
scoped injection above.

## Files outside the prompt's ownership list that had to be touched

Both are consequences of adding a member to a closed union, and leaving either
would have left the tree unbuildable or the suite red.

1. **`src/lib/check-in-guidance.ts`** -- `hasGuidance` narrowed with
   `else if (block.items.length > 0)`, which stops type-checking once the union
   has a member carrying neither `runs` nor `items`. Changed to
   `else if ('items' in block && ...)`. **No behaviour change**: an image cannot
   reach a guidance document, because that path calls the NARROW gate.
2. **`tests/classroom-spec-text-surfaces.test.ts`** -- one case asserted that a
   markdown figure makes a spec prose field uneditable. That is now false by
   design. The assertion is **moved, not deleted**: the figure case comes out of
   the "refuses the editor" list and a new case asserts the opposite direction
   with its round trip, so a construct that stopped making a field uneditable is
   written down somewhere.

## What 0176 needs on apply

Paste `supabase/migrations/0176_classroom_item_images.sql` into the Supabase SQL
editor after 0175, cold. Expect, in the notices pane:

```
0176: gate arities OK (1-arg wrapper, 2-arg rule, 0 defaults on the rule).
0176: gate behaviour OK (narrow refuses an image, wide accepts one, both agree on text).
0176: N of N stored item body_doc(s) accepted by the widened gate.
0176: 0 item body_doc(s) currently contain an image.
0176: N of N stored guidance_doc(s) accepted by the UNCHANGED narrow gate.
0176: static image prefix accepted: /IDEA/
```

**The two counts on each line must be EQUAL.** If either is not, do not deploy:
the file only widens, so an unequal count means something already stored has
stopped passing, and the header names what to re-paste to undo it. The image
count is zero on a first application by construction -- nothing could store one
until the file ran. The prefix line is printed so it can be checked by eye
against `FIGURE_STATIC_PREFIXES`; a prefix on one side and not the other is a
body one half accepts and the other refuses.

**Re-applying it is ordinary** and does nothing the first application did not:
the wide form is dropped at its own exact signature first, so a machine that
took an earlier draft cannot fail on "cannot change the default of an existing
parameter".

## Not verified, and deferred

- **Nothing ran against the live Supabase project.** The local `.env` is a
  placeholder (`example-ref`); every SQL claim here is against the embedded
  Postgres harness with the real migration files applied unmodified.
- **No signed-in surface was driven.** `/dev/item-images` names STATIC paths
  under `/IDEA/` for its resolvable fixtures, because the attachment proxy needs
  a session this route does not have. The `attachment:` alias branch is
  exercised in the node and db tests and is shown on the harness as the
  unresolved case; **a real photograph of a real part, uploaded to a real item
  and rendered through the real proxy, has not been seen by anybody.**
- **Pasting the copied `figureReference` string into the editor still lands as
  text.** `AttachmentList` already offers "copy the reference", and turning that
  paste into an image node needs a ProseMirror paste plugin rather than the
  `transformPastedText` hook, which returns a string and cannot produce a node.
  Deferred rather than half-done; the toolbar control covers the same need.
- **`ContentComposer` passes the editor no attachment list**, so the insert form
  asks for a filename rather than offering the item's own files in a picker.
  That is a prop from a file this bundle does not own.
- **The plain-text projection still drops an image's description**, per the
  parity argument above. Making `body` carry the alt text is a change to
  `src/lib/rich-text-doc.ts` AND to `_classroom_doc_text`, together, in a bundle
  that owns both -- and it would move what the stream preview, the announcement
  fallback and the export all read, which is its own decision.
