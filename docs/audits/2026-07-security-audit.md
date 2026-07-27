# Security and authentication audit, July 2026

Read-only audit of `idea-app` as committed at `556d22f`. No application logic,
RLS policy, migration, or Apps Script reference was modified. This document is
the only file added.

Scope: every write path that can affect a ranked score, a leaderboard position,
a coin or credit balance, or a grade-adjacent record (Part 1), and the state of
student authentication across the whole site (Part 2). Findings in each part are
ordered by how easily a student could exploit them today, most exploitable
first.

Two systems are outside this repository and cannot be assessed here: the
VANGUARD leaderboard Apps Script and the IDEA Coin ledger Apps Script. What the
repo-side code sends them, and what it assumes in return, is documented below,
along with an explicit list of what a separate manual review of those two
scripts has to answer. See "Out of repo: what still needs a manual review".

---

## Summary

The codebase is not uniformly weak. It contains two genuinely well-built
authorization patterns that the rest should be measured against: GAUNTLET's
knowledge grading and the FRC quiz and progress lockdown, where the answer key
never reaches the client, grading runs server-side, and the completion write is
derived from `auth.uid()` rather than a parameter. GREENLINE's economy is also
sound on the dimensions it set out to protect: prices are server-authoritative
and never sent by the client, purchases are atomic under a row lock, and there
is deliberately no "credit my wallet" RPC.

The problems are concentrated in three places, and they are not subtle:

1. The VANGUARD leaderboard has no authentication, no server-side notion of a
   run, and submits by GET with every value in the query string. A score can be
   fabricated by typing a URL. This is almost certainly how the known incident
   happened.
2. The IDEA Coin ledger's write endpoint is disclosed on a fully public page,
   and that public page already performs a coin-affecting write keyed on a
   student name picked from a dropdown rather than on an authenticated
   identity. The teacher-only gate on the coin entry tool protects the user
   interface, not the API. Its 4-digit PIN is checked in the browser against an
   unsalted hash shipped in the page.
3. GAUNTLET hands the ranked answer key (the expected volume) to the same
   anonymous caller that submits against it, which defeats the volume-as-
   checksum model without any need to open SolidWorks.

Separately, portal sign-in is not restricted to the school Google Workspace
domain, and the signed-in tiers require only a session, not a role. Any Google
account can sign in and appear on the GAUNTLET and GREENLINE boards.

The canonical production domain is settled below: `ideabosco.com`.

---

# Part 1: write paths affecting scores, leaderboards, coins, and grades

## F1. VANGUARD leaderboard submission. Critical.

**Where:** `src/lib/legacy/vanguard/index.html`, `API_URL` at line 5443,
`submitToServer()` at line 5477, `submitCoopToServer()` at line 5484,
`submitScore()` at line 5762.

**What the client sends.** A single unauthenticated HTTP GET, issued by
assigning to an image source:

```
new Image().src = API_URL
  + '?action=submit&name=' + encodeURIComponent(curInitials)
  + '&score=' + score + '&sector=' + sec + '&acc=' + acc
  + '&t=' + Math.round(runTime) + '&mode=' + gameMode
  + '&ver=' + VERSION + '&cont=' + runContinued
  + '&k=' + runKills + '&bk=' + runBosses + '&cb=' + Date.now();
```

The co-op variant adds `name2` and both pilots' loadout fields. The board read
path (`action=top`) is JSONP with a caller-supplied `callback` parameter.

**What the server independently verifies or recomputes.** Nothing that this
repository can rely on, and structurally nothing that it could. The Apps Script
receives only the values above. There is no session, no bearer token, no
signature, no nonce, no server-issued run identifier, no prior "start" call, and
no server-side simulation. The game itself is served publicly at `/vanguard/`
without login, so the endpoint cannot bind a submission to a user even in
principle: there is no user to bind it to. Whatever validation the script
performs can only be plausibility bounds on the submitted numbers.

**Authentication required to submit.** None.

**Is the write scoped to the submitting user's own record.** No. There is no
concept of a record owner. `name` is `curInitials`, a free-form client string of
up to 12 grapheme cells that the player types on the name-entry screen. A
submission can therefore be made under any other student's initials.

**Could a student fabricate a value and have it accepted.** Yes, and this is the
lowest-effort forgery in the entire codebase. Three paths, easiest first:

1. **Paste a URL into the address bar.** Because the submission is a GET with
   every parameter in the query string, and because `API_URL` is a plain string
   literal in HTML that any visitor can read with view-source, no tooling is
   required at all. Read the URL, type it with the desired `score`, `sector`,
   `mode` and `name`, press Enter. No developer tools, no JavaScript knowledge,
   no account. This is the path that best matches a student fabricating a score
   with no special skills, and it is the most likely explanation of the known
   incident.
