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

## What was built

(Filled in from the surface reports at the end of the build: see the sections
below, one per surface, and "What was measured".)

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
  six), and run as one combined `daily` job on Vercel plus a GitHub Actions
  second caller.
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

The daily jobs already run without this: Vercel's cron calls them every
morning. This step is the lock, so nobody else can make the portal run its
housekeeping early. Vercel sends the secret on its own once it is set.

1. Run `openssl rand -hex 32` again for a second, different value.
2. In the Vercel project's Environment Variables add `CRON_SECRET` with that
   value, and redeploy once.
3. In the GitHub repository `pina-hash/idea-app`, open Settings, Secrets and
   variables, Actions, press New repository secret, name it `CRON_SECRET`, and
   paste the SAME value.
4. Success looks like: the Actions tab's "Certification jobs" run each morning
   shows an answer with counts, and the desk's Sync tab gains a `daily` row.
   Until the GitHub secret is set, that Actions run is red on purpose (it says
   which secret is missing) while Vercel's own call keeps working; you can also
   run any job by hand from the desk's Logs page as an admin.

## What was not verified

(Filled in at the end of the build.)
