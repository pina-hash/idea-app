---
title: "The last four things: a sub-30-second pass counts, the quiz distractors catch up, decision 06 flips, and the feedback box sends once (`claude/prompt-0099-last-four-2dbr68`)"
date: 2026-09-07
branches: [claude/prompt-0099-last-four-2dbr68]
migrations: []
subsystems: ["GAUNTLET", "FRC Training", "Operations", "Feedback", "IDEA Classroom", "IDEA Foundry", "Notebook"]
---

Prompt 0099, the closing bundle. No migration written and none applied: 0190
and 0191 were claimed and neither was needed, so the highest migration on
`main` stays 0189. Started from `origin/main` at `ba2f5bab`.

## ONE: a sub-30-second GAUNTLET pass counts as cleared

### A1, what 0154 refuses and where the two questions were conflated

`0154_gauntlet_rank_what_is_checkable.sql` adds one term to the
`gauntlet_leaderboard` VIEW's inner predicate:
`and (s.value ->> 'elapsed_ms')::numeric >= 30000`. A Speedrun pass whose
server-stamped clock (`now() - gauntlet_run_tokens.started_at`, the one number
in the ranked path a client cannot choose) is under thirty seconds is dropped
from the RANKING. Its header measures the reason: a reveal, start and submit
back to back with no modelling in between held rank one at six milliseconds.
The number is 0152's review-console threshold on purpose, so every run the
board refuses is one `gauntlet_run_review` already lists. The same header
states, correctly, that `gauntlet_macro_submit` is untouched: a sub-floor run
still returns `is_correct`, still writes its `submissions` row, still consumes
its token. Only the board declines it.

That is the forgery control, and it stays. The conflation is on the READ side:
"is this run implausibly fast" (the board's question) and "has this student
cleared this level" (a history question) were being answered from the same
view, so a level a student had genuinely passed in under thirty seconds read
as not cleared wherever the reader was the board. Four list loaders had
already been moved onto `submissions` for this (prompt 0154's follow-up,
`tests/gauntlet-leaderboard-history.test.ts`). Three readers had not:

- `src/routes/gauntlet/+page.server.ts:28`, the home page's per-mode "cleared"
  count driving the mode-select grid.
- `src/lib/gauntlet/next-challenge.ts:31-38`, `nextUncleared`, which decides
  the suggested next drawing on the post-run screen, so a sub-floor clear kept
  being offered as the next thing to do.
- `src/routes/gauntlet/feature-golf/+page.server.ts:47` and
  `reverse-engineer/+page.server.ts:48`, `cleared: best !== undefined`, where
  the defect is worse than a floor: 0146 took both modes OFF the board's
  allowlist (only `speedrun` ranks among macro modes), so `cleared` on those
  two list pages has been unconditionally false since 0146.

0154's header calls the first two "NOT AFFECTED" because they "filter
`is_correct` themselves". True of a wrong knowledge answer, which the row
carries; false of a fast correct modelling run, which is not in the view to be
filtered.

Could the code express "excluded from the board but cleared" before this
bundle? At the four list loaders already fixed, yes, and that is the shape
reused. At the three sites above, no.

### B1, what was built

Three readers moved onto the student's own `submissions` rows, the shape the
four fixed list loaders already use, with the board kept for time and rank:

- `src/routes/gauntlet/+page.server.ts`: `cleared[mode]` is the number of
  DISTINCT published challenge ids the student has an `is_correct` row on,
  intersected with the loader's own published list so a clear on a
  since-unpublished level cannot push cleared above the total (the view had
  `where c.published`; submissions do not). Two passing runs on one level
  count once.
- `src/lib/gauntlet/next-challenge.ts`: `nextUncleared` reads the same rows.
  Signature and ordering unchanged.
- `feature-golf/+page.server.ts` and `reverse-engineer/+page.server.ts`: the
  speedrun loader's exact shape, so those two lists show a clear for the
  first time since 0146.

**The leaderboard does not move.** No migration; the view, the thirty-second
floor and 0146's allowlist are untouched. A sub-floor pass still holds no
board seat and still shows no time or rank on any list; it is counted as
cleared on the home page, stops being offered as the next drawing, and its
level reads cleared on the list pages, which it already did for Speedrun.

**Proof**, in `tests/gauntlet-leaderboard-history.test.ts` (35 -> 38 tests,
against a real Postgres with 0154 applied over a forged 6 ms pass, an honest
backdated one, an untouched student, and a second forged pass on the same
level for the double-clear case): the real home `load` and the real
`nextUncleared` are driven through the shim; every assertion about a level
names it by title; temp-sibling mutants that revert each read to the board
answer WRONG for the sub-floor student and RIGHT for the others, and a
naive-count mutant answers 2 for the double clear. Two things the instrument
cannot check are stated in the file rather than papered over: the shim keeps
only the last `.order()`, so the difficulty leg of the ordering is outside
what it proves, and the shim has no `.neq`, so the just-played exclusion is
applied as a post-filter over real-RLS rows. `0019_gauntlet_purge_demo.sql`
joined the chain, because the three seeded demo Speedrun levels otherwise sit
in the published set and are offered first.

**The hand control the prompt asked for**, run twice: with both fixes reverted
in the working files, the file fails 6 of 35 with "sub-floor speedrun clear
not counted on the home page: the level still reads as locked: expected +0 to
be 1" and "sub-floor speedrun clear not recognised: the cleared level is
re-offered as next"; restored from the `cp` copies, md5
`ccb63935f79c857730097ba9d69e8dba` (next-challenge.ts) and
`3a3ae18e78c2c2791b468210f5a989ae` (+page.server.ts) equal on copy and
restored file, 35 green. Then with the distinct count reverted to a per-row
`+ 1`: "double clear on History fixture: speedrun (two passing rows, one
level) counted twice instead of once: expected 2 to be 1", restored to
`3a3ae18e78c2c2791b468210f5a989ae`, 38 green.

