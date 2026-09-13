---
title: "The repository can say which migrations are live again: `tools/record-applied.mjs` writes a `source: report` record with no database code path, `0193`-`0210` are backfilled on Mr. Pina's report, and `idea-status.py` reads `Build:` so a decision he already answered is in a list (`claude/zen-edison-jpgz4s`, no migration)"
date: 2026-09-13
branches: [claude/zen-edison-jpgz4s]
migrations: []
subsystems: ["Migrations", "Tooling", "Decisions", "Prompt ledger"]
---

Ledger 0193's read-back audit found two things and this bundle is both of them. Item
2: `docs/migrations-applied/` held `README.md` and nothing else, against eighteen
migrations applied by hand, so nothing in the repository could answer *what is live*
and every lane's gate 4 read `CANNOT SAY`. Item 1: `tools/idea-status.py` filtered
decisions on `Status: open` and never read `Build:`, so a decision Mr. Pina had
already answered but nobody had built was in no list the tool prints -- including
decision 21, which is the decision about fixing the thing that produces half these
problems.

Baselines re-derived on `origin/integration` at `f4616dca` at branch time, because
every number in the prompt was measured on an older base: **`npm test` 450 files,
8586 tests, 0 failures**; **`svelte-check` 0 errors, 37 warnings in 20 files
(31 `state_referenced_locally` / 5 `css_unused_selector` / 1
`perf_avoid_nested_class`)**, which is exactly `CLAUDE.md`'s stated figure, so that
line needed no correction for the sixth time.

## The record: a second tool, not a flag on the first

`tools/apply-migration.mjs` already writes a record and its contract is stated in one
sentence in the directory's own README -- *a file exists if and only if a transaction
committed* -- enforced structurally by the single call site sitting below the commit.
**It has never run here.** A cloud session's egress proxy accepts a CONNECT to port
5432 and then carries no bytes, permanently, so `0193` through `0210` were every one
of them pasted into the Supabase SQL editor by hand.

`tools/record-applied.mjs` is the writer for that case. **It has no database code
path at all** -- no client, no socket module, no read of `IDEA_MIGRATION_URL` -- and
the test asserts that over the source with the comments cut out, because the file's
own header names the variable while explaining why it must not read it.

**It fits the loop he already runs rather than adding one beside it.** He pastes the
migration, reads the notices, pastes a verification query, reads the rows back. So
`--query <nnnn>` prints that verification query, derived locally through
`deploy-probe.mjs`'s own `readProbes`/`prepare`/`buildSql` -- **the same probe the
measuring tool would have run**, so this is not a second idea of what to check -- and
the record mode takes what came back.

**Two shapes were rejected and the reasons are the argument for this one.**

- **An `--offline` flag on `apply-migration.mjs`.** It makes that one-sentence
  contract false, and it puts a MEASUREMENT and a REPORT behind one code path where
  a reader of the directory can no longer tell them apart. The whole value of a
  record is knowing how much to trust it.
- **A shared `applied.json` he edits.** One file is one write point, which is the
  merge conflict `docs/history/` was split to remove and which
  `tools/browser-verify/routes.mjs` then reproduced and had to be split for too.

## What the record refuses to claim, which is most of the design

**A record that overclaims is worse than none**, so every field that could overclaim
either says less or is absent.

- **`source: report` vs `source: tool`** is a front-matter field, not a tone, so the
  two kinds are `grep`-separable forever. Every reported record opens its body:
  *This record rests on Mr. Pina's report of 2026-09-13, not on a measurement made by
  this repository.*
- **`session_user` and `database` are ABSENT.** In a measured record they are answers
  the SERVER gave to a query; a tool that has spoken to no server has no honest value
  for either, so it writes none rather than a plausible one. The absence is the
  signal, the way an omitted transport is the mechanism elsewhere in this repo.
- **`outcome: applied` only where a verification query's output was supplied.**
  Sixteen of the eighteen records say `outcome: reported` and `evidence: report-only`,
  and say in words that the whole of the evidence is that somebody says they pasted
  it. Only `0209` and `0210` carry `verification-output`.
