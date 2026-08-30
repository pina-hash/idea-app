---
title: "`npm run history:verify` is wired into CI, and both docs describing the entry shape are corrected to match"
date: 2026-08-29
branches: [claude/history-verification-workflow-qkjlzg]
migrations: []
subsystems: ["Documentation", "CI"]
---

`docs/HISTORY.md`'s worked example, and a `CLAUDE.md` paragraph that quoted it,
both still showed an entry body opening with a retyped `## <title>` heading --
the shape `derive-headings.mjs` (`1fbdf87`) removed a day earlier, when the
heading became derived from front matter's `title` instead of stored twice.
Following either document as written now produces a file
`npm run history:verify` refuses (`body still opens with a ## heading`), and
nothing caught that: the verifier ran in neither `npm test` nor
`.github/workflows/ci.yml`. Four sessions in a row had each individually
avoided touching another bundle's own entry file while `history:verify` sat
red for an unrelated reason (a still-warm case of the instructions themselves
being wrong), which is exactly the shape of failure a check should have caught
in the same push that introduced it and a document cannot.

## What changed

- **`docs/HISTORY.md`**: the "shape of an entry file" example no longer shows
  a `## ` line in the body. A short note explains the heading is derived and
  that `history:verify` refuses a retyped one.
- A short addendum right under the file's own "This file is a pointer" /
  "nothing is appended to it again" opening states, in words, that the
  never-edited rule is about the 35,000-line record body the split removed,
  not about this file's own instructions for writing an entry -- those are
  corrected in place like any other rule, and this is the correction. This is
  the "say so where you make the edit" the task asked for: the next reader of
  `docs/HISTORY.md` should not read this session's diff to it as the
  never-edited rule having been broken.
- **`CLAUDE.md`**: the parallel bullet under "Keeping the documentation
  current" used to justify NOT fixing `docs/HISTORY.md`'s stale worked
  example, on the strength of that same never-edited rule -- itself a second,
  wrong instance of the same misreading `docs/HISTORY.md`'s own addendum now
  corrects. It is rewritten to say the two docs are fixed and why the old
  reasoning did not hold.
- **`.github/workflows/ci.yml`**: a new `History record check` step runs
  `npm run history:verify`, `continue-on-error: true` like every other step in
  this job, folded into the same "fail the job if any step failed"
  aggregation. A comment beside it states the cost and the failure-mode
  analysis below, so the next person touching this file does not have to
  re-derive it.

## Why this shape is safe to gate a deploy on

`main` deploys `ideabosco.com` mid-class, so a check wired into CI has to
earn its place: it must be fast, and it must not be able to fail for a reason
that is not a genuinely malformed or drifted entry.

**Cost, measured locally:** `time npm run history:verify` -- 1.312s wall,
dominated by node startup; the script itself reads 224 committed markdown
files under `docs/history/`, reassembles the 168 `record-*.md` files in
`record_order`, and hashes the result. No embedded Postgres, no network call,
no browser. On the GitHub-hosted runner this job already boots (same runner
the 45s embedded-Postgres suite runs on), this step is not going to be the
slow part of the pipeline.

**Failure modes, read from `docs/history/_tools/verify-split.mjs` and
`front-matter.mjs` rather than assumed:**

- The structural checks (`readEntries` in `front-matter.mjs`, called on every
  `.md` file in `docs/history/` that does not start with `_`) throw on a file
  that does not open with a `---` fence, whose front matter never closes, or
  whose front matter is not followed by exactly one blank line -- i.e. on a
  genuinely malformed entry. Swept the directory: every one of the 224
  tracked files is a real entry (168 `record-*.md` plus 56 branch-slug
  entries); there is no stray README or non-entry markdown file under
  `docs/history/` for this to trip on by accident.
- The reassembly compares a sha256 of 168 entries' bodies (in `record_order`,
  with `## ${title}` synthesized back in) against a pinned constant. That
  constant does not move on its own; it only diverges if a `record-*.md`
  file's `title` or body content actually changes, or `record_order` breaks
  its 1..N contiguity, or the entry count moves from 168 -- all genuine
  drift.
