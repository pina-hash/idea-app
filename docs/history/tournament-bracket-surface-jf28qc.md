---
title: "The tournament surface runs a live bracket on Tuesday and looked like a settings page (`claude/tournament-bracket-surface-jf28qc`)"
date: 2026-09-06
branches: [claude/tournament-bracket-surface-jf28qc]
migrations: []
subsystems: ["Tournaments", "Browser harness"]
---

Prompt 0077. No migration. Deadline Tuesday 2026-09-08: the IDEA100 Hook Design
Competition bracket, run live in class on this surface for the first time. Function
first, then an identity, then the projector; nothing that could make Tuesday worse.

## The base

Started from `origin/integration` at `13d1747212c15a47b63cae5cd8b34546ed4ac10a`,
working directory `/home/user/idea-app`. `origin/integration` was 4 commits BEHIND
`origin/main` (`eec8151`) and 0 ahead, so merging main was a fast-forward to `eec8151`
and that is the effective base. The container's git already carried a committer identity
(`Claude <noreply@anthropic.com>`); nothing had to be set. Duplicate check: no
`docs/prompt-ledger/entries/0077-*` at HEAD, and the only tournament branch on origin was
`claude/tournament-thumbs-listing-psuleu`, prompt 0076's ledger-only commit -- its bucket
work was left alone throughout.

## A1: the seven surfaces, who is on them, and on what

| route | what | who | device | session |
| --- | --- | --- | --- | --- |
| `/tournaments` | list, invites, delete | anyone; hosts/admins see delete | any | public |
| `/tournaments/[id]` | the event page: bracket, now playing, entries, rewards, register, banner editor | students, spectators | phone (students at their tables), a laptop | public, extras when signed in |
| `/tournaments/[id]/host` | the host console: phase, entries, invites, quals, rewards, match control, delete | the host (Mr. Pina) | a phone beside the table | signed in + `tournament_hosts` row, else redirected |
| `/tournaments/[id]/tv` | the projector stage | the whole room | a projector, nobody at the keyboard | public, session-blind |
| `/tournaments/[id]/match/[matchId]` | one match's timeline and corrections | anyone | phone | public |
| `/tournaments/[id]/entry/[entryId]` | one competitor's record and ledger | anyone | phone | public |
| `/tournaments/new` | the create form | any signed-in account | laptop | signed in (the RPC refuses otherwise) |

`/tournaments` is deliberately absent from `authedPrefixes`; the host console gates itself
with a redirect (the console's existence is not a secret, the public page is where a
non-host lands). Both were re-read and neither was touched.

**The ledger's diagnosis was half right.** "`site-manifest.ts` gives `tournaments` no
accent, unlike GAUNTLET, GREENLINE, the Foundry and FRC" is false as written:
`site-manifest.ts` carries NO accent for any app -- it is the version/changelog path map
and has no colour field, by the same rule that keeps a colour field off `PortalApp`.
Accents live as `[data-app]` rules in `AppLauncher.svelte`, and the tournaments card
already had one (`#0fbe7a` / `#e0ac4e`, quoting `tournaments-theme.css`). So the
manifest entry this prompt owns does not exist and was not created. What WAS true is the
diagnosis itself: only `TvStage`, `MatchDetail` and `EntryDetail` wore `.tnm-root`; the
list, the event page, the host console and the create form rendered in the portal's own
chrome (`.hero`, `.card`, the green `//` h2 prefix, the cyan glow eyebrow).

## A2: the Hook bracket, step by step, as it stood

Every step Mr. Pina takes, with what is on screen and the taps it costs, on the host
console as it was:

| step | how | taps | what was on screen |
| --- | --- | --- | --- |
| create | `/tournaments/new`: name, options, Create | typing + 1 | the form |
| add entries | Entries card: name, Add entry, x N (or students self-register from the QR) | 2 per entry | Phase card, then Entries |
| seed | Shuffle seeds, or the arrows per row | 1 (shuffle) | Entries |
| open / close registration | Phase card | 1 each | Phase card at the top |
| start (generate bracket) | Phase card: Generate bracket | 1 | Phase card |
| call a match | Match control: Start on a Ready row | 1 + a scroll past five cards | the BOTTOM of the page |
| enter a result | ResultForm inline on the in-progress match: pick, Submit | 2 (win/loss) or 3 + typing (scores) | same place |
| advance | automatic (the RPC pairs the next match) | 0 | -- |
| next match | Start on the next Ready row | 1 | a row further down |
| forfeit | forfeit, pick side, TYPE a reason, Award, Confirm | 5 + keyboard | inline gold panel |
| correct | correct, pick, TYPE a reason, Apply | 3 + keyboard | Completed list |
| finish | automatic on the grand final | 0 | the champion on the public page and the TV |