2. **One console call.** `submitToServer` is a top-level function declaration in
   global scope. `submitToServer(99999999, 99, 100)` from the developer console
   submits directly, using whatever `curInitials` currently holds. Setting
   `curInitials` first picks the name on the board.
3. **Mutate the score, then submit normally.** The score lives in the global
   `window.scoreT`. Setting it and pressing the in-game SUBMIT button produces a
   submission that is indistinguishable at the endpoint from a real one.

Nothing in the client is a barrier, and no client-side change could become one.
The only fields with any friction are the ones that do not matter: `ver`, `cont`,
`k` and `bk` are decorative board metadata.

Two further consequences worth recording. First, `mode` is client-chosen, so all
four boards (`normal`, `hardcore`, `coopnormal`, `coophardcore`) are writable
from the same URL, including the co-op boards which the game itself only writes
host-side after a qualifying match. Second, `action=telemetry` and
`action=feedback` on the same endpoint are the same unauthenticated GET shape, so
the balance telemetry that informs design decisions is equally forgeable and
should not be treated as evidence about how the game is actually played.

The JSONP board read deserves a note of its own: `jsonp()` injects a `<script>`
tag whose response executes in page context, and the rows it returns contain
player names that any anonymous party can write. Rendering escapes correctly
(`escHTML` at line 5486), so this is not currently exploitable in the page, but
it means the integrity of what executes in the VANGUARD page depends on the Apps
Script always JSON-encoding its output correctly.

## F2. IDEA Coin entry tool: 4-digit PIN, verified in the browser. Critical.

**Where:** `src/lib/legacy/coin-entry.html`, `PIN_HASH` at line 2631,
`attemptUnlock()` at line 2676.

**What the client does.** The tool renders a 4-dot PIN pad, hashes the four
typed digits with SHA-256 in the browser, and compares the result to a hash
literal committed in the page:

```js
const PIN_HASH = '30606ac3b4fd5c618ac4c6555ce007edd7fe73d75b685320aa56be211ebc4b40';
...
const inputHash = await sha256hex(pinBuffer);
if (inputHash === PIN_HASH) { localStorage.setItem(AUTH_KEY, ...); launchApp(true); }
```

**What the server verifies.** Nothing. The PIN never leaves the browser. No
value derived from it is attached to any subsequent request to the ledger. It is
a user-interface gate only.

**Strength against brute force.** The search space is 10,000 candidates, the
hash is unsalted, and SHA-256 is fast by design. Running the committed hash
against the full 4-digit space with stock Python on an ordinary laptop recovered
the PIN in **2 milliseconds after 1,739 candidates**. The recovered value is
deliberately not reproduced in this document, but it should be treated as
already known. The in-file comment claiming the PIN is "stored in two parts,
joined only at comparison time, never as a single literal" does not describe the
code as committed, and would not change the conclusion if it did: an unsalted
hash of a 4-digit secret is equivalent to publishing the secret.

**Strength against replay and bypass.** Brute force is not even necessary.
Three cheaper bypasses:

- Call `launchApp(false)` from the console.
- Write `localStorage.setItem('idea-entry-auth', String(Date.now()))`; the
  stored token is honoured for `AUTH_TTL`, 30 days.
- Ignore the tool entirely and call the ledger API directly (see F3), which is
  what the PIN was never in a position to prevent.

**Mitigating factor, and its limit.** Reaching the tool's HTML at all requires a
signed-in teacher: `src/routes/coin-entry/+server.ts` looks up `profiles.role`
server-side and redirects anyone who is not a teacher. That is a real control,
and it means the PIN's honest job is a second factor on a shared classroom or
kiosk device rather than a defence against students. It fails at that job too,
but the more important point is that the teacher-role gate protects the page and
not the endpoint, which F3 covers.

## F3. The coin ledger's endpoint is disclosed publicly, and the public page already writes to it. Critical.

**Where:** `static/coins/index.html` line 1693 (`CONTRACTS_API`), and
`src/lib/legacy/coin-entry.html` line 1649 (`API`). The two values are the same
Apps Script deployment.

`static/coins/index.html` is served straight from `static/` at
`/coins/index.html` with no authentication whatsoever. It is public tier by
design and is linked from the homepage. It contains the coin ledger's `/exec`
URL as a plain string literal. Any student who opens view-source on the public
leaderboard now holds the same endpoint the teacher-only entry tool uses.

That alone would be serious. The public page also performs a write. In
`submitApplication()` at line 3320:

```js
const url = CONTRACTS_API +
  '?action=submitRoleApplication&student=' + encodeURIComponent(selectedName) +
  '&role='    + encodeURIComponent(selectedRole) +
  '&answers=' + encodeURIComponent(JSON.stringify(answers));
```

`selectedName` is chosen from a rendered list of student names, not derived from
any authenticated identity, and the page's own success message states
"1 i&cent; held". So an anonymous visitor with no account can submit a role
application in any named student's name, and by the tool's own description that
holds one of that student's coins. Repeating it is a denial-of-funds against
another student, performed by someone who never logged in.

