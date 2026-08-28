---
title: "Access model"
date: 2026-06-20
branches: []
migrations: ["0001", "0020", "0038", "0066", "0067"]
subsystems: ["Platform & access"]
record_order: 2
---

## Access model

The site is **public-first**: signing in is optional and only unlocks extra
ability, it is not required to browse the portal.

- **Public tier (no login):** almost everything. The landing page at `/` (the
  restored original IDEA index), every assignment and reference doc
  (`/assignments/<slug>`), the VANGUARD game (`/vanguard/`), the coin
  leaderboard (`/coins/`), and the tournament section (`/tournaments`: list +
  live brackets, viewable and realtime-updating with no session; see "IDEA
  Tournaments" below). Since `0092`/`0093`, also the reference-document viewer
  `/reference/<itemId>` (only for a MATERIAL a teacher explicitly flagged
  public -- a printed syllabus QR code is scanned by a parent with no account)
  and the short-link redirects `/<slug>` such as `/209h`. Both live OUTSIDE
  `/classroom` deliberately: that prefix is in `authedPrefixes` and would
  bounce a signed-out visitor to `/` before either load ever ran. See
  "Classroom bundle 5" below for why the public read is two narrow RPCs and
  never a loosened policy. Future public pages slot into this tier.
- **Gated tier (login required):** the **teacher-only** dashboard `/dashboard`.
  Anonymous users are redirected off it by `hooks.server.ts`; non-teacher
  signed-in users are redirected to `/` by `dashboard/+page.server.ts` (the role
  lives in `profiles`, so the teacher check happens in the load).
- **Signed-in tier (any role):** the **GAUNTLET** CAD skills dojo at
  `/gauntlet` and the **FRC Training** track at `/frc` are open to any
  authenticated user, student or teacher. This is a second gated tier:
  `hooks.server.ts` redirects anonymous users off these prefixes (the guard
  covers a list of authed prefixes, not just `/dashboard`), but no role is
  required to enter. GAUNTLET's teacher-only authoring page
  (`/gauntlet/author`) is gated in that page's load, the same way the
  dashboard is. See the "IDEA // GAUNTLET" and "FRC Training track" sections
  below.
- **Students have no separate dashboard:** the **homepage `/` is the student
  dashboard**, and what sits at the top of it is the **IDEA Classroom feed** --
  one collapsible card per class they are enrolled in, ranked by what each is
  asking of them right now. The header chip beside it names their REAL class,
  read from the same `classroom_sections` the feed already loaded (one class
  names itself, several collapse to a count, staff get none) and links to
  `/classroom`. **The self-selected pathway-year picker that used to feed that
  chip is GONE** -- see "The pathway-year picker is retired" below. See "Home
  page: the live IDEA Classroom feed" and "2026-27 curriculum" below.
- **Homepage app launcher:** the old stacked promo callouts are replaced by ONE
  FLAT app grid (`src/lib/AppLauncher.svelte`, registry + layout helpers in
  `src/lib/portal-apps.ts`), admin-only tools filtered by role and the GAUNTLET
  card offering sign-in when anonymous. **There are no Games / Tools / Class
  sections any more** -- see "The app grid is one flat list" below for the sort
  modes, drag-to-reorder, pinning and usage telemetry that replaced them, and
  for how a v1 per-group layout migrates. The slot above the launcher holds the
  **IDEA Classroom feed** (see "Home page: the live IDEA Classroom feed" below)
  -- previously the pinned FSP card, and before that a "next live course" promo
  callout, both retired.
  **Uniform card chrome
  (no per-card accent):** every launcher tile uses ONE shared design-system
  accent (brass/gold) via the `--acc*` CSS vars on `.app-card` in
  `AppLauncher.svelte`; there is deliberately no per-card `accent` field.
  Cards are differentiated by name, tagline and status badge, never by an
  arbitrary per-card color (the old `AppAccent` field + `.acc-*`
  classes were removed because a per-card color read as an unrelated identity
  hue on tools it did not belong to, e.g. violet on the teacher dashboard).
  `--crimson` stays reserved for status. Cards carry the machined
  `var(--bevel-raised)` and press on `:active`.
  **Legacy tools (`PortalApp.legacy`):** a tool superseded by a newer one but
  still reachable (bookmarks, muscle memory) sets `legacy: true` rather than
  being removed from the registry. It renders with a dashed border, reduced
  opacity, and an amber "Legacy" badge next to its title (`.app-card.legacy`,
  `.legacy-badge` in `AppLauncher.svelte`) -- deliberately not a per-card
  accent override, per the uniform-chrome rule above. `coins` (IDEA Coin
  Ledger) and the old Sheets coin-entry tool were the first cards flagged this
  way. **Both flags are GONE as of Phase 3** (see "The Ledger is the live
  student hub again"): the Ledger reads the real economy now and is no longer
  legacy, and the entry-tool card was removed from the launcher entirely (the
  tool itself was retired in Phase 4), so `legacy` currently has no user. The mechanism stays for the next tool that needs it.
  It is presentational only and carries no access or write implications.
- **Optional sign-in:** the landing page header has a Google sign-in control.
  Signing in is additive: it unlocks signed-in features (VANGUARD cloud saves,
  pinning your class) and, for teachers, the dashboard. After sign-in from `/`
  the user returns to `/` (`/auth/callback` honors a `next` query param; default
  `/dashboard`).
- **Roles:** `student`, `teacher`, `visitor`, derived from the sign-in email
  domain (`role_for_email` in 0001; any `@boscotech.net` account is a student
  regardless of pathway):
  - `@boscotech.edu` -> `teacher`
  - `@boscotech.net` -> `student`
  - anything else -> `visitor`
- **ADMIN TIER (`0067`), and the rule that supersedes every "teacher-only"
  claim elsewhere in this file.** `teacher` is still auto-granted by domain and
  still marks staff apart from students, but **on its own it now grants nothing
  privileged**. Every elevated capability requires an explicit ADMIN grant.
  - **`is_admin()` is the check.** `public.app_admins` is the roster, keyed by
    LOWERCASED EMAIL (not user id) so an account can be authorized before it has
    ever signed in. `is_owner()` is the owner-only check.
  - **THE NAMING TRAP, read this before touching any policy:** `is_teacher()`
    still exists and **now returns `is_admin()`**. Redefining that one function
    body was how ~90 already-applied `is_teacher()` references across 0001-0066
    were re-gated at once -- migrations here are an immutable applied record, so
    those policies could not be rewritten in place, and Postgres resolves a
    function by name at call time. **`is_teacher()` does NOT mean "is a
    teacher". Never write a new call to it; use `is_admin()`.**
  - **The owner is pinned in the schema.** `admin_owner_email()` is a hardcoded
    constant (`apina@boscotech.edu`) and `is_admin()`/`is_owner()` fall back to
    it directly, so the owner keeps access even if `app_admins` is emptied. Only
    the owner can `admin_grant` / `admin_revoke`; no admin can demote the owner,
    and `enforce_role_change` additionally refuses any change to the owner's
    profile role. Changing who the owner is means a new migration, deliberately.
    `ADMIN_OWNER_EMAIL` in `src/lib/admin.ts` mirrors it for DISPLAY only --
    never as a check -- and the two must be changed together, as must the
    literal in the `app_admins_owner_is_pinned` CHECK.
  - **Grants are limited to `@boscotech.edu`** (enforced in `admin_grant`), so a
    student or outside address can never hold admin.
  - **App side:** `src/lib/server/admin.ts` (`isAdmin` / `isOwner`) is the ONE
    server helper, and `isAdmin` rides `page.data` from the root layout for UI.
    `role === 'teacher'` is NOT an admin check any more; the only place it still
    appears is that helper's PRE-0067 FALLBACK (when the RPC is missing, matched
    on the `PGRST202` code ALONE so a runtime error inside `is_admin()` fails
    closed rather than open) and the homepage's staff-vs-student branch.
  - **What is admin-only:** `/dashboard`, `/coin-desk`,
    `/admin`, the notebook Drive connect flow (`/admin/drive-connect` + its
    callback), GAUNTLET authoring / room hosting / the author-capture macro, FRC
    completion overrides and gate reviews, the FSP FRC-interest roster,
    GREENLINE decal + community-track moderation, tournament deletion, the
    all-users feedback read, and VANGUARD's TUNE mode. **Deliberate exception:**
    `/fsp/live` stays open to any `@boscotech.edu` account -- it is gated
    in-page by email domain, was never one of the `is_teacher()` sites, and
    shows only questions students submitted to be displayed.
- **Role editing:** ADMINS (not teachers) can change other users' roles. No one
  can change their own role, and the owner's role cannot be changed by anyone.
  Enforced server-side (`enforce_role_change` plus RLS), not in client code.
- **`/admin`** is the roster page: any admin may read it, only the owner sees
  the add/remove controls, and `admin_grant`/`admin_revoke` refuse everyone else
  server-side regardless. A non-admin (signed in or not) gets a 404, not a
  redirect, so probing the URL reveals nothing; it is deliberately NOT in
  `authedPrefixes` for that reason.
- **Global profiles (0020):** `profiles` also carries `display_name` (user
  editable), `avatar` (`preset:<id>` from `AVATAR_PRESETS` in
  `src/lib/profile.ts`, `upload:<path>` in the public `avatars` Storage bucket,
  or null to fall back to the Google `avatar_url`, then initials), and
  `preferences` (free-form JSONB: homepage layout, theme, ...). The root
  `+layout.server.ts` loads the signed-in profile once as `userProfile` (a key
  no page load shadows) so it is in `page.data` everywhere;
  `src/lib/ProfileMenu.svelte` (mounted in every page header: homepage,
  archive, dashboard, GAUNTLET Header, VANGUARD history) is self-contained,
  reads it from `$app/state`, and inline-edits name/picture through the
  browser client under the existing "update own profile" RLS policy. Uploads
  write only to the user's own `<uid>/` folder (Storage RLS). Role assignment
  is untouched. Shared sign-out (including the lab-machine VANGUARD wipe)
  lives in `signOutEverywhere()` in `src/lib/profile.ts`.
- **Pathways (0038):** every Bosco Tech student is identified by their pathway,
  one of six: IDEA, ACE, BMET, CSEE, MSET, MAT. Stored in `profiles.pathway`
  (text + CHECK like `role`, nullable; `0038_profile_pathway.sql`), unset until
  the student chooses it. **Identity and attribution ONLY, never an access
  gate:** no route, policy, or feature may branch access on pathway, and it is
  independent of the email-domain role. No new RLS: students set their own via
  the existing "update own profile" policy; teachers see and change any
  student's via the existing "teachers select/update any profile" policies
  (the "Students & Pathways" roster on `/dashboard`, with filter and per-row
  editor). The registry `src/lib/pathways.ts` (plain data, client-safe) owns
  the fixed identity palette and inlined lucide icons: IDEA green `#00FF41`
  box, ACE orange `#FF8C00` building-2, BMET purple `#B47CFF` dna, CSEE blue
  `#3D7DFF` cpu, MSET red `#FF2E2E` hexagon, MAT yellow `#FFE600` aperture.
  **Display rule:** `src/lib/PathwayChip.svelte` is the colored pill (icon +
  short label, color never alone) shown BESIDE the profile image, never
  replacing it, and the display name tints in the pathway color. Applied in
  ProfileMenu (trigger + panel, so every header shows it) and the GAUNTLET
  leaderboard boards (`gauntlet_leaderboards()` returns `pathway` since 0038;
  the web side treats it as optional so it fails soft pre-migration, as does
  the root layout's profile select). `src/lib/PathwayPicker.svelte` is the
  one-time first-login picker, mounted once in the root layout: it renders
  only for a signed-in STUDENT with no pathway, persists the choice, and never
  prompts again ("Choose later" hides it for the browser session only).
  **"Choose later" is a real secondary BUTTON, not a bare link.** It was the
  dimmest token, the smallest size on the card and underlined, next to six
  bright identity tiles and a bordered confirm -- so it read as disabled. It now
  matches confirm's size and uppercase treatment and carries a 1px neutral
  border on a transparent fill, with only colour saying "secondary": measured
  12.09:1 on the panel (against confirm's green-plus-fill-plus-border), 44px
  tall like confirm. Skipping is a legitimate choice and has to look like one.
  **Color discipline:** MSET red `#FF2E2E` is identity only, never a status
  color; the reserved status crimson `#FF3355` (LIVE / REC / error) is never
  an identity color. Dev harness: `/dev/pathways` (404 in production) renders
  chips, tinted identity rows, the discipline strip, and the REAL root-layout
  picker against a stubbed student profile.
- **Extensible:** roles are intentionally open-ended. Adding a future role
  (for example `parent`) means extending the CHECK constraint and the
  `role_for_email` logic, not a rebuild.

