# Rendering untrusted content

_Moved word for word from `CLAUDE.md` on 2026-10-19 (ledger 0415). Typed documents, the three gates, links and images. The entry point and the table of every subsystem file is [`CLAUDE.md`](../../CLAUDE.md)._

### Rendering untrusted content

- **There is no `{@html}` anywhere in the note or item-body path, and there must
  not be.** A typed document (a closed node/mark union) is stored, and the renderer
  walks it into real Svelte elements, which escape their text by construction.
- **THREE GATES, and the first is not a boundary on its own:** a `$lib/server`
  whitelist TRANSLATOR (it BUILDS the result from node types it names, so an
  unknown type cannot survive into it), a SQL CHECK function (the RPCs are granted
  to `authenticated` and reachable straight through PostgREST, so the route is
  skippable), and the renderer.
  - **THE SQL GATE IS `_classroom_doc_ok`, AND ITS NAME LIES.** It is a PURE jsonb
    predicate that names no table, no column and no policy, so ANY column storing
    the closed document shape CALLS it -- `notebook_sessions.guidance_doc` (0123)
    does, and gained nested lists for free because 0122 had already widened it.
    **Never clone it under a subsystem's own prefix.** A second copy of "what may
    a document contain" is what stops matching, and the copy would have been
    frozen at 0108 while the original moved. `_classroom_doc_text` is the same
    deal for the plain-text projection. Note the mismatch in a comment; do NOT
    rename it, because ~90 applied references resolve it BY NAME (the
    `is_teacher()` trap).
- **A STORED LIST ITEM IS `( run | list )*`, AND `type` IS A TOTAL
  DISCRIMINATOR** (0122). A run cannot carry a `type` and never could, so a
  nested list needs no vocabulary of its own and every document stored before it
  is the case with no list in it -- there is no legacy branch to keep. Only
  `ul`/`ol` nest; a `p` inside an item would give an item's own text two
  spellings. **A LIST ITEM CANNOT HOLD TWO PARAGRAPHS, deliberately** -- each
  paragraph becomes its own item -- because the alternative vocabulary (an item
  holding blocks) would make every item stored to date a legacy shape that
  `notebook_entry_notes`, being append-only with no UPDATE grant, could never be
  migrated out of. Do not "fix" that limit.
  - **EVERYTHING THAT WALKS A STORED DOCUMENT RECURSES AND CARRIES THE CAP
    DOWN**: the plain-text projections, both `docToTiptap`s and both renderers.
    A renderer that trusts the gate is a renderer that hangs the day something
    reaches the table another way. The walk itself is ONE shared module
    (`src/lib/rich-text-doc.ts`), parameterized by the cap, for the same reason
    `$lib/server/rich-text-normalize.ts` is shared one direction earlier.
  - **THE TypeScript `docText` IS A MIRROR OF `_classroom_doc_text`, NOT AN
    INDEPENDENT PROJECTION.** The write RPCs derive `classroom_items.body` from
    the document with the SQL function and IGNORE a caller's `p_body`, so any
    difference is a client contradicting the column the stream, the feed and the
    export read. Assert them against each other on the same corpus, corners
    included.
  - **THE NOTEBOOK'S NOTES HOLD A THIRD BLOCK -- A SPREADSHEET GRID (0210) --
    AND THE CLASSROOM'S ITEM BODIES DO NOT.** Two closed shapes, two SQL gates,
    two renderers: `_notebook_note_content_ok` accepts `grid` and
    `_classroom_doc_ok` refuses it, which is the whole of why the widening is
    not shared. **So `richDocText` NEVER GAINS A GRID ARM** -- it is the mirror
    above, and a branch the SQL it mirrors does not have is dead on one side and
    mirroring nothing on the other. `$lib/notebook-notes`'s own `docText`
    substitutes its grids for paragraphs BEFORE delegating, which leaves the
    shared walk exactly the walk it was.
    - **AN EMPTY GRID CONTRIBUTES NO BLOCK TO THAT PROJECTION, and it is the
      floor agreeing with the gate rather than tidiness.** `0210` left `0125`'s
      floor line byte-identical (`v_total > 0`, a sum of LENGTHS with no
      separators), so a note of two empty grids totals zero and is refused.
      Mapped to an empty paragraph instead, `docText` answers `"\n"` and the
      client posts a note the database will not take. Dropping the runless block
      is what makes "some block contributed length" and "the projection is
      non-empty" the same question.
    - **A STUDENT IS TOLD BEFORE THE SAVE, NEVER BY IT.** `GRID_EMPTY_NOTICE` is
      on screen while the grid is empty; the normalizer's refusal is the
      backstop. A grid whose cells hold errors lists the ENGINE'S own sentences
      under it (`GridIssues`), verbatim and with the location as a chip rather
      than a prefix -- a cell six characters wide can only show `#DIV/0!`, and a
      `title` is not discoverable and a phone cannot hover.
    - **THE RUN-LESS-BLOCK HOOK IN `$lib/server/rich-text-normalize.ts` IS
      CALLED `imageBlock` AND ITS NAME IS NARROWER THAN ITS JOB.** Its contract
      is "claim a node that carries no runs at all"; the classroom's image was
      the first such node and the notebook's grid is the second. Note the
      mismatch in a comment, do NOT rename it (that touches the classroom's
      normalizer) and do NOT add a second hook beside it -- two options doing one
      job is what that file exists to have removed. This is the same answer
      `_classroom_doc_ok` gets one rule up.
    - **`GRID_NODE_NAME` LIVES IN `grid-doc.ts`, THE DEPENDENCY-FREE MODULE, AND
      `grid-node.ts` RE-EXPORTS IT.** `docToTiptap` must name the node,
      `$lib/notebook-notes` is imported by the server normalizer, and
      `grid-node.ts` imports `@tiptap/core` -- reading the constant from there
      puts ProseMirror in every server route that touches a note, to read one
      string.
    - **`docToTiptap`'s GRID ARM IS THE ONE THAT LOSES WORK IF IT IS
      FORGOTTEN.** Without it a stored grid falls through to the list arm, the
      editor seeds an empty list, and the next save writes the note without the
      table. Nothing throws and nothing is reported.
