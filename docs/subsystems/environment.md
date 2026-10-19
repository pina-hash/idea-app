# Environment variables and credentials

_Moved word for word from `CLAUDE.md` on 2026-10-19 (ledger 0415). Every server-only credential, its one reader, and the Foundry origin variables. The entry point and the table of every subsystem file is [`CLAUDE.md`](../../CLAUDE.md)._

## Environment

Read via `$env/static/public`: `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`.

Read via `$env/dynamic/public` (runtime, so a missing value never breaks the
build and the page degrades gracefully): `PUBLIC_FSP_APPS_SCRIPT_URL`,
`PUBLIC_FSP_PULSE_APPS_SCRIPT_URL` and `PUBLIC_VAPID_PUBLIC_KEY`.

**SERVER-ONLY**, read via `$env/dynamic/private` (runtime; never in the client
bundle; a missing value degrades to a clear "not configured" response, never a
build break):

- **`SUPABASE_SERVICE_ROLE_KEY`** -- read by exactly SEVEN places: the GREENLINE
  community-track publish endpoint (which must run the game's real track
  validation in Node before any row is written), the push sender
  (`src/lib/server/push.ts`, whose `serviceClient()` the tournament alerts and
  the Friday coin digest route `src/routes/api/coin/digest-push/+server.ts`
  both use; that route reads no key of its own and holds no session check,
  because `coin_digest_push_due` sends at most once a week at its own time),
  the anonymous feedback route (`src/routes/api/feedback/+server.ts`, the only
  caller of `app_feedback_submit`, which is granted to `service_role` alone
  because the rate limit's key has to come from the request and not from
  anything in it), and Foundry -- which is now ONE reader again,
  `src/lib/server/foundry-bundle.ts`, backing the review queue's source viewer,
  BOTH serving routes (the frame src and the direct page, which resolve a
  version differently and then share one responder) AND the delete sweep -- four
  functions, one module, one client. **It was two while an Edge Function served the
  bytes in a different runtime and could not import the first**; deleting the
  function collapsed that split, and a second reader should not come back. It
  exists because `foundry-bundles` carries no storage policy at all, which makes
  `service_role` the only role that reaches it, and it re-checks explicitly
  every rule RLS would otherwise have enforced. **The FIFTH is
  `src/lib/server/html-assignment-document.ts`**, which resolves a ported HTML
  assignment for `/hx/<docId>` -- the same shape and the same reason as
  Foundry's: the document host holds no session, so no policy can be satisfied
  there, and the route re-checks on every request what RLS would have enforced
  (the handle is a uuid, the row exists, the item is a live assignment). **The
  SIXTH is `src/lib/server/armory/backend.ts`** (IDEA Armory, contract section
  3), for exactly two things: `armory_connect_codes`, which no client role can
  touch, and minting the Windows agent's own session (`generateLink` then
  `verifyOtp`); membership and device registration run on the caller's own
  token. **The SEVENTH is `src/lib/server/connector/backend.ts`** (the IDEA
  Website connector, ledger 0400), for exactly two things, the same two as
  Armory's: the `connector_*` tables, which no client role can touch, and
  minting the connected admin's own session; every tool call runs on that
  session. **The same key's VALUE also sits outside this `$env` census** as the
  repository secret `ARMORY_MIRROR_SUPABASE_SERVICE_ROLE_KEY`, whose one reader
  is `tools/armory-drive-mirror.mjs` (ledger 0404): the nightly mirror must read
  every Armory project, which member-only RLS forbids any other role, and it
  sends GETs for four tables' named columns and no write (see the census of
  `process.env` credentials below). This line said FOUR until 2026-09-10, FIVE until 2026-10-06 and SIX
  until 2026-10-18, and the
  count is the kind of figure that goes stale the moment another surface needs a
  credential, so **move it in the same edit that adds one**. Nothing else may read it, and
  **it must never gain a `PUBLIC_` prefix**. Unset, the feedback
  route answers a structured `not_configured` refusal rather than a retryable
  failure: a missing environment variable does not fix itself in eight seconds
  of backoff.
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
- **`ARMORY_R2_ACCOUNT_ID` + `ARMORY_R2_ACCESS_KEY_ID` +
  `ARMORY_R2_SECRET_ACCESS_KEY` + `ARMORY_R2_BUCKET`** -- IDEA Armory's file
  storage (Cloudflare R2). Read ONLY by `src/lib/server/armory/storage.ts`, which
  signs fifteen-minute URLs and never reads or writes a file's bytes, and since
  0233 also SENDS, from the server, a presigned DELETE and then a HEAD for a
  stored file the database's orphan queue says no project names any more (the
  sweep in `src/lib/server/armory/sweep.ts`, which marks it swept only when
  that HEAD answers 404). Any one unset is 503
  `armory_storage_not_configured` from `/api/armory/blob-url`, a 503 from the
  past-version download (`/armory/<project>/file/<file>/version/<version>`,
  ledger 0366), and a "File storage is not switched on" sentence from Delete
  forever and the storage cleanup, which then make no request at all.
