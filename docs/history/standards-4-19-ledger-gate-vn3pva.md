---
title: "Standards 4.19 and Handoff 1.3 to the mirror, and the ledger status gate that makes a standing branch mean something again (`claude/standards-4-19-ledger-gate-vn3pva`, no migration)"
date: 2026-09-02
branches: [claude/standards-4-19-ledger-gate-vn3pva]
migrations: []
subsystems: ["Standards", "CI", "Tooling", "Documentation"]
---

Two landing paths in one session, the shape 0005 used. Three standards files and
four register rows went straight to `main` in one commit (`4b3c77f`); the ledger
lifecycle, the gate, the proof harness and the workflow-validity test ride this
branch. Nothing in `src/` moved, and no migration was written or permitted.

## What the bundle was actually for

A branch count had stopped measuring the queue and nothing noticed for a day.
`integrate.yml` deletes a `claude/**` branch when its CI goes green, and
`docs/prompt-ledger/README.md` requires a session to commit its ledger entry as
its FIRST commit. So the sweep merges and deletes a branch minutes into a session
that is still working. On 2026-09-02 both prompts in flight read as zero standing
branches and a router chat nearly took the queue as empty.

The fix is three parts and all three landed: the doc rule (prompts in flight come
from the ledger across every ref, never from the branch list), the `Status`
lifecycle on an entry, and the gate in `integrate.yml` that reads it.

**No fifth state was invented.** The first draft of 4.19 reached for
`in-progress`; the four states `docs/prompt-ledger/README.md` already defines
(`issued`, `pushed`, `in-integration`, `deployed`) carry this exactly, with the
session's own final commit making the `issued -> pushed` transition. That is not
an exception to the README's "never advance a status on the strength of a report"
rule, and the README now says why: a session reporting on itself at the only
moment it can be certain is the same evidence `git ls-remote` would give.

## Four of the prompt's own claims were wrong, and the tree won

Worth recording because three of them were about the state of `integration`.

- **`integrate.yml` is byte-identical on `origin/main` and `origin/integration`.**
  The prompt said 0005 had added a comment block to the `integration` copy only.
- **`deploy.yml` is on `main`, not only on `integration`.**
- **`integration` has already been merged into `main`**: `git rev-list --count
  origin/main..origin/integration` is 0, and `integration` is an ancestor of
  `main`. The prompt was written expecting the opposite.
- The `ci.yml` schedule at 04:30 UTC and its `workflow_dispatch` are real, and are
  on `main` for the same reason.

The consequence for the closing note is the opposite of what the prompt expected,
and it is stated in the report: a person still has to merge `integration` into
`main` once this branch is swept, but that merge is the only thing standing
between the gate and taking effect, not a second one after it.

`tools/idea-status.py` needed nothing. 0005 had already made section
`[0a] PROMPTS IN FLIGHT` read `docs/prompt-ledger/entries/` across `origin/main`,
`origin/integration` and every `origin/claude/**` ref, deduping by id and
preferring the most advanced status. It was not touched.

## The gate, and the defect that only appeared because the bundle did its own bookkeeping

**The first design ranked the changed entries and let the highest-numbered one
decide. It merged its own still-running branch.** `git diff --name-only
origin/main...$ref` reports entries the branch introduced OR MODIFIED, and
advancing another session's `Status` is exactly the bookkeeping the ledger README
asks for. Commit `9937505` on this branch advanced 0005, 0006 and 0010 to
`deployed` after reading each artifact on `main`. 0010 outranks this session's own
0007, so the gate read `deployed`, never looked at 0007's `issued`, and returned
MERGE. Measured on the real branch, with the gate extracted from the workflow and
run against HEAD.

Nothing about that was hypothetical or seeded: the bundle's own B3 step produced
it, and an adversarial verification pass found it before it shipped.

