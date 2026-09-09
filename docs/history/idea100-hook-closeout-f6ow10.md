---
title: "IDEA100 hook phase closeout: `IDEA_instructions.md` to 4.24, the assignment-spec validator lands, and four delivered instruments that deliberately do not (`claude/idea100-hook-closeout-f6ow10`, no migration)"
date: 2026-09-09
branches: [claude/idea100-hook-closeout-f6ow10]
migrations: []
subsystems: ["Standards", "Tooling", "Documentation", "Curriculum"]
---

The closeout for the chat "IDEA100 Hook Phase, Days 10 to 15". That chat delivered
eleven artifacts; exactly one of them is this repository's to carry, and the
closeout's job is to land it, verify it, and say plainly what happened to the rest.
Nothing in `src/` moved and no migration was written or permitted.

## The mirror: four surgical edits, not a copy-in

`docs/standards/IDEA_instructions.md` went 4.23 to 4.24. The delivering chat also
handed over a complete 4.24 file, and it was NOT used. It authored its edits against
this mirror at 4.23 and named each CURRENT block for exact match, so applying the
four edits is the operation that was specified and a whole-file overwrite is a
different, unreviewable one. All four blocks matched uniquely on the first read;
none needed a near match and none was guessed.

**The delivered file and the applied result differ by exactly one byte**, and it is
a pre-existing trailing blank line in the mirror rather than anything these edits
did. The prompt stated its base at 250,647 bytes; the committed mirror was 250,648
and had been since `c66ddf4`. The applied result is 253,890 against a delivered
253,889, the same gap carried forward. It was left alone: removing it is not one of
the four edits, and "do not rewrite the file" is the instruction that matters more
than a byte of cosmetic agreement.

What 4.24 adds: the American spelling rule, first delivered as 4.10 on 2026-08-30
and lost when a parallel chat carried 4.9 to 4.23 without it; verify against the
exported artifact on the server rather than a local reconstruction; and a vendor
document answering an adjacent question is not an answer to yours. It also stops
stating the print trigger count, which now comes from `IDEA_MATERIALS_PROCESS.md`
alone -- a count carried in a second document is how the original deletion of
trigger 5 stayed invisible.

`REGISTER.md`'s `IDEA_instructions.md` row moved to 4.24 / 2026-09-08. The `Owns`
cell was not touched, on the prompt's instruction to match the leading portion and
keep the rest of the row exactly as it is.

## The surface grew mid-session, and the ledger entry grew with it

The prompt's file surface was two standards files. `tools/validate-assignment-spec.py`
was added to it on Mr. Pina's instruction, on the argument that it completes an
existing pair rather than opening a new surface: `tools/validate-reference-spec.py`
has been in the repo since 0092 and has had no assignment counterpart, and that gap
is why a two-level rubric criterion reached the engine on 2026-09-04 and was caught
by the app rather than by a check.

**The ledger entry was amended in the same session rather than after it**, because
the ledger keys on declared file surface and a surface that grows without the entry
growing is worse than the growth itself. Before landing the file, every `claude/**`
branch touching `tools/` was checked against its own `Owns` line: six do, and not
one declares `tools/` as a prefix -- each names `tools/apply-migration.mjs`,
`tools/gauntlet-doc-check.mjs`, or a specific `tools/browser-verify/routes/*.mjs`.
No intersection, so no collision.

**The entry's id was allocated by this session and that is a deviation worth
recording.** `docs/prompt-ledger/README.md` puts allocation with the issuing chat;
this closeout prompt arrived with no entry written for it, so there was nothing to
amend. 0101 is the next free id read across `origin/main`, `origin/integration` and
all 34 `origin/claude/**` refs. An entry written after the fact records history
rather than preventing a collision, which the README already says.

## The validator bites on real published material

It runs from the repo unchanged -- it takes argv paths -- and putting all eleven
IDEA100 assignment exports through it returns exit 1 with four failing:

- `v1-checkpoint-your-first-hook`: weekdays (Monday, Thursday), British spellings
  (`Centre`, `Centres`, `centre`), no Sources block
- `inspection-lab-reading-a-failed-hook`: British spellings (`Centre`, `centre`),
  no Sources block
- `dog-tag`: weekday (Monday), no Sources block
- `documentation-check-1-manufacturing-and-assembly`: no Sources block

Seven pass. **Nothing was edited to make them pass.** These are files under
`materials/`, which the app writes on every item save with no human involved, and
which no branch may touch; the fix is upstream in the spec and then a republish.
The British-spelling hits are the same defect 4.24's new rule was written for,
still sitting in front of students, which is the argument for the rule rather than
against it.

**One usability defect in the tool as delivered, reported and not fixed**: it prints
`FAIL  assignment.json` using the basename alone, so a run over eleven exports that
all share that basename cannot be read without a per-file loop. Repairing it needs
someone who can test the repair against the tree, which is the same reasoning that
kept the other four instruments out.

## The four instruments that did not land, and why each did not

