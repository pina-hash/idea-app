---
title: "Nine rules earned in two days, written into the file that owns each: the Supabase editor shows no `raise notice`, a probe that examined nothing has to say so, landed is not deployed, and five things Mr. Pina said about how an answer should read (`claude/dazzling-ramanujan-i2hry6`, ledger 0205)"
date: 2026-09-13
branches: [claude/dazzling-ramanujan-i2hry6]
migrations: []
subsystems: ["Standards", "Documentation", "Verification"]
---

A standards-only bundle. Nothing under `src/` moved, no migration was written,
and the whole of it is three files: `IDEA_VERIFICATION_ADDENDA.md` 2.5 to 2.6,
`IDEA_instructions.md` 4.26 to 4.27, and the two `REGISTER.md` rows that name
them.

## The ownership split decided where each rule went, and the prompt's grouping did not survive it

The prompt delivered twelve numbered items under one heading -- "seven rules
earned" -- with the first three routed to `IDEA_VERIFICATION_ADDENDA.md` and the
remaining nine routed to `IDEA_instructions.md` "in session control and prompt
hygiene". Two things about that grouping were wrong on contact with the files,
and both were resolved toward the ownership rule in
`IDEA_REPO_WORKFLOW_STANDARD.md`'s header rather than toward the prompt's
sentence.

**The count.** Three plus nine is twelve, not seven. Nothing was dropped and
nothing was merged to reach the header's number; all twelve are written. The
heading is a miscount in the prompt, reported rather than reconciled, because
reconciling it would have meant deciding which five of Mr. Pina's stated rules
were not really rules.

**The destination.** Only three of the nine belong in session control and prompt
hygiene. Rule 5 says so in its own text -- it amends the manual-instruction
format -- and rules 8 through 12 are about how a chat REPLY reads, which is
`Communication Style`'s subject and not prompt hygiene's. Filing them where the
prompt said would have put five bullets about answer length inside a section
whose first line is "These are not style notes." So each rule is written where
its subject already lives:

- **Rule 4** (a migration range goes stale) as a new `###` immediately after
  "A measured number in a prompt carries a date and a source", which is the rule
  it specializes. That section already lists "a migration range that omitted the
  most dangerous file in it and included one that did not exist" among five wrong
  figures handed to sessions in one day, so the new section is that line's
  general case.
- **Rule 5** (give the URL, not a route through the menus) as rule **13** of the
  manual-instruction format's own numbered list, which ended at 12.
- **Rule 6** (a push is a build) immediately after the existing paragraph "The
  app commits to `idea-app` main on its own, and every commit deploys", which is
  the claim it sharpens: that paragraph names the mechanism and this one names
  the unit.
