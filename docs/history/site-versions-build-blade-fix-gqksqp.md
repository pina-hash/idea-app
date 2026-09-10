---
title: "Prompt 0121: the build stamp's missing date, the two blade exports that wrote every photo twice, verification standards 2.5, and the integrate.yml ordering reported rather than changed (`claude/site-versions-build-blade-fix-gqksqp`, no migration)"
date: 2026-09-09
branches: [claude/site-versions-build-blade-fix-gqksqp]
migrations: []
subsystems: ["Build stamp", "Legacy assignments", "Standards", "Operations"]
---

Four items, three of which changed files and one of which deliberately did not.
Everything below was measured in this container; where something was not
verified it says so.

## ONE. The build stamp read `local build` where a date belongs

**The diagnosis was already made and was not re-derived.** Ledger 0115 named it
and prompt 0116 confirmed it empirically on live production thirty seconds
apart: `d7dd04c`, a plain export commit, rendered `Sep 9, 2026`; `786702d`, a
merge, rendered `local build`.

`deriveDeploy` will not state a date unless something corroborates
`VERCEL_GIT_COMMIT_SHA`, and the only thing it had to corroborate against was
the head of the build-time `git log --no-merges`. Since `main` began advancing
by `--no-ff` merges, the commit a production build is made from is routinely a
commit that log excludes BY CONSTRUCTION, so no corroboration was ever possible
and the date emptied on every merged deploy.

**THE `agrees` CHECK IS NOT DELETED, AND THAT WAS THE INSTRUCTION AND ALSO THE
RIGHT CALL.** What was wrong was its field of view, not its judgement: a stamp
that will say a date it cannot support is worse than one that withholds it. So
the gatherer reads the head ONE more time with nothing filtered
(`GIT_HEAD_FORMAT`, `git log -1`), and that reading is offered to the same
unchanged prefix test first.

- **The changelog log keeps `--no-merges`, and that is the load-bearing half.**
  Teaching the existing walk to include merges would put merge subjects in the
  changelog -- commit subjects are user-facing changelog copy here -- and count
  every commit under a merge twice, which is the version number this module
  exists to protect. Two questions with opposite needs get two reads.
- **`opts.head` is OPTIONAL, so a caller that supplies none behaves exactly as
  before.** That is what kept the existing four assertions in `which commit the
  stamp names` untouched and passing.
- **The prefix comparison became symmetric on purpose.** This repository
  abbreviates `%h` to EIGHT characters today (measured: `859c7a65`) while the
  stamp renders seven, and git lengthens the abbreviation as a repository grows.
  A one-way prefix test passes today and stops the day either length moves.
- **The no-platform-sha path now prefers the unfiltered head too.** A local
  build sitting on a merge used to stamp the merge's absence and an older
  commit's date, which is the same quiet lie one surface over.

**Measured on the real repository at the two commits 0116 caught**, by running
the gatherer's own two commands at each and putting the output through
`buildSiteVersions`:

| commit | shape | before | after |
| --- | --- | --- | --- |
| `786702d0` | merge | `Classroom v1.251 · 786702d · local build` | `Classroom v1.251 · 786702d · Sep 9, 2026` |
| `d7dd04cf` | plain | `Classroom v1.251 · d7dd04c · Sep 9, 2026` | unchanged |

`tests/site-versions.test.ts` goes from 40 to 49 assertions, including the
positive control -- the same merge fixture with no unfiltered head still renders
`local build` -- and the refusal, a build sha matching NEITHER head still gets no
date.

**`vite.config.ts` IS OUTSIDE THIS PROMPT'S OWNED SURFACE AND WAS CHANGED
ANYWAY, WHICH IS REPORTED RATHER THAN BURIED.** `site-versions.ts` is pure by
constitution -- it runs no command and reads no file -- so a fix that lives only
there is a function nobody calls and the stamp stays broken. The addition is one
`execSync` and one field passed to `buildSiteVersions`, in the plugin whose own
header says it "runs git, asks the environment two questions, and hands the
answers over"; this makes it three questions. It is named in the session report.

## TWO. Blade 03 and 04 wrote every uploaded photo into the export twice

Prompt 0105 measured the ratio and left both files alone because its own prompt
forbade touching files without the doubling defect. Mr. Pina called it; both are
fixed with prompt 0105's own repair (`22016bbd`, "export a blank template plus
its data"), reused rather than reinvented -- a second implementation of one
repair is the thing that stops matching.

`downloadHTML` clones the LIVE document. The photo grids are built by
`renderImgs()` from `_imgs` on every open, so each photo went into the file as
markup AND as data, and `loadData()` then built it again. **It is invisible**:
`renderImgs` opens with `c.innerHTML=''` and throws its own copy away, so
nothing on screen is wrong and the only symptom is a file twice the size it
needs to be. The clone now empties `#ss-mass`/`#ss-iso`/`#ss-top`/`#ss-side`
(03) and `#asm-photos` (04); the row thumbnails needed nothing, because they
live inside `#comp-body` and `#mfg-body`, which were already emptied.

