---
title: "The sweep now checks what only the sweep can see: a migration number or a standards version two unmerged branches both hold, and one parser of `Migration permitted:` instead of two (`claude/sweep-cross-branch-visibility-xo9yz1`, no migration)"
date: 2026-09-06
branches: [claude/sweep-cross-branch-visibility-xo9yz1, claude/number-allocation-standards-oe4utb]
migrations: []
subsystems: ["Tooling", "Testing", "Migrations", "Standards"]
---

Prompt 0088. Started from `origin/main` at `5b3e14b`, in `/home/user/idea-app`.
`origin/integration` was 86 behind and 0 ahead, exactly as the prompt said, so
`main` is the trunk and nothing was taken from `integration`. Git identity was
ALREADY configured in the container (`Claude <noreply@anthropic.com>`), so the
"Please tell me who you are" failure the prompt warns about never arose and
nothing was set. No migration was written and none was applied; production was
not reached.

## The premise that was false, and what it decided

The prompt asks in A4 to read `parsePermitted` in `tools/migration-claims.mjs`.
**That file does not exist on `origin/main`, and neither does that symbol** --
`grep -rl parsePermitted` over the whole tree at `5b3e14b` returns nothing.
Neither do ledger entries 0084 through 0087, nor
`docs/history/number-allocation-standards-oe4utb.md`, which A2 asks to be read
verbatim. All of it is on `origin/claude/number-allocation-standards-oe4utb`,
which is **0 behind and 8 ahead of `main`** and carries 0084's tool, 0084's and
0087's ledger entries, and both history entries.

That is not an aside. It is this bundle's subject, arriving before the bundle
started: a branch cannot see another branch, and the prompt describing that
defect was itself written from a tree that could not see the branch it
describes.

**So this branch merged `origin/claude/number-allocation-standards-oe4utb` into
itself** (`--no-ff`, clean, no conflicts) after committing its ledger entry and
before doing any other work. The alternative was to re-create a 736-line tool
and a 500-line test file from scratch on `main`, which would have put a THIRD
parser of one format in the repository, written by a third lane that could not
see the other two. `main` was not touched and nothing was merged to it.

## A1: every per-branch gate `integrate.yml` applies today, in loop order

The loop is one `for ref in $(git for-each-ref ... refs/remotes/origin)` over
every remote ref, filtered to `claude/*`. In order:

1. **CI conclusion** (`ci_conclusion`, cut at `ci_gate_marker`, defined at 818
   and called at 1512 as of this edit -- and a line number in this repository is
   a thing that moves, which is the point of the note below). Reads the newest COMPLETED CI run for
   that exact sha in that exact repository, out of a `gh api` payload.
   **Fails toward SKIPPING**: no run, an unreadable payload, or jq refusing the
   input all reduce to `unknown`, which is not `success`.
2. **`ledger_gate`** (cut at `ledger_gate_marker`, **defined at 224-427**).
   Reads every `docs/prompt-ledger/entries` file the branch ADDED since it
   forked from `origin/main`, at the branch tip, and holds the branch if any
   `Status:` bullet in any of them reads `issued`. **Fails toward SKIPPING**:
   no merge base, or an added path that yields no blob, both hold the branch.
   The skip call site is at **1525**.
   - 0084's note pointed at "line 1108" for this skip. Prompt 0087 reported
     that pointer had already moved; it has moved again since, which is why
     both this entry and the workflow's own comments name it by function.
3. **The cross-branch gate** (new here; see below). **Fails toward MERGING.**
4. **Containment** -- `git merge-base --is-ancestor "$ref" HEAD`, and where it
   holds, `contained_delete_gate` (cut at `contained_delete_marker`) decides
   DELETE or skip. It refuses `main`, `integration`, `$TARGET` and any
   non-`claude/` ref before it looks at containment at all, and tests
   containment only against refs already on the remote.
5. The merge itself, with `auto_resolve` (cut at `auto_resolve_marker`) as the
   one mechanical resolution, for exactly two files.

