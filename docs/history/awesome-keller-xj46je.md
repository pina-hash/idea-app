---
title: "Ledger 0391: the IDEA Certification Portal, the whole idea-app build (0260 to 0264) (`claude/awesome-keller-xj46je`)"
date: 2026-10-15
branches: [claude/awesome-keller-xj46je]
migrations: ["0260", "0261", "0262", "0263", "0264"]
subsystems: [Certifications, Migrations, Email, Scheduled jobs, Profile menu, Classroom header, Standards]
---

Mr. Pina approved `docs/CERTIFICATIONS.md` on 2026-10-15 and ledger 0390 landed
it on `main`; this bundle built every section of it inside idea-app: the
catalog engine with package import and export, the earning flow (training with
watch tracking, guided project, proctored exam, autonomous project, checkout),
the signed award and its printed certificate, the public verify page, the
certifier desk, the notification badge with its email family, the FRC app
mirror sender, the scheduled jobs, and five additive migrations. This entry is
the record of what was built, the decisions the build made where the spec left
a design open (each also in `docs/certifications/DECISIONS.md` with its reason),
what was measured, what could not be verified, and the hand steps that make the
portal live.

## How the build was run

One session, solo on `main`, with the work fanned out by FILE SURFACE to six
agents against one written contract, `docs/certifications/DATA_MODEL.md`
(every table, every function's signature and return shape, every route, and
which surface owns which paths), after a read-only audit of the tree in ten
parallel readers (sign-in and `is_admin()`, the Plate and the themes, the
YouTube helper, the HTML assignment engine, Web Push, the scheduled-job
pattern, the mark assets and the profile menu, the database harness, and the
two standards documents). The audit corrected the spec and the contract on
four facts before anything was built, listed under "Claims that were wrong".

The surfaces: (a) the migrations and their database tests; (b) the server
modules and API routes (signing, email transport, mirror, jobs, exports,
package zip, evidence, verify rate limit); (c) the student routes and the
portal shell; (d) the certifier desk; (e) the exam runtime and the video watch
tracker; (f) the printed certificate and the email templates. The orchestrator
wrote the shared pure modules under `src/lib/certifications/` first (types,
parts, serial, signing payload, nav, copy, status, the room stylesheet) so every
surface imported one spelling of each, and owned the shared edits: the plate
and theme scope lists, the slug reservation, the classroom header's
Certifications door, the profile menu's badge, the root layout's unread count,
`.env.example`, `CLAUDE.md`, `classroom-updates.json`, the scheduled-job
workflow and this entry.