- **`ARMORY_RELEASES_TOKEN`** -- a read-only GitHub token for the
  pina-hash/idea-armory releases WHILE THAT REPOSITORY IS PRIVATE. It was
  public on 2026-10-06, so `installerDownload` sends the browser straight to
  GitHub's own download and the token is the second way, not the first
  (ledger 0366). Read ONLY by `src/lib/server/armory/releases.ts`; it goes to
  api.github.com and never to the signed asset host or the browser. With
  neither a public release nor the token, `/armory/start` and
  `/armory/download` say to ask for the flash drive and show no link.

- **`CERT_SIGNING_PRIVATE_KEY`** -- the Ed25519 private key that signs every
  IDEA certification serial (ledger 0391). Read ONLY by
  `src/lib/server/certifications/signing.ts`. Unset, `POST /api/certifications/award`
  REFUSES with `CERT_SIGNING_UNSET_MESSAGE` and nothing is awarded unsigned;
  `/certifications/verify/public-key` answers 404. Never printed, logged or
  echoed, in any form.
- **`RESEND_API_KEY` + `CERT_EMAIL_FROM`** -- the certification email family's
  transport. Read ONLY by `src/lib/server/email/index.ts`; either unset makes
  every send a clean no-op (the notification row still lands and the badge
  still counts it).
- **`TECHMEN_SUPABASE_URL` + `TECHMEN_SUPABASE_ANON_KEY` +
  `TECHMEN_CERT_SYNC_SECRET`** -- the FRC app mirror (the contract is the
  frc-app repository's own IDEA_CERTIFICATIONS_SYNC document, which the spec
  places in FRC-Team-5669-Techmen/frc-app, followed character for character). Read ONLY
  by `src/lib/server/certifications/mirror.ts`; any one unset is a `not set up`
  row in `cert_sync_log` and no request.
