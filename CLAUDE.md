# CLAUDE.md

Operating rules for working in this repository. Everything here changes how a
task is done, whatever the task is.

**The per-bundle historical record lives in [`docs/history/`](docs/history/), ONE
FILE PER ENTRY** -- what each migration and code-only bundle changed, why, what
was measured, and what was left undone. Read it when diagnosing something in a
subsystem with history, or when you need the REASON a rule below exists before
changing it. **`grep -r` over that directory is how you find an entry**; every
file's front matter carries its date, branch, migration numbers and subsystem as
plain text. `npm run history:index` prints the by-subsystem, GREENLINE and
by-migration indexes, which are GENERATED and never committed. Do not read the
directory end to end. `docs/HISTORY.md` is now a pointer to it and is never
edited again -- see "Keeping the documentation current" below for why.

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

IDEA Classroom (`/classroom`), the digital notebook (inside the classroom since
ledger 0297: a class's Notebook tab at `/classroom/<id>/notebook`, the whole
notebook at `/classroom/notebook`, the review console at
`/classroom/notebook/review`; `/notebook`, `/notebook/review` and
`/notebook/review/student/<email>` answer 307 to them, the two review addresses
only after their own reviewer gate so a non-reviewer still gets 404), the IDEA Coin
economy (`/coin-desk`, `/coins`), GAUNTLET (`/gauntlet`, CAD skills), GREENLINE
(`/greenline`, 3D combat racing), VANGUARD (`/vanguard`, legacy game),
Tournaments (`/tournaments`), FRC Training (`/frc`), FSP (`/fsp/*`, archived
programme), IDEA Foundry (student-published static web apps), IDEA Maps
(`/maps/edit`, the admin editor, and `/maps/edit/shelf`, ITEM ENTRY AT THE
SHELF -- a phone-first flow used standing at a toolbox, so 375px is its primary
width and not the one checked afterwards; **the PUBLIC VIEWER AT `/maps` HAS
SHIPPED** and this line called it "a later bundle" until 2026-09-06 --
`docs/standards/IDEA_MAPS_SPEC.md` governs, schema 0161 through 0165 plus 0168
(the `maps-media` raster list and the plan frame) and 0172 (the editor grants),
writes through the `is_admin()` RLS policies with `maps_publish` as the one RPC
per 0161's own header), and the portal shell
(`/`, `/dashboard`, `/admin`).

## Where the subsystem rules live

This file holds the rules that apply to every task. Everything specific to one subsystem lives in `docs/subsystems/`, one file per subsystem, moved out of this file word for word on 2026-10-19 (ledger 0415). **Read the row's file before you change that subsystem**: its rules bind exactly as they did when they sat here, and where a file and the code disagree that is a bug worth raising. `tools/claude-md-check.mjs` checks the names in this file and in every file under `docs/subsystems/` against the tree.

| Working on | Read | Read it when |
| --- | --- | --- |
| IdeaCAD, the direct modeler, the materials library | [`docs/subsystems/ideacad.md`](docs/subsystems/ideacad.md) | touching `src/lib/ideacad/`, `/ideacad` or the `ideacad_*` tables |
| IDEA Maps | [`docs/subsystems/maps.md`](docs/subsystems/maps.md) | touching `/maps/edit`, the shelf flow or the `maps-media` bucket |
| Classroom files, attachments, hand-ins | [`docs/subsystems/classroom-files.md`](docs/subsystems/classroom-files.md) | any upload, signed URL, attachment or hand-in |
| The class page: teams, themes, header, quick posts, tour, panel layout | [`docs/subsystems/classroom-class-page.md`](docs/subsystems/classroom-class-page.md) | changing what the top or the list of a class shows |
| Live class, presence, hall pass, projector, polling | [`docs/subsystems/classroom-live.md`](docs/subsystems/classroom-live.md) | the grading roster, the Live tab, the wall, any widget that re-asks the database |
| Notebook capture, the item page, post thumbnails, what a student owes | [`docs/subsystems/classroom-work.md`](docs/subsystems/classroom-work.md) | Missing and Complete, to-do, home feed, item media |
| The IDEA calendar, its week strip, phone link and assignment pacing | [`docs/subsystems/calendar.md`](docs/subsystems/calendar.md) | `/calendar`, `src/lib/calendar/`, `calendar_*` functions, a manifest's `pacing`, `schedule` on `idea:state` |
| Progressive feedback, one student's page | [`docs/subsystems/classroom-feedback.md`](docs/subsystems/classroom-feedback.md) | instructor notes on work, the per-student conference page |
| Ported HTML assignments (`/hx`) | [`docs/subsystems/html-assignments.md`](docs/subsystems/html-assignments.md) | the document frame, bridge, manifest or answer writes |
| Foundry (gallery, submit, review, plays) | [`docs/subsystems/foundry.md`](docs/subsystems/foundry.md) | anything under `/foundry` or `student_apps` |
| Serving student bytes | [`docs/subsystems/origin-split.md`](docs/subsystems/origin-split.md) | `/a/`, `/b/`, `/hx/`, CSP, sandbox flags, origin variables |
| IDEA Armory | [`docs/subsystems/armory.md`](docs/subsystems/armory.md) | `/armory`, `armory_*` functions, the purge, the mirror |
| IDEA Coin economy | [`docs/subsystems/coins.md`](docs/subsystems/coins.md) | any coin write, price, transaction type or student coin action |
| IDEA Certifications | [`docs/subsystems/certifications.md`](docs/subsystems/certifications.md) | `/certifications`, `cert_*` functions, serials, the mirror |
| The IDEA Website connector | [`docs/subsystems/connector.md`](docs/subsystems/connector.md) | `/mcp`, `/connector`, any new `.rpc('name')` or `+server.ts` |
| GAUNTLET authoring tier and rank floor | [`docs/subsystems/gauntlet.md`](docs/subsystems/gauntlet.md) | a GAUNTLET gate, the speedrun board, held runs |
| Feedback reports, the report box, dictation | [`docs/subsystems/feedback.md`](docs/subsystems/feedback.md) | `/admin/feedback`, `app_feedback`, `SiteFeedback`, voice input |
| Profiles, avatars, identity style, preferences | [`docs/subsystems/profiles.md`](docs/subsystems/profiles.md) | `profiles` columns, avatars, any `preferences` write |
| Environment variables and credentials | [`docs/subsystems/environment.md`](docs/subsystems/environment.md) | adding or reading a secret or a public variable |
| SQL beyond migrations: grants, signatures, write and read paths, ladders | [`docs/subsystems/database.md`](docs/subsystems/database.md) | writing a function, a policy, a table or a select that names a new column |
| Routes, endpoints, error boundary, deploy reload | [`docs/subsystems/server-routes.md`](docs/subsystems/server-routes.md) | a `+server.ts`, a layout load, a hook, a proxy |
| UI structure, split shells, pending states, command registry, tab icon | [`docs/subsystems/ui-shell.md`](docs/subsystems/ui-shell.md) | a new page shell, a pane, a loading state, a palette command |
| Interface standards | [`docs/subsystems/ui-standards.md`](docs/subsystems/ui-standards.md) | tap targets, previews, refusals, acknowledgements |
| Saving work | [`docs/subsystems/ui-save-state.md`](docs/subsystems/ui-save-state.md) | any autosave, draft mirror, save guard or save indicator |
| Rendering untrusted content | [`docs/subsystems/rendering-untrusted.md`](docs/subsystems/rendering-untrusted.md) | rich text, links, images, anything a person typed |
| Svelte 5 and DOM traps | [`docs/subsystems/traps-svelte-dom.md`](docs/subsystems/traps-svelte-dom.md) | an `$effect`, a stylesheet, stacking, a hit-target bug |
| Browser pane and toolchain traps | [`docs/subsystems/traps-browser-toolchain.md`](docs/subsystems/traps-browser-toolchain.md) | verifying in a browser, running tests, installing packages |
| Testing | [`docs/subsystems/testing.md`](docs/subsystems/testing.md) | writing or changing a test, the database fixture |
| Legacy HTML and the freeze | [`docs/subsystems/legacy-content.md`](docs/subsystems/legacy-content.md) | `src/lib/legacy/`, `static/`, the Coin Ledger, VANGUARD |
| Themes, rooms, boundary tokens, launcher cards, tournaments, GREENLINE, FRC, FSP | [`docs/subsystems/themes.md`](docs/subsystems/themes.md) | any colour, token, scoped room or theme-keyed override |
| Verification detail: baseline history, mutation restore, the visual pass | [`docs/subsystems/verification.md`](docs/subsystems/verification.md) | `svelte-check` disagrees with this file, a mutation proof, a browser pass |
| Standards mirror and scope | [`docs/subsystems/standards-and-scope.md`](docs/subsystems/standards-and-scope.md) | citing `docs/standards/`, module instruction limits, scoring paths |

## Commands

```bash
npm run dev                             # dev server
npm run check                           # svelte-kit sync && svelte-check, in one step
npx svelte-check                        # the same check without the sync (see the stale-types trap)
npm test                                # full suite (see the parallelism trap)
node tools/claude-md-check.mjs          # does THIS file still agree with the tree
npm run verify:browser                  # the visual pass: /dev routes at 375, 1152 and 1440
npm run verify:browser -- --probe       # what this machine's browser can actually do
npm run verify:browser -- --selftest    # negative controls for every check
npm run tab-icon:build                  # writes the tab and home-screen icons in static/IDEA/ from src/lib/tab-icon/geometry.ts, the ONLY place their geometry is edited (ledger 0396, docs/design/tab-icon/README.md)
python3 tools/idea_logo_vector.py <outdir> # the emblem and logo geometry, the ONLY place it is edited; tools/idea_icon_gen.py now writes only a retired icon exploration to its outdir, nothing the site serves
npm run build                           # see the Windows EPERM trap below
```

## Verification standard

This applies to every change. Prompts do not need to restate it.

**Always:**

- **`svelte-check` at the baseline: 0 errors, 33 warnings in 18 files.** Any
  change to either number is a finding to report, not something to leave
  unmentioned.
  - **RE-DERIVE IT, NEVER TRUST THIS LINE ALONE.** `npx svelte-kit sync &&
    npx svelte-check`, and read the count off its own summary line -- the sync
    first, because stale generated route types report phantom errors (see the
    toolchain traps).

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
  (`/coins/`), the coin home `/coin` (ledger 0422: one preview card per coin
  page; signed out, the Ledger's card is drawn from the same public board and
  every other card asks the visitor to sign in, so it is not in
  `authedPrefixes`), the tournament section, the reference-document viewer
  `/reference/<itemId>` (only for a MATERIAL a teacher flagged public), the
  IDEA Maps viewer (`/maps`, which reads no session and is deliberately not
  under the `/maps/edit` gate), and the short-link redirects `/<slug>` such as
  `/209h`.
  - **The public reference viewer and short links live OUTSIDE `/classroom`
    deliberately** -- that prefix is in `authedPrefixes` and would bounce a
    signed-out visitor to `/` before either load ran.
  - **`POST /api/feedback` is the one PUBLIC WRITE endpoint**: an anonymous
    report, rate limited per address inside the database. It answers its own
    responses, so it is not in `authedPrefixes`, and it reads no session.
- **Signed-in tier (any role):** `/gauntlet`, `/frc`, `/greenline`, `/notebook`,
  `/armory` (IDEA Armory, an app on the home launcher since ledger 0366, with
  its guided setup at `/armory/start`; NOT in `authedPrefixes`, because the
  prefix guard's redirect to `/` would drop a connect link's query, so each
  page renders its own sign-in panel and returns to the same address; the
  one-click installer `/armory/get` sends a public release straight to
  GitHub and needs no session),
  `/classroom`, `/foundry` (the SURFACES; the bundle BYTES are a separate
  question -- they are served from the apps origin, which holds no session at
  all, so the publication gate there is the version's own status and the two
  uuids in the URL. A game's HTML cover, `/c/<app id>` (ledger 0422), is an
  apps-origin route too: it answers only where bundles answer, from
  `foundry_cover_html` read anonymously, under `sandbox allow-scripts` and a
  policy with no network. See the origin split).
  `hooks.server.ts` redirects anonymous users off a LIST of authed prefixes.
- **Admin tier:** `/dashboard`, `/coin-desk`, `/admin`, `/greenline/moderation`,
  the notebook Drive connect flow, FRC completion overrides and gate reviews,
  the FSP FRC-interest roster, GREENLINE decal + community-track moderation,
  tournament deletion, the all-users feedback read (`/admin/feedback`, whose
  old `/classroom/feedback` address forwards only after the same gate, and its
  Armory tabs `/admin/feedback/armory` and `/admin/feedback/incidents`),
  VANGUARD's TUNE mode, the
  Foundry review queue (`/foundry/review`, and its `/foundry/review/publishers`), the Foundry source reader
  (`POST /api/foundry/source`), the IDEA Maps editor (everything under
  `/maps/edit`, gated once in its own `+layout.server.ts` -- the `/maps` viewer
  is PUBLIC per the maps spec, has shipped, and must never be prefix-guarded) and GAUNTLET's ranked-run review
  (`/gauntlet/run-review`, `gauntlet_run_review`, `0152`), and IDEA Armory's
  Delete forever and storage cleanup (`POST /api/armory/purge`,
  `POST /api/armory/sweep`, 0233), profile picture moderation
  (`/admin/avatars`, 0267), and the HTML assignment health list
  (`/admin/html-assignments`, 0328) -- all of which answer
  404 to everyone else, because the existence of a review lane is not public.
  **GAUNTLET authoring and room hosting are NOT admin-tier any more** -- see the
  GAUNTLET AUTHOR TIER below.
- **The homepage `/` IS the student dashboard.** Students have no separate one;
  `/dashboard` is admin-only.
  - **A STUDENT GETS APPS ABOVE YOUR CLASSES, ALWAYS; FOR STAFF THE ORDER TURNS
    ON WHAT THE VIEWER MANAGES.** Mr. Pina asked for the student half twice
    (ledger 0117, report 21), the second time with the cost known: a student's
    class block grows 616px per class at 375px, so the scroll moves onto the
    feed's deep links rather than going away. The student key is
    `profile.role === 'student'` -- a `visitor` is neither a student nor staff
    and keeps the content-earned rule. For everyone else Apps sits above Your
    Classes for anyone who manages a section, or when the feed is empty, and
    below it otherwise; that signal is `classroomFeeds.some((f) => f.manages)`,
    reusing `buildFeed`'s own `manages` (which mirrors
    `classroom_manages_section`), because the email domain grants `teacher` to
    staff who teach no section and an admin can manage every section without
    it.