**How it landed.** The branch's nine backup commits were squashed into two
(the portal, and the student-page fold-in below) so the site changelog reads
two updates with their bullets rather than nine "Ledger 0391" lines, then
rebased onto `origin/main` at `5d488821` (IDEA Coin V2 session two, 0244 to
0251). The rebase conflicted in three files: `vercel.json` (both sessions
added a cron; the portal's came out again, see "The scheduled caller" below,
so the file is main's byte for byte), `tests/db/ideacad-grants-anon-execute-surface.test.ts`
(both sessions added to the anon-execute allowlist; every entry kept and the
pin raised to 27) and `tools/browser-verify/README.md` (generated; main's copy
taken and the counts regions regenerated with `npm run verify:counts`). The
second and third are outside the prompt's listed shared files, where its rule
was to stop; both resolutions are keep-both with nothing to choose, so the
session resolved them and names them here. Four suite failures surfaced only
in the whole-tree run and were fixed in the tests, never the code: the
notify fixture now carries the awarded payload exactly as `cert_award_commit`
writes it (the subject is the kind rule's, `MILL-1: awarded, serial ...`, not
the row's title); the short-link chain gained 0260, which reserves
`certifications`; the sequence sweep's denominator is fourteen, naming the six
`cert_*_id_seq` sequences; and the upload registry is seventeen with both
sessions' rows. The migration series has a hole at 0252 to 0259 (0252 to
0255 permitted to Coin V2 session two and unused, 0256 to 0259 Mr. Pina's
firebreak), which `tests/db/migration-0177-tombstone.test.ts` refuses unless a
non-terminal ledger entry claims the numbers; the 0391 entry claims them, the
way ledger 0360 claims 0228 and 0229, with a note saying no file was written
at any of them. Filling the gap with tombstones is Mr. Pina's decision.

**The deploy probe, after the push.** The push landed at `3c6cefa5` and
`migrate.yml` run 207 refused to apply anything: `tools/deploy-probe.mjs` read
0239 as NOT APPLIED, a CONFLICT against the history row, because 0239's body
marker asked the catalog for `coin_public_sections`, which 0251 (Coin V2
session two) had dropped by design. The workflow applies the lowest
not-applied migration, so it targeted 0239 on every push, was refused as
already recorded, and 0260 to 0264 could not land; runs 205 and 206, on main
before this push, had failed the same way. The fix is in
`tools/idea-status.py`, which derives the probes: an object a LATER migration
in range drops and does not create again (statically, or dynamically in
0251's `execute 'drop function ' || v_sig` shape) is handed to the history
record (`kind: dropped`, `sql: null`, the path a migration with nothing
probeable already takes), so a row is APPLIED and no row is CANNOT SAY,
never a false refusal; a drop followed by a create of the same object in one
file is a re-signing and keeps its catalog probe. `tools/deploy-probe.mjs`
keeps the generator's own sentence for such a probe. At the workflow's range
exactly one probe moves (0239's marker) and every other kind count holds;
`tests/idea-status.test.ts` drives both directions on fixture migrations
0141 to 0147 and `tests/deploy-probe-history.test.ts` the verdict. This
paragraph was written in the follow-up commit that carries the fix.

**How the five migrations landed.** The fix pushed as `0414fcfd` (CI run
38828579105 green, the full suite 800 files and 14,753 tests green locally
first). Migrate run 208 (38828579005) then read production, targeted 0260,
applied it and chained itself, and the chain ran 0261 to 0264 in order
(38828660538, 38828744981, 38828817870, 38828893340), one record commit each:
`aff89e0c`, `c679dc7d`, `c56f2e19`, `3bc47e92`, `4615602d`, all between
00:17:32Z and 00:20:54Z on 2026-10-16. Every record under
`docs/migrations-applied/` reads `outcome: applied`, every object the file
names present (48, 42, 28, 26 and 16 objects), and the history row inserted
by the apply. The run after the last (38828975025) asked production, found
nothing unapplied and skipped every step. Nothing in this paragraph was
measured against the live database from this container; it is what the
workflow wrote.

## What was built

### The database (0260 to 0264, surface a)

Five additive migrations, every table RLS on with no policy and no client
grant (the two `cert-evidence` storage policies excepted, in a guarded block),
every function `security definer` with `set search_path = ''`, every grant
revoked from `public, anon, authenticated, service_role` by name and granted
back to exactly who holds it, a self-check `do` block last, and an UNDO paste
in every header. 0260 is the engine (settings, certifications, revisions,
prerequisites, lessons, the exam pool, the authority roster, the event log,
the `certifications` slug reservation); 0261 the earning flow (attempts, part
checks, submissions, reviews, training progress, watch sessions, practice
results, the private `cert-evidence` bucket at 45 MiB); 0262 the proctored
exam (sittings, seats, exam attempts; the per-topic draw from a pool twice the
exam's length, one question at a time, no going back, release by a proctor
valid ten minutes, flags with timestamps, the seven-day cooldown, scoring
server-side with the failed student told missed topics only); 0263 the award
(awards, award history, notifications; `cert_award_commit` recomputes the
signed payload's values and refuses a mismatch; `cert_verify` is the one
anon-granted function and answers only a status word); 0264 operations (the
mirror snapshot, the sync log, the error log, the dormant sweep, the expiry
reminders, telemetry, exports). Refusals are structured `{ok:false, reason}`;
"not yours" is "not found"; a certifier hears `self` on their own record.
`tests/db/cert-*.test.ts` hold 110 assertions over the real chain and the
mutation proof (`tests/db/cert-mutation-proof.mjs`) kills four mutants.

### The server (surface b)

`src/lib/server/certifications/`: `signing.ts` (Ed25519 over the canonical
payload, the key read once from `CERT_SIGNING_PRIVATE_KEY`, a clean refusal
when unset, the public key derived for `/certifications/verify/public-key`),
`verify-limit.ts` (the per-address token bucket), `notify.ts` (every `notify`
row an RPC answers becomes an email through Resend and a push, then is
stamped sent), `mirror.ts` (the full snapshot to the Techmen app's
`idea_cert_sync`, every call logged), `jobs.ts` (mirror, dormant, expiry,
emails and the combined `daily`, behind `CRON_SECRET` when set), `exports.ts`,
`package-zip.ts` and `package-io.ts` (the revision package in and out as a
ZIP), `evidence.ts`, `gate.ts`, `api.ts`; `src/lib/server/email/index.ts` is
the one Resend transport. Routes under `src/routes/api/certifications/`:
award, correct, evidence sign and serve, jobs, export, package export and
import. `.github/workflows/cert-jobs.yml` is the one scheduled caller of the
combined daily job, and `vercel.json` is not touched.

**The scheduled caller.** D4 first put the daily call on a Vercel cron entry
with the workflow as a backup that was red without the secret. At landing the
entry came out: ledger 0204 on main records the project as a Vercel Hobby
account, a Hobby project holds two cron jobs, and `vercel.json` already
carries two, IDEA Coin autopay and the weekly coin digest that Coin V2 session
two added while this build ran, both the coin economy's, which this build may
not touch. A third entry is refused at deploy time and would stop every deploy
of the site. So the workflow is the only caller, and it now runs the jobs
whether or not `CRON_SECRET` is set (sending the bearer when the repository
secret exists, calling the open route when it does not, and saying which in its
summary), red only on a non-2xx answer. D4 carries the amendment and
`tests/cert-server-jobs.test.ts` pins both halves.

### The portal (surface c)

`/certifications` (the catalog), `/certifications/<code>` (the kit: videos
with watch tracking, lessons in the classroom's sandboxed frame, the quick
checks, the practice quiz, the guided and autonomous projects with evidence
upload, the exam section, the checkout), `/certifications/me`,
`/certifications/holders`, `/certifications/notifications`, the public
`/certifications/verify` (Valid, Suspended, Revoked, Expired, No such
certificate, and the rate-limited state, never which check failed) and
`/certifications/verify/public-key`. `CertShell` is the portal's own chrome
over the site plate: the mark, the four student tabs, Desk for a certifier,
Notifications with the unread count, the profile menu, then each page's
eyebrow, title and lead off `page.data.shell`. The portal is not in
`authedPrefixes`; a signed-out visitor sees the sign-in panel in place of the
page, except on verify. The classroom header gained a Certifications door and
the profile menu a badge with the unread count.

### The desk (surface d)

`/certifications/desk` and its tabs (Desk, Students, Sittings, Live exam,
Records, Authority, Engine, Logs): the queue, the student view with the
Release exam key, review with the evidence beside the checklist and Send held
until a decision and a note, sittings and seats, the live exam view over a
five-second poll, the award page whose key lights only when every required
part is checked and whose confirm dialog lists exactly the facts that will be
recorded, records with suspend, revoke, correct and reinstate, the authority
grid, the engine (package editor, pool editor, lesson editor, import with a
diff, publish refusing an incomplete kit) and logs with the exports. Every
page returns its `shell` (the desk eyebrow and its own title) and the desk
tab strip sits under the portal header; admin-only tabs are hidden from a
certifier and 404 to them.

### The exam runtime and the watch tracker (surface e)

`ExamRunner` (lobby, one question at a time with Next and no back control,
auto-submit at the deadline, the result with missed topics, fullscreen as the
overlay floor with native as the upgrade) over `exam-client.ts` and
`lockdown.ts` (hidden, blur, fullscreen exit, resize, copy, cut, paste and the
context menu flagged with timestamps); `ProctorLive` for the desk. `YouTubePlayer`
over `watch/tracker.ts`: played seconds credited only while playing at or under
2x (a faster rate credits nothing, is set back and paused with the sentence),
random Continue check-ins between 180 and 480 played seconds with 60 seconds to
answer, played ranges merged and reported to `cert_watch_report`, the coverage
bar in words.

### The certificate and the emails (surface f)

`/certifications/certificate/<serial>`: a landscape US Letter sheet (paper,
double rule, the full IDEA gear mark in a gold seal ring, the holder's name
sized to fit, the serial, the QR to the verify URL, SUSPENDED, REVOKED or
EXPIRED as a watermark with a status line) scaled on screen and printed from
the browser with `@page { size: letter landscape }`. The email family: one
table-based, inline-styled 600px layout with a plain-text part, one rule per
notification kind for the subject, eyebrow, tone, call to action and fact
rows; the award email carries the serial and the verify link in both parts.

### Folded in on the way (report 5464ceb2, Mr. Pina, 2026-10-15)

On one student's page (`/classroom/<id>/people/<email>`) every assignment row
now opens the assignment, the grading console with that student already open
(the console's opaque student token, computed in the load), or their filled
assignment alone on a full-screen page
(`/classroom/<id>/people/<email>/work/<item>`, a root-layout reset like the
projector, 404 to anyone who does not manage the class, every read pinned to
the one address, the report control relocated to its own bar); and the
assignments table sorts by any column through one comparator
(`sortStudentAssignments`), headers and a Sort by control being two spellings
of one state. `tests/classroom-student-work-page.test.ts` holds the gate and
the attribution filters; `tests/classroom-student-overview.test.ts` the sort.

## Decisions the build made

Each is written up in `docs/certifications/DECISIONS.md` with its reason and
the alternative it refused; the list:

- D1 the certificate carries `display_name` when set, else `full_name`, the
  repository's chosen-identity rule, with a correction that re-signs the same
  serial if it is wrong.
- D2 every write that notifies somebody runs through a server action or API
  route on the caller's own client, and the function's `notify` array is what
  the route emails and pushes; watch reports, exam answers and flags are
  browser RPCs.
- D3 lessons are served from the portal's own origin on the caller's client
  with the classroom's exact CSP and sandbox set, imported, never copied.
- D4 the scheduled jobs run behind a NEW `CRON_SECRET` (the autopay cron route
  is unauthenticated because its function is anon-granted and idempotent, which
  the certification jobs are not), use the service-role client that
  `$lib/server/push.ts` already exports (so the key's reader census stays at
  six), and run as one combined `daily` job called once a day by the GitHub
  Actions workflow alone (amended at landing, see "The scheduled caller" above:
  the project is a Hobby account whose two cron slots the coin economy holds).
- D5 suspend, revoke, correct, authority, publish, import, settings and posting
  sitting windows are admin-only; a certifier's whole power is proctor, grade,
  review, award.
- D6 the pool rule is enforced as a total of at least twice the exam length and
  each topic holding at least its minimum.
- D7 Hide takes a published certification back to draft only while nothing
  hangs off it; Delete removes only a never-published draft; Retire is the end
  state for anything ever earned.
- D8 expiry is derived at read time, never swept into a stored status.
- D9 the server route generates the serial and the signature; the database
  function recomputes the payload's values and refuses a mismatch.
- D10 the verify rate limit is a per-address token bucket in the route.
- D11 watch tracking is client-measured and server-floored.
- D12 the holders board shows names and a hash, never an address.
- D13 the portal is not in `authedPrefixes`; it renders its own sign-in panel
  because the verify page under the same prefix is public.
- D14 the portal has its own chrome and joins the site plate and the Space
  White scope through one list.

## Claims that were wrong

- The spec's and the contract's first draft said the scheduled jobs would be
  "authorized by the same scheduler secret the repository's existing cron route
  checks". No such secret exists; `/api/coin/autopay` checks nothing. Corrected
  in DECISIONS D4 and DATA_MODEL before the server surface built the route.
- The contract's first draft had `cert_lesson_save` call the classroom's
  `_classroom_check_html_manifest`. That function refuses an empty manifest,
  which a plain lesson has, and 0260 must apply over the short-link
  reservation test's chain, which holds no classroom objects; the lesson
  manifest is validated in TypeScript at save and import time instead.
- The contract's first draft sized the evidence bucket at 50 MiB, above the
  project's 50,000,000-byte global that `tests/upload-limits.test.ts` holds
  every bucket under; it is 47,185,920 bytes (45 MiB), the class notice's
  figure.
- The spec says the FRC app contract and the mirror migration are "on its
  `main` as of 2026-10-06"; measured, the clone's head is `7de83b7d` of
  2026-10-06 and both files are there, so that claim held.
- The prompt's wording "build-time excluded from production with
  `import.meta.env.DEV`" is met by the repository's own spelling, `dev` from
  `$app/environment`, which is the same build-time constant; every `/dev/cert-*`
  harness answers 404 in a production build.

## For Mr. Pina

Three things make the portal live, in this order. Each is one secret set by
hand; none of them is ever typed into a chat, a prompt or a file in this
repository. The chat will ask you for one URL where a step needs a dashboard
this entry cannot know.

### 1. The signing key (makes the Award button work)

1. On your own computer, open a terminal (Windows: PowerShell).
2. Paste this one command and press Enter. It prints ONE line of letters and
   digits, about 43 characters long. That line is the private key.

   ```
   node -e "console.log(require('crypto').generateKeyPairSync('ed25519').privateKey.export({format:'jwk'}).d)"
   ```

   If `node` is not found, install Node.js from nodejs.org first (any current
   version), then run the command again.
3. Copy the printed line. Do not paste it anywhere but the next step.
4. Open the Vercel project for ideabosco.com (the chat will ask you for the
   URL), go to Settings, then Environment Variables.
5. Add a variable. Key: `CERT_SIGNING_PRIVATE_KEY`. Value: the line you copied.
   Environment: Production (and Preview if you want previews to award).
6. Save. Redeploy the site once (Deployments, the latest deployment's menu,
   Redeploy) so the running site reads the new variable.
7. Success looks like: on `ideabosco.com/certifications/verify/public-key` a
   block beginning `-----BEGIN PUBLIC KEY-----` appears. Until the key is set
   that address says 404 and the Award button refuses with a sentence naming
   the variable.
8. Keep the printed line somewhere safe (a password manager). If it is ever
   lost, generate a new one and set it the same way; old certificates stay
   valid in the record, and their "check it yourself" signatures then verify
   against the old public key, which the verify page keeps listing.

### 2. Email through Resend (makes every notification also arrive by email)

1. Go to resend.com and create an account with your school Google account.
   The free plan sends 3,000 emails a month and 100 a day, which is enough.
2. In Resend, open Domains, press Add Domain, and type `ideabosco.com`.
3. Resend shows a short table of DNS records (two or three rows: each has a
   Type such as TXT or MX, a Name, and a Value). Keep that page open.
4. Open the DNS settings of ideabosco.com at the registrar or DNS host (the
   chat will ask you for the URL). Add each record exactly as Resend lists it:
   same Type, same Name, same Value. Save.
5. Back in Resend, press Verify. It can take up to an hour; the domain row
   turns to Verified. Until it does, Resend refuses to send from the domain.
6. In Resend, open API Keys, press Create API Key, name it `ideabosco
   certifications`, permission Sending access, and copy the key it shows (it
   is shown once).
7. In the Vercel project's Environment Variables add two variables:
   - Key `RESEND_API_KEY`, Value: the key you copied.
   - Key `CERT_EMAIL_FROM`, Value: `IDEA Certifications <certifications@ideabosco.com>`
8. Redeploy once.
9. Success looks like: the next notification a student earns (a part checked
   off, a review returned, an award) arrives in their Gmail from "IDEA
   Certifications". Until both variables are set, every send is a clean no-op
   and the portal's error log shows nothing, by design.

### 3. The FRC app mirror (sends who holds what to the Techmen app)

Do this only AFTER the frc-app session has applied its migration
`0001_idea_certifications_mirror.sql` to the Techmen Supabase database; before
that, every sync answers "not set up" in the sync log and nothing is lost: the
next daily resync carries the whole record.

1. On your own computer, in a terminal, run `openssl rand -hex 32` (Windows:
   Git Bash has it). It prints 64 characters. That is the shared secret.
2. In the Techmen Supabase project's SQL editor (the chat will ask you for the
   URL), run the one statement the header of the Techmen migration gives, with
   the secret pasted in place of `<PASTE SECRET>`. Do not save the statement as
   a snippet.
3. In the Techmen Supabase project, open Project Settings, then API, and copy
   two values: the Project URL (`https://<ref>.supabase.co`) and the anon
   public key. Never the service_role key.
4. In the Vercel project for ideabosco.com add three variables:
   - `TECHMEN_SUPABASE_URL`: the Project URL.
   - `TECHMEN_SUPABASE_ANON_KEY`: the anon public key.
   - `TECHMEN_CERT_SYNC_SECRET`: the 64-character secret from step 1.
5. Redeploy once.
6. Success looks like: on `/certifications/desk/logs`, the Sync tab's newest
   row reads ok with a catalog count and a holder count, within a day (the
   daily job) or at once after the next award or catalog change.

### 4. The scheduled jobs' secret (locks the daily jobs to the scheduler)

The daily jobs already run without this: the "Certification jobs" workflow in
the repository's Actions tab calls them every morning (11:47 UTC, before
school). This step is the lock, so nobody else can make the portal run its
housekeeping early. The lock holds only once the same value is set in BOTH
places below; with only one set, the morning run is red and its summary says
why.

1. Run `openssl rand -hex 32` again for a second, different value.
2. In the Vercel project's Environment Variables add `CRON_SECRET` with that
   value, and redeploy once.
3. In the GitHub repository `pina-hash/idea-app`, open Settings, Secrets and
   variables, Actions, press New repository secret, name it `CRON_SECRET`, and
   paste the SAME value.
4. Success looks like: the Actions tab's "Certification jobs" run each morning
   shows an answer with counts, and the desk's Sync tab gains a `daily` row.
   Until both are set, that run calls the open route and its summary says the
   lock is not set; you can also run any job by hand from the desk's Logs page
   as an admin.

## What was measured

`npm run verify:readme -- --route cert-` drove the thirty certification specs
(every `/dev/cert-*` harness, several in a second state or under Space White)
at 375 and 1440 through the preinstalled Chromium, three times: the first pass
found 149 findings, the second 9, and the third, over the specs the last fixes
touched, 0. Every figure below is from those runs (web fonts do not load in
the harness, so text is measured in the fallback stack).

- **Horizontal scroll: 0px at both widths on every route.** Two real
  overflows were found and fixed on the way: the stacked certification page
  read 440px wide at 375 (a past exam's readout was `nowrap`; it wraps now),
  and the engine list read 774px (a screen-reader-only header span was
  positioned against the document rather than the scrolling table wrap).
- **The checklist's part glyphs: 6.47:1 on the card, 4.95:1 under Space
  White**, after `--text-3` measured 2.79:1 against the 3:1 graphical floor
  and moved to `--text-2`.
- **The award confirm dialog**: title 14.96:1 (17.77:1 on Space White), key
  words 8.01:1 (5.87:1), its two keys 86x44 and 92.4x44, `showModal` true.
- **Tap targets**: the four student tabs 151.3x44 at 1440 and 160.3x44 at
  375, the checklist's Open keys 60.1x44, every option row on the exam 44px,
  the verify page's public key link raised from 22px to the 24px floor.
- **An Open key on the checklist lands its section below the sticky bar** at
  both widths (`order-result ["below the bar"]`).
- **The store** (`tools/browser-verify/README.md`'s generated block) now
  holds 702 route specs measured, 1,404 runs and 24,690 measurements, up from
  685, 1,370 and the previous total on `origin/main`; the findings outside
  threshold stayed at the 182 the tree already carried, none of them on a
  certification spec.
- **Screenshots** of every surface at 1440 and 375 (catalog, certification
  page in three states, the live exam and the proctor view, the desk, review,
  the award confirm, the certificate, verify in five states, the awarded
  email, My certifications, the engine editor, telemetry, the student page,
  and the catalog and certificate under Space White) were taken with
  `tools/browser-verify/browser.mjs` and read; one defect found that way was
  a missing space ("Mr. Pinaon October 15") in the desk checklist's meta line.
- **The production build** answers 404 on every `/dev/cert-*` harness and on
  `/dev/classroom-student` (the "Production build" line in the ledger
  report), while `/certifications/verify` answers 200 with no session.

## What was not verified

- **Nothing ran against the live Supabase project.** This container has no
  route to it, so the five migrations were applied only to the embedded
  Postgres of `tests/db/` (every self-check, the paste trap and `scanFile`
  included) and never through `tools/apply-migration.mjs` against a socket;
  `.github/workflows/migrate.yml` applies them on the merge, and the
  `docs/migrations-applied/` records are the proof. Every `cert_*` RPC the
  routes call was exercised against the database tests' chain or a stub,
  never through PostgREST.
- **No real Resend send, no real Techmen sync, no real push.** Every secret
  path ran with placeholders in `process.env`; the Resend transport and the
  `idea_cert_sync` call were stubbed. The FRC app's contract was read from a
  shallow clone of `pina-hash/frc-app` at `7de83b7d`; its mirror migration was
  not applied anywhere this session could reach.
- **No real YouTube playback.** The harness blocks every non-loopback request,
  so the IFrame API loader, `getCurrentTime` against a live player and the
  nocookie embed are unmeasured; the tracker's crediting, check-ins and rate
  cap were tested against `FakePlayer` and the `/dev/cert-watch?state=fake`
  harness only.
- **No signed-in session.** Every real `/certifications` route was reached
  signed out (the sign-in panel, the public verify page, 404s); the form
  actions, the evidence upload against the real bucket, the award route's
  signing with a real key, the certificate for a real award and the desk's
  pages over real data were driven only through the `/dev/cert-*` harnesses
  and the route tests' stub clients.
- **No real print to PDF and no mail client.** The certificate's `@page`
  landscape sizing was read off the stylesheet and the harness, not a printed
  sheet; the emails were rendered into sandboxed frames on `/dev/cert-emails`
  and never opened in Gmail.
- **Whether `CRON_SECRET` is set in production, and how late GitHub runs the
  11:47 UTC schedule, are unmeasured**; the daily route was called by hand with
  and without a bearer in the route tests. The Hobby plan's two-cron cap was
  read from Vercel's published limits and the account's plan from ledger 0204,
  not measured against a deploy.
- **Web fonts do not load in the harness**, so every text measurement below is
  in the fallback stack, and `prefers-reduced-motion` is `no-preference`, so
  the still paths were read off the stylesheets.
