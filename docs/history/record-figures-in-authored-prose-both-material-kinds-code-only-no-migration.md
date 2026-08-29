---
title: "Figures in authored prose, both material kinds (code-only; NO migration)"
date: 2026-08-20
branches: []
migrations: []
subsystems: ["IDEA Classroom"]
record_order: 94
---

Images can sit inside `instructions` prose on an assignment spec and inside
`instructions` / `callout` prose on a reference document. **No migration, and
none was needed:** block types are unchanged and the `instructions` content
string keeps its shape (it is still one markdown string), so neither
`_classroom_check_spec` (0086) nor 0092's reference validator nor
`tools/validate-reference-spec.py` was touched. A figure is markdown INSIDE a
field those validators already accept as free text. Conforms to
`IDEA_MATERIAL_SPEC_v2.md` 2.2's recorded decision (whose "NOT YET IMPLEMENTED"
notice can now be removed).

### The syntax, and what it deliberately is not

A line whose ENTIRE trimmed content is `![alt](src)` is a `figure` node
(`FIGURE_RE`, `reference-spec.ts`). Alt is required and non-empty and serves as
both the `alt` attribute and the visible `figcaption` -- one authored string, so
a screen-reader user and a sighted reader are told the same thing and neither can
be given a description the other lacks. There is no fallback to the filename,
because a filename is not a description.

- **NO INLINE IMAGE RUN, and `parseInline` is untouched.** An image inside a
  paragraph is unsupported. Every other `![` keeps the measured pre-existing
  behaviour: a literal `!` plus an ordinary link. Verified in the browser --
  `![not a figure](attachment:truss-detail.png)` mid-sentence renders `!` plus an
  anchor with NO href, because `safeHref` rejects `attachment:` exactly as it
  always did.
- `![](src)` and `![   ](src)` are NOT figures and stay literal.
- A figure line inside a code fence is code.
- **A `javascript:` url carrying parentheses never even parses as figure syntax**
  (the src pattern closes at the first `)`, failing the whole-line anchor). Real,
  and a second layer, but the test case for the `scheme` refusal uses a paren-free
  form on purpose: written the other way it would have passed while asserting
  nothing about the allow list. That is how the fixture was first written, and
  the harness-proof pass is what caught it.

### One resolver, and it is not `safeHref`

`resolveFigureSrc` (`src/lib/classroom/classroom.ts`, beside the other src
builders) is the whole rule, used by both kinds through the one `MarkdownText`.

- **`safeHref` is deliberately not reused, and must never be widened to cover
  this.** It admits external http/https, which is right for an ANCHOR: a link is
  navigation the reader chooses to follow. A browser fetches an `img`
  automatically, with the reader's IP and Referer, before anyone has decided
  anything, on a document we serve to signed-out readers off a printed QR code.
  Different threat surfaces, different predicates.
- **Permitted:** `attachment:<filename>`, matched case-insensitively against the
  attachments OF THE ITEM BEING RENDERED, first match wins, resolved through the
  existing helpers -- so the signed-in item page gets the plain proxy path and the
  public viewer gets `?public=1` (which narrows to `classroom_public_attachment`).
  Never a `drive.google.com` URL. Plus absolute paths under
  `FIGURE_STATIC_PREFIXES`, one exported constant (`['/IDEA/']`) so the set is
  greppable and testable; widening it is one line and that line is the whole
  review.
- **Refused by name:** external http and https, protocol-relative `//`, `data:`,
  `javascript:`, any other scheme, relative paths, absolute paths outside the
  named prefixes, traversal (plain and `%2e`-encoded), and SVG from anywhere.
- **SVG is refused by extension AND by stored MIME.** It is a document, not a
  picture. Both spellings are checked because either can be the only one present:
  a static path has an extension and no mime, an attachment has a mime and may
  have been uploaded under any name. The fixture includes `diagram.png` stored as
  `image/svg+xml` for exactly that case.
- **The ALIAS rather than a file id is the point:** a spec is authored before the
  item exists, must survive a re-upload under a new id, and must still mean
  something in the exported copy under `materials/`.
- **No attachments passed is not an error.** Every `attachment:` reference reads
  as `unresolved`, which renders as caption plus marker -- the same degradation a
  typo produces. The spec importer's live preview passes none deliberately: the
  item it would resolve against does not exist yet.
- **A refused or unresolved figure renders its caption plus a visible marker**
  ("Image unavailable", a word and not only a colour), never a broken `img` and
  never silence. The refused src reaches no attribute at all -- the element is not
  rendered, rather than rendered with a blanked value.

### Threading

`MarkdownText` gained `attachments`, `publicAttachments` and `viewAs`.
`ReferenceBlock` and `ReferenceDoc` pass them down; `SpecRenderer` takes
`attachments` -- deliberately NOT its existing `files` prop, which is the
STUDENT's uploaded evidence in a different table behind a different proxy, and a
figure must never be able to name one. The three call sites that already carry
`item` (`AssignmentEngine`, `GradingConsole`, `ItemDetail`) needed no new props;
`/reference/[itemId]` passes `data.attachments` with `publicAttachments`.

