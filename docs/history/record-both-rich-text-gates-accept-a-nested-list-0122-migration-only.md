---
title: "Both rich-text gates accept a nested list (`0122`, migration ONLY)"
date: 2026-08-21
branches: []
migrations: ["0122"]
subsystems: ["Digital notebook", "IDEA Classroom"]
record_order: 101
---

`src/lib/server/rich-text-normalize.ts` flattens a sublist: its items become more
items of the same list, because the stored shape (`ul`/`ol` with one run list per
item) has nowhere to put a level. Its own header says so and calls the fix "its own
bundle": a wider stored shape, a wider SQL gate on both sides, and a renderer that
can nest.

This is the FIRST of those, and it ships alone. No component, no normalizer, no
renderer, no editor.

### Why the order is not negotiable

- A gate that accepts nesting while the normalizer still flattens is **inert**.
  Nothing emits the shape, so nothing changes.
- A normalizer that emits nesting before the gate accepts it **refuses every write**,
  on the notebook and the classroom at once, with a message about the content being
  unreadable.

So the gate goes first, always. The only observable effect of applying `0122` is that
the two gate functions answer `true` to a document nothing can currently produce.

### The stored shape, and the one that was rejected

A list item stays an ARRAY. What widens is what may sit in it:

    item := ( run | list )*
    run  := { text, bold?, italic?, href? }          -- unchanged
    list := { type: 'ul' | 'ol', items: item[] }     -- unchanged

**The obvious candidate was an item that holds BLOCKS** -- ProseMirror's own
`listItem: paragraph block*`, with the item's own text wrapped in a `p`. It was
rejected because it makes every item stored to date a second, LEGACY vocabulary that
can never be retired: `notebook_entry_notes` is append-only with no UPDATE grant at
all, by design, so a stored revision cannot be rewritten into the new shape by any
migration that respects the rest of this schema. The gate and the renderer would both
carry "is this item a run list or a block list?" forever.

The shape above has no legacy branch, because **a run can never carry a `type` key** --
`type` is not in the run whitelist on either side and has not been since `0078`. So
`type` is a total discriminator per element, and every document stored to date is
exactly the case with no nested element in it. Old content is a SUBSET, not a special
case.

**Only `ul`/`ol` may nest, not `p`/`h3`/`h4`.** A `p` inside an item would give an
item's own text two spellings, and two spellings of one thing is what drifts.

**What it costs the renderer, stated now because the bill comes due next bundle:**
the list renderer becomes recursive and has to carry the depth cap down with it; and
a list item still cannot hold two paragraphs, so a multi-paragraph item still arrives
as several items. That last one is a real limit of this shape, accepted deliberately
rather than bought at the price of the permanent legacy vocabulary above.

### The depth caps, and what a "cycle" is in jsonb

12 for a note, 16 for an item body -- the `maxDepth` each normalizer already walks
with. A list at the top of a document is depth 1; a list inside one of its items is
depth 2. The cap is checked ON THE WAY IN, before any recursion, so a document nested
ten thousand deep is refused at level 13 (or 17) and the recursion never goes deeper.

**jsonb holds a TREE and cannot express a reference cycle**, so unbounded self-similar
nesting is the only thing a "cycle" can be here, and the depth check is what answers
it -- with `false`, not with a stack error. Asserted at 500 levels on both sides, and
at the RPC in front of each.

The numbers are wider than they look, deliberately. The normalizer's `maxDepth` counts
ProseMirror TREE levels and one real list level costs two of them
(`list -> listItem -> list`, which is why `listItems` recurses at `depth + 2`), so a
normalizer capped at 12 can emit about six list levels. A gate must accept everything
the normalizer can produce and is under no obligation to be tighter; being tighter is
how a legitimate save starts failing.

### What the file contains

Five `create or replace`s and four new internal helpers, all `immutable`,
`set search_path = ''`, `revoke all ... from public`:

