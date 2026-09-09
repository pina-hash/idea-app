---
title: "The records nobody wrote, and `IDEA_instructions.md` to 4.25: ultracode is not the top of the ladder (`claude/docs-standards-ledger-hihkhd`, no migration)"
date: 2026-09-09
branches: [claude/docs-standards-ledger-hihkhd]
migrations: []
subsystems: ["Standards", "Documentation", "Decisions", "Prompt ledger"]
---

Prompt 0109. No migration, no source file, no test, no workflow. Four documentation
deliverables plus one report-only finding: the ledger entry 0104 that nobody wrote, two
decision entries left open, `docs/standards/IDEA_instructions.md` from 4.24 to 4.25 with
four corrections verified against Anthropic's live model-configuration documentation, and
a report about two OTHER standards files that are wrong in project knowledge rather than
in this mirror.

## The base, and why it is the mirror

`origin/main` at `54bf64f2`. `git fetch --unshallow origin` succeeded and brought the full
history, every `claude/**` branch and `integration`; `git fetch origin integration`
succeeded; git already carried `Claude <noreply@anthropic.com>` and nothing was set. The
branch was cut from `origin/main`.

**The base for the standards edit is `docs/standards/IDEA_instructions.md` at
`origin/main`, read at 4.24 / 2026-09-08, and not any text handed over in a prompt.** A
freshness sweep on 2026-09-09 found the project-knowledge copy stale against the mirror by
one line, which makes a pasted copy a fork waiting to happen: 4.14 and 4.15 already
established that agreement between two reads of the same cache is one read, and this is
the same failure with a human in the loop instead of a CDN. The file was read off disk at
`origin/main` and edited in place, surgically, with every replacement asserted unique
before it was made.

The ledger entry `docs/prompt-ledger/entries/0109-records-and-standards-4-25.md` was the
first commit and went alone (`fe4ccb2b`), reading `Migration permitted: no. Claims: none.`
and `Status: issued`.

Fresh checkout: `npm ci` (never `npm install`, per the lockfile-reindentation trap;
`git status` confirmed `package-lock.json` untouched), then `npx svelte-kit sync`.

## How the work was gathered

**Six research agents in one workflow, then a completeness critic over their output.** The
bundle is six independent questions -- the live documentation, the facts behind 0104, the
GAUNTLET floor, the state of IDEA Maps, the exact edit sites in a 3,485-line file, and the
conventions for three different entry formats -- with no dependency between any two of
them. That is the shape `ultracode` is actually for, which is the same thing this bundle
went on to write into the standard.

**The critic earned its place and is the reason three things in this entry are right.** It
found that the draft of 0104 forward-referenced a heading in 4.25 that did not exist yet
(the standards edit now uses that exact phrase, "GitHub write access is per repository");
that the draft asserted a 403 on `git push` and the MCP write as though the tree recorded
it, when the tree records only an `add_repo` denial (now attributed to Mr. Pina's report
in words); and that 0104 was the only one of 101 ledger entries with no `- Notes:` line.
It also settled the version-header question empirically rather than by reading the test,
which is the finding below.

## `IDEA_instructions.md` 4.25, four corrections

All four were verified against the live documentation on 2026-09-09, fetched rather than
recalled. The canonical location has moved and a later checker should expect it:
`docs.claude.com/en/docs/claude-code/model-config` now 301s to
`code.claude.com/docs/en/model-config`.

**1. `ultracode` is not the top of the effort ladder, and this file had implied it was
since 4.17.** The documentation's own words: "Ultracode is a Claude Code setting rather
than a model effort level: it sends `xhigh` to the model and additionally has Claude
orchestrate dynamic workflows for substantive tasks." So its reasoning depth is `xhigh`,
one rung BELOW `max`, and `--effort ultracode` falls back to plain `xhigh` where workflows
are off. Seven live sites carried the old reading and all seven are corrected: the routing
table's row 4, the repo-wide-sweep override, the concurrent-heavy-bundles override, the
effort-labels paragraph, the "What still serializes" paragraph, the agents-split section,
and the last-verified line. **The 4.23 changelog entry says it too and was deliberately
left alone** -- a changelog is a dated record of what was believed, and correcting it would
delete the evidence that the belief existed.

The load-bearing half is what replaced it rather than the deletion. The old bullet said
"Reserve it for genuinely repo-wide work, not as a routine substitute for the table
above," which is the instinct for an instrument that costs more. It costs `xhigh`, not
`max`; **what it adds is shape, not depth**, so it is now recorded as the right DEFAULT for
a large bundle. The test is whether the bundle HAS independent parts, never whether it is
dangerous: one hard serial change in one file wants `xhigh` and no workflow, six unrelated
corrections across six files want the workflow and do not want `max`.

