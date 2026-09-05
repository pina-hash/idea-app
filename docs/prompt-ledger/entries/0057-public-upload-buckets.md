# 0057 The same hole, one subsystem over, twice
- Issued: 2026-09-05
- By: router chat for IDEA portal work
- Owns: at most one migration (number taken at commit time), cover and thumb URL construction under `src/lib/foundry/**` and `src/lib/tournaments/**`, proxy routes if the design needs them, `src/routes/dev/foundry-covers/**`, `tests/foundry-cover*`, `tests/db/foundry-cover*`, `tests/db/tournament-thumb*`, `tools/browser-verify/routes/foundry-cover*.mjs`, the generated regions of its README, one decision entry, `docs/prompt-ledger/entries/0057-*`, and its own `docs/history/` entry.
- Migration permitted: at most one, number taken at commit time. Highest on origin/main at issue: 0181
- Status: issued
- Branch: assigned by the harness
- Notes: Prompt 0052 closed the `avatars` bucket and found the exposure was
  worse than two earlier bundles had recorded. `0020`'s read policy was
  `using (bucket_id = 'avatars')` and nothing else, so an anonymous caller
  did not need to guess a key: `select name from storage.objects where
  bucket_id = 'avatars'` returned EVERY key. It proved that was the policy
  and not RLS being off by running `select count(*) from public.profiles` on
  the same connection and getting `permission denied`.

  It then swept the other twelve buckets and named two with the same shape:
  `foundry-covers` from `0130` and `tournament-thumbs` from `0062`. Both are
  student uploads, both are own-folder write, and both read
  `using (bucket_id = '...')` with no further predicate. Confirmed at the
  source on 2026-09-05.

  These are not faces. They are cover art a student drew for a game they
  published and thumbnails for a tournament. The disclosure is smaller and
  the shape is identical: world-readable, world-LISTABLE, permanent, and
  surviving the student leaving.

  0052's design is proven and is what this bundle copies: make the bucket
  private, replace `to public` with `to authenticated`, and serve through an
  app route that mints a signed URL ON THE CALLER'S OWN CLIENT and 302s, so
  the policy stays the boundary and the route is not one. Both halves were
  needed there: the bucket flag governs `/object/public/`, the policy governs
  listing.

  THE ORDER MATTERS AND IT BIT ONCE ALREADY. On 2026-09-05 the migration was
  applied before the app half deployed, and every avatar on the site broke
  until the merge landed. Your history entry states the deploy order
  explicitly: app first, migration second.

  Deliberately excluded: `avatars`, closed; the four GAUNTLET buckets and
  `maps-media`, which hold staff assets rather than student uploads and are a
  report rather than a fix; and every private bucket.