- **Rule 7** (a decision entry's status line) beside "Decisions owed to
  Mr. Pina are one list", which is where the `Status` line is introduced.
- **Rules 8 through 12** as five bullets in `Communication Style`, directly after
  "Minimal and direct", which is the bullet they extend.

## Rule 41 corrects a Hard Rule in the other file, so the two had to move together

`IDEA_instructions.md` has said since 2026-08-29 that delivered, landed and
applied are three states and that **a migration is the only artifact where all
three come apart.** Rule 41 is that sentence being false: code has the same
three, and its third is DEPLOYED.

A standards file carrying a rule that another standards file's new rule
contradicts is the drift this repo's documentation section exists to prevent, so
the Hard Rule was amended in the same commit -- "the artifact where all three
come apart LOUDLY", with the correction dated, the code case stated in one
clause, and a pointer to rule 41 rather than a second statement of it. That is
the "edit it in place, put the reasoning in the history entry" rule applied
across two files instead of within one.

**Why the asymmetry in that word matters.** An unapplied migration is loud: the
RPC is missing, the feature errors, somebody finds it within a period. An
undeployed build is silent in the way the whole verification file is about --
every check green, every branch merged, every report accurate, and the work
reaching nobody. The rule is not that the migration case was wrong; it is that
the migration case was the one that announced itself, which is why it got a rule
and the code case did not.

## Where rules 39 and 40 were filed, and the counting that decides it

The prompt says rule 1 "is the eleventh member of the family already in this
file: a green signal over an instrument that never spoke." The family is real and
is named twice in the file already -- the internal-organization note groups rules
4, 5 and 8 and adds 17, 18, 19 and 20 to them, and the 2.5 changelog files 37 and
38 there explicitly. That is **nine** documented members, so one new rule makes
ten and the pair makes eleven.

Rather than assert an ordinal a reader cannot check, both the rule text and the
changelog **enumerate the nine by number** and say the two new ones bring the
group to eleven. The figure is then true, and it is checkable against the file it
is written in -- which is the form `CLAUDE.md` asks for when a claim could be
checked, and the alternative is the kind of number that has now been found stale
in that file five times.

What is new in 39 and 40, and what is written down as the distinction: the other
nine describe an assertion that never reached what it named. **These two describe
a check that DID reach its subject and DID compute the right answer**, and lost it
to a channel that prints nothing, or asserted it over a population that was not
there. The failure is downstream of the assertion rather than inside it.

## The one figure this session could not verify, and the rule that says so

Rule 6 quotes ledger `0204`'s audit: 59 of the 794 commits to `main` in seven
days were exports touching `materials/` only. **That figure is quoted with 0204's
name and date on it and was NOT re-derived here, deliberately.**

The first attempt to re-derive it returned 482 commits and 17 materials-only
commits over the same window. Both numbers are fiction: `git rev-parse
--is-shallow-repository` answers `true` in this container, and
`IDEA_VERIFICATION_ADDENDA.md` rule 32 is precisely that a shallow clone answers
history questions wrongly rather than refusing. The measurement ran, returned a
plausible pair of numbers, and had no way to say it was walking a truncated
graph. So the rule quotes the audit and writes the container limit into itself,
which is rule 12's requirement that an environment limit be recorded where the
next session will hit it.

**What the shallow graph CAN show, and does**, is the mechanism the rule is
actually about: `IDEA-BLADE | PART 1` exported `r6` on 2026-09-09 and `r7`, `r8`
and `r9` on 2026-09-10 as four separate commits, `r10` on 2026-09-11, and
`Shop Trophy: Portfolio Capture` exported `r1` three times and then `r2` and `r3`
in one day. One revision per commit, each one a push, each push a build. The
count is 0204's; the shape is visible from here.

## Ledger 0204's own files were never opened

0204 owns the Vercel audit and the verification SQL. Neither its history entry
nor its audit was on `origin/integration` at branch time -- `docs/audits/` holds
the 2026-07 security audit, the 2026-09-12 read-back and the 2026-09-13
tournament dry run, and nothing from 0204. So the prompt's instruction to read
its history entry could not be honoured, and this is reported rather than worked
around, which is `IDEA_instructions.md`'s own rule about citing a document
without confirming a session can read it. Rule 6 names the audit as the source
and marks its numbers as 0204's claim; when 0204 lands, the pointer resolves.

## What was measured

- **The duplicate check, three ways, all clean.** No `entries/0205-*` on
  `origin/integration` or `origin/main` (highest is `0203`); no commit subject on
  any ref matching `ledger 0205` case-insensitively; no document anywhere matching
  `ledger 0205`, `prompt 0205` or `entries/0205`. Every `0205` already in the tree
  is the MIGRATION `0205`, a different sequence, which is why a bare `grep 0205`
  returns thirty hits and answers the wrong question.
- **Both standards files fetched by `git clone`**, sparse on `docs/standards`, at
  `origin/integration` -- never `curl` on `raw.githubusercontent.com`, which was
  six versions stale on 2026-09-01. The identity check passed: clone and working
  tree are byte-identical by md5 for all three files
  (`IDEA_instructions.md` `8f8cb594bbef7b235e4319290e175c89`,
  `IDEA_VERIFICATION_ADDENDA.md` `61c8eae100a4786b9370f2b7722a9796`,
  `REGISTER.md` `bda5ad4d6d9a366260c1e660326ff9cc`), at 4.26 and 2.5, which is
  what the prompt said the mirror held.
- **`svelte-check` at branch time on `origin/integration` at `78516fa`: 0 errors,
  37 warnings in 20 files**, breakdown 31 `state_referenced_locally`, 5
  `css_unused_selector`, 1 `perf_avoid_nested_class`. That is `CLAUDE.md`'s stated
  baseline exactly, in both the total and the mix, so the line needed no
  correction for the first time in five readings. Measured after exporting
  placeholder `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` and running
  `npx svelte-kit sync`, without which the container reports its phantom errors.
- **Header agrees with the newest changelog entry in both files**, checked by
  reading line 2 and the first `- **` under `## Changelog` in each, which is what
  `tests/standards-version-header.test.ts` compares along with the `REGISTER.md`
  row.
- **No em dash and no British spelling in any added line**, swept over the diff.

## What was NOT verified

- **Ledger 0204's audit**, for the reason above: not on the branch point.
- **Any commit count**, for the reason above: the checkout is shallow.
- **No browser pass**, by the prompt's instruction. Nothing in this bundle
  renders.
- **Nothing was measured against the live Supabase project.** No migration was
  written and none was needed.
- **The claim inside rule 41 that production served `0188`'s build for over a
  day** is the prompt's, dated 2026-09-13. The version string production serves
  at the end of this session is reported in the session's own reply rather than
  written into the standard, because it is a reading and not a rule.

## Deferred

- **Whether rules 39 and 40 should be merged into one rule** about the reporting
  channel, with the empty-population case as its second half. They are two
  numbers because the prompt specified two and because the evidence is two
  distinct failures of one probe, but the internal-organization note already
  observes that several neighbouring rules read better together than apart. A
  reorganization of that file should take them with rules 4, 5, 8, 17, 18, 19, 20,
  37 and 38.
- **`IDEA_instructions.md` is now 3,700 lines** and the five communication
  bullets added here sit in a list of seventeen. Nothing about that is wrong yet;
  it is worth saying once that the file's own advice about answer length now
  applies to the file.
