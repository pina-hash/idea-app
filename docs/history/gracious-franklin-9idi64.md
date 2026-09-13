---
title: "One file, one fork: merging two history-first deploy probes by content"
date: 2026-09-13
branches: ["claude/gracious-franklin-9idi64", "claude/keen-davinci-xvhwdw", "claude/kind-euler-vlt4u7"]
migrations: []
subsystems: ["ci", "tooling", "migrations"]
---

Two prompts were issued for one file. Ledger 0213 on `claude/keen-davinci-xvhwdw`
and ledger 0216 on `claude/kind-euler-vlt4u7` both rewrote
`tools/deploy-probe.mjs` to read `supabase_migrations.schema_migrations`, from
the same base commit (`9b010f53`), and both corrected `CLAUDE.md`. Both were
internally consistent, both carried mutation proofs, and neither was the newer
one. `IDEA_MATERIALS_PROCESS.md`'s "One File, One Fork" is the rule that
governs: reconcile by content, section by section, never by picking a side and
never by version number.

This entry is the merge. **It is a record of what each fork found alone**, since
that is the half a merge destroys if nobody writes it down.

## Where the two branches actually were

`claude/kind-euler-vlt4u7` was already gone. `integrate.yml` had merged it into
`origin/integration` on green CI and deleted the branch, so 0216's work was the
integration tip and 0213's was the unmerged half. That is worth stating because
it makes the fork asymmetric in a way neither prompt anticipated: the merge is
"0213 into a tree that already has 0216", not two branches into a third.

## What both got right, and is preserved

Four properties, arrived at independently, which is the strongest evidence in
the whole bundle that they are correct:

- the history table is read FIRST and the object probes second;
- the object probes are KEPT, and WIN whenever a row disagrees with one;
- status 3 survives and still means CANNOT CONFIRM;
- a row is a claim, a probe is evidence.

## What each found alone

**0216, taken over 0213 where they collide.** Both hit `psql` printing a bare
`SET` command tag that `--tuples-only` does not suppress -- which the object
probes never noticed, because they discard any line that is not `<int>|<t|f>`,
and which the history read silently absorbed as an extra "version". 0213 fixed
it with `--quiet`; 0216 matched a LABELLED ROW, the way `runSql` already guards.
**The label is the stronger fix and is what shipped**: a flag is one tidy-up of
an argument list away from being dropped with nothing failing loudly, and a
label cannot be mistaken for a tag whatever arguments are passed. `--quiet` is
therefore deliberately ABSENT rather than kept as belt-and-braces -- with the
flag on, the guard has nothing to bite on and the live test's control goes
vacuous.

0216 alone also found: `deploy.yml`'s typed-confirmation fallback was
unreachable code (GitHub invokes a `run:` body with ERREXIT already on, and
`set -o` only turns options ON), proven by extracting the step from the PARSED
YAML and running it under GitHub's own `bash --noprofile --norc -eo pipefail`
with a negative control that re-removes `set +e`; a `bash -n` sweep over every
`run:` body; `verdicts`' third argument defaulting to pre-seed behaviour so
`apply-migration.mjs`'s two-argument call is unchanged, asserted deep-equal; and
naming a row-contradicted-by-probe as **CONFLICT**, which is now the word in the
data (`agreement`), in the text report, and in the job summary.

**0213 alone.** `to_regclass` resolves a NAME and resolving a qualified name
needs USAGE on its schema, so for exactly the role this tool runs as it
misreports a table that is sitting right there; the preflight reads `pg_class`
and `pg_namespace`, which are readable by PUBLIC. `readable` is the CONJUNCTION
of the schema privilege and the table's, because `has_table_privilege` answers
about the table's own ACL and says nothing about the schema. And the two round
trips, which is the load-bearing one and the easiest to lose in a merge: the
deploy role holds no grant on an ordinary table, and a `select` it may not run
raises at executor startup and **aborts the transaction the object probes ride
in**, taking the whole answer down. So existence and privilege are asked of the
catalog first, and the rows only if that came back readable.

0213 alone also brought `runSqlRaw` as the single `psql` spawn (0216 added a
second, `runRows`, which is a duplicated invocation), `normalizeVersion`, the
degrading ladder, and the rule that its no-probe fixture is SYNTHESISED rather
than naming `0211` -- `origin/main` moved mid-session and inverted both
directions of a paired test at once.

## The one place the two designs genuinely disagreed

A read that fails AFTER the preflight said readable. 0216 answers `cannotRun`
(exit 1), reasoning that it is an anomaly rather than an ordinary state. 0213
degrades a rung with a reason on stderr.

