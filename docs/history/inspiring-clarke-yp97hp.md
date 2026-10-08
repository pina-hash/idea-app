---
title: "Agent branches and integration build no Vercel preview, merged agent refs are pruned on every push to main, and main's red CI from the migration records is fixed (`claude/inspiring-clarke-yp97hp`, ledger 0376)"
date: 2026-10-08
branches: [claude/inspiring-clarke-yp97hp]
migrations: ["0230"]
subsystems: ["Tooling", "CI", "Vercel", "Migrations"]
---

**Why.** Vercel Deployment Storage was the largest line on Mr. Pina's bill (354 GB,
$27.62 of $43.26 usage, Sep 13 to Oct 8). He is setting the retention policy to its
shortest values himself. Two things in the repository kept storage up: every push to a
`claude/**` or `codex/**` branch built a preview nobody opens
(`docs/audits/2026-09-13-vercel-deploy-throttle.md`, section 3a), and Vercel never
deletes the latest preview of a branch that still exists.

**What changed.**

- `vercel.json` gains `git.deploymentEnabled` with `claude/**`, `codex/**` and
  `integration` false. `main` and `lane/**` are unspecified and keep the default, true.
  The redirects block is byte-identical. The audit found no requirement for an
  `integration` preview anywhere in `docs/standards/`, `CLAUDE.md` or `.github/`; the
  workflows README only described one, and now says it is off.
- `.github/workflows/prune.yml` runs on every push to `main` (no manual trigger). It
  fetches every branch with full history, cuts `contained_delete_gate` out of
  `integrate.yml` between `contained_delete_marker:begin` and `:end`, reads
  `AGENT_BRANCH_PREFIXES` out of the same file's `env:`, and for each agent ref asks the
  gate, deletes with a lease pinned to the measured tip, and checks the result with
  `git ls-remote --exit-code` (2 is gone, 0 is still there, anything else is
  "unverified"). The job summary lists Deleted, Already gone, Still on the remote and
  Standing. A cut that is empty, does not parse, or does not define the function fails
  the job before anything is deleted.
- **Why the cut and not a shared script.** `integrate.yml`'s own comment already
  describes proving the gate by cutting it; a shared file would have meant rewriting that
  workflow's busiest step to save one `sed`. One copy of the rule either way.
- **What the prune does not ask, on purpose.** `integrate.yml` holds red branches and
  branches whose ledger entry reads `issued` before it asks containment, because its next
  step is a merge. The prune merges nothing: a ref whose tip is reachable from
  `origin/main` or `origin/integration` holds nothing a delete can take away, and a
  session that pushes to it again re-creates it.
- `tests/workflows.test.ts`: the `deploymentEnabled` block in both directions (the three
  patterns false; no false pattern matches `main`, `lane/feature` or `lane/a/b`, with the
  matcher shown able to say yes); no `ignoreCommand`; `prune.yml`'s trigger, permissions,
  single lease-pinned push, `ls-remote` check and absence of a second gate definition.
  The proof runs the prune step's own `run:` body, verbatim, in throwaway `mkdtemp`
  repositories with the real `integrate.yml` copied in: a tip only in `main` and a tip
  only in `integration` are deleted, an outstanding tip stands, `main`, `integration` and
  a contained `lane/` branch stand. Negative controls: the gate's guard stripped (the
  loop's filter still holds), the loop's filter stripped (the gate still holds), both
  stripped (`main`, `integration` and the lane branch are deleted, so the proof fails),
  and the markers renamed (the job fails and deletes nothing). The bare remote's HEAD
  points at no branch, because a bare repository refuses to delete its current branch
  and that would have let the both-stripped control pass for a reason that is not ours.
  `CUTTABLE_GATES` now names a harness for `contained_delete_gate`.

**Main's red CI, fixed in the same push at Mr. Pina's request.** CI on `a0fedf31`
(Ledger 0375) failed `tests/db/migrations-applied-record.test.ts` twice:

1. Every record `tools/apply-migration.mjs` wrote (0231 to 0235) had no `source:` line,
   though the directory's README says a tool record carries `source: tool`. The tool now
   writes it, and the five records gained the one line.
2. 0230 had no record. It was pasted by hand; the earliest measurement that saw it is
   Migrate run 37484392652 (2026-10-06T15:06Z), whose catalog probe printed four `0230
   APPLIED` lines. That output is the evidence in a `source: report` record written by
   `tools/record-applied.mjs`, `applied_at: 2026-10-06`, with a note that this is the
   date it was first seen applied and not the date it was pasted.

**Measured.** Agent refs at session time: 108, of which 105 contained in `origin/main`
or `origin/integration` (`git merge-base --is-ancestor` only) and 3 standing
(`claude/new-session-7tll1j`, `claude/quirky-pascal-zwy3zd`, `claude/sleepy-cannon-iobdf9`).
`tests/workflows.test.ts` 121 passed; `tests/db/migrations-applied-record.test.ts` and
`tests/apply-migration-trace.test.ts` 52 passed.

**Not verified.** Vercel's own behaviour after this deploys is not observable from the
container: that `deploymentEnabled` stops the agent and `integration` builds, and that
Vercel then removes the previews of deleted branches under the new retention policy.
The prune's first real run on GitHub had not finished when this was written; the
throwaway-repository proof is the evidence for its logic, not for GitHub's token
permissions on a branch delete (the same token already deletes refs in `integrate.yml`).