- **The values are reproduced and NOT interpreted.** `0210`'s report includes
  `empty_grid_note_ok false` and `anon_holds_the_helper false`; whether a particular
  `false` is a pass is a question about a query this repository did not write and did
  not run, so the record says so and reproduces the rows.
- **`sha256_covers` names a commit**, because a hand apply cannot hash the bytes that
  were pasted, only the bytes in the repository at record time. Left unqualified the
  hash reads as a claim about what executed.
- **Evidence is scrubbed twice.** Through `deploy-probe.mjs`'s own `redact`, and
  through a pattern for anything shaped like a postgres URL even with no variable
  set -- because the person pasting is pasting out of a browser tab that has one and
  this repository is public.

**`ledger:` names the bundle that WROTE the migration, never the one recording it.**
`apply-migration.mjs`'s `appliesUnderLedger` greps `^ledger:` to answer "has this
bundle already applied a migration", so pointing it at the recorder would both break
that question and attribute eighteen migrations to a lane that wrote none of them.
`recorded_by_ledger: "0197"` carries the other half.

## The backfill, and the two places it refused rather than guessed

Eighteen records, `0193` through `0210`. The authorising ledger for each is derived
by reusing `parsePermitted` from `tools/migration-claims.mjs` rather than by writing
a second reader of `Claims:` -- and `authorisingEntry` returns null, never a guess,
when zero or two entries match. **It refused twice and both refusals were correct**:

- **`0196`.** Ledger 0131 writes ``Claims: `0196` `` with backticks, which
  `parsePermitted`'s `\bClaims:\s*(none|\d{4}...)` does not match. **This is a real
  gap in a tool this bundle does not own** and is reported rather than patched.
- **`0197`.** Ledger 0138 puts `Claims: 0197.` on its own bullet line rather than
  folded into `Migration permitted:`, which the parser reads by key. Same species.

A third case needed a decision rather than a flag. **`0204` is claimed by two
entries**: 0174 took it and its own line says `NONE WRITTEN ... RELEASED UNUSED`,
and 0177 wrote the file. A released claim is not an authorisation, so
`authorisingEntry` skips one and the record names 0177. That rule has a test.