**What the endpoint verifies.** Unknown from this repository, and this is the
single highest-value question for the separate Apps Script review. The action
vocabulary the teacher tool uses is fully enumerable from `coin-entry.html`,
which is in the repo and is served to any teacher's browser. It includes at
minimum: `payout`, `logTransaction`, `updateTransaction`, `deleteTransaction`,
`addStudent`, `updateStudent`, `deactivateStudent`, `updateStudentWage`,
`logWeeklyWageFiltered`, `getFineOwed`, `collectFine`, `addContract`,
`updateContract`, `resetContract`, `cancelContract`, `deleteContract`, and
`completeContract`. If the deployment is configured to execute as the owner and
accept anonymous callers, with the action name as the only routing, then the
entire ledger is writable by anyone who read the URL off the public page.

**Could a student fabricate a value.** For `submitRoleApplication`, certainly and
today, with no account. For the balance-affecting actions, it depends entirely on
the out-of-repo script, and the repo-side evidence gives no reason for optimism:
no request signing, no shared secret, no token, and no per-action credential
appears anywhere in either HTML file.

## F4. GAUNTLET: the ranked answer key is disclosed to the anonymous caller that submits against it. High.

**Where:** `supabase/migrations/0034_gauntlet_volume_only_verification.sql`
(`gauntlet_macro_submit` and `gauntlet_run_targets`),
`0016_gauntlet_speedrun_start.sql` (`gauntlet_macro_start`),
`0035_gauntlet_run_events.sql` (`gauntlet_run_events_insert`).

