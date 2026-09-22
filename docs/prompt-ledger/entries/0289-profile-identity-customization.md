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
- Status: issued
- Branch: `claude/nifty-euler-shpxf0`
- Notes: (filled in at the end)
