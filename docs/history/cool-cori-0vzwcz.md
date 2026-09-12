---
title: "The merged-tree suite gate has never once returned a verdict: one missing `svelte-kit sync` made `unrun` its only reachable answer, and the proof harness was modelling a function the workflow did not have (`claude/cool-cori-0vzwcz`, no migration)"
date: 2026-09-11
branches: [claude/cool-cori-0vzwcz]
migrations: []
subsystems: ["CI", "Tooling", "Documentation"]
---

`integrate.yml` grew a safety net on 2026-09-06 (`21a21954`): after the sweep merges
every green `claude/**` branch into `integration` and pushes, it runs the whole suite on
the tree it just built, so a merged tree that fails while both parents were green is
reported with its failing assertions named. It has never returned a verdict. Not once.

`merged_suite()` runs `npm ci` and then `npm test`, and nothing between them runs
`npx svelte-kit sync`. A runner's checkout has no `.svelte-kit` -- it is gitignored, and
`npm ci` does not write it -- so vitest dies in dependency optimisation before a single
test body executes, names no test, and the function's own `findings` comes out empty. The
branch that exists for "a suite that never got to a test body" then fires, every time, on
every tree.

Four lanes diagnosed this independently on 2026-09-11 -- ledgers 0141, 0150, 0158 and
0159 -- and 0150 reproduced it locally. This bundle is the fix.

## The reproduction, done first and on this container's own checkout

The container started with no `node_modules` and no `.svelte-kit` at all, which is the CI
condition exactly rather than an approximation of it.

- `npm ci` -- 15.5s, clean.
- `npm test` -- **exit 1**, printing
  `[RESOLVE_ERROR] Could not resolve 'node:module' in \0rolldown/runtime.js ... Tsconfig
  not found`, then `run-tests.mjs: no JSON report was written -- vitest did not complete a
  run to report on.`
- The two numbers that decide the verdict, counted off the ANSI-stripped log with the
  function's own two greps: **0 `FAIL` lines, 0 `Tests` summary lines.** So `findings` is
  empty and `merged_suite` prints `unrun the suite exited 1 without naming a failing test`
  and returns 2, whatever the tree contains.
- `npx svelte-kit sync` -- 2.5s -- and the same tree runs
  (`tests/workflows.test.ts`, 59 passed).

**And it was confirmed in production rather than inferred from the code.** Integrate run
34626597503 (2026-09-11 17:16Z) emits both of its `::error::` lines:

> the suite could not be run on the merged tree -- the suite exited 1 without naming a
> failing test. Every merge above was still pushed and nothing was lost.
>
> 1 branch(es) conflicted with integration and were left untouched. integration ITSELF WAS
> PUSHED and is not blocked -- this run is red for that reason as well as for anything the
> suite found.

That is the whole consequence in two sentences somebody wrote months ago: the gate reports
failure and the work goes through anyway. Every lane that day took its CI reading from a
hand-dispatched `ci.yml` run instead, which is what "people stop reading it" looks like in
practice.

**`ci.yml` never hit this** because it runs `npm run check` -- which IS
`svelte-kit sync && svelte-check` -- as a step before its own suite. Two workflows running
"the same" suite differed by one generated directory, and only one of them generated it.

## The fix is one line, and the header above it is the reason it is only one

```
npx svelte-kit sync >&2 || printf 'svelte-kit sync failed on the merged tree; the suite below will report what that costs\n' >&2
```

The function's header states properties that a larger edit would have put at risk, and
each was preserved deliberately:

- **Its stdout IS its verdict.** The caller reads it through `$(merged_suite)`, so the
  sync's output goes to STDERR. This is not tidiness: a `tee` to stdout put several
  hundred reporter lines ahead of the verdict line on this function's first run, the
  caller read an empty verdict, and a red tree was reported as skipped.
  `tools/integrate-gate-proof.sh` case 61 caught it.
- **It never exits**, so no caller can lose a merge to it. The line added introduces no
  new exit and no new `return`.
- **Three verdicts, `unrun` distinct from `red`.** Unchanged.

