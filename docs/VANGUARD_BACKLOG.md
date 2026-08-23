# VANGUARD backlog

**Read from the code, at VANGUARD build 212** (`src/lib/legacy/vanguard/index.html`,
`src/routes/vanguard/+server.ts`, `src/lib/vanguard-save.ts`,
`src/lib/vanguard-history.ts`, `src/routes/api/vanguard-*`).

**WHAT THIS IS, AND WHAT IT REFUSES TO BE.** Every line below is something the
code says about itself: a marker written in a comment, a hook with nothing on
the other end, a feature that exists and cannot be reached. Nothing here is
ranked, scheduled, or recommended, and nothing was carried forward from an older
document — where an earlier note is quoted it is quoted because the note is still
in the file, and the entry says what the file says.

Line numbers are the state at build 212 and drift the moment anything above them
changes; the quoted text beside each is what to search for.

---

## 1. In-code deferred / follow-up markers

There is no `TODO` or `FIXME` anywhere in the VANGUARD sources. What exists
instead is a small set of comments that name something as deliberately not done.

| Where | What it says | What closing it takes |
| --- | --- | --- |
| `src/lib/legacy/vanguard/index.html:5501` | `local earned title on the player's own row only (broadcast is a deferred follow-up)` — the achievement title chip is drawn beside YOUR row on the leaderboard and nobody else's, because no other player's title ever arrives. | The board rows come from the Apps Script backend (`action=top`), so carrying a title means adding a field to what `submitToServer` sends and to what the sheet returns, then rendering it in `_achTitleChip`'s caller for rows other than `me`. Backend work outside this repo. |
| `src/lib/legacy/vanguard/index.html:5465` | `offset is threaded through for future pagination (0 today; no load-more UI yet)` — `fetchOnline` accepts and forwards an `offset`, and every caller passes none. | A LOAD MORE control on the board overlay that calls `fetchOnline(then, fail, offset)` with a rising offset and appends rather than replaces `onlineBoard`. The transport already supports it. |
| `src/lib/legacy/vanguard/index.html:6458` | Not a comment but a stated edge in the block above it: clearing a worn title calls `localStorage.removeItem('vanguard_ach_title')`, and the portal's cloud save wraps `setItem` only. | Wrapping `removeItem` in the injected bootstrap the way `setItem` is wrapped, or having the game write an empty string instead of removing the key. Until then, taking a title OFF is a local-only change: the cloud keeps the last title that was set. |
| `src/lib/vanguard-history.ts:6` | `both the read endpoint (/api/vanguard-run GET) and the portal history page call it` — the portal history page no longer exists (the route was a 308 to `/vanguard/` and was deleted on this branch). | Deleting the clause. `summarizeRuns` has exactly one caller now. |

---

## 2. Built but unreachable, disabled, or gated

**TUNE mode — stripped from the served HTML for everyone but an admin.**
`src/routes/vanguard/+server.ts` rewrites the mode whitelist and slices the
entire TUNE balancing panel out of the response when `isAdmin` is false, so for
a student the mode does not exist in the page at all rather than being hidden in
it. Entered only via `?tune=1` (`index.html:5802`); there is no title button.
Runs are NOT RANKED (`index.html:5255`).

**DEV mode — a title button anyone can press.** `index.html:552` renders
`<button class="modebtn" data-m="dev">DEV</button>` in the mode row beside NORMAL
and HARDCORE, and nothing gates it: the server strips TUNE and leaves this. A DEV
run starts with 99 lives, 99,999 coins and every heavy weapon unlocked
(`index.html:2181`), and the mode persists in `vanguard_mode`. It is unranked and
sends no telemetry (`index.html:5255`, `5399`), so it cannot reach a leaderboard —
what it reaches is the game.

**CALIB (calibration) mode — reachable, but not as a mode.** `gameMode='calib'`
is set only by the calibration walkthrough (`index.html:6034`, driven by
`window.CALIB` at `6040`), which is offered on first run and replayable from the
title's CALIBRATION button. It counts no games played, spawns no waves, and never
submits.

**Two dev-only query flags, opt-in and inert on a normal load.**
`?mockresume=1` (`index.html:5752`) populates `window.__ideaRunStates` with two
fabricated checkpoints so the RESUME cards can be looked at without a live save.
`?coopstub=1` (`index.html:6488`) replaces the Supabase Realtime client with a
same-origin `BroadcastChannel` bridge, and is also the only thing that defines
the `window.__vgStub*` introspection surface (`index.html:6524` onward: state
readouts, forced damage, teleports, boss spawns, ~20 functions). None of it
exists on a normal load.

**`flattenForDevice` (`src/lib/vanguard-save.ts:352`) — exported, no caller.**
It answers "which localStorage keys should this device class see", which is what
the injected seed does for itself in JS. Nothing in `src/` or `tests/` imports
it. It also does not skip the keys that became progression, so a caller adopting
it today would let a stale pref bucket shadow a synced achievement.

**`Snapshot` (`:23`) and `PrefBucket` (`:26`) — exported types with no external
user.** `PrefBucket` is used inside `StoredSave` in the same file; `Snapshot` is
used nowhere at all (the callers spell the same shape as
`Record<string, string>`).

**`GET /api/vanguard-run-state` — a handler with no caller.** The saved
checkpoints reach the page through the injection, which reads them server-side in
the `/vanguard` GET and ships them as `window.__ideaRunStates`; the browser never
fetches this endpoint. `POST` and `DELETE` on the same route are both called.

**The in-game feedback composer writes to a third-party endpoint, not to the
portal.** `buildFeedbackComposer` (`index.html:5890`) is mounted in three places
(title, pause, game-over) and sends `action=feedback` to the Apps Script
`API_URL` (`index.html:5451`) as an `<img>` GET. It is fire-and-forget: no
response is read, so a report that never arrives looks identical to one that
did. It is unrelated to the portal REPORT control the `/vanguard` endpoint
injects (build 212), which writes to `app_feedback`.

