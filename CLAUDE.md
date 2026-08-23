# CLAUDE.md

Operating rules for working in this repository. Everything here changes how a
task is done, whatever the task is.

**The per-bundle historical record lives in [`docs/HISTORY.md`](docs/HISTORY.md)**
-- what each migration and code-only bundle changed, why, what was measured, and
what was left undone. Read it when diagnosing something in a subsystem with
history, or when you need the REASON a rule below exists before changing it. It
is indexed by subsystem and by migration number. Do not read it end to end.

---

## What this is

`idea-app` is the authenticated foundation for the unified **IDEA portal** at
Bosco Tech, and the foundation of the wider **Bosco Tech student platform**: any
Bosco Tech student can sign in, and every student is identified by their pathway.
It replaced the old static IDEA site (GitHub Pages); that repo is separate.

- **Stack:** SvelteKit (Svelte 5) + Supabase + Vercel
- **Repo:** https://github.com/pina-hash/idea-app
- **Local path:** `C:\idea-app`
- **Production domain:** `ideabosco.com` is **canonical**. `vercel.json` adds a
  host-matched 308 from `idea-app-sage.vercel.app` to the same path on
  `ideabosco.com`. Any hardcoded absolute URL (OG tags, sitemap, robots) uses
  `https://ideabosco.com`, never the vercel.app host.

### The subsystems

IDEA Classroom (`/classroom`), the digital notebook (`/notebook`), the IDEA Coin
economy (`/coin-desk`, `/coins`), GAUNTLET (`/gauntlet`, CAD skills), GREENLINE
(`/greenline`, 3D combat racing), VANGUARD (`/vanguard`, legacy game),
Tournaments (`/tournaments`), FRC Training (`/frc`), FSP (`/fsp/*`, archived
programme), IDEA Foundry (student-published static web apps), and the portal
shell (`/`, `/dashboard`, `/admin`).

**FOUNDRY IS DATA LAYER ONLY SO FAR (0130): three tables, three buckets, eleven
RPCs, NO ROUTES AND NO UI.** Two things about it are rules rather than history.
**`foundry-bundles` HAS NO STORAGE POLICY, AND THAT IS THE MECHANISM** --
`storage.objects` has RLS on, so a bucket no policy names denies every
`authenticated` and `anon` request by default and only `service_role` reaches
it. Any policy added there, for any reason, is what opens it; the proxy reads it
server side. And **LIVENESS GOES THROUGH `_foundry_app_in_population` AND
NOTHING ELSE** -- a new read of `student_apps` calls that predicate rather than
writing its own `hidden_at is null`, and its two widening flags are gated on
`is_admin()` inside the function, which is why the admin populations are a
parameter on one list rather than a second list function.

---

## Commands

```bash
npm run dev                             # dev server
npx svelte-check                        # type + a11y check
npx vitest run --no-file-parallelism    # full suite (see the parallelism trap)
npm run build                           # see the Windows EPERM trap below
```

## Verification standard

This applies to every change. Prompts do not need to restate it.

**Always:**

- **`svelte-check` at the baseline: 0 errors, 37 warnings.** Any change to
  either number is a finding to report, not something to leave unmentioned.
  - **RE-DERIVE IT, NEVER TRUST THIS LINE ALONE.** `npx svelte-kit sync &&
    npx svelte-check`, and read the count off its own summary line -- the sync
    first, because stale generated route types report phantom errors (see the
    toolchain traps). A number written down here is a number that drifts: this
    line said 36 against a tree measuring 37, and two separate sessions found
    the same gap independently before either said so, which is what a figure
    being trusted rather than measured looks like. **A session that measures a
    different number CORRECTS THIS LINE in the same change**, and says in its
    history entry which warning moved.
  - The 37 break down as 31 `state_referenced_locally`, 5
    `css_unused_selector`, 1 `perf_avoid_nested_class`, over 20 files. The
    breakdown is the diagnostic: it says WHICH kind moved when the total does,
    and a total that holds while the mix changes is still a finding. Read it
    with `npx svelte-check --output human 2>&1 | grep -o "svelte.dev/e/[a-z_]*"
    | sed 's|.*/||' | sort | uniq -c | sort -rn`.
- **The full test suite once, at the end.** During development run only the test
  files the change touches.
- **Assert both directions on any visibility or gating claim.** Name what must
  be PRESENT alongside what must be ABSENT, and report both counts. "The
  read-only view has no edit controls" is not a result; "0 forms, 0 file inputs,
  0 pin buttons, against 1/6/6 on the same fixture with transports handed in" is.

**Mutation proof is required only where a wrong result is invisible in normal
use:** exclusion sweeps, privacy and RLS boundaries, data-visibility filters, and
any assertion that a row does NOT appear. Run those against the single relevant
test file, never the full suite; restore the mutated file byte-identically
(md5-check it) and re-verify green. Mutate in the PERMISSIVE direction -- a
policy commented out entirely fails closed and reddens almost nothing, while
`using (true)` reproduces the real leak.

Mutation proof is **not** required for UI gates, presence-of-control checks, or
anything that fails visibly the first time someone looks.

**Migrations:** test against seeded PRE-migration data, not only against a reset
chain -- boot the chain short of the file, seed through the REAL pre-migration
RPCs, then apply the file over the top. State what undoes the migration before
pushing it.

**Visual and layout work:** measure at a desktop width of **at least 1440px** and
at **375px**, and report the measured numbers rather than describing them.

**Harnesses mount the real component.** Never hand-roll a copy of the markup
under test.

---

## Access model

The site is **public-first**: signing in is optional and unlocks extra ability;
it is not required to browse.

- **Public tier (no login):** the landing page `/`, every assignment and
  reference doc (`/assignments/<slug>`), VANGUARD, the coin leaderboard
  (`/coins/`), the tournament section, the reference-document viewer
  `/reference/<itemId>` (only for a MATERIAL a teacher flagged public), and the
  short-link redirects `/<slug>` such as `/209h`.
  - **The public reference viewer and short links live OUTSIDE `/classroom`
    deliberately** -- that prefix is in `authedPrefixes` and would bounce a
    signed-out visitor to `/` before either load ran.
  - **`POST /api/feedback` is the one PUBLIC WRITE endpoint**: an anonymous
    report, rate limited per address inside the database. It answers its own
    responses, so it is not in `authedPrefixes`, and it reads no session.
- **Signed-in tier (any role):** `/gauntlet`, `/frc`, `/greenline`, `/notebook`,
  `/classroom`. `hooks.server.ts` redirects anonymous users off a LIST of authed
  prefixes.
- **Admin tier:** `/dashboard`, `/coin-desk`, `/admin`, `/greenline/moderation`,
  the notebook Drive connect flow, GAUNTLET authoring / room hosting, FRC
  completion overrides and gate reviews, the FSP FRC-interest roster, GREENLINE
  decal + community-track moderation, tournament deletion, the all-users feedback
  read, VANGUARD's TUNE mode.
- **The homepage `/` IS the student dashboard.** Students have no separate one;
  `/dashboard` is admin-only.
  - **ITS SECTION ORDER TURNS ON WHAT THE VIEWER MANAGES, never on their role.**
    Apps sits above Your Classes for anyone who manages a section, and below it
    for everyone else -- a student's feed deep-links them into the exact item
    that is due, which nothing else on the page does, so it keeps the top. The
    signal is `classroomFeeds.some((f) => f.manages)`, reusing `buildFeed`'s own
    `manages` (which mirrors `classroom_manages_section`); `profile.role` is the
    wrong key, because the email domain grants `teacher` to staff who teach no
    section and an admin can manage every section without it.

### Roles

`student`, `teacher`, `visitor`, derived from the sign-in email domain
(`role_for_email`): `@boscotech.edu` -> teacher, `@boscotech.net` -> student,
anything else -> visitor. Roles are intentionally open-ended; adding one means
extending the CHECK constraint and `role_for_email`, not a rebuild.

### ADMIN TIER -- this supersedes every "teacher-only" claim anywhere

`teacher` is auto-granted by domain and marks staff apart from students, but **on
its own it grants nothing privileged**. Every elevated capability requires an
explicit ADMIN grant.

- **`is_admin()` is the check.** `public.app_admins` is the roster, keyed by
  LOWERCASED EMAIL (not user id), so an account can be authorized before it has
  ever signed in. `is_owner()` is the owner-only check.
- **THE NAMING TRAP -- read this before touching any policy.** `is_teacher()`
  still exists and **now returns `is_admin()`**. Redefining that one function body
  re-gated ~90 already-applied references at once, because migrations here are an
  immutable applied record and Postgres resolves a function by name at call time.
  **`is_teacher()` does NOT mean "is a teacher". Never write a new call to it;
  use `is_admin()`.**
- **The owner is pinned in the schema.** `admin_owner_email()` is a hardcoded
  constant (`apina@boscotech.edu`); `is_admin()`/`is_owner()` fall back to it, so
  the owner keeps access even if `app_admins` is emptied. Only the owner can
  `admin_grant`/`admin_revoke`; no admin can demote the owner. Changing the owner
  means a new migration, deliberately. `ADMIN_OWNER_EMAIL` in `src/lib/admin.ts`
  mirrors it for DISPLAY only, never as a check -- change both together, and the
  literal in the `app_admins_owner_is_pinned` CHECK with them.
- **Grants are limited to `@boscotech.edu`** (enforced in `admin_grant`).
- **App side:** `src/lib/server/admin.ts` (`isAdmin`/`isOwner`) is the ONE server
  helper; `isAdmin` rides `page.data` from the root layout for UI.
  `role === 'teacher'` is NOT an admin check. The only surviving uses are that
  helper's pre-0067 fallback (matched on the `PGRST202` code ALONE, so a runtime
  error inside `is_admin()` fails closed) and the homepage's staff-vs-student
  branch.
- **Deliberate exception:** `/fsp/live` is open to any `@boscotech.edu` account,
  gated in-page by email domain.
- **Role editing:** admins, not teachers. No one can change their own role; the
  owner's role cannot be changed by anyone. Enforced server-side
  (`enforce_role_change` + RLS), never in client code.

### Probing must reveal nothing

- **A surface a caller may not see answers 404, not 403 and not a redirect** --
  `/admin`, `/coin-desk`, the teacher tabs under `/classroom/[sectionId]`, the
  per-student notebook review page. Such routes are deliberately NOT in
  `authedPrefixes`, because the prefix guard's redirect would confirm they exist.
- **A redirect is correct only where the surface is known to exist for everyone**
  (the `/dashboard` non-admin redirect to `/`).
- **"Not found" and "not yours" answer identically**, so an id cannot be probed.
- An empty RLS result is 404, never 403: RLS returning nothing is
  indistinguishable from the row not existing.
