---
title: "The browser harness stops reporting four rows nobody may act on: two were the instrument, one was a misdiagnosis hiding a real clipped tab, one was a control that could not fail (`claude/browser-harness-truthfulness-l4zk0b`, no migration)"
date: 2026-09-03
branches: [claude/browser-harness-truthfulness-l4zk0b]
migrations: []
subsystems: ["Browser harness", "Testing", "IDEA Coin economy"]
---

Prompt 0023. No migration, no product fix, and no surface a person can open -- so there is
no Vercel preview to name. Started from `origin/integration` at `a7cd032`, which is
`origin/main` (`5d79b6f`) plus prompts 0018 and 0019. **The prompt's claim that 0021 is on
`integration` is wrong**: `docs/prompt-ledger/entries/0020-*` and `0021-*` exist only on
the two unmerged `claude/*-maps-*` branches. Neither bears on this bundle. Git already
carried a committer identity (`Claude <noreply@anthropic.com>`), so none was set.

## The baseline, measured before anything was touched

A full pass on the clean tree, port 5199 free: **160 route/width runs, 2196 measurements,
4 outside threshold, 383.3s**. `--selftest`: **64 controls (32 negative, 32 positive), 0
instrument failures**, exit 0.

The four:

| row | measured |
| --- | --- |
| `/dev/pathways` @375 `tap-target` harness controls | smallest 194.7x26.2 (min 26.2px), 2/2 under 44px |
| `/dev/pathways` @1440 `tap-target` harness controls | identical |
| `/dev/coins` @375 `horizontal-scroll` | 51px (scrollWidth 426 vs clientWidth 375) |
| `/dev/coins-signedin-1` @375 `horizontal-scroll` | identical |

Neither documented flake fired. The four typing-case rows the committed measured region
lists are stale: that region was written at `f5028e6`, on the 0019 branch, before 0018's
merge landed the fix.

## The classification, and one of the four was not what it said

**`/dev/pathways`, both rows: a correct finding about something that is not a product
surface.** The row measured `.harness .controls button` -- this dev page's own two buttons.
Nothing else on the page is under the floor: the real first-login picker measures
140.1x79.4 (options), 143.6x44.0 (confirm) and 128.4x44.0 ("Choose later"). Decision 09
puts 44px on every student surface and 24px only on an instructor density surface
declaring a named class; a dev harness's chrome is neither, so the answer is not a
threshold exemption. Fixed at source -- `min-height: 44px` in the page's own stylesheet,
with the reasoning beside it -- and **the row is kept**, so the chrome cannot drift back
under the floor unnoticed.

**And the row now measures something that ships as well.** `ProfileMenu` is mounted in
`src/routes/+layout.svelte` and in roughly twenty routes besides, so its trigger is on
every page header a student opens, and **nothing in this harness had ever measured it**.
It is **44.0x34.0** here and **100.6x34.0** on `/dev/profile-menu` and `/dev/home-order`
-- 34px in the short dimension, both widths, three independent routes, never inside a
`<label>`, parent `.pm-root` exactly as tall. The height is `Avatar size={30}` plus
`.pm-trigger`'s 2px padding, so it does not depend on the web font this harness cannot
load; `.pm-trigger` carries neither `.tap-44` nor `.tap-reach-44`, so `tap-target` is the
right instrument. **A real product defect, reported and not fixed** -- `src/lib/` is
outside this bundle. The two `/dev/pathways` rows therefore stay red at the same count and
now name a control a student's thumb actually lands on.

**`/dev/coins` and `/dev/coins-signedin-1`: a REAL PRODUCT DEFECT, and the spec's own
header had been blaming the wrong element for weeks.**

Both files said the 51px was `#student-drawer`, "a slide-in panel parked off the right
edge at ~750px". Measured: `.drawer` is `position: fixed`, and a fixed subtree contributes
nothing to the document's scrollable overflow. Its six children -- header, body, close
button, name, stats, transaction title -- are static or absolute INSIDE that fixed
ancestor, so they carry `right` values of 727.6-750 and top any offender list sorted by
that number while contributing nothing either. `horizontal-scroll` in `checks.mjs` skips an
element whose OWN position is fixed and does not walk up for a fixed ancestor, so the
drawer's children are exactly what the report showed: six true measurements of a
non-cause.

