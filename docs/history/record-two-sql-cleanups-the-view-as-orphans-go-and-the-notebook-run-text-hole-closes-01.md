---
title: "Two SQL cleanups: the view-as orphans go, and the notebook run-text hole closes (`0124`, `0125`, SQL ONLY)"
date: 2026-08-21
branches: []
migrations: ["0124", "0125"]
subsystems: ["Digital notebook", "IDEA Classroom"]
record_order: 106
---

Two unrelated migrations, no client code, shipped in one bundle because both are
schema-only and neither touches the other's subsystem. `0124` drops five
functions nothing calls; `0125` closes a gate that has been accepting a
malformed run since 0078.

### 0124: the orphans f734e7c left behind

f734e7c deleted the classroom class and item previews under `/classroom/view-as`
and deliberately shipped **no SQL**, because a dropped function under a
still-deployed route is a 500 and routes and schema deploy separately. The
functions were left applied and unreferenced with the drop named as a later
migration. This is it.

**Dropped, callers before callee:** `classroom_view_as_section(text, uuid)`,
`classroom_view_as_item(text, uuid, uuid)`,
`classroom_view_as_can_read_attachment(text, uuid)`,
`classroom_view_as_sections(text)`, and the private `_classroom_item_json(uuid)`
the first two were the only callers of. That last one was checked rather than
assumed: every migration that ever named it (0085 twice, 0109 twice, 0113 once)
calls it only from those two.