- **Widening a public or preview payload is a DISCLOSURE DECISION, not a field
  addition.** Several payloads deliberately withhold something a caller might expect
  (a disciplinary strike count, a verification target, a student's identity). Check
  `docs/HISTORY.md` for that surface before adding a field to it.
- **A chosen public identity replaces the account identity completely.** Where a
  feature lets someone pick a display name and picture, NO surface -- including a host
  or admin console -- shows the Google account name or avatar behind it.
- **An access helper FAILS CLOSED on any error**, never falling through to a weaker
  check.

### Pathways -- identity, never an access gate

Six pathways (IDEA, ACE, BMET, CSEE, MSET, MAT) in `profiles.pathway`.
**No route, policy, or feature may branch access on pathway.** Independent of the
email-domain role. `src/lib/pathways.ts` (plain data, client-safe) owns the fixed
palette and icons. `PathwayChip.svelte` shows the pill BESIDE the profile image,
never replacing it; colour is never the only signal.

### Profiles

`profiles` carries `display_name`, `avatar` (`preset:<id>` | `upload:<path>` |
null -> Google `avatar_url` -> initials), and `preferences` (free-form JSONB).
The root `+layout.server.ts` loads it once as `userProfile` -- **a key no page
load shadows** -- so it is in `page.data` everywhere.
`src/lib/ProfileMenu.svelte` is mounted in every page header and reads it from
`$app/state`. Shared sign-out is `signOutEverywhere()` in `src/lib/profile.ts`.

**Storage uploads write only into the user's own `<uid>/` folder**, enforced by
Storage RLS, in every bucket that accepts a user upload.

**`preferences` is a shared JSONB blob with several independent namespaces**
(`homepage`, `classroomFeed`, `classroomUnits`, `coinDesk`). Every write is a
whole-blob **spread-merge**, so a sibling namespace can never be clobbered; every
read **validates values against their union** and DROPS an unrecognised one, so a
stored value can never put the UI in a state no branch renders.

**A preference stores a DEFAULT, never the entry itself.** Remembering the last
student, category or amount across sessions is how the wrong one gets charged.
**A preference shape migrates on READ**, in code, detected from the stored shape --
it needs no database migration.

---

## Auth

Server-side auth uses the current `@supabase/ssr` pattern, not the deprecated
`auth-helpers`.

- `src/hooks.server.ts` creates a per-request server client and runs the route
  guard. It validates sessions with `getClaims()`.
- `src/routes/+layout.server.ts` and `+layout.ts` create the client for server
  and browser and expose `supabase` + `claims`.
- `src/routes/auth/callback/+server.ts` handles the Google OAuth code exchange
  and honors a `next` query param (default `/dashboard`).

Sessions are available server-side, so route guards run on the server.

---

## Environment

Read via `$env/static/public`: `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`.

Read via `$env/dynamic/public` (runtime, so a missing value never breaks the
build and the page degrades gracefully): `PUBLIC_FSP_APPS_SCRIPT_URL`,
`PUBLIC_FSP_PULSE_APPS_SCRIPT_URL`, `PUBLIC_VAPID_PUBLIC_KEY`.

**SERVER-ONLY**, read via `$env/dynamic/private` (runtime; never in the client
bundle; a missing value degrades to a clear "not configured" response, never a
build break):

- **`SUPABASE_SERVICE_ROLE_KEY`** -- read by exactly THREE modules: the GREENLINE
  community-track publish endpoint (which must run the game's real track
  validation in Node before any row is written), the tournament push sender, and
  the anonymous feedback route (`src/routes/api/feedback/+server.ts`, the only
  caller of `app_feedback_submit`, which is granted to `service_role` alone
  because the rate limit's key has to come from the request and not from
  anything in it). Nothing else may read it, and **it must never gain a
  `PUBLIC_` prefix**. Unset, the feedback route answers a structured
  `not_configured` refusal rather than a retryable failure: a missing
  environment variable does not fix itself in eight seconds of backoff.
- **`GOOGLE_OAUTH_CLIENT_ID` + `GOOGLE_OAUTH_CLIENT_SECRET` +
  `GOOGLE_DRIVE_REFRESH_TOKEN`** -- Drive storage for notebook photos, classroom
  attachments and decks. Auth is **OAuth on behalf of a real Bosco Tech account,
  never a service account**: the shared drive's Workspace policy blocks any
  identity outside the school domain, which a service account is by definition.
  The refresh token is minted once by an ADMIN via `/admin/drive-connect` and
  pasted into Vercel by hand (displayed once, never logged, never stored
  server-side). Read ONLY by `src/lib/server/notebook-drive.ts`. Optional
  `GOOGLE_DRIVE_NOTEBOOK_FOLDER_ID` overrides the target folder. Every Drive call
  carries `supportsAllDrives=true` -- the plain endpoints cannot see a
  shared-drive-nested folder, including on a folder LOOKUP.
- **`VAPID_PRIVATE_KEY`** (+ optional `VAPID_SUBJECT`) -- signs Web Push. Read
  ONLY by `src/lib/server/push.ts`. Must come from ONE generated pair with
  `PUBLIC_VAPID_PUBLIC_KEY`; rotating orphans every existing subscription.
- **`GITHUB_EXPORT_TOKEN`** -- the classroom GitHub export. Read ONLY by
  `src/lib/server/classroom-export.ts`; never reaches a caller, a message, or a
  log line. Unset is SILENT: no attempt, no recorded failure, no chip.

**RETIRED, and to be removed from the Vercel env: `COIN_API_KEY`,
`COIN_LEDGER_URL`.** Nothing reads them.

**ONE MODULE KNOWS EACH CREDENTIAL.** A secret has exactly one reader, which is
the single egress point for that service. Do not add a second.

See `.env.example`. **Never hardcode keys. Never commit `.env`.**

**The local `.env` is a PLACEHOLDER Supabase project** (`example-ref`), not a
live one. Nothing in this repo can apply a migration, run an RPC, or sign in
against production. Every claim about live data must say so.

---

## Database conventions

### Migrations

- SQL lives in `supabase/migrations/`, sequentially numbered `0001_*.sql`.
- **Applied MANUALLY in the Supabase SQL editor.** There is no migration runner.
  - **NEVER RUN `supabase db push` AGAINST THIS PROJECT.** It is not a way to
    record one file. The remote has **no `supabase_migrations.schema_migrations`
    table at all** (measured 2026-08-23: the relation does not exist), because
    the CLI has never been used here, so `db push` treats every local file as
    unapplied -- `--dry-run` planned all **130** of them, 0001 through 0130,
    against the live database that already has every one applied. That would
    replay one-time imports and backfills (`0084`, `0100`) over real student
    data. `supabase migration list --linked` showing an empty `remote` column
    for a file is therefore the NORMAL state and is not a finding.
  - **The CLI is still useful read-only.** `supabase db query --linked "<sql>"`
    verifies what a hand-applied file actually did, against the real project,
    and is the right way to confirm an apply landed. Linking writes
    `supabase/.temp/`, which is gitignored.
- **Migrations are an immutable applied record.** Never rewrite an applied file
  to change behaviour; write a new one. (This is why the `is_teacher()` naming
  trap exists.)
- **Idempotent where practical** (`create or replace`, `if not exists`,
  `drop ... if exists` before `create`). **Re-pasting a migration is ordinary** --
  someone re-pastes, or a first attempt failed partway and gets retried -- so a
  migration that only works once fails exactly then, with the schema half-built.
  Test that the file re-applies.
- **A migration REFUSES rather than destroys.** If a precondition is unmet (rows
  that would be stranded), raise with the counts and what to do about it.
- **A backfill runs exactly once**, inside a catalog guard on the column's own
  existence. An unguarded `update ... where <newcol> is null` on the second run
  rewrites every genuine row, silently.
- **Report counts with `raise notice`** so the operator can check them against
  what the deployed app actually holds.

### THE SIGNATURE TRAP

**A function that gains a parameter is `drop function`ed at its exact old
argument types FIRST.** `create or replace` keys on the parameter list, so merely
adding one leaves the old arity callable as a SECOND OVERLOAD.

Two ways that bites, both seen here:

1. The old arity stays callable and silently ignores the new parameter.
2. **Two overloads differing only by a defaulted trailing parameter make
   PostgREST unable to resolve the call AT ALL** -- so a surviving old arity
   BREAKS the client rather than quietly serving it.

Re-defaulting a parameter that already exists is NOT this trap and needs no drop.
Assert `pg_proc` holds exactly one row for the function in the test.

### DEPLOY ORDERING

**Apply a migration by hand BEFORE deploying a client that names a new
parameter.** The drops mean the old arities stop existing the moment it runs and
the new ones do not exist until it does. Where the client can degrade instead, it
names the new parameter ONLY when the feature is actually being used.

**A VALIDATION GATE WIDENS IN ITS OWN BUNDLE, BEFORE ANYTHING CAN EMIT THE WIDER
SHAPE, and the asymmetry is the whole argument.** A gate accepting a shape
nothing produces is INERT; a producer emitting a shape the gate refuses breaks
every save on that feature at once. So widen the gate, ship it alone, and let the
producer follow -- never the reverse and never together. The widened gate then
has one obligation that outranks the widening: **it must answer every ALREADY
STORED document exactly as the deployed one did, refusals included.** Assert that
by putting the corpus to the deployed gate FIRST, applying the migration over the
same database, and comparing case for case; a gate that quietly tightens
something on the way past is how a bundle that "only adds a feature" starts
refusing content that is already in the table. Resist fixing an unrelated
looseness in the same file -- that is a narrowing, and it needs its own migration
with its own answer for the rows already stored.

### Write path

- **ZERO client write grants on feature tables.** No insert/update/delete grant
  or policy. Every write is a **SECURITY DEFINER RPC that re-checks the caller
  inside its own body**. UI gating is convenience; the RPC is the boundary.
- **A student-facing write RPC takes NO identity parameter.** The caller is
  `auth.uid()` / `current_user_email()`, so "can only act as themselves" is a
  property of the SIGNATURE rather than a check that could be got wrong.
- **Documented exceptions, each for a stated reason:** anonymous intake
  (`fsp_frc_interest`, `app_feedback`, `fsp_item_opens`) writes directly under an
  own-row `WITH CHECK`, because there is nothing to forge in a comment about
  yourself; and the legacy coin import writes rows directly because they are
  HISTORY, not events, and no live rule should read them.
- **`app_feedback` HAS TWO WRITE PATHS ON PURPOSE, AND THEY DO NOT CONVERGE.**
  A signed-in report is the direct insert above, whose `WITH CHECK` pins
  `user_id` to `auth.uid()`; an anonymous one goes through
  `app_feedback_submit`, granted to `service_role` ALONE and reachable only
  from `src/routes/api/feedback/+server.ts`. **Do not merge them.** Converging
  would mean either forwarding a caller's JWT into a function granted to the
  role that bypasses RLS, or letting a server route assert who wrote a row --
  both replacing a database-enforced gate with a server-side one where the
  database-enforced one already works. And 0126's XOR check makes the single
  row shape impossible anyway: an account and an address hash cannot sit on
  one row, because that pair links the account to every anonymous report from
  the same address. **This reverses a plan stated three times** (0053, 0085 and
  0126 each said the direct grant would be revoked once the RPC existed); the
  reasoning is in `docs/HISTORY.md` under the anonymous-path bundle.
  - **THE ADDRESS IS DETERMINED BY THE ROUTE, FROM THE REQUEST.**
    `getClientAddress()`, never a header (a caller can set one, so a rate limit
    keyed on it counts to five over an unbounded set of buckets) and never the
    body (there is no field for it). The route hands over an ADDRESS; the salt
    lives in the database and the digest is taken inside the definer function,
    so no route can choose what lands in `reporter_hash`.
- **AN INSTRUCTOR'S OWN ANSWERS ARE THEIR OWN TABLE, NOT A FLAG ON THE
  STUDENT'S** (0128). `classroom_instructor_responses` mirrors
  `classroom_responses` column for column with the student replaced by the
  instructor, and `classroom_instructor_keys` (one row per item) says which copy
  is the answer key. Every reader of `classroom_responses` -- the grading
  console, the FACTS CSV, the Grades tab, the export -- assumes a row there
  belongs to a student on somebody's roster, so an `is_instructor` column would
  make ONE forgotten `and not is_instructor` enough to grade a teacher or put an
  answer key in a CSV. **NO STUDENT READ PATH EXISTS**: both policies gate on
  `classroom_can_read_instructor_material` first, and there must never be a
  policy, payload or proxy that changes that. Writing and designating need only
  that gate (manages ANY posted section, so a Block 4 instructor can keep a
  copy), never `_classroom_manages_item`; an UNDESIGNATED copy is private to its
  author; undesignating is the author, the designator or an admin, and anyone
  else REPLACES instead.
- **A cross-user staff write is always an RPC**, never a direct client write.
- **Nested SECURITY DEFINER calls are the reuse mechanism.** `is_admin()` /
  `current_user_email()` read the session's JWT claims, not the executing role, so
  an inner call is authorized as the same caller. Bulk RPCs call the single-row
  RPC per row rather than reimplementing any rule.

### Read path

- **Reads run as the CALLER with no identity filter -- RLS does the filtering.**
  Do not write `.eq('student_id', uid)` "for safety"; the policy is the boundary
  and a second copy can stop matching.
- **The exception, and it is a real one:** where the SAME policy legitimately
  returns other people's rows to a DIFFERENT caller (a teacher reading their
  sections), a page computing "MY rows" adds the explicit filter. Authorization
  and ATTRIBUTION are different jobs.
- **A ROSTER-SHAPED LIST TAKES ITS ROWS FROM THE ROSTER, NEVER FROM THE
  PAYLOAD.** Reshaping work rows into a per-person list, do not create a person
  because an email turned up in the data: the policies scope on "may I review
  this", which for a manager of two sections legitimately returns the OTHER
  section's students on a co-posted item, and an invented row is `active`, named
  from the local part of an address, and indistinguishable from a student in the
  roster, the chips, the returned count, the CSV and a Grades tally whose
  denominator excludes it. **Drop it, but say how many** -- a silent drop hides a
  real enrollment mistake exactly as well as it hides the expected case. Report
  the COUNT, not the addresses: what reaches a console reaches an export, a paste
  and a screenshot.
- **An owner-privileged view (not `security_invoker`) MUST carry its own explicit
  row predicate** to replace the RLS it bypasses.
- **`security_invoker = true`** wherever a view should add no reach.
- **A function referenced DIRECTLY inside an RLS `using` clause must be granted
  EXECUTE to `authenticated`** -- it is evaluated as the querying role, not from
  inside a definer function. Missing that grant breaks the whole own-row read with
  `permission denied for function`.
- **No public response ever carries an email.** A public surface over an
  email-keyed schema uses `anon`-granted RPCs that project the address away inside
  the database -- never a table grant, never a `security_invoker` view. Per-row
  identity is an OPAQUE id (`md5(secret salt || email)`, salt minted at apply time
  and readable by nobody). There must be no parameter or field through which an
  address can be requested or returned.
- **Visibility DELEGATES to one function.** Photos, notes, folders and attachments ask
  the same `*_can_read_*` their parent uses rather than restating who staff are, so
  widening one function widens all of them consistently and a draft's children can
  never leak independently.
- **A function whose NAME says the wrong thing is DROPPED, not redefined.** Redefining
  the body is what created the `is_teacher()` trap; it is a last resort for policies
  already applied, never the choice for a function you can still replace.

### State modelling

- **Derived, never stored.** A balance is a `sum()` over the ledger; "current note
  revision" is a `max()`; contract, lap and expiry state are computed at read
  time. There is no mutable column to drift and no cron. A trigger that stops
  firing leaves a subtly wrong value forever with nothing to catch it.
- **Append-only where the record matters.** `coin_transactions`,
  `notebook_entry_notes`, `classroom_content_revisions`,
  `tournament_match_events` and `app_feedback` have no UPDATE or DELETE grant at
  all. Editing INSERTS a superseding row; the chain is `supersedes_id` + a unique
  `(logical_id, revision)`, so "current" is a plain `max()` and two concurrent
  edits collide on the constraint instead of silently losing one.
  - **THE ONE NARROWING, AND IT IS ABOUT WHAT NOBODY HAS READ YET (0129).** A
    revision an AUTOSAVE wrote may be replaced in place by the next autosave,
    because otherwise a debounce mints a revision per keystroke burst and a
    ten-minute writing session turns in a version list dozens long -- which
    makes the history the chain exists for unreadable and gives a whole-chain
    delete far more to walk. **The grants do not move**: there is still no
    UPDATE grant and no UPDATE policy, and the replacement happens inside a
    SECURITY DEFINER RPC. **The licence comes from the AUDIENCE, not from the
    convenience**: the row must be the head of its chain, written by the
    caller themselves, live, and on a DRAFT -- which 0118 makes invisible to
    staff -- so what append-only protects, the version somebody else saw, is
    never what gets overwritten. `notebook_entry_notes.autosave` means
    REPLACEABLE, not "was an autosave"; **an explicit save and a turn-in STAMP
    A BOUNDARY** (`notebook_seal_notes`, and `notebook_submit_entry` does it
    itself so no client can forget), and the predicate refuses a submitted
    entry as a redundant second layer. `created_at` says when the revision was
    STARTED and a replacement never moves it; `updated_at` says when it last
    absorbed one. **Do not extend this to a surface whose writes are visible
    to anyone but their author.**
- **SOFT-DELETING A REVISION CHAIN MARKS EVERY ROW IN IT, never just the head.**
  Where "current" is a `max()` over a chain, stamping only the newest row promotes
  the one beneath it: a read filtering `deleted_at is null` then answers with the
  content as it read BEFORE the last edit, with nothing raised anywhere. Key the
  UPDATE on the LOGICAL id (`note_id`), and refuse an EDIT of a deleted chain --
  an insert would otherwise graft a live head onto a marked history. A shell or
  emptiness guard excludes the chain by that same logical id, or the rows being
  deleted count themselves as remaining content.
- **Archive, never delete.** `active = false` / `revoked_at` / `removed` keep
  history, roster and board rows intact. A real delete is offered only where the
  row holds no record worth keeping (a notebook FOLDER is organization, so
  deleting one unfiles its entries and loses only the filing).
- **A soft-delete stamp is not a boundary.** The stamp is only as good as the
  filters behind it: enumerate every function, view and select that lists the
  table and exclude there, and pair each exclusion assertion with a positive
  control.
- **Make the invalid state unrepresentable with a COMPOSITE foreign key** rather
  than an RPC check: `(folder_id, student_id)`, `(session_id, section_id)`,
  `(item_id, section_id)`. Then no RPC has to re-check it and a raw insert cannot
  route around it. Assert it in a test **with RLS out of the way entirely** (as
  the connection owner), so nothing but the key itself can be what refuses.
- **Email-keyed, not user-id-keyed, wherever a roster must exist before people
  sign in** (`coin_transactions`, `classroom_enrollments`, `app_admins`). A
  balance or enrollment is simply there on first login; there is no linking step.
  The notebook stays uuid-keyed; the bridge between the two is two no-grant helper
  functions, never a granted view (a view mapping emails to user ids is a school
  directory).
