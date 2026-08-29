---
title: "Classroom bundle 8: rich item bodies + everything attachable at creation (`0108`)"
date: 2026-08-15
branches: []
migrations: ["0108"]
subsystems: ["IDEA Classroom"]
record_order: 43
---

Migration `0108_classroom_rich_body.sql` (apply manually after `0107`). Two
changes that ship together: an item body is an authored RICH DOCUMENT, and every
attachment type is reachable from the composer on create as well as edit.

### Two columns, and why `body` stays

`body_doc` (jsonb) is the document; **`body` (text) stays exactly where it was,
as its PLAIN-TEXT PROJECTION**, because it has real readers that have nothing to
do with rendering: `_classroom_check_item_fields` requires an announcement to
have one and caps every body at 20,000 characters, an untitled announcement takes
its headline from the body's first line (`itemTitle`), and the home feed reads
text rather than a tree. Replacing the column would have meant rewriting all of
that at once.

It is also what makes this **safe to deploy in either order**. `ITEM_SELECT`
does NOT name the new column — the twice-documented rule that PostgREST refuses
the WHOLE select for one unknown column, which would blank every classroom read
between 0107 and 0108. `ITEM_SELECT_RICH` + `selectItemsWithDoc` are a
widen-then-degrade pair (the `selectSubmissions` shape) used by the four load
sites; degrading costs the FORMATTING of that read, never the body, because
`itemBodyDoc` converts the plain text. The save route degrades the same way,
retrying without `p_body_doc` on a `PGRST202` alone.

**THE TWO CANNOT DISAGREE, and that is enforced in SQL rather than trusted from
a caller:** given a document, `body` is derived from it by `_classroom_doc_text`
and whatever `p_body` said is IGNORED; given none, the document is derived from
the text. There is no payload in which the rich version says one thing and the
text version another (test-pinned by sending a deliberate lie).

### Three gates, the 0078 pattern applied to a second surface

1. **`src/lib/server/classroom-doc.ts`** — the normalizer, a whitelist
   TRANSLATOR that BUILDS the closed shape from the node types it names, so a
   type it does not name cannot appear in the output. Runs in
   `/api/classroom/item`, under `$lib/server`.
2. **`_classroom_doc_ok`** — the boundary. Both RPCs are granted to
   `authenticated` and reachable straight through PostgREST, so the route is
   skippable; this refuses anything outside the closed shape (unknown block,
   unknown KEY, non-text run, unsafe href). No recursion and no depth limit
   needed, which is the quiet advantage of validating the STORED shape rather
   than the editor's.
3. **`ItemBody.svelte`** — walks the document into real Svelte elements,
   re-checking every href. **No `{@html}` anywhere in the item-body path**
   (asserted by test, matching the directive rather than the string, since
   several files discuss it in comments).

**`safeHref` and `TiptapNode` moved to `src/lib/rich-text.ts`** and are
re-exported by `notebook-notes.ts`, so the one security-relevant decision in the
whole rich-text path has ONE implementation. The two DOCUMENT shapes stay
separate on purpose: widening one contract must never silently widen the other.

**A REAL BUG THE TESTS FOUND, and it is the repo's own documented trap:** the
gate's type checks were written `jsonb_typeof(x) <> 'string'`, which is NULL —
not true — for an ABSENT key, so the guard fell straight through and a run
carrying no `text` key at all was ACCEPTED. Every check is `is distinct from`
now. Same trap 0097 hit.

### The editor