### Roles

`student`, `teacher`, `visitor`, derived from the sign-in email domain
(`role_for_email`): `@boscotech.edu` -> teacher, `@boscotech.net` -> student,
anything else -> visitor. Roles are intentionally open-ended; adding one means
extending the CHECK constraint and `role_for_email`, not a rebuild.

### ADMIN TIER -- this supersedes every "teacher-only" claim anywhere, EXCEPT the GAUNTLET author tier below

`teacher` is auto-granted by domain and marks staff apart from students, but **on
its own it grants nothing privileged**. Every elevated capability requires an
explicit ADMIN grant, with ONE deliberate exception carved out of it: GAUNTLET
challenge authoring, publishing and room hosting, which since `0155` has its own
narrower allowlist and does not require admin. See "GAUNTLET AUTHOR TIER" below
for that tier; everything in this section still governs admin.

- **`is_admin()` is the check.** `public.app_admins` is the roster, keyed by
  LOWERCASED EMAIL (not user id), so an account can be authorized before it has
  ever signed in. `is_owner()` is the owner-only check.
- **BOTH ADMIN AND MANAGE ARE NOW EMAIL-SCOPED RULES WITH CALLER-SCOPED WRAPPERS
  OVER THEM (0138), AND THE WRAPPER IS THE ONE YOU CALL.** `_admin_is_email(text)`
  is the admin rule and `is_admin()` is
  `case when auth.uid() is null then false else _admin_is_email(current_user_email()) end`;
  `_classroom_manages_section_email(uuid, text)` is the manage rule and
  `classroom_manages_section(uuid)` passes `current_user_email()` into it. Both
  wrappers keep their name, signature and OID, so every applied policy resolves
  unchanged. **Ask the email-scoped form only when the subject is a THIRD PARTY**
  (a roster row, a projected flag); for "may the caller do this", call the
  wrapper, always. Writing a third statement of either rule is the thing this
  shape exists to prevent.
  - **`current_user_email()` RETURNS `''`, NOT NULL, WITH NO SESSION**, which is
    why both helpers refuse the empty string explicitly. That refusal IS
    `is_admin()`'s old `auth.uid() is null` guard, expressed through the new
    shape; a helper of this family that forgets it answers for a caller who is
    not there.
