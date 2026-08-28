---
title: "The student notebook's availability check (a stale embed, code-only fix)"
date: 2026-08-14
branches: []
migrations: []
subsystems: ["Digital notebook"]
record_order: 52
---

## The student notebook's availability check (a stale embed, code-only fix)

`/notebook` reported "Notebook is not available yet -- the notebook tables are
not in place on this project" against the LIVE database, where they plainly
were: `/notebook/review` read the same schema correctly at the same moment.
**No migration; no schema change. This is a load and a fail-soft-shape fix.**

### The cause: a select string asserts a schema shape, and nothing type-checks it

The load's entry select carried `notebook_sessions ( session_label, ... )`.
PostgREST resolves an embed against the FOREIGN KEYS in its schema cache, and
that one had been resolving through the composite key `notebook_entries` held
to `notebook_sessions (id, section_id)`. **`0098` repointed that key at
`notebook_session_postings (session_id, section_id)`, which left NO key between
`notebook_entries` and `notebook_sessions` at all** -- confirmed by enumerating
`pg_constraint` on a real chain-through-0099 database: the five keys on that
table reach `notebook_folders`, `auth.users` (x2), `classroom_sections` and
`notebook_session_postings`, and none of them reaches `notebook_sessions`.

So the embed answered PGRST200, which fails the WHOLE select -- and the embed
sat in the BASE rung, so all four rungs of the widen-then-degrade chain failed
and `configured` (derived from the last of them) came back false. The card it
drives then blamed the base table. **The reported symptom and the cause were
two different tables.**

- **The review console was never affected**: it reads through
  `notebook_get_section_grid`, an RPC, and its own plain selects on
  `notebook_sessions` / `notebook_session_postings`. That divergence is the
  clue that this was an embed problem, not a table one.
- **A SECOND site had the same rot, found by grep and fixed with it:**
  `/api/notebook/add-photo` selected `notebook_sessions(label)` off an entry --
  unresolvable for the same reason, and naming a column (`label`) that has been
  `session_label` since 0069. Best-effort, so it only ever degraded the Drive
  filename silently. It is two reads now.

### The fix: read the label separately, and stop hiding the page on one probe

- **`src/lib/notebook-selects.ts`** is the one place the rungs are written down,
  each documented with what it adds. It is a `$lib` module rather than a local
  const so `tests/notebook-page-load.test.ts` can hold every embed named in it
  against the real catalog. (It cannot live in `+page.server.ts`: SvelteKit
  rejects unexpected exports from a `+page.server` file.)
- **The check-in label is its own read** (`notebook_sessions` by id, which any
  signed-in user may read under 0069's `using (true)`), mapped onto the entries
  afterwards. Deliberately NOT a nested embed through the posting table, which
  would work today and is exactly the kind of indirection that broke.
- **`configured` is decided on the NARROWEST possible probe** -- 0069's scalar
  columns, no embedded resource of any kind -- so it can only ever mean what its
  card claims. Two rungs were added below the old base (`photos`, then scalars)
  and every capability now reports itself: `photosReady`, `notesReady`,
  `foldersReady`, `pinsReady`, and a new `sessionsReady` covering both check-in
  reads (the per-entry labels and the class quick-picks, which used to swallow
  their error into an empty list). **Each starts FALSE and is turned on by a
  rung that actually included it succeeding**, so a capability can never be
  reported present by default. `NotebookView` renders a one-line note per lost
  capability; the two new ones sit OUTSIDE the compose form so a read-only
  view-as preview shows them too.
- Demonstrated rather than argued: with the granular shape, a stale embed on one
  rung costs that rung's capability and the page still loads (mutation B below).

### Verified

- **`tests/notebook-page-load.test.ts` (11 tests)** drives the REAL `load`
  against a REAL Postgres carrying 0069 through 0099, and separately against one
  with the notebook's dependencies but NOT ONE notebook migration -- genuinely
  missing tables, not a simulated failure. Full chain: configured with all five
  capabilities, a real check-in label on a linked entry (and null on a free
  one), photos, notes, folders, the pin stamp, the activity rows, and the
  quick-picks from the class the student is really enrolled in. Bare chain:
  `configured: false`, every capability off, every list empty, no throw. A
  classmate reads none of it -- a guard on the shim, not a claim about this fix.
- **`tests/db/postgrest-shim.ts` is why this suite can see what the others
  cannot.** It resolves an embedded resource by looking for a real FK in the
  real catalog and answers PGRST200 when there is none, which is what PostgREST
  does. **Every existing suite stayed green through this bug and had to**: they
  speak SQL, and SQL does not need a foreign key to join two tables;
  svelte-check cannot see inside a select string either. A shim that simply
  turned every embed into a JOIN would have proved nothing, so the FK lookup is
  the strict part and everything else THROWS rather than guessing. It returns
  one `json_build_object` per row, so a timestamptz arrives as an ISO STRING as
  it does over the wire -- not a Date the driver parsed.
- **The schema assertion needs no load at all** and is the one to keep: every
  table embedded anywhere in the shipped select strings must have a real
  relationship to its parent. It is pinned against a parser that returns
  nothing, and sits beside the two facts the fix rests on (no key
  entries->sessions; a real key postings->sessions).
- **MUTATION-CHECKED BOTH WAYS.** Reproducing the shipped bug exactly (the embed
  back on every rung) reddens **7** tests including the headline "reports the
  notebook available". Putting a stale embed on ONE rung reddens **3** -- and
  notably NOT the "returns the entries" or "offers the check-ins" tests, because
  under the granular shape the page still loads. `notebook-selects.ts` restored
  byte-identical (md5-checked) and re-verified green each time.
- `npm run check`: 0 errors, 36 warnings (the same 36 as HEAD). `npm test`:
  **678/678 across 30 files** (was 642/28 at 0099; the rest is other work
  landed since). The full notebook suite alone: 304/304 across 14 files.
- **Rendered** in `/dev/notebook` (two new toggles, `photos readable` and
  `check-ins readable`, which strip the DATA as well as flipping the flag so the
  harness never shows a banner over content the page could not have): default
  state renders neither banner and no availability card; with both off, both
  banners render with their real copy and "Add an entry" is still there -- the
  page working, minus two features.
- **NOT verified: the live Supabase project, and no screenshots.** No browser
  automation was available in this session, so the render checks above are SSR
  HTML reads, not eyeballs. The live confirmation is to load `/notebook` as a
  real signed-in student and see the feed instead of the card.

