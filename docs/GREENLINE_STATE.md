# GREENLINE: what is in the code

**Read from the repository alone**, at the tip of `lane/games-carryover`. Every
number below was counted off the files named beside it. Nothing here is imported
from a build plan or a phase document, nothing is ranked, and no work is
proposed — where something is missing or unreached, the entry says so and stops.

Paths are relative to the repo root. Line numbers drift; the quoted identifier
beside each is what to search for.

---

## 1. Tracks

**Five track files**, all in `src/lib/greenline/tracks/`, all listed in the one
catalog (`src/lib/greenline/tracks.ts`, `TRACKS`). **The default is
`terminal-nine`** (`DEFAULT_TRACK_ID`); an unknown id falls back to it.

| File | id | kind | schemaVersion | surface | Declared length |
| --- | --- | --- | --- | --- | --- |
| `terminal-nine.json` | `terminal-nine` | circuit | 2 | ribbon, 625 centerline points, closed, width 18 | 2498 m |
| `proving-ground-07.json` | `proving-ground-07` | circuit | 2 | ribbon, 199 points, closed, width 14 | 794 m |
| `relief-proof-01.json` | `relief-proof-01` | test | 2 | ribbon, 110 points, closed, width 12 | 306 m |
| `piece-proof-01.json` | `piece-proof-01` | test | 3 | pieces, 13 | 596 m |
| `overpass-proof-01.json` | `overpass-proof-01` | test | 3 | pieces, 11 | 1023 m |

`lengthM`, `tagline` and `kind` are picker copy and are never read by the
runtime, which only sees the parsed `TrackData`.

**Which schema features each file actually uses**

| Feature | terminal-nine | proving-ground-07 | relief-proof-01 | piece-proof-01 | overpass-proof-01 |
| --- | --- | --- | --- | --- | --- |
| `surface.elevations` | yes | — | yes | n/a (pieces) | n/a |
| `surface.banking` | yes | — | yes | n/a | n/a |
| `surface.widths` (per point) | yes | yes | — | n/a | n/a |
| `surface.branches` | yes | yes | — | n/a | n/a |
| `zones` | 8 (4 boost, 3 hazard, 1 pit) | 1 (pit) | 2 (1 boost, 1 hazard) | 0 (key present, empty) | absent |
| `props` | 52 | 55 | — | 0 (key present, empty) | absent |
| `checkpoints` | 10 | 8 | 3 | 4 | 4 |
| `boundaries` | yes | yes | yes | yes | yes |

Piece kinds in use: `piece-proof-01` — straight ×4, curve ×4, corkscrew ×2,
bank ×2, jump ×1, with `rise`, `targetBankDeg`, `peakBankDeg`, `kickHeight`,
`radius`, `turnDeg`, `length`. `overpass-proof-01` — straight ×6, curve ×4,
closer ×1, with `targetPitchDeg` (the only file using it) and no bank or jump.
So schema v3's `corkscrew`/`bank`/`jump` appear in exactly one file, and
`closer` + `targetPitchDeg` in exactly one other.

Prop kinds across the two circuits: container (49), lightTower (22), barrier
(9), warehouse (6), gantry (4), crane (4), railcar (3), tower (4), loader (3),
berm (2), pad (1).

**Two more track sources exist and are not files here.** `CUSTOM_TRACK_ID`
(`custom-builder`) is a single slot in the catalog that the builder overwrites on
each Test Drive, stored in `localStorage` under `greenline_custom_track`; and
`community` tracks are fetched from the `greenline_tracks` table
(`src/lib/greenline/community.ts`, `loadCommunityTracks` /
`loadCommunityTrackData`).

---

## 2. Weapons, abilities, and capacity

**Thirteen weapons** (`src/lib/greenline/combat.ts`, `WEAPONS`). Cost is
`mountCost`; the price column is the display mirror in
`src/lib/greenline/economy.ts`.

| Weapon | category | mountCost | cooldownSec | IC price |
| --- | --- | --- | --- | --- |
| Autocannon | kinetic | 1 | 0.4 | free (starter) |
| Shotgun Burst | kinetic | 1 | 1.0 | 300 |
| Railgun | kinetic | 3 | 2.0 | 1000 |
| Homing Rocket | guided | 2 | 4.5 | 600 |
| Cluster Missile | guided | 3 | 5 | 1000 |
| Caltrops | area | 1 | 5 | 300 |
| Oil Slick | area | 1 | 6 | 300 |
| Auto-Turret | turret | 2 | 1.1 | 600 |
| Energy Shield | defensive | 3 | 9 | 1000 |
| Radar Jammer | defensive | 1 | 0 (passive) | 300 |
| Deployable Blades | melee | 2 | 8 | 600 |
| EMP Burst | disruption | 2 | 1.8 | 600 |
| Grappling Hook | tether | 2 | 5 | 600 |

