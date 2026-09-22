# 0282 Four small measured fixes on four disjoint surfaces
- Issued: 2026-09-22T00:00:00Z
- By: Lane N3, sized as one bundle on purpose -- four separate lanes would have
  been four pull requests for about 40 lines.
- Owns: `src/lib/curriculum.ts`, `src/lib/tour/SpotlightTour.svelte`,
  `src/routes/dev/tour/+page.svelte`, the notebook toolbar's `.tools` rule under
  `src/lib/notebook/`, the matching specs under `tools/browser-verify/routes/`
  and their `measured/*.json`,
  `docs/prompt-ledger/entries/0282-four-small-surfaces.md`,
  `docs/decisions/entries/12-tap-reach-under-floor-three-surfaces.md` (its status
  line only), and its own `docs/history/` entry.
- Migration permitted: no. Claims: none.
  Highest on origin/main at issue: 0217
- Status: issued
- Branch: `claude/new-session-6u4tff`
- Notes: TWO OF THE FOUR SHIPPED CODE, and the other two are the interesting
  ones because in both cases the tree or the measurement contradicted the
  prompt.
  ITEM A (FRC is not an active course) SHIPPED: one row in `SECTIONS`,
  `IDEA FRC` / `FRC 2026/27` / `frc-2026`. The tile reads 3 where it read 2, and
  the coin desk picker gains `IDEA FRC — FRC 2026/27 (Freshman to Junior, Term
  S1)`. Both of the prompt's traps were real and both were avoided: the season
  year is in the TITLE, never in `course` (a year there makes FRC 2027/28 a
  second course in the Set, which is the `IDEA 100-1/-2/-3` defect with a
  different suffix), and `$lib/coin-desk/sections.ts` was read and not edited.
  `term: 'S1'` is the one field that is a placeholder rather than a fact and the
  row's own comment says so.
  ITEM B (the spotlight's 200vmax shadow) SHIPPED NOTHING, and the measurement
  is why. Built as prescribed -- one viewport fill with an even-odd
  `clip-path: path()` hole, keeping the 8px radius and easing on the same curve
  -- then measured against the shipped shadow in an INTERLEAVED same-page A/B,
  and it is WORSE: 83.3ms against 50.0ms at 2707x1074, three identical readings
  each, and 2-3x the p95 at 1440 for an equal median. Two further arms say the
  premise itself does not hold here: halving the spread (5414px -> 2707px)
  changes nothing at all, and four solid panels measure identical to the shadow.
  With the whole tour layer removed the same page measures 49.9ms against the
  shadow's 50.0ms -- indistinguishable -- so on this container the tour costs
  nothing to open. Reverted byte-identically (md5 re-checked). The full table is
  in the history entry; this is Mr. Pina's call, not a lane's.
  ITEM C (the harness reset) SHIPPED and is the smallest change in the bundle.
  It does NOT name `pathway_picker_deferred`, which the prompt and ledger 0276
  both suggested: the key is module-private in `PathwayPicker.svelte` on purpose,
  so the reset writes a deferral stamped `PATHWAY_DEFER_MAX_AGE_MS + 1` ago
  through the exported `deferPathwayPicker`. An expired record is the same answer
  as no record through the same predicate, and it shadows the legacy session key
  the old line cleared, so one call resets both stores and there is no third copy
  of the rule.
  ITEM D (decision 12's last open case) NEEDED NO CODE: prompt 0119 had already
  fixed it and said its own status line "belongs to whoever owns
  `docs/decisions/`". Re-measured in the busiest state rather than read off the
  entry -- 0 of 4 controls under 44px at 375, 0 of 3 at 1440, 0px document
  overflow at both -- and the entry is CLOSED. The mutation reddens at 74px of
  overflow, not the 13px the entry predicted, because the entry's arithmetic was
  for a row without Clear in it.
