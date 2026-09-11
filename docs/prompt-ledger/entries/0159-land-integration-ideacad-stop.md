# 0159 Land `integration` into `main`: STOPPED on migration `0201`, unapplied and unlisted

- Issued: 2026-09-11
- By: a landing session, carrying no source change of its own. It did not land:
  `integration` gained a migration outside this bundle's permitted set while the
  session was reading the range, and the prompt's own rule makes that a stop.
- Owns: the merge of `integration` into `main` (NOT PERFORMED), the reconciling
  merge of `main` into `integration` (NOT NEEDED),
  `tools/browser-verify/README.md` if a merge had conflicted inside its
  generated regions (NO MERGE WAS ATTEMPTED, so it was never opened),
  `docs/prompt-ledger/entries/0159-*` and its own `docs/history/` entry. NO
  OTHER SOURCE FILE, and none was written.
- Migration permitted: `0193` through `0199`, all seven hand-applied to
  production and reported verified; I verified none of the values myself (see
  Notes). `0201_ideacad_blade_editor.sql` is in the range and is in NEITHER the
  permitted set NOR the named `0200` exclusion, which is the stop.
- Claims: none.
- Lands on: nothing. `main` is unmoved at `dcbb741ef5c17de347be154daef88eed9cec9211`.
- Status: issued
- Branch: `claude/determined-planck-ifkqxn`, branched from `origin/integration`
  at `43a71b2d`.