Not verified: the live project, and a browser render of the mode grid with a
real session (the harness cannot hold one).


## TWO: the FRC quiz distractors catch up

### A2, the instrument before any edit

`npm run frc:bias` on the tree at `ba2f5bab`: 140 items across 10 banks, the
single longest option correct **95 times, 67.9%** against 25% at chance; a
longest-only student clears MDM-10 in 1.75 attempts. Per bank (draw / need /
longest-is-answer / P(pass) longest-only):

| Bank | Items | Draw | Need | Longest-is-answer | P(pass) longest-only |
|---|---|---|---|---|---|
| MDM-10 | 14 | 6 | 6 | 13/14 (92.9%) | 57.1% |
| F5 | 10 | 6 | 6 | 9/10 (90.0%) | 40.0% |
| F2 | 10 | 6 | 6 | 8/10 (80.0%) | 13.3% |
| F4 | 10 | 6 | 6 | 8/10 (80.0%) | 13.3% |
| MDM-1 | 32 | 10 | 9 | 21/32 (65.6%) | 5.6% |
| MDM-2 | 14 | 6 | 6 | 8/14 (57.1%) | 0.9% |
| MDM-3 | 14 | 6 | 6 | 8/14 (57.1%) | 0.9% |
| MDM-9 | 14 | 6 | 6 | 8/14 (57.1%) | 0.9% |
| F1 | 12 | 8 | 8 | 7/12 (58.3%) | 0.0% |
| F3 | 10 | 6 | 6 | 5/10 (50.0%) | 0.0% |

"To shut the gate" (the smallest number of items per bank that puts a
longest-only student under 1% per attempt, worst give-away first, from
`fixesNeeded`): MDM-10 5, F5 3, F2 2, F4 2, MDM-1 4, the other five 0.
Sixteen. The sixteen, with every option and its character count, are in the
before-and-after list under B2; each is also in the committed
`docs/frc/quiz-bank-bias-report.md` as it stood before this bundle.

### B2, every edited option, before and after