---

## 3. Portal hooks: both directions

The game and the SvelteKit endpoint meet only at `window.__idea*`. The game is
never modified on disk; the endpoint injects a bootstrap into `<head>`.

### Hooks the injection provides and the game calls

| Hook | Called from | Provided by |
| --- | --- | --- |
| `__ideaCoop` | `index.html` (co-op lobby) | `+server.ts` — lazy Supabase Realtime loader |
| `__ideaCoopName` | co-op display name | `+server.ts` |
| `__ideaRunStates` | title-screen RESUME cards | `+server.ts` (read from `vanguard_run_state`) |
| `__ideaGetHistory` | RUN HISTORY overlay | `+server.ts` → `GET /api/vanguard-run` |
| `__ideaRecordRun` | end of a finished run | `+server.ts` → `POST /api/vanguard-run` |
| `__ideaVanguardSaveCheckpoint` | sector boundary + page leave | `+server.ts` → `POST /api/vanguard-run-state` |
| `__ideaVanguardClearCheckpoint` | run end, per mode | `+server.ts` → `DELETE /api/vanguard-run-state` |

All seven are defined only when signed in except `__ideaCoop`, `__ideaCoopName`
and `__ideaRunStates`, which are always defined (empty when signed out). Every
call site tests for the function first, so signed-out play degrades rather than
throwing — the history overlay says "Sign in to track your run history"
(`index.html:6303`).

### Hooks the game provides and the injection calls

| Hook | Defined at | Called by |
| --- | --- | --- |
| `__ideaCaptureRun` | `index.html:5320` | the injection's checkpoint saver |
| `__ideaRenderResumeCards` | `index.html:5749` | the injection, after clearing a checkpoint |

### Counterparts with no caller

- **`window.__ideaIsTeacher` (`+server.ts:114`)** — set on every load, read by
  nothing. The game does not consult it: TUNE is gated by the server REMOVING the
  code, which is why the flag has no work left to do.
- **`window.__ideaSignedIn` (`+server.ts:289`)** — set when signed in, read by
  nothing in the game. Every signed-in-only feature tests for its own hook
  instead.
- **`window.__ideaGameInfo` (`+server.ts`, build 212)** — injected beside the
  game's `VERSION` constant and read only by the injection's own report box. It
  is a portal reader of game state, not a game hook, and the game never calls it.

### Hooks the game defines and calls itself

`__ideaRestoreRun` (`index.html:5330`) looks like a portal hook and is not: the
RESUME card calls it directly. The injection never touches it.

---

## 4. What builds 181 → 211 added

Read from the `CHANGELOG` array in `index.html`. Twenty-six entries in that
range carrying thirty-one lines; **183, 184, 193, 196 and 206 have no entry at
all**, so the version number is not a dense sequence.

**Fifteen of the twenty-six entries are CO-OP** (188–204 almost unbroken), which
is what the range is: two-player co-op arriving as a beta and being brought to
parity.

- **188–189** — co-op added as a beta: room lobby by 4-character code, a
  per-player refactor, host-authoritative live sync. Unranked.
- **190–192, 195, 197, 203** — five parity/smoothing passes: local ship
  responds instantly while everything else interpolates; hazards, score popups,
  milestones, boss phase effects and partner cues reach the guest; enemy
  telegraphs and FLAK clouds render; sustained weapon sounds, boss beam audio,
  visible pods, death slow-mo and the SYSTEM HALT sequence sync.
- **194, 198** — two co-op bug fixes: guest movement dead in pointer-lock /
  mouse-follow control mode, and guest fire sound going silent under a hold.
- **199** — a real co-op REFIT economy: shared wallet, individual builds, both
  players shop between sectors, enemies scale for two ships.
- **200–202** — revive-by-proximity in normal (never in hardcore), HARDCORE
  offered in the lobby, and a reconnect window for a dropped guest instead of an
  instant end.
- **204** — co-op becomes RANKED: a qualifying match (sector 2+ or 20+ kills)
  submits one team row with both pilots' initials to new CO-OP and CO-OP HC
  boards.

The other ten entries:

- **181** — settings menu regrouped into Audio, Visual and Controls.
- **182** — leaderboard detail shows kills, bosses, and the continue count.
- **185** — "Test automated version uptick and changelog generation" (the only
  entry in the range that describes tooling rather than the game).
- **186** — safeguards that clear dev-mode upgrades when switching to a ranked
  mode.
- **187** — mobile optimization, touch gesture fixes, bloom balance.
- **205** — a six-line weapon rebalance: RAILSPIKE pierce capped at 6, SPREAD
  harder and flatter downrange, NAILGUN redline always a quick vent, SWARM darts
  heavier, FLAK clouds bigger with a nearer burst band, BUZZSAW earlier and
  cheaper with more deflection.
- **207** — health, lives and coins moved to a bigger readout near the ship.
- **208** — sector 3 bosses drop telegraphed ground bombs.
- **209** — RICOCHET upgrade: shots skip off side walls and enemy hulls toward a
  fresh target.
- **210** — run-history charts gained hover/tap detail; TIME PLAYED shows hours.
- **211** — every faction gets a fair turn opening a run; MSET's TORCH spreads
  its three shots wider.

**What the range says about itself:** fifteen of the thirty-one lines are
co-op, eight are weapon or enemy balance (205's six, plus 208 and 209), four are
UI or readout, two are bug fixes (194, 198), one is a safeguard (186) and one is
tooling (185). Nothing in 181–211 touches the cloud save, the run history endpoints, or
the achievement system — those changed outside the CHANGELOG's account of itself.