**And the serialization argument was resting on the wrong reason.** Two paragraphs said
one `xhigh`, `max` or `ultracode` bundle runs at a time, as though all three were the same
kind of heavy. An `ultracode` bundle serializes because its agents share one container and
one working tree -- which is what "Agents split inside a lane, never across lanes" already
says -- and not because it is deep. Both paragraphs now say so, because a reader who thinks
the reason is depth will let two of them run the moment the depth argument stops applying.

**2. `max` carries a documented warning, so the highest-scrutiny override now sets
`xhigh`.** Verbatim: "Can improve performance on demanding tasks but may show diminishing
returns and is prone to overthinking. Test before adopting broadly". The override had said
bump one model tier up and set effort to `max`, which is a STANDING rule reaching for the
top rung on every irreversible change -- exactly the broad adoption that sentence says to
test first, and nobody has tested it. `max` is still available; it is a deliberate one-off
with a reason in the routing line rather than a rule.

**3. GitHub write access is per repository, recorded beside the 2026-08-26 branch-deletion
403.** That older finding is about a VERB being refused inside a repository a session could
otherwise write; this is the wider case. On 2026-09-09 two sessions were refused on
`mrpina-dev/IDEA` while writing `pina-hash/idea-app` freely -- one by the permission
classifier at `add_repo`, so the repo was never attached and could not even be read, and
one by a 403 on `git push` and the GitHub MCP write alike, which is one refusal arriving
through two doors rather than a transport fault to retry. Neither is a defect; scope is
granted at session creation. So a second repository is a second session, or it is Mr. Pina
by hand, which is what the rulebook redirect became.

**4. Prompt text cannot set a session's repository scope**, added to the
precondition-is-a-claim section as a case that section's own rule cannot rescue. Every
other false precondition leaves a session able to do the rest of the bundle and report the
gap; this one takes the bundle with it, because there is nothing to read, diff or commit.
Worse, it is pressure toward INVENTING values: the session cannot read the file, the
prompt says what the file contains, and the nearest plausible thing is one step away. A
prompt written on 2026-09-09 did exactly that. The rule is therefore about how prompts are
written, not about how sessions behave under one.

## What the version test actually enforces, measured rather than read

The prompt asks to confirm the header and the newest changelog entry agree, since
`tests/standards-version-header.test.ts` refuses a copy where they do not. They agree --
header `**Version 4.25 - 2026-09-09**`, newest entry `- **2026-09-09 (4.25)**` -- and the
precise mechanics are worth writing down because they are not what the sentence implies.

**For this file the header-vs-changelog comparison is structurally SKIPPED, and always has
been.** The test's `ENTRY_VERSION` is `/^-\s+\*\*(\d+(?:\.\d+)*)\s*\(/m`, which reads a
version out of a `- **2.4 (2026-08-21)**` shaped entry. `IDEA_instructions.md` keys its
changelog by DATE, so the newest entry begins `- **2026-09-09 (4.25)**`, the regex matches
`2026` and then requires `(` where a `-` sits, and `changelogVersion` returns null. The
test's own header says this is deliberate: four corrections in one day cannot be told apart
by a version number.

Both candidate shapes were simulated against the real file before choosing. `- **4.25
(2026-09-09)** -` would have ACTIVATED the comparison and passed; `- **2026-09-09 (4.25)**
-` skips it. The date-keyed form is the house style, matches every older entry, and is the
only one that cannot bite later.

**The coupling that IS enforced is header against `REGISTER.md`, with a strict `toBe`.**
That row must read 4.25 or the suite reddens, which is why the prompt requires it in the
same commit. The Date cell is compared by nothing.

## The two decisions

**19, `gauntlet-sub-floor-run-disposition`.** Mr. Pina has answered the first half -- keep
the floor, make the cutoff a setting he owns -- and the entry records what that will cost,
because the number is a bare `30000` literal inside the body of the view
`gauntlet_leaderboard` (`0154:310-321`). There is no table, column or parameter holding it,
so "a setting he owns" is a build. The precedent for the shape is
`gauntlet_speedrun_ruleset` (`0015`), the singleton `0155` deliberately declined to widen
to the author tier on the grounds that editing it is a site-wide settings change.

