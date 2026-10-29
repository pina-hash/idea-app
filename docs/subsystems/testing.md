# Testing

_Moved word for word from `CLAUDE.md` on 2026-10-19 (ledger 0415). The suite, the embedded Postgres fixture, and how to write a test that can fail. The entry point and the table of every subsystem file is [`CLAUDE.md`](../../CLAUDE.md)._

## Testing

`npm test` (config `vitest.config.ts`, specs in `tests/`; `npm test` runs
`tools/run-tests.mjs`, which passes `--no-file-parallelism` to vitest, see the
parallelism trap under Machine and toolchain).
This is the **only** automated suite, and it is deliberately narrow.

- **`tests/claude-md.test.ts` IS THE ONE TEST OVER A DOCUMENT, and it is here
  for the reason the rule below gives.** A stale `CLAUDE.md` fails SILENTLY --
  it renders, it reads as authoritative, and the only symptom is a session
  acting on a sentence that stopped being true. It runs
  `tools/claude-md-check.mjs`, which is the same thing `node
  tools/claude-md-check.mjs` prints. It checks NAMES against the tree and
  nothing else: never that prose is true, never a measurement. See "Keeping the
  documentation current" for the ownership split it enforces the checkable half
  of.
- **Automated tests are the exception, not the default.** New work is verified by
  dev harnesses and browser passes. **Add a test only for a guarantee whose
  regression would be SILENT** -- security boundaries, exclusion filters, data
  visibility, migration-over-real-data. Feature correctness that fails visibly
  belongs in a harness.
- **`vitest.config.ts` is standalone, not an extension of `vite.config.ts`.** It
  carries only the aliases needed to import a REAL module rather than a copy of
  it, and it declares TWO PROJECTS: `node` (everything under `tests/` except
  `tests/dom/`, on svelte's SERVER build, which is where the database tests and
  the twenty-odd `svelte/server` `render()` files live) and `dom`
  (`tests/dom/**`, happy-dom plus `conditions: ['browser']`, which is the only
  place `mount()` runs an effect). Its own header and `tests/dom/README.md`
  carry the argument. **Prefer `node` when either would do**: a mount costs
  roughly an order of magnitude more per test than a server render, and the
  client compile is paid per file on top.
- **A TEST THAT NEEDS A `tools/browser-verify` MODULE IMPORTS IT THROUGH A
  COMPUTED URL, NEVER A LITERAL SPECIFIER.** A literal import pulls the harness
  JS into svelte-check's program: measured on 2026-09-28, the baseline went from
  0 errors to 126, every one in `tools/browser-verify/checks.mjs`.
  `await import(new URL('../tools/browser-verify/<file>.mjs', import.meta.url).href)`
  in a `beforeAll` is the shape (`tests/browser-verify-prepare-until.test.ts`,
  `tests/classroom-class-theme.test.ts`), and it keeps one implementation of the
  projector model rather than a mirrored copy.
- **happy-dom HAS NO LAYOUT ENGINE, SO NO GEOMETRY, CONTRAST OR TAP-TARGET
  CLAIM MAY BE ASSERTED IN `tests/dom/`.** Measured there:
  `getBoundingClientRect()` answers `{x:0, y:0, width:0, height:0}`,
  `offsetWidth` is `0`, and `getComputedStyle(el).color` is the EMPTY STRING.
  A test that measures a box, a ratio or a 44px target in that project reads
  zero and **passes vacuously** -- which is exactly the instrument defect that
  hid in the browser harness for weeks, arriving as a green tick rather than as
  an error. **There is no local detector for it**: the file type-checks, the
  project runs it, and nothing anywhere says the number came from a page that
  was never laid out.
  - **THE TRAP INSIDE THE TRAP IS THAT SOME COMPUTED READS ARE REAL.**
    `getComputedStyle(el).display` answers `"block"` correctly, because the
    cascade runs even though layout does not. So a computed-style read that
    works is not evidence that the next one will.
  - **THOSE CLAIMS BELONG TO `npm run verify:browser` AND NOWHERE ELSE.** It
    drives a real Chromium at 375px, 1152px and 1440px and reports measured values.
    What `tests/dom/` is for is structure, events, effects and storage: a real
    `dispatchEvent` reaching a real handler, `preventDefault` readable
    afterwards, `localStorage` surviving an unmount.
- **The fixture is a REAL embedded Postgres with the REAL migration files applied
  unmodified** (`tests/db/harness.ts`). `tests/db/supabase-stub.sql` supplies only
  what lives OUTSIDE `supabase/migrations` (the roles, `auth.users`/`auth.uid()`,
  enough `storage`). **Nothing in the stub re-implements a migration**; if a
  migration would fail on a real project, it fails here.
- **ONE cluster per RUN; one DATABASE per `startTestDb` call.** `tests/db/cluster.ts`
  is a vitest `globalSetup` that boots a single embedded Postgres for the whole run.
  `startTestDb` does not boot a server: it creates a fresh database on that cluster,
  applies the stub and the requested chain to it, and drops it in `stop()`. Booting
  per file cost a measured 5.49s x 48 = 263s of a 320s run when the change was
  made; it is one boot now. **That is a 2026-08 measurement of a tree that has
  since roughly tripled its database files, kept as the ARGUMENT for the shape
  and not as a current figure** -- the run's own timing line is what says how
  long it takes today. **Write a test exactly as before** -- the
  `startTestDb()` signature is unchanged.
