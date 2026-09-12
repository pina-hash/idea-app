# 0175 IDEA Foundry: the gallery as a mosaic of student thumbnails

- Issued: 2026-09-12T14:32:00Z
- By: chat "Foundry gallery Steam-like redesign"
- Owns: the Foundry gallery and card components under `src/routes/foundry/**` and `src/lib/foundry/**`, `tests/dom/foundry-card*`, `tools/browser-verify/routes/foundry*.mjs` and the generated regions of its README, `docs/prompt-ledger/entries/0175-*`, and its own `docs/history/` entry.
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0170
- Status: pushed
- Branch: `claude/serene-noether-d9iapn`, branched from `origin/integration` at `eef6e85`.
- Outcome: The card is the thumbnail, at the student's own aspect ratio, laid
  out in a multicol mosaic. The clamp is [9:16, 2:1]; at 375 the tallest
  possible card is 610px, under the 667px viewport of the smallest phone in
  common use, so one upload cannot own a screen. An app with no cover gets a
  generated cover carrying its name as the art, at a hue from its own id that
  can never land in the band the forge reserves for heat -- THAT DEFAULT IS THE
  SESSION'S PROPOSAL, NOT HIS, and his "no generated color" is the one phrase
  that could be read against it. Four routes to the name, the touch one measured
  at 375. Full suite 406 files / 7837 tests / 0 failures; svelte-check 0 errors /
  38 warnings / 21 files, identical to the branch point measured in a worktree;
  every foundry browser spec 336 measurements / 0 outside threshold; one
  `verify:readme` scoped to `--route foundry`, 9 specs in 51.7s. Fifteen mutants
  across the two suites, all reddening, restored byte-identically by md5.
  `docs/history/serene-noether-d9iapn.md` carries the measurements.
- Outside the stated Owns, and named rather than hidden: three assertions in
  `tests/foundry-gallery.test.ts` (ledger 0015's, reading `pushed`) that pinned
  the behaviour this bundle deliberately removed, and a new dev harness at
  `src/routes/dev/foundry-mosaic/**` -- a NEW path intersecting nobody's Owns,
  added because the existing gallery fixture carries `cover_path: null` on every
  app and therefore cannot render a mosaic at all. `CLAUDE.md` was NOT edited
  although this bundle introduces conventions it would normally record: it is
  outside this lane's Owns and four lanes were live on it. Its stale
  `svelte-check` baseline (40 in 22 files, measured 38 in 21) is reported here
  for the same reason.
- Notes: Mr. Pina's 2026-09-12 ask -- every card is the same brownish orange; he
  wants a Steam-library mosaic where the card IS the uploaded thumbnail, at
  whatever aspect ratio the student uploaded, with the name in the art and a
  hover popup naming the app, and more student customisation. The
  no-thumbnail case is explicitly NOT his decision and is proposed by the
  session. Ledgers 0171-0174 run in parallel; 0173 owns
  `docs/decisions/entries/03-*` (the LAUNCHER card's colours, a different
  surface from this gallery card) and is not touched here.
