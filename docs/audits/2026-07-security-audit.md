# Security and authentication audit, July 2026

Read-only audit of `idea-app` as committed at `556d22f`. As originally written,
no application logic, RLS policy, migration, or Apps Script reference was
modified, and this document was the only file added.

**Follow-up passes have since been recorded here, and some of them do change
code.** Each is marked with the migration it added. See F10.

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
   unsalted hash shipped in the page. *(F11 closes the repo-side half: no
   browser reaches the endpoint now, and an application's applicant is resolved
   from the session. Whether the Apps Script itself enforces the key is still
   open.)*
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

## F2. IDEA Coin entry tool: 4-digit PIN, verified in the browser. Critical. *(partly addressed — see F11: the boundary is now a server-side teacher check; the PIN is retained as a UI-only step and its hash is still public.)*

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

## F3. The coin ledger's endpoint is disclosed publicly, and the public page already writes to it. Critical. *(repo-side half addressed — see F11: no browser calls the endpoint now, and role applications resolve the applicant from the session. The out-of-repo review below is still required.)*

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

## F10. The three "Unrestricted" GAUNTLET views. Low. *(follow-up pass; added `0060_gauntlet_view_scoping.sql`)*

**Where:** `gauntlet_leaderboard` (last defined in
`0007_gauntlet_modeling_modes.sql:227`), `gauntlet_room_board` and
`gauntlet_room_roster` (both `0010_gauntlet_rooms.sql:115` and `:143`).

**What "Unrestricted" actually means here, and what it does not.** The Supabase
table editor flags a relation as Unrestricted when it carries no RLS policies.
Every view carries none, because a view cannot have RLS. The label is therefore
expected for all three and is not by itself evidence of exposure. The two
questions that decide the real risk are asked separately below: who holds the
`select` grant, and what the view's owner privileges let it read past.

**Is any of them readable anonymously? No.** Each is granted only to
`authenticated` (`0007:258`, `0010:138`, `0010:153`), and each base table is
explicitly revoked from `anon` first (`0004:112-125`, `0010:85-94`,
`0001:92`). No `anon` grant is issued anywhere in the migration history. On the
frontend, every consuming route is under `/gauntlet`, which is in
`authedPrefixes` (`src/hooks.server.ts:93`), so an anonymous request is
redirected to `/` before any load runs. There is no projector view, no live
spectator display, and no other unauthenticated surface reading any of the
three; the only consumers are the mode pages, `next-challenge.ts`, and the
member-gated room page. Nothing here depends on unauthenticated read access, so
none was left in place. `0060` re-asserts `revoke all ... from anon` on all
three, because `create or replace view` preserves existing grants and would
silently keep a grant made by hand in the dashboard.

**Do they run with owner privileges? Yes, all three, and deliberately.** None
declares `security_invoker`, so each runs as its owner and bypasses RLS on
`submissions`, `profiles`, `challenges` and `gauntlet_room_participants`. This
is stated as intentional in the migrations themselves (`0004:182-188`,
`0010:140-142`).

**Setting `security_invoker = true` on these three would not be access-neutral,
and was therefore not done.** It is the correct default for a view and is used
correctly elsewhere in this schema — `gauntlet_speedrun_attempt_history`
(`0033:192`) sets it, because that view is deliberately own-rows-only. But here
the bypass is load-bearing. `profiles` SELECT is own-row-only for students
("select own profile", `0001:152`), and `submissions` SELECT is own-row plus
teacher plus room-member. Under invoker rights a student would see only their
own row on every board, so the global leaderboard, the room board and the room
roster would each collapse to self-only for exactly the users they exist to
serve. That is a functional break, not a hardening, and it would buy nothing
because there is no `anon` grant to contain. The appropriate control for an
owner-privileged view is an explicit row predicate written into the view,
compensating for the RLS it bypasses — which is what `0060` does where it was
missing.

### `gauntlet_leaderboard` — left as it is, no change