- **ISOLATION IS THE DATABASE BOUNDARY**, chosen over the two alternatives on
  purpose. A per-file SCHEMA would mean rewriting migration SQL (they name `public`,
  `auth` and `storage` literally) or bending `search_path`, which is the very thing
  the SECURITY DEFINER functions under test pin against. Transactional rollback
  cannot work here because `asUser` deliberately runs outside a transaction: many
  tests assert a statement is REJECTED, and one rejection poisons everything after
  it. Separate databases mean separate catalogs, so nothing a file leaves behind is
  reachable from another even by name.
- **The migrations run per database rather than from a TEMPLATE**, and the ratio
  says why: at the time the shape was chosen, 50 `startTestDb` calls requested 37
  DISTINCT chains, so a template cache would have warmed only 13 of them, at
  0.28s each. **The counts have moved and are not restated here** -- `grep -c
  startTestDb tests/**` is the current answer, and the ratio is what the
  decision rests on. Applying them keeps the fixture's
  central claim literally true -- every test database has had the real migration
  files applied to it, in order, not a byte-copy of one that did.
- **That isolation is PROVEN, not asserted.** `tests/db-isolation-a.test.ts` leaves a
  table, a profile row and a sequence behind and never stops its database;
  `tests/db-isolation-b.test.ts` fails if it can see any of them, and first reads A's
  leak directly off the cluster as a POSITIVE CONTROL so its three absence
  assertions cannot pass vacuously. Verified by breaking it: pointing `startTestDb`
  at one shared database reddens 5 of B's assertions, and the harness was restored
  md5-identical. **A new isolation mechanism updates that pair or it is not proven.**
- **`tests/db/sequencer.ts` pins ONLY that pair's order.** Vitest's default sequencer
  orders files by FILE SIZE, so the proof would go vacuous the moment someone edited
  a comment in it. Nothing else is reordered, and this is not a licence to write an
  order-dependent test: every other file must pass in any order.
- **`asUser(id, fn)` sets the `request.jwt.claims` GUC then `SET ROLE
  authenticated`** -- exactly what PostgREST does. **The role switch is
  load-bearing**: the connection role owns these tables and bypasses both RLS and
  the grants, so a test that forgets it passes VACUOUSLY. It deliberately does not
  wrap the work in a transaction, because several tests assert a statement is
  rejected and a rejection would poison the rest.
- **`tests/db/postgrest-shim.ts` resolves embeds against the real catalog** and
  answers PGRST200 when no key relates two tables. It ASSERTS the table, columns
  and filter it was handed, so a change to a route's query fails loudly rather than
  quietly testing something else. **A shim more permissive than the real thing does
  not fail loudly -- it certifies a bug.**
- **A test's expected value must not come from the thing it is testing.** A check
  derived from the implementation's own rule cannot fail. Prefer a fixture of REAL
  committed data, or a figure the implementation does not produce. **The question
  is not "does this pass" but "where does the expected value come from".**
- **A FIXTURE MUST BE SOMETHING ITS REAL PRODUCER CAN EMIT**, and where the
  producer owns a schema, BUILD it through that schema rather than typing it out.
  Both rich-text normalizer tests hand-wrote a nested list as a SIBLING of its
  list items -- a document ProseMirror cannot hold -- so they exercised a dead
  branch and passed while every real nested list was being silently concatenated
  into one unreadable item. A green test on an impossible document is worse than
  no test: it is a claim of coverage over the exact case that is broken. The
  editor schema therefore lives in ONE plain-data module (`rich-text-schema.ts`)
  that the component and the test both read, and the test asserts the impossible
  shape can no longer be constructed. **Feeding input the producer cannot emit is
  still right where the surface is reachable WITHOUT it** (a hand-rolled POST to
  a route); say so in the test, so nobody reads it as editor coverage.
- **NEVER ASSERT OVER A DIRECTORY THE APP WRITES.** `materials/` is written by
  the classroom GitHub export on every item save, with no human involved, and
  pushed straight to `main`. A test that pins its bytes -- or its counts, or its
  hashes -- is red the next time a teacher saves an item, and the fix offered
  each time is to write down whatever the new value is. That is a RATCHET: it
  records what last happened and checks nothing.
  `tests/spec-instructions-budget.test.ts` was this, three times, and the third
  is why the sweep is gone. **The deeper cost is that a standing failure hides a
  real one** -- for days, every genuine regression in the suite was
  indistinguishable from the known-red file. A test nobody can keep green is
  worse than no test. If a property of app-written content matters, assert it
  where the app WRITES it (the validator, the RPC), never where it lands.
- **Keep the suite honest.** Pair every exclusion assertion with a positive control
  and report BOTH counts -- a scan reading the wrong property comes back clean, and
  clean is what nobody investigates. Assert the case count of a generated sweep, so
  a sweep that generated nothing cannot pass.
- **Generalize, never delete, an assertion a legitimate change breaks.** If a test
  spelled out a list that adding a member necessarily breaks, assert the RULE
  instead, then re-mutate to confirm it still bites.
- **Drive the REAL route handler / load function**, imported from its own file, not
  a reimplementation of it.
- **Characterize behaviour BEFORE extracting it.** Record a golden fixture from the
  code AS IT STANDS, generated mechanically from the shipping source rather than
  retyped -- a retyping characterizes what you believed it did. A sweep written after
  a move only proves the new code agrees with itself.

---