**Between two matches: pick (1), Submit (2), Start the next (3).** Three taps, exactly at
the prompt's limit, in win/loss mode; four plus typing in score mode. So the tap count was
not the finding. THE FINDING WAS EVERYTHING AROUND THE TAPS: the match control sat under
five setup cards (Phase, the whole roster one row per entry, two invite forms, qualifying,
reward rules), so every result on a phone began with a scroll past all of them; the winner
picks measured **28.6px** tall and the forfeit / correct / ping buttons about **20px**
(`.mini`: 0.68rem type, 0.15rem padding), against a 44px floor, on a control a thumb
presses beside a table of students; the forfeit -- the path a no-show takes -- needed a
typed reason on a phone keyboard; and nothing on the console said which match is NEXT, so
the host read the Ready list and picked. The worst single path was the no-show: five taps
and a keyboard.

## A3: every accent in use, and the one for tournaments

Read out of `AppLauncher.svelte` (nothing in `site-manifest.ts`, see A1):

| card | primary | secondary |
| --- | --- | --- |
| gauntlet | `#00ff41` | `#00f0ff` |
| vanguard | `#00ff41` | `#c8ff00` |
| greenline | `#2ae57e` | `#cfdae2` |
| coins | `#c8ff00` | `#00f0ff` |
| notebook | `--gold #c8a848` | `--green #78b870` |
| **tournaments** | **`#0fbe7a`** | **`#e0ac4e`** |
| foundry | `#f6952f` | `#c65a1d` |
| frc | `#ed1c24` | `#0066b3` |
| maps | `#40e3b1` | `--gold #c8a848` |
| dashboard / admin | `#78b870` | `#5abda8` |

The accent proposed and kept is the pair the card already quotes: **emerald `#0fbe7a`
with gold `#e0ac4e`**, which are the room's own `--tnm-accent` and `--tnm-gold`. It is the
room's, so the card and the surface cannot disagree, and it was measured on the card by
the bundle that put it there (6.23:1 as text, 4.81:1 as the edge). Defended honestly: the
launcher carries THREE green-family accents (GREENLINE `#2ae57e` at hue 149, tournaments
`#0fbe7a` at 157, maps `#40e3b1` at 162), and at 375px on a 2px strip those hues alone are
not what tells the cards apart. What does is the SECOND colour: tournaments is the only
card pairing a green with a warm gold, GREENLINE's second is chrome grey and maps' is the
portal brass on mint. The mark and the label carry the rest, which is the launcher's own
argument. Changing the launcher accent is outside this prompt's ownership and was not
proposed.

Contrast of the accent and every ink the room paints, on every ground it can sit on
(`--tnm-bg #0e1412` / `--tnm-panel #16211c` / `--tnm-panel-2 #1c2a24`), computed from
the hex values:

| ink | bg | panel | panel-2 |
| --- | --- | --- | --- |
| `--tnm-ink #edede8` | 15.86 | 14.10 | 12.72 |
| `--tnm-ink-dim #93a09a` | 6.86 | 6.10 | 5.50 |
| `--tnm-accent #0fbe7a` (text) | 7.69 | 6.83 | 6.16 |
| `--tnm-gold #e0ac4e` | 9.03 | 8.03 | 7.24 |
| `--green #78b870` (the `.btn`) | 7.88 | 7.01 | 6.32 |
| `--cyan #5abda8` | 8.23 | 7.32 | 6.60 |
| `--amber #d08030` | 6.04 | 5.37 | 4.85 |
| `--crimson #d95f5f` | 5.10 | 4.54 | 4.09 |
| boundary `--tnm-line-strong` (0.22 ink) | 1.88 | 1.92 | 1.92 |

