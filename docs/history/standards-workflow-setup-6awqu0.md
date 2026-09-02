---
title: "Standards 4.17 to main, and the infrastructure around it: the ledger mirrored, decisions given a directory, applied state made askable, harness counts generated, and a Deploy button (`claude/standards-workflow-setup-6awqu0`, no migration)"
date: 2026-09-02
branches: [claude/standards-workflow-setup-6awqu0]
migrations: []
subsystems: ["Standards", "Tooling", "CI", "Documentation"]
---

Two landing paths in one session, deliberately. Three standards files and the
register went straight to `main` in one commit, which is the established path
for `docs/standards/`; everything else rides this branch for the integrate
workflow to sweep. Nothing here touches `src/`, and no migration was written
or permitted.

## The standards push, and the descent proof

`IDEA_instructions.md` 4.16 to 4.17, `IDEA_Chat_Handoff_Standard.md` 1.1 to
1.2, `IDEA_REPO_WORKFLOW_STANDARD.md` 1.0 new, and four register rows.
`IDEA_VERIFICATION_ADDENDA.md` 2.3 was delivered with the set and is
byte-identical to the mirror (md5 `407e0ade...`), so it was not touched.

**4.17 is not a pure insertion and could not be proven like one.** It merges a
second 4.16 that a different chat built from 4.15, and it rewrites the Fable
routing paragraphs in place. So descent was proven the way
`IDEA_VERIFICATION_ADDENDA.md` rule 36 requires, as an **ordered subsequence**:
every line of the mirrored 4.16 must appear in 4.17 in the same order except
the lines the delivery enumerated in advance. Measured: 2714 lines in, 3084
out, **48 absent**, and all 48 are in the enumerated set. The handoff standard
came out at 3 absent, all three enumerated. A deletion count would have proven
nothing here, because content can be reshuffled with every line still present.

**The fork check found nothing past the delivered base**, swept across
`origin/main`, `origin/integration` and every remote branch: instructions 4.16
on main and on this branch, **4.15 on integration** (behind, not ahead),
handoff 1.1 everywhere, addenda 2.3 on main and 2.2 on integration, and
`IDEA_REPO_WORKFLOW_STANDARD.md` on no ref at all.

**The register was edited at HEAD in place, never uploaded whole**, which is
the entire point of ledger entry 0002: on 2026-08-31 a whole-file upload
through the GitHub UI silently reverted a row another lane had corrected
twenty minutes earlier. Reconciled both ways afterwards: 20 files, 18 rows, 18
versioned files, **0 mismatches**, `README.md` and `REGISTER.md` correctly
unregistered. `tests/standards-version-header.test.ts` passes 21 of 21 against
the delivered files, unedited.

## The ledger is the repo directory now, and the session writes its own entry

Entries `0002`, `0003` and `0004` existed only in the project-knowledge copy.
They are split into one file each here, text verbatim, and `0005` (this
bundle) and `0006` (the parallel feedback prompt) were written and **pushed as
this branch's first commit**, before any other work, so a chat fetching the
ledger mid-session sees this work as in flight rather than absent.

`0001` advances to `deployed`, and not on the strength of its own notes: every
sha it names (`57af18c`, `5f32c71`, `0ecb9c0`) was confirmed contained in
`origin/main`. `0003` is marked **superseded by 0005**, because a sweep of
every remote ref found neither `tools/migration-ledger.py` nor
`docs/migrations-ledger/` anywhere. That prompt was issued and never received.

The README gains one section: the session writes the entry because the chat
cannot push, and the check reads across `main`, `integration` and every
`claude/**` branch, because an entry on an unmerged branch is exactly the
in-flight work the check exists to find.

## `docs/decisions/`, and what the tree said about the defaults

Eleven decisions, one file each, each carrying the default this assistant
would pick so that answering is a yes or a correction. One file per entry for
the reason `docs/HISTORY.md` and `routes.mjs` were both split: a shared list is
a fork. A decision is closed by editing its own file, never by deleting it, so
"was this decided, and what was the answer" stays answerable.

Every factual claim in them was put to the tree, and each entry carries a
`Tree check` line. **Three did not survive intact**, and they are the reason
this section exists rather than a note saying eleven files were written:

- **02 (coin ledger test RLS policy) names nothing that exists.** No policy on
  a coin table carries `test`, `debug` or `temp` in its name anywhere in
  `supabase/migrations/`. The two permissive coin reads that do exist,
  `read coin categories` (0070) and `read coin contracts` (0077), are both
  `using (true)` and both commented as deliberate. The decision needs the
  policy named before a migration can be written, or the premise withdrawn.