Twenty-one options across the sixteen items. No correct answer, stem, option
order, answer index, id or objective moved; no absolute word was added or
removed; on every edited item at least one distractor is still shorter than
the answer, so the answer is never the uniquely shortest option either. The
technique is restatement only: the thing a short phrase left as a pronoun is
named, or the claim is said a second way in the register the options already
use. Where a first draft borrowed a word from the correct answer ("bore" on
`m10-14`, "spending time ... prototype" on `m1-026`), spelled out a consequence
the original left to the stem (`m1-031`), moved a purpose to a timing
("the off-season is the time to" on `qf2-08`), or restated a term with its
own words ("Practice matches, the matches played for practice"), an
independent review flagged it and the option was rewritten; the list below is
the final text.

- **F2 `qf2-07`**, "What are the playoffs?" (answer, untouched: "Elimination rounds that decide the winner", 41 characters)
  - option 1: "Practice matches" (16) -> "Matches that the teams play in order to practice" (48)
- **F2 `qf2-08`**, "What is the off-season for?" (answer, untouched: "Learning skills, training new members, and preparing", 52 characters)
  - option 1: "Nothing happens" (15) -> "Nothing happens during the off-season" (37)
  - option 2: "Taking apart the shop" (21) -> "Taking apart the shop that the team builds its robots in" (56)
- **F4 `qf4-05`**, "What does testing do?" (answer, untouched: "Shows what works and what to fix", 32 characters)
  - option 1: "Ends the project" (16) -> "Testing ends the project" (24)
  - option 2: "Proves you are done" (19) -> "Testing proves that you are done" (32)
- **F4 `qf4-06`**, "A test failed. What is the healthy response?" (answer, untouched: "Learn what to fix and try again", 31 characters)
  - option 2: "Hide it" (7) -> "Hide the failure" (16)
  - option 3: "Blame the tools" (15) -> "Put the blame on the tools that were used" (41)
- **F5 `qf5-01`**, "What is the engineering notebook?" (answer, untouched: "The team's written record of what it did, why, and what it learned", 66 characters)
  - option 1: "A list of team members" (22) -> "A list of the team members, with the names of the people who are on the team" (76)
- **F5 `qf5-06`**, "What is a good test of an entry?" (answer, untouched: "Could someone else continue your work from it", 45 characters)
  - option 1: "Is it colorful" (14) -> "Is the entry colorful when you look at the page" (47)
- **F5 `qf5-07`**, "Why write down why you chose something?" (answer, untouched: "So the team remembers the reason and does not re-argue it", 57 characters)
  - option 3: "To confuse judges" (17) -> "The purpose of writing down why you chose it is to confuse the judges" (69)
- **MDM-10 `m10-06`**, "A feature control frame specifies what?" (answer, untouched: "A geometric control, a tolerance zone, and datums", 49 characters)
  - option 2: "The material" (12) -> "The material the part is made from" (34)
  - option 3: "The part number" (15) -> "The part number that was assigned to that particular part" (57)
- **MDM-10 `m10-07`**, "Datums are what?" (answer, untouched: "The reference features everything else is measured from", 55 characters)
  - option 3: "Title-block notes" (17) -> "The notes that are written in the title block of the drawing" (60)
- **MDM-10 `m10-09`**, "Why not put a tight tolerance on every dimension?" (answer, untouched: "Tight tolerances waste shop time, so tolerance only what needs it", 65 characters)
  - option 0: "It is against the rules" (23) -> "Putting a tight tolerance on each of the dimensions is against the rules" (72)
- **MDM-10 `m10-11`**, "A torque-carrying shaft section is often made slightly long by about how much, and why?" (answer, untouched: "About 0.01 inch, to absorb part-width and manufacturing variation", 65 characters)
  - option 0: "1 inch, to save material" (24) -> "1 inch, with the shaft section made an inch longer in order to save material" (76)