**THE LIGHTBOX WAS A THIRD COPY, AND IT WAS MEASURED RATHER THAN ASSUMED.** Its
`<img src>` is a reflected attribute, so a student who zoomed a photo before
exporting serialized it a third time. Against the pre-fix files: four base64
payloads without the zoom, **five** with it. Nothing rebuilds that element and
nothing needs it, so the clone blanks it.

**Proven by round trip in the container's real Chromium over `file://`**, two
photos in each time:

| | pre-fix | pre-fix, zoomed | after | after, zoomed |
| --- | --- | --- | --- | --- |
| blade 03 base64 payloads | 4 | 5 | **2** | **2** |
| blade 04 base64 payloads | 4 | 5 | **2** | **2** |

Loading each export back: 2 image items rendered, 2 in `imgStore`, 2 DISTINCT
`src` values, and 0 page errors. With realistic photos (two 1.9 MB PNGs) blade
03's export goes from **5.03 MB to 2.62 MB**, a 48% reduction, which matches
0105's "roughly half duplicate" on the 20.4 MB and 10.2 MB real files.

- **`data-field` duplication: 15 attributes over 11 unique names in blade 03,
  and it is NOT a defect.** The four repeats (`collab-status`, `plan-status`,
  `interference-result`, `dev-status`) are radio GROUPS, two options each. The
  harness took a pristine reading before any upload, and the count is identical
  there, before export and after -- which is the only reason the number could be
  cleared rather than chased. Blade 04 is 3 over 3.
- **The harness needed a correction that is worth writing down.** `imgStore` is
  a top-level `let`, so it is a lexical global and NOT a property of `window`;
  reading `window.imgStore` answers `undefined` for a page that is working
  perfectly, which is a zero that reads exactly like a finding. The first
  baseline run reported `stored: 0` for that reason alone.
- **IndexedDB IS available over `file://`** in this Chromium with
  `--allow-file-access-from-files`, measured with an explicit probe rather than
  assumed, because both files depend on it and a denial would have looked like a
  blade defect.
- **The pre-fix control ran against copies extracted with `git show`**, never by
  restoring the working tree -- `git checkout --` is a discard-to-HEAD and this
  repository has lost three sessions' uncommitted work to it. The working tree
  was md5-checked unchanged after the control runs.

## THREE. `IDEA_VERIFICATION_ADDENDA.md` to 2.5

Edited from the mirror at `origin/main`, which was verified byte-identical to
the working copy and self-consistent at 2.4 over a 2.4 changelog entry. The
project-knowledge copy was the self-inconsistent one -- header 2.4 over a 2.3
entry -- and was not used, which is the stale-base rule doing its job rather
than a judgement call.

Two rules, both about a check that reported success over something it never saw:

- **Rule 37, a coverage reconciliation done by name.** It fails silently in one
  direction: an item the instrument records under a name the table does not
  carry LEAVES the comparison rather than appearing as a mismatch, so both sides
  look internally consistent. Reconcile totals first, names second and only to
  say which one is missing. Prompt 0116's evidence: the harness logs a
  tournament route without the `&team=3` its own route table carries, eight of
  nine reconciled, the ninth vanished, and what caught it was 678 new
  measurements over 18 new runs.
- **Rule 38, elapsed time is read from the clock.** Ledger 0114 reported a CI job
  hung for 17, then 30, then 38 minutes against a 4m39s norm and began
  diagnosing a healthy branch as broken; four minutes had passed and no `date -u`
  had been read. It is filed with the group about assertions that report success
  without touching what they name, because it is that failure aimed at the
  session's own report, and it is expensive out of proportion to its size: an
  overstated wait inverts a diagnosis and starts a search with no terminating
  condition over code that is fine.

The header, the changelog entry and the `REGISTER.md` row moved in one commit.
**The edit was checked by the file's own rule 36**: the 2.4 text is an ordered
SUBSEQUENCE of 2.5, 0 lines missing, 66 added, with the version header line the
one deliberate exception.

## FOUR. `integrate.yml`, reported and proposed, not changed

`docs/decisions/entries/21-integrate-tests-after-it-merges.md`, `Status: open`.
The workflow merges, regenerates the counts, pushes, deletes the source
branches, and only then runs the suite on the merged tree -- so a red merged
tree cannot stop a merge, and `integration` keeps accepting work while red,
which landed it red on 2026-09-10 and cost a landing cycle.

The entry states the exact change (move the `merged_suite` call between
`counts_refresh` and `target_push_gate`, and branch on its three return codes),
what it costs (a branch stays standing longer; one bad interaction blocks every
lane until a person acts; a killed job costs a sweep's latency, measured at 175s
of suite and 15s of `npm ci`), and the revert.