**Six abilities** (`src/lib/greenline/abilities.ts`, `ABILITIES`). Cost is
`slotCost`; `meterCost` is a fraction of the drift meter.

| Ability | category | slotCost | meterCost | cooldownSec | Duration | IC price |
| --- | --- | --- | --- | --- | --- | --- |
| Nitro Boost | nitro | 2 | 0.5 | 0 | 2.2 s (`engineMul` 1.8) | free (starter) |
| Overcharge Repair | repair | 2 | 0.6 | 0 | none — instant, 115 points | 600 |
| Jump / Hop | jump | 1 | 0.35 | 0 | instant impulse | 300 |
| Emergency Flip | flip | 1 | 0.3 | 0 | instant | 300 |
| Grip Surge | grip | 1 | 0.35 | 0 | 3 s (`frictionMul` 1.5) | 300 |
| Air Correction | aircontrol | 1 | 0.3 | 0 | 3 s ceiling, closed on touchdown | 300 |

Only nitro, grip and air-correction hold a timed window (`nitroUntilMs`,
`gripUntilMs`, `airUntilMs`); jump, flip and repair resolve in the frame they
are used.

**Capacity is flat per archetype and parts never touch it**
(`mountCapacityFor` / `abilityCapacityFor` in `src/lib/greenline/loadout.ts`,
reading `mountCapacityBase` / `abilityCapacityBase`). The two orderings are
deliberately inverted:

| Archetype | mount capacity | ability capacity |
| --- | --- | --- |
| SYSTEMS | 5 | 2 |
| ARMOR | 4 | 4 |
| HANDLING | 4 | 4 |
| VELOCITY | 2 | 5 |

Two weapon slots and two ability slots per build
(`WEAPON_SLOT_IDS`, `ABILITY_SLOT_IDS`), no duplicates across a pair, and total
cost within the budget. Three mount sockets exist — `nose`, `roof`, `rear`
(`WEAPON_SOCKET_IDS`) — and two equipped weapons can never resolve to the same
one.

---

## 3. Vehicle parts and cosmetics

**Twenty parts across five bodywork slots**, four per slot
(`src/lib/greenline/loadout.ts`, `PARTS` / `PART_SLOTS`): plating, drivetrain,
tires, systems, aero. The first entry in each slot is the no-effect stock
baseline. Every non-stock part is a sidegrade by design, which is why all of
them price flat at 250 IC.

**Everything that rides the `parts` jsonb** (`partsForStorage` writes it,
`normalizeStoredLoadout` reads it back):

| Key | Shape | Notes |
| --- | --- | --- |
| `plating`, `drivetrain`, `tires`, `systems`, `aero` | part id | unknown id falls to stock |
| `weaponPrimary`, `weaponSecondary` | weapon id or `WEAPON_NONE` | secondary may be none |
| `abilityPrimary`, `abilitySecondary` | ability id or `ABILITY_NONE` | |
| `weaponSockets` | `{ weaponPrimary?, weaponSecondary? }` → socket id | omitted entirely when empty; missing = auto |
| `cosmetics` | see below | omitted when it normalizes to nothing |

**`cosmetics` carries five fields, every one optional** (`Cosmetics` in
`loadout.ts`, validated by `normalizeCosmetics`):

| Field | Values | Default when absent |
| --- | --- | --- |
| `color` | one of 10 `COSMETIC_COLORS` ids | the archetype's own tone |
| `pattern` | one of 4 (`stripe`, `twin`, `wedge`, `checker`; `none` normalizes away) | no pattern |
| `number` | integer 0–99 | no number |
| `decal` | a storage path in the `greenline-decals` bucket, ≤220 chars, never a data: URL | no decal |
| `horn` | one of 2 `COSMETIC_HORNS` ids (`horn`, `siren`); the default id normalizes away | `fun_horn` |

A cosmetics object where nothing survives validation normalizes to `undefined`,
so an untouched build round-trips byte-identical and no migration was needed for
any of the five.

---

## 4. Routes under `src/routes/greenline`