- **MDM-10 `m10-14`**, "Why does a press fit stay put?" (answer, untouched: "The part is slightly larger than the bore and is pressed in", 59 characters)
  - option 3: "Gravity holds it" (16) -> "Gravity holds it, meaning the pull of gravity keeps the part in place" (69)
- **MDM-1 `m1-019`**, "Why set constraints before sketching geometry?" (answer, untouched: "Constraints shrink the design space so the geometry has something to satisfy", 76 characters)
  - option 3: "To slow the process down on purpose" (35) -> "Setting constraints before you sketch is done to slow the process down on purpose" (81)
- **MDM-1 `m1-022`**, "Why document the reason a concept was chosen?" (answer, untouched: "It records design intent and stops the team from re-arguing the decision", 72 characters)
  - option 2: "It is required by the game manual" (33) -> "It is required by the game manual, which is where that requirement is written" (77)
- **MDM-1 `m1-026`**, "A team spends a week building a beautiful, final-quality prototype before testing the concept at all. What is wrong?" (answer, untouched: "A prototype should be fast and crude to answer a question, so polishing before proving the concept wastes time", 110 characters)
  - option 3: "They should have manufactured the real part first" (49) -> "They should have manufactured the real part first, that is, built the real part before they built the prototype" (111)
- **MDM-1 `m1-031`**, "A team jumps straight from defining the problem to detailing the design in CAD, skipping concepts and prototyping. What is the most likely consequence?" (answer, untouched: "They commit to an unproven idea and may waste manufacturing time on a design that does not work", 95 characters)
  - option 0: "They save time with no downside" (31) -> "They save time, and there is no downside to doing it" (52)
  - option 2: "The robot will automatically be better" (38) -> "The robot will automatically be better, meaning it ends up a better robot without anything more being done" (106)

**After.** The instrument on the final banks: 140 items, 79 longest-is-answer
(56.4%, from 95 and 67.9%); "to shut the gate" is 0 on every bank, 48 to
reach chance.

| Bank | Longest-is-answer | P(pass) longest-only, before | after |
|---|---|---|---|
| MDM-10 | 13/14 -> 8/14 | 57.1% | 0.9% |
| F5 | 9/10 -> 6/10 | 40.0% | 0.5% |
| F2 | 8/10 -> 6/10 | 13.3% | 0.5% |
| F4 | 8/10 -> 6/10 | 13.3% | 0.5% |
| MDM-1 | 21/32 -> 17/32 | 5.6% | 0.6% |
| MDM-2, MDM-3, MDM-9 | 8/14 (unchanged) | 0.9% | 0.9% |
| F1 | 7/12 (unchanged) | 0.0% | 0.0% |
| F3 | 5/10 (unchanged) | 0.0% | 0.0% |

The other cheap strategies stayed dead: the shortest option is right on 11
of the 116 items it fires on (worse than guessing); the most technical option
is at chance over the corpus; the absolute-qualifier tell fires on the same 9
items it always did (nothing added or removed an absolute word); the
near-duplicate row is unchanged at 22 fires / 12.

**The guard.** `tests/frc-quiz-bank-bias.test.ts` is green (36) on the
improved banks, with ONE assertion rewritten, and the reason is the reason
prompt 0059 warned about. "Stem echo is the length tell in a second costume"
pinned `echo right / disagreements <= 0.25` on the corpus of 2026-08-29,
where length was right on 8 of the 10 disagreements. Lengthening a
distractor past an answer makes the length tell WRONG on that item by
construction, so an item whose answer already echoed the stem joins the
disagreements on the echo's side with nothing about the echo having changed:
10 -> 16 disagreements, echo right 1 -> 6, and the assertion reddened on an
improvement. The durable claim is per bank: the echo fires on at most 14
items and is right on fewer than the threshold needs (MDM-1 5/9, F1 0/8, F2
1/6, F3 2/6, F4 2/6, F5 3/6, MDM-2 3/6, MDM-3 3/6, MDM-9 2/6, MDM-10 3/6), so
an echo-only student's pass probability is exactly zero on every bank. That
is what the assertion now says, per bank by name, and the report generator
prints the same numbers. The instrument's own `independenceFrom` docstring
now dates its 8-to-1 figure and says why it decays.