Selects `challenge_id`, `mode`, `user_id`, `player` (a `full_name` fallen back
to `'Player'`), `is_correct`, `score_metric`, `created_at`, `rank`, from
`submissions` joined to `profiles` and `challenges`. Every column is board-safe,
and the omission is the important part: it deliberately selects no `value`
column, so raw captured volumes, surface areas, masses and typed answers never
appear. No email, no target value, no other student's private submission detail.
`score_metric` is a score (elapsed seconds, feature count, or mean deviation
percent), not a target.

Global visibility across all players is the feature, not a leak — it is a
leaderboard, and it is read by every mode page. The RLS it bypasses is already
compensated for by an explicit predicate: `where c.published`, so a draft
challenge can never surface a board. Correct as built; `0060` changes only the
`anon` revoke.

### `gauntlet_room_board` and `gauntlet_room_roster` — narrowed

Columns are equally safe. The board selects `room_id`, `challenge_id`,
`user_id`, `player`, `is_correct`, `score_metric`, `source`, `created_at`,
`rank`; the roster selects `room_id`, `user_id`, `role`, `joined_at`, `player`.
No `value`, no answer, no email. The problem is row scope, not columns.

Neither view carried the compensating predicate that `gauntlet_leaderboard` has.
They bypass the `members read rooms`, `members read roster` and `members read
room submissions` policies (`0010:87-106`) with nothing put back, so **any
authenticated user could read the roster and the board of a room they are not a
member of** by querying the view directly through PostgREST with a `room_id`.
The room page is genuinely member-gated — a non-member's `gauntlet_rooms` read
returns null and the load redirects to `/gauntlet/rooms`
(`src/routes/gauntlet/rooms/[id]/+page.server.ts:31-34`) — but that guards the
route, not the view. It is the same shape as F2: the gate protects the user
interface, not the API.

Impact is low. What leaks is a classmate's display name, their room role, their
join time, and their passing time in a room the reader is not in, and it
requires knowing a room's UUID (the views key on the UUID, not the 4-character
join code). Rooms are also joinable by anyone holding that short code. It is
recorded as a scoping defect rather than a disclosure incident, but the views'
own comments already assume the restriction they did not enforce: "so every
MEMBER sees names."

**What changed.** `0060` recreates both with the membership predicate applied
through `gauntlet_is_room_member` (`0010:61`) — the same SECURITY DEFINER helper
the base-table policies use, so the view and the table now agree on who may read
a room. Columns, ordering and ranks are unchanged: the board's predicate sits in
the inner query so non-member rows never reach the window function, and because
the partition is already `(room_id, challenge_id)`, filtering whole rooms cannot
renumber a surviving room's board. Owner privileges are retained solely for the
`profiles` name join, which is what they were for.

No legitimate path regresses. The room page only ever reads a `room_id` that
already passed the member check. `gauntlet_room_manual_submit` reads the board
for a rank and is SECURITY DEFINER, but `auth.uid()` resolves from the request's
JWT claim rather than the executing role, so it still identifies the submitting
racer, who holds a room token and is a member by construction. The host is
enrolled as a participant (`0028:74`) and is matched by `host_id` in the helper
regardless. No service-role client reads either view.

**Verification status.** Review-verified only. Per the repo convention,
migrations are applied by hand in the Supabase SQL editor, and the local `.env`
holds placeholder credentials, so `0060` has not been executed anywhere. Apply
it after `0059` and confirm on a live project that a member still sees the full
roster and board, and that a signed-in non-member querying either view with a
valid `room_id` now gets zero rows.

## F11. Coin ledger calls moved server-side, and role applications given an identity. *(follow-up pass; closes the repo-side half of F2 and F3. No migration.)*

**Where:** new `src/lib/server/coin-ledger.ts`, new routes under
`src/routes/api/coin-ledger/` (`public`, `teacher`, `apply`, `signin`), and one
constant changed in each of `src/lib/legacy/coin-entry.html` and
`static/coins/index.html`.