**The cause is the fourth tab.** At 375 the Ledger's own `.tab-bar .tab-btn` "Contracts"
runs 329.2 -> 426.3, and 426 is the reported `scrollWidth` to the pixel. It is the only
non-fixed node past the edge. The page cannot scroll to it: `body { overflow-x: hidden }`
propagates to the viewport, and `scrollLeft` set to 999 reads back 0 on `documentElement`,
on `body` and on `window`; `.tab-bar` is `overflow-x: visible` and not scrollable
(`scrollWidth === clientWidth`). So 45.8px of a 97.1px tab is on screen and the rest is
unreachable.

**It is worse in production than the harness reports, which is the direction the
fallback-stack limit is easy to read backwards.** The tabs are Orbitron, loaded from
`fonts.googleapis.com`, which the harness blocks. Re-measured with the real face injected
from `@fontsource/orbitron`: overflow **51px -> 89px**, Contracts **357.7 -> 464.0**, so
**17.3px of a 106.3px tab** is on screen. The harness under-reports it by 38px.

**Cost to a student today:** on a phone, the Contracts tab of the IDEA Coin Ledger -- a
PUBLIC surface, no sign-in -- is 84% off the right edge with no way to scroll, swipe or
tap to it. The lane that owns it is whoever unfreezes `src/lib/legacy/coins/index.html`:
carried-over legacy under CLAUDE.md's freeze, whose only exception is VANGUARD. **The rows
stay red on purpose.** What changed is that the `prepare-eval` probe now skips anything
under a fixed ancestor and names the real offender with its `right` value, a new
`orderResult` row asserts that everything past the edge is fixed furniture or the tab bar
(so a SECOND overflow could not hide behind this one), and both headers say what was
measured instead of the folklore.

## The vacuous control, and where the guard actually bites

Prompt 0018 reported that `classroom-interaction-case-fresh` does not redden when
`collapseWhen` is ignored outright. Reproduced here, at both widths (0018 measured 1440):
with `Disclosure`'s `collapsed` forced to `false`, both browser cases came back **0 outside
threshold** over 34 measurements.

The fixture is the reason. `?case=fresh` answers nothing, so every `collapseWhen` on the
page is already false at arrival, and "all three panels are open" reads identically whether
a false signal was honoured or no signal was read. Nothing written against that page can
separate them.

`?case=typing` can, because its fixture answers one of the two constrained blocks, so two
panels arrive with `collapseWhen` genuinely true. Measured at BOTH widths across three
states of `src/lib/Disclosure.svelte`:

| arrival on `?case=typing` | `module-body` | `module-instructions` | `item-body-disclosure` |
| --- | --- | --- | --- |
| the fix as shipped | `true` | `false` | `false` |
| `collapseWhen` ignored outright | `true` | **`true`** | **`true`** |
| the fix reverted (read live) | `true` | `false` | `false` |

So the guard is an `arrival:` `orderResult` on the TYPING spec, reading a stash the last
prepare step takes before the first keystroke -- arrival is the only moment the two states
differ, and every check runs after the typing. `module-body` is carried even though it
never moves: it is the positive control that says the three testids resolved at all, so a
renamed hook reddens instead of reading as a passing absence.

### The three-way proof

| state of `src/lib/Disclosure.svelte` | outside threshold, of 36 | which rows |
| --- | --- | --- |
| the fix as shipped | **0** | -- |
| `collapsed = $derived(false)` (signal ignored) | **2** | the arrival row, both widths |
| `open = disclosureOpen(chosen, collapseWhen)` (fix reverted) | **4** | the two typing rows, both widths; **arrival green** |

The two mutations move **disjoint** row sets, which is the thing that had to be shown: the
new row measures a different claim rather than the same claim twice. Restored from a `cp`
copy after each, never `git checkout --`, md5 `6b71dd7c8c10ff6960fb2ccbde8ddcbc` verified
identical three times.