The open half is what a sub-floor run looks like. The default recorded is a `pending
verification` state on the board rather than silent unranking, and `0154`'s own argument is
why: it pinned the floor to `0152`'s `p_fast_finish_seconds` default of 30 so that "no run
loses a board seat without also appearing, by name and with its whole telemetry census
beside it, on the review console", and it asserts that pin executably by reading `0152`'s
signature out of `pg_proc` and raising if the console's threshold is lower.

Three things the entry measured that make the default arguable rather than obvious. The
student is told **nothing**: on the Speedrun result card `result.is_correct` is true and
`myBest` is null, so neither branch of the rank sentence renders and the run simply is not
in the table below. The teacher's half of `0154`'s promise is true of the data and not yet
true of anybody's day -- the console defaults to a 30-day look-back, has no notification or
badge, and **nothing in `src/` links to `/gauntlet/run-review` at all**. And a leaderboard
row carries no status of any kind today; membership is binary, so this default is the first
status a board row would ever have. The honest counter is recorded beside it: a held state
is a public mark on a public board, and most runs it catches are the cheat `0152` says no
elapsed floor can distinguish from a very fast honest run.

**20, `idea-maps-guesser-game`.** Mr. Pina asked for it to be recorded and deferred it
until the map has more depth; the default recorded is "not now, revisit when the viewer has
real content." **This is the first record of the idea anywhere** -- a sweep found exactly
one mention in the tree and it was 0109's own ledger entry commissioning the file. So the
entry spends most of its length writing down what the idea IS, once, legibly: the viewer's
staged descent run backwards, show the leaf and ask for the path.

"More depth" is made checkable rather than left as a feeling, using the spec's own
sentence: section 8 says "One real room fully cataloged is the acceptance artifact." Every
P1 mechanism has shipped and one P2 item was pulled forward; what has not been confirmed is
the artifact, and a checkout structurally cannot confirm it because row counts are a
property of the production database. `0172`'s header is the best statement of the
constraint, written about a different feature: "a map nobody can help fill is a map that
stays half empty." Three things the eventual scoping must answer are named so they are not
discovered mid-build, the first being that `/maps` is public with no session and section
5.4 logs searches with "no identity (readers are anonymous)", so a scored game has nobody
to attribute a score to.

Both entries claimed the next free numbers at HEAD and both may have to move under
`docs/decisions/README.md`'s earlier-creating-commit rule. All `refs/remotes/` were scanned
first: 18 is the highest everywhere, so 19 and 20 were free when they were written.

## Ledger 0104

Written retrospectively, which is why the number sat as a gap between 0103 and 0105 for a
day. It records that the `mrpina-dev/IDEA` portal's copy of the IDEA-Blade rulebook was
replaced by a redirect to `https://ideabosco.com/assignments/IDEA-Blade_Rulebook_v2_2`, by
hand, on 2026-09-09, because two cloud sessions were refused write access to that
repository.

The half worth recording is what it did NOT touch. **The portal's six
`idea113-blade-*.html` files still answer at their flat URLs, md5-identical to their
pre-fix versions**, and the md5 table in the entry is prompt 0105's own measurement of the
served bytes. The portal's index already stopped linking them -- its root is a redirect
notice and `/IDEA/assignments/...` is a 404 -- but the flat `/IDEA/idea113-blade-<nn>.html`
paths are all still 200, so a bookmark or a QR code minted last year still reaches an
unfixed copy of `-01`. Redirecting the rulebook closed one door and did not close those
six, and that is still owed.

`Status: deployed` is set by reading the served artifact, which is the only reading
available, and the entry says so rather than letting a report look like a confirmation.

## THING FOUR: two project-knowledge problems, reported and NOT fixed

The 2026-09-09 sweep found two more files wrong, and **both are wrong in project knowledge
rather than in this mirror, which makes the fix a re-download and never an edit here.**
This bundle owns them and deliberately changed neither.

- **`IDEA_INTERFACE_STANDARDS.md` is stale in project knowledge by 24 lines.** The mirror
  is at 2.12 / 2026-09-05 and **328 lines**, header and newest changelog entry agreeing.
  A project-knowledge copy 24 lines short is a copy that is missing content the mirror has.
- **`IDEA_VERIFICATION_ADDENDA.md` is self-inconsistent in project knowledge**: header 2.4
  against a newest changelog entry of 2.3. The mirror is **internally consistent at 2.4 /
  2026-09-07**, header and changelog head both reading 2.4, over 433 lines. So the project
  knowledge copy is either a 2.3 file with its header bumped, or a partial re-upload.