After the loop, and not per branch: `counts_refresh`, `target_push_gate` and
`merged_suite` (prompt 0075's suite on the merged tree).

## A2: 0084's carried-forward YAML, and what it cost to follow

`docs/history/number-allocation-standards-oe4utb.md` section B6 carries it
verbatim: a `Read contested migration numbers` STEP with `id: claims` running
`node tools/migration-claims.mjs --json` piped through an inline `node -e`
that walks `contested[].holders[].branch` into a `contested_branches` step
output, plus a `case " ${CONTESTED_BRANCHES:-} " in *" $branch "*)` skip in the
loop and a matching `env:` line.

**It still applies to the file as it stands** -- its three anchors
(`fetch-depth: 0`, the `CI_WORKFLOW_FILE` env block, `ledger_gate` between its
markers) are all where it says. **Three things were changed and each is a
correction rather than a preference:**

- **A separate `run:` step cannot fail toward merging.** As pasted, a `node`
  that throws fails the STEP, which fails the JOB, which stops the sweep
  entirely -- the exact opposite of the direction 0084 argued for and worse
  than the stall it was avoiding. The read moved into the merge step's own
  shell, where a non-zero producer leaves an empty table.
- **A separate step cannot be proved.** Every gate in this file is a function
  between markers precisely so `tools/integrate-gate-proof.sh` can cut the
  characters GitHub executes and run them against throwaway repositories. A
  YAML step is outside that entirely, and B4 requires the proof.
- **The shell must not parse JSON.** `--contested-branches` was added to the
  tool so there is one reader of its output rather than an inline `node -e`
  in a workflow nobody tests.

## A3: the version collision, and that nothing could have surfaced it

**18 files under `docs/standards/` carry a `**Version X.Y - DATE**` header**;
`README.md` and `REGISTER.md` do not. A session bumps one by editing that line
and adding a changelog row.

**Reconstructed on the two real tips.** `origin/main` and
`origin/claude/number-allocation-ledger-c30ms5` fork from a base whose header
reads `**Version 4.20 - 2026-09-05**`. Both sides write
`**Version 4.21 - 2026-09-06**`, with DIFFERENT changelog rows -- main's "A
session applies its own migrations now", the branch's "Five number collisions
in two days". `git merge-tree --write-tree` on those two tips gives a merged
blob whose **line 2 reads `**Version 4.21 - 2026-09-06**` with no conflict
marker anywhere near it**; the file's single conflict hunk is 2519 lines away,
in the changelog.

**Nothing in git could have surfaced it, and this is a property of the merge
algorithm rather than a missing option.** A three-way merge whose two sides
made the IDENTICAL change to a line has, by definition, nothing to report:
there is no `--conflict-on-identical`, no `merge.conflictStyle` and no strategy
option that reports one, and both `ort` and `recursive` behave the same way.
The version test cannot see it either: it compares a file's header to its own
changelog and to its REGISTER row, all three of which were internally
consistent on both sides -- and `IDEA_instructions.md` is EXEMPT from the
header-vs-changelog half anyway, structurally, because its changelog is
date-keyed rather than version-keyed. So: nothing did, and nothing would have.

Case 82 of the proof harness reproduces exactly this on a throwaway pair and
reads the merged blob back, so the claim is executed on every run rather than
recorded here.

## A4: the two parsers, and the eight places they disagreed

Measured, not read: both were run over all **82** committed ledger entries and
their answers compared field by field.

`parsePermitted` (`tools/migration-claims.mjs`) strips the
`Highest on origin/main at issue:` clause first, then applies, in order:
explicit `Claims:`, a recorded outcome (`NONE TAKEN`/`NONE WRITTEN`, then
`TAKEN`/`TOOK`), an intent (`exactly one, NNNN` with the digits immediately
after the comma), then `^no\b`, then `unspecified`.
`ledgerPermission` (`tools/apply-migration.mjs`) applied `^no\b` and nothing
else, then scanned for the first four digits BEFORE the "Highest" clause.

**Prompt 0066's measurement was 66 entries, 42 refusing and 24 permitting, with
the partition `^no\b`.** Both implemented that partition; the corpus is 82 now.
`parsePermitted` implements it as its LAST rule rather than its only one, which
is the whole of the difference. Neither reads the `Claims:` field 0087 added the
same way: `parsePermitted` treats it as rule 2 and wins outright on it;
`ledgerPermission` never saw it as a field at all -- it happened to agree on
0088's own entry only because that line also begins `no.`.

**Eight disagreements, in three shapes, and this side was wrong in all three:**

- **3x a recorded outcome, and these change a VERDICT.** 0049, 0058 and 0064
  each end `NONE WRITTEN` / `NONE TAKEN`. `^no\b` reads the first word only, so
  all three read as PERMITTING a migration their own author recorded not
  writing.
- **4x a `TAKEN` number dropped.** 0038, 0063, 0071 and 0072 name the file they
  actually wrote AFTER the "Highest at issue" clause; the split discarded
  everything after it, so the number came back null on exactly the entries that
  state it most precisely.
- **1x a PROMPT number read as a migration.** 0073 reads "exactly one, the file
  0072 wrote". `ledgerPermission` returned `0072`.

That last one is the case `parsePermitted`'s own doc comment was written for,
and **the comment named the wrong entry** -- it said 0083 and 0069, and 0083's
line reads `no.` and names nothing at all. Corrected in the same edit.

## B3: which parser survived, and the positive control

`parsePermitted` survives and `tools/apply-migration.mjs` imports it;
`ledgerPermission` is now a thin caller that owns only the SHAPE its callers
read (`number` zero-padded, because it is compared against a filename, where
`0176` and `176` are not the same thing). The direction is forced:
`migration-claims.mjs` imports node builtins only, and `apply-migration.mjs`
imports `pg`, so the reverse would put a database driver on the claims tool's
import path.

All eight disagreements now resolve to `parsePermitted`'s answer. The three
verdict flips go toward REFUSING, which is the safe direction for a gate whose
only job is to ask whether anybody asked for this migration -- and they are
historical: at the moment a session would actually run the apply, its own line
still reads "at most one, number taken at commit time", because the
`NONE TAKEN` clause is appended at the END.

`tests/apply-migration-trace.test.ts` carried the old behaviour as an
expectation (`'... NONE WRITTEN: x', true, null`); it is corrected in place with
the argument beside it.

**POSITIVE CONTROL, EXECUTED TWICE.** Mutating `parsePermitted` and running both
suites:

| mutation | `tests/migration-claims.test.ts` | `tests/apply-migration-trace.test.ts` |
| --- | --- | --- |
| baseline | 31 passed | 29 passed |
| the `NONE TAKEN` rule disarmed | **1 failed**, 30 passed | **2 failed**, 27 passed |
| the intent regex loosened to reclaim a prompt number | **2 failed**, 29 passed | **1 failed**, 28 passed |

Both mutations redden BOTH suites, which is what "they share it" means. The file
was restored from a `cp` copy and md5-verified (`971797844bd134d05ad6ae3cc3d18820`),
never with `git checkout --`.

## B1/B2: one table, two producers, one lookup

Between `# cross_branch_marker:begin` and `:end` in `integrate.yml`:

- `contested_number_rows` shells out to `node tools/migration-claims.mjs
  --contested-branches`.
- `standards_version` reads a document's header at a ref (first twelve lines
  only, no `head` and no awk `exit` -- either would SIGPIPE `git show` under the
  step's `pipefail` and report a missing header on a document that has one).
- `contested_version_rows` walks every `origin/claude/*` ref, takes the
  `docs/standards` files it changed against `origin/main`, and keeps those whose
  header MOVED off main's.
- `cross_branch_gate` is the single lookup both producers feed.

**The collision is `same version, different bytes`, and that precision is
load-bearing.** Two branches can hold one version string legitimately -- B
merged A, or both merged a third -- and in every such case the BLOB is
identical, so the merge is a no-op. Comparing blobs gets that exactly right in
one `git rev-parse`; an ancestry check would have reported both sides of a
shared third branch as a collision. Case 83 is that control.

**Two filters on the number half, and both are arithmetic rather than taste.**
`contestedBranches` counts only `claude/**` holders, and only DISTINCT ones.
`collect()` deliberately reports the WORKING TREE as a holder -- on the sweep
runner that working tree is `integration` mid-merge, so without the first
filter every number `integration` carries would read as a second holder and
skip the branch that wrote it. Without the second, one lane holding a number by
both a file AND a ledger entry -- the ordinary shape -- is two holders and skips
itself. Both are pinned as tests.

**Placement**: after the CI and ledger skips, before the containment check, as
0084 specified. A branch already in `$TARGET` cannot be named by either producer
anyway (`origin/integration` is a LANDED ref to the claims tool, and a merged
version is byte-identical), so the position costs nothing and keeps every
surprise in this loop leaving a branch standing rather than deleting it.

**It fails toward MERGING and says so out loud.** Each producer's failure leaves
its own half of the table empty and appends to `cross_note`, which the summary
prints as **A cross-branch check did not answer**. Silence is the thing this
must not do: a gate that fails toward merging is invisible in every other line
of the summary, so a run with a broken tool reads exactly like a run where
nothing was contested. `tests/workflows.test.ts` asserts the two else-branches
contain `cross_note+=` and contain none of `exit `, `continue`, `skipped+=` or
`return 1`.

## B4: the proof, all cases executed

`tools/integrate-gate-proof.sh` extended (not forked) to **93 cases, 93 passed,
0 failed**, up from 81. Each new case builds a throwaway repo under `mktemp -d`
with a real bare remote and two real `claude/**` branches, and the migration
half copies the REAL `tools/migration-claims.mjs` in and runs it, so the cases
prove the pair rather than a stub agreeing with itself.

The five the prompt names, plus three controls:

| case | observed |
| --- | --- |
| 76. the workflow builds the table, calls the gate, reports a failed read | yes |
| **77. two branches claiming migration 0002: BOTH skipped** | `SKIP SKIP` |
| 78. ...and each reason names the tool that says which branch | `yes yes` |
| **79. two branches taking DIFFERENT numbers: both merge** | `MERGE MERGE` |
| **80. two branches bumping one standards file to 4.21: BOTH skipped** | `SKIP SKIP` |
| 81. ...and each names the OTHER branch, the file and the version | `yes yes` |
| 82. ...and git merges those two tips SILENTLY, header and all | `4.21 no-conflict-marker both-edits-present` |
| 83. one branch carrying the other's bump, byte-identical: both merge | `MERGE MERGE` |
| **84. two branches bumping DIFFERENT files to the same string: both merge** | `MERGE MERGE` |
| **85. the claims tool cannot run: the number read REPORTS FAILURE** | `reported` |
| **86. ...and both contesting branches MERGE rather than stalling the queue** | `MERGE MERGE` |
| 87. NEGATIVE CONTROL: renamed markers cut nothing | `empty` |

The bold rows are the prompt's five. Case 82 is the one worth keeping: it reads
the merged blob back out of `git merge-tree` and confirms the header line
carries no marker and both lanes' edits survive, so A3's central claim is
executed rather than asserted in prose.

**The fixture's forty paragraphs are not padding.** A two-line standards fixture
conflicts on the body, and case 80 would then pass while proving something else
entirely. Lane A edits paragraph 5 and lane B paragraph 35, which is the
ordinary shape and the one in which git merges the whole file clean.

## What was measured

- **`tools/migration-claims.mjs --json`: 0.170s / 0.183s / 0.174s** over three
  runs in this container, against 0084's 0.708s on a different machine. The
  version sweep is a tree read over 18 files times the number of outstanding
  branches; both together are milliseconds against `merged_suite`'s **283s**.
- **`npm test`: 309 files, 6282 tests, 0 failed, 283.24s.** Run at
  **04:29:13-04:33:57 PDT on 2026-09-06**. Prompt 0087 left `main` at 309 files
  and 6274 tests; the eight new tests are this bundle's.
- **`svelte-check`: 0 errors, 37 warnings in 20 files**, breakdown **31**
  `state_referenced_locally` / **5** `css_unused_selector` / **1**
  `perf_avoid_nested_class` -- the recorded baseline exactly. Re-derived with
  `npx svelte-kit sync` after exporting the two `PUBLIC_SUPABASE_*` placeholders,
  per `CLAUDE.md`'s own note about the 13 phantom errors.
- **`tests/derived-numbers.test.ts`: 18 passed.** No route spec was added, so no
  counts regeneration was needed (B7).
- Two positive controls on `tests/workflows.test.ts`'s new placement assertion
  (a failed read made to record a skip; the summary line disarmed): each
  reddens it. `integrate.yml` restored from a `cp` copy and md5-verified.

## Not verified

- **The live Supabase project was not reached and no migration was applied.**
  This bundle wrote no SQL. `MIGRATION PERMITTED: NO` was honoured.
- **Neither workflow was RUN.** `integrate.yml` is executed by GitHub from the
  DEFAULT BRANCH, so nothing here takes effect until it is on `main`, and no
  run of it can be observed from this container. What is proved is the exact
  text between the markers, cut and executed by `tools/integrate-gate-proof.sh`;
  the call sites, the pre-pass and the summary line are asserted structurally by
  `tests/workflows.test.ts` and by harness case 76, which is the same division
  of labour every other gate in this file has.
- **The gate has never seen a real contest.** Nothing is contested on the remote
  today: `node tools/migration-claims.mjs --contested-branches` prints nothing
  over all 28 branches. Both halves are exercised only against fixtures.
- **`tools/migration-claims.mjs` IS NOT ON `main` TODAY.** Until it lands, the
  number half of this gate will report "did not answer" on every run and
  everything will sweep -- which is the designed direction and is the whole
  reason it was built that way, but it means the gate's first real runs will
  exercise only the version half.
- **No browser pass.** Nothing here renders.

## Deferred

- **`ci.yml`'s optional fetch**, section 2 of 0084's carried-forward YAML: one
  `git fetch --depth=1 origin '+refs/heads/claude/*:refs/remotes/origin/claude/*'`
  so the contiguity assertion can see claims on a branch sitting below a number
  another lane holds. `ci.yml` is not this bundle's to touch, and 0084 called it
  optional: without it CI is merely STRICTER than a local run, which is the safe
  direction.
- **The `Migration permitted:` FIELD is still extracted twice** --
  `permissionLine` in `apply-migration.mjs` (a `-` bullet, first match, no
  continuation) and `parseEntry` in `migration-claims.mjs` (`-` or `*`, with
  continuation lines). Measured over the committed corpus they agree on every
  entry, and the prompt scopes this bundle to the permitted-line PARSER rather
  than the field extractor. It is a second copy and it is the next one to go.
