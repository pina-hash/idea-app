# 0168 The measured counts region loses races: make the merge additive

- Issued: 2026-09-12
- By: router chat
- Owns: `tools/browser-verify/README.md`, whatever under `tools/browser-verify/` writes its
  generated regions, `tests/derived-numbers.test.ts`,
  `docs/prompt-ledger/entries/0168-*`, and its own `docs/history/` entry. NO MIGRATION.
  NO FILE UNDER `src/`.
- Migration permitted: no. Claims: none. Highest on origin/integration at issue: 0202
- Status: pushed
- Branch: `claude/sharp-gauss-kp749m`, branched from `origin/integration` at `ebf23dc`
- Runs in parallel with: ledgers 0166, 0167 and 0169. None of their files is touched here;
  0163 owns `.github/workflows/integrate.yml` and this bundle does not write it.
- Notes: THE PROBLEM IS STRUCTURAL, NOT A BUG. The measured counts region of
  `tools/browser-verify/README.md` is a single shared write point that loses races. It went
  stale at least four times on 2026-09-11; two sessions each spent a ~17-minute browser pass
  fixing the same staleness and one was discarded as redundant when another lane landed an
  equivalent pass mid-run. It fails in the shape nothing warns about -- GREEN PARENTS, RED
  MERGE -- and `integration` takes no push-triggered CI run, so nobody sees it until a
  landing bundle dispatches one by hand. `docs/history/` already solved this with a
  one-file-per-entry split; the measured region has never had that treatment. Design the
  fix, argue for it, and prove it on the real case: two branches that each add a route spec
  and each regenerate, merged, BEFORE and AFTER. Do not widen or weaken
  `tests/derived-numbers.test.ts` -- it is the only thing that has ever caught this.

## Outcome

**Duplicate check, three ways, all clear.** (1) `git log --oneline
origin/main..origin/integration` at branch time -- ten subjects, all IdeaCAD
and its landing, none of them this work. (2) `tools/idea-status.py` read the
ledger across `origin/main`, `origin/integration` and every `claude/**` and
`codex/**` branch: 146 entries in flight, **no 0168**, highest anywhere 0165,
and every entry whose `Owns` names `browser-verify` reads `pushed`. A live
GitHub contents fetch of `docs/prompt-ledger/entries?ref=main` returned no
`0165+`. (3) A sweep of every remote ref for a `tools/browser-verify/measured/`
directory or any second writer of the generated regions: none exists on any
branch, so nobody had started this. `0163` owns `integrate.yml` and was not
touched; `0164` claims migration `0203` and this entry claims none.

**The three fetches and the identity check.** `tools/idea-status.py` from raw
(722 lines, md5 `e044d18ba0c9`); `docs/standards/REGISTER.md` from raw,
md5-identical to the local mirror (`bda5ad4d6d9a`); the ledger directory
listing live from the GitHub contents API on `main`. Identity read from the
session rather than asserted: configured `claude-opus-5`, last served
`claude-opus-5`, effort `high`, permission mode `auto`.

**Production reachability**, checked before the merge: `https://ideabosco.com/`
**200** in 0.52s and `https://apps.ideabosco.com/` **200**. `DEPLOY_PROBE_URL`
and `IDEA_MIGRATION_URL` are both UNSET in this container, so the applied set
is "cannot confirm" and never "applied" -- ledger 0114's gate 4 substitution
applies, the range carrying no migration.

**Outcome.** The measurement is one committed file per route spec under
`tools/browser-verify/measured/`; the rendered region is a pure function of
that directory, so `verify:counts` writes both halves in under a second and
`npm test` checks the block against the store with no browser. The defect was
reproduced first, in both its shapes, on real git repositories at `ebf23dc`
before a line was changed, and the same experiment on the fixed tree keeps
both lanes' measurements where the old shape lost one. One full
`verify:readme`: 388 runs, 6790 measurements, 0 outside threshold, 1032.6s --
the same numbers the region it replaces carried. Full suite 398 files / 7724
tests / 0 failures on the merged tree; `svelte-check` 0 errors / 38 warnings /
21 files. `docs/history/sharp-gauss-kp749m.md` carries the measurements.

**Reported, not fixed.** `CLAUDE.md`'s `svelte-check` baseline says 37
warnings; it is 38 at the branch point and 38 here. And
`tools/browser-verify/routes/presence-presence-off.mjs` (ledger 0152's) has a
positive control that races the roster's render -- the roster appears between
300ms and 700ms after `load` and the spec carries no wait -- so it reads
`present 0` where `integration`'s block records `outside: 0` on identical
code. Neither file is this bundle's surface.

**One follow-up after the merge.** The region's own heading still read
"Measured -- from a full harness run", which stopped being true the moment the
table became a sum over `measured/` -- an inaccuracy this bundle introduced,
in the one file whose whole subject is not lying about itself. It reads
"Measured -- summed from `measured/`, one file per route spec" now, landed on
the same branch and through the same gates.