| Route | Files | Purpose | Guard |
| --- | --- | --- | --- |
| `/greenline` | `+page.svelte`, `+page.server.ts` | The game: title, garage, race, results, settings, leaderboard | `hooks.server.ts` `authedPrefixes` redirects anonymous to `/`; the load re-checks `claims` and redirects 303 defensively. No role check — it returns only `claims.sub`. |
| `/greenline/builder` | `+page.svelte` | The ribbon track builder (schema v2), publishing through `/api/greenline-track-publish` | No load of its own: inherits the `/greenline` prefix guard. Any signed-in user, no role gate. |
| `/greenline/piece-builder` | `+page.svelte` | The piece-chain builder (schema v3), same publish path | Same: prefix guard only, any signed-in user. |
| `/greenline/moderation` | `+page.svelte`, `+page.server.ts` | Community-track review queue: feature, remove | **Admin only.** Non-admin signed-in gets `error(404)` rather than a redirect, so the route tells a prober nothing; anonymous never reaches the load. The real boundary is `is_teacher()` (which resolves to the admin check) inside `greenline_track_set_featured` / `greenline_track_remove`. |

Four routes, six files. There is no `+layout` under `/greenline`, so the shell's
report control mounts from the root layout — and the feedback exclusion registry
takes it off `/greenline` exactly (the race is a live 3D surface with its own
menus, which carry the box); the two builders are ordinary pages and keep it.

---

## 5. Economy and progression

**One currency: Ignition Credits (IC)** (`src/lib/greenline/economy.ts`). The
module says of itself that it is the DISPLAY mirror — migration 0052's
`greenline_item_price` and the constants inside `greenline_submit_race_result`
are what actually charge and credit.

**What pays out** (`AWARD_*`, mirrored from the RPC):

- Placement: 1st 120, 2nd 90, 3rd 70.
- Any other finish: 50 (`AWARD_FINISH_BASE`).
- Personal best: +40 (`AWARD_PB_BONUS`).
- A non-finish pays 0.
- A race run in creative mode pays nothing and never ranks: the server zeroes
  the award and stores the run as mode `creative`.

**What things cost:** parts flat 250; weapons by `mountCost` (1 → 300, 2 → 600,
3 → 1000); abilities by `slotCost` (1 → 300, 2 → 600); colours 100; patterns
150. `STARTER_ITEMS` holds the five stock bodywork parts plus `autocannon` and
`nitro-boost`, so a day-one build is complete and costs nothing. Everything else
that is free is free by having no price at all (`itemPrice` returns null): the
empty weapon/ability slot, the `none` pattern, every archetype, the default
livery, the car number, and the custom decal — the last being moderation-gated
rather than priced.

**What gates:** ownership, checked by `isItemUnlocked` against the unlock ledger
(`loadUnlocks`), enforced structurally by `sanitizeLoadoutOwnership`, which
returns any locked item to stock. **The horn is not in the price list and not in
`STARTER_ITEMS`** — neither horn is purchasable or gated, the way the car number
is not.

**Creative mode is ON by default** (`DEFAULT_CREATIVE = true`,
`src/lib/greenline/creative.svelte.ts`), which bypasses every unlock check while
it is on, so out of the box nothing is gated and no race pays. The whole
economy — wallet, price list, ledger, purchase RPC, and the garage's lock UI —
is intact behind that one flag, and turning it off re-gates the build to what
the player actually owns. The flag is client-reported; the file says so.

**Other progression state:** five named build slots (`GREENLINE_MAX_SLOTS = 5`, saved
through `saveSlot` / `loadUserSlots`), the leaderboard read
(`greenline_leaderboard` RPC, board-safe columns, visible to any signed-in
user), and per-browser preferences that are not progression at all (track
selection, weather, control bindings, audio levels).

---

## 6. Environment presets

**Four presets, all night** (`src/lib/greenline/environment.ts`): `night`
(`DEFAULT_ENV_ID`), `fog`, `rain`, `storm`, listed in `ENV_PRESET_IDS` and keyed
in `ENV_PRESETS`. The file states that a dusk or daylight preset is deliberately
absent because the floodlit night is locked brand identity: the presets vary
atmosphere (fog depth, precipitation, flood throw), never the hour.

**Yes, something selects between them at runtime.** `weather.svelte.ts` holds a
reactive, `localStorage`-backed preset id (`greenline_weather`); the settings
overlay (`GreenlineSettings.svelte`) renders one button per
`ENV_PRESET_IDS` entry and calls `setWeatherPreset`; `GreenlineRace.svelte`
reads `weatherSettings.preset` and re-applies the scene on change, and exposes
the current id through the `__greenline` console API. No track selects a preset,
and no preset is chosen by time, weather data, or race state — it is a player
setting and nothing else.

Weather is presentation only: the module states it never touches grip, drag,
damage, AI targets, or lap timing, so a stormy lap still ranks.