**Kept, each for a reason:** `classroom_view_as_students()` (the picker, which
is the one door to the surviving notebook preview), `_classroom_view_as_guard`
(the admin + real-enrollment check both it and `notebook_view_as_notebook` run),
`_classroom_item_live` (0109's publish predicate, sixteen unrelated callers).

**THE LOAD-BEARING DECISION: the migration carries its own caller guard.**
Postgres records a dependency from a policy, a view, a default or an index to a
function -- `drop function` without CASCADE already refuses on those -- but it
records **nothing** from one plpgsql function to another, because a plpgsql body
is an opaque string until it runs. So dropping a helper out from under a caller
succeeds quietly at apply time and breaks that caller at its next invocation, in
production. 0124 therefore sweeps `pg_proc.prosrc` of every surviving function
for `<name>(` and raises with the names and a count before a single drop runs.
The `(` matters twice: it is what makes a reference a CALL rather than a
mention, and it is what keeps `classroom_view_as_section` from matching inside
`classroom_view_as_sections`, which contains it as a prefix -- a plain substring
sweep reports each as calling the other and the file could never apply at all.

### 0125: `_notebook_note_run_len` has been accepting a text-less run

0122 found this and **deliberately did not fix it**, which was right: that
bundle's job was to accept MORE, and a widening migration that quietly starts
refusing something the deployed gate takes is the exact failure mode it existed
to guard against. It pinned the divergence at both depths and named the fix as a
migration of its own. The thing 0122 could not answer -- what to do about rows
already stored -- is what this file answers.

**The chain, which is the whole point.** `_notebook_note_run_len` (0078) asks
`jsonb_typeof(p_run -> 'text') <> 'string'`. For an ABSENT key that is
`NULL <> 'string'`, which is NULL, so the guard does not fire; control falls
through to `char_length(NULL)` and the function returns SQL NULL. Then:

1. every caller asks `if v_len < 0`, and `NULL < 0` is NULL, so nobody refuses;
2. `v_total := v_total + v_len` poisons the running total at every level,
   including back up out of a sublist;
3. `_notebook_note_content_ok` ends `return v_total > 0 and ...`, so the GATE
   returns NULL rather than false;
4. every write RPC asks `if not <gate> then raise`, and `not NULL` is NULL.

**So the fall-through does not skip a check, it ACCEPTS THE WRITE.** That last
step is asserted directly rather than argued: a note with a text-less run was
written through the real `notebook_create_note_entry` and read back out of
`notebook_entry_notes`. 0108's classroom gate, written `is distinct from`
throughout, refuses the identical input.

**THE NARROWING REFUSES RATHER THAN TIGHTENS.** A gate that starts saying no to
something already in the table is silent -- every stored row keeps rendering,
and only the next save fails, mid-edit, for a student who could save that note
yesterday. So 0125 takes the count itself, at apply time, against the real
table, and raises with the number instead of applying. Whether to strand that
work is a decision a person makes with the count in front of them, not a side
effect of pasting a file.

**How the count is taken, and why it is not a structural search.** The probe is
`_notebook_note_content_ok(content) IS NULL` under the DEPLOYED function. A
second hand-written walk for "a run with no text key at any depth" would be a
second copy of "what a run is" -- the thing that quietly stops matching -- and
it answers a slightly different question. What matters is not whether a document
contains such a run but whether it **changes answer**, and NULL is reachable
through exactly one path: `v_total` starts at 0 and is only added to, so it can
only be NULL if some `v_len` was, and only this fall-through produces one. A
`text` key holding JSON `null` is `jsonb_typeof` `null`, which IS distinct from
`string`, so it already returns -1 and is correctly not counted. A document
refused for some other reason answers false, not NULL, and its answer does not
move.

**Two functions replaced, and the second is defence in depth.**
`_notebook_note_run_len` gets the one-character fix. `_notebook_note_content_ok`
gets `return v_total is not null and ...`, which is inert once the first lands
and is there so that reopening the run guard one level down still fails closed.
Both were extracted from their source files mechanically (0078 lines 120-164,
0122 lines 198-279) and diffed, so exactly one line differs in each -- a
plausible reconstruction from memory is how error semantics quietly change.

**NOT fixed, and stated rather than left silent:** 0078's other `<>` trap, on a
list block with no `items` key, which is ACCEPTED as an empty list. 0122
preserved it deliberately and so does 0125. It is a separate narrowing with its
own answer owed about rows already stored, and folding it in would make this
file refuse content nobody has counted. It is asserted as a control in both
directions: the notebook still says true, the classroom still says false.

### Verification

`npx svelte-check`: **0 errors, 36 warnings** -- the baseline. It reported 9
errors first, all stale generated route types left by the previous bundle
(`session-guidance`, `check-in-guidance`, `home-order`, `checkInGuidanceReady`);
`npx svelte-kit sync` cleared them. Pre-existing, not this bundle's.

`npx vitest run --no-file-parallelism`: **82 files, 1997 passing** (80/1977
before the two new files).

Two new test files, both against real embedded Postgres with the real migration
files applied unmodified.

`tests/view-as-orphans-dropped.test.ts` (8 cases, chain through 0113 so the
functions dropped are the ones 0113 defined last):

* the guard BITES -- a plpgsql function calling `_classroom_item_json` is
  created, 0124 raises `0124 REFUSED: 1 surviving function(s)...`, **and all
  five are still present afterwards**, because a guard that fires after the
  drops have run is not a guard;
* it applies cleanly once that caller is gone, which is also the assertion that
  the prefix collision does not stop it;
* all five absent, **all three kept present on the same catalog read**;
* no surviving function's `prosrc` calls any of the five, with the identical
  sweep over the three kept returning a non-empty result as its positive
  control;
* it re-applies;
* a static sweep of every `.ts`/`.js`/`.svelte` under `src/` finds none of the
  five as a call or an RPC target, with the same matcher finding
  `classroom_view_as_students` and `notebook_view_as_notebook` as its positive
  control, and a file-count assertion so a sweep that generated nothing cannot
  pass. `supabase/migrations` is excluded on purpose: it is an immutable applied
  record, so 0083, 0085, 0109 and 0113 necessarily still contain the
  definitions, and a sweep reddening on those could only be satisfied by
  rewriting history. The database side of that question is the catalog
  assertion.

`tests/notebook-run-text-parity.test.ts` (12 cases):

* **the hole, as deployed**: the gate returns `toBeNull()` -- not
  `toBe(false)` -- flat and five levels down, and a note carrying one is STORED
  through the real RPC;
* 0125 then **refuses** against that database, `1 of N`, and leaves the gate
  untouched;
* with the row cleared it applies, and **the application is proved before any
  result is read from it**: exactly one arity for each function (the signature
  trap) and each body's own `prosrc` matched for the changed term;
* refused at depth 1 and depth 5, with the identical shapes carrying a `text`
  key accepted at both depths as the positive control, and again through the
  real write RPC in both directions;
* every already-stored document answers exactly as the deployed gate did,
  compared case for case over the recorded flat corpus plus corners, with a
  control that the corpus spans both true and false so "nothing moved" is not a
  claim about half the function;
* the list-block-with-no-items tolerance is intact;
* **defence in depth, proved by opening the layers one at a time**: with
  `_notebook_note_run_len` mutated back to 0078's `<>` (confirmed landed via
  `prosrc`, and confirmed genuinely open by reading a bare NULL out of it) the
  gate still answers false; with `_notebook_note_content_ok` opened as well it
  goes back to NULL. Restored by re-applying the real file, with the
  restoration itself confirmed rather than assumed.