- **A canonical record + a postings join table** is how one authored thing appears
  in N classes (`classroom_items` + `classroom_postings`, `notebook_sessions` +
  `notebook_session_postings`). **The posting carries no state of its own** -- the
  moment it could, the copies could drift again.
- **A one-way conversion is TWO LINKED ROWS sharing a transfer id**, never one
  special-cased row, so balance derivation stays a plain per-medium sum with no
  exceptions -- and a transfer is then excluded from "earned" and "spent", because
  it is neither.
- **The sign, the label and the total come from the STORED value, always.** Never
  reconstruct one from a type string or a whitelist of names: a row stored `+40`
  rendered as a red `-40` for months because the renderer re-derived its sign.
- **Ask what a row MEANS, not what sign it carries**, when bucketing into totals. A
  correction and a transfer are neither income nor spending, and both hid for months
  because the reader's own reconciliation cancelled out and agreed with the wrong
  numbers.

### Refusals

- **A refusal a caller must display gracefully returns structured
  `{ok:false, reason:...}` jsonb.** Genuine misuse raises.
- **Bulk RPCs return `{total, succeeded, refused, results:[...]}`** so one
  student's refusal never obscures whether the rest landed, with a per-row
  exception handler so one failure cannot abort the batch.
- **One round trip, one server-side transaction** -- never a client-side loop that
  can stop halfway with nobody able to say how much landed.
- **An unmatched override is REPORTED, never silently dropped.**
- **Normalize, dedupe and sort a list of identity keys before acting on it.** A
  balance is keyed on the email, so `A@x` and `a@x` are one person and processing
  both charges them twice with two perfectly ordinary rows to show for it.
- **A capacity check needs a ROW LOCK on the parent** (`select ... for update`),
  not a count-then-insert: there is no child row to lock for a caller who does not
  hold one yet. Under READ COMMITTED each statement gets a fresh snapshot, so the
  count after the wait genuinely sees the winner's commit.

### SQL traps

- **`jsonb_typeof(x) <> 'string'` is NULL -- not true -- for an ABSENT key**, so
  the guard falls straight through and the check never fires. Use
  `is distinct from`. This has bitten three times, and the third one is the
  reason it matters: **in a boolean GATE the NULL does not stop there.** It
  propagates through whatever the guard was protecting, out of the function as
  SQL NULL, and every caller asks `if not <gate> then raise` -- which does NOT
  fire on NULL. So the fall-through does not merely skip a check, it ACCEPTS
  the write. `_notebook_note_run_len` (0078) did this for a run carrying no
  `text` key for four months, and 0125 fixed it; `_classroom_run_ok` (0108) is
  the same function written correctly and always was. When a gate can return
  NULL, assert `toBeNull()` on it in a test rather than `toBe(false)` -- they
  are wildly different outcomes and only one of them refuses anything.
  - **FIXING ONE IS A NARROWING, AND A NARROWING REFUSES RATHER THAN
    TIGHTENS.** The gate starts saying no to something already in the table,
    and it does it SILENTLY: every stored row keeps rendering, and only the
    next save of it fails, mid-edit, in front of whoever wrote it. So the
    migration COUNTS the affected rows itself, at apply time, against the real
    table, and raises with the number rather than applying (0125). Whether to
    strand that work is a decision a person makes with the count in front of
    them. **Take the count as `<gate>(col) IS NULL` under the DEPLOYED
    function** -- the behavioural probe -- never as a second hand-written walk
    looking for the bad shape: the question is which rows CHANGE ANSWER, and a
    second copy of "what a run is" is the thing that quietly stops matching.
  - **The `_notebook_note_content_ok` backstop is DEFENCE IN DEPTH, not
    belt-and-braces**: its final `return` refuses a NULL total outright, so
    reopening the run guard one level down still fails closed. Verified by
    opening each layer separately and confirming only the pair reddens.
- **An RLS policy records a real dependency on every FUNCTION and COLUMN its
  expression names.** Drop the policy before dropping the column, and recreate it
  after.
- **A constraint another constraint depends on cannot be dropped and re-added.**
  Postgres has no `add constraint if not exists`; guard on `pg_constraint` in a
  `do $$` block instead. A blind drop-then-add raises `2BP01` on the second run.
- **Postgres `round()` is half-up (away from zero), not banker's rounding**, and
  agrees with JS `Math.round()` at ties for positive inputs.
- **`btrim(x)` with no second argument strips SPACES ONLY, where JavaScript's
  `trim()` also strips newlines and tabs.** A TypeScript mirror of a SQL
  projection that ends in `btrim` must not spell it `trim()`: the two agree until
  the first value whose first or last line is blank, and then the client and the
  column disagree with nothing to say so.
  - **AN EMPTINESS GATE SPELLED WITH `btrim` ACCEPTS A BLANK.** `length(trim(x))
    > 0` passes a value of newlines and tabs, which is empty to whoever typed it
    and empty to the client's `trim()` -- so the gate admits the one thing it
    was written to refuse. Where a gate must agree with a person's idea of
    empty, normalize with `regexp_replace(x, '^\s+|\s+$', '', 'g')`, in ONE
    private function the whole file calls. Not `btrim(x, E' \t\n\r\f\v')`: an
    escape Postgres does not recognise in an `E''` string is kept as the bare
    LETTER, so that trim set silently also strips `v` from both ends.
- **A volatile expression like `now()` cannot appear in an index predicate**, so
  "currently active" cannot be a partial unique index on its own; pair
  `revoked_at is null` in the index with a lazily-stamped close on the row.
- **A CHECK CONSTRAINT'S FUNCTION RUNS AS THE WRITING ROLE, so `service_role`
  needs EXECUTE on it.** `service_role` bypasses RLS; it does NOT bypass
  function grants. A private predicate `revoke`d from `public` and granted only
  to `authenticated` therefore makes a table UNWRITABLE by a server holding the
  service key, with `permission denied for function <name>`, even though the
  table's own `grant insert ... to service_role` is right there. The RPCs do not
  show this, because SECURITY DEFINER runs their checks as the owner -- so the
  hole only opens for the one caller that writes DIRECTLY, which is exactly the
  Edge Function a table like `student_app_files` exists to be written by. 0130
  shipped with this (`_classroom_deck_path_ok`, `_foundry_norm`). Grant the
  predicate to every role that writes the column, not just to the ones that read
  it.
- **When re-signing a function to change one term, DIFF IT AGAINST THE SOURCE.**
  A plausible reconstruction from memory is how error semantics quietly change.

---

## Client data access

### Select ladders (widen-then-degrade)

Migrations are applied by hand and separately, so **a deployment sitting between
two of them is a real state.** Every select naming a column or embed a newer
migration added is written as a LADDER: widest first, retried one capability
narrower on failure, ending on a select that works on the oldest supported schema.

- **A new capability gets its OWN rung.** Never fold it into an existing one --
  degrading would then cost an unrelated capability too.
- **Each capability reports itself** (`notesReady`, `foldersReady`, `pinsReady`,
  `deletionReady`), starting FALSE and turned on only by a rung that actually
  included it succeeding. The UI turns off exactly what is missing and says so; it
  never blanks the page.
  - **A RUNG CAN ALSO BE WHAT LICENSES NAMING A NEW RPC PARAMETER**, and that
    is the tidiest form of the deploy-ordering rule: a column and the parameter
    that goes with it land in the same migration, so a rung that came back
    PROVES the parameter exists. `coalescingReady` (0129) is the case --
    `updated_at` on the note embed is what says `p_autosave` is safe to send.
    Better than a `PGRST202` retry, which spends a failed round trip to learn
    the same thing.
- **A FILTER on a new column has the same problem as selecting it** -- PostgREST
  rejects a filter naming an unknown column. Apply it only on the rung that has
  the column, or try-then-fall-back.
- **The narrowest possible probe decides "is this configured"** -- scalar columns
  only, no embedded resource -- so the "not available" card can only ever mean
  what it claims.
- Ladders live in one shared module per subsystem (e.g.
  `src/lib/notebook-selects.ts`), not inline in a route, and are covered by a test
  asserting the rungs strictly narrow.

### THE STALE POSTGREST EMBED

**A select string naming an embedded resource is an assertion about the FOREIGN
KEYS, and nothing type-checks it.** A migration that repoints a key silently
invalidates every embed through it: PostgREST answers `PGRST200` and fails the
WHOLE select, so a fully-migrated database reports the feature missing.

SQL-level tests cannot see this and never will -- SQL does not need a foreign key
to join two tables. The cheap durable guard is a test asserting **every table
embedded in the shipped select strings has a real relationship to its parent**,
read from the live catalog and pinned against a parser that returns nothing.

### RPC degradation

Degrade past a missing RPC on the **`PGRST202` code ALONE**, so a runtime error
inside the function fails closed rather than falling through to a weaker path.

---

## Server, routes and modules

- **`$lib/server/*` never reaches the client.** SvelteKit refuses to bundle it,
  which is what makes a server-side sanitizer or credential-holder a real boundary
  rather than a convention.
- **A pure, client-safe registry per subsystem** holds plain data and pure helpers
  with no `?raw`, no `$lib/legacy`, no three.js, no Svelte: `curriculum.ts`,
  `portal-apps.ts`, `pathways.ts`, `gauntlet.ts`, `tracks.ts`, `abilities.ts`,
  `combat.ts`, `feed.ts`, `track-runtime.ts`, `rich-text-schema.ts`,
  `rich-text-doc.ts`. Pure layers are what make arithmetic testable without a
  browser.
- **Data says WHERE the limits are, never HOW they are enforced.** A track file states
  its boundaries; the runtime decides whether that is a soft wall, a drag penalty or a
  local clamp. Keep the enforcement policy in code, out of the data format.
- **A registry whose ids may already be stored in a row is APPEND-ONLY.** Nothing is
  ever removed from `curriculum.ts`'s `SECTIONS`: every id may sit in a real
  `profiles.section_id`, and deleting one orphans those rows and breaks the lookup.
  Mark an entry concluded with a FLAG instead -- an annual programme comes back, and
  flipping a flag re-opens it with nothing to restore.
- **An API route exists when the work needs the server** (a credential, a
  multipart parse, real validation, a Drive round trip). A single RPC call with
  two strings is made directly from the browser client instead.
- **A route that answers its own 401 is NOT in `authedPrefixes`**
  (`/api/notebook/*`, `/api/classroom/*`).
- **Every `+server.ts` re-checks authorization itself.** A route group's layout
  guard does NOT run for endpoints.
- **A group-wide gate is hoisted to `+layout.server.ts`** and stated once, so a
  new area cannot ship ungated by forgetting to copy the check.
- **A FAILED LOAD RENDERS IN THE APP'S CHROME.** `src/routes/+error.svelte` is the
  ONE error boundary -- root only, because a root boundary already catches a
  failure from any page or layout load beneath it and a per-section one is one
  more thing each new area must remember. It carries the status, the route, the
  correlation id and the report affordance, prefilled.
- **`handleError` in `hooks.server.ts` MINTS THE CORRELATION ID** and logs it
  beside the route and the stack, so a server log line and a report filed about it
  join on one string (`page.error.id`, `App.Error` in `src/app.d.ts`). It does
  nothing else on purpose: it runs on a request that has already gone wrong, and a
  second thing that can fail inside it turns a 500 into a 500 with no log at all.
  The message it returns for a 500 is GENERIC -- an internal error's own text can
  carry a query, a path or a token, and that value is rendered to the caller.
- **Proxy routes serving bytes from the app's own origin use a MIME ALLOWLIST,
  never an echo of the upstream header** -- same-origin `text/html` runs as script.
  Anything outside the allowlist is served `application/octet-stream` + `nosniff`.
  Prefer the STORED mime over the upstream's (Drive reports `.js` and `.json` as
  `text/plain`).
- **Cache a private proxied asset `private, max-age=60`** -- the bytes are
  immutable but WHO may read them is not.
- **A long-running server job is STAGED and client-driven**, each stage bounded by
  both a time budget and an item count, resumable by adopting work already done
  (named deterministically) rather than repeating it. A serverless function has a
  duration limit that no amount of memory tuning addresses.
- **A file the platform will not accept is refused BEFORE the request is made**,
  with the same message the server would give (Vercel caps a serverless request
  body at ~4.5 MB).
- **Best-effort instrumentation must never be able to affect the thing it measures.**
  Telemetry, exports and analytics are wrapped so a throw, a batching bug or a network
  failure cannot crash or abort the run, the save, or the grade.
- **Defense in depth means a mutation test can stay green while one layer is opened.**
  Do not remove a redundant check because a test did not notice: verify by opening
  BOTH and confirming only that reddens the denial assertions.

---

## Components and UI

### Structure

- **Presentation components take state via props and emit intent via callbacks.**
  No component fetches its own data. The route owns the load and the transports.
- **Server calls are INJECTED as a transports object.** The real route points them
  at RPCs; the dev harness answers in memory. That split is what makes multi-step
  orchestration verifiable with no network.
- **The whole screen is a component the route mounts** (`ReviewConsole`,
  `CoinDeskTool`, `GreenlineRace`, `ClassView`), so the dev harness mounts the
  IDENTICAL thing rather than a copy.
- **An omitted optional transport REMOVES the control it drives**, down through
  child components. Read-only is then structural -- there is no write to execute --
  rather than a discipline. A `readOnly` prop may state the intent once, but
  ABSENCE is the mechanism.
- **Presentational state that must survive navigation lives in the LAYOUT**, not
  the page: a layout component is not remounted when a child route changes. This
  is the only way staged File handles, which exist nowhere but in that browser's
  memory, survive opening an item.
- **A layout load must never read `url`** -- it would re-run on every navigation
  and undo that. `params` is safe.
- **Page data merges OVER layout data.** A layout key a page also returns will be
  shadowed; prefix layout-owned keys (`navSections`) when any page returns its own.
- **A cached sub-panel must be invalidated by writes from OTHER panels**, not just
  its own -- the staleness is invisible while it is collapsed.

### Shared shells and locked contracts

- `$lib/shell/ClassSplit` + `split.css` is the ONE two-pane master-detail shell
  (classroom, notebook feed, notebook review console, coin desk). **A surface
  needing a different arrangement gets a class or prop there, never a second
  split.** Knobs: `scroll` (`panes` when the split IS the page under a constant
  chrome height, `page` when real chrome sits above and below or the surface is
  mounted in somebody else's shell, `fill` when the caller gives the split a
  bounded box and the panes take its height -- the only one that names no
  viewport arithmetic), `navWidth`, `detailWidth` (`panel` | `roomy`), `narrow`
  (`swap` | `stack` | `stack-nav-first`), `overlay`.
- **A full-height surface is `.cr-app` + `.cr-app-body` around a `scroll="fill"`
  split**, not a `100vh - <chrome>` calculation. The chrome height is not a
  constant -- a hero wraps, a notice appears, someone else's banner sits above --
  so the bar measures itself and the body takes what is left. Above 1024px only;
  below it the document scrolls as it always did.
