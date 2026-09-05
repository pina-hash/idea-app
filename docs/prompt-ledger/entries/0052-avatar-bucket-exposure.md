# 0052 Faces of minors in a public bucket, protected only by the path
- Issued: 2026-09-05
- By: router chat for IDEA portal work
- Owns: one migration (number taken at commit time), `src/lib/avatars.ts`, `src/lib/Avatar.svelte`, a proxy route only if the design needs one, `src/routes/dev/avatars/**`, `tests/avatar*`, `tests/db/avatar*`, `tools/browser-verify/routes/avatars*.mjs`, the generated regions of its README, a decision entry, `docs/prompt-ledger/entries/0052-*`, and its own `docs/history/` entry.
- Migration permitted: at most one, number taken at commit time. Highest on origin/main at issue: 0180
- Status: issued
- Branch: assigned by the harness
- Notes: `0020_profiles_identity.sql` created `avatars` as a PUBLIC bucket
  with an explicit `avatars public read` policy on `storage.objects`. Writes
  are own-folder only and always have been. Reads are open to anyone.

  Prompt 0033 measured it rather than reading the policy: a genuinely
  anonymous caller reads any avatar object. Prompt 0038 confirmed it and put
  the same sentence in its report. Both said the bytes were never private and
  the PATH is what protects a face, and both correctly declined to change it,
  because neither owned the bucket.

  Since then this project has put student faces on four more staff surfaces.
  Every one of those was gated correctly at the ROW level, and every one of
  them hands more people a path into a store with no gate at all.

  These are photographs of minors at a school. A path is not an access
  control: it is guessable, it is shareable, it appears in a page's HTML, and
  it survives a student leaving.

  The GAUNTLET leaderboard already publishes student faces to every signed-in
  student, which is a separate decision Mr. Pina owns and which this bundle
  must not break while fixing the store underneath it.

  Deliberately excluded: `src/routes/gauntlet/**`; who may SEE an avatar,
  which is settled per surface; and whether a student may upload one, which
  is a consent question nobody has asked.