- The one leg with an external dependency is the byte-for-byte `git show`
  against the pre-split commit (`ea9f043b6c`). It is wrapped in try/catch and
  is explicitly best-effort: on a shallow `actions/checkout@v4` clone
  (default `fetch-depth: 1`, which this workflow does not override) that
  commit is normally unreachable, and the script prints
  `git byte compare: unavailable (...)` and falls through to the sha256
  compare alone, exactly the path this session exercised running it locally
  without deepening the clone. The script only fails the run if **both** legs
  come back inconclusive (`neither reference was reachable: this run
  verified nothing`), which does not happen here because the sha256 compare
  always runs and always succeeds when the content is unchanged.

So the only way this new CI step goes red is a real defect in an entry file:
a retyped `## ` heading, a `title` that stopped matching a `record-*.md`
body, a broken `record_order`, a duplicate filename, or the reassembled body
itself differing from the pinned pre-split record. That is the exact case
this task needed caught and the exact case four prior sessions were reading
around by hand.

## Proof it fires

Copied `docs/history/gauntlet-practice-rate-limit-xm7ye3.md` to a scratch
file first (`cp`, read back with `md5sum` to confirm the copy matched before
touching anything -- never `git checkout --`, which restores from HEAD and
would have silently discarded any other uncommitted work in the tree).
Inserted a retyped `## <title>` heading plus a blank line right after that
entry's front matter, reproducing exactly the shape the corrected docs no
longer instruct. Ran `npm run history:verify`:

```
FAILED:
  - gauntlet-practice-rate-limit-xm7ye3.md: body still opens with a ## heading.
    The heading is derived from front-matter title now (see
    derive-headings.mjs) -- remove the retyped line, do not add a second copy
    back.
EXIT=1
```

Confirmed this is the same code path `git status` shows the CI step running.
Restored the file from the scratch copy (`cp` back, not `git checkout --`)
and confirmed the md5 matched the pre-mutation copy; `git status --porcelain`
showed no diff on that file afterward. Re-ran `npm run history:verify` clean:
168 entries reassembled, 2,252,747 bytes, sha256
`a7eac6860e43db23090a933931107fb791066784c9cc2a2534e4d982056a0545` on both
sides, `git byte compare: IDENTICAL` (this local clone is not shallow, so
that leg ran here; CI's will fall back to the sha256 leg as described above).

## Verified

- `npx svelte-kit sync && npx svelte-check` (after writing a placeholder
  `.env`, gitignored, removed again after): **0 errors, 37 warnings**, the
  31/5/1 mix unchanged -- expected, since nothing under `src/` moved.
- `npm test`: run once, full suite -- **183 test files passed, 3864 tests
  passed**, 155.91s, exit 0. Unchanged from what this repo's baseline would
  read, since nothing under `src/` or `tests/` moved.
- `npm run history:verify`: quoted above, both the induced-failure and the
  clean run.

## Not verified

- The actual GitHub Actions run of the new `History record check` step --
  this session has no way to trigger a workflow run against its own push
  from here. The failure-mode analysis above is read from the script's own
  source and reproduced locally against the same shallow-clone code path
  (best-effort `git show` against an unreachable commit falling through to
  the sha256 compare), not observed on a live Actions runner.
- Whether `origin/main`'s own history was force-updated during this session
  (a `git fetch` reported "forced update" on `origin/main`) has any bearing
  on this branch's base; this branch is cut from `origin/integration`, which
  was unaffected, per the task's branching instruction.

## Deferred

Nothing scoped to this task was left undone. Out of scope, and not touched:
the four prior sessions' own history entries (each already correctly wrote
no `##` heading in the body once the corrected instructions existed in code,
even while `docs/HISTORY.md` and `CLAUDE.md` still described the old shape in
prose); this session did not audit those files for other drift beyond the
one item the task named.
