# VANGUARD backlog

**Read from the code, at VANGUARD build 213** (`src/lib/legacy/vanguard/index.html`,
`src/routes/vanguard/+server.ts`, `src/lib/vanguard-save.ts`,
`src/lib/vanguard-history.ts`, `src/routes/api/vanguard-*`).

**THIS FILE IS ORGANISED BY BUILD NUMBER, AND BUILD NUMBERS ONLY TRACK
`index.html`.** `VERSION` and the `CHANGELOG` array live inside the legacy game
file and are bumped when that file changes. The portal half of VANGUARD, which
is `src/routes/vanguard/+server.ts` and the `/api/vanguard-*` routes, carries no
build number and appears in no changelog entry. **So a fix made in `+server.ts`
can never show up in section 4, and section 4 can never close an item in section
2.** The two halves are on opposite sides of the injection boundary. Anyone
reading section 2 needs to know it cannot tell them anything about portal-side
gating from the build history alone -- that has to be read out of `+server.ts`
directly, which is what section 2 now does. The DEV-mode entry below was wrong
for exactly this reason: it described a gate that had been added on the portal
side, and no build number ever announced it.

**WHAT THIS IS, AND WHAT IT REFUSES TO BE.** Every line below is something the
code says about itself: a marker written in a comment, a hook with nothing on
the other end, a feature that exists and cannot be reached. Nothing here is
ranked, scheduled, or recommended, and nothing was carried forward from an older
document -- where an earlier note is quoted it is quoted because the note is still
in the file, and the entry says what the file says.

Line numbers are the state at build 213 and drift the moment anything above them
changes; the quoted text beside each is what to search for.

---

## 1. In-code deferred / follow-up markers

There is no `TODO` or `FIXME` anywhere in the VANGUARD sources. What exists
instead is a small set of comments that name something as deliberately not done.

**EVERY ROW NAMES THE SIDE OF THE INJECTION BOUNDARY ITS FIX LIVES ON**, because
this file is organised by build number and build numbers only track the legacy
build (see the header). Two of the rows below closed on the PORTAL side, so
`VERSION` did not move, no `CHANGELOG` entry mentions them, and section 4 cannot
show them: the only record that they are done is this table. A row that says
LEGACY BUILD is the opposite case -- closing it bumps a build number and would
appear in section 4.