**`classroom-interaction-case-fresh.mjs` keeps its rows and loses its claim.** Its header
now states what it cannot do and where the guard lives, and states what it is still for:
the arrival rule's OTHER direction -- a fix that closed a panel on a fresh item would pass
the typing case and redden here, and this is the only surface holding that.

The typing spec's header also stopped saying "THIS CHECK IS RED ON THE TREE THAT SHIPPED
IT". It has been green since 0018; a header claiming a standing finding that no longer
exists is the same defect as a standing finding nobody may act on.

## The two flakes: one reproduced and fixed, one not reproducible here

**Neither fired in the wild.** Five targeted runs each at the failing width, plus the
baseline full pass: `/dev/gauntlet-shell-countdown` @1440 **0/6**, `/dev/notebook` @375
**0/6**. So the honest starting position was that no clean run could prove anything, and
both had to be attacked at their cause with the cause measured directly.

### `/dev/gauntlet-shell-countdown` -- reproduced deterministically, fixed, and the old fix was aimed at the wrong window

Sampling a `setTimeout(50)` chain from `domcontentloaded` on `/dev/gauntlet-shell`, three
trials: lateness sits at 0-3ms, then ONE sample reports **4472 / 4576 / 4473ms**, then
settles to 0-84ms for the rest of the page's life. That is `ViewportBackground`'s one-time
three.js + `RoomEnvironment` PMREM setup as a single synchronous block -- **4.5 seconds
here**, not the 0.5-1.5s the original diagnosis measured.

**The block started at t=2242ms in one trial** -- after the `Math.max(0, 2000 -
performance.now())` margin would have expired. So that margin was not merely inert on this
container (hydration measures 5.1-5.4s, so it waited 0ms every run); it was aimed at a
window whose start it could not predict. **Punctuality is not the signal either**, for the
same reason: the thread is perfectly punctual at t=1276-2223 as well as after, so any
"wait until a queued task fires on time" predicate is satisfiable before the block.

**What separates them is the canvas.** `<canvas>` starts at the HTML default 300x150 and
`WebGLRenderer` resizes it; because the setup is one synchronous block there is no
observable moment inside it, so from outside the canvas is 300x150 before and sized after,
with nothing in between. Measured 3/3: `300x150` on every sample up to the block,
`1440x900` on the first sample after. The predicate compares against the DEFAULT PAIR
rather than a width, so it reads the same at 375 as at 1440.

**Reproduction, 3/3, and the fix against it, 3/3.** Arming as soon as the control exists
(t=216 / 301 / 1278ms, which is what a fast machine does) reddens all three presence rows
every time, with `present 0` -- the overlay gone entirely, exactly the reported signature
and exactly the "0, 3 and 3 findings" this route was known for. Arming on the canvas
predicate instead: 0 red, 3/3, wait reported at 756-803ms.

**Ten consecutive targeted runs after the change: see the table below.** Against a wild
rate of 0/6 before it, ten green runs is only *consistent* with the fix and is not
evidence for it. **The evidence is the reproduction**: a condition that reddened 3/3 with
the old shape and 0/3 with the new one, on the same page in the same container. If WebGL
is ever unavailable the canvas is never resized and the step prints FAILED, which is the
honest outcome -- the old fixed margin proceeded silently.

### `/dev/notebook` -- the constant's bracket measured, the constant removed, and no proof claimed

Polling `aria-pressed` every 25ms from the moment `waitForApp` returns, the
`nearestOutstanding` auto-select effect lands at **1483ms** on a cold visit and at
**239ms** when `/dev/notebook-review` ran immediately before it -- which is the adjacency
every real pass has, because their `order` values are 17 and 18. A **6x spread**, and the
`setTimeout(600)` sat inside it: on the cold sequence the click preceded the effect by
~880ms, on the warm one it followed by ~360ms. Neither the constant nor the report said so.

