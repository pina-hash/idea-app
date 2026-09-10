---
title: "`hx` is reserved in both halves at once -- `RESERVED_SLUGS` and `_app_short_link_reserved` (0196) -- clearing ledger 0126's reported blocker, and `.env.example` gains the two HTML-assignment origin variables (`claude/reserve-hx-slug-8zq09j`, migration 0196)"
date: 2026-09-10
branches: [claude/reserve-hx-slug-8zq09j]
migrations: ["0196"]
subsystems: ["Short links", "Classroom", "Environment"]
---

Ledger 0126 built the ported-HTML-assignment boundary and ended with a blocker it
could not fix from inside its own surface: `/hx/<docId>` is a top-level,
slug-shaped route, so SvelteKit resolves it ahead of the `[shortlink]`
catch-all, and a short link with the slug `hx` can never be reached from the
moment that route ships. Reserving a name costs an edit to
`src/lib/short-links.ts` AND a migration on `public._app_short_link_reserved`,
and both files sat outside 0126's owned surface. It left
`tests/short-link-reserved-names.test.ts` red with two failures and said so.

This bundle fixes both halves in one commit, which is the only correct number of
commits for it.

### Why one bundle, and why fixing the TypeScript half alone was refused

`RESERVED_SLUGS` is the client-safe mirror `ShortLinkManager.svelte` pre-checks
against. `public._app_short_link_reserved` is the gate `app_short_link_upsert`
actually calls, inside a SECURITY DEFINER function, which is the real boundary.
Nothing type-checks the two staying equal, so
`tests/short-link-reserved-names.test.ts` reads the deployed function's own
`prosrc` back out of a real Postgres and asserts it names the identical SET.

That is why a half-fix is not a partial improvement. Adding `hx` to
`RESERVED_SLUGS` alone turns two failures (the filesystem sweep, which wants the
route reserved) into two different ones (the SQL-versus-TypeScript pair, which
wants the sets equal), and leaves the client refusing a slug the database would
accept -- a form that says "taken" over a row an upsert would happily write.
0126 read that correctly and reported it rather than taking it.

### It is 0166's shape, deliberately, and not a second mechanism

`0166_short_link_reserve_maps.sql` did exactly this for `maps`, for exactly this
reason, before the `/maps` route shipped. `0196_short_link_reserve_hx.sql` is
that file with one name changed:

- **A report block first, which writes nothing.** A short link with the slug
  `hx` may already exist in production; reserving the name does not remove it,
  and this repository cannot query the live project to find out. So the answer
  is raised as a notice at apply time, in the SQL editor, in front of whoever
  runs it. The row is left in place unmodified -- an authored slug is a
  permanent contract, a migration refuses rather than destroys, and retiring
  somebody's printed handout is a person's decision, not a file's.
- **`create or replace` at an unchanged signature.** No parameter moves, so the
  signature trap does not apply and no `drop function` is needed; a replace at
  an unchanged argument list cannot leave a second overload behind.
- **A revoke that NAMES the roles.** `revoke ... from public, anon,
  authenticated`, then `grant execute ... to service_role`. On production this
  inherits what 0137's sweep already left and is a no-op either way; the reason
  to state it is the case where the function does not yet exist, where
  `create or replace` IS a create and a hosted project's default privileges hand
  it a fresh `anon` grant.
- **A catalog read-back that raises.** Not the statements' own success.

Two assertions were added over 0166's:

1. **`maps` must still answer true.** The predicate is retyped wholesale on each
   redefinition, so the failure mode is not "the new name is missing" but "the
   set it was extending was replaced". Probing only the name this file adds
   cannot see that.
2. **The deployed body must name exactly 34 literals.** Counted off `prosrc`
   inside the migration, so a name lost in the retyping is caught even when it
   is not one of the three names probed by hand.

`0093`, `0156` and `0166` are untouched. Each is an immutable applied record.

### Reserving before the route lands is the order with no window in it

`src/routes/hx/` exists on exactly one unmerged branch
(`claude/html-assignment-manifest-contract-tpr7eg`) and on no ref this bundle
builds from. So `hx` is reserved here against a tree that does not carry the
route -- which is what 0166 did for `maps`, whose header says the route was
being gained.

That is deliberate and it is the safe direction. The filesystem half of the test
asserts routes are a SUBSET of `RESERVED_SLUGS`, so an entry ahead of its route
reddens nothing and refuses nothing anybody was going to create. The reverse
order has a live window in it: the route already shadows the catch-all while the
admin form still reports the slug as available.

### The paste trap: checked, and the count is zero

A `$tag$` appearing inside a `--` comment balances in Postgres but breaks the
Supabase SQL editor's client-side statement splitter, which cost a full apply
cycle on `0194`. Measured on this file two ways: a grep for a line whose leading
token is `--` and which also contains a dollar-quote tag returns **0**, and a
scan of everything following the first `--` on every line returns **0**. The
file holds **6** `$$` occurrences, three balanced pairs -- two `do $$ ... $$;`
blocks and the function's own `as $$ ... $$` -- and every one is a real
delimiter.

### What was measured