| Where | Side | What it says | What closing it takes |
| --- | --- | --- | --- |
| `src/lib/legacy/vanguard/index.html:5501` | LEGACY BUILD + backend | `local earned title on the player's own row only (broadcast is a deferred follow-up)` -- the achievement title chip is drawn beside YOUR row on the leaderboard and nobody else's, because no other player's title ever arrives. | The board rows come from the Apps Script backend (`action=top`), so carrying a title means adding a field to what `submitToServer` sends and to what the sheet returns, then rendering it in `_achTitleChip`'s caller for rows other than `me`. Backend work outside this repo. |
| `src/lib/legacy/vanguard/index.html:5465` | LEGACY BUILD | `offset is threaded through for future pagination (0 today; no load-more UI yet)` -- `fetchOnline(then, fail, offset)` accepts an offset and forwards it as `&offset=<n>`, and every caller passes none. **STILL OPEN at build 213, and reported rather than built (2026-08-28).** Re-verified: four call sites (`:2186`, `:5472` in `refreshBoard`, `:5777`, `:7792`), none passing an offset; **no LOAD MORE control exists anywhere -- not present, not hidden, not disabled**, so there is nothing to enable. **This is a cap, not a defect.** `BOARD_N` is 250, the backend is asked for `n=250` sorted descending, `fetchOnline` does `onlineBoard = rows.slice(0, BOARD_N)` and `renderBoard` draws all 250 into the box. With more than 250 scores on a mode, ranks 251+ are simply off the board -- which is what every leaderboard does, at an unusually deep cut. The one case that is already handled is the one that matters most: when the player's own row is below the cut, `renderBoard` appends it after a `···` separator with a computed rank, so they are told where they stand instead of vanishing. That rank is computed from the 250 fetched rows, so a genuinely 400th-place player is shown as 251st -- the only real inaccuracy here, and it needs the offset to fix properly. | A LOAD MORE control on the board overlay calling `fetchOnline(then, fail, offset)` with a rising offset and APPENDING to `onlineBoard` rather than replacing it (`fetchOnline` currently overwrites, so appending is a change at the call site too). **Blocked on a question this repo cannot answer: whether the Apps Script backend honours `offset` at all.** `action=top` is a different deployment (see CLAUDE.md), the parameter is sent but nothing here has ever exercised it, and the client half is pointless if the backend ignores it and returns the same first page. Check the Apps Script project first; only then is this legacy-build UI work. |
| `src/lib/legacy/vanguard/index.html:6388` (the comment) / `:6459` (the call) | **PORTAL** (`+server.ts` and `vanguard-save.ts`) | ~~Clearing a worn title calls `localStorage.removeItem('vanguard_ach_title')`, and the portal's cloud save wraps `setItem` only.~~ **CLOSED 2026-08-28, entirely on the portal side, so no build number moved.** The injection now wraps `removeItem` beside `setItem`, inside the same `if (SIGNED_IN)` guard, and a removal is carried to `/api/vanguard-save` in the snapshot the POST body already sends. **The wrapper was only half the fix**: `StoredSave.progression` is `Record<string, string>`, where absence already means "this device has nothing to contribute" -- so a snapshot with the key simply missing merged to a no-op and the value came straight back. The stored shape gained a reserved value (`REMOVED` in `vanguard-save.ts`) before the wrapper had anything to send. Three keys are affected in practice: `vanguard_ach_title` (progression, the one that was actually broken), `vanguard_sfx_lvl` and `vanguard_baltune` (preferences, which a bucket replacement was already deleting once anything else triggered a push). | Done. **What is NOT done and is deliberate: `localStorage.clear` is not wrapped.** The build contains zero occurrences of `localStorage.clear`, so any caller is code we cannot attribute -- another surface on this origin, an extension, a console -- and propagating an unattributable wipe would let one call destroy a student's whole cloud save. Wrapping it needs a caller worth attributing first; `tests/vanguard-save-removal.test.ts` reddens if the build ever grows one. **Also still open: a SECOND device holding the old value pushes it back**, because a removal is an event and the snapshot carries no per-key write stamps to adjudicate against. Closing that is a wider change than a removal path. |
| `src/lib/vanguard-history.ts:5` | **PORTAL** (`vanguard-history.ts`) | ~~`both the read endpoint (/api/vanguard-run GET) and the portal history page call it` -- the portal history page no longer exists.~~ **CLOSED 2026-08-28, portal side, no build number moved.** Re-counted before editing: `summarizeRuns` has exactly one importer and one call site in the whole tree, `src/routes/api/vanguard-run/+server.ts:2` and `:45`, and there is no route under `src/routes` serving a VANGUARD history page. The in-game overlay reads the summary off that endpoint's response rather than computing one. | Done. The comment now states the single caller and says why the count matters -- a claimed second consumer is how a function gets kept general for a caller that does not exist. Adding a real second caller means correcting that line in the same commit. |

---

## 2. Built but unreachable, disabled, or gated

**TWO KINDS OF GATE LIVE IN THIS SECTION, AND THEY ARE NOT EQUIVALENT.** Read
each entry for which one it is.

- **REMOVAL** -- `+server.ts` deletes the code from the response before a
  non-admin receives it. The capability is not in the page. Nothing a client
  does to its own browser brings it back.
- **A RUNTIME CHECK** -- the code ships to everyone and declines to activate,
  typically on `gameMode==='dev'`. That is a client-side test, of a client-side
  variable, in a page the client owns. It is a guard against a mistake, not
  against a person.

VANGUARD posts to a ranked leaderboard, so the difference matters. Everything
gated for a non-admin is now gated by REMOVAL; the entries below say so
individually because that has not always been true.

**The removals are a table, not a chain of calls.** `_NON_ADMIN_STRIPS` in
`+server.ts` is the list, each entry named, and `tests/vanguard-admin-gate.test.ts`
walks that list rather than a copy of it: every anchor must match the shipped
build EXACTLY ONCE, must be absent from a student's copy, and must survive in an
admin's. This exists because a `.replace()` whose anchor has drifted is a silent
no-op -- the handler still answers 200, the page still looks right, and the gate
is simply off. A strip added to the table later is covered the moment it is
added.