- **`safeHref` has ONE implementation** (`src/lib/rich-text.ts`), re-checked at
  RENDER time as well as on write. An unsafe link keeps its TEXT and loses its
  href -- the writing is theirs either way.
- **Editor content is Tiptap/ProseMirror JSON, never HTML.** The schema is what
  constrains a paste; the server translates. Enabling a node type also enables its
  paste rule, so clamp what the schema does not allow on the way in.
- **AN `img src` IS NOT AN `a href`, AND THEY GET DIFFERENT PREDICATES.**
  `safeHref` admits external http/https because a link is navigation a reader
  CHOOSES to follow; a browser fetches an `img` automatically, carrying the
  reader's IP and Referer, before anyone has decided anything. Authored images
  therefore go through `resolveFigureSrc` (`src/lib/classroom/classroom.ts`),
  which is SAME-ORIGIN ONLY: an `attachment:<filename>` alias resolved against
  the rendering item's own attachments through the existing proxy helpers, or an
  absolute path under `FIGURE_STATIC_PREFIXES` -- one exported constant, so the
  set is greppable and testable. Everything else is refused by name, including
  SVG from ANY source (it is a document, not a picture: script, external
  references and handlers), checked by extension AND by stored MIME because
  either can be the only spelling present. **Never widen `safeHref` to cover an
  image, and never route an image through it.**
- **A refused or unresolved image renders its caption plus a visible marker**,
  never a broken `img` and never silence. The refused src must not reach an
  attribute at all -- the element is not rendered, rather than rendered with a
  blanked value.
- **An attachment ALIAS, never a file id**, in anything an author writes: a spec
  is authored before the item exists, must survive a re-upload under a new id,
  and must still mean something in the exported copy under `materials/`.

---