**What the client submits.** The SolidWorks macros and the C# add-in POST to
PostgREST with the project's public anon key: `gauntlet_macro_start(p_code,
p_volume_mm3)` to open a run, then `gauntlet_macro_submit(p_code, p_volume_mm3,
p_run_id, p_surface_area_mm2, p_feature_count, p_mass_g, p_material,
p_unit_system)` to submit. The 8-character run code is the only credential.

**What the server independently verifies.** The genuinely strong parts, which
should be preserved through any fix:

- Elapsed time is server-computed as `now() - started_at`, where `started_at` is
  stamped by `gauntlet_macro_start`. There is no client clock in the ranked
  time.
- Attribution is not forgeable. The row is inserted with `v_token.user_id` read
  off the token, never a parameter, so a student can only cheat as themselves.
- Correctness is `abs(p_volume_mm3 - target) <= target * tol / 100`, a real
  geometric check, and the tolerance is tight (0.1 percent since 0036).
- A restart cannot reset an already-locked ranked time (`locked_at`), and a room
  token is consumed on a passing submit.

**What defeats it.** The expected value of the checksum is handed to the caller.
`gauntlet_run_targets(p_code)` returns `target_volume_mm3` and `tolerance_pct`,
and is granted to `anon`. Independently, `gauntlet_macro_submit` returns
`target_volume_mm3` and `tolerance_pct` in its response payload on **every**
submit, including a failing one, and a solo token is not consumed by a failure
(the migration comments note re-submission is allowed by design). So even if
`gauntlet_run_targets` did not exist, one deliberate wrong submit discloses the
answer at no cost.

**Authentication required.** None for the ranked write itself.
`gauntlet_macro_start`, `gauntlet_macro_submit`, `gauntlet_run_targets`,
`gauntlet_run_events_insert` and `gauntlet_run_analysis_upsert` are all
`grant execute ... to anon, authenticated`. The anon key and the project URL
(`ifxbufvugkzfxhwcwqhf.supabase.co`) are published in
`static/tools/idea-gauntlet-start.bas` and `idea-gauntlet-submit.bas`, which are
served publicly from `static/tools/`. Only the initial reveal
(`gauntlet_speedrun_reveal`) requires a session, and a student performs that
legitimately for their own challenge.

**Could a student fabricate a value.** Yes, without opening SolidWorks. Reveal
normally in the web interface to obtain a code, then from any HTTP client:

1. `POST /rest/v1/rpc/gauntlet_macro_start` with `{p_code, p_volume_mm3: 0}`.
   The blank-part check is `p_volume_mm3 > 0`, a client-attested value the
   migration itself labels as such. The server stamps `started_at = now()`.
2. `POST /rest/v1/rpc/gauntlet_run_targets` with `{p_code}`. Read
   `target_volume_mm3`.
3. `POST /rest/v1/rpc/gauntlet_macro_submit` with that exact volume and the
   `run_id` from step 1.

The result is `is_correct = true`, an elapsed time of a few seconds, and a row
inserted with `source = 'macro'`, which is precisely the source the
`gauntlet_leaderboard` view treats as machine-verified and ranks. The
server-stamped clock is not bypassed, it is simply started moments before the
submit.

The two non-Speedrun modeling modes are softer still. Feature Golf's
`score_metric` is `p_feature_count`, a raw client-reported integer with no
cross-check beyond volume, so `p_feature_count: 1` wins that board outright.
Reverse Engineer's score is the mean deviation of client-reported volume and
surface area from stored targets, so submitting the exact targets scores 0.0,
a perfect result.

The root cause is disclosure, not the volume-as-checksum design, which is sound.
A checksum only constrains a party that does not know the expected value. The
0034 comment justifies the anon grant on `gauntlet_run_targets` on the basis that
"these values are already shown on the web run screen after reveal", which is
true of the target mass and density but is exactly the wrong property for the
target volume, since volume is the ranked comparison.

`gauntlet_run_events_insert` being anon-granted means the live telemetry feed and
the post-run analysis can be populated to make a fabricated run look like real
modelling work. Telemetry is fail-safe and non-authoritative by design, which is
correct, but it does mean telemetry cannot be used as corroborating evidence when
investigating a suspect run.

Manual submissions (`gauntlet_submit` with a typed mass, and
`gauntlet_room_manual_submit`) are authenticated and explicitly unranked or
host-supervised, and the leaderboard view already excludes manual entries from
the modeling boards. That part of the model is working as documented.

## F5. GREENLINE race results, leaderboard, and Ignition Credits. Medium.

**Where:** `0049_greenline_accounts.sql`, `0052_greenline_economy.sql`,
`0054_greenline_race_telemetry.sql`, `0058_greenline_track_featuring.sql`,
client seam `src/lib/greenline/persistence.ts`.

**What the client submits.** One RPC, `greenline_submit_race_result`, carrying
track id, mode, finishing position, total time, best lap, laps, archetype, a
creative flag, four equipment fields, and the route taken.

**What the server independently verifies or recomputes.** More than any other
game surface in the repo:

- `user_id` is stamped from `auth.uid()` and `created_at` from `now()`.
  Attribution is not forgeable and cannot be pointed at another player.
- The award is computed server-side from the submitted placement plus a
  personal-best comparison against the player's own prior rows. The client never
  sends a price or an award amount.
- Creative runs are forced to `mode = 'creative'`, which the leaderboard RPC
  (which filters `mode = 'race'`) never ranks, and which zeroes the award. One
  flag, both consequences, decided in one place.
- Community tracks are gated on `featured` (0058); anything unfeatured, removed,
  or malformed is demoted to the creative branch rather than rejected.
- A 30-second award throttle zeroes the payout for a second result inside the
  window. The run still logs.
- No client insert, update, or delete grant exists on `greenline_race_results`,
  `greenline_wallets`, or `greenline_unlocks`. `greenline_item_price` is revoked
  from `anon` and `authenticated` entirely, so it is server-internal.
  `greenline_purchase_item` takes `SELECT ... FOR UPDATE` on the wallet row, and
  the schema carries `check (balance >= 0)`.

**What it does not verify.** The metrics themselves. There is no server-side
simulation, no run token, and no start call, so lap time, total time, finishing
position, and whether a race happened at all are taken on trust. The 0049 header
states this explicitly.

**Could a student fabricate a value.** Yes, but only as themselves. From the
console of any signed-in student, the browser Supabase client is reachable in
page scope:

```js
supabase.rpc('greenline_submit_race_result', {
  p_track_id: 'terminal-nine', p_finish_position: 1,
  p_total_time_ms: 1, p_best_lap_ms: 1, p_laps: 3
});
```

That is an immediate first place on the track board and a 160 IC award. Farming
credits is throttled to roughly two awards per minute, so the full catalogue of
about 11,800 IC is around 50 minutes of a loop. In practice creative mode
currently defaults to on, which zeroes awards and un-ranks runs, so a student
would first have to turn it off in settings; that is a toggle, not a barrier.

Two smaller notes. `greenline_leaderboard(p_track_id)` aggregates any track id
string it is handed, and `track_id` is free-form text by design, so a player can
submit and rank on an invented track id. Low impact today, but it means the set
of boards is open rather than closed. Separately, the community-track publish
endpoint (`src/routes/api/greenline-track-publish/+server.ts`) is the strongest
write path in the repository and should be treated as the internal reference
implementation: session required, service-role insert, the game's real
TypeScript validation run on the submitted payload, author name read server-side
from `profiles` rather than the body, explicit size caps, and `status: 'pending'`
set explicitly rather than relying on a column default the service role would
bypass.

## F6. VANGUARD cloud save, run history, and run checkpoint. Low to medium.

**Where:** `src/routes/api/vanguard-save/+server.ts`,
`src/routes/api/vanguard-run/+server.ts`,
`src/routes/api/vanguard-run-state/+server.ts`, migrations `0002`, `0014`,
`0032`, `0037`.

**Authentication and scoping.** All three endpoints reject requests without a
session with a 401, and all three filter and write by `claims.sub` rather than
trusting any identifier in the body. RLS on all three tables is strictly
owner-scoped with `user_id = auth.uid()` on select, insert, and where present
update. There is no client delete grant. Attribution is not forgeable, and one
student cannot touch another's rows.

**What the server verifies about content.** Effectively nothing.
`vanguard_saves` merges an arbitrary `{vanguard_*: string}` snapshot;
`vanguard_runs` accepts a whitelisted but unverified run summary;
`vanguard_run_state` accepts a checkpoint blob that `__ideaRestoreRun` rebuilds a
live play state from. The save merge is union and max by design, so a poisoned
progression blob is not self-correcting: once maxed it stays maxed and
propagates to every device.

**Could a student fabricate a value.** Yes: every upgrade unlocked, an invented
run history, and a resumed run beginning at a high sector with a large banked
score. Rated low only because **none of this reaches the shared leaderboard**,
which goes to the Apps Script covered in F1. The blast radius is the student's
own account and their own history view.

One connection worth drawing: the checkpoint carries a `continued` flag which is
threaded to the leaderboard as `cont`. Since the checkpoint is client-authored,
the CONTINUED badge on the board is not trustworthy either, independent of F1.

## F7. GAUNTLET knowledge modes and the FRC quiz and progress model. Informational.

These are the two places the repository gets this right, and they are the
template the rest should be held to.

`gauntlet_submit` (0008) is SECURITY DEFINER, reads the hidden `answer` column
which has no client grant at all, grades server-side, and inserts with
`user_id = auth.uid()`. A student cannot forge `is_correct` or a score, and
cannot read the key.

FRC is stronger still because it was hardened after a hole was found.
`0041_frc_progress_lockdown.sql` revoked student insert, update, and delete on
`frc_user_progress` outright and dropped the self-write policies, closing a gap
where a student could previously write their own completion row directly through
PostgREST and bypass every gate. The only student-reachable path to a completion
is now `frc_quiz_grade`, which grades against a sealed key the client never
receives, and derives both the unit id (from the attempt row) and the user id
(from `auth.uid()`) rather than accepting either as a parameter.
`frc_mark_complete` and `frc_unmark_complete` enforce `is_teacher()` inside the
function body regardless of which user id is passed, so they are a genuine
teacher-only override rather than a UI-gated one.

Residual risk is limited to unlimited retries against a fixed item bank behind
an escalating cooldown, which a determined student can grind by memorisation.
That is an acceptable trade for a formative gate.

Modeling-gate submissions (`0042`) are also correct: a student's RLS write is
pinned to `status = 'submitted'` by a WITH CHECK, so self-approval is impossible,
and approval is a separate teacher call to `frc_mark_complete`.

## F8. FSP tools writing to Apps Script with client-side-only domain checks. Medium.

`/fsp-tech-selection` and `/fsp-pulse` post directly to their own Apps Script
endpoints, upserting on a client-supplied email with current-state-only
semantics. The `@boscotech.net` restriction is a client-side array check plus a
Google `hd` hint, and `hd` is a sign-in account-chooser hint, not enforcement.
The receiving script sees an unauthenticated POST carrying an email, so anyone
who knows a student's address can overwrite that student's ranking. This is
pathway-interest data rather than a score, but it feeds staff planning and is
grade-adjacent enough to record here. Both endpoint URLs are currently
placeholders in `.env.example`, so this is a design property to fix before the
tools go live rather than an active exposure.

Both files carry a comment marking the current `@boscotech.edu` allowance as
prototype-only and requiring reversion before real FSP use. That has not
happened yet.

`/fsp/frc-interest` is a deliberate anonymous insert with `with check (true)`
(0046), which is defensible: there is nothing to forge and no ranking involved.
The realistic risk is unthrottled spam, since there is no rate limit.

`fsp_questions` is done correctly: the only insert path is
`submit_fsp_question`, which is authenticated, stamps `created_at` and
`answered` server-side, and forces `submitter_name` to null when
`p_is_anonymous` is true rather than trusting the client to omit it. Note that
`/fsp/ask` tells the student "You earned 1 IDEA Coin" while no coin write exists
anywhere in this repository, so that award is a manual out-of-band process and is
not auditable from here.

## F9. Open redirect on the OAuth callback. Low.

`src/routes/auth/callback/+server.ts`:

```ts
const next = url.searchParams.get('next') ?? '/dashboard';
if (code) { ... if (!error) { redirect(303, next); } }
```

`next` is never validated as a same-site path. A link of the form
`https://ideabosco.com/auth/callback?next=https://attacker.example` sends the
user off-site immediately after a successful sign-in, from a URL that genuinely
begins with the school's domain. The PKCE code is exchanged server-side before
the redirect and no token appears in the URL, so this is a phishing aid rather
than a token leak. The fix is a single guard requiring `next` to start with `/`
and not with `//`.