- **THE NAMING TRAP -- read this before touching any policy.** `is_teacher()`
  still exists and **now returns `is_admin()`**. Redefining that one function body
  re-gated ~90 already-applied references at once, because migrations here are an
  immutable applied record and Postgres resolves a function by name at call time.
  **`is_teacher()` does NOT mean "is a teacher". Never write a new call to it;
  use `is_admin()` -- EXCEPT the eleven GAUNTLET authoring/publishing/hosting
  sites `0155` re-gated onto `gauntlet_can_author()` instead. See "GAUNTLET
  AUTHOR TIER" below before writing a twelfth GAUNTLET gate: check its census
  first, most GAUNTLET checks (every student-work read, room-review analytics,
  the global Speedrun ruleset) still belong on `is_admin()`.**
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
  per-student notebook review page, one student's page in a class. Such routes
  are deliberately NOT in `authedPrefixes`, because the prefix guard's redirect
  would confirm they exist.
- **A redirect is correct only where the surface is known to exist for everyone**
  (the `/dashboard` non-admin redirect to `/`).
- **"Not found" and "not yours" answer identically**, so an id cannot be probed.
- An empty RLS result is 404, never 403: RLS returning nothing is
  indistinguishable from the row not existing.
- **Widening a public or preview payload is a DISCLOSURE DECISION, not a field
  addition.** Several payloads deliberately withhold something a caller might expect
  (a disciplinary strike count, a verification target, a student's identity). Check
  `docs/history/` for that surface before adding a field to it
  (`grep -r` it, or `npm run history:index`).
- **A chosen public identity replaces the account identity completely.** Where a
  feature lets someone pick a display name and picture, NO surface -- including a host
  or admin console -- shows the Google account name or avatar behind it.
  The one exception is IdeaCAD sharing, which shows a person's school email beside
  their chosen name and finds them by either, by Mr. Pina's decision
  (`docs/decisions/entries/72-ideacad-sharing-shows-name-and-email.md`); a chosen
  picture still replaces the photo there.
- **An access helper FAILS CLOSED on any error**, never falling through to a weaker
  check.

### Pathways -- identity, never an access gate

Six pathways (IDEA, ACE, BMET, CSEE, MSET, MAT) in `profiles.pathway`.
**No route, policy, or feature may branch access on pathway.** Independent of the
email-domain role. `src/lib/pathways.ts` (plain data, client-safe) owns the fixed
palette and icons. `PathwayChip.svelte` shows the pill BESIDE the profile image,
never replacing it; colour is never the only signal.

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

## Database conventions

### Migrations

- SQL lives in `supabase/migrations/`, sequentially numbered `0001_*.sql`.
- **APPLIED ONE FILE AT A TIME, EITHER BY HAND IN THE SUPABASE SQL EDITOR OR BY A
  SESSION THROUGH `tools/apply-migration.mjs`. There is still no migration runner, and
  the distinction between one named file and a runner is the whole of what changed.**
  `node tools/apply-migration.mjs <number>` takes ONE migration, refuses it unless the
  probe says it is the LOWEST unapplied one, prints every notice in order, treats a
  `raise` from the file's own self-check as a REFUSAL rather than a crash, rolls back so
  nothing is half-applied, and afterwards asks `pg_catalog` about every object the file
  names. There is no flag that takes a range or a directory.
  - **A BUNDLE MAY CARRY SEVERAL MIGRATIONS, AND EACH IS STILL APPLIED ALONE
    (ledger 0381, decision 65; Mr. Pina, 2026-10-14, retiring the
    one-migration-per-bundle rule).** A ledger entry's `Claims:` line lists every
    number it carries, and `migrationBudget` in `tools/apply-migration.mjs` lets
    it apply that many, each once (one when it names none or one). What did NOT
    move is the order: every apply is one file, the lowest unapplied, refused
    otherwise. `migrate.yml` applies one per run and, after a CLEAN apply whose
    record landed, starts itself again (`gh workflow run`, the job's
    `actions: write`), so a bundle's files land in order on one merge; it never
    chains after a refusal, a raise or an unverified apply.
  - **A MIGRATION NUMBER IS TAKEN AT LANDING, NEVER RESERVED AHEAD (ledger
    0407).** A session writes its file under the next free number, and when it
    rebases to land it takes the next free number AGAIN: if somebody landed
    first, it renames its file (and every test and doc naming it) to the number
    after theirs. The ledger entry's `Claims:` line then states the FINAL
    numbers, exactly the ones its files carry, and nothing else; a prompt names
    "the next free migration number at landing", never a fixed number or a
    range. **A claimed number nobody wrote is not harmless**: `migrate.yml`
    authorises an apply only when exactly one entry's `Claims:` names the
    target (`ledgerClaimants` in `tools/migration-claims.mjs`), so on
    2026-10-18 ledger 0396's reserved 0268-0272, released only in its Notes,
    stood beside 0400's real 0271 and stopped every migration above it, and a
    reserved 0274-0284 left the files running 0272 then 0285, a hole the
    tombstone test's contiguity check refuses. An entry's OWN number is never
    a claim; only its `Migration permitted` line is read.
    `tests/apply-migration-claimants.test.ts` holds every migration still
    waiting (numbered above the newest `docs/migrations-applied/` record) to
    exactly one claimant, so a second claim reddens the landing session's suite
    rather than the next Migrate run.
  - **IT CONNECTS AS A SCOPED ROLE AND THE ROLE IS THE POINT.** `idea_migrator`
    (`supabase/roles/idea_migrator.sql`, pasted once BY HAND because it carries a
    password and this repository is public) is a member of `postgres` for ownership,
    with an event trigger that refuses `drop table`, `drop schema`, `drop owned`,
    extension DDL and any dropped table, column, schema, sequence, matview or foreign
    table -- keyed on `session_user`, so `set role postgres` does not escape it.
    **What that guard measurably CANNOT catch is written down in the file's own header
    and must not be softened: `truncate` (an event trigger never fires for it), top-level
    DML, and a deliberate one-statement replacement of the guard function.** It stops an
    accident, not an intent. The connection string is `IDEA_MIGRATION_URL`. **THAT
    CENSUS IS NO LONGER "one tool and nothing else" AND THIS LINE SAID SO UNTIL
    2026-09-13**: `.github/workflows/migrate.yml` holds it as a repository secret
    and hands it to two readers -- `tools/apply-migration.mjs`, which is the only
    thing that WRITES with it, and `tools/deploy-probe.mjs`, which is handed the
    same string under its OWN variable `DEPLOY_PROBE_URL` when no read-only one is
    set. So the secret has three holders (the workflow, the apply tool, a session
    that is given it by hand) and exactly one writer, and that is the split to
    keep: **a fourth reader is a decision, and a second WRITER is the thing this
    shape exists to prevent.** `tools/deploy-probe.mjs` must never name
    `IDEA_MIGRATION_URL` in its own source -- `tests/workflows.test.ts` asserts
    that in both directions. It is never printed by anything.
  - **A MIGRATION THE TOOL REFUSES IS ONE A PERSON PASTES.** Seven committed migrations
    carry destructive DDL and every one of them is historical; a new file that joins them
    is a file whose apply is Mr. Pina's, not a session's.
  - **THE PROBE IS DERIVED FROM `origin/main`, AND ANYTHING IT CANNOT SPEAK FOR IS
    REFUSED** -- correctly, since "cannot say" is never a pass. Two shapes hit this and
    both were measured on 2026-09-05. A migration sitting only on `integration` gets no
    probe at all: for part of that afternoon `origin/main`'s highest was 0169 while
    `origin/integration` carried through 0180, so eleven files were in exactly that state,
    and by the evening main had caught up and none were. And a migration whose first
    object `tools/idea-status.py` cannot derive a probe from gets none either -- 0153,
    0177 and 0181 on that date. **Such a file now speaks through its history row**:
    since ledger 0365 the ordering rule decides with deploy-probe's own `verdicts`
    and the record `readHistory` reads, so a row with no probe is APPLIED, no row and
    no probe is still CANNOT SAY, and a row whose object is absent is still NOT
    APPLIED. Otherwise the answer is the same: land it on `main` first, or paste it by
    hand. Do not widen the probe to guess.
  - **NEVER RUN `supabase db push` AGAINST THIS PROJECT.** It is not a way to
    record one file. **THE REASON HAS CHANGED AND THE RULE HAS NOT, AND THAT IS
    THE THING TO READ CAREFULLY.** This bullet used to say the remote has **no
    `supabase_migrations.schema_migrations` table at all** (measured 2026-08-23:
    the relation did not exist), so `db push` treated every local file as
    unapplied -- `--dry-run` planned all **130** of them, 0001 through 0130,
    against a live database that already had every one applied, which would have
    replayed one-time imports and backfills (`0084`, `0100`) over real student
    coin data. **`supabase/data/0209-seed-migration-history.sql` ENDS THAT STATE
    THE MOMENT IT IS PASTED**, by writing one row per file from 0001 up, and
    `tools/apply-migration.mjs` inserts one row inside each apply's own
    transaction so the record stays current. After the paste there is no chain
    left to replay.
    **WHAT KEEPS THE RULE IS THAT `db push` APPLIES A RANGE.** It plans whatever
    it computes to be outstanding, against the one production database, with
    nobody reading the plan; this project applies one named file at a time
    through `tools/apply-migration.mjs` or `.github/workflows/migrate.yml`, both
    of which refuse anything but the lowest unapplied migration, and a paste in
    the SQL editor is the other path.
    **DO NOT READ EITHER STATE OFF THIS PARAGRAPH.** Whether the table is there
    is a property of production and no file in this repository records it; this
    container cannot reach the database at all. `node tools/deploy-probe.mjs`
    prints the answer on its own first line (`record:`), and that is the
    instrument. An empty `remote` column from `supabase migration list --linked`
    is the PRE-SEED reading and is not a finding; after the paste a file
    reported unapplied there is worth looking at rather than ignoring.
  - **The CLI is still useful read-only.** `supabase db query --linked "<sql>"`
    verifies what a hand-applied file actually did, against the real project,
    and is the right way to confirm an apply landed. Linking writes
    `supabase/.temp/`, which is gitignored.
- **Migrations are an immutable applied record.** Never rewrite an applied file
  to change behaviour; write a new one. (This is why the `is_teacher()` naming
  trap exists.)
  - **A FILE THAT RAISED AND ROLLED ITSELF BACK IS NOT AN APPLIED RECORD**, and
    is corrected IN PLACE. The rule exists so a file is never changed out from
    under a database that already ran it; a migration whose own self-check
    raised left nothing behind, so there is no such database. A follow-up file
    correcting one nobody can apply would leave a permanently failing migration
    in the chain, which is worse. 0136 is the case. **Confirm the rollback was
    total before relying on this** -- a file that failed partway with DDL
    already committed is the opposite situation and needs a new file.
- **Idempotent where practical** (`create or replace`, `if not exists`,
  `drop ... if exists` before `create`). **Re-pasting a migration is ordinary** --
  someone re-pastes, or a first attempt failed partway and gets retried -- so a
  migration that only works once fails exactly then, with the schema half-built.
  Test that the file re-applies.
- **A CORRECTION TO DATA IN AN ADMIN-EDITABLE TABLE IS NOT A MIGRATION, AND GOES
  IN `supabase/data/`.** A migration is an immutable applied record of a SCHEMA
  change; a table built to be edited from a console -- `ideacad_materials` is the
  case (0208) -- has its rows corrected by a statement pasted once and superseded
  by the next one, which is the opposite property. Shipping a code change to fix
  four numbers in a form is the shape 0208 exists to end.
  `supabase/data/0191-material-density-verification.sql` is the first, and the
  shape to copy: named for the ledger entry that produced it, a READ-ONLY audit
  select first, and every correction written so that **a blind paste writes
  nothing** -- the values arrive as a `values` list of NULLs and the `update`
  carries `where <col> is not null`, so an unedited paste updates zero rows
  rather than writing a default somebody did not choose. It is pasted by hand
  exactly as a migration is; `tools/apply-migration.mjs` does not know about it
  and must not be taught to.
  - **THE PASTE TRAP APPLIES TO IT IDENTICALLY.** A `$tag$` inside a `--` comment
    balances in Postgres and breaks the Supabase editor's client-side statement
    splitter, which cost `0194` a full apply cycle. Check any hand-pasted SQL two
    ways -- no `$` of any kind in a comment, and every dollar-quote token on a
    code line in a balanced pair -- and check it against a PLANTED CONTROL, or a
    reported zero says nothing about whether the instrument was looking.
- **A migration REFUSES rather than destroys.** If a precondition is unmet (rows
  that would be stranded), raise with the counts and what to do about it.
- **A backfill runs exactly once**, inside a catalog guard on the column's own
  existence. An unguarded `update ... where <newcol> is null` on the second run
  rewrites every genuine row, silently.
- **A SEED OR BACKFILL ROW GOES INSIDE A `do` BLOCK, NEVER AT THE TOP LEVEL.**
  `tools/apply-migration.mjs` refuses top-level `insert into` and `update`
  unless it is told to allow DML, and `migrate.yml` never tells it, so a bare
  seed insert fails the production apply on the day it ships while every db
  suite passes (the harness runs no scanner). `tests/db/migration-0230-apply.test.ts`
  runs the real `scanFile` over the real file with a planted insert as the
  control, and is the shape to copy. A migration whose self-check spans
  subsystems is tested on the whole tree short of it, read off disk
  (`tests/db/chain-0230.ts`), because it applies whole or not at all.
- **Report counts with `raise notice`** so the operator can check them against
  what the deployed app actually holds.

### DEPLOY ORDERING

**Apply a migration by hand BEFORE deploying a client that names a new
parameter.** The drops mean the old arities stop existing the moment it runs and
the new ones do not exist until it does. Where the client can degrade instead, it
names the new parameter ONLY when the feature is actually being used.

**Where the widening is ADDITIVE in the sense above, there is no ordering at
all** -- both arities answer throughout, so the migration and the deploy are
independent events and either may go first. Prefer that shape for any RPC a
deployed client already calls; the ordering rule above is what you are left with
when you cannot have it.

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
- **A COMMIT'S BODY BULLETS ARE THE UPDATE'S LIST OF CHANGES, AND BOOKKEEPING IS
  HIDDEN (ledger 0381, decision 64, Mr. Pina's "Missing detail").** The
  changelog shows each update's `- ` bullet lines from its commit body
  (`bodyDetails`, at most `CHANGELOG_DETAIL_LINES` lines of
  `CHANGELOG_DETAIL_CHARS` characters, backticks stripped), so a commit that
  changes what people see writes its body as short, reader-facing bullets; a
  prose body shows nothing. A subject `isBookkeepingNote` matches
  (`BOOKKEEPING_SUBJECTS`: ledger lines, migration-applied records, claims,
  git's own merge subjects) is kept in the history with `internal` and never
  shown (`userFacingEntries`), so it costs no version a reader sees either.
- **A version is a commit count, so it is only true over a COMPLETE history.** Over
  a shallow clone it slides BACKWARDS; the build detects that and emits no version
  at all rather than a number that can decrease. Set `VERCEL_DEEP_CLONE=true` in
  the Vercel env to get versions in production.
- **PER-UPDATE LINE COUNTS ARE A SEPARATE `--numstat` WALK, ATTACHED ONLY OVER A
  COMPLETE HISTORY (report R10).** `buildSiteVersions` takes the numstat text and
  a line filter (`countsAsCode` from `$lib/code-census`, the census's own
  language-and-exclusion test), and only the lazy `virtual:site-changelog`
  module runs the walk (about 6s). On a shallow clone `added`/`removed` are
  ABSENT, never zero, for the same reason the version numbers are withheld: the
  oldest commit of a truncated history lists the whole tree as added. The
  name-only walk is not switched over, because numstat spells renames
  `src/{a => b}/x` and would move every per-app version count.
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

## Visual theme

The app shell uses the **IDEA Green** aesthetic. The token set and font stack are
the source of truth; **do not invent colours or swap fonts.**

- **Tokens** are CSS variables in `src/lib/design-system/colors.css` (`:root`) with
  per-theme overrides in `src/lib/design-system/themes/`: backgrounds
  `--bg0`/`--bg1`/`--bg2`; `--green` (primary), `--gold` (special callouts),
  `--cyan` (metadata: role, timestamps, version), `--amber` (warning), `--violet`
  (special, sparingly), `--white` (body text), `--dim` (secondary/placeholder),
  `--ice` (disabled). `--teal` is retired as a meaning (ledger 0465) and resolves
  to `--cyan`; a status chip is `--status-<tone>-solid` with `--status-<tone>-on`.
  Every value is solved by `tools/hx-kit/color.mjs` and held by
  `tests/color-tokens.test.ts`. **The semantic roles are fixed; do not reassign
  them.** Never use pure red, pure white (`#FFFFFF`), or pure yellow.
- **Identity colours are one library, solved (ledger 0467), and the launcher is
  not in it (ledger 0472).** A calendar layer, a unit tint, a class palette or
  a section colour reads a generated `--id-<entry>-*` token from
  `src/lib/design-system/identity.css` (or `IDENTITY` in `identity.ts`),
  written by `tools/identity-colors.mjs` from `tools/hx-kit/kit/colors.json`
  through `solve()`; never type an identity hex there. At most seven hues on
  one screen, each beside a word or a glyph, and no neon.
  `tests/identity-colors.test.ts` holds it.
  - **A HOME-SCREEN CARD IS A MINIATURE OF ITS OWN APP**
    (`docs/decisions/entries/73-launcher-cards-are-their-apps.md`, which
    retired 0467's six colour families): its ground, ink, title face, call to
    action and drawn shapes are its room's own, in
    `src/lib/launcher/cards.css` and `src/lib/launcher/CardArt.svelte`, and
    every colour there must appear in the room files `LAUNCHER_ROOMS` names
    for that card (`tests/home-order-and-accent.test.ts` traces each one). No
    families and no hue budget; neon only where the room itself is neon; a
    card follows its room, not the site theme, on Space White; every word on
    a card clears 4.5:1; the FRC mark is never altered. A card quotes its
    room's face too, so the FRC card's Roboto and GREENLINE's Archivo Black
    are not the shell-font exception the Fonts rule below forbids.
    `docs/subsystems/themes.md` has the detail.
- **`--crimson` is reserved for live / rec / error status only**, never a general
  accent and never an identity colour.
- **`--green` is for primary actions, active navigation, focus, success and
  completion** -- not static labels, quiet borders, data values, or decoration.
- **Fonts:** `Rajdhani` (display, body, input values) and `Share Tech Mono`
  (metadata, button/nav labels, mono chrome), via `@fontsource`. `/`, `/archive`
  and the COIN DESK's chrome (its masthead line and its sub-nav, which took the
  IDEA Coin Ledger's own tab-bar treatment) additionally use `Orbitron`. **Never Arial, Inter, Roboto, or system fonts** in
  the IDEA shell -- the notebook's system-sans stack was the last exception and it
  is gone. **A face is named through its TOKEN, never as a literal:**
  `--font-display`, `--font-mono`, `--font-title` (Orbitron), `--font-hero`. Each
  resolves to exactly the string it replaced, so pointing a rule at one is a
  rename, not a restyle.

- **Type is one scale with an 11px floor (ledger 0469).** A font size is a step
  of the `--fs-*` scale in `src/lib/design-system/typography.css`, never a
  literal, and nothing on screen is set below `--fs-micro` (11px; the Plate's
  `--plate-label-size` reads it). `tests/type-scale.test.ts` holds the source,
  `npm run verify:browser`'s `type-floor` what renders; the 44px control floor,
  the 72-character prose measure (`--measure-prose`) and `@container` cards
  are in `docs/subsystems/ui-standards.md`.

- **Shared classes** live in `src/app.css`. The `.legacy-index` theme is scoped
  under that wrapper so it never affects the app shell.
- **The animated emblem** is `src/lib/brand/AnimatedLogo.svelte`, prop-driven so
  the same component is the animated hero mark and the static fallback. Its spin is
  gated behind `prefers-reduced-motion: no-preference`.
- **Everything animated is gated behind `prefers-reduced-motion`.**

- **Background:** the `.bg-fx` scanline + vignette overlay, disabled under reduced
  motion. Legibility first.

## Standing traps

The ones that bite a task nobody thought was about them. Each has its full rule and its reason in the file named.

- A new function is granted to `anon` on arrival on this project, so a migration names the roles in its revoke and grants back exactly one set (`docs/subsystems/database.md`).
- A function that gains a parameter drops its old signature first, unless a deployed client still calls it (`docs/subsystems/database.md`).
- A select naming a column a newer migration added is a ladder that degrades one rung at a time (`docs/subsystems/database.md`).
- A write is a definer RPC that re-checks its caller and takes no identity parameter (`docs/subsystems/database.md`).
- A `+server.ts` exports only HTTP methods and the few names SvelteKit allows; anything else breaks in production first (`docs/subsystems/server-routes.md`).
- An `$effect` that calls injected code wraps the call in `untrack` (`docs/subsystems/traps-svelte-dom.md`).
- Do not run prettier, and restore `node_modules` with `npm ci`, never `npm install` (`docs/subsystems/traps-browser-toolchain.md`).
- Run several test files through `npm test --`, never bare `npx vitest run` (`docs/subsystems/traps-browser-toolchain.md`).
- No geometry, contrast or tap-target claim in `tests/dom/`; those belong to `npm run verify:browser` (`docs/subsystems/testing.md`).
- A mutation script restores from a copy it made, never from git, and reads both output streams (`docs/subsystems/verification.md`).
- Anything that serves a person's bytes keeps them off the origin that holds a session (`docs/subsystems/origin-split.md`).
- Widening a public payload is a disclosure decision, not a field addition (see Probing must reveal nothing, above).
- Every admin action reaches the IDEA Website connector by itself: `npm run connector:build`, which `.github/workflows/connector.yml` runs on every push to `main`, generates a tool for any function or route with a staff gate and no hand entry, so a new admin action needs only its RPC, and keeping one off the connector is a hand-written `exclude:` with its reason (`docs/subsystems/connector.md`).

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
- **SOLO MODE PUSHES STRAIGHT TO `main`; PARALLEL MODE USES THE BRANCH PATH
  BELOW.** Decided by Mr. Pina 2026-09-27. Your prompt's routing header says
  `Mode: solo` or `Mode: parallel`. Solo (the only writing session on this repo):
  fetch and rebase onto `origin/main`, run the local gate (`npm run check` and the
  full `npm test` for code, only the doc checks for docs-only work), then
  `git push origin HEAD:main`, with the ledger entry in that same push. A rejected
  push is rebased and retried; a real content conflict is a stop. Parallel, or no
  `Mode:` line at all: everything below about branches and `integration` applies.
  `docs/standards/IDEA_instructions.md` ("Solo is the default") owns the detail.
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
- **ONLY `main` AND `lane/**` BUILD ON VERCEL; `claude/**`, `codex/**` AND
  `integration` BUILD NO PREVIEW (`vercel.json` `git.deploymentEnabled`), AND
  EVERY PUSH TO `main` DELETES THE AGENT REFS IT ALREADY CONTAINS
  (`.github/workflows/prune.yml`, ledger 0376).** Vercel keeps the latest
  preview of any branch that still exists, and that is billed storage. The
  prune has no rule of its own: it cuts `contained_delete_gate` out of
  `integrate.yml`, so keep that function between its markers.
- **If a session ends with a branch still open, report the branch name and what
  is unfinished on it.** An unmerged branch is invisible work.
- **A FINISHED `claude/**` BRANCH VANISHING ON ITS OWN IS CORRECT, NOT A
  MISTAKE, AND IT IS STILL NOT A REASON TO START MERGING.** A workflow
  (`.github/workflows/integrate.yml`, read its own `README.md` for the
  operator's view) merges any `claude/**` branch into a long-lived
  `integration` branch the moment CI goes green on its tip, and deletes the
  branch. **The commits are not lost** -- they are on `integration` -- and
  **in parallel mode `main` still moves only through the gated merge**, because that push is
  the deploy to `ideabosco.com` mid-class, and several bundles carry a
  migration CI cannot see and that has to be applied by hand first. **WHETHER
  A LANE MAY MERGE `integration` INTO `main` IS NOT THIS FILE'S TO SAY, AND
  THIS PARAGRAPH USED TO SAY IT ANYWAY** -- it read "push the branch, do not
  merge to `main`, exactly as every prompt already says", which was already
  false when it was written: `docs/decisions/entries/16-a-lane-may-merge-to-main.md`
  was decided YES on 2026-09-05 and `docs/standards/IDEA_instructions.md` 4.20
  grants it against a six-gate checklist a session reports. Prompt 0055 found
  the contradiction, could not edit a file it did not own, and wrote it into
  decision 16's own tree-check line instead. **The rule is: obey your own
  prompt's ending, which is the only thing that knows whether this bundle was
  granted the merge; where it is silent, `IDEA_instructions.md` owns the
  answer and this file does not.** What this file DOES own is the reason a
  gate exists at all -- a push to `main` deploys `ideabosco.com` mid-class,
  and a bundle carrying a migration ships an RPC call to a function
  production may not have yet. **A `claude/**` branch still standing after a session
  ends is a SIGNAL, not a leftover** -- its CI failed, its CI has not finished,
  its session's ledger entry still reads `Status: issued`, or its merge into
  `integration` conflicted -- and is worth naming in the same report a still-open
  branch already gets.

**TWO AGENTS, ONE REPOSITORY.** As of 2026-09-10, GPT-6 Astra works here as Codex
cloud tasks beside Claude Code sessions. `AGENTS.md` points here and carries no rule
of its own. Codex tasks push `codex/**` branches; `integrate.yml`,
`tools/idea-status.py`, `tools/migration-claims.mjs` and the ledger README enumerate
`claude/**` and `codex/**` alike, and a guard that enumerates only one is a defect. A
Codex task lands a pull request against `integration`, never merges `main`, and cannot
reach the production database; `docs/CODEX_ENVIRONMENT.md` says what its container
has. `ultracode` is a Claude Code setting and is never written into a Codex prompt.

  - **WHAT "CI GOES GREEN" MEANS IS THE WORKFLOW'S OWN DEFINITION, IT HAS
    MOVED, AND IT IS NOT RESTATED HERE.** `integrate.yml` decides what it
    checks before it merges, and `ci.yml`'s header explains why `integration`
    gets no push-triggered run of its own and takes a daily scheduled one
    instead. Both have moved more than once. **THE SUITE RUN ON THE MERGED TREE
    HAS LANDED, AND THIS PARAGRAPH SAID IT WAS STILL "sitting unmerged on
    `claude/red-merge-green-parents-ft3e57`" FOR FIVE DAYS AFTER IT DID** -- it
    is on `main` in `21a21954` (2026-09-06) and the branch's tip is contained in
    both `main` and `integration`, which is a paragraph describing a pending
    change turning into a false one the moment somebody lands it. So a red
    Integrate run no longer means only "a merge conflicted": it can also mean
    the merged tree failed the suite, which is a different thing to do about it.
    **AND UNTIL 2026-09-11 IT COULD MEAN A THIRD THING NOBODY COULD TELL APART
    FROM THE SECOND.** `merged_suite` ran `npm ci` then `npm test` with no
    `svelte-kit sync` between them, so on a runner's checkout vitest died in
    dependency optimisation before any test body, named no failing test, and the
    function answered `unrun` -- on every tree, every time -- while
    `integrate.yml` pushed `integration` regardless. Four lanes diagnosed it
    independently in one day. It is fixed; `docs/decisions/entries/21-*`
    (`integrate-tests-after-it-merges`) carries the measurement and the half
    that is still open, which is whether that suite becomes a GATE on the push
    or stays the report it is today. **Read the workflow rather than this
    paragraph**; a mechanism copied into prose here is one that goes stale
    silently, which is what the two sentences above it did and what this one
    did next.
  - **A BRANCH THE TARGET ALREADY CONTAINS IS DELETED TOO, WHICH IT USED NOT TO
    BE.** The workflow used to merge-and-delete only what IT merged, so a branch
    landed by hand -- every source branch of a merge bundle, for one -- became a
    permanent ref that read as an outstanding session. Ten accumulated across
    two rounds and five were deleted by hand. It now deletes a green, finished
    `claude/**` branch whose every commit is already reachable from
    `origin/integration` or `origin/main`, and says so in the job summary under
    "Already contained, deleted". **Nothing else changed about what stands:** a
    red branch, a running session's branch, a branch contained only in the
    runner's unpushed working state, and `main`/`integration` under any
    containment answer are all left exactly where they were.
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
- **FEEDBACK BECOMES WORK THROUGH A ROUND, AND A ROUND BUILDS NOTHING.** An uploaded
  feedback-console export is triaged by `.claude/skills/feedback-round/SKILL.md` into
  a dated folder under `docs/feedback/`: a grounded triage, decisions in `docs/decisions/`, a queue, and
  the next session's prompt. **The export is a student record and this repository is
  public**, so the only committed report text is what `tools/feedback_triage_md.py` renders,
  and it refuses while any reporter identity from `tools/feedback_digest.py` appears in it.
- **Commit and push every session.** Do not leave work uncommitted -- merged to
  `main` where the work is single-item, or landed on its `lane/` branch with
  the branch's status reported.

### Keeping the documentation current -- READ THIS BEFORE WRITING EITHER FILE

The two files have different jobs, and the split is the point.

**WHAT THIS FILE OWNS, AND WHAT IT MUST NOT RESTATE.** The boundary is not
this file's invention: `docs/standards/IDEA_REPO_WORKFLOW_STANDARD.md` states
it in its own header -- "`IDEA_instructions.md` owns how a prompt is written
and how a session behaves; each repo's own `CLAUDE.md` owns what is true
inside that repo only". So:

- **`CLAUDE.md` owns FACTS ABOUT THIS TREE**: what a module does, why a rule
  exists, which trap bit and how, the migration apply path. Nothing else
  states these and nothing else should.
- **`docs/standards/IDEA_instructions.md` owns SESSION BEHAVIOUR** -- whether
  a lane may merge, what a prompt's ending requires, how a ledger entry is
  written. A rule of that shape written here is a second copy that drifts, and
  it did: the `claude/**` paragraph under Working conventions carried an
  unconditional "do not merge to `main`" that contradicted decision 16 for a
  day, and the bundle that found it could not fix it.
- **`docs/standards/*` own the STANDARDS** -- interface, material spec,
  rubric, verification. Where this file repeats one it repeats it as a
  POINTER with a section number, never as a paraphrase, and where the two
  disagree that is a bug in one of them and worth raising rather than a
  licence to pick.
- **`docs/decisions/entries/` owns WHAT MR. PINA DECIDED.** A decision is
  never restated here as a rule without naming its entry; a decision that
  moves then leaves a rule here saying the old thing with nothing pointing at
  the new one.

**AND THE CHECKABLE HALF OF THIS FILE IS CHECKED.** `tools/claude-md-check.mjs`,
run by `tests/claude-md.test.ts`, asserts every NAME this document uses --
file paths, routes, database objects, exported symbols, npm scripts, CSS
custom properties -- against the tree, and asserts the handful it says are
GONE have stayed gone. It never asserts that prose is true and never checks a
measurement. **A correction made by hand is a correction that goes stale
again**: `docs/GAUNTLET.md` was corrected on 2026-08-29 and was wrong in
fifteen places by 2026-09-05, and seven bundles found this file wrong in one
week. So when you change a rule here, change the name in the same edit and
run the check; and when a claim you are writing could be checked, prefer
writing it in a form the check can read (a backticked name) over a
paraphrase it cannot.

- **A shipped bundle writes its record as a NEW FILE:
  `docs/history/<your branch slug>.md`** -- your session's git branch with the
  `claude/` or `lane/` prefix removed, so a session on
  `claude/history-merge-split-vx1fmk` writes
  `docs/history/history-merge-split-vx1fmk.md`. Follow the existing shape: what
  changed, the load-bearing decisions and why, what was measured, what is
  explicitly NOT verified, what was deferred. **This is the default destination
  for a session's writeup.**
  - **DO NOT APPEND TO A FILE SOMEBODY ELSE IS ALSO APPENDING TO. THAT IS THE
    WHOLE REASON FOR THE SHAPE.** The record used to be one 35,000-line file with
    three indexes at its top, so every session wrote to the same few lines and two
    parallel branches could not be merged -- it blocked an automatic merge on four
    consecutive batches and GitHub finally refused to resolve it in the web editor
    at all. One file per entry, named for the branch, means two sessions running at
    once touch no line in common. **Nobody consolidates these back into one file
    later**, and nobody may: merging them back restores the exact write point the
    split removed.
  - **The name is your branch and nothing else.** The harness mints one branch per
    session and a branch name cannot be taken twice, which is what makes the
    filename collision-free BY CONSTRUCTION rather than by anyone checking. Never
    take a name from a counter, a sequence or a date -- a number a session has to
    pick is the shared write point again, wearing a different hat.
  - **Front matter, then one blank line, then the entry body -- opening directly
    at the first real content, with NO retyped `## <title>` heading line.** The
    heading is DERIVED from front-matter `title` (`verify-split.mjs` synthesizes
    `## ${title}` at reassembly time); the body on disk never repeats it. This
    used to be a second hand-typed copy of the same sentence and it drifted
    three times (`gauntlet-tolerance-test-fix-u79q4y`, and
    `btn-tap-target-floor-verify-6vj8r9` twice over two sessions) before
    `docs/history/_tools/derive-headings.mjs` removed the second copy for good.
    Front matter carries `title`, `date`, `branches`, `migrations` (quoted,
    `["0140"]`, because YAML reads `0140` as octal), `subsystems`. **No
    `record_order`** -- that field belongs only to the 168 `record-*.md` files
    the split produced. `npm run history:verify` checks all of this, and
    `docs/HISTORY.md` states the fuller convention. **"Never edited again" is
    about the 35,000-line record body the split removed, not about
    `docs/HISTORY.md`'s own instructions for writing an entry** -- those are
    corrected in place like any other rule when they drift, which its own
    worked example did for a day after `derive-headings.mjs` (`1fbdf87`)
    removed the retyped heading; both are fixed now (2026-08-29).
  - **There is no index to update, for SQL or anything else.** All three indexes
    are generated from front matter by `npm run history:index` and are gitignored.
    Naming the migration in `migrations:` is the whole of it.
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
- **`CLAUDE.md` is authoritative. `docs/history/` is a dated record** and is not
  edited to match later changes. If they appear to disagree, `CLAUDE.md` wins. An
  entry file is written once and left alone; correcting a past bundle's account is
  a NEW entry saying so, never an edit to the old one.
- New routes, tiers, roles, env vars, traps or conventions update `CLAUDE.md` in the
  same change that introduces them.