**The gap.** Two things, from F2 and F3. First, the ledger's `/exec` URL was a
plain string literal in both pages, and one of those pages is
`static/coins/index.html`, served with no authentication at all — so every
visitor held the endpoint the teacher tool uses, and the teacher-role gate on
`/coin-entry` protected the page rather than the API. Second, that same public
page performed a write: `submitRoleApplication` sent a `student` name picked out
of a rendered dropdown, so an anonymous visitor could file an application in any
named student's name and, by the tool's own description, hold one of that
student's coins. Neither call carried an identity, and no client-side change
could have given it one.

**What changed, and where the boundary now sits.** All ledger traffic originates
on the SvelteKit server. `src/lib/server/coin-ledger.ts` is the only module that
knows the endpoint, and `$lib/server` is a path SvelteKit refuses to bundle into
client code, so neither the URL nor `COIN_API_KEY` can reach a browser by
accident the way they did before. `callLedger` attaches the key; `forwardableParams`
drops any client-supplied `action` or `key` before forwarding, so a caller cannot
smuggle in a second action or override the key. Browsers now talk only to
same-origin routes, and each one answers a different question about who is asking:

- **`/api/coin-ledger/teacher`** — the entry tool's single path for every call it
  makes, reads and writes alike. Reads are not exempt: Code.gs requires the key
  for all of them, and the roster, the transaction log and the application
  answers are student records rather than public data, so they belong behind the
  same check regardless. The check is the one this codebase already uses
  correctly elsewhere — the signed-in user's `profiles.role`, read server-side,
  the same lookup `/coin-entry` and `/dashboard` perform, because the role is not
  in the JWT. The page needed one line changed: `const API = '/api/coin-ledger/teacher'`.
  It still appends `?action=...`, so nothing else in that file moved.
- **`/api/coin-ledger/public`** — no session, because the coin leaderboard is
  public tier by design and needs the contracts board, the reason guide, the open
  roles and the application questions to render. What keeps this from being an
  anonymous proxy onto the whole ledger is an explicit allowlist of five read
  actions; anything else is refused here before any upstream call, independently
  of what Code.gs would have done with it.
- **`/api/coin-ledger/apply`** — the fix for the impersonation gap, and it is at
  the identity layer rather than the network layer. **There is no `student`
  parameter any more**, so a forged one has nowhere to land. The applying student
  is resolved from the caller's own session by `resolveApplicant`, which is the
  single resolution path shared by the GET probe and the POST submit so the two
  cannot disagree: it requires a session, requires `profiles.role = 'student'`,
  reads `profiles.full_name` (the Google-provided name captured at signup by
  `handle_new_user` in `0001` — deliberately **not** the user-editable
  `display_name`), and matches it against the ledger's own roster, fetched
  server-side. Matching compares name TOKEN SETS, so the roster's "Last, First"
  and Google's "First Last" agree without either side being reformatted, and it
  is insensitive to the comma, to double spaces, to accents and to a middle name
  present on one side only. **Zero matches or more than one is a refusal, never a
  fallback** — being unable to prove who is applying is precisely the condition
  worth failing on, and the student gets a message telling them to see their
  teacher. The name forwarded to Code.gs is the roster row the server matched.
- **`/api/coin-ledger/signin`** — the public leaderboard is a carried-over static
  page with no Supabase client, so once applying required a session it had no way
  in. This mints the OAuth redirect through the *server* Supabase client
  (`skipBrowserRedirect`), which is what stores the PKCE code verifier that
  `/auth/callback`'s `exchangeCodeForSession` needs; hand-rolling a redirect to
  Supabase's `/authorize` would skip the verifier and the callback would fail.

The public page's role modal has **no name picker at all** now. It asks the
server who is applying and renders "Applying as *name*" read-only, or a sign-in
prompt, or the reason it cannot proceed. There is no selector left to influence
the server, and the submit sends only a role and answers.