**IT DIFFERS FROM DECISION 21's PROPOSAL IN MECHANISM, AND THAT IS SAID HERE RATHER THAN
LEFT TO BE FOUND.** The entry proposed treating a sync failure "the way an `npm ci`
failure is already treated (return 2)". The line carries no guard of its own: a failed
sync is reported to stderr and left to the suite, which then reaches no test body and is
answered by the `unrun` branch that already exists for exactly that shape. **The return
code is 2 either way**, and case 72a measures it. What a caller loses is the more specific
sentence; what it costs is one suite run before the same answer. Keeping it to one line
was the instruction and it is also the safer trade, because every additional path through
this function is a path that can print on the wrong stream.

## The harness was proving a function the workflow did not have

This is the part worth reading twice, because the harness was already green on all three
verdicts while the real gate had one reachable answer.

`tools/integrate-gate-proof.sh` cuts `merged_suite` out of the workflow between markers
and runs the REAL text against throwaway repositories with a stub `npm` on PATH. Cases 61
(green), 63 (red, with the failing file named) and 70/71 (unrun) all passed before this
bundle. They passed because the stub `npm test` ran regardless of any generated directory
-- so the harness modelled a toolchain in which the missing sync costs nothing, and the
defect was invisible to the one instrument built to see it.

**The stub now mirrors the real thing.** `npm ci` REMOVES `.svelte-kit` (a fresh checkout
has none, and this is also what keeps each case independent of the one before it); a new
`npx` stub's `svelte-kit sync` is the only thing that creates it; and `npm test`
reproduces the startup error's SHAPE -- non-zero, no `FAIL` line, no `Tests` line -- when
it is absent.

**And the control is the real one, not a restatement.** Cases 72c and 72d cut the same
region a second time with the `npx svelte-kit sync` line DELETED, source it over
`merged_suite` inside a subshell so the genuine function is untouched, and re-run the two
trees cases 61 and 63 tell apart:

| tree | with the line | without it |
| --- | --- | --- |
| one branch, merged tree sound (case 61) | `green` | `unrun` |
| two green parents, merged tree broken (case 63) | `red`, 1 finding named | `unrun` |

Without the line a green tree and a red tree are indistinguishable and neither names a
thing. Case 72b guards the control itself: the `grep -v` must remove **exactly one** line
or the harness aborts, so a control that silently removed nothing cannot pass for one that
worked. Case 72a covers a sync that genuinely fails (`fx_sync_fails`).

**98 of 98 cases pass, exit 0**, with no environment help.

## A SECOND DEFECT, FOUND WHILE DOING IT, THE SAME SPECIES, AND NOT WHAT THE PROMPT SENT ME FOR

Cases 80 and 81 -- the standards-version half of the cross-branch gate -- stood **RED on
`origin/integration`**. Measured on a pristine worktree of it before anything here was
changed: **91 passed, 2 failed, 93 of 93 cases.** So it is not this bundle's.

The cause is not the gate. The harness sources the cut cross-branch text under `set -u`
and never supplied `AGENT_BRANCH_PREFIXES`, which the workflow declares once in its
job-level `env:` at line 6. The region therefore aborted at its first use with
`AGENT_BRANCH_PREFIXES: unbound variable`, and the two cases downstream of it observed
`MERGE MERGE` where the real gate skips. **The standards-version contest gate was
unproven for as long as those cases were red** -- which is the other half of why a
standing failure is worse than no check: it hides the next real one, and here it was
hiding itself.

It is fixed by READING the value out of the workflow rather than writing a second copy of
it down, for the same reason the gate bodies are cut rather than copied: a second spelling
of the prefix list is one that stops agreeing with the file it claims to prove. A missing
or unparseable `env:` line is a FATAL, not a default.

## What `tests/workflows.test.ts` now pins, and the mutant that did not bite

Three findings were added to the `merged_suite` property check, because the regression is
silent in the exact sense that matters: the gate still runs, still reports, and still
turns the run red, so nothing on screen says its verdict is unconditional rather than
earned.

1. `svelte-kit sync` is present.
2. It runs AFTER `npm ci` (a sync before the install has no `svelte-kit` to run) and
   BEFORE `npm test` (a sync after it is a sync the suite never saw).