**So an ADDED entry decides and a modified one decides nothing.** A session's own
entry is its first commit, which makes it an ADD against the merge base
(`--diff-filter=A`). Every added entry is asked and one `issued` among them holds
the branch. That deleted the ranking entirely, and with it two more defects the
same pass found: two entries sharing an id had been resolved by whichever slug
sorted last, and an added `0007=issued` beside an added `0012=pushed` merged a
running session.

**Reading the diff with `-z` silently reinstated the bug, and the warning is the
tell.** Bash command substitution DROPS NUL BYTES, so `added="$(git diff ... -z)"`
collapses the whole list to one unusable record and the gate falls through to
MERGE. It announces itself (`warning: command substitution: ignored null byte in
input`) and is otherwise invisible. The list is read with
`mapfile -d '' -t < <(...)` instead, with git's own exit status riding back as a
final NUL record so a diff that FAILED stays distinguishable from one that found
nothing.

Six more ways the gate failed OPEN, each found by adversarial review, each now
under a harness case with the pre-fix gate as its control:

- **CRLF.** Python's `.split()` splits on `\r` and bash's `read` does not, so
  `- Status: issued\r` was `issued` to `tools/idea-status.py` and `issued` plus a
  carriage return to the gate. `.gitattributes` records `core.autocrlf=true` on
  the authoring machine, so a CRLF blob is not exotic.
- **A non-ASCII filename.** `git diff --name-only` C-quotes any path with a
  non-ASCII byte, so `0012-café.md` arrived as `"docs/.../0012-caf\303\251.md"`
  and matched nothing. Slugs are hand-written from prompt titles.
- **Punctuation.** `issued;`, `"issued"`, `issued)`, `(issued`, `issued:`,
  `-issued` and `issued!` each merged a live session's branch when only `.` and
  `,` were stripped.
- **Bullet shape.** `  - Status: issued`, `* Status: issued` and
  `- **Status**: issued` all merged.
- **First-occurrence-wins.** A Notes line quoting another entry's `Status: pushed`
  masked the real `issued` below it. Every bullet is read now, which fixes that
  direction and accepts the other one (an entry that quotes the word `issued`
  holds a finished branch until somebody looks).
- **A value folded onto the continuation line.** `- Status:` with `issued` on the
  next line reads as `issued` to `tools/idea-status.py` and read as EMPTY here.
  This is the one shape in which the gate's own "strict superset" claim was false,
  and it is the direction that costs a running session its branch. It needs a line
  of lookahead, so the extraction is `awk` and not `sed`.

**The normaliser is a strict superset of `tools/idea-status.py`, deliberately, not
an accidental disagreement.** Every value that tool reads as `issued`, the gate
reads as `issued`; the gate additionally holds a few it would not. Reading one
shape too many costs a finished branch standing until somebody looks at it;
reading one too few costs a running session its branch. Only one of those is
recoverable. Verified against all nine real entries: 9 of 9 agree.

**The gate skips on exactly two things and merges on everything else.** An added
entry reading `issued`, and a surprise it cannot read past (no merge base with
`origin/main`; an added entry that yields no blob at the tip). No entry, no
`Status:` line, a free-text value, an unrecognised word and a MODIFIED entry all
merge exactly as they did before the gate existed.

## The proof cuts the gate out of the workflow rather than copying it

`tools/integrate-gate-proof.sh` extracts the text between
`# ledger_gate_marker:begin` and `# ledger_gate_marker:end` out of
`integrate.yml`, sources that exact text under the same `set -euo pipefail`, and
drives it against throwaway git repositories with real bare remotes under
`mktemp -d`. A harness holding its own copy of the rule is a harness that proves
its copy.

**27 cases, 0 failures**, and the count is asserted (`EXPECTED_CASES=27`) because
without it deleting every SKIP-direction case left `fail=0` and a green exit.
The four the prompt named:

1. an added entry saying `issued` is **SKIPPED**, naming it;
2. the same branch with that entry flipped to `pushed` is **MERGED**;
3. a branch introducing no entry is **MERGED** (and `main` deliberately holds an
   unrelated `issued` entry, so this doubles as the control for the derivation);
4. an entry with no `Status:` line is **MERGED**.