**The PIN was kept, as a redundant step only.** The tool's 4-digit PIN pad is
still there and still runs entirely in the browser. It is now unambiguously not a
security boundary — the session and role check on `/api/coin-ledger/teacher` is —
and it is retained for the job F2 identified as its only honest one: a
device-level confirmation on a shared classroom or kiosk machine where a teacher
has walked away from an already-authenticated session. **Its committed hash was
recovered in 2 ms and must be treated as public**; the specific value should be
changed, and if a real device factor is ever wanted it has to be verified
server-side and be longer than four digits (P0 item 4 stands, unaddressed here).

**Residual limitations, recorded rather than accepted silently.**

1. **This is a gate in front of the ledger, not a fix to the ledger.** If the
   deployed Code.gs still accepts calls without the key, everything above is
   bypassable by anyone who recovers the `/exec` URL from git history. The
   repo-side work is only half; item 2 of the out-of-repo review is still the
   load-bearing one.
2. **The key's parameter name is an assumption.** It is sent as `key`, because an
   Apps Script `doGet(e)` can read only `e.parameter` and never a request header,
   so a header-based key was never an option. If Code.gs reads it under another
   name, `COIN_API_KEY_PARAM` in `src/lib/server/coin-ledger.ts` is the one line
   to change. Confirm this against the deployed script.
3. **`profiles.full_name` is writable by its own owner.** The "update own
   profile" policy (`0001`) covers every column except `role`, which the guard
   trigger protects. So a determined student could set their own `full_name` to a
   classmate's before applying and defeat the roster match. This is a real
   narrowing rather than a closure: it now requires an account, a deliberate
   PostgREST call, and leaves the change sitting in the attacker's own profile
   row. The durable fixes are either a guard trigger on `full_name` in the shape
   of `enforce_role_change`, or an email column on the ledger Roster so identity
   resolves on the one field a user cannot change. Worth doing; out of scope here.
4. **The `/exec` URL remains in the repository**, now at
   `src/lib/server/coin-ledger.ts` and never served to a browser. With the key
   required it is no longer a credential, and `COIN_LEDGER_URL` overrides it
   without a commit, so a rotation (P0 item 1) needs an env var and not a code
   change.
5. **The transport to Apps Script is unchanged**: writes are still GETs with
   values in the query string. What changed is who can issue one. The replay
   concern in the out-of-repo review's item 3 no longer applies to browser
   history, proxy logs or a projected classroom display, because those URLs never
   exist in a browser now — but Google's own request logs still see them.
6. **Duplicate roster names cannot apply.** Two identical names on the roster
   resolve as ambiguous and are refused for both students until a teacher
   disambiguates them. Refusing is the correct behaviour, but it is a real
   failure mode a class can hit.
7. **No rate limiting.** An anonymous visitor can still drive server-side ledger
   reads through the public allowlist. That is the same P2 item 10 gap the whole
   codebase has; this change neither improves nor worsens it.