---

# Part 2: student authentication across the site

## Identity provider

One provider, everywhere: Supabase Auth with Google OAuth over PKCE, with a
single callback at `src/routes/auth/callback/+server.ts`. Sessions are
cookie-based, created by the server client in `src/hooks.server.ts`, and
validated per request by `resolveClaims()`. There is no second identity system
anywhere in the portal. That consistency is a real strength and should survive
any rebuild.

## Domain restriction: not enforced for the portal

The main portal sign-in, `src/routes/+page.svelte` line 123, passes no `hd`
parameter and applies no allow-list:

```ts
await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: { redirectTo: `${window.location.origin}/auth/callback?next=...` }
});
```

Any Google account can therefore create a session on this site.
`role_for_email` (0001) assigns such an account the `visitor` role, but that role
is not a barrier to the signed-in tiers.

`authedPrefixes` in `hooks.server.ts` is `['/dashboard', '/gauntlet', '/frc',
'/greenline']`, and the guard checks only for the presence of claims, not a role.
Only `/dashboard` re-checks the role in its own load. The consequence is direct:
a personal Gmail account can enter GAUNTLET, FRC, and GREENLINE, appear on the
GAUNTLET and GREENLINE leaderboards, and earn and spend Ignition Credits. Of all
the authentication gaps this is the one with the clearest competitive-integrity
impact, and it is a small fix.

