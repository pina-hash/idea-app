# 0219 IDEA_VERIFICATION_ADDENDA.md 2.7: the race that killed a mutant, and a fixture with an unwritten expiry date

- Issued: 2026-09-13
- By: router chat
- Owns: `docs/standards/IDEA_VERIFICATION_ADDENDA.md`, `docs/standards/REGISTER.md`,
  `docs/prompt-ledger/entries/0219-*`, and its own `docs/history/` entry. NO OTHER
  FILE. Ledgers `0213` and `0216` have branches in flight touching
  `tools/deploy-probe.mjs` and `deploy.yml`; neither was touched.
- Migration permitted: no. **Claims: none.**
- Status: pushed
- Branch: `claude/adoring-curie-hj7vpm`, branched from `origin/integration` at
  `9b010f53` (which `origin/main` also sat at when this session started, so
  branching from integration and working on the harness-assigned branch were the
  same commit).
- Notes: **The duplicate check ran three ways and all three came back clean.**
  (1) `docs/prompt-ledger/entries/` on the local tree, `git ls-tree -r
  origin/integration` and `git ls-tree -r origin/main` all carry no `0219-*` file.
  (2) Every remote ref was swept (`git for-each-ref` over `refs/remotes/origin`,
  `git ls-tree -r <ref> -- docs/prompt-ledger/entries`, `docs/standards`, and a
  branch-name grep): no ref carries a `0219` ledger, standards edit, or branch
  name. (3) `git log --all --oneline | grep -i 0219` matches nothing. This bundle
  claims no migration number, so it collides with none of the claimed-not-landed
  set either.

  `git fetch --unshallow origin` ran clean (the checkout was already shallow;
  this pulled full history and every branch ref). `git fetch origin integration`
  confirmed `origin/integration` at `9b010f53d1f4...`, identical to `origin/main`
  at the same commit -- both parents of this session's work are one ref right
  now. **Committer identity check:** `git config user.name`/`user.email` read
  `Claude` / `noreply@anthropic.com`; the attribution this session was given
  names `Claude Sonnet 5 <noreply@anthropic.com>` as the `Co-Authored-By:` line
  and does not ask for a `user.*` config change, so the commit below carries the
  trailer rather than touching git config.

  **Fetched the file with a clone, never `curl`.** `git clone --depth 1 --branch
  main https://github.com/pina-hash/idea-app /tmp/idea-app-freshclone` and
  diffed both owned files against the working tree: byte-identical, so the
  freshness authority and the working copy agreed before a line was written
  (`IDEA_VERIFICATION_ADDENDA.md` 2.6, dated 2026-09-13, landed by ledger `0205`
  and merged onto both refs by ledger `0215`).

  **The two rules, both ledger `0213`'s (2026-09-13), neither restated as this
  bundle's own work.** Rule 42: a mutant killed by a race proves nothing.
  `npm test` passes `--no-file-parallelism` because the database test files
  share one embedded-Postgres cluster; `0213`'s mutation script first ran the
  bare `npx vitest run`, measured 4 failures from cluster contention, and the
  same 33 tests passing when run serially. Its own first mutation pass -- eleven
  mutants killed, zero survivors -- had been measured under the racing
  invocation and was discarded rather than reported, because a kill and a flake
  produce the same red line and only the invocation says which happened. Rule
  43: a premise true when written can have an expiry date nobody wrote down.
  `0213`'s fixture named migration `0211` as the one `tools/idea-status.py`
  could derive no probe for, on the strength of the seed file's own header;
  `origin/main` moved mid-session, picked up `0211`, and both directions of the
  paired test inverted at once because the fixture's premise had quietly
  expired. The fix was not to re-point at a different migration carrying the
  same fact today -- that only re-hides the same expiry date under a new
  number -- but to synthesise the no-probe migration: a planted commit off
  `origin/main` carrying one extra file, isolating the probe-derivability row as
  the only thing that changes between the exit-3 and exit-0 runs.

  **Version and register, in the same commit.** Header bumped 2.6 -> 2.7,
  changelog entry added citing ledger `0213` by number, date and both measured
  results (4 failures / 33 passing; both test directions inverting on `0211`).
  Header re-read against the newest changelog entry before committing: both say
  2.7. `REGISTER.md`'s row moved to 2.7 in the same commit, and all 20 rows were
  re-checked against their own files' version headers in both directions --
  **zero mismatches**, consistent with ledger `0215`'s prior sweep finding the
  same. No other register row or standards file was touched.

  **Suite and svelte-check, off `origin/integration`, read from the summary
  line rather than the exit code.** `npx svelte-kit sync && npx svelte-check`:
  **0 errors, 37 warnings in 20 files** -- the documented baseline, unmoved,
  because this bundle touches no `.svelte`/`.ts` source. `npm test`: **460 test
  files passed (460), 8737 tests passed (8737)**, 568.96s, including
  `tests/standards-version-header.test.ts` and `tests/claude-md.test.ts` green
  inside that run. No browser pass: nothing under `src/` changed.

  **No migration, so the six-item checklist governs the merge to `main`, per
  `IDEA_instructions.md` and the prompt's own explicit permission.** This
  branch merged onto `integration` cleanly at `a456ec47`; `integration` moved
  once more before the checklist was checked (ledger `0216`,
  `claude/kind-euler-vlt4u7`, landed on top at `caef1c07`), so the checklist
  was re-read against the tip at checking time rather than at branch time.
  `git diff --name-only origin/main..origin/integration --
  supabase/migrations/` returned nothing at check time: no migration is in
  range at all (`0211` through `0213` are already on both refs from ledger
  `0215`'s earlier merge), so item 5 is N/A rather than settled by the prior
  verification. **Item 4 failed as the prompt said it would**:
  `node tools/deploy-probe.mjs --ref origin/integration` exited 1,
  `DEPLOY_PROBE_URL` unset as a repository secret, "cannot confirm" rather
  than a pass. This bundle stops there and does not merge `integration` into
  `main`. The full checklist, item by item, is in the history entry.