**`0201` came from a Codex task**, so ledger 0145's `Branch:` line describes the
environment's `work` checkout and names no `claude/**` branch at all. The slug is
read off the merge that actually brought the file in (`87ba98a3`, pull request #92).
Which is worth stating because it is why a reported record's slug is chosen on
different grounds from a measured one's: a hand apply has one applier and no race,
so the slug is doing attribution rather than race-breaking.

**A second, earlier attestation turned up while doing this and is cited in the
records it covers.** `docs/prompt-ledger/entries/0140-land-integration-deploy-gate.md`
already reads "`0193`, `0194`, `0195`, `0196`, `0197`. All five are hand-applied to
production and reported verified", with that session's own caveat that it verified
none of the values itself; `0142` says the same in one line. So five of the eighteen
rest on two reports rather than one. Both are reports.

## The parser: two lists, two labels

`tools/idea-status.py` now reads `Build:` beside `Status:` and prints two blocks
under section `[0]`. **They are two findings with two labels because they need
different people**: an owed decision waits on Mr. Pina, a decided-but-unbuilt one
waits on a lane, and one count sends the wrong party to read it. Measured against
the real tree, the change surfaces exactly the two the audit named -- decision 04 and
decision 21 -- while leaving 13 and 25 where they were.

**The first-word fragility is kept narrow rather than made clever.** Ledger 0173
found decision 13 printing as owed for six days because its `Status` line opened with
`open` while the body said ANSWERED. The answer is not a smarter reading of one free
text field; it is that `Build:` exists and says whether anything is still owed after
the answer. `first_word` is documented as narrow, on purpose.

**Both halves are proved by MUTATION, and the mutants were restored from a copy.**
Reverting `unbuilt_decisions` to `return []` reddens 1 of 23; dropping the `Build`
field from the parser reddens 3 of 23. `tools/idea-status.py` restored
byte-identically both times, md5 checked (`7beb3fe8be626bf3f647e8b356d5ca4d`), and
re-verified green after. The restore reads from a `cp` and never from
`git checkout --`, which is the trap `CLAUDE.md` records three sessions hitting.

**The test lives at `tests/db/migrations-applied-record.test.ts`, which is an odd
home for a Python-parser fixture and is the ownership boundary rather than a
judgement.** Ledger 0197 owns `tests/db/migrations-applied*` and no other path under
`tests/`; the file boots no database and says so in its header. 23 tests, each
absence assertion paired with a positive control -- the fixture repo asserts all
three decisions were read before asserting which list each landed in, and the
directory sweep asserts it found more than ten migrations before asserting the set
matches.

## Decision 21 is recorded, and nothing was built

Mr. Pina answered YES, BLOCK on 2026-09-12, and **the entry already carried that
answer** on both `main` and `integration` -- this bundle was sent to record it and
found it recorded. What was genuinely stale is the entry's own last section, which
ends "No Integrate run has done that yet at the time of writing". One has:
ledger 0193's audit records run `34723007701` reporting `the merged tree passes the
suite -- Tests 8318 passed (8318)`, which is the first time `merged_suite` has spoken
about a tree rather than about its own inability to start. **So the safe order the
entry set out is complete** -- 0163's sync fix landed, a real verdict arrived -- and
the only step left is moving the call. The four remaining build items are restated in
the entry so the next lane needs one file rather than five.

**`.github/workflows/integrate.yml` is untouched.** It is the file every lane depends
on to land, a bad edit cannot be fixed on a branch, and that bundle runs alone. This
one owns no workflow.

## What was measured, and what was not

**Measured.** Both baselines on the branch point, above. **After the change: `npm test`
451 files, 8609 tests, 0 failures** -- one file and twenty-three tests more, which is
exactly this bundle's new file and nothing else moved -- and **`svelte-check` 0 errors,
37 warnings in 20 files, breakdown 31/5/1 unchanged.**
The two mutation proofs with byte-identical restores. `node tools/claude-md-check.mjs`
agrees with the tree. `tools/record-applied.mjs --query` in both directions: `0208`
(on `main`) emits a probe; `0210` (integration only) refuses with exit 2 and says why,
because `idea-status.py` derives probes from `origin/main` by rule and `CLAUDE.md`
says not to widen the probe to guess. Production HTTP reachable from this container:
`https://ideabosco.com/` and `https://apps.ideabosco.com/` both **HTTP 200**, which
differs from ledger 0193's `403` a day earlier -- the web origin is reachable even
though the database is not, and the two should not be conflated.

**One small finding about the checklist itself, reported rather than fixed.** Decision
16's gate 4 reads "`deploy-probe` exits 0 (2 or 3 is a stop, and `CANNOT SAY` is never a
pass)". With no `DEPLOY_PROBE_URL` the probe exits **1** (`cannotRun`), which is neither
0 nor one of the two stops the sentence names -- so the gate's own wording has a hole at
exactly the exit code every cloud session gets. It is obviously a stop under the second
clause; the numbers just do not enumerate it. Also worth knowing for whoever reads a gate
report: `node tools/deploy-probe.mjs ... | tail` reports `tail`'s exit code, so a piped
gate check reads 0 and looks like a pass. Measured both ways here.

**NOT verified, and this is the part that matters most for this bundle.** **Nothing
here confirms that any migration is applied to production.** No process in this
repository has ever connected to that database, this bundle did not either, and the
eighteen records say so on their own faces. Also not verified: the port-5432 egress
finding is inherited from `IDEA_instructions.md` and was not re-measured (there is no
production connection string in this container to measure it against, and
`IDEA_MIGRATION_URL` is unset); the Integrate run `34723007701` result is taken from
ledger 0193's audit and not re-read from the Actions API; and no browser pass was run,
because this bundle touches no mounted surface -- there is no file under `src/`.

## Reported, not fixed, because this bundle does not own them

- **`parsePermitted` misses two real spellings**: a backticked `` Claims: `0196` ``
  (ledger 0131) and a `Claims:` on its own bullet rather than folded into
  `Migration permitted:` (ledger 0138). Both produce `unspecified`, which
  `tools/migration-claims.mjs` reports as "PERMITTED BUT NAMING NO NUMBER" -- *the
  shape every collision to date was written in*. So two entries that DID name their
  number read as two that did not. `tools/migration-claims.mjs` and
  `tests/migration-claims.test.ts` are owned by no lane here.