`/fsp/live` is the only place that passes `hd: 'boscotech.edu'`, and that is a
hint to Google's account chooser, not an enforcement mechanism. Its actual
restriction is a client-side comparison against `ALLOWED_DOMAIN`, which is a user
interface behaviour, not a boundary. The real boundary for that page is the RLS
policy on `fsp_config`, which restricts updates by JWT email domain server-side,
so the outcome is acceptable even though the client check is not load-bearing.

## Staff and student distinction

Yes, and this part is implemented correctly and consistently.

Roles derive from the sign-in email domain via `role_for_email`:
`@boscotech.edu` gives `teacher`, `@boscotech.net` gives `student`, anything else
gives `visitor`. The role lives in `profiles`, not in the JWT, so every check is
a server-side lookup. A trigger plus RLS prevents anyone from changing their own
role, enforced in the database rather than in client code.

Teacher-only surfaces gate server-side in their page loads: `/dashboard`
(redirect), `/coin-entry` (redirect), `/gauntlet/author` (redirect),
`/greenline/moderation` (404, deliberately chosen over a redirect so a probing
student learns nothing). More importantly, the cross-user staff actions enforce
`is_teacher()` *inside the function body*, which is what actually matters:
`frc_mark_complete`, `frc_unmark_complete`, `greenline_decal_review`,
`greenline_track_review`, `greenline_track_set_featured`, and
`greenline_track_remove`. The route guards are convenience and discoverability;
the RPC-internal checks are the boundary. That separation is stated explicitly in
several of the guards' own comments and is held to in practice.

## Consistency of the login experience

Fragmented. There are five distinct patterns:

1. **Portal**, covering `/`, and by inheritance GAUNTLET, FRC, and GREENLINE:
   server-side prefix guard in `hooks.server.ts`, sign-in control in the page
   header, no domain restriction, session-only (no role required).
2. **VANGUARD**: no login at all, for play or for the leaderboard. Signing in is
   purely additive and unlocks cloud saves. This is the only ranked surface on
   the site with no identity whatsoever, which is precisely F1.
3. **FSP tools** (`/fsp-tech-selection`, `/fsp-pulse`, `/fsp/ask`, `/fsp/live`,
   `/fsp/day1`, `/fsp/day2`): in-page sign-in gates, deliberately excluded from
   `authedPrefixes` because they are reached cold from QR codes and a redirect
   to `/` would be hostile. Each carries its own hand-written domain allow-list.
4. **`/fsp/frc-interest`**: intentionally anonymous, no sign-in.
5. **Legacy coin tools**: `/coin-entry` behind a server-side teacher role check
   plus the client-side PIN; `/coins/index.html` fully public with no gate.

The practical cost of the fragmentation is that the domain policy is expressed in
at least four independent places: `role_for_email` in SQL, and three separate
`ALLOWED_DOMAINS` literals in `fsp-tech-selection/+page.svelte`,
`fsp-pulse/+page.svelte`, and `fsp/ask/+page.svelte`, two of which are annotated
as prototype-only and currently accept staff addresses alongside student ones.
Every one of the client-side checks is advisory. A rebuild should reduce this to
one server-side helper.

## Production domain: settled

**`ideabosco.com` is canonical.** The evidence in the repo is consistent and
unambiguous:

- `vercel.json` declares a host-matched permanent (308) redirect from
  `idea-app-sage.vercel.app` to the same path on `https://ideabosco.com`. It is
  scoped by a `has` host condition, so it fires only for the vercel.app host.