- **`CRON_SECRET`** -- the bearer the certification job routes require once it
  is set (Vercel's own cron convention, `Authorization: Bearer <CRON_SECRET>`).
  Read ONLY by `src/lib/server/certifications/jobs.ts`; unset, the routes are
  open to the scheduler exactly as `/api/coin/autopay` is, throttled to one run
  a minute per instance. A signed-in admin always passes. **THE PORTAL HAS NO
  VERCEL CRON**: the project is a Hobby account, which holds two cron jobs, and
  both are the coin economy's (`vercel.json`), so a third entry would be
  refused at deploy time. `.github/workflows/cert-jobs.yml` is the one
  scheduled caller; it sends the bearer when a repository secret of the same
  name is set and calls the open route when it is not, and `CRON_SECRET` locks
  the route only once it is set in BOTH places.
**RETIRED, and to be removed from the Vercel env: `COIN_API_KEY`,
`COIN_LEDGER_URL`, `PUBLIC_FOUNDRY_APPS_HOST`, `PUBLIC_FOUNDRY_APP_ORIGIN` and
`FOUNDRY_TOKEN_SECRET`.** Nothing reads any of them. **Retired on the Supabase
side too: the `FOUNDRY_APP_ORIGIN` function secret** (`supabase secrets unset`),
which never took effect because the gateway replaced that CSP wholesale.

**FOUNDRY READS TWO PUBLIC VERCEL VARIABLES, BOTH VIA `$env/dynamic/public`.**
`PUBLIC_FOUNDRY_APPS_ORIGIN` is the origin bundles are served from
(`https://apps.ideabosco.com`); the serving route 404s a bundle path arriving on
any other origin, and **unset removes the launch control AND the share link
everywhere rather than falling back to the current origin** -- that fallback
would serve student bundles off the main, cookie-carrying host, silently, which
is the one failure nobody would notice. `FoundryDetail` is the one place it is
read on the gallery path and hands it down to `AppStage`, because the frame src
and the share link must name the same origin and two independent reads are how
they come to differ. `PUBLIC_FOUNDRY_PORTAL_ORIGIN` becomes the CSP
`frame-ancestors`; unset means unrestricted. **UNSET NO LONGER MEANS "no portal
origin", THOUGH, AND THAT DISTINCTION IS THE ONE TO KEEP STRAIGHT**: the value
the CSP and the sandbox flags actually use is `foundryPortalOrigin`'s, which
falls back to `https://ideabosco.com` whenever the APPS origin is set, so the
variable's absence is a supported production configuration rather than a
degraded one. Its resolved value, and whether the fallback produced it, are
readable off the admin line in `AppFrame` -- which exists because nobody working
in this repo can read what Vercel holds. **There is no separate deploy step
any more** -- the route ships with the app, which is the ordering problem the
Edge Function created and this removes.

**ON A VERCEL PREVIEW DEPLOYMENT, THE TWO VARIABLES ARE EQUAL OR BOTH UNSET,
NEVER TWO DIFFERENT HOSTS.** A preview deploys to exactly one host, so naming
`PUBLIC_FOUNDRY_APPS_ORIGIN` as that preview's own URL and
`PUBLIC_FOUNDRY_PORTAL_ORIGIN` as something else claims the bundle origin and
the portal origin differ when they are the same server answering both roles.
That claim is what the conditional `allow-same-origin` grant reads --
`foundrySandboxFlags` appends the flag only when both origins are non-empty
AND differ (see the origin-split section above) -- so a preview configured
with two different hostnames is misconfigured into GRANTING student bundle
code `allow-same-origin` on a host that, on a preview, is genuinely carrying
that preview's session cookies (not `httpOnly`, exactly as on production).
**Equal origins withhold the flag, which is the safe answer, and the routes
are still fully exercisable** -- the host gate and the publication check run
regardless of the CSP grant, so setting both variables to the preview's own
URL (or leaving both unset, which is also safe: the fallback in
`foundryPortalOrigin` only fires when the apps origin is set) verifies the
serving routes on a preview with no window for the escape the conditional
grant exists to close.

**ONE MODULE KNOWS EACH CREDENTIAL.** A secret has exactly one reader, which is
the single egress point for that service. Do not add a second.

**THE CENSUS ABOVE IS THE `$env` SURFACE ONLY, AND IT IS NO LONGER THE WHOLE
LIST OF CREDENTIALS THIS REPOSITORY KNOWS ABOUT.** Two POSTGRES connection
strings sit outside it, and since ledger 0404 the Armory mirror's set beside
them, each read from `process.env` by a tool rather than through
`$env/dynamic/private`, because nothing in `src/` may ever reach them and a
`$env` import is exactly how something would:

- **`ARMORY_MIRROR_*`** (ten repository secrets, listed in `MIRROR_SECRETS` in
  `tools/armory-drive-mirror-plan.mjs`) -- the nightly Shared Drive mirror's own
  names, held by `.github/workflows/armory-drive-mirror.yml` and read by
  `tools/armory-drive-mirror.mjs` alone. The VALUES may equal the website's (the
  service role key, the Google OAuth client), the shape `tools/backup/drive-upload.mjs`
  set with `BACKUP_GOOGLE_*`, so revoking the mirror never touches the site. Its
  R2 key is a separate "Object Read only" key on the Armory bucket, so the mirror
  cannot write to storage whatever its code says.

