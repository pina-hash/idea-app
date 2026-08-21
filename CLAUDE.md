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
programme), and the portal shell (`/`, `/dashboard`, `/admin`).

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

- **`svelte-check` at the baseline: 0 errors, 36 warnings.** Any change to
  either number is a finding to report, not something to leave unmentioned.
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

- **`SUPABASE_SERVICE_ROLE_KEY`** -- read by exactly TWO modules: the GREENLINE
  community-track publish endpoint (which must run the game's real track
  validation in Node before any row is written) and the tournament push sender.
  Nothing else may read it, and **it must never gain a `PUBLIC_` prefix**.
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
  `is distinct from`. This has bitten twice.
- **An RLS policy records a real dependency on every FUNCTION and COLUMN its
  expression names.** Drop the policy before dropping the column, and recreate it
  after.
- **A constraint another constraint depends on cannot be dropped and re-added.**
  Postgres has no `add constraint if not exists`; guard on `pg_constraint` in a
  `do $$` block instead. A blind drop-then-add raises `2BP01` on the second run.
- **Postgres `round()` is half-up (away from zero), not banker's rounding**, and
  agrees with JS `Math.round()` at ties for positive inputs.
- **A volatile expression like `now()` cannot appear in an index predicate**, so
  "currently active" cannot be a partial unique index on its own; pair
  `revoked_at is null` in the index with a lazily-stamped close on the row.
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
  `combat.ts`, `feed.ts`, `track-runtime.ts`, `rich-text-schema.ts`. Pure layers are
  what make arithmetic testable without a browser.
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
    4.5:1 and on the DEFAULT plate all six did, five of them below 3:1. What is
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
- **Everything an item needs is attachable at creation, on one surface** -- and on
  ONE surface only. Do not make an author save first and come back; equally, do not
  put a second copy of a panel the page already shows beside the first.
- **Every control carries a visible word, not only a glyph.** A `title` tooltip is
  not discoverable and a phone cannot hover.
- **Colour is never the only signal** -- glyph AND word, or an icon beside the hue.
- **44px minimum tap targets** on anything a phone touches. The documented
  exception is a control inside a locked density contract, where inflating it would
  break a real invariant to satisfy a guideline written for standalone controls --
  say so rather than breaking the contract.
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
  - **`app_feedback` is the ONE queue for every surface**, and the console at
    `/classroom/feedback` (admin only) reads ALL apps. Filter before exporting;
    an export of everything is a semester nobody reads.
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
  - **PER-INSTANCE, NEVER A SHELL BANNER.** One global indicator reading "all
    changes saved" while a sibling surface holds a failed write is a false
    negative with a much wider blast radius than the defect it papers over.
  - **`autosave: false` where a write MINTS A RECORD** (a notebook note is a
    revision): the machine still reports dirty for the guard and schedules
    nothing.
  - **`markDirty` driven from an `$effect` must be `untrack`ed.** It reads the
    phase it may then write, so a tracked call re-runs the effect on every
    transition and turns `saved` straight back into `dirty`. A dirty signal
    reported to a parent tracks `save.dirty`, NOT the draft -- the draft is
    cleared before the acknowledgement lands -- and is withdrawn on teardown,
    because a remount destroys the instance that reported it.
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
- **`loading="lazy"` images never request** -- the intersection observer never
  fires.
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
- **Shared classes** live in `src/app.css`. The `.legacy-index` theme is scoped
  under that wrapper so it never affects the app shell.
- **The animated emblem** is `src/lib/brand/AnimatedLogo.svelte`, prop-driven so
  the same component is the animated hero mark and the static fallback. Its spin is
  gated behind `prefers-reduced-motion: no-preference`.
- **Everything animated is gated behind `prefers-reduced-motion`.**
- **Launcher cards carry ONE shared accent (brass/gold); there is deliberately no
  per-card accent field.** Cards are differentiated by name, tagline and status
  badge, never by an arbitrary colour.
- **Background:** the `.bg-fx` scanline + vignette overlay, disabled under reduced
  motion. Legibility first.

### Scoped themes are deliberately off-brand, and stay in their room

Each is scoped under one wrapper class, opaque, at `z-index: 1` so `.bg-fx` never
shows through, and neutralizes the app-shell globals that would leak (the green
`// ` h2 prefix, the link glow):

- **`.gt-root` -- GAUNTLET VIEWPORT** (`docs/GAUNTLET-DESIGN.md`). All GAUNTLET UI
  must conform. Read tokens and reuse the viewport components rather than writing
  one-off styles. The volumetric CAD background replaced the scrolling isometric
  grid, which is **retired -- never reintroduce it**. The FeatureManager rail is
  hidden by default; do not make it visible by default. Modeling modes green,
  knowledge modes cyan. **SOLIDWORKS branding is nominative text only: never the
  logo, a lookalike, or its red-on-white scheme**; the Dassault Systemes disclaimer
  footer stays on every page. The VIEWPORT layer is visual only -- it never touches
  data flow, auth, scoring, or room timing.
- **`.nb-root` -- notebook editorial**, light / dark / IDEA palettes. Tokens only:
  a rule needing to know which palette is showing should have been a token. IDEA is
  opt-in only -- no `prefers-color-scheme` selector reaches it.
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
- **Commit and push every session.** Do not leave work uncommitted.
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