- `src/routes/sitemap.xml/+server.ts` sets `const SITE = 'https://ideabosco.com'`.
- Open Graph tags hardcode `https://ideabosco.com/` (`src/routes/+page.svelte`)
  and `https://ideabosco.com/vanguard/` (`src/routes/vanguard/+server.ts`).
- `/fsp/live` generates its student-facing QR code against
  `https://ideabosco.com/fsp/ask` and labels it as such.
- `CLAUDE.md` states the same rule and requires every hardcoded absolute URL to
  use it.

So `idea-app-sage.vercel.app` is a live but non-canonical origin that bounces to
the custom domain. The project notes that disagreed are stale on the vercel.app
side, not wrong about it existing.

This has one authentication consequence worth flagging, which the repo cannot
settle on its own: every `redirectTo` is built from `window.location.origin`, so
a session begun on the vercel.app host would round-trip through that origin. The
308 covers navigation, but the Google OAuth client's authorised redirect URIs and
Supabase Auth's Site URL and Redirect URLs allow-list live outside this repo and
must be checked to confirm they list `ideabosco.com` and do not still carry stale
`*.vercel.app` preview entries.

Also visible from the repo, and normal but worth recording: the Supabase project
ref `ifxbufvugkzfxhwcwqhf` and the public anon key are published in the VBA macros
under `static/tools/`. That is by design for an anon key, but it means the project
is trivially identifiable and every anon-granted RPC is reachable by anyone.

---

# Out of repo: what still needs a manual review

Both Apps Script deployments are outside this repository and cannot be assessed
from it. Both need a separate manual review, and both should be assumed
compromised in the meantime because their URLs are in publicly served HTML.

**1. VANGUARD leaderboard script** (`AKfycbxFMp3q...`, referenced at
`src/lib/legacy/vanguard/index.html:5443`). Determine: whether any secret,
nonce, or signature is expected on `action=submit` (the repo-side code sends
none, so the answer is almost certainly no); whether any plausibility bounds are
applied to `score` against `sector`, `t`, and `k`; whether any per-IP or
per-session rate limiting exists; whether `action=top` returns properly encoded
JSON given that player names are anonymous-writable and the client evaluates the
response as script; and whether any delete or edit action exists that would allow
removing the known fabricated entry, or would allow a student to remove
legitimate entries.

**2. IDEA Coin ledger script** (`AKfycby_p-lI...`, referenced at
`src/lib/legacy/coin-entry.html:1649` and, publicly, at
`static/coins/index.html:1693`). This is the higher-value review of the two,
because it is the only system backed by something students actually want.
Determine: the deployment's execute-as and access settings; whether **any** of
the balance-affecting actions check a caller identity or a shared secret, or
whether the action name is the only routing. Test at minimum `logTransaction`,
`payout`, `updateStudentWage`, `collectFine`, `addStudent`,
`deleteTransaction`, and `completeContract` from an unauthenticated client from
outside the school network. Test `submitRoleApplication` with an arbitrary
student name, since the public page already performs exactly that call.

**3. The PIN, specifically.** There is no server-side PIN check anywhere in the
repo-side code. Confirm the Apps Script does not check one either. If it does
not, then the PIN protects nothing beyond someone watching over the teacher's
shoulder, and brute-forcing it is unnecessary: because every action is a GET
with parameters in the query string, a single captured or replayed request URL
is sufficient, and such URLs persist in browser history, in any proxy or device
management logs, and in any screen recording or projected classroom display.
Replay is the realistic attack, not cracking. If the script does check a PIN,
verify it is rate-limited and that it is not the same 4-digit value.

---

# Prioritised hardening list

## P0, before anything else

1. **Rotate both Apps Script deployments** to new `/exec` identifiers. Both
   current URLs are committed to this repository and served in public HTML.
   Treat both as known.
2. **Put an identity on every coin ledger write.** Nothing else on this list
   matters as much, because coins are the only currency here that students
   place real value on. Until the ledger can tell who is calling it, no control
   in front of it is meaningful.
3. **Remove write capability from the public `/coins/index.html`.** Either drop
   `submitRoleApplication` from the public page, or move it behind the
   authenticated portal so the applicant is `auth.uid()` rather than a name
   selected from a dropdown. As it stands, an anonymous visitor can spend
   another student's coin.
4. **Take the PIN out of the client.** If a device-level second factor is wanted
   on shared machines, it has to be verified server-side, be rate-limited, and
   be longer than four digits. A client-side comparison against a shipped hash
   is not a factor.

## P1

5. **Migrate the VANGUARD leaderboard off Apps Script onto a Supabase RPC.**
   Sketch below.
6. **Stop returning the answer key in GAUNTLET.** Remove `target_volume_mm3` and
   `tolerance_pct` from both the `gauntlet_run_targets` payload and the
   `gauntlet_macro_submit` response; return pass or fail and, if a coaching
   signal is wanted, a coarse deviation band. This is a small change that
   removes the entire F4 chain while leaving the server-stamped clock, the
   forgery-proof attribution, and the volume check itself untouched. Then
   reconsider the `anon` grants: either the add-in holds a real session, or run
   codes become single-attempt.
