# 0130 Remeasure the harness README's measured region on the merged tree, then land `integration`

- Issued: 2026-09-10
- By: Mr. Pina, carrying ledger 0125's finding that `integration` was RED at
  `fd8e136e` on a merge-result defect no conflict could have warned anyone
  about, and carrying ledger 0125's landing bundle as the shape this one
  repeats after fixing it.
- Owns: `tools/browser-verify/README.md` in full, both generated regions, the
  merge of `integration` into `main`, the reconciling merge of `main` into
  `integration`, `docs/prompt-ledger/entries/0130-*`, and its own
  `docs/history/` entry. It owns NO source file. A source change looking
  necessary is a STOP.
- Migration permitted: no. Claims: none. `0193` is Mr. Pina's, applied by hand
  before ledger 0125 was issued.
- Lands on: `main`.
- Status: issued
- Branch: `claude/ledger-0130-derived-numbers-b629zb`, branched from
  `origin/integration` at `97475435`.
- Notes: a repair bundle and a landing bundle in one.

  **THE DEFECT WAS A MERGE RESULT, NOT A CONFLICT, AND THAT IS THE WHOLE
  POINT.** `tests/derived-numbers.test.ts` failed five ways on `integration`
  because the measured region described a tree that no longer existed. Ledger
  0118 regenerated it at `4274433b` and ledger 0124 regenerated it at
  `c62f5e76`. Both branches rewrote the SAME region for their OWN tree, so the
  merge had a clean two-sided choice and took 0124's copy -- discarding 0118's,
  and with it the eleven classroom specs 0118 had added and measured. The
  region then claimed `Measurements outside threshold: 0` over a set missing
  every one of them. `merge-tree` reports no conflict because there is none.

  **THERE WAS NOTHING IN GIT TO RESTORE.** Ledger 0125 had already established
  that 0118's region is not correct either: it covers 169 of 177 and misses six
  more. The only correct region is one measured on the merged tree, which is
  what this bundle produced -- 175 specs covered against the static region's
  175, on a clean tree, `dirty:false`.

  **THE DURABLE FIX IS NOT IN THIS BUNDLE AND IS NAMED IN THE HISTORY ENTRY:**
  lanes should stop regenerating the measured region, and the landing bundle
  should regenerate it once after the merge. As long as a lane may write it,
  any two lanes that both do produce a silently wrong merge with nothing to
  warn anyone.

  **THE VITE BOOT WAS TAKEN OUT OF THE HARNESS'S HANDS.** `startDevServer`
  gives a cold boot a 180s window and the boot has been measured at 180 to 187s,
  so it fails about half the time and the failure reads as a hang. Vite was
  started separately on 5199 with its pid recorded, `/dev/pathways` was warmed
  with a long timeout (it answered 200 in 0.80s), and the harness reused it --
  recorded server boot 4392ms. NOTHING ELSE RAN during the pass; prompt 0120
  crashed its own regeneration by running `npm test` concurrently against the
  same server. `pkill -f` was never used: it matches the shell running the
  command and has cost two prior sessions their builds.

  **GATE 4 SUBSTITUTION, the fourth, and it generalises to none of the other
  three.** Ledger 0114's rests on an empty migration range, 0115's on
  hand-applied `0192`, 0125's on hand-applied `0193` plus Mr. Pina's own
  eight-value verification block. This one rests on the SAME `0193` evidence,
  because the migration range is unchanged: `0193` alone. `node
  tools/deploy-probe.mjs` cannot pass here -- `DEPLOY_PROBE_URL` is unset -- and
  its exit 1 is reported verbatim and not treated as a stop. **I verified none
  of those eight values myself and cannot**: no session in this container can
  reach the production database.

  **THE MIGRATION RULE, RE-CHECKED BEFORE EVERY MERGE.** `git diff --name-only
  origin/main...origin/integration -- supabase/migrations/` printed exactly
  `supabase/migrations/0193_classroom_resource_layout.sql` at every check. Any
  other migration is a STOP; prompt 0120 claims `0194`.

  **`0194` JOINED THE PERMITTED SET MID-BUNDLE, ON MR. PINA'S WORD.** He
  applied `supabase/migrations/0194_gauntlet_verification_floor.sql` by hand on
  2026-09-10 and reported `floor_ms` 30000, `held_rows` 0, `held_with_a_seat` 0
  and `reported_by_console` 0, the last being the migration's own safety
  property. **I verified none of those four values either.** The stop rule for
  the rest of the bundle became: `0193` and `0194` permitted, anything else a
  stop. `0194`'s committed file was NOT touched -- it carries a `do $chk$`
  inside two `--` comments that the SQL editor's splitter cannot handle, which a
  later bundle closes with a lint; it is not this bundle's file.

  **LEDGER 0120'S BRANCH WAS MERGED HERE RATHER THAN BY `integrate.yml`**, which
  had left it standing because it conflicted. The conflict was two files: this
  region (regenerated, never taken from a side) and `CLAUDE.md` (both sides kept
  -- separate blocks at different anchors, zero lines of either removed, so no
  stop fired).

  **CONFLICT POLICY.** Resolved on `integration`, never on `main`. The counts
  block was this bundle's outright, so it was REGENERATED rather than resolved.
  `classroom-updates.json` is AT THE REPO ROOT, not under `static/`, and is
  resolved textually keeping both sides.
