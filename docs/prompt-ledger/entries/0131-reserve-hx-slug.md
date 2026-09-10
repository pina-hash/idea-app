# 0131 Reserve the `hx` slug in both halves, and record the two HTML-assignment environment variables

- Issued: 2026-09-10
- By: Mr. Pina, carrying ledger 0126's own reported BLOCKER -- `/hx/[docId]` is
  a top-level slug-shaped route, and 0126 could fix neither half of the
  reservation from inside its owned surface.
- Owns: `src/lib/short-links.ts` (where `RESERVED_SLUGS` lives),
  `supabase/migrations/0196_*.sql`, `.env.example`,
  `tests/short-link-reserved-names.test.ts`,
  `docs/prompt-ledger/entries/0131-*`, and its own `docs/history/` entry.
- Does NOT own: `src/routes/hx/**` or anything under
  `src/lib/classroom/html-assignment/`. Four HTML lanes are standing and
  unmerged; none of their files was read for anything but the two variable
  names and the shape of the rule they resolve, and none was written.
- Migration permitted: exactly one. Claims: `0196`. NOT APPLIED -- this
  container cannot reach the production database.
- Lands on: `integration` only. Nothing merged to `main`; the branch carries a
  migration.
- Status: pushed
- Branch: `claude/reserve-hx-slug-8zq09j`, from `origin/integration` at
  `2fed3777`.
- Notes:

  **THE DUPLICATE CHECK CAME BACK EMPTY, BOTH WAYS.** No ref under
  `refs/remotes/origin` carries a `docs/prompt-ledger/entries/0131-*` file, no
  commit reachable from any ref mentions `0131` in its subject, and no ref
  carries a `supabase/migrations/0196_*` file. `0195` exists on exactly one
  branch (`claude/html-assignment-manifest-contract-gye4f7`), which is what
  makes `0196` the number below the allocation rather than a derivation from
  it -- the number was allocated in the prompt and this bundle only confirmed
  nobody had pushed it.

  **BOTH HALVES, IN ONE BUNDLE, WHICH IS THE WHOLE OF WHY THIS IS ITS OWN
  LEDGER.** `RESERVED_SLUGS` in `src/lib/short-links.ts` is the client-safe
  mirror the admin form pre-checks; `public._app_short_link_reserved` is the
  gate `app_short_link_upsert` actually calls. `tests/short-link-reserved-
  names.test.ts` asserts the two name the identical SET, so fixing either alone
  trades two failures for two others. 0126 refused that trade and reported the
  blocker instead, which is the reason this bundle exists at all.

  **IT IS `0166`'S SHAPE, DELIBERATELY, AND NOT A SECOND MECHANISM.** `0166`
  reserved `maps` for the IDEA Maps route, before that route shipped, with a
  report block, an in-place `create or replace` at an unchanged signature, a
  role-naming revoke and a catalog read-back. `0196` is that file with one name
  changed and two assertions added (that `maps` survived, and that the deployed
  body names 34 literals rather than merely containing `hx`). `0093`'s,
  `0156`'s and `0166`'s own texts are untouched: each is an immutable applied
  record.

  **RESERVING BEFORE THE ROUTE LANDS IS THE ORDER WITH NO WINDOW IN IT.**
  `src/routes/hx/` exists on exactly one unmerged branch and on no ref this
  bundle builds from, so `hx` is reserved here against a tree that does not yet
  carry the route -- which is precisely what `0166` did for `maps`. The
  filesystem half of the test asserts routes are a SUBSET of `RESERVED_SLUGS`,
  so an entry ahead of its route reddens nothing; the reverse order is the one
  with a live window, where the route already shadows the catch-all while an
  admin is still told the slug is free.

  **THE PASTE TRAP WAS CHECKED AND THE COUNT IS ZERO.** A `$tag$` inside a `--`
  comment balances in Postgres and breaks the Supabase SQL editor's client-side
  statement splitter, which cost a full apply cycle on `0194`. `0196` holds six
  `$$` occurrences, three balanced pairs, ALL of them real dollar-quote
  delimiters; zero appear after a `--` on any line, checked both by a strict
  leading-`--` grep and by a scan of everything following the first `--` on
  every line.

  **THE TWO ENVIRONMENT VARIABLES ARE 0126'S, LISTED IN ITS LEDGER AS OWED.**
  `PUBLIC_HX_SANDBOX_ORIGIN` and `PUBLIC_HX_PORTAL_ORIGIN` are documented in
  `.env.example`, with the production-only instruction and the reason: on a
  preview one host answers both roles, so naming a portal origin makes
  `frame-ancestors` name a host that is not framing anything, and the browser
  then refuses the embed -- which reads as a broken feature rather than as a
  misconfiguration.

  **WHAT THIS BUNDLE DID NOT DO, AND IS NOT SILENT ABOUT.** `0126` also owed
  `CLAUDE.md` a statement of those two variables and of the `/hx` origin split.
  `CLAUDE.md` is not in this lane's owned surface and was not touched; it is
  still owed, and is reported to the router chat rather than taken.

  **`npm run verify:readme` WAS NOT RUN, on instruction.** This bundle adds no
  route spec and the pass rewrites a generated region four standing lanes also
  write -- which is the merge-result defect ledger 0130 spent a whole bundle
  repairing.