Controls, both restored from a `cp` copy: worsening one item outside the
sixteen (`m2-04`, its longest distractor shortened one character so the
answer became uniquely longest) reddens the guard with "MDM-2: these items
did not hand over their answer by length on 2026-08-29 and now do ...
expected [ 'm2-04' ] to deeply equal []"; lengthening one further distractor
(`m2-14`) stays green at 36; both restores md5-identical
(`de993fb114e928c6fd5897e0bbf9bd65`, and again on the first-draft file
`82245965638f49ceba9840b5d49d6b7b`). The quiz engine, route and normalizer
tests (86) read the banks and pass.

**Review.** Six independent skeptics read the edits in three rounds. Every
round agreed the CLAIMS were intact on every option; what they objected to
was wording shape: a borrowed answer noun ("bore", "spending time ... a
prototype", "the reason"), an explicit causal clause the short form left to
the stem, a purpose restated as a timing, and the "X, in other words X"
self-gloss that no correct answer in the corpus uses and so marks a
distractor. Ten options were rewritten across the rounds; the final skeptic
returned sound with four wording nits, one of which is taken.

**Nothing stopped.** No item was left because it could not be lengthened
without a new claim.

## THREE: decision 06

### A3, verbatim as found

`docs/decisions/entries/06-trusted-publishers.md` at `ba2f5bab`:

> # 06 Foundry: trusted publishers
> - Raised: 2026-08-31  By: chat "Managing multiple FRC platform projects"
> - Status: open
> - Decision:
> - Default this assistant would pick: Reviewed after the fact, with the review queue showing a trusted publisher's update as already live.
> - Why it is blocked on him: It decides which students' work reaches other students without a staff read first, which is a supervision call.
> - What it unblocks: A Foundry lane modelled on the two existing allowlist tiers.
> - Context: migrations `0155_gauntlet_authoring_tier.sql` (`gauntlet_authors`, `gauntlet_can_author()`) and `0167_frc_reviewer_tier.sql` (`frc_reviewers`) are the template; `CLAUDE.md`, "GAUNTLET AUTHOR TIER" for the allowlist shape. The open question is whether a trusted publisher's update is unreviewed or reviewed after the fact.
> - Tree check (2026-09-02): both template migrations exist on `origin/main`; no publisher tier exists for Foundry.
> - Tree check (2026-09-07): shipped by `0173_foundry_section_gate_description_and_trust.sql` section 3 (`foundry_trusted_publishers`, `foundry_is_trusted()`; a trusted student's `foundry_submit_version` publishes in the same transaction and the review queue lists it as live, not yet reviewed), and ledger 0015 records the answer. This entry's Status and Decision lines above were not updated by any bundle and are the owner's to flip; prompt 0098 left them as found.

What 0173 section 3 shipped: `foundry_trusted_publishers` (lowercased-email
allowlist mirroring `app_admins` and `gauntlet_authors`, `@boscotech.net` or
`.edu`), `_foundry_is_trusted_email(text)` and the caller-scoped
`foundry_is_trusted()` (admins deliberately NOT folded in), `foundry_trusted_grant`,
`_revoke`, `_roster`, and `student_app_versions.auto_published_at`, with
`foundry_submit_version` publishing in the same transaction for a trusted
caller and the review queue listing the build as live, not yet reviewed
(`auto_published_at set, reviewed_at null`). Ledger 0015 (issued 2026-09-02)
records Mr. Pina's answer in those words: "an admin marks a student trusted;
their publish goes live immediately and the review queue shows it as ALREADY
LIVE, reviewed after the fact rather than before." The tree check that says
the entry is stale is the entry's own second tree-check line, written by
prompt 0098.

### B3, what moved

Status is now `decided 2026-09-02; shipped the same day by prompt 0015 (0173
section 3)`, the Decision line carries the answer above, and a dated
Transition line is appended at the end of the entry. Nothing else in the
entry was rewritten; both tree checks stand as written.

**Stale the same way, reported and not flipped**, because prompt 0099 owned
entry 06 alone: 01 (the per-section class gate, 0173 section 1), 03 (the
launcher card colours; `tests/home-order-and-accent.test.ts` carries the
rewritten rationale), 05 (the required description, 0173 section 2) and 07
(not public; `FoundryPlayStats.svelte` is the owner dashboard) were all
answered in ledger 0015 and shipped by the same bundle, and all four still
read `Status: open` with an empty Decision line. 17 reads `open -> ANSWERED
2026-09-06` with its Decision line empty. `tools/idea-status.py` reads the
directory from `origin/main`, so it prints all of them as owed; after this
merge it will print five where it printed six.

## FOUR: the two defects prompt 0098's sweep found

### A4, as reproduced

The feedback box: read off `src/lib/save-state.svelte.ts` and then measured.
`typed()` called `markDirty()` on every input event with no phase gate;
`markDirty` sets the machine's pending flag even while the phase is
`writing`, and after a SUCCESSFUL write `#execute` re-runs `save()` when that
flag is set. So a keystroke while the control read SENDING sent a second
report carrying the newer text. Reproduced on the real component in
`tests/dom/feedback-send-once-mount.test.ts` with a submit held open on a
promise: the pre-fix copy calls `submit` twice, the first row carrying the
text at the press ("The launch button did nothing.") and the second the text
typed mid-flight. Two rows, not thirty; nothing here loops.

The twelve `aria-disabled` sites with a handler, as found: HallPass 328, 345,
388; SongQueue 311, 420, 429, 457; FoundryInspector 593; FoundryTrustRoster
128; EntryMove 192; SpecImporter 777; SessionManager 744. Three were pure
in-flight predicates with nothing to explain (HallPass 328, SongQueue 420 and
429); the other nine folded a busy flag into a predicate that also had a
sentence to give. `ReviewConsole.svelte:1156-1157` carried both `disabled`
and `aria-disabled` for `unit === null` on Grade unit.

### B4, what was built

- `FeedbackBox.svelte`: `typed()` and `send()` do nothing while a send is in
  flight (the root fix: the pending flag is what mints the row), and the two
  textareas, the contact field and the kind radios carry a real `disabled`
  for that moment, handed back on a failure so Retry can be used. The dom
  test holds the submit open, types through it, counts ONE row on the real
  component and TWO on a temp copy with the gate removed, and asserts the
  disabled contract in both directions (all false at rest, all true in
  flight, all false after a refusal with the Retry control present).
- The nine folded sites split into `disabled={busy}` beside
  `aria-disabled={<the half with a sentence>}`, and the three pure in-flight
  ones became a real `disabled`; `FoundryTrustRoster` and `SpecImporter` had
  the fold one level down inside a derived, so `emailOk` and `publishable`
  were split out and the handlers keep their one predicate. Every handler's
  own re-check stays. `app.css`'s `.btn:disabled` already paints the new half.
- `ReviewConsole` Grade unit keeps the real `disabled` and drops
  `aria-disabled`; its `.mode[aria-disabled='true']` rule became
  `.mode:disabled` (it is not a `.btn`).
- Two refusals that the split left silent now say so: `SessionManager`'s
  Attach on an empty pick ("Pick an item first.") and on an already-attached
  item ("That item is already attached to this check-in."), which the
  handler had not re-checked before and now does; and the trust roster's
  grant with no address ("Type the student's school email address first.").
- `tests/aria-disabled-in-flight.test.ts` (35 tests) sweeps the nine files:
  no `aria-disabled` expression names an in-flight identifier (case-
  insensitive `busy`, `sending`, `loading`, one level down into `$derived`
  and `$derived.by` declarations), the twelve sites are pinned as a table
  each carrying its `disabled=`, ReviewConsole's mode-grade carries
  `disabled=` and not `aria-disabled=`, with positive controls for every
  pre-fix spelling. Re-folding the Sign-out site by hand reddened it at
  `HallPass.svelte:346`, restored md5 `11f4283969d96fa9774d95a1b8d7c95f`.
- The two browser specs that assert `[disabled]` absent on the hall pass and
  song queue controls now say why: the explanation half is `aria-disabled`
  and asserted, and `disabled` is absent AT REST because it is the in-flight
  half, which the harness never observes.

**The hand control the prompt asked for**: with the phase gate removed from
the working `FeedbackBox.svelte`, the dom test failed with "expected [ {
app: 'harness', ... }, ...(1) ] to have a length of 1 but got 2"; restored
from the `cp` copy, md5 `29768344650047732fe55db9bd65f580` equal on both,
19 tests green across the three feedback dom files.