- **Decision 04's `Build:` line is stale**, as ledger 0193 said: it names
  `FoundryGallery.svelte` line 127 as still `'recent'`, and
  `src/lib/foundry/telemetry.ts` already reads
  `FOUNDRY_GALLERY_DEFAULT_SORT = 'played'`. Not edited -- ledger 0197 owns
  `docs/decisions/entries/21-*` only. The new `[0] DECIDED, BUILD OPEN` block prints
  a standing warning that a Build line is a dated claim about the tree, which is the
  general form of this.

## The merge to `main` was NOT taken, and the reason is ownership rather than a red gate

This bundle carried no migration, so its prompt granted the merge of `integration` into
`main` against decision 16's six-item checklist. **It was not taken.** Every gate is
reported below because a checklist reported only when it passes is not a checklist, but
the stop came from the range read rather than from any of them.

**Ledger 0200 owns the merge of `integration` into `main`** -- in those words, on its own
`Owns:` line -- **and performed it at 02:01 UTC, three minutes before this lane reached
the same step.** `main` moved from `85543209` to `ee4a1c42`. An earlier read in this
session saw `85543209` and an empty `## Outcome` on 0200's entry and nearly concluded that
lane had finished without landing; **it had not finished, and a stale local ref plus an
unwritten outcome section is exactly what an in-flight landing looks like from outside.**
The correct read was `git fetch` immediately before deciding, which is the same rule 0200's
own notes give about the migration range and for the same reason.

**And landing again immediately would break 0200's own rule, which is the sharper half.**
That lane merged `b06597f1` -- the sha a green CI run names -- and wrote down why:
"anything `integrate.yml` merged afterwards belongs to the next landing rather than riding
in unverified." **This bundle is exactly that afterwards.** `integrate.yml` swept
`claude/zen-edison-jpgz4s` into `integration` as `16a2b5f8` and deleted the branch, which
is the ledger-status gate working as designed and not a leftover; the sweep landed after
0200's tested sha, so this work is in `integration` and NOT in `main`. A second landing
minutes behind the first, of a tree no green run names, is the thing that rule forbids.

**The six gates as measured, at 02:0x UTC on 2026-09-13:**

| gate | command | answer |
| --- | --- | --- |
| `main` is an ancestor of `integration` | `git merge-base --is-ancestor origin/main origin/integration` | YES |
| CI green on the tip | run `34731547636` aggregator log, `ref tested: 304399e7...` | `check`/`test`/`vanguard-changelog`/`history-verify` all `success` |
| the merge is clean | `git merge-tree --write-tree origin/main origin/integration` | CLEAN, no conflicts |
| `deploy-probe` exits 0 | `node tools/deploy-probe.mjs --since 209` | **exit 1**, `DEPLOY_PROBE_URL is not set` -- CANNOT SAY, never a pass |
| every migration this bundle added is APPLIED | -- | this bundle added none |
| every new ledger entry reads `Status: pushed` | read from `origin/integration` | all seven, plus this one |

The three no session can establish are unchanged: whether students are in class (it is
Saturday 18:51 Pacific, which is a judgement and not a timetable), whether the Vercel
preview renders, and whether a migration's effect on real data was intended.

**The CI read follows 0200's warning rather than the run conclusion.** `ci.yml` marks its
four real steps `continue-on-error`, so a step-level read from the jobs API reports
`success` for a failing suite. The truthful values are the four the aggregator echoes, and
the tree they speak for is its `ref tested:` line and never `head_sha`. Read that way here,
on this lane's exact tip. Worth adding to that warning: the aggregator step does
`exit 1`, so the JOB and therefore the RUN conclusion ARE truthful -- what is not truthful
is the per-step conclusion, which is the narrower claim.

**Final state.** `origin/integration` at `79f66750` carries this work and is green,
measured on that exact tip after the sweep: **`npm test` 451 files, 8609 tests, 0 failures;
`svelte-check` 0 errors, 37 warnings in 20 files.** `origin/main` at `ee4a1c42` does not
carry it. **This bundle is the first thing in the next landing**, and the next landing lane
inherits a clean range: `integration` adds no migration over `main`, because `0209` and
`0210` both went in with 0200.