`RichTextEditor.svelte` — Tiptap 3, the dependency the notebook already uses; no
second editor library. StarterKit with everything out of scope off, leaving
bold, italic, both list kinds, headings and links. **Headings are levels 3 and 4
only**: the page already owns h1 (the item's title) and h2 (the section label),
the same rule the reference renderer applies. 15rem tall, `resize: vertical`.

**PASTE FIDELITY IS THE SCHEMA'S DOING** — ProseMirror parses the clipboard's
`text/html` against its own schema, so a list stays a list and a `<script>` has
nowhere to go. One thing that needed help, found in the browser: ProseMirror
builds its parse rules FROM the enabled levels, so a pasted `<h1>` matched no
heading rule and silently became a PARAGRAPH — the structure this feature exists
to preserve, lost before the server clamp ever saw it. `transformPastedHTML`
maps h1/h2 -> h3 and h5/h6 -> h4 on the incoming string; the schema is still what
decides what can exist.

### Everything attachable at creation

Files, instructor-only files, a **deck** and an **assignment spec** are all
staged in the composer and applied after the create/update call hands back an
id. A deck and a spec were previously reachable only by saving an item and going
to find it again, with nothing in the composer saying either was possible.
`DeckStager.svelte` is the pre-save half (DeckPanel stays as the item page's
surface, which needs an item that exists and one section to link into);
`SpecImport` gained a staging mode (`itemId` null -> `onstage`) so the validation
and error list are literally the same code in both places.

**THE DECK AND SPEC HALVES OF THIS ARE SUPERSEDED AND GONE**, and `DeckStager`
with them -- they put a SECOND deck panel and a SECOND spec panel on an item
page that was already showing both, which is worse than the discoverability
problem they were solving. See "Four item-page defects" below. Files and
instructor-only files still stage exactly as described here.

**A STAGED THING THAT FAILS IS KEPT.** Only what landed is cleared, the report
names the rest, and saving again retries it. **A retry after a partial create
UPDATES the item that already exists** (`createdItemId`) — without that, following
the message's own "save again" produced a DUPLICATE item, which is exactly what
it did before this existed (found in the browser: one retry, two items).

### Verified

- **`tests/classroom-item-doc.test.ts` (39, pure)**: the sanitizer against
  script nodes, event-handler attrs, 8 unsafe href shapes, unknown marks, absurd
  nesting; paste fidelity (both list kinds, nested lists flattened, a table's
  words kept, heading clamping); idempotence over its own output; the
  plain-text migration losing not one character; and the select degrade.
  Mutation-checked: dropping `safeHref` reddens 9, treating a stored doc as
  editor output reddens 1, a degrade that never retries reddens 1.
- **`tests/classroom-rich-body.test.ts` (35, real embedded Postgres)**: the
  two-halves shape — real pre-0108 items authored through the REAL pre-0108 RPC,
  then 0108 applied over the top — for the backfill; the SQL gate with RLS out of
  the way AND through the real RPCs; the columns agreeing in both directions;
  0104's rule intact **plus a formatting-only edit now stamping `edited_at`**;
  duplicate carrying the document; re-applying twice; one signature each; spec
  parity at creation; the deck slot authorizing on a fresh item. **Mutation-checked
  four ways** (13 / 19 / exactly-1 / exactly-1), migration restored byte-identical
  (md5 `a69993e7ca9a23da1cf4a1f905c15e94`) each time.
- `npm run check`: 0 errors, 36 warnings (the same 36 as HEAD). `npm test`:
  **893/893 across 38 files**.
- **Browser-verified** in `/dev/classroom`, whose fake transports call the REAL
  sanitizer over `/dev/classroom/normalize` (the `/dev/notebook/normalize`
  convention), so what the harness stores is what production would store: a real
  `text/html` paste kept both lists, bold and the safe link while the script tag,
  the `onclick` and the `javascript:` href all vanished, and h1/h2/h5 clamped to
  h3/h3/h4; one save attached a rich body **plus a spec plus a deck** with the
  transport log showing `createItem` FIRST and all three attachments against the
  id it returned; the same body rendered **identically on the teacher stream, the
  student stream and view-as** (structure, bold, link rel all equal) and a legacy
  plain-text item rendered as real paragraphs; a failed deck kept its staged zip
  and the retry uploaded the SAME file to the SAME item (1 create + 1 update, no
  duplicate); the entry-page question held the file and the answer rode the next
  save; editor 240px and `resize: vertical`; 375/375 with 44px toolbar targets;
  and **zero window errors across the whole pass**. `/api/classroom/item` answers
  401 signed out on both modes.
- **NOT verified: the live Supabase project.** The local `.env` is the
  placeholder project, so `0108` has never been applied anywhere. **Apply it by
  hand after `0107` BEFORE deploying** (the client names `p_body_doc`; the route
  degrades to plain text if you do it the other way round, which loses formatting
  but nothing else). Then check that an item authored before today still reads
  the way it did. **Also not verified: screenshots** — the Browser pane does not
  composite, so every visual claim above is a measured DOM or computed-style read.