Left as found and reported: the screenshot picker and REMOVE stay live during
a send (a picture staged mid-send never reaches the row, and a successful
send discards it, which is pre-existing); disabling the focused textarea
mid-send blurs it, and nothing restores focus after a refusal; and `typed()`
spells the in-flight predicate as `save.phase === 'writing'` where `send()`
reads the `sending` derived, because the dom test pins that exact line as the
one its mutant removes.


## Closing

- **Browser proof (C1)**, `npm run verify:browser` at 375 and 1440 over the
  changed surfaces on `8701afc4`: 30 route/width runs, 452 measurements, 0
  outside threshold. 0px horizontal overflow on every run. Tap targets:
  `/dev/feedback` smallest 74.8x44 (0/2 under 44), `/dev/hall-pass` 112.8x44
  (0/4), `/dev/song-queue` 104.2x44 (0/8) and every walked reach at 45px or
  more (0/20), `/dev/gauntlet-shell` 156.4x44 (0/2), `/dev/foundry-admin`
  104.2x44 and 130.1x44 (0/7), `/dev/notebook-review-student` 104.2x44 (0/4).
  Two surfaces sit on the declared 24px contract, both instructor-only and
  both pre-existing: the review console's grid cells (the locked density
  contract, smallest 30.4x30.4, 0/30 under 24) and the spec importer's
  `.btn.tiny` chips (`.cr-root .btn.tiny` in `classroom.css`, smallest
  103.5x24 and 96.6x24, 0 under 24). Text is measured in the fallback stack
  (the harness blocks fonts.googleapis.com) and reduced motion is not
  exercised.