**Re-download both from `docs/standards/`; do not edit the copy in project knowledge.**
Editing the project-knowledge copy of the interface standards would rewrite from a base
that is 24 lines short, which is the silent-deletion failure the freshness protocol exists
to prevent, and editing the addenda copy would carry a 2.3 body forward under a 2.4 header.
Note that `tests/standards-version-header.test.ts` cannot see either problem: it refuses a
copy whose statements disagree only once that copy has LANDED in the mirror, and neither
of these has. The mirror is clean on both, which is exactly what makes the mirror unable to
report it -- the asymmetry the freshness section already states in words.

## Verification

- `npm test`: **327 files, 6525 tests, all passing**, 314.79s. Identical file and
  test counts to prompt 0105's run earlier the same day, which is expected: this bundle
  adds no test and touches no file any test reads except the two documents
  `tests/standards-version-header.test.ts` and `tests/claude-md.test.ts` sweep.
- `tests/standards-version-header.test.ts` run on its own after the standards edit and
  again after the register edit: **21 tests, all passing.**
- `tests/claude-md.test.ts`: **passing**, which matters because this bundle touched no
  source file and `CLAUDE.md` names none of the documents edited here.
- `npm run history:verify`: **168 entries reassembled, 2,252,747 bytes, sha256 identical
  against `ea9f043b6c:docs/HISTORY.md` by both the git byte compare and the pinned hash.**
  This entry is parsed by the same run and passed its structural checks.
- Every replacement in `IDEA_instructions.md` was asserted to occur EXACTLY ONCE before it
  was applied, in a script that exits on any other count. Nine, then three, then the
  changelog insertion, all reporting one match.
- `grep -n ultracode` over the edited file afterwards: eleven hits, ten in the corrected
  prose and one in the 4.23 changelog entry, which is left alone on purpose.
- No em dash or en dash was introduced: `git diff` of added lines against `[—–]` returns
  nothing.

## NOT verified

- **Nothing about `mrpina-dev/IDEA` was checked in this session.** `add_repo` was denied to
  a previous session and was deliberately not retried here; every claim about that
  repository in ledger 0104 comes from Mr. Pina's report plus prompt 0105's fetch of the
  portal's served bytes on 2026-09-09. Whether the redirect is a meta refresh, a Pages
  configuration or a rewritten file is not recorded because nothing here can see it.
- **The project-knowledge copies of the two files in THING FOUR were not read.** No session
  can read project knowledge. The line counts and version numbers reported for the mirror
  were measured here; the staleness figures for project knowledge are the sweep's, quoted.
- **No live Supabase, no signed-in session, no browser pass.** This bundle changes no
  route, no component, no stylesheet and no SQL, so there is no rendered surface to
  measure. `npx svelte-check` was not run as a baseline for the same reason: no file under
  `src/` was touched, and the 13 phantom errors a checkout with no `.env` reports would be
  the only thing it had to say.
- **Whether `0154` and `0152` are APPLIED to production is not derivable from this tree**
  and was not checked. Decision 19 says so in its own tree-check line and points at
  `tools/deploy-probe.mjs`.
- **The decision numbers 19 and 20 are free at HEAD and cannot be reserved.** If another
  session claimed either between this branch being cut and its merge, the
  earlier-creating-commit rule moves whichever landed second, and that is expected rather
  than a fault.

## Reported, not fixed

- **`CLAUDE.md` lists seven maps migrations and there are eight on `origin/main`**:
  `0164` (search-log retention) and `0186` (the `maps-media` anon listing close) are
  missing from its IDEA Maps paragraph, which names `0161` through `0165`, `0168` and
  `0172`. This bundle owns no source file and no `CLAUDE.md`.
- **`IDEA_MAPS_SPEC.md` is one known step behind the build**: it still shows student editor
  grants at P2, which `0172` moved to P1 on 2026-09-02. It is a standards file this bundle
  does not own.
- **The 4.24 changelog entry in `IDEA_instructions.md` carries no `(4.24)` version tag**,
  unlike every other entry in that changelog. It is a labelling gap in a historical entry
  and outside the four corrections this bundle was given, so it was left. It is harmless to
  the test, which reads no version out of a date-keyed entry at all.
- **`p_fast_finish_seconds` is a per-request query-string parameter**, not a stored
  setting, so a teacher who narrows the review console's floor is looking at a threshold
  the board does not share, with nothing reconciling them at read time. Written into
  decision 19 as something the eventual settings work should probably own.

## Not written

No `classroom-updates.json` entry. The standing directive is for a change to what a CLASS
sees, and nothing here reaches a student: three internal records, one standards document,
and a report.
