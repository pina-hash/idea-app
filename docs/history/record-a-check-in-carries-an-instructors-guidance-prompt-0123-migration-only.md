---
title: "A check-in carries an instructor's guidance prompt (`0123`, migration ONLY)"
date: 2026-08-21
branches: []
migrations: ["0123"]
subsystems: ["Digital notebook"]
record_order: 102
---

## A check-in carries an instructor's guidance prompt (`0123`, migration ONLY)

A notebook check-in had a label and a date and nothing else an instructor could
write in. What to photograph and what to write about it lived in the label, in the
classroom item beside it, or on the whiteboard. `notebook_sessions` gains
`guidance_doc`, and one RPC writes it.

This ships **no client code at all**. No composer field, no renderer, no route.
That is the deploy ordering, not an omission: the column and its write land first,
and the surfaces that author and render a prompt follow in their own bundle.

### Why storage-first, like a gate

`0122`'s argument, applied to a column instead of a predicate. A column nothing
writes is **inert** -- applying this file changes nothing anybody can see. A client
that names a column the database does not have is a PostgREST error on **every
read of the table**, not just on the new feature. The asymmetry is the whole
reason for the order.

### The classroom rich-text contract, called and not cloned

`guidance_doc` is the same closed shape `classroom_items.body_doc` carries: an
array of `p`/`h3`/`h4`/`ul`/`ol` blocks over flat `{text, bold, italic, href}`
runs, validated by **`public._classroom_doc_ok`** and measured by
**`public._classroom_doc_text`**, capped at the classroom body's own 20,000
characters.

**The name is wrong and the function is right.** `_classroom_doc_ok` reads as
classroom-only and is not: it is a pure jsonb predicate that names no table, no
column and no policy. It is called rather than copied, and the mismatch is noted
in a comment rather than fixed, because renaming a function that ~90 applied
references resolve BY NAME is precisely how the `is_teacher()` trap was made. A
comment is the cheaper of the two.

The payoff is measurable in this bundle rather than promised for a later one:
`0122` widened that predicate to accept nested lists, and the notebook's new
column accepts one **without a line of SQL about nesting anywhere in `0123`**. A
clone frozen at `0108` would have refused it, and every other assertion in the
test file would still have passed -- which is why the nested case is in there.

### Why a narrow write, and not a parameter on the upsert

`notebook_admin_upsert_session` is a **whole-row replace that also reconciles the
section list**: it adds the postings that are missing and unposts the ones no
longer listed, detaching those students' entries on the way out. Every parameter
is load-bearing on every call. A caller who wanted to change only the guidance
would have to restate the unit, the date, the label AND every section -- and
getting the last of those wrong, by passing null, takes the check-in out of those
classes.

**A parameter whose omission can unpost a class is not a field, it is a hazard.**
So the guidance gets `notebook_set_session_guidance(p_session_id, p_guidance_doc)`,
which sets exactly one column and can move nothing else in either direction.

Null clears, and only through that RPC. SQL null, JSON `null` and `[]` all store
SQL NULL: "a prompt with no blocks in it" is a state no reader can render
differently from "no prompt", and keeping both shapes would make every future
reader check for two. Clearing needs no arming step -- the guidance is an
instruction, not a record.

### Authored once, and no revision history

The column is on `notebook_sessions`, **not** on `notebook_session_postings`. One
check-in posted to three classes is one authored thing with three postings
(`0098`), and the posting carries no state of its own -- the moment it could, the
three copies could drift and a teacher would be editing one sentence three times.

No revision chain either, and this is a decision rather than a deferral.
`classroom_content_revisions` (`0110`) exists because an item body is work a
teacher can lose. Editing a guidance prompt is an instructor **correcting an
instruction**: what every class should see afterwards is the corrected sentence,
everywhere. A superseding-row chain would fork it into "current" and "what period
2 saw on Tuesday", and no surface wants the second one.

The write bar is `_notebook_manages_session` -- manage **every** section the
check-in runs in, the same bar editing its label or date already carries, for the
same reason.

### What the file contains

One `add column if not exists`, one comment, one `create or replace function`
(security definer, `search_path = ''`, revoked from public, granted to
`authenticated`, manager check inside the body), and a `raise notice` count. No
backfill: null is the existing behaviour and every check-in that exists has it.
**No table CHECK constraint**, matching `classroom_items.body_doc` -- the table has
zero client write grants, so the RPC is the only door, and pinning an applied
table to one version of a predicate that has already had to widen once buys
nothing.