- **Counts and README (C2)**, once, on the committed tree `b7046a87`, warm
  against a dev server that had been serving for twenty minutes:
  `verify:counts` found the static region already current (142 specs, 66
  routes, 94 /dev pages, 284 runs); `verify:readme` measured 284 runs, 4340
  measurements, 2 outside threshold in 724 s, 70 self-test controls with 0
  instrument failures. The two are the standing `/dev/notebook` toolbar rows
  decision 12 holds with the owner, identical to prompt 0098's run; the route
  re-run alone gives the same two (14 runs, 172 measurements, 2 outside).
- **Suite and check (C3)**: `npm test` on the final code tree `4f35cb87`, started 2026-09-07 04:50:21 PDT (America/Los_Angeles) and finished 04:56:54 PDT: **326 files, 6,504 tests, 0 failures**, 390.8 s (prompt 0098 left `main` at 324 files and 6,444 tests; this bundle adds `tests/aria-disabled-in-flight.test.ts` and `tests/dom/feedback-send-once-mount.test.ts`). `npm run check` at 04:57:03 PDT: **0 errors, 37 warnings**, 31 `state_referenced_locally` / 5 `css_unused_selector` / 1 `perf_avoid_nested_class`, the baseline unmoved. The CLAUDE.md name check agrees with the tree.
- **Not verified**: the live Supabase project (placeholder env only); any
  signed-in surface in a browser; a real student's GAUNTLET home page.

## Migration numbers

0190 and 0191 were claimed and neither was needed. The highest migration on
`main` stays 0189.