- Notes:

  **DUPLICATE CHECK, CLEAN, BOTH HALVES.** No
  `docs/prompt-ledger/entries/0159-*` existed on any ref: every
  `refs/remotes/origin/*` was swept individually with
  `git ls-tree -r --name-only <ref>` filtered to
  `prompt-ledger/entries/0159`, and the sweep returned nothing on any of them.
  It was re-run after `git fetch --unshallow` brought in
  `origin/codex/execute-instructions-from-ideacad.md`, which the first sweep
  had not seen, and returned nothing again. No `claude/**` or `codex/**`
  branch carried a 0159 ledger commit and nothing else: every such branch's
  `git diff --name-only origin/integration...<branch>` was tested for being
  entirely under `docs/prompt-ledger/`, and none was. `git log --all
  --grep=0159` returned two commits, both of which say `0159` meaning
  MIGRATION 0159 (`c2669201`, "Migration 0159, to be applied by hand";
  `8cf256a3`, "A world carrying 0135, 0159 and 0193") and neither of which is
  a ledger entry.

  **THE THREE OPENING CHECKS, REPORTED AS ASKED.** `git fetch --unshallow
  origin` succeeded -- `git rev-parse --is-shallow-repository` answers `false`,
  with 2127 commits reachable from `origin/main` and 2132 from
  `origin/integration`. `git fetch origin integration` succeeded. `git config
  user.name` -> `Claude`, `user.email` -> `noreply@anthropic.com`.

  **THE STOP: `0201_ideacad_blade_editor.sql`, AND IT ARRIVED MID-SESSION.**
  At the branch point (`origin/integration` `43a71b2d`) the range held exactly
  one migration, `0199_classroom_html_instructor_write_gate.sql`, which is
  permitted. Roughly forty seconds later PR #92
  (`codex/execute-instructions-from-ideacad.md`, ledger 0145, the IdeaCAD Blade
  editor) was merged to `integration` by Mr. Pina, moving it to `87ba98a3`, and
  `git diff --name-only origin/main...origin/integration --
  supabase/migrations/` then returned TWO lines:

  > supabase/migrations/0199_classroom_html_instructor_write_gate.sql
  > supabase/migrations/0201_ideacad_blade_editor.sql

  `0201` is not in `0193`-`0199` and is not the named `0200`, so it is the
  prompt's "any other unlisted migration is also a stop". **It is also
  unapplied on its own account**, which is why the stop is a real one rather
  than a bookkeeping one. Its own header, quoted:

  > -- 0201: IdeaCAD Blade editor data model. Apply manually in the Supabase
  > SQL editor, after 0197.
  > -- DO NOT APPLY FROM THE SESSION CONTAINER. This environment cannot reach
  > production and must not try.
  > -- Deploy migration first: the client writes schema 4, while pre-migration
  > clients fail soft.

  **"DEPLOY MIGRATION FIRST" IS THE WHOLE COST OF MERGING ANYWAY.** `0201`
  drops and re-adds `classroom_items_assignment_schema_version_check`, widening
  it from `(1,3)` to `(1,3,4)`, and `ideacad_set_editor` sets
  `assignment_schema_version = 4`. Production's constraint still admits `(1,3)`.
  So a merge to `main` deploys, mid-school-day, a client that offers a teacher
  an editor whose every attach raises a CHECK violation, against ten
  `ideacad_*` functions and four `ideacad_*` tables that do not exist. This is
  the ordering rule in `CLAUDE.md`'s DEPLOY ORDERING section, in its
  non-additive form: the migration is applied by hand FIRST and the deploy
  follows.

  **`0200` IS NOT IN THE RANGE, AND THAT CHECK PASSED ON ITS OWN TERMS.**
  `supabase/migrations/0200_classroom_presence.sql` exists on exactly one ref,
  `refs/remotes/origin/claude/inspiring-planck-gp601z`, swept across every
  remote ref. It is not on `integration` and not on `main`. The stop is `0201`
  alone.

  **WHAT WAS VERIFIED BEFORE THE STOP, SO THE NEXT LANE NEED NOT REDO IT.**
  `git merge-base --is-ancestor origin/main origin/integration` answered YES at
  `43a71b2d` and again at `87ba98a3`, so loop step 1 was a no-op because it was
  true, not because it was skipped -- no reconciling merge of `main` into
  `integration` was needed or made. `git merge-tree --write-tree origin/main
  origin/integration` exited 0 and emitted a single tree oid (`d5b98dd7`) with
  zero conflict messages at `43a71b2d`. Both ledger entries new on
  `integration` read `pushed`: 0145 (`- Status: pushed`) and 0156
  (`- Status: pushed, NOT merged -- carries a migration`), read out of
  `origin/integration` itself rather than from a working copy.

  **CI WAS DISPATCHED TWICE, BOTH TIMES ON A FULL FORTY-CHARACTER SHA**, and
  the second is the one that speaks for the current tip. Run **34625147207**
  carries `inputs.ref` `43a71b2d7e940e203de284de12f2645dfa3f4e31`, dispatched
  before the PR #92 merge landed; run **34625280462** carries
  `87ba98a3adaa469cf996757520efcaaa3b4b8b3d`. Both runs' `head_sha` field
  records `87ba98a3` -- that field follows the BRANCH named in the dispatch,
  while `actions/checkout` uses `inputs.ref`, so the two runs test different
  trees despite reporting the same `head_sha`. Neither is gating anything here,
  because the stop is upstream of gate 2; they are dispatched and reported so
  the lane that resolves `0201` inherits a reading rather than starting one.

  **GATE 4 SUBSTITUTION, NAMED, AND THE PROBE REPORTED VERBATIM.**
  `node tools/deploy-probe.mjs` cannot pass here -- `DEPLOY_PROBE_URL` is
  unset -- and its exit 1 is not treated as a stop, per ledger 0115's
  substitution:

  > deploy-probe: DEPLOY_PROBE_URL is not set, so production's applied set
  > cannot be read. This is "cannot confirm", never "applied".
  > (exit 1)

  Gate 4 rests instead on `0193` through `0199` being hand-applied to
  production and reported verified, with `0199`'s verification given as:
  `instructor_save_arities` 1, `save_reads_manifest` 1, `save_reads_block` 1,
  `helpers_present` 2, `anon_can_save` false, `authed_can_save` true,
  `anon_can_resolve` false, `authed_can_designate` true, and 0 for
  `items_carrying_both`, `ported_instructor_answers`, `ported_instructor_keys`
  and `selfcheck_leftover` -- every value matching the migration's own expected
  set. **I VERIFIED NONE OF THOSE VALUES MYSELF.** No session in this container
  can reach the production database, and the local `.env` is a placeholder
  project (`example-ref`). What I did verify is which migration files are in
  the range, which is the half a container can answer.

  **STEP 5 WAS NOT REACHED, AND WOULD HAVE BEEN BLOCKED ANYWAY. THE PROMPT'S
  PREMISE IS WRONG FOR THIS CONTAINER AND IS CORRECTED HERE.** The prompt
  states "Production IS reachable from these containers." It is not reachable
  from this one: `curl https://ideabosco.com/` answers
  `curl: (56) CONNECT tunnel failed, response 403`, and the agent proxy's own
  status endpoint records the denial rather than a transport fault --

  > {"ts":"2026-09-11T17:01:19.826Z","kind":"connect_rejected",
  > "detail":"gateway answered 403 to CONNECT (policy denial or upstream
  > failure)","host":"ideabosco.com:443"}

  -- which the proxy README classes as an organization egress policy denial to
  be reported and not retried or routed around. So this container is in ledger
  0140's position, not ledger 0146's. **A landing lane that must satisfy gate 5
  by reading the stamp should check `ideabosco.com` reachability FIRST**, since
  it is per-container and has now differed between three sessions.

  **NOTED IN PASSING, NOT ACTED ON, AND NOT MINE: `c44fb0e9` CARRIES A
  CHANGELOG SUBJECT THAT DESCRIBES SOMETHING ELSE.** It is Mr. Pina's own
  commit (`apina@boscotech.edu`), adds only `docs/prompts/0145-ideacad.md`, and
  its subject line reads "Update fmt.Println message from 'Hello' to
  'Goodbye'". Per `CLAUDE.md`'s "Commit subjects are user-facing changelog
  copy", the first line of every commit shows up on `/`. It is already on
  `integration` and rewriting history is not available, so this is a record for
  whoever lands it, not a defect this bundle can fix.

  **CONFLICT POLICY.** No merge was attempted in either direction, so nothing
  was resolved anywhere, and in particular nothing was resolved on `main`.
