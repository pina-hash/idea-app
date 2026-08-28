---
title: "Classroom bundle 5: reference documents + public materials (`0092`, `0093`)"
date: 2026-08-13
branches: []
migrations: ["0092", "0093"]
subsystems: ["IDEA Classroom"]
record_order: 62
---

## Classroom bundle 5: reference documents + public materials (`0092`, `0093`)

Materials can render structured, interactive reference documents instead of
plain rich text, and one can be made readable with no account at all. Migrations
`0092_classroom_reference_specs.sql` and `0093_short_links.sql`, applied
manually in that order after `0091`. 0082's one rule is untouched: ZERO client
write grants on any classroom table, every write a SECURITY DEFINER RPC that
re-checks the caller inside its own body.

### Schema v2: a `kind` discriminator, backward compatible BY CONSTRUCTION

A spec document is either an `assignment` (modules, points, rubrics, AI levels,
declarations, preflight, submission -- everything 0086 already does) or a
`reference` (sections, and none of those). **AN ABSENT `kind` IS AN
ASSIGNMENT**: every schema v1 file has no such field, so the default is what
keeps them valid and unchanged. `specKind()` in `reference-spec.ts` owns that
rule client-side and `_classroom_assert_assignment_kind` owns it in SQL.

- **`_classroom_check_spec` IS NOT TOUCHED BY 0092.** Assignment validation is
  byte-for-byte the function 0086 shipped; the kind guard is a separate
  one-line assertion called BEFORE it from a recreated
  `classroom_set_assignment_spec` (same signature, so no second overload). So
  there is no path by which this change alters what an existing assignment spec
  validates to -- pinned by a test that runs a v1 spec through the real
  function.
- A reference document pasted into the assignment importer is refused BY NAME
  ("that is a reference document, attach it to a Material") rather than
  drowning in "needs a modules array".

### A reference document, and what it deliberately is not

`sections[]` instead of `modules[]`. No points, no rubric, no AI level on the
document, no declaration, no preflight, no submission, and no student state
beyond the last-viewed stamp the item already had. **A reference spec carrying
one of those is REJECTED, not ignored** -- `_classroom_jsonb_keys` walks the
WHOLE tree and refuses `points` / `totalPoints` / `rubric` / `aiLevel` /
`declarations` / `approvalGate` / `modules` wherever they appear, because a
silently dropped field in a document a parent reads is worse than a failed
import. (That is also why the AI-level lookup's own field is `level`, never
`aiLevel`.)

- **SLUGS ARE A PERMANENT CONTRACT.** Every section carries an authored slug,
  validated URL-safe and unique in the document, because `/209h#ai-policy` is
  what an assignment links to instead of restating policy. Changing one breaks
  every printed sheet and every deep link that ever pointed at it, so a
  malformed or duplicated slug is a hard error rather than something the
  importer repairs.
- **`navigation: 'tabs' | 'stacked'`**, defaulting to tabs.
- **A REFERENCE SPEC LIVES IN ITS OWN TABLE** (`classroom_reference_specs`),
  separate from `classroom_assignment_specs`, for one load-bearing reason: the
  public read path must be unable to return an assignment spec even if asked.
  A shared table would make that a WHERE clause staying correct; separate
  tables make it a property of which table the function names.
- Authenticated reads delegate to `classroom_can_read_item` (the 0086 rubric
  precedent) rather than restating the rule.

### Public access, and why it is an RPC and never a loosened policy

The printed IDEA209H syllabus carries a QR code to `ideabosco.com/209h` and
goes home for a parent signature. A parent has no `@boscotech.net` account and
must not hit a login wall. So `classroom_items.is_public` (default FALSE,
MATERIAL-only by CHECK, so a public assignment is unrepresentable rather than
merely refused) and:

- **`anon` gains EXECUTE on exactly two functions and nothing else** --
  `classroom_public_reference` and `classroom_public_attachment`. No table
  grant, no policy change, no view. Every existing classroom policy is
  untouched, so nothing that was invisible to a signed-out visitor before 0092
  becomes visible now except through those two.
- **Each PROJECTS AWAY everything that is not the document**, key by key: the
  reference payload is exactly `{item_id, title, spec, updated_at,
  attachments}`. No roster, no enrollment, no student names, no submissions, no
  other content, no section membership, no author email, no body, no postings,
  no last-viewed data -- and no parameter through which any of it could be
  asked for.
- **Five different failures give the SAME answer (null):** an unknown id, a
  private material, an unpublished one, a material with no document, and
  anything that is not a material. A distinguishable refusal would confirm a
  real id to a stranger.
- **Attachments** ride the existing proxy's `?public=1` branch, which resolves
  the row through `classroom_public_attachment` -- a genuinely stricter path,
  not the session check skipped. Test-pinned in both directions: it serves a
  public material's file with no session, and it still 404s a PRIVATE file for
  a signed-in student who could fetch that same file through the ordinary
  branch. **No service-role client anywhere in the public path**: the function
  returns the Drive handle, which is exactly as much as serving the bytes
  already grants.