- **`svelte-check`: 0 errors, 37 warnings, 31 `state_referenced_locally` / 5
  `css_unused_selector` / 1 `perf_avoid_nested_class`.** Exactly the baseline.
  Re-derived rather than read: `PUBLIC_SUPABASE_URL` and
  `PUBLIC_SUPABASE_ANON_KEY` were exported with placeholders BEFORE
  `npx svelte-kit sync`, which is what keeps the 13 phantom `$env/static/public`
  errors of a fresh checkout out of the count.
- **`tests/short-link-reserved-names.test.ts`: 8 passed, 8 of 8.** All four
  database tests ran against a real embedded Postgres with the chain plus
  `0196` -- verified by reading the verbose per-test output rather than the
  summary, because a `startTestDb` that never booted would report the file as
  passing nothing.
- **`tests/site-icons.test.ts`, `tests/short-link-redirect.test.ts`,
  `tests/claude-md.test.ts`: 96 passed.** The redirect test transcribes its own
  32-name list and pins `RESERVED.length` to 32; it applies a chain stopping at
  `0156`, so neither `0166` nor `0196` moves it and it needed no edit. That is
  worth writing down because it looks like a file this bundle should have had to
  touch and is not.

### Mutation proof, in both directions

The claim being proved is that the two halves cannot drift apart silently. One
direction alone would not prove it.

- **Drop `hx` from `RESERVED_SLUGS`, migration untouched.** The
  set-equality test failed: `expected Set{…(31)} to deeply equal Set{…(30)}`.
  1 failed, 7 passed.
- **Drop `'hx'` from the migration, TypeScript untouched.** The migration's OWN
  self-check raised and `startTestDb` refused the chain:
  `Migration 0196_short_link_reserve_hx.sql failed to apply: 0196:
  _app_short_link_reserved('hx') did not answer true after the redefinition.`
  1 file failed, 8 tests skipped. This also establishes the self-check is not
  vacuous.

Both mutants were restored from `cp` COPIES taken in the scratchpad before
mutating, never with `git checkout --` (which restores from HEAD and would have
discarded this bundle's own uncommitted work, then reported every later mutant as
passing against a pristine tree). `md5sum -c` confirmed both files
byte-identical afterwards.

### Re-application

`0196` was applied TWICE in one chain against a real Postgres, in a scratch test
file deleted immediately afterwards: the second apply is clean and the deployed
body still names 34 literals including both `hx` and `maps`. Re-pasting a
migration is ordinary here, so a file that only works once fails exactly then.

### The two environment variables, which are 0126's

`.env.example` gains a stanza for `PUBLIC_HX_SANDBOX_ORIGIN` and
`PUBLIC_HX_PORTAL_ORIGIN`, listed in 0126's ledger as owed to whoever could
write a shared file.

The instruction is **set on production only, unset on previews**, and the reason
is the resolution ladder in `src/routes/hx/_headers.ts` (which arrives with the
route): the configured portal origin when set, otherwise `https://ideabosco.com`
but only when the sandbox origin is itself set, otherwise the origin the request
arrived on. A preview deploys to exactly ONE host, so one server answers both the
portal role and the document role. Naming either variable there makes
`frame-ancestors` name a host that is not framing anything, the browser refuses
the embed, and nothing on screen says why -- it reads as a broken feature rather
than as a misconfiguration. Both unset is the configuration that works
everywhere but production, and production is the one deployment where the two
roles are genuinely two hosts.

This is the same trap `CLAUDE.md` already records for Foundry previews, arriving
one subsystem over, and it is worth reading the two together: there, two
DIFFERENT hostnames on a preview misconfigure the deployment into GRANTING
`allow-same-origin` on a host carrying real session cookies. Here the cost is
the milder direction -- a refused embed rather than a granted one -- but the
root cause is identical: a preview claiming two origins where it has one.

### NOT verified, and not verifiable here

- **`0196` was NOT applied to production.** This container cannot reach it. The
  file is listed at the end of the session response for pasting, and the
  verification query is in that report. Nothing in this repository can apply a
  migration or query the live project.
- **No browser pass.** This bundle renders nothing and changes no surface: the
  diff is one string in a list, one SQL file, one test chain entry, and comments.
  `npm run verify:browser` would measure nothing this bundle can move.
- **`npm run verify:readme` was NOT run, on instruction.** No route spec is
  added here, and the pass rewrites a generated region that four standing lanes
  also write -- which is the merge-result defect ledger 0130 spent a whole
  bundle repairing.
- **Whether a short link with the slug `hx` exists in production is UNKNOWN**,
  and is deliberately answered by the migration's own report block at apply time
  rather than guessed at here.

### Left undone, and named rather than taken

- **`CLAUDE.md` still owes the two variables and the `/hx` origin-split rule**,
  which 0126's ledger also lists. `CLAUDE.md` is outside this lane's owned
  surface and was not touched. It should land with the HTML-assignment lanes'
  integration bundle, where the rule can be written once against the merged
  subsystem rather than four times against four branches.
- **`.env.example`'s Foundry section still says isolation comes from "the iframe
  sandbox with no `allow-same-origin`".** That predates the conditional grant
  `CLAUDE.md` now describes, where the flag IS appended when the bundle and
  portal origins differ. The file is in this lane's owned surface, so this is a
  deliberate non-edit rather than an oversight: it is a Foundry correction with
  its own reasoning to check, and folding it into a short-link bundle is how an
  unrelated change becomes unreviewable. Reported for a Foundry lane.