- **NOTHING OPEN IS ONE PANE, at every width.** `hasDetail` false renders no detail
  pane and gives the navigation the whole measure; it is not a placeholder state.
  A surface whose detail pane always holds something (the notebook's compose form,
  the coin desk's logging form) passes `hasDetail` and simply never collapses.
  **The list is then responsible for USING the width** -- a fixed-width column
  centred in the room it was just given is the same defect one level in. ClassView
  lays its unit groups out in `auto-fit` columns for exactly this.
- **A column count comes from measuring the content, not from round numbers.**
  Drive the pane across a range and count what actually breaks (ellipsised titles,
  wrapped rows); the column is the width above which the content stops gaining.
  Prefer `auto-fit` over `auto-fill` so a class with two units gets two columns
  rather than two and a void, and `minmax(min(<col>, 100%), 1fr)` so the same rule
  is the single narrow column with no breakpoint of its own.
- **Opening something must not read as a page change.** Where a selection changes
  the geometry, ease the change (~180ms) rather than snapping the screen.
  `grid-template-columns` interpolates ONLY when both states list the same number
  of tracks -- a collapse that drops to one track flips discretely at half the
  duration, which is worse than no transition. Keep the track count and move the
  width. Behind `prefers-reduced-motion: no-preference`, like everything that moves.
- **A pane that clips its overflow SATISFIES a no-scroll measurement by hiding the
  content.** Under `scroll="page"` the guarantee comes from the content genuinely
  fitting, which is what the rule means.
- **Viewport arithmetic in a stylesheet is wrong wherever the surface is not the
  top of the page** -- the notebook mounts under the classroom shell and its
  banner in view-as. Prefer document flow over `100vh - <constant>`.
- **`min-width: 0` on grid/flex children.** An item's automatic minimum is its
  min-content, so a `nowrap` row forces the whole page wider than the viewport.
  `overflow: hidden` and an ellipsis do NOT reduce min-content.
- **The notebook review grid's density, its six status glyphs (checkmark,
  up-arrow, circle, bang, E, dash), Share Tech Mono and the 1.9rem cell box are a
  LOCKED CONTRACT.** Verify byte-identical after any restyle. Do not put words in
  a cell to satisfy a label audit -- the always-visible legend and the hint above
  the grid carry the meaning.
  - **A NEW DIMENSION GETS ITS OWN MARK, never a seventh glyph or a seventh hue.**
    What a cell says about the WORK and whether anybody has SEEN it are different
    questions; acknowledgement (0121) is a dot in its own corner, the way the
    multi-entry count already was, and carries its word in the cell's title, its
    screen-reader line and the legend.
  - **The six status COLOURS are per-palette (`--nb-cell-*`), and used not to be.**
    They were the portal's own tokens on the grounds that no scoped palette should
    reach them. Measured on the three notebook plates, that rule was costing the
    thing it protected: twelve of eighteen plate-state combinations sat below
    4.5:1 and on the LIGHT plate all six did, five of them below 3:1. What is
    fixed is each state's HUE IDENTITY -- green on time, amber late, cyan awaiting,
    crimson flagged, ice excused, sage missing -- and only lightness moves per
    plate. **The FILL is a pinned colour, never a `color-mix` of the ink:** a fill
    derived from the ink moves whenever the ink does and hands most of the
    contrast straight back (measured, 4.79 vs 3.84).

### Interface standards

- **Desktop is a first-class layout.** Every surface needs a real layout above
  1024px; master-detail is the default for list-plus-detail. A single narrow column
  at every width is a defect, not a simplification.
- **An instructor's view of student-facing content is the student view plus edit
  affordances, through the SAME render path.** Instructor-only content sits in a
  visually distinct region, never a parallel re-derivation.
- **A preview path reads through the SAME payload as the thing it previews.** A
  second hand-shaped read drifts from what it claims to show.
- **A preview is not impersonation.** It swaps no session, mints no token, and
  reveals nothing the caller could not already read -- only the arrangement on
  screen changes. If a change here needs a session swap, a service-role client or a
  new grant, that is the signal it has stopped being a preview: stop.
- **WHERE TWO ROLES DIFFER BY PAYLOAD RATHER THAN BY RENDER, NO PREVIEW CAN
  CLOSE THE GAP, and the answer is to delete the preview rather than improve
  it.** The classroom's class and item previews under `/classroom/view-as` are
  GONE for exactly this: a student's item page carries an engine slice that a
  manager's read never loads, so an assignment "previewed as a student" showed a
  placeholder precisely where the work surface belongs, and only a real student
  session could have fixed it. Parity is what a preview was standing in for, and
  parity is already real -- `ItemDetail` is one component gated by `canManage`,
  so an instructor reads the student page plus affordances. **Do not rebuild
  them.** What survives at `/classroom/view-as` is the student picker and the
  NOTEBOOK preview, which is not the same case: no notebook payload splits by
  role, so `notebook_view_as_notebook` returns what the student's own page
  returns.
  - **A route that answers as somebody else is a preview's plumbing, and it goes
    with the preview.** The attachment proxy's `?as=<email>` branch is removed;
    `attachmentSrc` and `resolveFigureSrc` take no `viewAs`. Neither classroom
    proxy resolves an identity now, and neither may gain one.
  - **The SQL went too, one bundle later, and the ORDER is the rule.** A dropped
    function under a still-deployed route is a 500, so the routes go first and
    the drop follows in its own migration (0124:
    `classroom_view_as_section`, `_item`, `_can_read_attachment`, `_sections`,
    and the private `_classroom_item_json` they were the only callers of). What
    stays is `classroom_view_as_students` (the picker),
    `_classroom_view_as_guard` and `_classroom_item_live`. **A migration that
    drops a plpgsql function carries its own caller guard**: Postgres records a
    dependency from a policy, a view, a default or an index, but NOT from one
    plpgsql body to another, so `drop function` succeeds silently and the caller
    breaks at its next invocation. Sweep `pg_proc.prosrc` for `<name>(` and
    refuse.
- **Everything an item needs is attachable at creation, on one surface** -- and on
  ONE surface only. Do not make an author save first and come back; equally, do not
  put a second copy of a panel the page already shows beside the first.
- **Every control carries a visible word, not only a glyph.** A `title` tooltip is
  not discoverable and a phone cannot hover.