- **`IDEA_MIGRATION_URL`** -- the `idea_migrator` role, which can WRITE.
  `tools/apply-migration.mjs` is its one WRITER and not its one reader
  (`supabase/roles/idea_migrator.sql` for what the role's event trigger refuses
  and what it measurably cannot catch), and `.github/workflows/migrate.yml` is
  the one workflow that holds it. **The full census is one bullet below, under
  `idea_migrator`, and it is the only statement of it** -- `migrate.yml` hands
  the same string to the probe under `DEPLOY_PROBE_URL`, which is exactly the
  kind of detail two copies of this list would stop agreeing about.
- **`DEPLOY_PROBE_URL`** -- read-only, and `tools/deploy-probe.mjs` is its one
  reader. **UNSET IS A SUPPORTED STATE**: the probe answers "cannot confirm",
  never "applied". **WHETHER IT IS SET IS NOT KNOWABLE FROM THIS REPOSITORY AND
  NO SENTENCE HERE MAY CLAIM IT**, the same way applied state is not: it is a
  repository secret, so a container sees it unset whether or not it exists, and
  a session reading its own environment learns nothing about the runner's. The
  instrument is a real workflow run's own job summary. Two sessions wrote
  opposite snapshots of this on one day, which is why it is a pointer now.

Both are never printed: `redact` in `tools/deploy-probe.mjs` is the ONE
implementation of that and `apply-migration.mjs` calls it rather than writing a
second.

See `.env.example`. **Never hardcode keys. Never commit `.env`.**

**The local `.env` is a PLACEHOLDER Supabase project** (`example-ref`), not a
live one, and **NO SESSION IN THIS REPOSITORY CAN SIGN IN AGAINST PRODUCTION OR
RUN AN RPC THERE.** This paragraph used to add "apply a migration" to that list
and **that half is now false**: `tools/apply-migration.mjs` applies one file to
production when `IDEA_MIGRATION_URL` is set, which is the whole point of the
scoped role, and `migrate.yml` does it on a merge to `main`. What has not
changed is that a CLOUD CONTAINER cannot open the socket -- measured: outbound
5432 and 6543 are both refused and only 443 is open -- so a session reaches
production only through the HTTPS proxy that tool tunnels over, and only with a
secret it does not have. **Every claim about live data must still say whether it
was measured or assumed.**

**WHAT CHANGED IS CI, NOT THE SESSION.** Two production credentials live as
GitHub repository secrets and **neither is readable from a session** --
`IDEA_MIGRATION_URL`, `DEPLOY_PROBE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are all
unset in a fresh cloud checkout, and a repository secret reaches an Actions
runner and never a container. `DEPLOY_PROBE_URL` is READ-ONLY and is what
`.github/workflows/deploy.yml` gives `tools/deploy-probe.mjs`;
`IDEA_MIGRATION_URL` can WRITE, and `.github/workflows/migrate.yml` gives it to
`tools/apply-migration.mjs` to apply the lowest unapplied migration on a push to
`main`. So **"no workflow may hold a write credential" is retired** -- one does,
deliberately, behind the scoped `idea_migrator` role -- and the sentence that
replaces it is narrower: **NO SESSION HOLDS EITHER, and a session that claims to
have checked production without naming which variable it read is claiming
something this environment cannot do.**

---