**TUNE mode -- REMOVED from the served HTML for everyone but an admin.**
`+server.ts` replaces the `?tune=1` query check with a comment and slices the
entire TUNE balancing panel (`index.html:8277-8427`, 10,388 bytes) out of the
response when `isAdmin` is false, so for a student the mode does not exist in
the page at all rather than being hidden in it. Entered only via `?tune=1`
(`index.html:5802-5803`); there is no title button. Runs are NOT RANKED
(`index.html:5255`).

**DEV mode -- REMOVED for everyone but an admin, by two independent edits.**
`index.html:552` carries `<button class="modebtn" data-m="dev">DEV</button>` in
the mode row beside NORMAL and HARDCORE, and `index.html:5801` restores a saved
mode through an allowlist admitting `dev` and `tune`. For a non-admin
`+server.ts` deletes the button AND narrows the allowlist to
`normal`/`hardcore`, which also catches a stale `vanguard_mode='dev'` already
sitting in that device's `localStorage`, since it is restored through the same
allowlist on load. A DEV run would start with 99 lives, 99,999 coins and every
heavy weapon unlocked (`index.html:2181`); it is unranked and sends no telemetry
(`index.html:5255`, `:5399`).

> **This entry used to say the opposite, and the correction is the point.** It
> read "a title button anyone can press... nothing gates it: the server strips
> TUNE and leaves this." That was true once and had stopped being true, and
> nothing in this file could have shown it: the gate is portal-side, so no build
> number announced it (see the note at the top). A backlog that lists shipped
> work is read as a to-do list.

**The DEV console -- a SEPARATE block from the TUNE panel, and until recently
gated only by a runtime check.** `index.html:8000-8275` (`/* === dev mode === */`)
is its own IIFE holding god mode and its damage bypass (`:2273`), spawn
suppression, arbitrary wave and boss spawns, a hitbox overlay and a text command
console. It is not the TUNE panel and was not covered by the TUNE slice, so it
shipped to every visitor, held shut only by the `gameMode==='dev'` tests in its
own render loop (`:8262`, `:8268`) -- a runtime check in the sense above. It is
now REMOVED for non-admins on the same terms as TUNE (21,646 bytes).

Removing it strands nothing, and that is checkable rather than hoped for: every
reference to what the block defines lives outside it behind a guard or is a
write. `__devSetGod` and `__devDrawHitboxes` are only ever called inside
`if (window.__devX)` (`:2183`, `:7990`), `__devInput` only inside
`window.__devInput && ...` (`:5602`), `__devTime` is read as
`(window.__devTime==null?1:...)` (`:7984`), and `__devTime`, `__devStep` and
`__devNoSpawn` are all assigned at run start by code outside the block
(`:2182`). The suite asserts both halves: the definitions are gone from a
student's copy and those guarded call sites are still there.

**CALIB (calibration) mode -- reachable, but not as a mode.** `gameMode='calib'`
is set only by the calibration walkthrough (`index.html:6034`, driven by
`window.CALIB` at `:6038`), which is offered on first run (`:748`) and replayable
from the title's CALIBRATION button (`:578`). It counts no games played, spawns
no waves, and never submits.

**THREE dev-only query flags, opt-in and inert on a normal load.** This section
said "two" for a long time, and the missing one was the one a session actually
needed.

- **`?mockresume=1`** (`index.html:5752`) populates `window.__ideaRunStates` with
  two fabricated checkpoints so the RESUME cards can be looked at without a live
  save.
- **`?coopstub=1`** (`index.html:6488`) replaces the Supabase Realtime client
  with a same-origin `BroadcastChannel` bridge, and is also the only thing that
  defines the `window.__vgStub*` introspection surface (31 names, all between
  `:6496` and `:6580`: state readouts, forced damage, teleports, boss spawns,
  network delay/jitter/stall knobs). None of it exists on a normal load.