- **Turning `public` ON takes a second, explicit gesture** whose confirm names
  what becomes visible AND what does not, rather than asking "are you sure?"
  about something the teacher would have to reason out. Turning it OFF is
  immediate -- closing access is never the risky direction. Only the teacher of
  record for every class the item is posted to (or an admin) may flip it.

### Short links (`0093`)

`/209h` is a row, not a route: printed material accumulates these and the
TARGETS MOVE while the paper does not. `app_short_links` (slug, target, label,
soft `active`) with a public `app_short_link_target` read and admin-only
`app_short_link_upsert` / `_delete` / `_list`, `is_admin()` enforced inside each
function. `/admin/links` is the screen (404 for a non-admin, the `/admin` rule).

- **`src/routes/[shortlink]` is a single-segment catch-all**, which SvelteKit
  resolves only AFTER every static route, so it catches what would otherwise
  have been a 404 and nothing else. `_app_short_link_reserved` additionally
  refuses a slug naming a real page, since one could never be reached.
- **FRAGMENTS SURVIVE, which is why this is a redirect rather than a render.**
  A fragment is never sent to the server, and a browser carries the original
  URL's fragment onto a redirect target that has none of its own (RFC 7231
  7.1.2) -- so `/209h#ai-policy` lands on the right tab. 0093 REFUSES a target
  carrying its own fragment, because that one would win instead. **307, not
  308**: a slug is re-pointable by design, and a permanent redirect is exactly
  what caches past the point where re-pointing helps.
- Targets are restricted to same-site paths. An open redirector on our own
  domain is a phishing primitive and nothing here needs one.

### The block types (all display-only)

`instructions` (shared with the assignment spec), `keyValue` (a compact facts
strip, aligned rows rather than a table's chrome), `dataTable` (STATIC --
deliberately a different block from the assignment engine's `table`, which
exists for student data entry; this one never gains a row and never accepts
input), `callout` (`info` / `warn` / `required`, the last visually
unmistakable), `cardGrid` (2-4 cards, one column on a phone), `linkCard`, and
`calc` with two tools.

- **`linkCard` requires a `fallbackLabel` on every entry, ALWAYS displayed**
  whether or not metadata fetched. The syllabus links to specific purchasable
  parts, and when a retailer listing dies the part number still has to be
  readable on the page. It reuses the EXISTING server-side preview fetch and
  cache (never the student's browser) with the same degradation rule: a failed
  fetch renders a plain link, never an error.
- **`calc` is allowed in a REFERENCE spec only.** `_classroom_check_spec` still
  refuses every calc block in an assignment, unchanged from 0086 -- keeping
  that rule exactly as it was is what makes "no existing assignment's behavior
  changed" airtight, and an assignment has no need of these two tools.
  `gradeCalculator` is entirely client-side (nothing saved, transmitted, or
  written -- which is what its REQUIRED authored disclaimer says) with a
  completed-only toggle; `aiLevelLookup` renders its badge through the
  assignment engine's OWN `AiLevelBadge` component, extracted for exactly that
  reason, so "identical in both places" is a property of the code rather than
  of two stylesheets that happen to agree.
- **Prose renders WITHOUT `{@html}` and without a sanitizer.** `parseMarkdown`
  walks text into typed nodes and `MarkdownText.svelte` walks those into real
  Svelte elements, which escape their own text by construction (the notebook
  note-content doctrine); an unsafe link keeps its TEXT and loses its href.

### Tabs, deep links, print

`ReferenceDoc.svelte` is presentation-only and state-free. **EVERY SECTION IS
ALWAYS IN THE DOM** -- an inactive tab is hidden with CSS, never omitted with
`{#if}` -- because the print stylesheet expands all of them and a section that
never rendered cannot be printed. The tab strip is sticky and laid out left to
right, scrolling horizontally rather than wrapping.

- **THE EDGE FADES ARE GONE, and so is the "no arrows, no paging buttons"
  instruction that went with them.** They said "there is more that way" and
  could not act on it; the strip is operated by a real scrollbar, prev/next
  buttons, the wheel and a drag now, and below 40rem it is a labelled select
  instead. See "The reference document's tab strip is operable" below for the
  whole design and the measurements behind it.
- **`reveal()` is scheduled on rAF-OR-TIMEOUT, never rAF alone** (the
  DrawingViewer rule). A backgrounded or throttled window never ticks
  requestAnimationFrame, so the rAF-only version landed on the right tab and
  then silently never scrolled to it. Found in the browser -- the harness pane
  runs hidden, and it simply did nothing there.
- Print is a stylesheet, not a second rendering pipeline and not
  `IDEA_PRINT_STANDARDS.md` compliance: tabs expand into sequential sections in
  document order, the rail and page chrome go, backgrounds drop out, tables
  stop scrolling and links show their target.

### Three real bugs the browser found, none visible to `svelte-check`

1. **`.callout` COLLIDES WITH A GLOBAL CLASS.** `src/app.css` has its own
   `.callout` (a flex ROW with `justify-content: space-between`, a gradient and
   a hover transition) and its own `.warn`. A scoped `background` override does
   not undo an inherited `display: flex`, so the block rendered as a row with
   its tag, title and body side by side. Every block class is now `rb-`
   prefixed and the variants are `v-info` / `v-warn` / `v-required`. **Check
   `src/app.css`'s global class list before naming a new component class.**
2. **The grade calculator's contribution column read 3600%.** Contributions are
   shares of the FINAL percentage, so they can only be computed once the
   counted weight is known; the first cut multiplied by 100 in the wrong place
   and only produced a correct overall figure because the fixture's weights
   happened to sum to 100. It is a two-pass computation now and works for
   weights expressed as fractions too.
3. **`background: none` in the print block did not reach `.callout.required`**,
   whose own fill sits at higher specificity -- leaving the one block a printed
   page most needs to read cleanly still painted. The print rule names it
   explicitly and swaps the fill for a heavier black border.

### Verified

- **`tests/classroom-reference.test.ts` (33 assertions,** 0001 + 0003 + 0020 +
  0053 + 0067 + 0082 + 0083 + 0085 + 0086 + 0090 + 0092 applied UNMODIFIED to
  real embedded Postgres**)** covers only what fails SILENTLY: what `anon` can
  read (and the four things it cannot, all answering identically), the
  PAYLOAD'S OWN SHAPE asserted over the serialized result and its exact five
  keys, `anon`'s grants enumerated from `pg_proc` / `pg_class` (exactly two
  functions, zero tables), attachments (the instructor-only file on the SAME
  item is absent), every write boundary, the public ASSIGNMENT refused by the
  RPC **and** by the CHECK with RLS out of the way entirely, and the v1
  compatibility rules. **MUTATION-CHECKED BOTH WAYS:** dropping the
  `is_public`/`published` gate from the public function reddens 5 tests,
  granting `anon` SELECT on `classroom_items` reddens 1; migration restored
  byte-identical and re-verified green.