3. Its output does not go to stdout.

**Four mutants, against the real file, restored from a saved copy and md5-verified each
time -- never `git checkout --`, which discards uncommitted work to HEAD and would have
taken this session's own edits with it.**

| mutant | reddens |
| --- | --- |
| the sync line deleted | yes, "no longer runs `svelte-kit sync`" |
| moved above `npm ci` | yes, "no longer runs after `npm ci`" |
| moved below `npm test` | yes, "no longer runs before `npm test`" |
| its `>&2` removed | **NO, at first** |

The fourth is the one worth recording. The assertion read the whole line for a redirect,
and the line's `|| printf ... >&2` fallback arm has a `>&2` of its own -- so a check
looking for "does this line redirect" was satisfied by the branch that runs only when the
sync FAILED. It now reads only up to the `||`, and the mutant reddens. A mutation suite in
which one mutant quietly survives is the same failure shape as the harness above: an
instrument agreeing with itself.

## Decision 21 stays OPEN, deliberately

`docs/decisions/entries/21-integrate-tests-after-it-merges.md` asks whether the
merged-tree suite becomes a GATE on the push or stays the report it is today, and in
particular what return code 2 should do. **This bundle does not answer that**, and the
entry's own text is why: it names the sync fix as a PREREQUISITE that has to go first,
and reasons that shipping a fail-closed gate while return code 2 was the permanent state
would have blocked every lane in the repository, immediately and indefinitely.

The entry gains a section recording that the prerequisite landed, how the implementation
differs from its proposal in mechanism but not in outcome, the second defect found on the
way, and what remains. `Status` is untouched.

**One thing named there rather than assumed: no Integrate run has yet reported a real
verdict.** `workflow_run` runs the copy of the workflow on the DEFAULT BRANCH, so the
first real verdict cannot arrive until this lands on `main`. Until one does, the claim
that the gate now speaks rests on the cut-text proof and the local reproduction.

## `CLAUDE.md`, two paragraphs

**The svelte-check baseline was stale and was re-derived here rather than copied from the
prompt.** With the two `PUBLIC_SUPABASE_*` values exported and `svelte-kit sync` run
first: **0 errors, 40 warnings in 22 files**, breaking down as **34
`state_referenced_locally`, 5 `css_unused_selector`, 1 `perf_avoid_nested_class`**. The
file said 37 at 31/5/1. That matches ledger 0161's independent measurement to the number,
which is the third time this line has drifted and been caught by two sessions measuring
separately -- so the drift sentence in the file now records the third occurrence too. The
drift is entirely `state_referenced_locally`, 31 to 34, and predates this branch.

**The no-`.env` phantom figure was measured as well and is STILL CORRECT**: 14 errors
across 11 files, unchanged. It was left alone rather than edited, which is the answer a
measurement deserves when it agrees.

**The `claude/red-merge-green-parents-ft3e57` sentence is corrected.** It said the
merged-tree suite change was "sitting unmerged" on that branch. It landed on `main` in
`21a21954` on 2026-09-06 -- five days before this bundle read the sentence -- and the
branch's tip `ef5e6a16` is contained in both `main` and `integration`. A paragraph
describing a pending change becomes a false one the moment somebody lands it, which is the
same failure mode the paragraph's own closing sentence warns about, so the correction
says so.

`node tools/claude-md-check.mjs` agrees with the tree.

## Verification

Baselines were read off `origin/integration` at branch time (`7c45d30c`), not taken from
`CLAUDE.md`.

- **`tools/integrate-gate-proof.sh`: 98 of 98 cases, 0 failed, exit 0**, with no
  environment help (`env -u AGENT_BRANCH_PREFIXES`). Baseline on a pristine worktree of
  `origin/integration`: **91 passed, 2 failed, 93 cases** -- the two being the
  `AGENT_BRANCH_PREFIXES` defect described above.
