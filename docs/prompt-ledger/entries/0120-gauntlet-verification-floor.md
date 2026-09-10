# 0120 The GAUNTLET plausibility floor: a cutoff Mr. Pina owns, and a status for the runs under it

- Issued: 2026-09-10
- By: Mr. Pina, one of five parallel lanes (0118 classroom, 0122 notebook, 0123
  the merge with no source of its own, 0124 FRC and marks). None of the other
  four touches GAUNTLET.
- Owns: `src/lib/gauntlet/**`, `src/routes/gauntlet/**`,
  `supabase/migrations/0194_*.sql`, `src/routes/dev/gauntlet*/**`,
  `tests/gauntlet*`, `tests/db/gauntlet*`,
  `tools/browser-verify/routes/gauntlet*.mjs`, the generated regions of
  `tools/browser-verify/README.md`, `docs/prompt-ledger/entries/0120-*`,
  `docs/decisions/entries/` for decision 19 ONLY, and its own `docs/history/`
  entry.
- Migration permitted: exactly one. Claims: 0194.
- Status: pushed
- Branch: `claude/gauntlet-verification-floor-oclq47`, branched from
  `origin/main` at `131aeec2`. It lands on `integration` only; this lane does not
  merge to `main`.
- Notes: THE DECISION IS MADE and is not re-opened here. Mr. Pina, on the second
  half of decision 19: "Runners must be able to submit legitimate times under 30
  seconds. That artificial cap is nonsense or at the very least I should have
  control over that cutoff time and the run submitter should have a status for a
  low time submitted run for verification." He chose all three of KEEP the floor,
  make the cutoff a setting he owns, and give a sub-floor run a status rather
  than silently unranking it. `pending verification` is the shape decision 19
  records.

  The argument being MODIFIED rather than removed is
  `0154_gauntlet_rank_what_is_checkable.sql`, which pins the board's floor to the
  same threshold `0152` uses to put a run in front of a teacher, so that no run
  loses a seat without also appearing by name on the review console. That pin is
  preserved and is proved by a `tests/db/` test showing a sub-floor run reaches
  the review console. **If a run can vanish from both the board and the review
  console, the change is wrong.**

  Three claims from the 0109 research, all to be confirmed against the tree
  before building on them: the student is told nothing today, because neither
  branch of the rank sentence renders for a sub-floor run; nothing in `src/`
  links to `/gauntlet/run-review` at all; and a board row carries no status field
  of any kind, so this bundle's is the first.

  Migration 0194 is allocated by the router chat, never derived from the tree,
  and is NOT applied here: this container cannot reach the production database
  (the proxy accepts a CONNECT to 5432 and then carries no bytes). The session
  reports the verification query for the SQL editor instead.

  VIEWPORT (`docs/GAUNTLET-DESIGN.md`) is GAUNTLET's design system and takes
  precedence inside this product. `docs/GAUNTLET.md` is guarded by
  `tools/gauntlet-doc-check.mjs`, which FAILS when a migration has no row: 0194
  gets one.

  Harness Vite boot is 180 to 187s cold against a 180s window: Vite is started
  separately on 5199, warmed, and reused. No `pkill -f`, which matches the shell
  running it. Baseline svelte-check 0 errors / 37 warnings at 31/5/1. Push, never
  force-push.
