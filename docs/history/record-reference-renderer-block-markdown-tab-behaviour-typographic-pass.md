---
title: "Reference renderer: block markdown, tab behaviour, typographic pass"
date: 2026-08-13
branches: []
migrations: []
subsystems: ["IDEA Classroom"]
record_order: 64
---

## Reference renderer: block markdown, tab behaviour, typographic pass

RENDERING AND INTERACTION ONLY. The reference spec schema, `validateReferenceSpec`,
the public read path and every migration are untouched; what changed is
`parseMarkdown`/`parseInline` (the renderer's own markup layer, which lives in
`reference-spec.ts` beside them), `MarkdownText`, `ReferenceBlock` and
`ReferenceDoc`. `/209h` -- the IDEA209H syllabus -- is the first real consumer.

### Block-level markdown was never parsed

Inline emphasis worked; block structure did not, so a heading authored as
`### Unit 1` rendered with its hash marks visible in body copy. `parseMarkdown`
now covers headings, paragraphs, both list kinds with ONE level of nesting,
blockquotes, fenced code and inline code, on top of the existing bold / italic /
link set. `MarkdownText` walks the new nodes through recursive Svelte snippets.

- **A HEADING IS ONLY EVER h3 OR h4, AND CARRIES NO id.** h1 is the document
  title and h2 the section title, both owned by `ReferenceDoc`, so authored
  hashes are CLAMPED (1-3 -> h3, 4-6 -> h4) rather than refused -- clamping is
  what guarantees no literal hash can leak back into body copy. Authored
  headings are never anchors: SECTION SLUGS ARE THE ONLY ANCHOR CONTRACT.
  They are also styled subordinate by construction (mono, tracked, uppercase,
  0.78/0.7rem against the section h2's 1.25rem), so an author cannot out-shout
  the section title.
- **THE SECURITY MODEL IS UNCHANGED AND IS STILL "NEVER MARKUP IN THE FIRST
  PLACE".** There is no sanitizer here: the parser emits typed nodes, the
  renderer walks them into real Svelte elements which escape their own text, and
  the only href that survives is one `safeHref` accepted (http / https / mailto,
  always with `rel="noopener noreferrer"`). Verified in the browser on a public
  route with hostile fixture content: raw HTML, `<img onerror=...>` and a
  `javascript:` link produce **0 script, 0 img, 0 b elements, 0 `on*` attributes
  and 0 anchors**, rendering as the literal escaped text they are. An author who
  wants to SHOW markup uses a code fence.
  - **SUPERSEDED IN PART, 2026-08-20 (the figures bundle).** The "0 img" half of
    that measurement was true because the parser had NO image construct at all;
    it is still 0 for these fixtures, but now for a different reason, and a
    claim whose justification changed underneath it reads as coverage of the
    exact case that became reachable. It is replaced by
    `tests/classroom-figures.test.ts`, which pairs the zero with a stated
    non-zero control count. Do not cite this paragraph as the img assertion.
- A blank line ends a paragraph but NOT a list, so a loose list stays one list.

### Switching tabs must not move the reader (`holdRail`)

The old `selectTab` called `scrollIntoView` on the newly shown section. Because
inactive sections are `display: none`, the active one always begins at the same
place -- just under the rail -- so that scrolled the window to the top of the
document from wherever the reader was. **Nothing on a tab click calls
scrollIntoView any more.**

- **The rule is one clamp: `target = min(currentScroll, railOffset)`.** The rail
  is sticky at top 0, so its screen position is a step function of the scroll --
  pinned at 0 past its own document offset, in flow before it. Scrolling to
  exactly that offset therefore moves the rail by ZERO pixels while putting the
  new section's top immediately below it. Never scroll down, never scroll past
  the pin point; a reader above the pin point is not moved at all.
- **The rail cannot measure itself** -- while stuck, its rect reports the STUCK
  position, not its place in the document -- so a zero-height `.rail-anchor`
  sentinel sits immediately above it and is what gets measured.
- **`behavior: 'instant'` is load-bearing:** `src/app.css` sets a global
  `scroll-behavior: smooth`, which would otherwise animate this.
- **`.ref-body`'s `min-height` is what stops the last 6px of jump.** Replacing a
  tall section with a short one shrinks the document, the browser clamps the
  scroll, and the rail slides back down -- the exact reflow this exists to
  prevent. The floor is `calc(100vh - var(--rail-h))` with the rail's height
  MEASURED by the existing ResizeObserver, because a guessed rail height left it
  6px short and that read as a small jump on every click (observed, then fixed).
  The fallback deliberately under-subtracts. Zeroed in print, or every section
  would take its own sheet.
- **History:** a tab click `pushState`s its fragment, so back and forward move
  between tabs. `hashchange` AND `popstate` are both listened to (the handler is
  idempotent), and a fragment naming no section resolves to the FIRST tab rather
  than doing nothing -- which is what makes back past the first click return to
  the document's own entry instead of leaving the page. Cold load keeps the
  rAF-or-timeout `reveal()` path, deep links unchanged.
- The "keep the active tab visible" effect now scrolls the BAR by hand.
  `scrollIntoView` on a tab button scrolls every scrollable ancestor including
  the window, which was a second, independent source of the same bug.

### Typographic pass

- **ONE prose measure, `--rb-measure`, declared on `.ref-doc` and read by the
  blocks that carry body copy.** MEASURED rather than guessed: Rajdhani's `0` is
  far wider than its average glyph, so `64ch` rendered at ~89 characters a line
  and `54ch` renders at **70-79** (target 70-80). Re-measure if the body face
  changes. `instructions`, `callout`, `keyValue` and the section blurb take the
  measure; `dataTable`, `cardGrid`, `linkCard` and `calc` take the full column
  (730px against 466px at a 768px content width) -- that contrast is most of
  what stops a long document reading as one slab.
- **Spacing tiers, measured:** above an authored h3 36px, above an h4 24px,
  between whole blocks 24px, between paragraphs 12px, within a list 4px.
- **Each block reads as an object.** `keyValue`, `dataTable` and `calc` sit on a
  shared `.rb-panel` surface; cards and link cards carry `--bevel-raised`. The
  three callout variants differ on fill, rule width, rule colour, border colour,
  glow AND tag treatment at once -- `required` is a 5px gold rule, a gold border
  all round, a gold glow and a SOLID gold stamp, because on this page it carries
  a purchase a parent has to make.
- **`dataTable` restacks on a phone, it does not scroll.** Below 620px the head
  is visually hidden (still announced) and each cell is labelled from the
  `data-label` it already carried, so the page never widens: measured
  `document.scrollWidth` **380 == viewport** on every tab at 380px, with the
  table's own scroller at `scrollWidth == clientWidth`.
- **`linkCard` is dressed from `.rb-links`, not from `LinkPreviewCard`**, which
  classroom item links also mount. The overrides compile to
  `.rb-links.svelte-<hash> .lp`, so they cannot reach any other surface
  (verified by reading the generated selectors). The fallback label was already
  always rendered; it now reads as a spec line under the title, beside the
  fetched metadata rather than only in place of it.
- **The tab strip's active state** is a filled tab (`--bg1`), green 700-weight
  label and a 3px green cap, against dim 400-weight text on transparent. The old
  version differed only in text colour. (The fourth part of that treatment, a
  break in the rail's own underline, went with the visible scrollbar -- see the
  section below.)
- **Every class stays `rb-` prefixed, variants included** (`.v-info` etc. under
  `.rb-callout`). `src/app.css` has a global `.callout` that is a flex ROW; a
  scoped background override does not undo an inherited `display: flex`.

### Verified (browser, at 1280 and 380)

`/dev/classroom-reference`, whose fixture gained a long **Handbook** section
exercising every markdown structure plus the three hostile inputs. All eight
tabs, clicked from a deep scroll: **rail 0 / 0 / 0 before, synchronously after,
and 220ms later**, section top constant at 74px, scroll settling in the same
tick (1012 -> 283 with no later correction, i.e. no animation). Returning to a
section previously scrolled 623px in shows it from the top -- no scroll
restoration. Back/forward walked three tabs in both directions staying on the
path; back past the first click returned to the first tab. `#materials` on a
genuine cold reload opened that tab with the heading in view. Rendering: 2 h3,
3 h4, 3 ul, 2 ol, 1 nested ul, 1 nested ol, 1 blockquote, 1 pre, inline code,
bold, em and a real link with rel+target, with **no literal markdown characters
in the rendered text and no id on any heading**. Regressions held: stacked mode
(no rail, 8 sections, min-height 0), the material page with and without a
document, and the shared link card elsewhere. Print re-verified by applying
every `@media print` rule unconditionally: 8/8 sections displayed in document
order, rail and anchor hidden, min-height 0, every background transparent
(required callout included), its glow gone and its stamp outlined in black,
tables `scrollWidth == clientWidth` with `min-width: 0`. Zero console errors and
zero trapped `window.onerror` throughout. `svelte-check`: 0 errors, 36 warnings
(the same 36 as HEAD), 0 of them in the three edited files.

**NOT verified: screenshots.** The Browser pane in this environment does not
composite and no Chrome was connected, so every visual claim above is a measured
computed-style or geometry read, not an eyeball. **Also not verified: paginated
print output** (the pane cannot emulate print media) and **the live `/209h`
document**, which lives in a Supabase project the placeholder `.env` does not
reach -- the real syllabus spec was never in this repo.

### Classroom update log (STANDING DIRECTIVE)

`classroom-updates.json` at the repo root is the student-facing changelog,
rendered at `/classroom/updates` and, in short, on the classroom home. It is
plain JSON imported by `src/lib/classroom/updates.ts` (the
`mdm-drill-banks.json` convention -- data, not a parsed seed, so there is no
parser to get wrong).

**EVERY session that changes classroom-facing behaviour appends a dated,
student-readable entry to that file BEFORE committing.** Entry shape:
`{ date: 'YYYY-MM-DD', title, body, tags?: [] }`; the page sorts by date, so a
new entry may go anywhere in the list.

"Student-readable" is the whole bar, and it is the part that is easy to get
wrong: no table names, no migration numbers, no RPC names, no jargon. Write
what a student will notice and what they should do differently. An entry that
names `classroom_items` is a commit message that wandered into the wrong file.
A change with no student-visible effect (a refactor, a test, a comment) needs
no entry -- but a change to what a class SEES always does.