- `_notebook_note_list_len(jsonb, integer)` (new) -- returns the total character count
  under a list, or -1. A LENGTH rather than a boolean, because the note's 20,000
  character cap has to see text inside a sublist; a boolean would let a note of any
  size through the moment it nested.
- `_notebook_note_content_ok(jsonb)` -- the `ul`/`ol` branch delegates.
- `_classroom_run_ok(jsonb)` (new) -- one run, lifted out of `_classroom_runs_ok`
  unchanged, because two callers now need it.
- `_classroom_runs_ok(jsonb)` -- same answer, now a loop over the above.
- `_classroom_list_ok(jsonb, integer)` (new) -- every check `0108` made against a flat
  list, at every level.
- `_classroom_doc_ok(jsonb)` -- the `ul`/`ol` branch delegates.
- `_classroom_item_text(jsonb, integer)` + `_classroom_list_text(jsonb, integer)` (new)
  and `_classroom_doc_text(jsonb)` -- see below.

**`0078`'s `<>` GUARD ON A LIST BLOCK'S `items` IS CARRIED OVER VERBATIM, TRAP AND
ALL.** `jsonb_typeof` is SQL NULL for an absent key, so it does not fire for
`{"type":"ul"}` with no `items`, and `0078` accepted that as an empty list. Tightening
it here would be a migration whose whole job is to accept more quietly refusing
something the deployed gate takes. A `? 'items'` guard reproduces the old answer
exactly. `0108`'s classroom gate does not have the trap and stays strict; nesting is
new on both sides, so it has no old answer to preserve and is strict everywhere.

### Why the text projection is in a gate bundle

`classroom_items.body` is DERIVED from `body_doc` by `_classroom_doc_text`, inside the
write RPCs, after the gate passes -- a caller's `p_body` is ignored when a document is
supplied. So the moment the gate accepts a nested list, a document reaching those RPCs
straight through PostgREST would have its sublists silently dropped from the text
column the stream, the announcement fallback and the export all read. That is this
gate's other half, it is SQL, and it is inert for exactly as long as the widened gate
is. The `ul`/`ol` branch now calls `_classroom_list_text`, which is the same aggregate
`0108` wrote inline -- INCLUDING ITS NULL, which is load-bearing: a list block with no
items aggregates to NULL and the outer `string_agg` skips a NULL line, so such a block
contributes no line rather than a blank one.

An item that interleaves a run AFTER a sublist has no honest line to put that run on,
and no normalizer emits one; rather than invent an ordering, all of an item's own runs
make its line and every sublist line follows. Stated rather than discovered.

The notebook has no SQL text projection, so it needed none of this.

### Measured

`tests/rich-text-nested-lists.test.ts`, against real embedded Postgres with the real
migration files applied unmodified. 22 cases, both chains booted SHORT of `0122` and
the file applied over the top of real seeded rows.

- **Parity, which is the assertion that matters.** Every flat document is put to the
  DEPLOYED gate first and to the widened gate afterwards, on the same database, and
  the two answers must agree case for case. 13 documents on the notebook side and 22
  on the classroom side, of which the accepted ones are produced by running the REAL
  normalizer (`normalizeNoteDoc`, `itemBodyColumns`) over ProseMirror documents built
  through the REAL editor schema in `rich-text-fixtures.ts`. Result: 0 disagreements,
  both sides.
- **Real rows, seeded pre-migration through the real RPCs.** 7 notes and 9 item
  bodies, all still accepted; a student can still edit a pre-migration note (revision
  2 minted) and a teacher a pre-migration body.
- **Every stored body projects to exactly the text it projected before** -- 9 of 9,
  including multi-line ones.
- **Depth.** Accepted at every level 1..12 (notes) and 1..16 (bodies), each verified
  to really nest that far by an independent JS walk; refused at 13/14 and 17/18.
- **Malformed nesting refused**, 9 cases per side plus `h3`/`h4` inside an item on the
  classroom side, each with a positive control using the same builder and a
  legitimate leaf.