All four were EXECUTED, not reasoned about, along with 23 more.

**Two permissive mutations, restored byte-identically from `cp` backups.** Forcing
the skip condition true reddened every MERGE-direction case that has a status to
read; forcing it false reddened 13 SKIP-direction cases. Cases 3, 4, 21 and 22
correctly survive both, because they never reach the token comparison. `git
checkout` was never used to restore a mutant, per the rule that has cost three
sessions their own uncommitted work.

**The real `run:` block was executed end to end** against a fixture origin with a
stubbed `gh`, not just the function: the job summary read "Merged into integration
and deleted: `claude/finished`" and "Left alone: `claude/running` -- ledger entry
0007-mine.md still says its session is running", and `claude/running` survived on
the origin.

## `tests/workflows.test.ts`, and why it parses nothing it could import

Ported from `frc-app`'s `tests/workflows.test.js`, which exists because a
`deploy.yml` validated with PyYAML was rejected WHOLE by GitHub: a shell comment
inside a `run:` block carried an empty `${{ }}`, and GitHub evaluates expressions
inside `run:` regardless of the `#`. The outward signal was a failed run named by
the file's PATH rather than its `name:`, triggered by `push`, on a workflow
declaring only `workflow_dispatch`, with no job and no log.

**There is no YAML parser to use and one could not be added.** `yaml` appears in
`package-lock.json` only as an optional peer of vite, `js-yaml` appears nowhere,
and `package.json` is not this bundle's to edit. So the reader is a purpose-built
subset reader over the raw text, and it says so in its own comments the way the
frc-app original says it is not GitHub's validator. It answers one question: where
a `run:` scalar's body starts and stops.

**Both directions of the comment rule are the whole point.** Outside a block
scalar a `#` line is a YAML comment and is skipped; inside one it is literal shell
text and is kept, because that is exactly where the real defect lived. Measured on
this repo: ZERO empty interpolations in any `run:` body, and exactly TWO raw
`${{ }}` occurrences, both YAML comments under a step's `env:` explaining why a
typed input and a branch name are read through env. A raw-text scan reports those
two as defects; a scan that only parses YAML reports nothing. Both are wrong, and
the test pins both directions.

**Checked against a real PyYAML parse of all three workflows and matched body for
body: ci 6, deploy 5, integrate 2.** Re-run that if the reader is touched;
`python3 -c 'import yaml'` works in the cloud container.

### The force-push check was wrong twice, and the second one is the interesting one

CLAUDE.md says verbatim: "Never force-push `main`. Not `--force`, not `-f`, not
`--force-with-lease`." The ported regex caught only the long form. Planted into the
real `ci.yml`, `git push -f origin main`, `git push origin +main:main` and
`git push --force-with-lease="refs/heads/main:$sha"` each left the whole suite
green.

Fixed, and then **the fixed version was defeated by a backslash**. The scan read
physical lines and required `git ... push` and the force spelling on the same one,
so `git push origin \` followed by `--force main` is one command that neither line
matches. Measured: the whole suite green at 27 passed with a real force-push to
`main` planted in `ci.yml`. The scan folds shell logical lines first now (an odd
number of trailing backslashes continues; an even number is an escaped backslash),
and reports the line the command STARTS on.

All five spellings plus the backslash pair now redden, one at a time, planted into
the real `ci.yml` and restored byte-identically each time (md5
`6b15b42f46e9b3a9d686732c91f12a81` before and after). `integrate.yml`'s
lease-pinned branch DELETE, the one legitimate force in this repo, still passes.
The control ran the other way too: the pre-fix file passed 27 of 27 with the
backslash force-push in place.

Two more, from the same pass:

- **The `continue-on-error` gate detector failed open**, reproducing one level up
  the exact failure its own comment warns about: it required `id:` within 120
  characters before `continue-on-error:`, so a gate written the other way round,
  or with a `uses:`/`with:` block between, was never collected. It reads per STEP
  now.
- **One control passed vacuously.** `a shell parameter expansion is not mistaken
  for an interpolation` asserted `toEqual([])` with no proof the body was read at
  all, so breaking the reader left it green while three siblings reddened. It
  asserts the body first now, and every other `toEqual([])` in the file was
  re-audited the same way.

**The denominator is per file and uses the sweep's own predicate**, which is why
`integrate.yml` counts 3 `git push` lines and not 2: the third is the prose inside
the conflict-summary `echo`. A denominator that quietly excluded it would stop
measuring the thing above it.

**The marker contract is pinned from the test side**, which is what makes the
proof harness reachable at all: it cannot be an npm script, because `package.json`
is not this bundle's, so renaming `# ledger_gate_marker:begin` would otherwise
break the proof silently until somebody ran the script by hand.