### Verification

`tests/notebook-session-guidance.test.ts`, 26 assertions against the real embedded
Postgres over a 36-file chain (the notebook's own chain unioned with the classroom
rich-text chain through `0122`, because the shared gate has to be reachable).

The valid fixture is **built by the real producer**: a document the editor schema
says the editor could hold, put through `normalizeItemDoc`. The nested fixture is
hand-written and says so in the file -- nothing can emit one yet, which is exactly
`0122`'s position, and it is coverage of the SQL predicate only.

Both directions, with counts:

- **A manager writes and reads back** byte for byte; a student in the class reads
  the same document through RLS. One check-in in three classes: 3 postings, 1
  stored row, the same prompt on all three.
- **Refusals, with the row unmoved after each:** a student, a teacher who manages
  none of it, and (separately) each of the two teachers who manage only HALF of a
  two-class check-in -- against a positive control where the admin, who manages
  both, lands the identical call. Signed out is `permission denied` at the grant.
- **14 malformed documents refused**, each followed by a re-read proving the stored
  prompt did not move, including the `is distinct from` trap (a run carrying no
  `text` key), a `javascript:` href, an href with an embedded control character,
  unknown keys on both a block and a run, and a `bold` that is not `true`.
- **The cap at both edges:** 20,000 characters lands, 20,001 is refused.
- **The narrow write:** every `notebook_sessions` row and every
  `notebook_session_postings` row captured whole before and after a guidance write.
  Postings byte-identical; exactly 1 row changed; on that row every column but
  `guidance_doc` byte-identical.
- **The upsert did not gain a parameter** (`pg_proc`: 5 args, named), and an edit
  through it leaves the prompt where it was.
- **One overload** of the new function, `prosecdef` true, `search_path=""`,
  not executable by `public` or `anon`, executable by `authenticated`.
- **Re-application** is ordinary and does not clobber a prompt already authored.

### Mutation proof

`0123` restored byte-identically after each (md5
`70ceb9a70fb9b2d7d957f694e6056190`, `md5sum -c` clean) and the file re-run fully
green at 26/26.

| Mutation (permissive direction) | Reddened |
| --- | --- |
| `if not _notebook_manages_session(...)` -> `if false` | **4** -- all four authorization assertions, and nothing else |
| `if not _classroom_doc_ok(v_doc)` -> `if false` | **1**, then **2** after the fix below |
| `where id = p_session_id` -> `where true` on the UPDATE | **4** -- the round-trip, the half-manager positive control, all three clears, and the narrow-write snapshot |

Each mutation reaching the database is what the redness proves: the harness reads
the migration files off disk per database, so an unapplied edit could not move a
single assertion.

**The second mutation found a defect in the test, not in the migration.** The
assertion "the predicate it calls is the classroom one" was
`expect(prosrc).toContain('_classroom_doc_ok')`, and it stayed **green** with the
call deleted -- because the function's own header comment names the predicate in
prose. `prosrc` is now stripped of `--` lines before the check, which asserts the
three real call sites; re-mutated, it bites.

### NOT VERIFIED, and why

- **The live Supabase project.** The local `.env` is the placeholder
  (`example-ref`). Nothing here was applied to a deployed database; every count
  above is from the embedded fixture.
- **Anything on screen.** This bundle ships no `.svelte` file and no `src/` file at
  all, so there is nothing for the Browser pane to render and no harness to drive.
  `svelte-check` is unchanged at 0 errors / 36 warnings, which is the correct
  result for that.
- **A guidance prompt authored or rendered anywhere.** Nothing writes or reads the
  column yet; that is the next bundle.
- **No `classroom-updates.json` entry**, deliberately: nothing a class sees changes
  until the surfaces land. The entry belongs to the bundle that puts the prompt on
  screen.

**Undoing it:** two statements, in this order --
`drop function if exists public.notebook_set_session_guidance(uuid, jsonb);` then
`alter table public.notebook_sessions drop column if exists guidance_doc;`. Nothing
else is touched: no other object depends on either, there is no data to migrate
back, and no schema to rebuild. The only thing lost is whatever guidance had been
authored, which nothing renders yet. Drop the function FIRST: a plpgsql body
records no dependency on the column, so dropping the column first succeeds and
leaves an RPC that raises at runtime instead of failing at drop time.

---

