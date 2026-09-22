# 0289 Profile customization, better default avatars, and the mascot ask
- Issued: 2026-09-22T00:00:00Z
- By: Lane D2, answering reports 14 (the default pictures are "mundane and
  uninteresting"), 15 (a student wants tournament-grade banner customization on
  the standard profile, everywhere the profile shows up) and 24 (a student,
  Ezio Veneziano: "add the phone cat to the mascot pack").
- Owns: `src/lib/profile.ts`, `src/lib/avatars.ts`, `src/lib/Avatar.svelte`,
  `src/lib/ProfileMenu.svelte`, `src/lib/PathwayChip.svelte`,
  `src/lib/pathways.ts`, `src/lib/tournaments/entry-styles.ts`,
  `EntryBanner.svelte`, `EntryChip.svelte`, `EntryStyleEditor.svelte`, one new
  shared identity component under `src/lib/`,
  `supabase/migrations/0220_*.sql`, `src/routes/dev/avatars/`,
  `src/routes/dev/profile-menu/`, matching `tests/`,
  `tools/browser-verify/routes/avatars.mjs` and one new spec,
  `docs/prompt-ledger/entries/0289-*.md`.
- Migration permitted: yes, exactly one, number 0220.
  Claims: 1-7. Highest on origin/main at issue: 0217
- Status: pushed
- Branch: `claude/nifty-euler-shpxf0`
- Notes: ALL SEVEN CLAIMS CONFIRMED against the tree, claim 4 and claim 6 most
  carefully. ONE THING THE TREE SAID THAT THE PROMPT DID NOT: `profiles` carries
  FOUR policies, not five -- there is no insert policy, because the row is made
  by 0001's `on_auth_user_created` trigger. That is asserted now, so 0220's
  "adds no policy" is checkable rather than stated.
  THE AUDIT'S DESIGN QUESTION, ANSWERED BOTH WAYS. The viewer's OWN identity
  renders everywhere with no consumer edit, because `PROFILE_SELECT` is in a
  file this bundle owns and the root layout loads it once as `userProfile`.
  SOMEBODY ELSE'S cannot come that way -- `profiles` select is own-row-or-admin
  -- so it has to travel through whichever SECURITY DEFINER RPC feeds that
  surface, which is a migration in another lane. The client half is built and
  proved and the tap is deliberately not turned. ZERO IDENTITY CONSUMERS WERE
  EDITED, asserted from this lane's own git diff.
  ONE DEVIATION FROM THE BUILD LIST: the PURE LAYER was lifted, the EDITOR was
  not generalized. `EntryStyleEditor` imports `tournaments-theme.css` and
  previews through `EntryBanner`, so making it the portal's editor pulls a
  room's stylesheet and render path into a component mounted in 69 mastheads --
  the light-paper-plate argument `ProfileMenu` already records as rejected.
  Making it generic is a rewrite of a 464-line live surface with three callers
  this bundle may not edit. Reasoning in the history entry.
  MEASURING FOUND A LIVE DEFECT NOBODY HAD MEASURED: `gear` and `wave` fail the
  3:1 graphical floor as glyph strokes (2.57 and 1.33), which is report 14's
  complaint in its most literal form on an option shipped since 0020. Repaired
  by lightness only. AND A SECOND, INHERITED ONE: `bannerInk` bottoms out at
  1.90:1 with a freely chosen background, which is the DEPLOYED tournament
  banner's defect too -- found, reported, deliberately NOT fixed, because
  fixing it changes what a projector renders mid-tournament.
  TWO TESTS ARE RED and both are structural to carrying an unapplied migration:
  `migrations-applied-record` (0220 is not applied, and that directory's README
  says "Nothing here is a plan" -- 0217's SQL and record landed in separate
  commits, as every migration's do) and the 0177 contiguity walk (the hole at
  0219, which 0218's contest between two lanes very likely explains). Neither
  existed on `origin/main`; neither is about the code this bundle changed.
  `npm test` 2 failed / 9941 passed; svelte-check 0 errors / 37 warnings in 20
  files, unmoved. The browser pass found four things reading would not have,
  and ONE DEFECT I REPORTED THAT WAS NOT ONE -- a viewport-based reachability
  probe that produced a `max-height` on `.pm-panel` and had to be backed out,
  because that panel is not its own scroller by design.