## Ledger statuses advanced, on the artifact and not on the report

Three entries moved to `deployed`, each confirmed by reading `origin/main`:

- **0005**: `deploy.yml`, `tools/idea-status.py`, `tests/derived-numbers.test.ts`,
  `tools/browser-verify/readme-counts.mjs` and `docs/decisions/` all present; its
  branch gone.
- **0006**: its `Status` read "partly landed. Its MIGRATION is on `origin/main`;
  its client half is not on any ref this session can see", which was true when
  written and is not now. `src/lib/feedback/screenshot.ts`,
  `tests/feedback-tried-and-screenshot.test.ts`,
  `tests/db/feedback-tried-screenshot.test.ts`, ten `screenshot` references in
  `FeedbackConsole.svelte` and `0170_feedback_tried_and_screenshot.sql` are all on
  `main`. Leaving that line as it stood would have told the next chat the client
  half was missing.
- **0010**: the counts block on `main` reads the corrected 66 / 37 / 132, its
  history entry is there, its branch is gone, `tests/derived-numbers.test.ts`
  passes.

**This is the one thing the session did outside the prompt's stated owned-file
list**, which named only `docs/prompt-ledger/entries/0007-*`. Phase B3 explicitly
directed the normalisation; the list did not anticipate it. It is recorded here
rather than left for somebody to find in a diff. It is also, directly, what
exposed the gate's blocking defect.

## Measured

- `svelte-check`: **0 errors, 37 warnings**, breakdown 31 `state_referenced_locally`
  / 5 `css_unused_selector` / 1 `perf_avoid_nested_class`. Re-derived after
  `svelte-kit sync` with the two `PUBLIC_` values exported, per the phantom-error
  rule.
- `npm test`: **231 files, 4778 tests, all passing** (4751 before; this file adds
  27).
- `npm run history:verify`: the split is lossless.
- `bash tools/integrate-gate-proof.sh`: **27 passed, 0 failed**, 27 of 27 expected.
- `integrate.yml` diff against `origin/main`: **insertions only, zero deletions**.
  `TARGET=integration`, the triggers, `permissions`, `concurrency`, the
  merge-main-first step, the delete lease and the deploy-branch refusal are
  byte-identical, proved by reverse-applying the patch and comparing hashes.
- Zero `${{ }}` interpolations inside any `run:` block.
- Zero em dashes in every file touched.

## Not verified, stated rather than left silent

- **The gate has never run on GitHub.** Everything above is the extracted text run
  locally against fixtures and against this repository's own refs. `workflow_run`
  runs the DEFAULT-BRANCH copy of the workflow, so the gate does nothing until a
  person merges `integration` into `main`. Until then the live gateless workflow
  would sweep this very branch mid-session, which is the failure the bundle is
  about.
- No Vercel preview was opened; nothing in `src/` changed, so there is no rendered
  surface to check.
- No browser pass (`npm run verify:browser`) was run, for the same reason.
- The live Supabase project was not touched and no migration was written.
- The `frc-app` claims in `IDEA_REPO_WORKFLOW_STANDARD.md` 1.1 were taken from that
  repo's committed `tests/workflows.test.js` header and its current workflow set,
  read from a shallow clone. The 2026-08-30 run of the retired workflow was not
  re-confirmed against that repository's Actions history.