---

## 7. Audio

**229 files on disk** in `static/greenline/audio/`: **219 `.wav` effects** and
**10 `.mp3` music tracks** (`menu-1`, `menu-2`, `race-1`, `race-3`, `race-4`,
`race-5`, `workshop-1`, `workshop-2`, `winner`, `loser`), the last two being the
results-screen pair.

**95 registry ids** in `src/lib/greenline/sfx.ts`, plus **4 aliases** pointing at
ids already in the roster rather than at second copies of a file.

**The registry and the disk agree exactly**: the 95 ids name 219 files, all 219
exist, and no `sfx_*` file on disk goes unnamed. Missing: 0. Unnamed: 0.

**93 of the 95 ids are triggered somewhere outside the registry.** Two are not,
and each carries the reason beside it in `sfx.ts`:

- **`wpn_turret_swivel`** — the Auto-Turret has no aim state to rotate.
  `updateTurret` (`combat.ts`, "no trigger, no aim") picks the nearest target
  outside the forward blind arc and hit-scans it instantly, and the turret's
  mesh in `rig-visual.ts` is fixed geometry nothing turns. There is no angle to
  threshold.
- **`abl_repair_loop`** — Overcharge Repair has no active window: it applies its
  whole heal in the frame it is used and sets no `*UntilMs`. The sustained
  repair that does exist is the pit box, which already has `env_pit_repair_loop`
  plus `abl_repair_complete` on release.

**Two of the four aliases are also unreferenced**: `wpn_cluster_lock_charging`
and `wpn_cluster_lock_confirmed`. The Cluster Missile's lock is voiced through
the rocket ids directly (`syncLoop('lock-charge', …, 'wpn_rocket_lock_charging')`
in `GreenlineRace.svelte`), which is the same buffer the aliases point at — so
the sound plays and the alias names go unused. `wpn_cluster_travel` and
`wpn_turret_impact` are both used.

**Buses and caps** (`audio-engine.ts`): five buses — `weapons`, `impacts`, `ui`,
`ambient`, `engine` — with one-shot soft caps of 8 / 8 / 4 / 4 / 8 that sum to
the global ceiling. Looping voices are exempt from cap accounting and from
stealing, and are caller-owned: `syncLoop` in `GreenlineRace.svelte` drives each
off a per-frame boolean so every start has a matching stop. The horn is a
one-shot on `weapons` held to a single live voice per car (a press during a
blast restarts it) behind a 600 ms gate.

---

## 8. In-code deferred / TODO / future markers

There is no `TODO` or `FIXME` anywhere under `src/lib/greenline` or
`src/routes/greenline`. What the sources carry instead is a handful of comments
that name something as not-yet-reached; most other uses of "future" or
"follow-up" in these files are ordinary prose about combat windows and are not
listed here.

| Where | What it says |
| --- | --- |
| `src/lib/greenline/audio-engine.ts:275` | `duckMusicBus` — "For future impact/explosion phases to call; nothing calls it in normal play yet." An implemented, tested-by-nothing API: no caller anywhere. |
| `src/lib/greenline/audio-engine.ts:672` | `update()` is idempotent "so both the internal ticker and a future game-loop caller may drive it without conflict." The second caller does not exist; the internal ticker is the only driver. |
| `src/lib/greenline/persistence.ts:20` | "No UI here. The dev harness keeps its localStorage-only garage for now; the signed-in portal route wired to these seams comes in the next stage." **Stale**: `/greenline/+page.svelte` is that route and calls `saveUserLoadout`, `submitRaceResult`, `loadWallet`, `loadUnlocks` and `purchaseItem` directly. |
| `src/lib/greenline/Garage.svelte:161` | The `decal` prop being `undefined` hides the control entirely — "feature not wired / migration unapplied" — which is how the garage renders against a backend without migration 0051. |
| `src/lib/greenline/GreenlineRace.svelte:211` | "ONE environment preset (`night` today) so a future time-of-day/weather system is a data addition, not a scene rewrite." **Stale in its second half**: the weather selector exists (section 6) and the race reads `weatherSettings.preset`, so the preset is not `night` today unless the player left it there. |
| `src/lib/greenline/GreenlineRace.svelte:748` | "the `__greenline` console equip path has no UI guard — the sanitizer keeps every stored build valid either way." A stated reliance on the sanitizer rather than a gap. |
| `src/lib/greenline/track-schema.ts:8`, `:79` | The schema names itself extensible and reserves "future surface kinds (mesh, …)"; two of the three surface kinds it defines are in use across the five track files. |