- **04's own default reverses a written rule.** Exposing the gallery sort in
  the URL is refused in `FoundryGallery.svelte`'s header, in words: selection
  is a thing you send someone, a sort is a thing you do while looking, and a
  sort in the query string puts a second parameter on every link a student
  pastes. Choosing that half of the default means reversing that rule, not
  adding a parameter.
- **09 is already mostly written down.** `IDEA_INTERFACE_STANDARDS` 2.11
  section 10 already says 44px on every student-facing surface at every width
  and a 24px absolute floor including mouse-only instructor consoles, since
  2.3 on 2026-08-20. The only part of the default that is genuinely new is
  that a 24px surface must declare itself in a named CSS class.

## Applied state is askable now, and it is the only thing in the tool that fails silently

`tools/idea-status.py` keeps everything it printed and gains four sections,
ordered so the most urgent is first: decisions owed, prompts in flight across
every ref, the applied-state probe block, and the harness counts block. Plus
`--repo` for the other two repos per `IDEA_REPO_WORKFLOW_STANDARD.md`,
`--json`, and `--local` for an offline read.

**The probe block is one catalog probe per landed migration**, derived from the
first object it creates, plus a **body marker** for any function another
migration in the range also defines. Existence proves nothing for a
`create or replace`: that is exactly how `0151` reverted `0148`, with the
object present and the server-stamped clock gone. Measured against `0151`
through `0169` on `main`: 21 probes, 1 out of reach, 3 two-author collisions
(`_app_short_link_reserved` by 0156/0166, `gauntlet_submit` by 0151/0158,
`maps_search` by 0162/0165), each of which produces a marker for the later
file. `0153` and `0168` print **`no probe`** rather than an invented one --
0153 only updates rows, 0168 alters a bucket and re-creates an index another
file owns. Every probe reads `pg_catalog` or `information_schema` and none
reads a migrations table, because production has none.

**Two defects were found by running it rather than by reading it**, both in the
first pass: `create unique index` parsed as an object literally named
`unique` (the qualifier precedes the kind, which the inherited regex had
after it), and a migration whose only creation is a shared object was probed
on that shared object, where a `true` says nothing about which file's copy is
live. The second now prefers an object no other migration in range defines
and labels the fallback in the output.

**This is the one part of the tool that fails silently, so it is the part with
a test.** A wrong branch list is wrong on screen; a probe block missing a
migration is a shorter answer that looks correct, and every omitted migration
reads as not applied. `tests/idea-status.test.ts` builds a real git repository
in a temp directory with real `origin/*` refs and reads it through `--local`,
in about two seconds with no network. The expected values come from the
fixture files, not from a run.

**Mutation-proved both directions, restoring from a copy and md5-checking:**

    drop a migration with no probeable object    1 test reddens
    pick a marker present in both bodies         2 tests redden

The second mutation was **inert on the first fixture and reported green**,
which is the finding rather than a pass. `0154`'s body had one candidate line
over the length floor, so the correct picker and the broken one returned the
same string and the mutation could not be observed. The fixture now carries a
shared line longer than the marker, which a longest-first search reaches
first, and the test asserts the marker is not that line -- so the oracle is
reached rather than satisfied by there being nothing to choose between. A
mutation that reddens nothing is a failure of the proof until the mutation is
shown to discriminate, and this one was applied correctly and still proved
nothing.

The exit code turned out to be a contract worth asserting rather than working
around: the tool exits 1 when an object in range has two authors, which is a
FINDING and not a failure, and `execFileSync` throwing on it is what surfaced
that. Both directions are measured on one fixture at two ranges.

## A hand-written file never holds a computed value

`tools/browser-verify/README.md` carried a spec count, a route count, a
`/dev` page count, a run count, a measurement count, a self-test control count
and a wall clock **by hand**, and they were wrong on every tree checked on
2026-08-31. The file itself said "MEASURE IT, DO NOT QUOTE THIS LINE" directly
above a stale number, and recorded three separate task briefs written from
figures in it that were all three wrong.

`tools/browser-verify/readme-counts.mjs` is the one writer. It runs the
harness (or reads a `run.mjs --json` report) and rewrites one block between
`<!-- counts:begin -->` and `<!-- counts:end -->`, carrying the numbers, the
sha and the ISO date, plus a machine-readable `counts:data` line the rendered
table must reproduce exactly. Measured on this branch, a full run:

    65 route specs over 36 distinct routes, of 69 /dev pages
    130 route/width runs, 1710 measurements, 4 outside threshold, 312.8s
    --selftest: 64 controls (32 negative, 32 positive), 0 instrument failures