7. **Restrict portal sign-in to the school Workspace domain and enforce it
   server-side**, in `hooks.server.ts` or in a shared role check on
   `authedPrefixes`, not with the `hd` hint. Decide explicitly whether a
   `visitor` may appear on any leaderboard; today they can.

## P2

8. Validate `next` in the OAuth callback (F9). One line.
9. Consolidate the four copies of the domain policy into one server-side helper,
   and retire the two prototype `@boscotech.edu` allowances in the FSP tools.
10. Introduce rate limiting as a general capability. The 30-second GREENLINE
    award throttle is currently the only rate limit of any kind in the entire
    codebase.

---

# Sketch: migrating the VANGUARD leaderboard onto a Supabase RPC

Findings and shape only, as scoped. This is not a design and nothing here should
be treated as decided.

## What carries over directly from the GREENLINE pattern

The pieces already proven by `greenline_submit_race_result` and
`greenline_leaderboard` transfer with little change:

- A `vanguard_scores` table with `user_id uuid not null references auth.users`,
  RLS enabled, **no client insert grant**, owner-only select. The board is read
  through a SECURITY DEFINER RPC returning board-safe columns only, following
  `greenline_leaderboard` and `gauntlet_leaderboards`.
- A single SECURITY DEFINER `vanguard_submit_score(...)` that stamps
  `user_id = auth.uid()` and `created_at = now()`. This alone eliminates
  anonymous submission and name impersonation, which is the majority of F1.
- The display name read from `profiles` rather than from a client-supplied
  string. This is the change most likely to meet resistance, because arcade
  initials are part of the game's identity. A workable middle path is to keep
  `curInitials` as a cosmetic label while ranking and attributing by `user_id`,
  and to show the real profile name in the click-through row detail that already
  exists.
- A plausibility and replay throttle in the same transaction, reusing the
  `c_award_min_gap` idiom: reject or flag a submission arriving within N seconds
  of the same player's previous one, and bound `score` against `sector`, `t`, and
  `k` using the game's own progression constants.

## What does not carry over, and is the actual work

- **The game is served publicly, without login.** GREENLINE sits behind
  `authedPrefixes`; VANGUARD deliberately does not, and the public tier is a
  stated product decision in `CLAUDE.md`. The migration therefore forces a
  choice: require a session to *submit* while play stays public and the board
  becomes signed-in-only, or keep an anonymous board and accept that it cannot
  be trusted. There is no third option. An anonymous ranked board cannot be made
  forgery-resistant, because there is nothing to bind a submission to.
- **Reaching the client from inside the game.** The game is raw HTML served by
  `src/routes/vanguard/+server.ts`, outside the SvelteKit component tree, so it
  cannot use the app's browser client. Two precedents already exist in that
  file: the co-op work injects `window.__ideaCoop` with the public URL and anon
  key, and the cloud-save injection already POSTs to `/api/vanguard-save` using
  the cookie session. The second is the better model here. A SvelteKit endpoint
  (`/api/vanguard-score`) using `locals.supabase` and `claims`, calling the RPC
  server-side, keeps the cookie session as the credential and provides a natural
  place for plausibility checks written in TypeScript rather than PL/pgSQL.
- **The score is still a mutable global.** Changing the transport does not stop
  `scoreT = 99999999` in the console. Server-stamped identity makes a fabricated
  score **attributable** rather than **impossible**. Making it impossible would
  require a server-side notion of a run, along the lines of GAUNTLET's token and
  `started_at` model, or genuine server-side validation, neither of which exists
  for VANGUARD and both of which are substantially larger than this migration.
  Attributable is a very large improvement over anonymous and is probably the
  right place to stop, but that should be a conscious decision rather than an
  assumed outcome of moving to Supabase.
- **Existing rows.** Historical Apps Script rows carry initials and no user id.
  They would have to be imported as unattributed legacy entries or discarded.
  Given that at least one fabricated score is known to be in the current data,
  discarding and starting clean is worth considering on its own merits.
- **The orphaned actions.** `action=telemetry` and `action=feedback` share the
  same endpoint. Telemetry has a natural home alongside `vanguard_runs`, and
  feedback has one in `app_feedback` (0053). Both should be planned for in the
  same pass, or the old script has to stay deployed for them alone.

## Migration order that avoids a gap

Stand up the table and RPC, dual-write from the game to both the new endpoint
and the existing Apps Script, read the board from the new RPC once the data
looks right, then stop writing to Apps Script and rotate its deployment. The
dual-write window is what avoids a period with no working board, and it is also
the window in which the two datasets can be compared, which is itself a useful
signal about how much of the existing board is real.