**The ladder shipped, and the reason is that the narrowest rung is not a weaker
answer.** It is the pre-seed answer, which fails closed by construction: a
migration with no probe comes back CANNOT SAY, and one whose probe ran is
answered by evidence. Exit 1 would refuse runs the object probes can still
answer correctly. What makes the ladder honest here rather than a way of
papering over an unexamined failure is 0213's own privilege check: "present but
not readable" is a KNOWN state detected before the select, not a mystery. 0216's
argument is written into the tool's header as the rejected alternative.

## `CLAUDE.md`: verified, not assumed

The prompt asked which fork's placement was true of the tree. **Measured on
`origin/main`: neither `deploy.yml` nor `migrate.yml` is mentioned anywhere in
`CLAUDE.md`.** So 0216 is right -- the third stale sentence lives in
`deploy.yml`'s own header and belongs corrected there, which 0216 did. 0213's
entry reached the same conclusion and, owning neither file, wrote a `CLAUDE.md`
sentence pointing AT the defect instead. That sentence is dropped: after the
merge it is false.

Kept from 0213: the correction to the `idea_migrator` census, verified against
`migrate.yml:140`, which is
`DEPLOY_PROBE_URL: ${{ secrets.DEPLOY_PROBE_URL || secrets.IDEA_MIGRATION_URL }}`
-- so the write credential genuinely has two readers and one writer, and the
line saying "one tool and nothing else" was wrong. 0216's new census bullet was
edited to point at that statement rather than restate it: two copies of a census
in one file is what this whole bundle exists to clean up.

**And one claim was replaced by a pointer rather than merged.** 0213 said
`DEPLOY_PROBE_URL` IS a repository secret; 0216 said it was UNSET as of the same
day. Neither is checkable from a container -- a repository secret reaches an
Actions runner and never a session, so an unset environment variable here is
evidence of nothing. Two sessions writing opposite snapshots of one fact in one
day is the same shape as the `svelte-check` warning count, and gets the same
treatment: name the instrument, not the number.

## Measured

- **`svelte-check`: 0 errors, 37 warnings in 20 files**, breakdown 31
  `state_referenced_locally` / 5 `css_unused_selector` / 1
  `perf_avoid_nested_class`. Re-derived at the branch point in a clean
  `git worktree` at `origin/integration` FIRST -- also 0 / 37 / 20 -- so the
  figure written in `CLAUDE.md` is currently correct and did not move. The two
  values were exported before `svelte-kit sync`, per that section's own rule.
- **The four probe test files: 49 tests, all passing**, including 12 against a
  real Postgres in the live file, 5 more in the history file and 8 driving the
  whole CLI through `psql` end to end.
- **Mutation proof: 17 permissive mutants, 17 killed** -- the union of both
  sessions' ground (0213's matrix, ladder, two preflight privileges and `psql`
  invocation; 0216's label guard, CONFLICT naming, `readFrom` and `deploy.yml`
  `set +e`). Restored from an IN-MEMORY copy and never `git checkout --`; both
  target files md5-identical afterwards; every verdict read off vitest's summary
  line on stdout AND stderr, never its exit code.

## Three test gaps the merged proof found, which is the point of re-running it

Neither session's proof speaks for the merge, and running both against it turned
up three SURVIVORS -- each sitting on a find one of the forks named as the reason
for its own design:

1. Dropping `has_table_privilege` from the `readable` conjunction survived. No
   case had schema USAGE and no table SELECT, which is the DANGEROUS half: a
   `readable: true` there sends the select that aborts the object probes' own
   transaction.
2. Swapping `pg_class` back for `to_regclass` survived, because the test that
   claims that find substituted the role NAME into `has_*_privilege` while the
   statement still EXECUTED as the owner -- under which `to_regclass` resolves
   perfectly well. **The headline find was not pinned by the test that claimed
   it.** It runs under `set role` now.
3. Opening `versionRow` to accept any row survived, because a bare `SET` tag
   splits to one field and its absent second field was already being dropped as
   empty. The guard was passing for the wrong reason.

**And repairing (2) corrected the mechanism on record.** Measured at the SQL
layer as a role with no schema USAGE, `to_regclass` does not answer NULL: it
RAISES `permission denied for schema`, which under `--single-transaction` with
`ON_ERROR_STOP=1` takes the object probes with it. Ledger 0213 recorded the NULL
because that is what the TOOL reports once `psql` exits non-zero and the ladder
degrades. Same conclusion about which catalog to read; a worse failure than the
one written down.

## What was NOT verified

- **Anything against production.** There is no credential and no route in this
  container. Whether `0209`'s seed is pasted, what
  `supabase_migrations.schema_migrations` holds, and whether `0214` has an
  applied record are all unmeasured here and are not claimed.
- **That `deploy.yml` behaves this way on a real runner.** The step body was
  executed under GitHub's own shell invocation, but in this container against a
  stub probe.
- **No browser pass**, and none is called for: nothing under `src/` changed.