The four findings are the two this README already documents: `/dev/pathways`'s
harness controls under the tap floor at both widths, and 51px of horizontal
overflow on `/dev/coins` and `/dev/coins-signedin-1` at 375px only, which is
the frozen legacy ledger's own shipping bytes. Nothing new.

**`tests/derived-numbers.test.ts` guards it without a browser**, which is what
keeps it out of the CI problem the harness README spends a section on. The
static half (specs, routes, `/dev` pages, widths, runs) is re-derived live from
the same `routes.mjs` the harness loads, so a spec added without regenerating
reddens in CI. The measured half is checked by re-rendering the table from its
own data line, so a hand-edited digit reddens. **Proved on the real file:**
changing `1710` to `1711` in the table failed 3 of the 7 tests, one of them
naming "edited by hand"; restored from a copy and verified md5-identical, 7 of
7 green.

The restore is worth naming. `git checkout --` would have restored from HEAD
and discarded every uncommitted edit in this session, which `CLAUDE.md` records
three sessions in one week doing inside a mutation script. Every restore here
copied the file first and restored from that copy.

`CLAUDE.md`'s paragraph claiming `0155` was queued is replaced by the same
rule, in place: applied state is a property of production, no file here records
it, run the tool and paste its probe block. That paragraph was wrong in the
safe direction for a whole night.

## CI on `integration`, and a Deploy button that keeps the judgement

`integration` gets **no CI run from its own pushes**, ever: `integrate.yml`
pushes it with `GITHUB_TOKEN` and GitHub's loop-breaker starts no run from
that. On 2026-08-29 it went red silently and stopped eight branches. `ci.yml`
now carries a schedule (04:30 UTC, 21:30 Pacific, outside class hours) and a
`workflow_dispatch`, both testing `integration` rather than the default branch,
plus `workflow_call` with a `ref` input.

`deploy.yml` is the one path that writes `main`. It refuses unless the person
types the confirmation string exactly, refuses unless `origin/main` is an
ancestor of `origin/integration` (naming Integrate as the repair), calls
`ci.yml` **on integration's exact resolved sha** rather than querying the
Actions API for an earlier run's conclusion, merges that same sha with
`--no-ff`, pushes without force, and reads `main` back to print the new sha to
the job summary.

**Nothing weakens `integrate.yml`'s refusal.** Its header now points at
`deploy.yml` as step 4 and records that the typed line IS the judgement it was
protecting. The button is not a schedule because a night window answers only
the first of its two reasons: migrations are applied by hand and several must
land before the code that calls them, and CI cannot see production's catalog.
That is decision 10, defaulting to "not yet".

**Neither new trigger reaches `integrate.yml`**, confirmed in the file rather
than assumed: its `workflow_run` filter requires `event == 'push'`, and a
called workflow runs as a job inside the caller's run rather than as a run of
its own.

## What was measured, and what was not

    npm run check      0 errors, 37 warnings (31 state_referenced_locally,
                       5 css_unused_selector, 1 perf_avoid_nested_class)
    npm test           the full suite, green
    history:verify     168 entries reassembled, sha256 matched
    verify:browser     130 runs, 1710 measurements, 4 outside threshold

**NOT verified, and none of it is verifiable from here.** No workflow was run:
a session cannot trigger one, and neither `act` nor `actionlint` is present in
this container. All three workflow files parse under a YAML parser and every
`run` block parses under `bash -n`, which is the whole of what was proven about
them. The GitHub expression that resolves `ci.yml`'s checkout ref was reasoned
through and not executed. Nothing touched the live Supabase project, so the
probe block has never been pasted into the SQL editor and no migration's
applied state is known as a result of this bundle -- the tool makes the
question askable and answers none of it. `--repo` was exercised against this
repo only; `fll-app` and `frc-app` are outside this session's GitHub scope, so
the unnumbered-SQL path is covered by the fixture test and not by either real
repo.

**The model changed mid-session.** The first message opened on Fable 5.1 and
the session was switched to Opus 5 partway through step 5, before the workflows
and both test files were written. `IDEA_instructions.md` 4.17 asks for the
finishing model to be named because a classifier flag can switch it invisibly;
here it was a deliberate switch rather than a flag, and it is recorded for the
same reason.