- **`npm test`: 389 of 390 files passed, 7600 of 7604 tests, 382.52s.**
- **THE FOUR FAILURES ARE INHERITED AND THAT IS MEASURED, NOT ARGUED.** All four are in
  `tests/grant-surface.test.ts` -- assertions A, B, C and the non-empty-surface guard --
  and are the `0201` IdeaCAD grant hole that ledgers 0159 and 0161 each documented
  independently. Run on a pristine worktree of `origin/integration` with the same node
  modules and a fresh `svelte-kit sync`, that file reports **4 failed | 11 passed (15)**,
  identical to this branch. Structurally it could not be otherwise:
  `git diff --name-only origin/integration...HEAD` is **0 files under `supabase/` and 0
  under `tests/`** other than `tests/workflows.test.ts`, which that file does not read.
  Ledger 0161 carries `0202`, which fixes it.
- **`svelte-check`: 0 errors, 40 warnings in 22 files** (34 / 5 / 1), re-derived here after
  exporting the two `PUBLIC_SUPABASE_*` values and running `svelte-kit sync`. With no
  `.env` at all the same tree reports **14 errors** across **11** files and the same 40
  warnings, which is the documented phantom and is unchanged.
- **`node tools/claude-md-check.mjs`**: agrees with the tree.
- **`tests/workflows.test.ts` and `tests/claude-md.test.ts`: 84 passed.**
- **`npm run history:verify`**: the split is lossless.
- **`npm run verify:browser` was deliberately NOT run** -- this bundle touches no file
  under `src/`, on the prompt's own instruction.

## NOT MERGED TO `main`, AND THE GATE THAT STOPS IT IS NOT THIS BUNDLE'S

The prompt permitted a merge against the six-item checklist because this bundle carries no
migration. **`integration` does.** Reported with the command and the answer:

1. `git merge-base --is-ancestor origin/main origin/integration` -- **exit 0, MET.**
2. This branch is **NOT** contained in `origin/integration` yet -- **UNMET**, and only the
   Integrate sweep or a person can change that.
3. Not reached.
4. `node tools/deploy-probe.mjs --ref origin/integration` -- `DEPLOY_PROBE_URL is not set,
   so production's applied set cannot be read. This is "cannot confirm", never "applied".`
   **CANNOT SAY, which is never a pass.** Ledger 0114's substitution does NOT rescue it
   here: that substitution rests on the range carrying no migration, and
   `git diff --name-only origin/main origin/integration -- supabase/migrations/` returns
   **two** files, `0199_classroom_html_instructor_write_gate.sql` and
   `0201_ideacad_blade_editor.sql`.
5. **UNMET, and this is the real stop.** `0201` is reported APPLIED by nothing. Ledger
   0159 established it is unapplied on production and that its own header says "Deploy
   migration first"; it drops and re-adds
   `classroom_items_assignment_schema_version_check` to admit `4`, while
   `ideacad_set_editor` writes `4`. Merging would deploy, mid-school-day, a client
   offering a teacher an editor whose every attach raises a CHECK violation against ten
   `ideacad_*` functions that do not exist. Ledger 0161 additionally established the file
   should not be applied as written, and carries `0202` as the repair.
6. Not reached.

**So this is ledger 0159's stop, still standing, for a reason entirely outside this
bundle.** Two of six unmet is two too many; the branch is pushed and left for the sweep.

**And `https://ideabosco.com/` is unreachable from this container** in any case --
`curl: (56) CONNECT tunnel failed, response 403`, which the agent proxy records as
`connect_rejected`, "gateway answered 403 to CONNECT (policy denial or upstream failure)".
That is an organization egress denial to report rather than route around, so even a
permitted merge could not have been followed by reading the deploy stamp. **Any deploy of
this change is UNCONFIRMED from here.** This is the fourth session to find that
reachability differs per container; it should be checked first, every time.

## Left undone, by name

- **`CLAUDE.md` line 2302 still says "its usual 0 errors and 37 warnings".** It is inside
  the SvelteKit `+server.ts` export trap, describing a specific past EXPERIMENT
  ("with `export const helperTable = { a: 1 }` appended, svelte-check reported..."), and
  it is a third paragraph this bundle was not given. Changing the number there would
  claim a measurement nobody took; the honest repair is to re-run that experiment and
  record what it says now. **It does contradict the corrected baseline** and is flagged
  rather than edited.