The signal is the effect's own outcome: until it runs no `.pick:not(.free)` is pressed;
the moment it settles exactly one is. Measured 0 of those at t=0 in both sequences and 1
from the settle onward, so the predicate cannot be satisfied by the pre-effect default --
which is precisely what the original bug was. **And that is what lets `force: true` go**:
after the wait `.pick.free` is aria-pressed false, so the click's own `until` names
something only the click can produce, which is `README.md`'s preferred way out rather than
the `[force: predicate not required to discriminate]` annotation the row used to print.

**No fix is claimed, because no flake could be made to fire.** Under three deliberately
adversarial prepare shapes -- the 600ms sleep, the effect-settled wait, and **no wait at
all** -- driven through the real `clickUntil`, cold and warm, **18/18 came back green**.
So the 600ms was measurably inert here and removing it costs nothing that was ever
measured. **What would be evidence**: a container where the wild finding reproduces (the
`pm31ni` session had one, 4/4 on the notebook-review -> notebook sequence), or a machine
where the effect lands after 600ms and the old spec reddens. The condition exists here --
1483ms was measured -- but `force: true` plus the retry loop absorbs it, so the finding
does not fire. This change removes a timing assumption whose bracket is now written down;
it is not a proven repair.

## Every row accounted for, baseline to final

| baseline row | what happened |
| --- | --- |
| `/dev/pathways` @375 `tap-target` harness controls | **B3**: green -- the dev page's own controls now clear 44px |
| `/dev/pathways` @1440 `tap-target` harness controls | **B3**: green, same fix |
| `/dev/coins` @375 `horizontal-scroll` | **B3**: still red. Real product defect, reclassified and re-explained |
| `/dev/coins-signedin-1` @375 `horizontal-scroll` | **B3**: still red, same defect via the alias |

Nothing disappeared because a spec stopped looking. The two rows that went green went
green because the thing they measured was fixed at its source, and the row is still
measuring it.

## What was verified

- Baseline full pass and `--selftest`, on a clean tree with the port free.
- The four standing rows classified against direct measurement, not against the prompt's
  or the specs' own prose.
- The `case=fresh` vacuity reproduced, and the guard's three-way proof.
- Both flakes' causes measured; one reproduced deterministically and its fix proved
  against that reproduction.
- Ten consecutive targeted runs of each fixed spec.
- `npm run verify:counts -- --check` before and after: the static region agrees with the
  tree and does not move. No route spec and no `/dev` page was added.

## What was NOT verified

- **No live Supabase project, no signed-in surface, no real Drive round trip.** This
  bundle has no database side.
- **No Vercel preview.** The bundle changes an instrument and ships no page a person can
  open; naming a preview URL would be naming a URL for nothing.
- **The `/dev/notebook` flake was never reproduced**, so its change is unproven in the
  direction that matters. Stated above at length rather than buried.
- **Whether the Ledger's tab bar overflows on real hardware with the real font served
  from Google's CDN** was measured only by injecting the local `@fontsource` face into the
  harness's own Chromium. The face is the same family and weights; the CDN was never
  reached from here.
- **`.pm-trigger`'s 34px was measured on three `/dev` routes**, never on a real signed-in
  page, because the harness cannot reach one.

## The sentence a future prompt should carry about standing findings

> Two rows stand: `/dev/pathways` `tap-target` on `.pm-trigger`, at both widths. They are
> a real product defect -- `ProfileMenu`'s header trigger is 34px against a 44px floor --
> owned by `src/lib/ProfileMenu.svelte`. Two more, `horizontal-scroll` on `/dev/coins` and
> `/dev/coins-signedin-1` at 375, are the IDEA Coin Ledger's fourth tab clipped off the
> right edge of a phone, owned by whoever unfreezes `src/lib/legacy/coins/index.html`.
> **Every one of them names a defect a student meets. If your bundle is not that lane,
> leave them; if a FIFTH row appears, it is new and it is yours.**

That is longer than "these four are known and not yours" and it is doing the opposite job:
it tells a session what each row means and who owns it, rather than telling it not to look.