Parity is asserted **across two databases**, deliberately: the two gates sit on
different migration chains, and merging them into one chain to make the
comparison convenient would be asserting parity on a schema nobody deploys.

### Mutation proof

Each mutation was confirmed to have reached its target before any result was
read from it, and each file restored byte-identically (`0124`
`b6a1889e2aba26279af6af87f7c6ddd3`, `0125`
`93e8e968cf1f2194aa3f371245903c2d`), with the suite re-run green after.

| # | mutation | reddened |
|---|---|---|
| M1 | 0125's refusal disarmed (`if false then raise`) | 1 |
| M2 | 0125's run guard reverted to `<>` | 1 (the landed-check, which aborts the rest) |
| M3 | 0125's `v_total is not null` backstop reverted | 1 (the landed-check) |
| M4 | 0124's caller guard disarmed | 2 |
| M5 | `view-as/+page.server.ts` re-points its RPC at a dropped function | 2 |

**M2 and M3 are the interesting pair, and the number is not the finding.** Each
reddens only the "prove it landed" assertion, because that check aborts the
suite before the gate is ever asked -- which is it doing its job, and is why the
layering claim is made by the in-test mutation instead, where both layers can be
opened independently against a database that has already applied the real file.
**M5 reddened two, and the second was the positive control**: pointing the
picker's RPC at `classroom_view_as_sections` removes the only
`classroom_view_as_students` call in `src/`, so the control fails alongside the
finding. That is the control working, not a flaw.

### Edits to existing tests

`tests/classroom-security.test.ts`: the `view_as` case list trimmed to the one
surviving reader; the three cases driving dropped functions replaced by one on
the picker that keeps what they were really asserting (`e.active`, not `e`),
with both a positive control before the absence and a second student proving the
deactivation narrowed the list rather than emptying it; the four dropped
signatures removed from the anon-boundary list, because
`has_function_privilege` RAISES on a signature that does not exist and a stale
entry would one day fail as "function does not exist" rather than as a privilege
finding. Draft integrity is not left uncovered: it is asserted against the
POLICY in "drafts are invisible to the student, visible to the section teacher",
which never went through an impersonation RPC.

**One edit beyond the brief, and it is reported rather than folded in.** The
"read-only is structural" case carried `expect(rows.length).toBeGreaterThanOrEqual(5)`
as its positive control. That number was a roster in disguise: it holds only on
this file's chain (which stops at 0085, where five functions carry the prefix)
and is false of the deployed schema, where four are dropped and one is left. A
control that is only true at one point in the chain says nothing about the rule
it guards, so it is now `expect(rows.map(r => r.name)).toContain('classroom_view_as_students')`
-- the surviving reader must be in the rows the sweep found, at every point in
the chain. The volatility assertion, which is the actual guarantee, is
unchanged.

`tests/classroom-attachment-route.test.ts`: the RPC shim's allow-list drops
`classroom_view_as_can_read_attachment` and becomes an equality on the single
remaining call, so a route that grew an identity RPC back fails by name.

### NOT verified, and why

* **The live Supabase project.** The local `.env` is the placeholder
  (`example-ref`). **The survey count reported here is a count over seeded
  fixtures, not over production**, and this session could not query the
  deployed catalog. What protects production is that 0125 takes the same count
  itself, at apply time, against the real table, and refuses. **If it raises on
  apply, that is the migration working: stop, and bring the number back.**
* **Anything in a browser.** Neither migration ships client code and neither
  changes a rendered surface, so there was nothing to drive.
* **`npm run build`.** Unrelated to schema-only changes, and it dies on Windows
  in the Vercel adapter regardless (pre-existing, machine-level).
* **No entry in `classroom-updates.json`.** Nothing here is student-visible: the
  dropped functions had no caller, and no editor or normalizer can emit a
  text-less run, so the narrowing refuses only input that never reaches the RPC
  from the app.

---

