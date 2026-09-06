# 0076 The last bucket anyone can enumerate, and the file that keeps lying about it
- Issued: 2026-09-06
- By: router chat for IDEA portal work
- Owns: at most one migration (number taken at commit time), the thumbnail render path under `src/lib/tournaments/**` and `src/routes/tournaments/**`, `src/routes/dev/tournament-thumbs/**`, `tests/tournament-thumbs*`, `tests/db/tournament-thumbs*`, `tools/browser-verify/routes/tournament-thumbs*.mjs`, the generated regions of its README, decision 17's Status line, `docs/prompt-ledger/entries/0076-*`, and its own `docs/history/` entry.
- Migration permitted: at most one, number taken at commit time after merging origin/main. Highest on origin/main at issue: 0185
- Status: issued
- Branch: assigned by the harness
- Notes: Prompt 0071 closed `maps-media`'s listing and, in doing so, proved
  the shape decision 17 already proposed as its own default: close the
  listing, leave the public flag. It also reported the state of every bucket
  in the project, and exactly one is still both public and world-listable.
  
  `tournament-thumbs`. `/tournaments` is a signed-out spectator surface on
  purpose, and `tournament_entries.thumbnail_url` stores the whole public URL
  in an anon-readable table, so the FRONT DOOR is deliberately open and must
  stay open. What is not deliberate is the second door: an anonymous caller
  can list every key in the bucket, which includes anything uploaded against
  an entry that was never published, and any orphan no row names.
  
  0071's migration is the pattern and its argument transfers exactly. The
  policy scopes the anon read to keys a row already names, and the
  published-owner test is left OUT of the storage predicate deliberately,
  because a policy expression evaluates as the querying role, so the subquery
  is filtered by the owning table's own RLS. The storage read follows the row
  read instead of restating it.
  
  Whether that argument holds here is the audit's job, not this prompt's
  assertion. `tournament_entries` may be readable in a way `maps_photos` is
  not, and if the two doors are already the same width there is nothing to
  close and saying so is the deliverable.
  
  SEPARATELY: `CLAUDE.md` has now been reported stale by four bundles --
  0055 on the `claude/**` merge paragraph, 0060 on `gauntlet_practice_meter`,
  0071 on the maps SVG wildcard and on the phantom-error count being 13
  rather than 11. None of them owned it. Add whatever you find to that list
  and report the sentences; do not edit the file.
  
  Deliberately excluded: the public flag on either bucket; `maps-media`,
  closed by 0071; and every private bucket.