- **`claude/inspiring-planck-gp601z` conflicts with `integration` on one file** and is
  red on its tip (`6539b75e`, CI run 34588864626), so it never reaches the merge attempt
  and is not the branch in the error above. It carries migration `0200`. Not this
  bundle's.
- **The reordering half of decision 21.** Open, and Mr. Pina's.
- **`classroom-updates.json` takes no entry**: nothing a student sees changes.
- **`npm run verify:browser` was NOT run**, on the prompt's own instruction: this bundle
  touches no file under `src/`.
- **`https://ideabosco.com/` is unreachable from this container** -- `curl: (56) CONNECT
  tunnel failed, response 403`, recorded by the agent proxy as `connect_rejected`,
  "gateway answered 403 to CONNECT (policy denial or upstream failure)". That is an
  organization egress denial to report, not route around. So no deploy can be confirmed
  by reading the stamp from here, and this container is in ledger 0140's and 0159's
  position rather than 0146's.

## Reported, not fixed: `claude/notebook-ui-theme-overhaul-0gnx0f`

The prompt asked for a reading and a recommendation, and explicitly not a deletion. None
was made.

**What is true of it, measured rather than taken from an entry:**

- It conflicts with `origin/integration` across **TEN** files (`git merge-tree
  --write-tree`): the 0119 ledger entry add/add, four `src/lib/notebook/*`, two
  `tests/notebook-*`, and three under `tools/browser-verify/`. The prompt said nine.
- **It is the "1 branch(es) conflicted" in every Integrate run.** Sweeping all 45
  `claude/**` and `codex/**` refs, exactly two conflict with `integration`; the other,
  `claude/inspiring-planck-gp601z`, is RED on its tip and is skipped by the CI gate before
  any merge is attempted. `0gnx0f` is GREEN on its tip `30adfd77` (CI run 34412425196) and
  its ledger reads `pushed`, so it passes both gates, is attempted, and conflicts -- on
  every run, forever.
- **Its work WAS harvested, and that is verified against this tree rather than believed.**
  Ledger 0122 records that prompt 0119 was issued once and run twice, that
  `claude/notebook-ui-theme-overhaul-t3dc3a` won by arriving first, and that four things
  were brought across from the loser BY CONTENT rather than by merge. All four are present
  here: the per-pane scroll keyed on a prop (`scroll="fill"` in `NotebookView.svelte`), the
  pinned pane head over a scrolling body, the compose actions pinned to the pane's foot
  (`.nb-foot`, "Pinned at the foot of the frame"), and the plate picker reading
  `<html data-theme>` through a `MutationObserver` in `notebook-theme.svelte.ts`.
- **What was NOT brought across is named, reasoned and rejected on measured grounds** in
  `docs/history/notebook-theme-reconcile-wo0u8a.md`: its BAR (144px at 375 against the
  landed head's 112px at 1440, which carries the Next check-in and drafts chips the bar
  would have taken with it) and its `.list-title` count. Neither was deferred; both were
  declined.

**The recommendation: archive it as a tag, then delete the branch.** The residual value of
the ref is close to zero -- everything wanted was harvested, and the two things left were
rejected with numbers -- while its cost is a permanent red mark on every Integrate run and
a branch list that overstates the in-flight queue by one lane that is not in flight.
Deleting outright is the one thing to avoid: 0122's own record calls its diff "the only
copy of the work not brought across", and a deleted remote branch's objects are eventually
collected. A tag keeps the objects forever and is invisible to `integrate.yml`, which
sweeps `refs/remotes/origin/*` filtered by `AGENT_BRANCH_PREFIXES` and never sees a tag:

```
git tag archive/0119-notebook-ui-theme-overhaul-0gnx0f 30adfd77558acdc5d0428ab028776f6e092926e8
git push origin archive/0119-notebook-ui-theme-overhaul-0gnx0f
git push origin --delete claude/notebook-ui-theme-overhaul-0gnx0f
```

0122 said "deleting it is not this bundle's call" and left it standing. It is not this
bundle's call either.