**Verification status.** Verified against a running dev server with placeholder
Supabase credentials, which exercises every path except a live signed-in session.
`svelte-check` is clean (0 errors, no new warnings). The public leaderboard
renders and issues its four ledger reads to `/api/coin-ledger/public`, with **zero
browser requests to `script.google.com`** and no console errors. Boundary probes:
an allowlisted read reaches the upstream call and stops at `503 not configured`
(so the key gate is wired), while `logTransaction` and `submitRoleApplication`
through the public route are refused `400` before any upstream call; the teacher
route answers `401` with no session; `GET /api/coin-ledger/apply` answers
`{"signedIn":false}` and leaks nothing; and a `POST` carrying a forged
`student: "Victim, Some"` field is rejected `401` without reaching the ledger.
The role modal was opened in the browser and contains no name input and no name
option list, only the sign-in prompt. `matchRoster` was driven directly against a
fixture roster: eleven cases pass, covering both name orders, accents, punctuation
and spacing noise, an extra middle name, a multi-token first name, a near-miss
classmate ("Maria Garcia" vs "Mario Garcia"), and the three refusals (not on the
roster, duplicate rows, single token). Not verifiable here: the live signed-in
teacher and student flows, and anything about Code.gs, which needs `COIN_API_KEY`
set and a real Google session.

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
   *(Since F11 both also depend on the `/api/coin-ledger/*` routes, which apply
   the same teacher check to the entry tool's traffic and require a signed-in
   student for a role application. The pages' own gating is unchanged.)*

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

**2. IDEA Coin ledger script** (`AKfycby_p-lI...`, now referenced only from
`src/lib/server/coin-ledger.ts`, which is never served to a browser — see F11;
it was at `src/lib/legacy/coin-entry.html:1649` and, publicly, at
`static/coins/index.html:1693`). This is the higher-value review of the two,
because it is the only system backed by something students actually want, and
**F11 does not reduce its priority**: the repo-side change is a gate in front of
the script, so if the script still answers keyless callers, anyone who recovers
the URL from git history bypasses the gate entirely. Determine: the deployment's
execute-as and access settings; whether the shared key is in fact required on
**every** action, and that it is read under the parameter name F11 sends it as
(`key`); and whether any balance-affecting action checks a caller identity
beyond that key. Test at minimum `logTransaction`, `payout`, `updateStudentWage`,
`collectFine`, `addStudent`, `deleteTransaction`, and `completeContract` from an
unauthenticated client with **no key**, from outside the school network — every
one of them should now be refused. Test `submitRoleApplication` the same way, and
separately confirm that with a valid key it still trusts its `student` parameter,
because after F11 that parameter is only ever set by this application's server.

**3. The PIN, specifically.** There is no server-side PIN check anywhere in the
repo-side code. Confirm the Apps Script does not check one either. If it does
not, then the PIN protects nothing beyond someone watching over the teacher's
shoulder, which is the only job F11 retains it for. Brute-forcing it was always
unnecessary anyway: because every action is a GET with parameters in the query
string, a single captured or replayed request URL was sufficient, and such URLs
persisted in browser history, in any proxy or device management logs, and in any
screen recording or projected classroom display. Replay was the realistic attack,
not cracking. **F11 removes the browser-side half of that exposure** — those URLs
are now built server-to-server and never exist in a browser — but Google's own
request logs still see them, and the recovered PIN value should be changed
regardless. If the script does check a PIN, verify it is rate-limited and that it
is not the same 4-digit value.

---

# Prioritised hardening list

## P0, before anything else

1. **Rotate both Apps Script deployments** to new `/exec` identifiers. Both
   current URLs are committed to this repository, and both were served in public
   HTML. Treat both as known. *(The coin URL is no longer served to any browser
   after F11, and rotating it is now an env-var change — `COIN_LEDGER_URL` —
   rather than a code change. The VANGUARD one is unchanged.)*
2. **Put an identity on every coin ledger write.** Nothing else on this list
   matters as much, because coins are the only currency here that students
   place real value on. *(Repo-side done in F11: every call now originates on
   this application's server, carrying `COIN_API_KEY`, and role applications
   carry a server-resolved student. **This only holds if Code.gs actually
   enforces the key** — confirming that is now the single highest-value item
   here, because the gate is worthless if the script still answers keyless
   callers.)*
3. **Remove write capability from the public `/coins/index.html`.** *(Done in
   F11, the second way round: `submitRoleApplication` stayed on the page but
   moved behind `/api/coin-ledger/apply`, which requires a session and resolves
   the applicant from it. There is no `student` parameter and no name picker any
   more. The page's remaining ledger traffic is five allowlisted read actions.
   Residual: the roster match keys on `profiles.full_name`, which its owner can
   still edit — see F11 residual 3 for the two durable fixes.)*
4. **Take the PIN out of the client.** If a device-level second factor is wanted
   on shared machines, it has to be verified server-side, be rate-limited, and
   be longer than four digits. A client-side comparison against a shipped hash
   is not a factor. *(Not done. F11 demoted the PIN to a UI-only step on shared
   devices and put the real boundary on the server, but the pad and its
   recovered hash are still in the page. At minimum, change the value.)*

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