Every word clears 4.5:1 on the two grounds it lands on; crimson is text only on the page
plate and the panel (the bracket's LIVE chip, 4.54 measured in the browser). The room's
lines are DECORATIVE (`--hairline` class) and are not measured; the accent as a boundary
(the LIVE chip's border) is 6.16 or better everywhere. Note the aliasing RAISES the
secondary tier: `--dim` was 5.57 / 4.95 / 4.47 on the portal's grounds and reads
`--tnm-ink-dim` in the room.

## A4: the projector, from the back of the room

Measured with `TvStage` pinned to a 1920x1080 viewport (`/dev/tournaments?view=tv`, added
for this) rather than in the harness's 16:9 frame, whose `vw` units are the viewport's
anyway. The assumption sized against, stated once here and in the component: a 100-inch
16:9 image (about 2.2 m wide) read from 8 m, the back of a shop classroom. At 2.2 m / 1920
px one pixel is 1.15 mm; the 1:200 rule of thumb wants ~40 mm of cap height (~50 px of
Rajdhani, cap height ~0.7 em) for a word that must be READ and ~20 mm (~25 px) for one
that only needs to be recognised.

| element | before | after |
| --- | --- | --- |
| competitor names, live pair (xl) | 89.6px | 89.6px (already right) |
| round label ("Winners Round 1") | 22.4px | 35.2px |
| LIVE | 25.6px | 33.6px |
| match clock | -- | 41.6px (new) |
| tournament name | 41.6px | 41.6px |
| up-next competitor names (md) | **24.8px** | **57.6px** |
| up-next round labels | **17.6px** | 27.2px |
| "vs" between the up-next pair | 19.2px | 28.8px |
| "N of M matches played" | 24px | 32px |
| status word | 20.8px | 27.2px |
| footer share address | 16.8px | 26.9px |
| result: winner / eliminated labels | 24px | 35.2px |
| result: winner and loser names (lg) | 48px | 76.8px |

So the defect A4 asks about was real and specific: the pair ABOUT TO BE CALLED was the
smallest text on the screen (24.8px names under 17.6px labels, "recognise" size at best),
on the state the projector spends most of an event in. It is the size of the live pair's
subtitle now. The sizes are `clamp()`s in `TvStage.svelte`; `EntryBanner`'s own md and lg
sizes are for a page and are overridden by the stage (`.tv :global(.entry-banner.md)`,
one more class than the component's own rule) rather than by adding a fifth size to a
component four surfaces share.

## A5: it updates itself

Yes, and it did before this bundle. `/tournaments/[id]/tv/+page.svelte` subscribes to
Supabase Realtime `postgres_changes` on `tournament_entries`, `tournament_bracket_matches`,
`tournament_match_games`, `tournament_entry_styles` and the `tournaments` row, and
`invalidateAll()`s 150ms after any event; the public page and the host console do the
same (the host console's subscription is what keeps co-hosts in sync). 0062 §12 and 0063
§8 add every one of those tables to the `supabase_realtime` publication at apply time.
`push-client.ts` and `MatchAlerts` are a different thing: Web Push to a competitor's
phone ("your next match is set"), which needs `PUBLIC_VAPID_PUBLIC_KEY` on the deployment
and a device that opted in; they do not drive any screen. **What this session cannot see**
is whether Realtime is enabled on the production project and whether the publication
carries the tables there; that is the first thing on the check-list below.

## A6: the counts block, before

`npm run verify:counts -- --check` agreed with the tree: 116 specs, 57 routes, 86 `/dev`
pages, 232 runs. The measured half was recorded at `4ecf48f` and covered 116 specs.

## What was built

**Function (B1).** `src/lib/tournaments/live.ts`: `matchQueue` (in progress / ready /
waiting / completed, byes in none), `nextUp`, `bracketProgress`, `hostSectionOrder` and
`FORFEIT_REASONS`. ONE implementation of "what is callable next": the host console, the
public page and the projector each had their own five-line copy of it and all three read
this now, so the row the host's Start is on is the row the room is shown.
`HostMatchControl.svelte` is the match control extracted from the host route -- NOW (in
progress, result form open), NEXT UP (the first callable match as a banner pair with one
full-width Start), the rest of the ready list, waiting count, completed with correct --
with every write a callback the route points at its RPCs and `onping` optional so the
harness, which has no push sender, gets no ping buttons. The host route renders its cards
through `hostSectionOrder(t.status)`: the match card FIRST the moment there is a bracket,
setup cards first before that. Every control on the match path is on the 44px floor
(`min-height`, never a height): winner picks 28.6 -> 44, score inputs 30.2 -> 44, the
minis ~20 -> 44, the forfeit picks, chips, reason, award and cancel 44. `ForfeitForm`
gained three preset reason chips (`No-show`, `Withdrew`, `Disqualified`) that fill the
reason field, so a no-show is five taps and no keyboard; the field stays, the RPC's rule
(1-200 characters, logged) is unchanged.

**Identity (B2).** `/tournaments/+layout.svelte` puts `.tnm-root .tnm-shell` on every page
under the section -- a class and a stylesheet import, no load, no guard, and a test
refuses a `+layout.server.ts` ever appearing beside it. `tournaments-theme.css` gained the
page-scale layer: the room aliases the portal vocabulary (`--bg0/1/2`, `--white`, `--dim`,
`--line`, `--line-strong`, the `--surface-*`/`--text-*` aliases) onto its own plate ON
`.tnm-root` ITSELF, so `.card`, `.btn.secondary`, `.lead` and every fallback-carrying
component land on the plate with no rule rewritten; the semantic accents are not
re-pointed. The portal's green `//` h2 prefix and the cyan glow eyebrow are neutralised
(they would spend emerald on every card); h2 becomes the room's mono label; the hero is a
left-aligned scoreboard masthead with a rule under it; a bare link is ink with a quiet
underline via `:where()` so any component's own link rule still outranks it; the shared
`.tnm-status` chip is LIVE in emerald (the one emerald element), open in ink, complete in
gold. The event page composes as an event: the masthead carries the status chip and the
new `EventRail` -- one cell per contested match in play order that fills in as results
land, the played count, and a running clock from the first match called (`now` threaded in
from the page on a 30s tick, never read inside) -- and an **Up next** block lists the next
three callable matches under Now playing, so a competitor reads they are about to be
called before anybody says so. "Now playing" is a neutral label now; the bracket's LIVE
node stays crimson (the status red's own role).

**Projector (B3).** The sizes above; `TvStage` reads `matchQueue`; and a match clock --
seconds since the featured match was called, from its own `started_at`, on a 1s tick that
only runs while a match is featured -- under the live pair. Text, so nothing new moves
under reduced motion.

**Harness.** `/dev/tournaments?view=tv|host|page` with `field`, `state` (`live`, `played`,
`done`) and `scores=1`; the default harness gained the match control and the rail; the sim
gained `startMatch`, `submitResult`, `forfeitMatch` by id, mirroring the RPC payloads. Eight
route specs under `tools/browser-verify/routes/tournaments*.mjs`.

**Not built, deliberately.** One-tap results (a pick that submits): the second tap is the
check on a mis-tap in front of a class, and correcting costs a typed reason. A host
console harness of the whole page: the route's setup cards are RPC forms with nothing to
measure but their inputs, and the match card is the thing that runs the event. Any change
to `BracketView`'s own colours, `EntryBanner`'s page sizes, the launcher, or the token
files.

## Measured

### Tap counts, before and after

| path | before | after |
| --- | --- | --- |
| between two matches, win/loss | 3 + a scroll past five cards | **3, at the top of the page** |
| between two matches, score entry | 4 + typing two numbers | 4 + typing two numbers |
| a no-show | 5 + a typed reason | **5, no keyboard** |
| a correction | 3 + a typed reason | 3 + a typed reason (a correction should cost a sentence) |

The three-tap path is pinned by `tests/dom/tournament-host-control-mount.test.ts` on the
real component with real clicks against the sim: pick, submit, Start -- three
`dispatchEvent`s, the submit callback seeing `{ games: [{ winner: 'a' }] }`, the row
going `in_progress -> complete`, the next row `pending -> in_progress`. The forfeit path
is pinned at five with the chip filling the field and the transport seeing
`{ forfeit: true, winner_id, reason: 'No-show' }`.

### The positive controls (B5), both run and restored by md5

1. `hostSectionOrder` with the match card put back at the bottom while live:
   `tests/tournament-live.test.ts` reddens on exactly one test, `matches first while live
   and complete`; 15 of 16 pass.
2. An arm step put in front of Start in `HostMatchControl` (a fourth tap):
   `tests/dom/tournament-host-control-mount.test.ts` reddens on exactly one test, `three
   taps: ...`, with `expected [ 'submit' ] to deeply equal [ 'submit', 'start' ]` -- the
   state transition and the count fail together; 7 of 8 pass.

Both files restored from `cp` copies and verified `md5sum -c` OK; the pair then passes
24 of 24.

### Browser proof (B6)

BROWSER_PROOF_PLACEHOLDER

### Counts, suite, check (B7, B8)

COUNTS_PLACEHOLDER

## Not verified

- **Production.** Nothing here reached it, by instruction. Whether Realtime is enabled on
  the live project, whether the tournament tables are in its publication, whether push is
  configured, and what the real host console looks like signed in as Mr. Pina are all on
  the Tuesday check-list in the report and not claims of this entry.
- **A real projector and a real phone.** Every size above is a computed style at a
  1920x1080 or 375px viewport in headless Chromium with web fonts blocked (the harness's
  own rule); the type was measured in the fallback stack.
- **The host route as a page.** Its match card is the extracted component and is measured
  through the harness; the route itself renders only behind a session and a hosts row and
  was verified by `svelte-check` and by the source sweep, not driven.
- **`prefers-reduced-motion`** is `no-preference` in the harness; the rail's live cell and
  the projector's LIVE pulse carry `reduce` overrides and were read, not exercised.

## Deferred

- The bracket node's own colours under the room (crimson LIVE, gold FF, the dim bye) were
  measured and left; the room-hook pattern would let the room re-point them, which is a
  bundle of its own.
- A one-tap result for best-of-one win/loss brackets, if Tuesday shows the confirm is
  costing more than it saves.
- The launcher's three green-family accents (see A3): if a person cannot tell tournaments
  from GREENLINE at a glance the fix is on the launcher, which this prompt did not own.