- **Nested writes through the real RPCs.** A nested note reads back byte-identical; a
  nested body whose caller LIED about its text comes back as
  `Zero the scale / Tare with the beaker on / Mass the sample`, one line per item at
  every level.
- **Re-application** changes no answer, on either side.

### Mutation proof

Each mutation was confirmed to have REACHED THE DATABASE before any result was read
from it, by dumping the mutated function's `prosrc` out of `pg_proc` and matching a
marker in it. `0122` was restored byte-identically after each
(md5 `ba789a7a0b48aac72820af8f736e693a`) and the file re-run fully green.

| Mutation | Reddened |
| --- | --- |
| Depth caps raised to 100000 | 7 -- both over-cap sweeps, both self-similar refusals, both re-apply checks, and the notebook's flat-vs-nested case. **Neither parity assertion moved.** |
| `v_type not in ('ul','ol')` dropped from both list helpers | 2 -- both malformed-nesting sweeps. Again neither parity assertion. |
| Both gates `return true` | 14, including both parity assertions |
| Both gates `return false` | 17, including both parity assertions, both stored-row counts, both edit paths, both nested writes |
| `0078`'s `<>` on `items` changed to `is distinct from` (a NARROWING) | **2 -- the notebook parity assertion, which named the disagreeing case, and the test that pins the tolerance on purpose** |

The first two are the finding worth keeping: **a gate that widened TOO FAR leaves the
flat corpus completely undisturbed**, so parity can never be the only assertion in a
file like this, and the refusal sweeps can never be dropped as redundant.

### A real defect this found, in `0078` and NOT fixed here

`_notebook_note_run_len` still checks `jsonb_typeof(p_run -> 'text') <> 'string'`,
which is NULL rather than true for an ABSENT key. So a run with no `text` falls
through to `char_length(NULL)`, the helper returns NULL, the NULL propagates through
the running total, and `_notebook_note_content_ok` returns **SQL NULL** -- and every
RPC in front of it asks `if not <gate>`, which does not fire on NULL. **The notebook
stores such a run today.** It is the same `is distinct from` trap `0097` hit and
`0108` fixed on the classroom side, still live on this one.

Not exploitable as an injection: the run key whitelist and the href scheme check both
run before the fall-through, so what gets stored is a run with no text and nothing
else. It is left alone here for the same reason the `items` guard is -- a bundle whose
job is to accept more must not quietly start refusing -- and pinned at BOTH depths so
nesting cannot invent a second answer for it. `0108`'s gate returns a plain `false`
for the same input, so the two contracts genuinely disagree, and the test records
which is which. Fixing it is a migration of its own, and it needs an answer for the
rows already stored before it can be written.

### NOT VERIFIED, and why

- **The live Supabase project.** The local `.env` is the placeholder (`example-ref`).
  Nothing here was applied to a deployed database; every count above is from the
  embedded fixture.
- **Anything on screen.** This bundle ships no client code, so there is nothing for
  the Browser pane to render and no harness drive to report. `svelte-check` is
  unchanged at 0 errors / 36 warnings, which is the correct result for a bundle that
  touches no `.svelte` file and no `src/` file at all.
- **A nested list rendered anywhere.** Nothing can emit one yet. The renderer and the
  normalizer are the next bundle and are untouched by this one.
- **Real stored content.** The parity corpus is real NORMALIZER output over real
  EDITOR-schema documents, which is as close as this repo can get without production
  access. The migration's own `raise notice` block is what checks the real thing: it
  reports `N of N` accepted for both tables at apply time, and **the two numbers must
  be equal.**

**Undoing it:** re-paste the `_notebook_note_content_ok` block from `0078` and the
`_classroom_runs_ok`, `_classroom_doc_ok` and `_classroom_doc_text` blocks from
`0108`, in that order; the four helpers this file adds then have no callers and can be
dropped. Nothing else has to be touched -- there is no data to migrate back and no
schema to rebuild. Do NOT undo it by re-applying `0078` or `0108` whole: both files
also carry RPC definitions that six later migrations have replaced.

