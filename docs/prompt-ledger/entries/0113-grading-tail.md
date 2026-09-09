# 0113 The grading tail: levelShort's stale-short rung, and one serialized round trip

- Issued: 2026-09-09
- By: Mr. Pina, closing the residual 0106 reported and did not fix, plus the one
  `loadItemWork` finding ledger 0107's loading audit left for a lane that could
  hold `transports.ts`.
- Owns: `src/lib/classroom/assignment-spec.ts` (the `levelShort` function ONLY),
  the `loadItemWork` call site in `src/lib/classroom/transports.ts` (that call
  site ONLY, not either file), `tests/dom/rubric-descriptor-round-trip-mount.test.ts`,
  `tests/classroom-leveled-rubrics*`, `docs/prompt-ledger/entries/0113-*`, and its
  own `docs/history/` entry.
- Migration permitted: no. Claims: none.
- Lands on: `integration`, in order behind 0106.
- Status: issued
- Branch: `claude/rubric-descriptor-save-bug-rtbqud`.
- Notes: resumes from 0106's branch (`claude/rubric-descriptors-save-bug-4zg5hv`,
  sha `1fcbe84a`) rather than from `main`, because
  `tests/dom/rubric-descriptor-round-trip-mount.test.ts` is a file 0106 wrote and
  exists only there. 0106 landed the save path; what is left is the READ path's
  third rung, which can still show an instructor a sentence they just edited away.
  Five lanes are live elsewhere (0108 root layout/`vite.config.ts`/`ThemeRoot`/
  `profile.ts`, 0109 `docs/standards` and `docs/decisions`, 0110 tournaments,
  0111 feedback, 0112 the maps viewer); none overlaps this ownership.