### Measured

Dev harnesses (`/dev/classroom` assignment engine, `/dev/classroom-reference`),
both mounting the real components, both seeded with a real image attachment
through `registerLocalAttachmentUrl` so figures render REAL bytes -- a figure
verified against a broken image proves nothing about layout, print or contrast.

| | 1440x900 | 375x812 |
|---|---|---|
| reference: figures / imgs | 6 / 2 | 6 / 2 |
| reference: figure width | 430px | 309px |
| assignment: figures / imgs | 3 / 2 | 3 / 2 |
| assignment: figure width | 846px | 293px |
| `scrollWidth` vs `clientWidth` | 1425 / 1425 | 375 / 375 |
| horizontal overflow | 0px | 0px |

Aspect ratio preserved at both widths: 2560x1204 (2.126) rendered 846x399 (2.120)
and 293x139; 1202x1202 rendered 846x846 and 293x293.

**Contrast, measured against the ground each thing actually composites over**
(`IDEA_INTERFACE_STANDARDS` 10), by painting every computed colour into a 1x1
canvas -- the first attempt used a regex that silently skipped the callout's
`color(srgb ...)` fill and reported the page base instead, which is the wrong
answer arrived at confidently:

| | ink | ground | ratio |
|---|---|---|---|
| figcaption in a `v-info` callout | `rgb(154,164,157)` | `rgb(20,27,26)` | **6.80:1** |
| figcaption on `--surface-1` | `rgb(154,164,157)` | `rgb(16,19,18)` | **7.27:1** |
| "Image unavailable" marker | `rgb(208,128,48)` | `rgb(22,26,24)` | **5.70:1** |

### Print, and the defect measurement found in it

Print rules sit beside the existing `@media print` block in `MarkdownText`:
figures print, `break-inside: avoid` (verified computed as `avoid` on all nine
figures across both kinds), capped at `max-height: 4in` (384px at 96dpi) so one
figure cannot take a whole page.

**The first version distorted every image, and only measurement caught it.**
`.md-figure` is a flex COLUMN, so the default stretch alignment sized the `img`
box to the figure's full width whatever `width: auto` said, and `max-height` then
clamped the height independently -- with `object-fit` at its default `fill`, that
does not letterbox, it squashes. A 1202x1202 square measured **846x384** in the
print box, 45% of its height. `align-self: flex-start` lets the box shrink to its
content; the same image now measures **384x384**, and the 2560x1204 measures
**814x384** (box ratio 2.120 against a natural 2.126).

### The security test, rewritten rather than loosened

This file's reference-renderer entry recorded "0 img" from a browser pass over a
hostile fixture. That was true **because nothing in this app could render an
`img` from authored prose at all.** It is still 0, now for a different reason,
and a claim whose justification changed underneath it reads as coverage of the
exact case that became reachable. That paragraph is annotated in place as
superseded, and `tests/classroom-figures.test.ts` replaces it (47 tests):

- **Positive control.** 0 img from all 16 hostile shapes AND 3 img from 3 control
  figures, counted by the same function in the same run, both numbers printed:
  `[figures] hostile cases=16 img=0 | control cases=3 img=3`. A parser that
  stopped recognising figures satisfies the first half and fails the second.
- **The harness is proven first** (part 0): `countImgs` detects `<img`, `<IMG`
  and `< img` and does not count the word "image"; `renderProse` demonstrably
  produces an img at all; every hostile line really is figure SYNTAX (otherwise
  "0 img" would be about the parser, not the allow list); the fixture case count
  is asserted; and the `dev` toggle is shown to actually move, since two later
  tests assert a DIFFERENCE between branches.
- **One case per refused shape**, 16 of them, each asserting the reason by name.
- **Round-trip fixture** holding one instance of every construct `parseMarkdown`
  can produce, figures included, with the expected node sequence written from the
  node union rather than recorded from the parser.
- **Both kinds** driven through their own real renderers.

**Mutation proof**, 10 mutations, each opening the predicate ONE way in the
PERMISSIVE direction (commenting the function out would fail closed and prove
only that the tests notice it exists). `classroom.ts` restored byte-identically
after every one, md5 `0ea264f0643802e32a80a2878114c36d` before and after:

| mutation | tests reddened |
|---|---|
| external http/https accepted | 5 |
| protocol-relative accepted | 1 |
| any absolute path accepted (prefix list removed) | 4 |
| traversal out of a prefix accepted | 5 |
| SVG accepted from a static path | 5 |
| SVG accepted as an attachment (name check) | 1 |
| SVG accepted as an attachment (stored MIME check) | 4 |
| a relative path accepted | 1 |
| extension checked with the query still attached | 4 |
| the public branch replaced by the signed-in one | 3 |

The first run reported three "0 reddened" results that were **pattern misses, not
test gaps** -- the mutation patterns used `\n` against a CRLF file. A mutation
that matches nothing reports exactly what a missing test reports, which is why
the script now normalizes line endings and why a 0 is treated as a failure of the
proof rather than as a result.

### The authoring affordance