**Two things the entry says that are not obvious from the workflow.** The
current ordering's justification -- a failure there is never a lost merge -- is
weaker than it reads, because the deletes have not happened either, so a
discarded sweep costs latency and not work, which is the same argument the job
already makes for a rejected push. And the revert has the same landing
constraint as the change: `workflow_run` runs the copy on the DEFAULT branch, so
neither does anything until it is on `main`, and a bad edit cannot be fixed on a
branch. That is the whole reason it is a bundle that runs alone.

`git diff origin/main -- .github/` is empty, which is the check that the report
stayed a report.

## The landing found a second defect in the same file, and it is recorded in decision 21

This bundle's own Integrate run is what found it. **`integrate.yml`'s
merged-tree suite has never once run.** `merged_suite` does `npm ci` then
`npm test` with no `svelte-kit sync` between them, so vitest dies at startup on
the missing generated tsconfig -- the fresh-checkout trap `CLAUDE.md` already
documents -- and the function returns "could not be run at all" on every run in
which the tree moved. `ci.yml` escapes it only because it runs `npm run check`,
which syncs, as a step before `npm test`.

- **Run 34411071492 (22:13Z)** merged this branch, pushed `integration`, deleted
  the branch, and then failed on `Tsconfig not found`.
- **The control: run 34398008856 (19:56Z)**, three and a half hours before this
  branch existed, merged only a `materials/` fast-forward and failed the same way
  at the same step. So the defect is not this bundle's.
- **Reproduced locally, both directions:** `.svelte-kit` present, `npm test`
  reaches `RUN v4.1.10`; moved aside, it dies at startup on `Tsconfig not found`;
  deleted and re-synced with `npx svelte-kit sync`, it reaches `RUN v4.1.10`
  again. The local message is `[TSCONFIG_ERROR]` against `tests/db/cluster.ts`
  where the runner's is `[RESOLVE_ERROR]` against rolldown's runtime -- one
  missing generated tsconfig, two different first consumers of it, which is worth
  writing down because the two messages do not look alike.

**IT REVERSES THE ORDER OF DECISION 21'S OWN PROPOSAL, WHICH IS WHY THE ENTRY
WAS AMENDED RATHER THAN LEFT AS FILED.** That entry recommends failing closed on
"could not be run". With the missing sync still in place that return code is not
a rare fault, it is the permanent state, so a fail-closed gate shipped today
would block every lane in the repository at once. The sync fix has to land first.
A gate with one reachable answer is the vacuous-control failure this repository
keeps meeting, this time aimed at a workflow instead of a test.

**The workflow was still not touched**, and the fact that this bundle found the
defect BY being merged and deleted by it is the argument for that rather than
against it.

## Verification

- **`svelte-check` 0 errors / 37 warnings, 31/5/1 over 20 files**, re-derived
  with `svelte-kit sync` after exporting the two `PUBLIC_SUPABASE_*`
  placeholders. The baseline held exactly.
- **Full suite: 344 files, 6769 assertions, all passed, 408.92s.** Read off the
  runner's own summary rather than from its exit code (rule 19).
- **`tests/claude-md.test.ts` and `tests/standards-version-header.test.ts` pass**,
  which is what checks the header against its own newest changelog entry.

## NOT verified

- **Nothing was checked against production or against a Vercel deployment.** The
  build stamp fix is proven against this repository's real history through the
  pure derivation, not by observing a deployed page; the two production readings
  quoted are prompt 0116's, not this session's.
- **`npm run build` was not run.** The stamp's gatherer runs inside a real build
  and only the derivation was exercised here.
- **`npm run verify:browser` was not run.** Nothing in this bundle touches a
  `/dev` route or a rendered surface; the Chromium work here was the blade round
  trip, driven directly.
- **The blade exports were not opened by a human, printed, or checked at 375px.**
  What was measured is the round trip: what goes into the file and what comes
  back out of it.
- **`file://` is not how a student receives these files** -- they are served
  through the raw-import endpoint -- but the export is a self-contained document
  opened from a filesystem, which is the path that was driven.

## Reported, not changed

- **The legacy freeze has no line for the blade files, and now needs two.**
  `src/lib/legacy/assignments/` was carried over in `b9f3dd06` ("Phase 2 slice
  2: fan out legacy content"), so `CLAUDE.md`'s freeze covers it, and the freeze
  says a file is unfrozen only by an explicit rule added there FIRST. Prompt
  0105's edit to `idea100-blade-01.html` never got that line, and this bundle's
  two edits do not have one either. This session does not own `CLAUDE.md`. The
  authorisation is real and is in the prompt -- "Mr. Pina has now called it: fix
  both" -- and the record of it is missing, which is exactly how the coins tab
  bar edit was found a bundle later "with nothing saying why".
- **`vite.config.ts` was edited outside the owned surface**, argued under ONE.
- **Ledger entries 0117 through 0120 are absent from `origin/main`.** The four
  lanes running beside this one have not landed theirs.