- **`tests/classroom-reference-route.test.ts` (11 assertions)** drives the REAL
  `/reference/[itemId]` load and the REAL attachment handler, because what the
  SQL suite cannot prove is that the ROUTES ask the right question. Includes
  the decisive `?public=1` narrowing case above. Mutation-checked: dropping the
  gate from `classroom_public_attachment` reddens 2.
- **Browser-verified** in `/dev/classroom-reference` (404 in production, no
  auth, no Supabase, no network) driving the REAL components. Requirement by
  requirement: an existing v1 assignment renders and behaves identically
  (module chips, the AI badge, the sentence counter reading "2 sentences · min
  3 · max 5", tables, imageZones, checklists, the approval gate locking module
  3, the declaration, a refused submit listing all 4 unmet items, and a real
  grade + return firing `gradeSubmission` with the exact scores for 20/20); a
  material with a body and no document renders its "Details" section unchanged
  while the same material with one renders the tabbed document and no duplicate
  H1; tabs switch, the rail is sticky, and at 375px the page never overflows
  (375/375) while the rail scrolls 568px of tabs through a 337px box with the
  fade showing and every tab 44px tall; **a COLD LOAD of `#grading` scrolled to
  253 and put the heading at 68px, just clear of the rail** (and reproduced the
  rAF bug before the fix); the calculator computed 86.0% on a full set,
  contributions 36/20/18/12, then 56.0% with the toggle off and 86.2% (55.38 +
  30.77 over 65 weight) with it on, all matching hand arithmetic; the AI badge's
  computed styles are BYTE-IDENTICAL to the assignment engine's, measured on
  both; the 404ing linkCard degraded to a plain link with its fallbackLabel
  still visible beside the working card's rich preview; and applying every
  `@media print` rule unconditionally put all 7 sections visible in document
  order with the rail hidden and every callout background transparent. The
  teacher tools surfaced all 7 validation errors at once with Attach disabled,
  and the public confirm named the real counts. Fragment survival was verified
  EMPIRICALLY on this browser against an existing redirect:
  `/coin-balance#ai-policy` landed at `/coins/index.html#ai-policy`. Signed-out
  probes: `/209h`, `/reference/<uuid>` and `/admin/links` all 404.
  `npm run check`: 0 errors, 0 new warnings (36, one FEWER than the 37 at
  HEAD). `npm test`: 457/457.
- **NOT VERIFIED, and it cannot be from here.** (1) **The live Supabase
  project**: the local `.env` is the placeholder project, so 0092 and 0093 have
  never been applied anywhere. Apply them by hand after 0091 and re-run the
  public/private boundary with a real signed-out browser and two real accounts
  before a real syllabus goes out. (2) **A real Drive file through the public
  attachment branch** -- that additionally needs the one-time
  `/admin/drive-connect` consent, as every Drive-touching feature does. (3)
  **Actual paginated print output**: the Browser pane cannot emulate print
  media, so the print stylesheet was verified by applying its own rules
  unconditionally and MEASURING the result, which proves the rules but not the
  page breaks. Hit Ctrl+P on a real reference page once one exists.

