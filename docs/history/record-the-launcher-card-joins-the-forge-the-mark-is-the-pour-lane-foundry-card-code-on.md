---
title: "The launcher card joins the forge: the mark is the pour (`lane/foundry-card`, code only)"
date: 2026-08-25
branches: [lane/foundry-card]
migrations: []
subsystems: ["IDEA Foundry", "Home page, launcher, tour"]
record_order: 139
---

The brief said the Foundry launcher card carried a game controller; what `main`
actually carried was the crucible-pouring-into-a-browser-window mark from the
accent-restoration bundle. Reported rather than silently resolved, because the
ask stands either way: the browser frame half of that glyph described the
sandbox MECHANISM (where the work runs) rather than what Foundry is, and the
forge identity existed by then with nothing on the home screen speaking it.

**The mark is now a crucible pouring into an INGOT MOLD** (`FoundryMark.svelte`):
the crucible is the build, the mold is the gallery the work is cast into, and
the tell is ONE DRIP -- every 6.8s, two beats of the forge's ember breath
(`--fg-ember: 3.4s`; the card renders outside `.fg-root`, so the token cannot
resolve there and the literal moves with the vocabulary in forge.css). The
drip detaches, falls, and the melt line glints once as it lands; the event
occupies 12% of the cycle and the other 88% is stillness, which is what keeps
it quieter than the shell's seam in a grid beside GAUNTLET, VANGUARD and
GREENLINE. A short STATIC stream under the spout is what makes the two vessels
read as one pour rather than two cups -- the first render without it read
exactly that way, caught by looking at the 128px proposal render rather than
shipping it.

Green stays the accent (`--acc-primary: var(--green)` / `--acc-secondary:
var(--cyan)`, unmoved, still pinned by test); heat appears only on the
pending-review badge, which keeps its measured `--amber` at 4.90:1. The card
texture bytes did not move; its comment now quotes the room's molten seam
instead of the deleted window lines.

**Measured the way the seam was measured**, on the real launcher via
`/dev/home-order`:

- Two animations, `fd-drip` (transform + opacity) and `fd-glint` (opacity),
  6800ms shared cycle -- keyframe properties read back off the live
  animations, nothing else animates.
- 56.0 fps over 2s with the drip running, zero long tasks (>50ms) from a
  PerformanceObserver over the same window.
- Pauses offscreen and on a hidden tab (the MoltenSeam mechanism, now pinned
  for the mark in tests/home-order-and-accent.test.ts): below the fold ->
  `data-paused` + both playStates `paused`; scrolled into view -> `running`;
  synthetic `visibilityState: 'hidden'` -> `paused`. The first measurement
  run reported "paused while visible" and it was the INSTRUMENT's assumption
  that was wrong: on that harness the launcher sits below the 900px fold, so
  the mark was correctly paused at load -- the mechanism demonstrating itself.
- Reduced motion: every part's computed `animation-name` is `none`, all
  opacities 1, all transforms none -- the full glyph at rest, keyframes start
  and end there. Grid screenshots at 1440 and 375, normal and reduced, all
  9 cards settled (settled counts reported per shot, because the launcher's
  entrance animation otherwise photographs blank cards -- the first grid
  screenshot did exactly that).
- Badge both directions on the real page: admin+pending=3 -> "3 to review",
  student -> nothing, admin+0 -> nothing.
- svelte-check 0 errors / 37 warnings (baseline mix exact); full suite 110
  files / 2507 tests green.

**NOT verified**: the live home page against a real session (same container
limits as the forge bundle). The mark's pause was driven through the harness
mounting the real AppLauncher; nothing about it reads Supabase.
---

