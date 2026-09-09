# 0116 Measure the nine unmeasured tournament routes, then land

- Issued: 2026-09-10
- By: Mr. Pina, after prompt 0115 stopped on a red `integration` rather than
  merging it.
- Owns: `tools/browser-verify/README.md` IN FULL (both generated regions),
  `docs/prompt-ledger/entries/0116-*`, its own `docs/history/` entry, the merge
  of `integration` into `main`, and the reconciling merge of `main` into
  `integration`. It owns NO other source file.
- Migration permitted: no. Claims: none.
- Lands on: `main` (the merge itself) and `integration` (the regenerated region
  and the reconciling merge).
- Status: pushed
- Branch: `claude/migration-0192-verification-0dqhto`, branched from
  `origin/integration` at `6ae630fe`.
- Notes: **THE HARNESS REISSUED PROMPT 0115'S BRANCH NAME**, so the
  `docs/history/` filename cannot follow `CLAUDE.md`'s branch-slug rule: that
  file already exists, written by 0115 and already on `integration`. The rule's
  own justification is that a branch name cannot be taken twice, which makes the
  slug collision-free BY CONSTRUCTION; here it was, so the construction does not
  hold. This entry's record is at
  `docs/history/measure-the-nine-and-land.md`, and the departure is stated
  there rather than left for a reader to find.

  **WHY THIS BUNDLE EXISTS.** `integration` is RED.
  `tests/derived-numbers.test.ts` fails because the measured region of
  `tools/browser-verify/README.md` was captured at
  `277e76a02262ec54bd78d8f9bb82d7279d74b225` on 2026-09-09T12:47:32.035Z, and
  its `covered` array names 8 of the 17 `tournaments-view-*.mjs` specs now on
  the branch. Verified independently on 2026-09-10 before any work: 156 real
  specs on disk (158 files less the two `_`-prefixed shared modules, which are
  not specs), 147 covered, and the nine absent are the list page (3), the team
  states (4), the team registration (1) and the registration-open TV state (1).
  The arithmetic closes exactly: `runsMeasured` 294 + 9 x 2 widths = 312, which
  is the static region's own `runs`. Prompt 0110 regenerated this region twice
  and it is still nine short, so a pass has NEVER covered them.

  **THIS IS A MEASUREMENT, NOT A FORMATTING FIX, AND THAT IS THE POINT.** Nine
  routes have never been measured at either width. If the pass finds rows
  outside threshold on them, that is a REAL FINDING and this bundle reports it
  and does NOT land: no widened threshold, no deleted spec, no hand-edited
  region. The two standing outside rows are the `/dev/notebook` toolbar
  tap-reach rows at 375 and 1440 (decision 12, with the owner). Anything else
  is new.

  **THE HARNESS BOOT**, measured by prompts 0110 and 0111 and the reason both
  lost hours: the harness's own Vite boot takes 180 to 187 seconds cold on these
  containers against a 180 second window, so it fails about half the time and
  the failure reads as a hang. Vite is therefore started separately on port
  5199, the probe route warmed with a long timeout, and the harness left to
  reuse the running server (0111 measured a reused server answering in 50ms).
  And `pkill -f <pattern>` matches the shell running it and kills the very
  command it is meant to protect; 0111 lost two builds to that, so any cleanup
  here is port-based or by recorded pid.

  The run must be over a CLEAN COMMITTED TREE with nothing else touching it: the
  region records a `dirty` flag and a dirty run is not evidence.

  **GATE 4 SUBSTITUTION. THERE ARE NOW TWO ON RECORD AND THEY DO NOT GENERALISE
  TO EACH OTHER.** `node tools/deploy-probe.mjs` cannot pass here --
  `DEPLOY_PROBE_URL` is unset and the probe fails closed, where `CANNOT SAY` is
  never a pass. It is run anyway and reported verbatim. Ledger 0114's
  substitution rests on its range holding NO migration. Ledger 0115's, which is
  the one this bundle inherits, rests on Mr. Pina having applied `0192` BY HAND
  in the Supabase SQL editor on 2026-09-10 and reporting the migration's own
  verification query returning `members 10, entries_without_members 0,
  register_overloads 2, wide_form_has_no_defaults true, host_guard_admin_aware
  true, ledger_member_column true, anon_cannot_join true` -- every value
  matching that file's own expected set. **This container cannot reach the
  production database and verifies none of those seven values.** They are a
  person's transcription and are recorded as such.

  **OUTCOME OF THE MEASUREMENT.** The pass ran on a clean committed tree
  (`dirty: false`, sha `18b1d33`) with Vite pre-started on 5199 and reused
  (`server boot 834ms`): **312 route/width runs, 5238 measurements, 156 of 156
  specs covered, 796.0s**, selftest 70 controls / 0 failures. The nine
  previously unmeasured routes came back CLEAN -- 18 runs, HTTP 200, 0 rows
  outside threshold, 0 console errors. **The only two rows outside threshold in
  the whole run are the known standing ones**: `/dev/notebook` `tap-reach`
  toolbar text controls at 375 and at 1440 (decision 12, with the owner).
  Nothing was widened, no spec deleted, no digit hand-edited; only the measured
  region moved, the static region already agreeing with the tree.

  `tests/derived-numbers.test.ts` is GREEN, 18 passed. Full suite **344 files /
  6760 tests, 0 failures** (the brief's 343 + 1 file and 6751 + 9 tests are
  prompt 0115's `tournament-pair-recipients`, swept in by `integrate.yml`).
  `svelte-check` 0 errors / 37 warnings at 31/5/1. `npm ci` left
  `package-lock.json` untouched.

  The landing follows; its gate record is carried in the merge commit to `main`,
  which is the durable place for it, and the deploy is confirmed by READING
  production rather than from push output.
