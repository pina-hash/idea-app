# IDEA Certifications

_Moved word for word from `CLAUDE.md` on 2026-10-19 (ledger 0415). The signed serial, the certifier desk, verify, notifications and jobs. The entry point and the table of every subsystem file is [`CLAUDE.md`](../../CLAUDE.md)._

### IDEA CERTIFICATIONS -- a signed serial, a certifier's desk, and a verify page that says one word

**`docs/CERTIFICATIONS.md` IS THE SPEC AND `docs/certifications/DATA_MODEL.md`
IS THE BUILD CONTRACT (ledger 0391, migrations 0260 through 0264);
`docs/certifications/DECISIONS.md` carries every design point the spec left
open, D1 through D14, with its reason.** The portal lives at `/certifications`
with its own chrome (`CertShell`, over the site plate and in the Space White
scope through `SITE_PLATE_PREFIXES`), is NOT in `authedPrefixes` because the
verify page under the same prefix is public, and renders its own sign-in panel
for a signed-out visitor on every other path.

- **EVERY `cert_*` TABLE IS RLS-ON WITH NO POLICY AND NO CLIENT GRANT, AND
  EVERY WRITE IS A DEFINER FUNCTION THAT RE-CHECKS THE CALLER.** A certifier's
  reach is `_cert_can_certify(certification)` from `cert_authority`; an admin's
  is `is_admin()`. **A CERTIFIER NEVER ACTS ON THEIR OWN RECORD**: review,
  checkout, seat decisions, release, end, result and award all answer `self`
  for the caller's own attempt, and the mutation proof
  (`tests/db/cert-mutation-proof.mjs`) kills that gate by name.
- **THE ANSWER KEY NEVER LEAVES THE DATABASE.** `cert_exam_open` and
  `cert_exam_answer` project the question without its answer, scoring is
  `_cert_exam_score_one` inside `cert_exam_submit`, and a failed student
  reads `missed_topics` only. The draw (`_cert_exam_draw`) covers every topic
  at its minimum from a pool at least twice the exam's length (D6), shuffled
  per student, one question at a time, no going back; the proctor's release
  (`cert_exam_release`) is valid ten minutes; the cooldown after a fail is
  seven days (`_cert_cooldown_until`). Tab, window and fullscreen changes are
  `cert_exam_flag` rows with timestamps, shown live to the proctor and never
  a verdict.
- **A SERIAL IS 80 RANDOM BITS IN CROCKFORD BASE32, `IDEA-XXXX-XXXX-XXXX-XXXX`,
  SIGNED ED25519 OVER THE CANONICAL PAYLOAD.** `$lib/certifications/serial.ts`
  and `signing-payload.ts` are the one spelling of both (the payload's key
  order is fixed and `tests/cert-shared-modules.test.ts` pins the bytes); the
  route (`/api/certifications/award`) mints and signs, and `cert_award_commit`
  recomputes the payload's values from the record and refuses a mismatch (D9).
  **AN UNSET KEY REFUSES THE AWARD IN WORDS AND NEVER AWARDS UNSIGNED.**
- **VERIFY ANSWERS ONE WORD.** `cert_verify(text)` is the ONE anon-granted
  `cert_` function (named in `tests/db/ideacad-grants-anon-execute-surface.test.ts`),
  and `/certifications/verify` renders Valid, Suspended, Revoked, Expired or
  "No such certificate", rate limited per address in the route (D10), never
  which check failed. Expiry is derived at read time (D8), never swept into a
  stored status.
- **A NOTIFICATION IS A ROW FIRST, THEN AN EMAIL AND A PUSH.** Every function
  that notifies answers a `notify` array; the server action or route that
  called it hands the array to `sendCertNotifications`, which renders
  `renderCertEmail` (one table-based template family under
  `src/lib/server/email/templates/`), sends through the Resend transport in
  `src/lib/server/email/index.ts`, pushes, and stamps `cert_notifications_mark_sent`.
  The unread count rides the root layout as `certUnread` (never a reject) to
  the profile menu badge and the portal header.
- **THE MIRROR SENDS THE WHOLE SNAPSHOT, EVERY TIME, AND LOGS EVERY CALL.**
  `cert_mirror_snapshot` excludes drafts and sends a retired certification
  with `active: false`; `sendMirror` fires after every award and catalog
  change and from the daily job, and writes `cert_sync_log` whether the
  Techmen side answered or not.
- **THE SCHEDULED JOBS HAVE ONE CALLER, `.github/workflows/cert-jobs.yml`, AND
  NO VERCEL CRON** (D4, amended at landing): it calls
  `/api/certifications/jobs/daily` once a day, sending the bearer when the
  repository secret `CRON_SECRET` is set and calling the open route when it is
  not. The project is a Hobby account whose two cron slots the coin economy
  holds (see `CRON_SECRET` under Environment). The jobs reuse `serviceClient()`
  from `$lib/server/push.ts`, so the service-role key's reader census above
  stays at six.
- **NOTHING A STUDENT SEES EXISTS UNTIL A CERTIFICATION IS PUBLISHED, and
  publishing refuses an incomplete kit** (`_cert_publish_check`: every
  required part with content, the pool rule, at least one lesson or video).
  Hide takes a published certification back to draft only while nothing hangs
  off it; Delete removes only a never-published draft; Retire is the end state
  for anything ever earned (D7).
- **EVERY CLIENT SURFACE DEGRADES UNTIL ITS MIGRATION IS APPLIED**:
  `certNotAvailable` keys on `PGRST202` ALONE and renders the one
  "not available yet" sentence, never a broken page.
- **THE HARNESSES ARE THE FOURTEEN `cert-` PAGES UNDER `/dev`**:
  `/dev/cert-catalog`, `/dev/cert-certification`, `/dev/cert-verify`,
  `/dev/cert-me`, `/dev/cert-holders`, `/dev/cert-desk`, `/dev/cert-review`,
  `/dev/cert-award`, `/dev/cert-engine`, `/dev/cert-telemetry`,
  `/dev/cert-exam`, `/dev/cert-watch`, `/dev/cert-certificate` and
  `/dev/cert-emails`, covered by one prefix entry in `SITE_PLATE_DEV_PREFIXES`,
  each mounting the real components over in-memory transports and 404 in
  production.