- **`?vgheadless=1`** (`index.html:6583`) swaps `requestAnimationFrame` for a
  `MessageChannel` pump so the game loop still runs in a hidden or throttled tab,
  where real rAF never fires. **This is the flag a browser-verification session
  needs**, and it is the VANGUARD twin of `?glheadless=1` on the GREENLINE
  harnesses (`CLAUDE.md`: "A harness whose loop rides rAF must be told to pump
  it... Without it the sim silently never ticks and every physics assertion
  passes vacuously"). Omitting it from the one document that inventories
  VANGUARD's dev affordances is what made it cost something: a session driving
  this game headlessly has no way to find it except by reading 8,500 lines.

**`flattenForDevice` (`src/lib/vanguard-save.ts:352`) -- exported, no caller.**
It answers "which localStorage keys should this device class see", which is what
the injected seed does for itself in JS. Nothing in `src/` or `tests/` imports
it. It also does not skip `MIGRATED_PREF_KEYS`, so a caller adopting it against a
stored row that has not been through `mergeIntoStored` would let a stale pref
bucket shadow a synced achievement. (`mergeIntoStored` does `delete bucket[k]`
for those three keys, so buckets are cleaned on write; the hazard is the rows
that have not been rewritten yet.)

**`Snapshot` (`:23`) and `PrefBucket` (`:26`) -- exported types with no external
user.** `PrefBucket` is used inside `StoredSave` in the same file (`:31`);
`Snapshot` is used nowhere at all (the callers spell the same shape as
`Record<string, string>`, and the greps that look like hits are `splitSnapshot`,
a different identifier).

**`GET /api/vanguard-run-state` -- DELETED, 2026-08-28.** It was a handler with
no caller. The saved checkpoints reach the page through the injection, which
reads them server-side in the `/vanguard` GET and ships them as
`window.__ideaRunStates`; the browser never fetched this endpoint. Re-checked a
third time before deleting -- across `src/`, `tests/`, `static/`, `tools/` and
`src/lib/legacy/` -- and the only call sites in the repo were the two `POST`s
(`+server.ts:333` `sendBeacon`, `:336` `fetch`) and the one `DELETE`
(`+server.ts:351`); nothing named the route with a `GET`. `POST` and `DELETE` on
the same route are unaffected and still do the checkpoint saving and clearing.
No type, helper or test was orphaned by the removal.

**The in-game feedback composer wrote to a third-party endpoint, not to the
portal. FIXED IN THE INJECTION, NOT IN THE GAME.** `buildFeedbackComposer`
(`index.html:5890`) is mounted in three places (`:5915` -- title, pause,
game-over) and used to send `action=feedback` to the Apps Script `API_URL`
(`:5451`) as an `<img>` GET. That was fire-and-forget: no response is read, so a
report that never arrived looked identical to one that did -- and the three lines
after it cleared the box and painted `THANKS!` UNCONDITIONALLY, outside the
`if(API_URL)` guard, so a student was thanked even when there was no endpoint at
all.

**The composer still exists and its bytes on disk are unchanged.** The fix lives
on the SERVER side of the injection boundary, which this file cannot otherwise
show: `_UNIVERSAL_REWRITES` in `src/routes/vanguard/+server.ts` replaces that
whole optimistic block, in the served bytes, for EVERY visitor (admins included
-- it is not a gate, so it is not in `_NON_ADMIN_STRIPS`), with a call into
`window.__ideaVanguardReport`, a hook the same bootstrap defines. The hook posts
to `FB.endpoint` -- the endpoint the injected REPORT panel already resolved
server-side, signed-in or anonymous by session, decided once -- so both controls
now land in `app_feedback`, carry the same `fbMeta()` capture (plus
`meta.surface`, which says which control it was, and `meta.initials`), and can
report a refusal in the shared vocabulary. A failed send keeps the writing and
re-arms SEND.

`API_URL` IS NOT REMOVED and must not be: it still carries the run telemetry
(`:5399`, `:5414`) and the whole leaderboard (`action=top`, `action=submit`).
This was a redirect of one call.

Two controls offering the same thing on one page is still open as a UX question;
`tests/vanguard-universal-rewrites.test.ts` covers the routing half.

---

## 3. Portal hooks: both directions

The game and the SvelteKit endpoint meet only at `window.__idea*`. The game is
never modified on disk; the endpoint injects a bootstrap into `<head>`.

### Hooks the injection provides and the game calls

| Hook | Called from | Provided by |
| --- | --- | --- |
| `__ideaCoop` | `index.html` (co-op lobby) | `+server.ts` -- lazy Supabase Realtime loader |
| `__ideaCoopName` | co-op display name | `+server.ts` |
| `__ideaRunStates` | title-screen RESUME cards | `+server.ts` (read from `vanguard_run_state`) |
| `__ideaGetHistory` | RUN HISTORY overlay | `+server.ts` -> `GET /api/vanguard-run` |
| `__ideaRecordRun` | end of a finished run | `+server.ts` -> `POST /api/vanguard-run` |
| `__ideaVanguardSaveCheckpoint` | sector boundary + page leave | `+server.ts` -> `POST /api/vanguard-run-state` |
| `__ideaVanguardClearCheckpoint` | run end, per mode | `+server.ts` -> `DELETE /api/vanguard-run-state` |

All seven are defined only when signed in except `__ideaCoop`, `__ideaCoopName`
and `__ideaRunStates`, which are always defined (empty when signed out). Every
call site tests for the function first, so signed-out play degrades rather than
throwing -- the history overlay says "Sign in to track your run history"
(`index.html:6303`).

### Hooks the game provides and the injection calls

| Hook | Defined at | Called by |
| --- | --- | --- |
| `__ideaCaptureRun` | `index.html:5320` | the injection's checkpoint saver |
| `__ideaRenderResumeCards` | `index.html:5749` | the injection, after clearing a checkpoint |

### A portal reader of game state, which is not a hook

**`window.__ideaGameInfo`** is injected beside the game's `VERSION` constant at
serve time and read by the injection's own report box (`+server.ts`, `fbGame()`).
It exists because the game body is one IIFE, so `VERSION`, `gameMode`, `sector`
and `state` are closure-scoped and unreachable from the bootstrap without it. It
reads and does nothing else -- no setter, no game function exposed. **The game
never calls it**, which is why it is filed here and not in either table above.
Leave it alone.

### Two flags that were set on every load and read by nothing (deleted)

`window.__ideaIsTeacher` and `window.__ideaSignedIn` were assigned by the
injection on every load and never read, by the game or by the injection. Both are
now deleted, along with the `IS_TEACHER` local and the `isAdminUser` parameter to
`injectionScript` that existed only to feed the first.

- `__ideaIsTeacher` published the viewer's admin status into a global on a page
  that runs a student's game. It had no work left to do: DEV and TUNE are gated
  by the server REMOVING the code, not by the game consulting a flag.
- `__ideaSignedIn` had a plausible consumer -- the REPORT box has to choose
  between the signed-in and anonymous endpoints -- but that choice is resolved
  server-side and baked into the injected `FB` object, so nothing ever read the
  flag. Every other signed-in-only feature tests for its own hook instead.

`tests/vanguard-admin-gate.test.ts` asserts neither name appears in the served
output for either role, and that `__ideaGameInfo` and its reader both still do.

### Hooks the game defines and calls itself

`__ideaRestoreRun` (`index.html:5330`) looks like a portal hook and is not: the
RESUME card calls it directly. The injection never touches it.

---

## 4. What builds 181 -> 211 added

Read from the `CHANGELOG` array in `index.html`. Twenty-six entries in that
range carrying thirty-one lines; **183, 184, 193, 196 and 206 have no entry at
all**, so the version number is not a dense sequence. (Counts re-derived by
parsing the array at build 213.)

**Fifteen of the twenty-six entries are CO-OP** (188-204 almost unbroken), which
is what the range is: two-player co-op arriving as a beta and being brought to
parity.

- **188-189** -- co-op added as a beta: room lobby by 4-character code, a
  per-player refactor, host-authoritative live sync. Unranked.
- **190-192, 195, 197, 203** -- five parity/smoothing passes: local ship
  responds instantly while everything else interpolates; hazards, score popups,
  milestones, boss phase effects and partner cues reach the guest; enemy
  telegraphs and FLAK clouds render; sustained weapon sounds, boss beam audio,
  visible pods, death slow-mo and the SYSTEM HALT sequence sync.
- **194, 198** -- two co-op bug fixes: guest movement dead in pointer-lock /
  mouse-follow control mode, and guest fire sound going silent under a hold.
- **199** -- a real co-op REFIT economy: shared wallet, individual builds, both
  players shop between sectors, enemies scale for two ships.
- **200-202** -- revive-by-proximity in normal (never in hardcore), HARDCORE
  offered in the lobby, and a reconnect window for a dropped guest instead of an
  instant end.
- **204** -- co-op becomes RANKED: a qualifying match (sector 2+ or 20+ kills)
  submits one team row with both pilots' initials to new CO-OP and CO-OP HC
  boards.

The other ten entries:

- **181** -- settings menu regrouped into Audio, Visual and Controls.
- **182** -- leaderboard detail shows kills, bosses, and the continue count.
- **185** -- "Test automated version uptick and changelog generation" (the only
  entry in the range that describes tooling rather than the game).
- **186** -- safeguards that clear dev-mode upgrades when switching to a ranked
  mode (`index.html:5817-5819`, a `resetBuild()` on the mode-select handler).
- **187** -- mobile optimization, touch gesture fixes, bloom balance.
- **205** -- a six-line weapon rebalance: RAILSPIKE pierce capped at 6, SPREAD
  harder and flatter downrange, NAILGUN redline always a quick vent, SWARM darts
  heavier, FLAK clouds bigger with a nearer burst band, BUZZSAW earlier and
  cheaper with more deflection.
- **207** -- health, lives and coins moved to a bigger readout near the ship.
- **208** -- sector 3 bosses drop telegraphed ground bombs.
- **209** -- RICOCHET upgrade: shots skip off side walls and enemy hulls toward a
  fresh target.
- **210** -- run-history charts gained hover/tap detail; TIME PLAYED shows hours.
- **211** -- every faction gets a fair turn opening a run; MSET's TORCH spreads
  its three shots wider.

**What the range says about itself.** The thirty-one lines partition as: fifteen
co-op, nine weapon or enemy balance (205's six, plus 208, 209 and 211), five UI,
readout or mobile (181, 182, 187, 207, 210), one safeguard (186) and one tooling
(185). Two of the fifteen co-op lines (194, 198) are bug fixes, which is a fact
about those two lines rather than a sixth bucket.

> **The previous tally here did not add up, and the way it failed is worth
> keeping.** It read "fifteen... co-op, eight... balance, four... UI or readout,
> two are bug fixes (194, 198), one is a safeguard and one is tooling" -- six
> numbers summing to exactly 31, which is why nobody checked it. They summed
> correctly by coincidence: 194 and 198 were counted TWICE, once inside the
> fifteen co-op lines and again as the two bug fixes, while 187 and 211 fell into
> no category at all. The union of the six categories was 29 lines, not 31. A
> total that matches is not a partition that works.

**Nothing in 181-211 touches the cloud save, the run history endpoints, or the
achievement system** -- those changed outside the CHANGELOG's account of itself,
which is the boundary described at the top of this file. 210 touches the run
history OVERLAY, which is rendering, not the endpoints.

### The version number has outrun its changelog

`index.html:819` reads `const VERSION='213'`, and the newest `CHANGELOG` entry is
**212**. There is no entry for 213. **This is the failure mode that makes this
whole section quietly incomplete**: section 4 is assembled by reading the
`CHANGELOG` array, so any build that bumps `VERSION` without adding a line is
invisible here, and nothing reports it. The gap has to be checked by comparing
the constant against the array, which is what produced this note.

**The tooling build 185 refers to exists, and is not wired.**
`tools/post-commit-vanguard.js` is written as a git `post-commit` hook that
bumps `VERSION` and appends a `CHANGELOG` entry on any commit touching
`src/lib/legacy/vanguard/` or `src/routes/vanguard/`. Nothing invokes it:
there is no `.git/hooks/post-commit` and `core.hooksPath` is unset (both
re-checked at build 213). Its own header explains why it cannot simply be
wired -- every session here runs in a fresh ephemeral clone with no persistent
`.git/hooks/` to install into -- and records that the uptick is happening by
hand instead, which is exactly how 213 came to have no entry. Do not delete it
and do not wire it as a local hook; if the uptick should be automatic, it needs
a mechanism that survives a fresh clone.
