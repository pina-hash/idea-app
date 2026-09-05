# 0063 GAUNTLET: an append-only table anyone can write to, and a tolerance in four places
- Issued: 2026-09-05
- By: router chat for IDEA portal work
- Owns: at most one migration (number taken at commit time), the tolerance constant in `src/lib/gauntlet/authoring.ts`, the run-event post path under `src/lib/gauntlet/`, `tests/gauntlet-run-events*`, `tests/db/gauntlet-run-events*`, `tests/gauntlet-volume-tolerance*`, `docs/prompt-ledger/entries/0063-*`, and its own `docs/history/` entry.
- Migration permitted: at most one, number taken at commit time. Highest on origin/main at issue: 0182; TOOK 0184 (0183 landed on main mid-flight; verified free across every ref and against git log --all --diff-filter=A at commit time)
- Status: pushed
- Branch: claude/gauntlet-run-events-zspf1y
- Notes: Prompt 0060 swept `docs/GAUNTLET.md` against the code and reported
  four defects it did not own. Two of them are this bundle.

  ONE. `gauntlet_run_events_insert(text, text, jsonb)` is granted to `anon`
  as well as `authenticated` (`0035` line 150). The table it writes is
  append-only and the payload is a `jsonb` the client supplies. So anyone
  holding the anon key, which every visitor's browser holds, can write
  unbounded arbitrary rows into it. `0152` records the grant as deliberate
  and gives the reason; what nobody has established is what stops a person
  writing a million rows, or writing rows attributed to somebody else.

  This is not a disclosure. `0035` grants `select` to `authenticated` behind
  a read-own policy, so nobody reads anyone else's. It is an integrity and
  cost problem: the table feeds GAUNTLET's telemetry, and telemetry a student
  can forge is telemetry nobody should tune balance against.

  TWO. `GAUNTLET_VOLUME_TOL_PCT` has four copies, in `0034`, `0036`, `0061`
  and `src/lib/gauntlet/authoring.ts`, plus the VBA macros outside this repo.
  The document says they drift silently and nothing checks them. Volume is
  GAUNTLET's correctness signal, so a drift here silently changes what counts
  as a correct part.

  Deliberately excluded: `docs/GAUNTLET.md`, owned by prompt 0060; the
  `gauntlet_practice_meter` naming defect, which lives in `CLAUDE.md` and an
  immutable migration comment; and `0158`'s missing apply-order record.
