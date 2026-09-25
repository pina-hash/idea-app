# Ledger 0298 baseline, measured before any build agent started

- Tree: `claude/upbeat-pascal-p9krgk` at `6064a101` (the ledger entry commit), which is
  `origin/main` (`abf070c7`) plus the feedback-round documents only. No source file differs
  from `origin/main`.
- Measured: 2026-09-25, 21:50 to 22:30 Pacific (04:50 to 05:30 UTC), in a cloud container
  with 4 CPUs and 15 GB of memory.
- Location: `ROUND1_BRIEF.md` section 2 names `round1/BASELINE.md`; the overnight ledger entry
  owns `docs/feedback/2026-09-25/overnight/**` and not `round1/`, so the file is here.

## svelte-check

`PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` exported as placeholders first (CLAUDE.md),
then `npx svelte-kit sync && npx svelte-check --output human`:

```
svelte-check found 0 errors and 37 warnings in 20 files
     31 state_referenced_locally
      5 css_unused_selector
      1 perf_avoid_nested_class
```

This matches the figure CLAUDE.md carries (0 / 37 / 20, 31 / 5 / 1). Wall time 1m32s.

## npm test

Run in a separate `git worktree` of the same commit (`/tmp/claude-0/baseline`, with the
dependencies linked), so build agents editing the main tree could not contaminate it.
The summary line and stderr are recorded below.

RESULT_PENDING

## verify:browser --probe

```
executablePath               /opt/pw-browsers/chromium-1194/chrome-linux/chrome
browserVersion               141.0.7390.37
screenshot                   6086 bytes (PNG magic ok)
rafFires                     true
intersectionObserverFires    true
resizeObserverDelivers       true
canvasReadback               rgb(128, 128, 128)
canvasParsesColorMix         true
animationMidpointOpacity     0.5
layoutAfterTimeoutPx         333
devicePixelRatio             1
prefersReducedMotion         false
```