- **`sweep_spelling.py`** is hardcoded to `glob.glob("/mnt/user-data/outputs/*")`,
  a chat-sandbox path. It would run from the repo and sweep zero files while
  reporting `FAILING: 0`, which is the worst failure shape available: a clean
  result from an instrument that read nothing. A tool that has to be repaired
  before its first run is repaired by whoever can test the repair. Worth noting
  that its `QUOTES_ON_PURPOSE` map already exempts `IDEA_instructions.md` and
  `*_MIRROR_PROMPT.txt` by name and pattern, so the counterexample list in the
  rule itself is handled correctly.
- **`render_reference_pdf.py`** overlaps `tools/render-print-material.py`. Landing
  it gives the repo two renderers with nothing saying which owns reference PDFs,
  which is the two-copies-of-one-rule shape this project keeps paying for. Which
  one owns it is a decision, not a merge.
- **`sim_composite.py`** and **`sim_icons.py`** are single-use instruments for the
  simulation walkthrough, which is finished and shipped. They belong in the
  Library C IDEA100 folder as archive, not in `tools/`, where anything present is
  read as maintained.

## D14 v7 has not landed, measured rather than assumed

The chat's D14 delivery edited the live export at
`materials/idea-100/v3-your-final-hook` from v6 to v7, adding one block id
`project-file` to the printing module. That export currently carries
`exportedAt: 2026-09-04T07:23:14.923Z`, and its printing module holds
`instructions`, `ready-checks` (checklist), `instructions` and no `project-file`.
So v7 is delivered and unpublished. This is a state, not a defect: the spec is
Mr. Pina's to publish, and the export rewrites itself when he does.

This is also the first bundle to apply 4.24's own new rule to itself -- the
publication state was read off the exported artifact in this repository rather
than off any reconstruction of the spec.

## Two inherited open items, one of which does not reproduce

Both were reported by the 2026-09-08 sweep and neither was caused by the closing
chat.

- **`IDEA_INTERFACE_STANDARDS.md`: project knowledge 2.11, mirror 2.12.** Stands,
  and is not fixable from here. The mirror is ahead, `REGISTER.md` agrees with the
  mirror at 2.12, and `tools/standards-sweep.py` reports the directory consistent.
  What is stale is the copy in project knowledge, which is Mr. Pina's to re-upload.
- **`IDEA_VERIFICATION_ADDENDA.md`: header 2.4, newest changelog entry 2.3.** DOES
  NOT REPRODUCE in the mirror. Its newest changelog entry is
  `- **2.4 (2026-09-07)**`, matching the header, landed by `c66ddf4` under ledger
  entry 0100. `tests/standards-version-header.test.ts` is green on it, and that
  test is exactly the instrument that would refuse the mismatch. Either the sweep
  read the project-knowledge copy, or the copy in project knowledge has the 2.4
  header without the 2.4 changelog entry. The mirror is correct either way, and the
  register row at 2.4 is correct with it.

## Verified

- The prompt's own seven checks, read back from the committed file rather than from
  the diff: line 2 is `**Version 4.24 - 2026-09-08**`; `American spelling, everywhere`
  matches at line 1790; `four print triggers` returns NOTHING, reported explicitly
  rather than silently; the changelog carries `- **2026-09-08** - Re-lands the
  American spelling rule` at line 2675; 40 `^#{1,3} ` headings; 12 ``` fences; and
  `REGISTER.md` reads `| `IDEA_instructions.md` | 4.24 | 2026-09-08 |`. The heading
  and fence counts are unchanged from 4.23 because none of the added text is a
  heading or a fence.
- `npx svelte-kit sync && npx svelte-check`: **0 errors, 37 warnings**, the
  baseline exactly, with the two `PUBLIC_SUPABASE_*` placeholders exported before
  the sync so the 13 phantom errors do not appear.
- `tests/standards-version-header.test.ts` and `tests/claude-md.test.ts`: 46 tests,
  all passing. The new changelog entry is date-keyed (`- **2026-09-08**`), which
  keeps `IDEA_instructions.md` inside that test's deliberate structural exemption
  from the header-vs-changelog comparison; a version-keyed entry would have changed
  which branch of that test the file takes.
- `tools/standards-sweep.py`: register, mirror and directory agree.
- The British-spelling forms in the added text appear only inside the rule's own
  counterexample list (`Not centre, colour, behaviour, ...`), checked against the
  diff rather than against the file, which is the quotation the rule exempts.
- `npm ci` was used to restore `node_modules`, never `npm install`; the
  4,649-line lockfile is untouched.

## Not verified

- **Nothing was run against the live Supabase project.** The local `.env` is the
  placeholder project and this container cannot reach production.
- **No browser pass.** Nothing in this bundle renders: no `src/` file, no route and
  no component changed, so there is no surface for `npm run verify:browser` to
  measure. It was not run and is not claimed.
- **The full suite was not run.** Two test files were, being the two this bundle can
  affect. Nothing here can reach a database test or a component.
- **The project-knowledge copies of both standards files were not read**, and cannot
  be from a session. Every claim above about project knowledge is inference from the
  mirror plus the sweep's own 2026-09-08 report, and is labelled as such.
- **Whether students are in class right now.** This session has a clock and no
  timetable, and did not merge to `main`.
