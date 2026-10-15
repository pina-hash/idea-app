# Certification portal: design decisions the build made

`docs/CERTIFICATIONS.md` is Mr. Pina's spec and its "Decisions" table and every
rule in its earning, exam, award and verify sections are his. This file records
what the build session (ledger 0391, 2026-10-15) decided where the spec left a
design open, each with its reason, so the next session can find the reasoning
before changing one. A decision here can be reversed by Mr. Pina; one in the
spec cannot be reversed here.

Each entry: what was open, what was decided, why, and what the alternative
would have cost.

## D1. Which name goes on the certificate

Open: the spec says "student name, large" and the repository has two names, the
Google account's `full_name` and a chosen `display_name`.

Decided: `display_name` when set, else `full_name` (the Foundry rule,
`foundryAuthorName`), resolved inside `_cert_person_name`, never the address.
The confirm dialog shows the exact name that will be recorded, and a correction
re-signs the record under the same serial if it is wrong.

Why: CLAUDE.md's chosen-identity rule ("a chosen public identity replaces the
account identity completely") is repository-wide and this is a surface every
signed-in student can read. The alternative, the account name for an official
document, would show a name the student chose to replace. If Mr. Pina wants the
legal name on paper, the change is one rung in `_cert_person_name` plus a
re-sign of existing awards.

## D2. Where every notification-producing write runs

Open: a browser can call a definer function directly, but an email needs a
server with the Resend key.

Decided: every write that produces a notification (submit, review, seat
decisions, release, award, award actions, publish and retire) runs through a
SvelteKit server action or API route on `locals.supabase`, the caller's own
client; the function returns a `notify` array and the route sends the email and
the push. Writes that notify nobody (watch reports, exam answers and flags,
practice results, read stamps) are browser RPCs. The daily job flushes any
notification whose `emailed_at` is still null after ten minutes, as the safety
net.