Every IMAGE attachment in `AttachmentList` offers "Copy figure reference",
yielding `![<filename stem>](attachment:<filename>)` from `figureReference()` --
one spelling shared with the resolver, and a test asserts the parser reads that
exact string back as the intended figure. Images only (offering it beside a PDF
hands the author a string that resolves to a refusal); `isImageAttachment`
already excludes SVG, so the two agree without a second rule. Screen only
(`display: none` in print). Shown only where the viewer manages the item, and
deliberately NOT on the instructor-only list (0090) -- those resolve through a
proxy `resolveFigureSrc` never calls, and a working reference there would embed
an instructor-only file into prose every student reads. Clipboard write falls
back to a selected textarea; the label flips to "Reference copied" for 2s
(verified in the browser by polling on timeouts -- the pane's frozen rAF meant
the first read was simply too early).

**Target size, found by measuring.** The new control measured **131x16**, under
even the absolute 24px floor. Raised to **139x44** at both widths.
`.attach-remove` is its adjacent sibling in the same row and measured the same
16px; it was raised in the same pass, because one compliant control beside one
non-compliant one reads as a broken row rather than a fixed one.

### Two dead things closed

- **`printAs` / `printConfig` removed** from `ImageZoneBlock` and `CalcBlock`.
  Declared since schema v1.0, read by nothing, describing a dual engine-and-print
  contract this repo never implemented -- print is `@media print` CSS inside the
  rendering components. **Removing them breaks no stored spec:** neither
  `validateSpec` nor `_classroom_check_spec` rejects unknown keys on a block;
  both check `type` against a whitelist and then validate the fields they name.
  A spec still carrying `printAs` imports and renders exactly as before.
- **`docs/IDEA_MATERIAL_SPEC_v1.md` replaced with a stub** naming
  `IDEA_MATERIAL_SPEC_v2.md` (v2.2, maintained outside this repo) and its
  companion standards. Stubbed rather than deleted on purpose: it was cited as
  authority by an agent reading this repo, and from inside the repo it looked like
  the standard. A stub fails loudly where a deleted file fails silently and a
  stale file does not fail at all.
  - **Readers of it, and what happened to each:** `assignment-spec.ts:7` and `:23`
    repointed at v2; `supabase/migrations/0086:9` and `0095:33` LEFT ALONE (an
    applied migration is an immutable record, and both now resolve to a stub that
    says "not authoritative, here is the real one", which is the intended failure
    mode); `docs/HISTORY.md:11844` and `:12173` left alone (a dated record is not
    edited to match later changes).

### A block type the code no longer knows

Both block switches (`ReferenceBlock`, `SpecRenderer`) ended with a bare `{/if}`,
so a stored block of a retired type rendered **nothing at all** -- a document
quietly one block short, with no gap and no error, and on an assignment that
means a student is never shown something they are graded on. Both now carry a
final `{:else if dev}` naming the type. **Dev only; production is byte-for-byte
what it was**, because the person who can act on it is not the student. Only
reachable if a type is retired while stored documents still carry it -- the
validators refuse an unknown type on write. `MarkdownText`'s own chain already had
a final `else`, but it was the `code` branch catching everything: it now names
`code` explicitly and has its own dev-only arm.

`$app/environment` is aliased in `vitest.config.ts` to a stub whose `dev` is a
mutable live binding, because the claim worth testing is that the two branches
DIFFER and a constant can only ever prove one of them. `withDev()` restores the
previous value in a `finally`, so a test that throws mid-assertion cannot leave
the rest of the run on the other branch.

### Not verified

- **No live Supabase project.** The local `.env` is the placeholder, so no figure
  has ever resolved against a real `classroom_attachments` row or a real Drive
  file. The harnesses resolve through `registerLocalAttachmentUrl`, which is the
  same `attachmentSrc` code path but not the same bytes. The `?public=1` branch is
  verified as the URL the resolver BUILDS and as the string the rendered markup
  carries, never as a response from `classroom_public_attachment`.
- **No true print render.** The Browser pane does not composite (screenshots time
  out) and cannot emulate print media, so print was verified by reading the
  authored `@media print` declarations out of the live stylesheet and applying
  those exact declarations to the live DOM, then measuring. That proves the
  geometry and the colours the rules produce; it is not a PDF. Pagination itself
  -- whether `break-inside: avoid` actually keeps a figure whole across a real
  page boundary -- is asserted only as the computed property.
- **`loading="lazy"` never requests in this pane** (its IntersectionObserver never
  fires), so every image measurement forced `loading = 'eager'` first. The lazy
  attribute's own behaviour is therefore unverified here.
- **The clipboard's actual contents were not read back** -- the pane refuses
  `readText` on an unfocused document. What is verified is the string
  `figureReference()` returns, that the parser reads it back as the intended
  figure, and that the button's label flips.
- **`IDEA_MATERIAL_SPEC_v2.md` 2.2 still carries the "NOT YET IMPLEMENTED" gate**
  on its figures paragraph. That file lives outside this repo and was not edited;
  the notice should be removed now that this has landed.

---

