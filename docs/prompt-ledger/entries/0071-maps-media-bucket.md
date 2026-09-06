# 0071 The last bucket a stranger can enumerate
- Issued: 2026-09-05
- By: router chat for IDEA portal work
- Owns: at most one migration (number taken at commit time), media URL construction under `src/lib/maps/**`, a proxy route if the design needs one, `src/routes/dev/maps-media/**`, `tests/maps-media*`, `tests/db/maps-media*`, `tools/browser-verify/routes/maps-media*.mjs`, the generated regions of its README, one decision entry, `docs/prompt-ledger/entries/0071-*`, and its own `docs/history/` entry.
- Migration permitted: at most one, number taken at commit time. Highest on origin/main at issue: 0184. TAKEN: `0186_maps_media_no_anon_listing.sql` (0185 landed on `origin/main` between issue and commit; 0186 verified free across every ref and against `git log --all --diff-filter=A` at commit time). NOT APPLIED -- this container has no route to the live project, so there is no `docs/migrations-applied/` record and the apply is Mr. Pina's.
- Status: pushed
- Branch: `claude/maps-media-bucket-he0wnn`
- Notes: Prompt 0057 closed `foundry-covers`, deliberately left
  `tournament-thumbs` public because `/tournaments` is a signed-out surface,
  and then enumerated all fourteen buckets. Its sweep named one more:
  
    `maps-media` is public AND world-listable, and its `image/*` wildcard
    admits SVG.
  
  Two separate problems in one bucket.
  
  THE LISTING is the same shape prompt 0052 measured on `avatars`: a policy
  reading `using (bucket_id = ...)` and nothing else means an anonymous
  caller does not have to guess a key, it can ask for all of them. These are
  admin photographs of the building's shelves and toolboxes rather than
  faces, so the disclosure is smaller than the avatar one; it is still an
  inventory of a school's rooms, readable by anyone.
  
  THE SVG HALF OF 0057's FINDING IS ALREADY CLOSED AND ITS REPORT WAS
  STALE. `0168_maps_media_types_and_plan_frame.sql` replaced the `image/*`
  wildcard with six concrete raster types and raises at apply time if any
  SVG spelling survives; the dashboard reading on 2026-09-05 matches. Do not
  spend a phase on it. `CLAUDE.md` still describes the concrete list as a
  migration "which no bundle has written yet", and that paragraph is stale;
  prompt 0073 found the same thing independently. You do not own that file,
  so report the sentence it should carry.

  The IDEA Maps viewer went public in September, so this bucket now backs a
  surface a signed-out visitor reaches, which is what makes it worth a lane
  now rather than in a sweep.
  
  Deliberately excluded: the avatar and cover routes, which are the pattern;
  `tournament-thumbs`, decided; and the maps editor, which is a different
  surface with its own grants.