- **Colour is never the only signal** -- glyph AND word, or an icon beside the hue.
- **44px minimum tap targets** on anything a phone touches, AND on every
  student-facing surface at every width, with 24px as the absolute floor
  everywhere else (`IDEA_INTERFACE_STANDARDS` 10). The documented exception is a
  control inside a locked density contract, where inflating it would break a real
  invariant to satisfy a guideline written for standalone controls -- say so
  rather than breaking the contract.
  - **THE FLOOR IS `min-height`, NEVER A HEIGHT, and never a snap to the nearest
    token.** Rounding to reach a floor rounds BOTH ways: a mechanical sweep that
    snaps takes a 43px control to 41px and reports success. The notebook's plate
    switch was a fixed `height: 2.4rem` for exactly that reason -- it could not
    round up.
  - **TWO MECHANISMS, AND THEY ARE IN `src/app.css`: `.tap-44` grows a control
    that owns its row; `.tap-reach-44` expands the HIT AREA of one sitting inside
    a line of text**, with a pseudo-element, so the target grows and the writing
    around it does not reflow. Most reaches must set `--tap-reach-w: 0px` and grow
    in height only -- Edit beside Delete, seven colour swatches, two breadcrumbs
    are all closer than 44px horizontally, and overlapping reaches hand the tap to
    the wrong control. Verify a reach by HIT-TESTING it (`elementFromPoint` down
    the control's full span), never by reading the computed height.
  - **THEY LIVE IN THE GLOBAL SHEET BECAUSE SVELTE PRUNES A SCOPED `::after`.**
    Written inside a component's own `<style>`, `.swatch::after` was dropped from
    the compiled output entirely while `.swatch` beside it was kept -- silently,
    with no `svelte-check` warning and no unused-selector notice. A rule that
    cannot be pruned is the fix; a rule you verified by eye is not. This is why a
    reach is a class in the markup rather than a rule in the component.
  - **AN INLINE LINK INSIDE AUTHORED PROSE IS THE ONE THING LEFT ALONE**
    (`ItemBody`'s `.item-link`, 19px). Prose lines sit ~24px apart, so a 44px
    reach on one link overlaps the lines above and below and steals their taps;
    WCAG 2.5.8 exempts an inline target in a sentence for the same reason. Say so
    rather than raising it.
  - **A CONTROL WRAPPED IN A `<label>` IS MEASURED AT THE LABEL**, which is what a
    finger hits -- but only once the label's full height has been hit-tested to
    the pair. A 22px input inside a 44px label is fine; a 22px input inside a 44px
    label that something else overlaps is not, and only the hit test tells them
    apart.
- **A destructive action names what it costs**, with the real counts, before the
  confirm. Two-step inline confirm (arm, then confirm) for anything irreversible;
  a server-side typed-name confirmation for anything that destroys a term of work.
- **A refusal renders where the user was working**, in the same problem list as
  every other problem, not in a second place they must learn about.
- **A partial failure KEEPS what did not land** and names it; only what succeeded
  is cleared. A retry after a partial create UPDATES the record already made, or
  it produces a duplicate.
- **EVERY SURFACE REPORTS ITS OWN DEFECTS, AND THE AFFORDANCE IS MOUNTED ONCE IN
  THE ROOT LAYOUT.** `SiteFeedback.svelte` sits in `src/routes/+layout.svelte`;
  there are no layout resets in `src/routes`, so that mount is what makes
  coverage something a new route INHERITS rather than has to remember. **Do not
  mount it per page** -- that is the rejected alternative, and
  `tests/feedback-coverage.test.ts` sweeps every `+page.svelte` and reddens if it
  moves back to one.
  - **AN EXCLUSION IS BY CATEGORY AND IT RELOCATES, NEVER DELETES.** The registry
    is `FEEDBACK_EXCLUSIONS` in `src/lib/feedback/context.ts`, matched on ROUTE ID
    so a page added under an excluded section inherits it. A surface that takes
    the control off the shell mounts it itself at `place="relocated"` (the deck
    bar, the GAUNTLET viewport footer, GREENLINE's own menus, the error page). A
    category with nowhere to relocate to is an exclusion that deleted the control.
  - **CONTEXT IS CAPTURED, NEVER TYPED**, through `captureMeta`: route id, path,
    role, section, viewport, clock time, and the build. A field somebody has to
    fill in is a field that arrives empty.
  - **A SIGNED-OUT VISITOR GETS THE SAME CONTROL, and the sign-in page is the
    reason.** The person who most needs to report is the one whose sign-in is
    broken, and a writer that answered null with no session removed the control
    on exactly that page. `feedbackWriter` now hands a signed-out caller the
    anonymous route; `feedbackIsAnonymous` is the ONE predicate saying which
    kind of report this will be, and every mount reads it rather than spelling
    "are they signed in" a second time. **`submit={null}` still removes the
    control** -- absence is still the mechanism, being signed out is simply no
    longer one of its causes.
  - **THE OPTIONAL CONTACT IS OFFERED ONLY WHERE THERE IS NO ACCOUNT**
    (`askContact`), is optional in the LABEL rather than only in a placeholder,
    and is absent from the entry entirely when it was not asked for. It is
    **NEVER AN IDENTITY**: nothing verified it, so every surface showing it says
    so, and the export's identity toggle withholds it exactly as it withholds a
    name. A signed-in row cannot carry one.
  - **`app_feedback` is the ONE queue for every surface**, and the console at
    `/classroom/feedback` (admin only) reads ALL apps. Filter before exporting;
    an export of everything is a semester nobody reads.
    - **AN AUTHORLESS ROW IS VISIBLY ANONYMOUS, from the payload rather than
      from an empty name** (`anonymous`, stated by 0127). **The reporter hash is
      not in that payload and must not be added**: it exists to be counted, and
      a column that reaches a console reaches an export, a paste and a
      screenshot.
    - **THE QUEUE RENDERS A STRING ANYONE CAN WRITE**, which no rich-text
      renderer or sanitizer touches. `tests/feedback-untrusted-render.test.ts`
      asserts it for this surface specifically rather than inheriting the
      typed-document argument, which does not apply here.
- **EVERY SURFACE THAT PERSISTS WORK USES THE ONE SAVE STATE**
  (`$lib/save-state.svelte`), never a sixth hand-rolled variant. It owns the five
  states (clean, dirty, writing, saved, failed), the 800ms debounce, backoff to
  8s, and the visibilitychange / pagehide net; `$lib/save-guard.svelte` is its
  navigation guard and `SaveIndicator.svelte` is the one set of words for it.
  - **`saved` is the ACKNOWLEDGEMENT, never the dispatch**, and it carries the
    clock time of the write. A status set beside a `fetch` call says a request
    was made, which is not what the reader is asking.
  - **A retryable failure and a REFUSAL are different outcomes.** Backoff belongs
    to the network; a server that considered the payload and said no is answered
    once and reported, never retried five times.
  - **Pending work is FLUSHED before a navigation, and only a flush that cannot
    land raises a question.** The correct answer to "you have unsaved work" is
    "then save it"; a confirm on every move is a confirm nobody reads.
    **Work the machine CANNOT write -- a staged `File` handle, a child
    surface's own machine -- is reported to that ONE guard through
    `alsoUnsaved`, never a second `beforeNavigate` beside it:** two guards on
    one page race to cancel the same navigation and ask two questions about
    one move. It is asked again AFTER the flush, so whatever the flush landed
    stops counting.
  - **PER-INSTANCE, NEVER A SHELL BANNER.** One global indicator reading "all
    changes saved" while a sibling surface holds a failed write is a false
    negative with a much wider blast radius than the defect it papers over.
  - **`autosave: false` where a write MINTS A RECORD SOMEBODY ELSE READS** (a
    notebook note is a revision, and `EntryNotes` edits one an instructor has
    already seen): the machine still reports dirty for the guard and schedules
    nothing. **A record NOBODY else can read yet is the exception, and the
    privacy is what makes it one** -- the notebook composer autosaves into a
    DRAFT entry, which is invisible at both read sites until it is turned in,
    so the revisions it mints are the author's own history and not a thread
    filling up in front of a reader. **Autosave into a record the moment it
    becomes visible to anyone else is the thing this rule refuses.**
    - **AND THE REVISION-PER-WRITE COST IS PAID AT THE DATABASE, not by
      debouncing harder (0129).** A revision the autosave wrote is REPLACED
      by the next one rather than superseded; a deliberate save stamps a
      boundary. See the append-only rule under "State modelling" for what
      makes that safe and what it must never be extended to. A surface whose
      writes ARE visible to someone else has neither half: it appends, and it
      is `autosave: false`.
  - **`markDirty` driven from an `$effect` must be `untrack`ed.** It reads the
    phase it may then write, so a tracked call re-runs the effect on every
    transition and turns `saved` straight back into `dirty`. A dirty signal
    reported to a parent tracks `save.dirty`, NOT the draft -- the draft is
    cleared before the acknowledgement lands -- and is withdrawn on teardown,
    because a remount destroys the instance that reported it.
  - **`markDirty` FIRES ON A REAL CHANGE, NEVER ON A CHANGE EVENT.** Compare the
    incoming value against the last acknowledged one first. A rich-text editor
    emits a transaction just for being SEEDED -- ProseMirror normalizes what it
    is handed -- so wiring `markDirty` straight to an editor's `onchange` arms
    the debounce for a document nobody typed, the write lands, the re-render
    produces another transaction, and the surface autosaves itself forever
    (measured: 151 writes in seconds; on a surface whose save refetches, it
    wedged the renderer outright). Compare against the EDITOR'S OWN
    serialization at mount (`onready`), not against the value handed in, or a
    harmless normalization reads as an unsaved change.
  - **`$lib/edit-baseline` IS THAT COMPARISON, AND THERE IS ONE OF IT.**
    `EditBaseline` holds what a surface opened on (`seed`), answers whether the
    current value has moved off it (`changed`), and adopts a new reference after a
    write (`advance`); `changed` is FALSE before anything is seeded, because a
    surface whose editor has not reported yet has by definition had nothing typed
    into it. `CheckInGuidance`, `EntryNotes` and `ContentComposer` all read it.
    Three copies of "has this actually been edited" is three things that can stop
    agreeing.
  - **THE EDITOR IS ONLY THE LOUDEST CASE. ANY `dirty` DERIVED FROM THE PRESENCE
    OF STATE HAS THE SAME BUG.** `ContentComposer` reported dirty from the first
    frame in edit mode because its draft carries the item's own title and body:
    `composerHasWork` was answering "is there content in here" and being read as
    "has this been edited". Both questions are now the SAME comparison against a
    different reference -- `composerDraftSignature` differs from an EMPTY draft,
    or differs from the SEEDED one -- so the two answers cannot drift apart. A
    guard that fires when nothing is wrong is a guard people learn to click
    through, which costs the one case it exists for.
  - **A MANUAL SAVE IS A CHECKPOINT, NOT A FINISH, AND ONLY A DELIBERATE FINISH
    ENDS THE SESSION.** A surface that keeps a handle on the record it created
    (the notebook composer's `savedDraftId`) must keep it across an explicit
    save: reset the handle and the next keystroke starts a SECOND record, with
    one piece of work split across two. So a Save-draft-shaped button clears
    only what actually landed and leaves the surface on the same record; only a
    turn-in, a publish, or an explicit new-record action calls the reset. This
    is the same thing 0129 says from the storage end -- an explicit save stamps
    a revision BOUNDARY, which is a thing you write past, not a thing you stop
    at.
    - **AND THE WRITING STAYS IN THE BOX, because the two halves are one
      rule.** Where the next write EDITS the chain rather than appending to
      it, a cleared box over a kept handle means the next paragraph REPLACES
      the saved one as the record's current content instead of following it,
      and the earlier words survive only as a revision nobody is looking at.
      What makes keeping them safe is that the write already advanced the
      `EditBaseline`: the box reads clean and nothing is sent again until
      something actually changes.
    - **ITS BUTTON THEN ASKS THE DIFF, NEVER "IS THERE CONTENT IN HERE"** --
      the presence-of-state bug one bullet up, in its other costume. Once the
      surface holds a record, "something new to save" is what the server has
      not acknowledged, plus any boundary the click still owes. The button and
      the handler read the SAME derived predicate; two spellings of it is the
      thing that stops matching.
- **A change signal must be worth trusting.** An "Updated" badge is stamped only by a
  real content change to something already visible -- publishing, scheduling, pinning,
  reordering and filing are NOT edits, and neither is a save that changed nothing.
  Compare before stamping; do not stamp because a field was present in the payload.
- **Metadata for a third-party link is fetched SERVER-SIDE, never from the student's
  browser**, and cached in memory rather than in a table -- a cache writable by
  anything a signed-in user can reach is a cache anyone can poison. Every failure
  degrades to a plain link, never an error.
- **An authored slug or a printed URL is a PERMANENT CONTRACT.** QR codes and handouts
  are in circulation, so a route they name keeps resolving and a section anchor keeps
  its slug. Short links are re-pointable rows, so they redirect **307, not 308** (a
  permanent redirect is cached past the point where re-pointing helps), carry
  SAME-SITE targets only (an open redirector on our own domain is a phishing
  primitive), and must not carry their own fragment -- the visitor's survives the
  redirect and would be overridden.
- **Thread `now` through from the caller.** A component that reads its own clock
  silently disagrees with the ranking it is rendering.
- **A pre-save preview shows the CONTENT, at `object-fit: contain`.** A filename says
  nothing about whether the page is in frame, and cropping to fill hides the cut-off
  edge the preview exists to catch.
- **A disclosure is a real `<button>` with `aria-expanded`/`aria-controls`**, never a
  div plus a document-level click listener -- that is mouse-only and invisible to
  assistive tech, and it double-toggles against any control added later.
  - **`$lib/Disclosure.svelte` IS THAT DISCLOSURE, and a new one is a caller of
    it.** It takes a `label` (a word, never only a caret), an optional `heading`
    level, a `collapseWhen` signal and a `scope`; `$lib/disclosure.ts` holds the
    arithmetic so it is assertable without a browser. **The region is HIDDEN IN
    CSS, never removed** -- so it prints, and reopening it costs nothing.
  - **Its default is EXPANDED, for every role.** `disclosureOpen` takes no role
    parameter and must not gain one: a per-role default is two behaviours to
    keep in step. **What is stored is the MANUAL CHOICE, never the current
    state** -- storing the state freezes the first render forever, which is the
    exact defect a collapse exists to fix. The viewer's id is added to the
    storage key INSIDE the component, so "per person, per item" is one rule in
    one place and no caller threads an identity.
  - **A room re-points it through `--disc-accent` / `--disc-focus`**, read at
    the point of use with a fallback rather than declared on the component --
    a declaration there sits on a DESCENDANT of the room's wrapper and would
    beat it.
  - **Twenty-odd hand-rolled disclosures predate it** (native `<details>`, and a
    button over a `max-height` rule). They are MIGRATION CANDIDATES, not a
    second sanctioned pattern. **A menu, a popover and a combobox are not
    disclosures** -- `aria-haspopup`, outside-dismiss and `role="combobox"` are
    different contracts and do not migrate.
- **READING COLLAPSES ONCE THE WORK HAS STARTED, and it is ONE decision across
  surfaces.** An assignment's instructions panel and a notebook check-in's
  guidance panel are the same question, so they are the same component with the
  same behaviour (`IDEA_INTERFACE_STANDARDS` 1). The "has started" signal is
  DERIVED from state the surface already holds -- `specStarted` /
  `moduleStarted` off the responses already loaded -- never from a store, a new
  prop or a second read.
- **Every section stays in the DOM when a surface must be printable**; hide an
  inactive one with CSS. A section that never rendered cannot print.

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

## Known traps

These have each cost a debugging session. They are not hypothetical.

### Svelte 5

- **Reading state inside an `$effect` SUBSCRIBES to it** -- including state read
  inside functions the effect calls. An effect that calls a transport takes a
  dependency on whatever that transport touches and spins. Wrap the work in
  `untrack` and pass its inputs explicitly.
- **An effect that calls something writing state must be deferred**
  (`queueMicrotask`), or it lands while Svelte is still settling the render and
  throws `state_unsafe_mutation` -- which surfaces as an unhandled rejection after
  which NO click handler in the tree fires again. The symptom is silent dead
  buttons, not an error banner.
- **A sentinel dependency next to a NON-reactive read does not track.** Derive
  toolbar/active state by PUSHING from the source's own events, not by bumping a
  counter beside an untracked read.
- **`bind:value` on `<input type="number">` COERCES to a number**, so `.trim()`
  throws. This has bitten three times. Type the state `string | number` and wrap
  the call so a throw cannot strand a busy flag.
- **Clear a busy flag in `finally`.** A throw mid-submit otherwise disables the
  form forever.
- **A success message set BEFORE a refresh that clears it flashes and vanishes.**
  Give the refresh a flag that skips clearing when it is the write's own follow-up.
- **`{#key}` a detail pane on the selected id**, or moving between items hands the
  previous item's card a new row and keeps its open panels.
- **Re-derive a selection from the CURRENT list every read; never capture the row
  at click time.** The list reloads after every save, so a snapshot describes the
  state BEFORE the thing just saved to it.
- **An autofocus must be keyed on the ELEMENT, not on mount.** An input bound
  inside a snippet a child renders is not necessarily set at the parent's
  `onMount`, and the focus call is then a silent no-op.

### DOM

- **Attach interaction listeners with `addEventListener`, never a delegated
  framework binding**, on anything that might move into a Document
  Picture-in-Picture window -- a delegated handler registers on the main document's
  root, which a moved node cannot reach.
- **A wheel listener that calls `preventDefault` must be non-passive.**
- **Outside-dismiss listens on `pointerdown`, not `click`, and IGNORES detached
  targets** -- otherwise the click that OPENED the panel closes it, and clicking an
  inline editor closes the popup around it.
- **`src/app.css` sets a global `scroll-behavior: smooth`**, so any programmatic
  scroll that must not animate passes `behavior: 'instant'`.
- **Schedule on rAF-OR-TIMEOUT, never rAF alone.** A backgrounded or throttled
  window never ticks requestAnimationFrame, so an rAF-only path silently never runs.
- **A masthead dropdown needs the header to outrank `main`.** Both sit at
  `z-index: 1` in the same stacking context and `main` comes later, so it wins the
  tie and paints over anything the header drops below itself.
- **An anchored menu breaks when its trigger's row WRAPS.** Below the breakpoint
  drop the wrapper out of the positioning chain (`position: static`) and measure
  insets from something that spans the width.
- **`CSSStyleRule` HAS A `cssRules` PROPERTY NOW (CSS Nesting), AND AN EMPTY
  `CSSRuleList` IS TRUTHY.** So the ordinary shape for walking a stylesheet --
  `for (const r of rules) { if (r.cssRules) { walk(r.cssRules); continue; } ... }`
  -- treats EVERY plain rule as a grouping rule and skips its declarations. A
  sweep written that way comes back with zero matches and reads as a clean
  result. Test the declaration FIRST and recurse only on `r.cssRules?.length`.
  Read `r.style.background` rather than `r.cssText` while you are there: with
  nesting, `cssText` contains the children's declarations too, so a parent gets
  credited with a child's value. **Pair any such sweep with a positive control**
  -- a case it is known to find -- or "no hits" cannot be told from "found
  nothing at all".
- **Check `src/app.css`'s global class list before naming a component class.**
  `.callout` there is a flex ROW; a scoped `background` override does not undo an
  inherited `display: flex`. Prefix component classes (`rb-`, `nb-`, `cd-`).
- **A custom property defined as `var(<another custom property>)` resolves where it
  is DECLARED**, and inherits that resolved value down. Re-declare every such token
  inside each palette block, or a themed surface silently keeps the base theme's
  colour.
- **A genuinely `disabled` control swallows pointer events**, so a "why is this
  disabled" cue can never fire from it. Use `aria-disabled` when the control must
  still explain itself.
- **`File.type` is legitimately EMPTY** when the platform cannot determine a media
  type -- the norm for HEIC off an iPhone. Key a media allowlist on the type OR the
  filename extension, never the type alone.
- **A fixed-position overlay must not be floated over a component that owns its own
  header row.** Give the component a prop and let it render the control in its
  layout.
- **`capture="environment"` is a HINT the spec only says a browser SHOULD honour.**
  Android browsers act on the attribute's PRESENCE but not its VALUE, and `capture`
  additionally makes an input camera-ONLY there. Ship two inputs (capture without
  `multiple`, and `multiple` without `capture`) and treat the lens as unguaranteed.
- **pdf.js: render with `intent: 'print'`.** Display intent paces on
  requestAnimationFrame, which a backgrounded or throttled window never ticks, hanging
  the render forever. Do NOT pass a transparent `background` -- pdf.js normalizes it
  through an alpha-dropping parser to opaque black.

### The Browser pane (`mcp__Claude_Browser__*`)

This subsection is for a fact about the VERIFICATION ENVIRONMENT itself -- something
that costs a debugging detour to rediscover because the pane behaves unlike a real,
foregrounded browser tab. It is not for facts about the application under test; those
belong wherever the app's own behaviour is documented.

- **It does not composite.** Screenshots time out; **every visual claim must be a
  measured computed-style, geometry or hit-test read**, and must be reported as
  such.
- **CSS transitions are frozen at t=0**, so `getComputedStyle().color` on anything
  the global `a`/`.btn` transition covers reports the PRE-transition value forever.
  Inject `* { transition: none !important }` before asserting any computed colour.
  **This is not only about colour: a transitioned LAYOUT property leaves the pane's
  own layout stuck at the old value too** -- a split whose `grid-template-columns`
  eases reported a 0px detail pane after opening one, which reads exactly like a
  broken rule and is not one. Inject the same style before ANY geometry read on a
  surface that animates, and note that the animation itself cannot be observed here.
  Interpolability CAN be: `el.animate([from, to])`, `pause()`, then set
  `currentTime` and read the computed value at several points -- a smooth ramp
  proves the two values interpolate, a jump at 50% proves they are discrete.
- **`IntersectionObserver` NEVER FIRES AT ALL, for anything.** `loading="lazy"`
  images never request, and neither does any hand-written observer: `AppLauncher`
  stamps `opacity:0` inline on every card at mount and clears it from an IO
  callback, so in this pane all eight cards sit at 0 forever and every title,
  mark and CTA in the launcher drops out of a sweep as invisible -- a smaller
  denominator with nothing to say the launcher went missing. Confirmed by
  scrolling all eight through the centre of the viewport and re-reading their
  inline opacity, which stayed "0". **Do not scroll and hope.** Put the
  component into its own settled state the way its own cleanup does (clear the
  inline entrance styles), which is byte-identically what the reduced-motion
  path renders from the first frame, and say in the report how many you
  settled.
- **KILLING `animation` ALONG WITH `transition` FREEZES ENTRANCE ANIMATIONS AT
  THEIR FIRST FRAME.** The blanket `* { transition: none !important }` this
  section calls for must NOT also say `animation: none` -- six candidates on the
  portal home came back at ratio 1.00 with an accumulated opacity of 0, which
  reads exactly like six real failures and is entirely the instrument's doing.
  Freeze transitions, let animations run, then settle on a TIMEOUT.
- **`requestAnimationFrame` never fires while the pane's tab is hidden.** A Svelte
  flush that depends on rAF never lands, so a synchronous DOM read taken right after
  a state change sees stale values. Confirm by checking whether the read changes
  after a plain `setTimeout` delay instead of immediately. Workaround: flush on a
  timeout, not rAF, when driving or verifying through this pane.
- **`ResizeObserver` never delivers**, and rAF is frozen. Confirm by resizing the
  element and polling the value the callback would have set -- it never changes on
  its own. Workaround: patch the `ResizeObserver` constructor to capture the
  callback, resize the element for real, then invoke the captured callback directly.
- **A stage element measured while its container is `display:none` captures a 0x0
  size PERMANENTLY**, because the app's own recovery path is a `ResizeObserver`
  callback that (per above) never arrives here to correct it. Gate any measurement
  on the container actually being visible before reading its size.
- **`dialog.close()` does not dispatch a `close` event** in this pane, confirmed
  against a bare vanilla `<dialog>` rather than assumed from application code. A
  deliberate close path in code under test should notify its parent directly rather
  than rely on the event round trip when verifying here.
- **`dialog` `close` and `cancel` events do not bubble here**, so Svelte's delegated
  `onclose`-style attribute binding silently never fires. Attach with
  `addEventListener` directly on the element when scripting a verification.
- **Navigation sometimes reports failure while having actually succeeded.** Confirm
  by reading the page (`read_page` / `get_page_text`) rather than trusting the
  `navigate` call's own result.
- **A `git stash` DOES NOT RELIABLY REACH THE SERVED BUNDLE.** A before/after
  measurement taken by stashing the tree and reloading measured the CHANGED
  stylesheet on a stash that had already landed on disk: Vite's watcher had not
  invalidated the module, and the reload served the edited one. It is silent --
  a plausible baseline comes back and the diff simply understates itself.
  **Assert the tree you think you are on by reading a TOKEN the change moves**
  (`--stamp-ink` unset, a `.sep` at 0.6) before running the sweep, and `touch`
  the files after a stash or a pop to wake the watcher.
- **A forced state must be forced onto a UNIQUE node.** `document.querySelector('.sep')`
  returned an unrelated component's separator, because Svelte's scoping hashes
  the STYLE and not the class: four `.sep` elements were in that tree and two
  were the badge's. Anchor a scripted read at a `data-testid`, or at a
  descendant selector under the component's own root, and print the match COUNT
  beside the value -- a single-node read that silently hit the wrong node reads
  exactly like a correct one.
- **A live WebGL canvas hangs pane screenshots.** Read the framebuffer back instead
  (pixel counts, occupancy grids), or use claude-in-chrome.
- **A harness whose loop rides rAF must be told to pump it** (`?glheadless=1` on
  the GREENLINE harnesses, read from the URL so it works on any route). Without it
  the sim silently never ticks and every physics assertion passes vacuously.
- **Enter and Tab dispatched through the pane do not reach a ProseMirror keymap.**
  Text typed with `computer` arrives, but the keys an editor binds commands to are
  swallowed, so a list cannot be indented or split from here. Drive a rich-text
  editor by dispatching a real `paste` ClipboardEvent with a `text/html` payload
  instead -- which is the path most structural editor bugs arrive on anyway -- and
  read the result back as `editorDOM.pmViewDesc.node.toJSON()`, which is the
  editor's own document without needing the instance exposed.
- **A long `await` loop inside one `javascript_tool` call KEEPS RUNNING after the
  call times out.** Keep scripted UI loops short, or verify state before trusting a
  later measurement.
- **The claude-in-chrome tab is a BACKGROUND tab that no OS window shows**, so
  OS-level input (SendInput) cannot reach it and it has no middle mouse button.
  Route real hardware input through a same-origin popup it opens and scripts.
- **A rolling performance counter measures your own instrumentation.** Stop every
  sampler and wait past the window before reading it.
- **No real Chrome is connected in this setup.** Prior sessions checked
  (`mcp__claude-in-chrome__list_connected_browsers`) and found nothing attached --
  claude-in-chrome needs the user to install and connect the Chrome extension on
  their own machine first; there is no way to attach one from inside a session.
  Until then, treat every claude-in-chrome call as unavailable and fall back to the
  `mcp__Claude_Browser__*` pane (with the limits above) or to headless/pixel-level
  reads.

### Machine and toolchain

- **`npm test` must run with `--no-file-parallelism`.** DB files used to starve each
  other's `beforeAll` because each booted its own embedded Postgres; they now share
  ONE cluster (see Testing), which is the fix for that, not more concurrency. The
  flag stays: a shared cluster is a shared resource, and serial files are what keep
  each file's own database the only isolation question worth answering.
- **`npm run build` dies on Windows in the Vercel adapter's `closeBundle` with
  `EPERM`** writing a path Windows cannot create. Machine-level and PRE-EXISTING,
  not a code failure; Vercel builds on Linux and is unaffected. It does NOT stop
  the one check a local build is wanted for: SvelteKit's illegal-import pass runs
  during compile, so a `$lib/server` leak into client code still fails loudly first.
- **Generated route types go stale after adding a load key** -- run
  `npx svelte-kit sync`, or `svelte-check` reports a phantom error.
- **`cannon-es`: a static body keeps a stale world AABB** computed while its
  quaternion was identity, and raycasts (unlike contacts) are AABB-culled. Call
  `updateAABB()` after rotating a static ground plane.
- **`supabase functions serve` DOES NOT RELOAD A FILE OUTSIDE
  `supabase/functions`, and its Deno cache outlives the container.** The CLI
  bind-mounts each `src/lib` file an Edge Function imports, so the import
  resolves -- but the compiled module is cached in the
  `supabase_edge_runtime_<project>` Docker volume, and a Windows bind mount's
  mtimes do not invalidate it. Editing shared code then re-running measures the
  OLD bundle, silently and plausibly: three separate measurements were taken
  against a stale one before this was found. Killing the CLI is not enough
  either, because the container keeps serving. **Remove the container AND the
  volume, then restart**, and prove which code is live by returning a marker
  from the function rather than by assuming.
- **`cannon-es`: `wheelInfo.isInContact` is not readable from game code** --
  `updateWheelTransformWorld` clears it every frame. Use
  `vehicle.numWheelsOnGround`.

---

## Testing

`npx vitest run --no-file-parallelism` (config `vitest.config.ts`, specs in
`tests/`). This is the **only** automated suite, and it is deliberately narrow.

- **Automated tests are the exception, not the default.** New work is verified by
  dev harnesses and browser passes. **Add a test only for a guarantee whose
  regression would be SILENT** -- security boundaries, exclusion filters, data
  visibility, migration-over-real-data. Feature correctness that fails visibly
  belongs in a harness.
- **`vitest.config.ts` is standalone, not an extension of `vite.config.ts`.**
  These are database tests: no Svelte, no DOM, no SvelteKit. It carries only the
  aliases needed to import a REAL module rather than a copy of it.
- **The fixture is a REAL embedded Postgres with the REAL migration files applied
  unmodified** (`tests/db/harness.ts`). `tests/db/supabase-stub.sql` supplies only
  what lives OUTSIDE `supabase/migrations` (the roles, `auth.users`/`auth.uid()`,
  enough `storage`). **Nothing in the stub re-implements a migration**; if a
  migration would fail on a real project, it fails here.
- **ONE cluster per RUN; one DATABASE per `startTestDb` call.** `tests/db/cluster.ts`
  is a vitest `globalSetup` that boots a single embedded Postgres for the whole run.
  `startTestDb` does not boot a server: it creates a fresh database on that cluster,
  applies the stub and the requested chain to it, and drops it in `stop()`. Booting
  per file cost a measured 5.49s x 48 = 263s of a 320s run; it is 5.7s once now.
  **Write a test exactly as before** -- the `startTestDb()` signature is unchanged.
- **ISOLATION IS THE DATABASE BOUNDARY**, chosen over the two alternatives on
  purpose. A per-file SCHEMA would mean rewriting migration SQL (they name `public`,
  `auth` and `storage` literally) or bending `search_path`, which is the very thing
  the SECURITY DEFINER functions under test pin against. Transactional rollback
  cannot work here because `asUser` deliberately runs outside a transaction: many
  tests assert a statement is REJECTED, and one rejection poisons everything after
  it. Separate databases mean separate catalogs, so nothing a file leaves behind is
  reachable from another even by name.
- **The migrations run per database rather than from a TEMPLATE**, and the number
  says why: 50 `startTestDb` calls request 37 DISTINCT chains, so a template cache
  would warm only 13 of them, at 0.28s each. Applying them keeps the fixture's
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

## Content, copy and legacy

### Copy conventions

- **No em dashes in user-facing copy.** Use commas, periods, or "to" for ranges.
- **`i¢` is the IDEA Coin symbol, written as the raw character** -- never the
  `i&cent;` entity, never the word "coins" beside a rendered value. It trails the
  number the way a dollar sign leads one. `COIN_SYMBOL` in
  `src/lib/coin-format.ts` is the one spelling, and `tests/coin-symbol.test.ts` is
  what ENFORCES it: a constant only makes the right thing available, it does
  nothing about the next literal typed into a template.
  - **Exclusions a blanket replace would corrupt:** GREENLINE's `IC` (Ignition
    Credits, a separate currency), VANGUARD's own currency string, the archived
    Sheets-era code under `docs/`, and the three SVG `<text>` glyphs that keep the
    numeric-entity form.
- **Error messages name the problem in the user's terms**, never our storage
  vendor or our table names ("This entry has nothing in it", not "A Drive file id
  is required").

### The classroom update log -- STANDING DIRECTIVE

`classroom-updates.json` at the repo root is the student-facing changelog,
rendered at `/classroom/updates`.

**EVERY session that changes classroom-facing behaviour appends a dated,
student-readable entry BEFORE committing.** Shape:
`{ date: 'YYYY-MM-DD', title, body, tags?: [] }`.

"Student-readable" is the whole bar: no table names, no migration numbers, no RPC
names, no jargon. Write what a student will notice and what they should do
differently. An entry naming `classroom_items` is a commit message that wandered
into the wrong file. A change with no student-visible effect needs no entry; a
change to what a class SEES always does.

### Commit subjects are user-facing changelog copy

The site changelog and every page's version are **auto-generated from git history**
and never hand-edited (`virtual:site-versions` from `vite.config.ts`, rules in
`src/lib/site-versions.ts`, manifest in `src/lib/site-manifest.ts`). The first line
of every commit shows up on `/`. There is no changelog file to update; making a
commit is the update.

- **The rules live in `src/lib/site-versions.ts`, NOT in the build config.**
  `vite.config.ts` only gathers. A build config is the one file a test cannot
  reach, so it holds nothing worth testing.
- **A version is a commit count, so it is only true over a COMPLETE history.** Over
  a shallow clone it slides BACKWARDS; the build detects that and emits no version
  at all rather than a number that can decrease. Set `VERCEL_DEEP_CLONE=true` in
  the Vercel env to get versions in production.
- **NO IDENTIFIER AVAILABLE HERE IS A FUNCTION OF THE BUILT ARTIFACT, and anything
  recording one says which it took.** `deploy.sha` is the git commit the
  deployment was built FROM (exact about the input, silent about the output);
  `$app/environment`'s `version` is SvelteKit's build id, which is a TIMESTAMP and
  changes on every build of identical code. `describeBuild` in
  `src/lib/feedback/context.ts` picks one and stores what it means in words beside
  it. A plausible-looking hex string with no provenance is read as a content hash
  by the next person to see it, and the wrong build gets bisected.
- **Registering a new app** means adding it to `APPS` in `site-manifest.ts` with
  the paths it claims.
- **Different shas on two routes mean different deploys, not a broken build** --
  the classroom GitHub export pushes to `main` on every item save, and each push is
  a deploy. The service worker (`static/push-sw.js`) has no fetch handler and
  caches nothing, so it is never the explanation.

### Carrying over legacy content

Legacy HTML is served without rebuilding or modifying its internals. **All later
carried-over content must follow one of these three patterns:**

1. **Public static** -- copy unchanged into `static/`; served at the site root.
   **Link to the explicit `index.html`**: the Vite dev server does not resolve a
   bare directory to it (Vercel does), so `/coins/index.html` works in both.
2. **Public raw-import endpoint** -- HTML lives OUTSIDE `static/` in
   `src/lib/legacy/`, pulled in at build time via Vite raw imports
   (`import.meta.glob(..., { query: '?raw' })`), **never runtime `fs` reads**, so it
   works on Vercel serverless. A `+server` endpoint returns it after
   `rewriteLegacyLinks`.
3. **Role-gated endpoint** -- the same, plus a `profiles` role lookup via
   `locals.supabase`. A link renders only for the right role, but the server-side
   check is the real guard.

**Serve-time injection is the convention for anything added to legacy HTML** (link
rewriting, the version badge, VANGUARD's cloud-save bootstrap): applied to the
served STRING, never to the source file on disk.

**Asset paths.** Legacy files assume the old `/IDEA/` base path. Three mechanisms
resolve it without editing them: the `static/IDEA/` icon mirror,
`rewriteLegacyLinks()` at serve time, and exact-path 308s in `hooks.server.ts`.
**Those redirects are keyed WITHOUT a trailing slash** -- SvelteKit normalizes
`/IDEA/` to `/IDEA` and redirects before any hook runs, so with-slash keys can
never match. When adding legacy HTML, check its references against all three and
flag anything else (per-page assets).

### The freeze, and its one exception

**Do not modify the internals of carried-over legacy files.** The exception is
**VANGUARD**: `src/lib/legacy/vanguard/index.html` is the editable canonical source
and idea-app is its home. Game-feature edits are expected, but must stay
**surgical** -- the smallest unique chunk, no full-file rewrites, no reformatting
churn. The `vanguard_*` localStorage key pattern is the state convention (a
non-synced key uses a different prefix, e.g. `vgcoop_`). Any other legacy file is
unfrozen only by an explicit rule added here first.

**The retired Sheets coin ledger is ARCHIVED under
`docs/coin-economy/archive/legacy-system/`, not deleted.** `docs/` is not served and
is on no import path. **It is historical reference and must never be reintroduced.**
Reading its committed CSV DATA as a test fixture is fine and is not a
reintroduction.

**VANGUARD's Apps Script backend is a DIFFERENT deployment and stays live.** Check
the script id before touching any Apps Script reference.

---

## Visual theme

The app shell uses the **IDEA Green** aesthetic. The token set and font stack are
the source of truth; **do not invent colours or swap fonts.**

- **Tokens** are CSS variables in `src/app.css` (`:root`): backgrounds
  `--bg0`/`--bg1`/`--bg2`; `--green` (primary), `--gold` (special callouts),
  `--cyan` (metadata: role, timestamps, version), `--amber` (warning), `--teal`
  (in progress), `--violet` (special, sparingly), `--white` (body text), `--dim`
  (secondary/placeholder), `--ice` (disabled). **The semantic roles are fixed; do
  not reassign them.** Never use pure red, pure white (`#FFFFFF`), or pure yellow.
- **`--crimson` is reserved for live / rec / error status only**, never a general
  accent and never an identity colour.
- **`--green` is for primary actions, active navigation, focus, success and
  completion** -- not static labels, quiet borders, data values, or decoration.
- **Fonts:** `Rajdhani` (display, body, input values) and `Share Tech Mono`
  (metadata, button/nav labels, mono chrome), via `@fontsource`. `/` and `/archive`
  additionally use `Orbitron`. **Never Arial, Inter, Roboto, or system fonts** in
  the IDEA shell -- the notebook's system-sans stack was the last exception and it
  is gone. **A face is named through its TOKEN, never as a literal:**
  `--font-display`, `--font-mono`, `--font-title` (Orbitron), `--font-hero`. Each
  resolves to exactly the string it replaced, so pointing a rule at one is a
  rename, not a restyle.
- **A BOUNDARY THAT CARRIES MEANING AND ONE THAT DECORATES ARE TWO TOKENS**
  (`IDEA_INTERFACE_STANDARDS` 10), and the distinction is made AT THE POINT OF
  USE. `--boundary` is the load-bearing one and clears 3:1 against every ground
  it can land on; `--hairline` is decoration and is not measured.
  - **`--boundary` IS TAKEN BY THREE THINGS AND NOTHING ELSE:** the outer edge
    of an interactive control, a divider that is the ONLY separator between two
    adjacent interactive rows, and the edge of a card sitting on the page plate
    (`--bg1` on `--bg0` is 1.18:1, one region to the eye). Everything else --
    a rule between two paragraphs in a card, a table cell edge, the frame on a
    thumbnail, a static chip -- keeps `--hairline`.
    - **A SEPARATOR GLYPH IS A BOUNDARY, AND A HAIRLINE TOKEN MUST NEVER PAINT
      ONE.** A rule weight is authored to sit BELOW every text threshold,
      because a hairline is a line drawn beside content and never a mark drawn
      as content. The notebook's meta middots were `--nb-hairline-strong` and
      measured 1.48:1 on the light plate's card, 1.58 on the default and 1.63
      on IDEA -- invisible on all three, so the thing they exist to separate
      was not being separated on any of them, and nothing on screen reports
      that. They take the room's `--boundary` (per-plate already, so one rule
      fixes three), and they clear the 3:1 a boundary carries rather than the
      4.5 of the text beside them.
  - **DO NOT RAISE `--hairline`. That is the rejected alternative, and it is one
    line.** It is drawn on ~190 elements in the classroom alone, almost all of it
    decoration; raising the one token draws every one of them at full strength
    and turns a tuned surface into a wireframe, which nothing on screen reports.
    `tests/boundary-token.test.ts` reddens on it, and on a decorative rule swept
    onto the load-bearing token.
  - **IT IS PER ROOM, LIKE `--hairline` IS.** `.nb-root` aliases it to
    `--nb-boundary`, which each notebook plate declares for itself. The `:root`
    value is measured against dark green plate and is 1.29:1 on paper.
  - **THE VALUE MOVES IN LIGHTNESS ONLY**, on the room's own hue and saturation
    -- `--boundary` is `--text-3`'s hue at 46% instead of 38%. `--text-3` itself
    was the obvious candidate and does NOT clear: 2.95:1 on `--surface-2`, which
    is exactly where the grading console's option controls sit, so the local
    override that had been taken as "3.13:1" had been measured against the wrong
    ground.
  - **THE LAUNCHER'S `--acc-edge` IS THE SAME CONTRACT WITH AN IDENTITY COLOUR
    IN IT**, and is the one place that spells it separately: a card's edge
    carries the app's brand, and swapping in a neutral grey would delete eleven
    deliberate identity decisions to satisfy a rule the accent already meets.
  - **MEASURE BY PAINTING TO A CANVAS AND READING THE PIXEL BACK.** These
    resolve to `color(srgb ...)` and `color-mix(...)`, which a regex over
    computed styles skips silently and then reports the plate instead of the
    real ground. Composite the colour over its ground and read the composited
    value; an alpha rule's ratio depends on what is behind it.
- **Shared classes** live in `src/app.css`. The `.legacy-index` theme is scoped
  under that wrapper so it never affects the app shell.
- **The animated emblem** is `src/lib/brand/AnimatedLogo.svelte`, prop-driven so
  the same component is the animated hero mark and the static fallback. Its spin is
  gated behind `prefers-reduced-motion: no-preference`.
- **Everything animated is gated behind `prefers-reduced-motion`.**
- **Launcher cards carry a PER-APP accent AND an optional per-app TEXTURE, both
  declared in the stylesheet and keyed on `data-app`, with the shared brass/gold
  pair and the brushed-metal token as the live defaults.** The identity is
  deliberate: GAUNTLET and GREENLINE carry their product colours, VANGUARD its
  arcade green, the FRC card FIRST's red and blue, Tournaments its room's
  `--tnm-accent`/`--tnm-gold`, and the Coin Ledger the neon-terminal palette its
  own page is built from. An app that declares nothing takes the shared pair, so
  a NEW card looks right with no entry anywhere.
  - **A CARD QUOTES ITS OWN ROOM OR IT DECLARES NOTHING.** Those are the only two
    honest answers. A pair invented for a card whose app has no colours of its own
    is inventing an identity for the app -- classroom, coin-desk, dashboard and
    admin take the default for exactly that reason. And a card whose room DOES have
    a rule inherits the rule with the colours: Tournaments spends its emerald once,
    on the mark, because "at most one dominant emerald element per screen" is that
    theme's own hard constraint.
  - **A rule may declare a TEXTURE and still take the shared accent** (the notebook
    card: brass is correct for it, and restating a default is how a default
    drifts). What a `[data-app=...]` rule may not be is inert -- it has to carry at
    least one of the five per-card properties, which
    `tests/home-order-and-accent.test.ts` asserts.
  - **THE FRC MARK IS NEVER ANIMATED, and that outranks matching the cards either
    side of it.** FIRST's brand guidelines prohibit altering the mark, and motion
    is an alteration. Every other app mark is a component in `$lib/marks` with a
    3-4.6s loop gated behind `prefers-reduced-motion: no-preference`, and
    **nothing is hidden in a base state**: with the animation cancelled every
    animated element is at full opacity and no transform, so a reduced-motion
    reader sees the whole glyph.
  - **THE MECHANISM IS THE RULE, AND IT IS A CASCADE ARGUMENT, NOT A TASTE
    ONE.** The pairs used to arrive as an INLINE style written from a
    `PortalApp.theme` field, and **an inline custom property beats every class
    rule** -- so `.app-card`'s shared pair was dead code that could not paint,
    no later rule could correct a single card, and the value was discoverable
    only by reading the registry. They are now plain rules on
    `.app-card[data-app='<id>']` in `AppLauncher.svelte`, which sit INSIDE the
    cascade: the default is reachable, and overriding one card is one selector.
    **There is still no colour field on `PortalApp`** -- `src/lib/portal-apps.ts`
    carries an app's identity, never its paint, because a field there is how the
    value gets read back onto the element again.
  - **AN IDENTITY COLOUR IS NEVER MOVED TO PASS A CONTRAST CHECK; the derived
    value moves.** `--acc-primary`/`--acc-secondary` are the brand. `--acc-ink`
    is the glyph colour every text, icon and edge derives from, defaulting to
    the identity, and it is what a card re-pins when the brand cannot carry
    text. FRC is the only case: #ED1C24 measures 3.41:1 on `--bg1` (it is made
    for the white paper `.frc-root` puts it on), so the ink is the same hue and
    the same saturation at 68% lightness instead of 52%. **Lightness only --
    desaturating is how a brand quietly stops being itself.** If a colour cannot
    clear while staying recognisable, say so and stop.
    - **THIS IS NOT A LAUNCHER RULE, IT IS THE RULE, and there are three of it
      now.** `--acc-ink` for a card, `--violet-ink` for anything painting a WORD
      in `--violet` (the raw accent measures 2.88 / 2.45 / 2.30 as text on
      `--bg0` / `--bg1` / `--bg2` -- not a near-miss, unreadable), and
      `Pathway.ink` in `src/lib/pathways.ts` beside `Pathway.color`. In each the
      IDENTITY paints the fill and the edge and the INK paints the word and the
      glyph, the ink DEFAULTS to the identity where the identity already carries
      text (three of the six pathways do, and simply repeat it), and the move is
      lightness only. `pathwayInk()` sits beside `pathwayColor()` so "tint this
      name in the pathway colour" has a right answer to reach for.
  - **`--acc-edge` IS THE SHARED `--boundary` CONTRACT WITH THIS CARD'S
    IDENTITY COLOUR IN IT** (see the `--boundary` rule above for the contract
    itself). It draws the card edge, the only thing separating a card from the
    page, so it clears 3:1. `--acc-line` outlines the CTA pill, which decorates
    a label nobody can operate on its own, and stays faint. This is the ONE
    place the neutral token cannot be used: the edge carries the brand.
  - **A HOVER FILL IS PINNED, NEVER MIXED FROM THE INK ABOVE IT.** The CTA
    pill's hover background was `color-mix(ink 12%)`, so lightening the ink
    lightened its own ground with it: sweeping FRC from 80% to 40% brand red
    moved that case 3.41 to 4.89 and cost the whole colour. Pinned to `--bg2` it
    stops chasing.
  - `tests/home-order-and-accent.test.ts` enforces all of this; a stylesheet
    only makes the right thing available.
- **Background:** the `.bg-fx` scanline + vignette overlay, disabled under reduced
  motion. Legibility first.

### Scoped themes are deliberately off-brand, and stay in their room

Each is scoped under one wrapper class, opaque, at `z-index: 1` so `.bg-fx` never
shows through, and neutralizes the app-shell globals that would leak (the green
`// ` h2 prefix, the link glow):

**A SHARED COMPONENT MOVING INTO A SCOPED ROOM READS ITS COLOURS THROUGH A ROOM
HOOK, and the portal token is the FALLBACK.** `var(--body-link, var(--cyan))`,
the way `Disclosure` reads `--disc-accent`. The portal's semantic tokens are
tuned for a dark plate, so a component built in the shell and mounted in a light
room carries values measured against the wrong ground: `ItemBody`'s link landed
at **2.00:1**, `SaveIndicator`'s failed message at **3.65:1** and
`VersionBadge`'s stamp at **3.20:1** on the notebook's paper the first time
each arrived there. **The stamp is the one that says to go LOOKING**: nobody
carried it into the room -- it had been mounted in every notebook header all
along, reading `--dim` off a plate it has never been on, which is what a hook
audit finds and a change review never does. Written as a hook the
shell renders byte-identically and the room points the name at the corrected
value it already has (`--nb-accent-ink`, `--nb-error`) -- and the hook is
declared ON THE ROOM'S OWN WRAPPER, never on the component, or it sits on a
descendant and beats the room. **MEASURE WHEN A SHARED COMPONENT ENTERS A NEW
ROOM**; both of those had passed review in the room they were written for.

**AND THE SAME ARITHMETIC BINDS A TOKEN MOVE, IN THE OTHER DIRECTION: A PORTAL
TOKEN CANNOT BE RAISED TO FIX A PORTAL GROUND UNTIL THE LIGHT ROOMS THAT READ IT
HAVE BEEN MEASURED.** `--dim` clears only the DARKEST of the three portal
grounds -- 5.31 on `--bg0`, **4.46** on `--bg1`, **4.24** on `--bg2` -- and the
obvious answer, lightening it (hue 105deg and 6.7% saturation held, 53.3% ->
56%, `#8b9687`, giving 5.76 / 4.90 / 4.60), is REFUSED: `--dim` is also read by
five FRC components on `.frc-root`'s paper, where it already measures 2.95 /
3.23 and the candidate takes it to **2.72 / 2.98**. Degrading a room the sweep
did not cover, to fix one it did, is the exact mistake this whole section
exists to name. So the two failing CALL SITES took `--text-2` (the register's
own token for secondary labels and meta, 6.91 / 5.88 / 5.51 on the same three
grounds) and the token did not move. **`--dim` on `--bg1` or `--bg2` is still a
failure waiting for a use**, and FRC's own `--frc-gray` measures 2.77 on its own
surface, so the room needs a hook of its own before either can be fixed
properly. That is a bundle, not a line.

- **`.gt-root` -- GAUNTLET VIEWPORT** (`docs/GAUNTLET-DESIGN.md`). All GAUNTLET UI
  must conform. Read tokens and reuse the viewport components rather than writing
  one-off styles. The volumetric CAD background replaced the scrolling isometric
  grid, which is **retired -- never reintroduce it**. The FeatureManager rail is
  hidden by default; do not make it visible by default. Modeling modes green,
  knowledge modes cyan. **SOLIDWORKS branding is nominative text only: never the
  logo, a lookalike, or its red-on-white scheme**; the Dassault Systemes disclaimer
  footer stays on every page. The VIEWPORT layer is visual only -- it never touches
  data flow, auth, scoring, or room timing.
- **`.nb-root` -- notebook editorial**, default / light / IDEA palettes. Tokens only:
  a rule needing to know which palette is showing should have been a token.
  - **THE DEFAULT PLATE IS THE CLASSROOM'S CONSOLE REGISTER, UNCONDITIONALLY, and
    `prefers-color-scheme` reaches NOTHING in this room.** Six `--nb-*` tokens map
    one to one onto the `:root` register (`--surface-0/-1/-2`, `--text-1/-2`,
    `--boundary`) and are written out as LITERALS -- `.nb-root` aliases
    `--surface-1` back to `--nb-surface`, so an alias in that direction closes a
    cycle. The warm near-black "dark" plate that used to hold this slot is RETIRED:
    it was the notebook holding a private opinion about what a dark room looks
    like, one step away from the classroom a student had just come from. Light and
    IDEA are both opt-in, both unchanged, and a plate that no longer exists is
    answered in `read()` (`notebook-theme.svelte.ts`) rather than by keeping a CSS
    block, an attribute value or a picker row alive for it.
  - **What the register has NO counterpart for is AUTHORED and MEASURED, never
    borrowed across.** `--nb-ink-faint` is the case that proves it: the classroom's
    `--text-3` fails 4.5:1 on all three grounds of this plate (3.29 / 3.13 / 2.95)
    because it is decorative there and real muted copy here.
  - **The palettes are BACKGROUND PLATES, not an identity.** They exist so a student
    can read a photograph of paper in different lighting. The notebook is on the
    platform's type, radius and spacing -- Rajdhani, `--radius-*`, `--space-*` --
    exactly as the classroom is, and switching a plate must change nothing else.
    The room's private system-sans stack and its own 10px/6px corners are RETIRED;
    do not reintroduce a notebook-only type or corner scale.
  - **THE ROOM ALIASES, IT DOES NOT REDECLARE.** `.nb-root` points the shared names
    at its own plate (`--surface-1: var(--nb-surface)`, `--text-1: var(--nb-ink)`,
    `--hairline: var(--nb-hairline)`, and so on), so every notebook component reads
    the same vocabulary the classroom does. **The alias must stay on `.nb-root`
    itself.** Writing the plate values straight onto `--surface-*` in the palette
    blocks would put the LIGHT set at `:root` (where the light palette lives) and
    repaint the classroom, the reference viewer and view-as in paper white. Source
    and target on the SAME element is also what keeps the
    var()-resolves-where-declared trap off this: it needs a descendant
    redeclaration, and an alias is not one. **The canvas mirror
    (`body:has(.nb-root)`) must keep naming `--nb-bg`** -- `body` and `:root` are
    ANCESTORS of `.nb-root` and cannot see the alias.
  - **`--text-3` does not mean "below the text threshold" in here.** In the
    classroom it is decorative tertiary; in the notebook it is real muted copy.
  - **MUTED COPY THAT SITS ON AN ACTIVE FILL TAKES `--text-2`, NEVER `--text-3`.**
    The plate tokens are tuned against the three plate GROUNDS, and
    `--nb-accent-wash` is a veil laid ON one of them: it lightens the ground out
    from under the text on a dark plate and the tier below stops clearing. Measured
    on the nine combinations (three plates x three grounds the wash can land on),
    `--text-3` fails six of them -- 3.30 to 4.31 -- while `--text-2` clears all
    nine, worst 4.89. `NotebookThemeToggle`'s `.option.current .note` and
    `NotebookView`'s `.pick.selected .pick-meta` are the two rules that implement
    this; a third surface putting muted copy on a selected row joins them.
    **Lowering the wash is the rejected alternative:** at the 6% that would rescue
    `--text-3` the fill measures 1.09:1 against the card, so the selected row stops
    being marked at all.
  - **AND THE SAME GROUND ARITHMETIC BINDS THE ROOM'S OWN INKS, NOT ONLY THE
    BORROWED TIERS.** A plate has SIX grounds, not three: `--nb-surface`,
    `--nb-bg`, `--nb-surface-dim`, and the wash laid over each of them. Every
    `--nb-*` ink is measured against all six or it is not measured. The light
    plate's were checked against the bare three only, and the missing half is
    exactly where they failed -- `--nb-accent-ink` at 4.25/4.32/4.45 across 15
    distinct candidates, `--nb-warn` failing four of six from 4.33 down,
    `--nb-ok` failing the recessed plate at 4.33. Deepening the ink is the fix
    (lightness only for a hex, the dark-end fraction for a `color-mix`); the
    hue identity never moves.
  - **A WASH IS A SIGNAL, AND A SIGNAL IS NOT THE THING TO SPEND.** Thinning it
    to rescue an ink is refused, and the measurement is why rather than the
    taste: carrying `#8a6d24` to 4.5 on wash-over-page needs 5% alpha, where
    the fill reads **1.04:1** against its own card; it still cannot reach 4.5
    on wash-over-recessed at ANY alpha (best 4.20, because thinning only
    asymptotes to the bare plate, which was already failing); and it does
    nothing at all for the candidates sitting on a bare recessed plate with no
    wash under them. A lever that cannot reach the target, and destroys the
    signal on the way, is not the lever.
  - **What stays notebook-named is what has no counterpart**, not what someone
    liked: `--nb-shadow` (there is no `--shadow-*` family), `--nb-hairline-strong`
    (the platform has one rule weight; `--line-strong` is mint green),
    `--nb-ink-hover`, the accent trio, `--nb-ok/-error/-warn` (the raw semantic
    tokens are the UNCORRECTED values these exist to correct), `--nb-masthead`, the
    folder colours, `--nb-cell-*` and `--nb-shot-*`.
- **`.cr-root` -- classroom calm surfaces.** `--cr-gutter` and `--measure-*` are the
  ONE page-width decision (`classroomMeasure` in `nav.ts`).
- **`.glb` -- GREENLINE brand** (`Greenline Art Direction Reference.html`,
  direction "1A / IMPACT"). Chrome/steel dominant; **GREEN is surgical** (one
  signature thread, the player's own machine); **AMBER is impact state only**, never
  ambient. Archetypes read by silhouette, never hue.
- **`.frc-root` -- FRC navy/red** with the official FIRST logo used UNMODIFIED
  (never recolour, distort, stretch or crop; keep the clear space). IDEA green
  appears ONLY for the achievement state and the "An IDEA program" footer mark. The
  trademark line stays: "FIRST and FIRST Robotics Competition are trademarks of For
  Inspiration and Recognition of Science and Technology (FIRST)."
- **`.fsp-root` -- FSP neutral navy/gold**, system sans. Deliberately not IDEA.
- **`.tnm-root` -- Tournaments emerald.** **Restraint is a hard rule: at most ONE
  dominant emerald element per screen** (the active-match indicator, the primary
  action, or one key status); a third surface takes the panel token instead. Gold is
  placement and rank only. Per-entry banner styles are a SEPARATE palette the students
  own and are never constrained by these tokens.

**Scrollbars:** styled once per room (`scrollbar-color` inherits; `scrollbar-width`
does NOT, so it is set on `.cr-root, .cr-root *`). The thumb is a tertiary token,
never the accent. **No region may hide its scrollbar.** A gradient says there is
more; it is not a control. A region loses its scrollbar only by no longer
scrolling.

### Performance budget

The target is **the school's desktop computers, roughly 6-8 years old** -- a real
but aging GPU budget, not tablets. Moderate polycounts, geometries and materials
reused across instances (draw calls are the budget to watch), no dynamic per-light
shadows. Raise a field-size or fidelity cap only behind a measurement.

---

## Working conventions

- **Intent-based, surgical edits.** Change what the task needs and no more.
- **Do not duplicate a rule.** A second implementation of a check, a formatter, a
  ladder, or a piece of arithmetic is the thing that quietly stops matching. When
  two places need one behaviour, extract it or have one call the other. A retired
  path is REMOVED, not left as a dormant fallback -- a second way in is a second
  thing to keep authorized.
- **A SESSION THAT CREATES MIGRATION FILES LISTS THEIR FULL REPO PATHS AT THE END
  OF ITS RESPONSE**, one line per file, in apply order. They are pasted into the
  Supabase SQL editor immediately, so the path belongs where it is about to be
  used. A session that created none says nothing.
- **State plainly what was NOT verified**, and why -- the live Supabase project, a
  real Drive round trip, a signed-in session, screenshots. "Not verified" is a
  result; silence is not.
- **Single-item work commits straight to main.** A one-file fix, a copy change,
  or any bounded update that is correct on arrival needs no branch.
- **Work that should not be live while it is being built goes on a short-lived
  branch named `lane/<short-thing>`.** Every push to `main` deploys
  `ideabosco.com`, which students use during class.
- **Before merging:** pull the latest `main` into the branch and resolve every
  conflict ON THE BRANCH, never on `main`. Merge with `--no-ff` so the feature
  reverts as one commit. Delete the branch once the merge lands.
- **Verify the branch on its Vercel preview URL before merging.** A branch never
  opened in a browser bought nothing over pushing to `main`.
- **If a session ends with a branch still open, report the branch name and what
  is unfinished on it.** An unmerged branch is invisible work.
- **Never force-push `main`.** Not `--force`, not `-f`, not
  `--force-with-lease`. The repo holds the only archive of exported material
  revisions.
- **Never put a migration on a branch.** There is one production database, so a
  migration is global regardless of which branch its file lives on. Migration
  work happens on `main`.
- **Never write to `materials/` from a branch.** The app writes export commits
  there with no human involved; a branch that touches it will conflict with an
  export.
- **Only one Claude Code session per working directory, ever.** Use a git
  worktree for a parallel lane -- two sessions in one directory share a working
  tree, and each will commit the other's half-finished edits.
- **Commit and push every session.** Do not leave work uncommitted -- merged to
  `main` where the work is single-item, or landed on its `lane/` branch with
  the branch's status reported.
- **Interactive/visual verification:** when a task involves interactive or visual
  UI (custom viewers, canvas/three.js, animations, drag/pan/zoom, pop-out/PiP,
  complex forms -- anything whose correctness is invisible to type-checking), you
  must (1) add or reuse a dev-guarded harness route that renders only when `dev` is
  true, **returns 404 in production**, needs no auth or Supabase, and mounts the
  REAL component with representative sample data, and (2) verify every interaction
  in a real browser through it before finishing. Report what you verified.
  `svelte-check` passing is necessary but not sufficient. **Harness routes stay in
  the repo as regression tools.**
- **A harness must mirror the whole mechanism it stands in for.** A harness missing
  a guard the real page has makes a passing drive prove nothing.
- **Prefer measuring to reasoning.** Where a claim can be measured -- a width, a
  frame cost, a row count, a contrast ratio, which lens a camera opened -- measure
  it and report the number. Several rules here exist because a plausible
  explanation was wrong and the measurement said so.

### Keeping the documentation current -- READ THIS BEFORE WRITING EITHER FILE

The two files have different jobs, and the split is the point.

- **A shipped bundle appends its record to `docs/HISTORY.md`**, at the end,
  following the existing shape: what changed, the load-bearing decisions and why,
  what was measured, what is explicitly NOT verified, what was deferred. Add its row
  to that file's migration index if it ships SQL. **This is the default destination
  for a session's writeup.**
- **Something is promoted into `CLAUDE.md` only when it changes how a FUTURE
  UNRELATED task should be done.**
  - "0117 added restore RPCs" is history.
  - "A dev harness mounts the component under test, never a copy of it" is a rule.
  - A named trap that will bite again is a rule; the bug report that found it is
    history.
- **When a rule here changes, edit it IN PLACE and put the reasoning in the history
  entry.** Do not append a second, newer statement of the same rule -- `CLAUDE.md`
  must never contain two versions of one rule, and must never grow a section per
  bundle.
- **`CLAUDE.md` is authoritative. `docs/HISTORY.md` is a dated record** and is not
  edited to match later changes. If they appear to disagree, `CLAUDE.md` wins.
- New routes, tiers, roles, env vars, traps or conventions update `CLAUDE.md` in the
  same change that introduces them.

### Standards copied in from outside -- READ, CITE, NEVER EDIT

`docs/standards/` holds the IDEA programme standards. They are **authored and
maintained OUTSIDE this repository**; what is here is a **copy**, kept so that work
in this repo can read and cite them without leaving it.

- `docs/standards/IDEA_INTERFACE_STANDARDS.md` -- layout, viewport behaviour, role
  parity, legibility, interaction structure.
- `docs/standards/IDEA_MATERIAL_SPEC_v2.md` -- the canonical material authoring
  format: both kinds, the block types, the enforcement matrix.
- `docs/standards/IDEA_RUBRIC_STANDARDS.md` -- leveled criteria, `short` forms,
  descriptor writing, grading behaviour.
- `docs/standards/IDEA_VERIFICATION_ADDENDA.md` -- **a STAGING file, not a
  standard.** Rules written here on their way UPSTREAM, held in the directory so
  work in this repo can read them before they land. It is DELETED once they merge
  into the authored originals, so nothing may treat it as a durable citation
  target: cite the standard the rule ends up in, not this file.

**Cite them by section**, the way the code already does (`IDEA_INTERFACE_STANDARDS`
10, `IDEA_MATERIAL_SPEC` v2.2), and cite the path under `docs/standards/` so the
reference resolves for the next reader.

**Never edit a file in `docs/standards/`.** A correction goes UPSTREAM to the
authored original and comes back as a new copy. Editing here produces a document
that disagrees with the one everyone else is reading, with nothing anywhere to say
which is real -- and the copy would be overwritten by the next one to land.

- **The header version and the newest changelog entry must agree**, which
  `tests/standards-version-header.test.ts` asserts over every file in the
  directory. A header that has fallen behind its own changelog reads as correct and
  has already caused a document to be rewritten from a stale base. The test refuses
  the copy; it does not repair it.
- **Their companions are NOT mirrored here** -- `IDEA_VERIFICATION_STANDARDS.md`,
  `IDEA_Design_System.md` and `IDEA_MATERIALS_PROCESS.md` live only upstream, and the
  copied documents cite them by bare name. A bare name with no `docs/standards/`
  path is that: a pointer out of the repo, not a broken link.
- **`docs/IDEA_MATERIAL_SPEC_v1.md` is a deliberate stub, not a standard**, and
  says so. It stays because an agent once cited it as authority; a stub that names
  the real document fails loudly where a deletion fails silently.
- **Where a standard and the code disagree, that is a bug in one of them and worth
  raising.** It is not licence to pick whichever is convenient. `CLAUDE.md` still
  wins on how work in THIS repo is done.

---

## Scope

- **No new coin-economy surface without reading the price list.** Every category
  name, price and rule transcribes
  `docs/coin-economy/idea_coin_economy_draft_v3.md` and
  `idea_coin_quick_reference.md`. Read those before changing a price. Supabase is
  the sole system of record for IDEA Coins; there is no second ledger.
- **AI levels on assignments are set by ASKING THE INSTRUCTOR**, never inferred
  from the content. `docs/policy/IDEA_AI_Use_Policy.md`'s category-defaults table is
  the starting point for that conversation, not a rule that self-applies.
- **A module's `instructions` carry a 250-word TARGET and a 300-word CEILING**
  (`IDEA_MATERIAL_SPEC` v2.1). Instructions and the input tables share one scroll
  column on the item page, so teaching that explains WHY belongs in the unit
  reference document and only bench procedure stays in the item. **The two
  numbers are enforced in two different places, on purpose:** 251-300 is a
  non-blocking WARNING from `validateSpec`, rendered in SpecImporter's problem
  list and never gating publish; 301 fails `tests/spec-instructions-budget.test.ts`
  by name and by count. **The count comes from the renderer's own
  `parseMarkdown` walk** (`instructionsWordCount`), never a regex stripper --
  a second syntax parser would charge an author for their own list markers and
  the number a test failed on would not be the number on the page. Three
  byte-identical authoring test copies are exempt BY PATH AND BY HASH, capped at
  three; a fourth over-budget spec is a standards conversation, not a line added
  to that list.
- **Real quiz and rubric CONTENT is not committed to this repo.** It is pasted into
  its table by hand by whoever has SQL editor access, the same way the coin price
  list is maintained. A role or unit with zero questions is a legitimate state, not
  a bug.
- **A student-facing surface never gains a second scoring path for work that is
  already graded once.** A notebook check-in is a notice with a link, not a
  submittable item. **It may HANG OFF a classroom item** (0120: the posting
  carries an `item_id`, so the day's material and its notebook requirement are
  one row), and that changes only WHERE it renders -- it gains no points, no due
  date, no submission and no rubric by being attached, and the unit is still
  graded exactly once through `notebook_unit_items`.
- The phase-by-phase scope history (Phases 1-5 and what each deferred) is in
  `docs/HISTORY.md` under "Scope guardrails".