Why: the database stays the authorization boundary (the route never uses a
service-role client for a person's write), and there is exactly one sender. The
alternative, an outbox drained only by a job, delays every email by up to a day.

## D3. Lessons are served from the portal's own origin

Open: the classroom's `/hx/<docId>` serves a ported document through a
service-role read because the document host may hold no session.

Decided: `/certifications/lesson/<id>` serves a lesson's bytes on the caller's
own client (`cert_lesson_document`, gated on the certification being published
or the caller being its certifier), with the SAME CSP and sandbox set as `/hx`,
imported from `$lib/classroom/html-assignment/bridge.ts`, never copied. No
seventh reader of the service-role key is added for lessons.

Why: a lesson is admin-authored content (the same trust as a classroom import)
and the sandbox directive puts it in an opaque origin whichever host serves it,
exactly as the classroom's own CSP rule says. The alternative needed the
service-role key and a separate sandbox host for content nobody but the admin
writes. Cost: a deployment that sets `PUBLIC_HX_SANDBOX_ORIGIN` to a second
host does not move lessons there; they stay on the portal host under the same
opaque-origin sandbox.

## D4. The scheduled jobs run as the service role behind a NEW scheduler secret

Open: the daily mirror resync, dormancy sweep, expiry reminders and the email
flush run with no session.

What the audit found (2026-10-15): the repository's one existing cron route,
`/api/coin/autopay`, authenticates NOTHING. Its safety is the database's:
`coin_autopay_run` is anon-granted, idempotent, self-throttled and can only pay
what is owed. No `CRON_SECRET`, no bearer check and no `x-vercel-cron` read
exists anywhere in the tree. That shape cannot carry the certification jobs,
because `cert_mirror_snapshot` carries every holder's email and the job
functions are granted to `authenticated` and `service_role` only.

Decided: `CRON_SECRET` is a NEW server-only variable (`$env/dynamic/private`),
read by exactly one module, `src/lib/server/certifications/jobs.ts`, and it is
Vercel's own convention: when the variable is set in the project, Vercel sends
`Authorization: Bearer <CRON_SECRET>` with every cron request on its own, and
the route requires it (compared in constant time) from anyone who is not a
signed-in admin; a wrong or missing bearer answers 404 like every probe. UNSET,
the scheduler path is open exactly as the autopay route is, with a per-instance
floor of one run a minute per job: every job is idempotent housekeeping (the
mirror resends the whole snapshot, the sweep marks only what qualifies, a
reminder is keyed on its event, the flush stamps what it sent), the route
returns counts and never a record, and a stranger can only make the portal do
its own housekeeping sooner. So the portal's jobs work on the day it deploys,
and setting the secret is the lock, not the switch. The GitHub Actions caller
(`cert-jobs.yml`) insists on the secret and is red without it, so the lock gets
set. The service-role
client is `serviceClient()` imported from `$lib/server/push.ts`, an existing
sanctioned reader of `SUPABASE_SERVICE_ROLE_KEY`, so no new module reads that
key and CLAUDE.md's census stays at six. One Vercel cron entry runs the
combined `daily` job (mirror, then dormancy, then expiry, then the email flush,
in that order under one correlation id) because the Hobby plan's cron limit is
unverified and autopay already holds a slot; a GitHub Actions workflow
(`cert-jobs.yml`, the autopay workflow's shape with the backup workflow's
secret-presence step) is the second caller, holding `CRON_SECRET` as a
repository secret.

Why: a scheduler has no session, so the alternative to a secret is an anon
grant on functions that disclose addresses, which is exactly the hole the
repository's anon-sweep history exists to close. The frc-app's bcrypt-hashed
secret in a settings row was the other shape and adds a hand step for the same
effect.

## D5. Admin-only actions beyond the certifier's four powers

Open: the roles table gives a certifier "proctor, grade, review, award" as one
whole power, and lists suspend, revoke, correct, authority, publish, import,
settings under Admin only.

Decided: exactly that. `cert_award_action`, `cert_award_correct`,
`cert_authority_*`, `cert_admin_*`, `cert_settings_set`, `cert_sitting_post`,
`cert_exam_pool_*` and the package import are `is_admin()` only. A certifier
READS the records, the engine and the logs for their certifications and acts on
nothing there. Posting sitting windows is admin-only because the spec says "the
admin posts recurring windows"; a certifier approves requests.

## D6. Pool size rule

Open: "the pool holds roughly twice as many questions as one exam uses" and
"at least the per-topic minimum the admin sets".

Decided: publishing (and releasing an exam) requires the ACTIVE pool to hold at
least `2 x questions_per_exam` questions in total and at least each topic's
`minimum` within that topic. The draw takes each topic's minimum first, then
fills to the exam length from whatever remains, then shuffles.

Why: the total rule is the spec's own number; a per-topic doubling would turn
"roughly twice" into a stricter rule than Mr. Pina stated, and the per-topic
minimum is what makes the draw feasible.

## D7. "Hide" and "delete" in the engine

Open: the spec lists "adds, edits, hides, publishes and retires" and "a
certification with holders is never deleted, only retired".

Decided: Hide takes a published certification back to draft ONLY while it has
no awards and no active attempts (otherwise the engine says to retire it, with
the counts). Delete removes ONLY a draft that was never published and has no
attempts. Retire is the end state for anything that was ever earned.

## D8. Expiry is derived, never swept

Open: SAFE-1 and RESP-1 expire on a date.

Decided: `cert_awards.status` never becomes `expired`; the shown status is
derived (`_cert_award_status`, `awardShownStatus`) from `expires_at`, so the
verify page, the mirror snapshot and the holders board all agree without a
nightly sweep. The reminder job sends the 30-day notice; the mirror sends
`expired` the moment the date passes.

Why: CLAUDE.md's "derived, never stored" rule, and a trigger that stops firing
leaves a wrong value forever.

## D9. Serial and signature are produced by the server route, checked by the function

Open: the serial must be random and the signature needs the private key, which
only the server holds.

Decided: `POST /api/certifications/award` generates the serial (`newSerial`),
builds the canonical payload, signs it, and calls `cert_award_commit` with the
serial, signature, key id and payload. The function re-checks every requirement
and recomputes the payload's VALUES from the record, refusing a mismatch, and
enforces the serial's format and uniqueness. The function cannot verify an
Ed25519 signature (pgcrypto has none), so the signature's correctness is the
route's and is re-checked on every verify page load against the published key.

## D10. The verify page's rate limit lives in the route

Decided: an in-memory token bucket per client address in
`src/lib/server/certifications/verify-limit.ts` (30 a minute, 300 an hour),
answering 429 with the same page and one sentence. `cert_verify` itself is
granted to `anon` deliberately and allowlisted in the anon-surface test with its
reason.

Why: the same shape as the anonymous feedback route's limit, and a per-instance
limit is enough against guessing an 80-bit serial; the database stays out of the
rate-limiting business.

## D11. Watch tracking is client-measured and server-floored

Decided: the player wrapper (`YouTubePlayer.svelte`) accumulates played ranges
from the IFrame Player API's time while the state is PLAYING, blocks a rate above
2x by setting it back and pausing with a sentence, and pauses for a Continue
check-in at random intervals (3 to 8 minutes); a check-in unanswered for the
settings' timeout stops crediting. `cert_watch_report` is the floor: it ignores
any report whose `max_rate` exceeds 2, clamps ranges to the duration, merges
them server-side, and is the only writer of coverage.

## D12. The holders board shows names, never addresses

Decided: `cert_holders` projects a name and an `email_hash` (for grouping),
never an address; two holders with one name are two rows. Decision 5 opened the
board to every signed-in Bosco Tech account; the repository's "no public
response ever carries an email" rule still applies to a signed-in list every
student can read.

## D13. The portal is not in `authedPrefixes`

Decided: `/certifications/verify` is public, so the prefix cannot be guarded in
`hooks.server.ts`; the portal's layout renders its own sign-in panel for a
signed-out visitor on every other page, the Armory's shape, and the desk answers
404 to a non-certifier.

## D14. Portal chrome

Decided: the portal has its own header (`CertShell`): the IDEA mark, the four
student tabs, a Desk key for a certifier, the notifications badge and the
`ProfileMenu`, over the site plate; `/certifications` joins
`SITE_PLATE_PREFIXES` and the Space White scope so every theme paints it. It is
not a page inside the classroom shell, per the spec.
