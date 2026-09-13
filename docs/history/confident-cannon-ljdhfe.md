---
title: "The tier is chosen per prompt and is never a default: one rule that replaces Opus 5 as the build tier, puts a docs-only bundle on Sonnet 5, folds GPT-6 Astra into the same choice, and corrects ledger 0205's count (`claude/confident-cannon-ljdhfe`, ledger 0210)"
date: 2026-09-13
branches: [claude/confident-cannon-ljdhfe]
migrations: []
subsystems: ["Standards", "Documentation"]
---

A standards-only bundle. Nothing under `src/` moved, no migration was written, and the
whole of it is two files: `IDEA_instructions.md` to 4.28 and the one `REGISTER.md` row
that names it.

## The fetch was the first finding, and it decided the shape of the branch

The prompt said to fetch `IDEA_instructions.md` with git rather than `curl` on
`raw.githubusercontent.com`, and to build on whatever was actually found, because ledger
`0205` took the file to 4.27 that morning. What the fetch found is that **4.27 is not on
`origin/integration` and not on `origin/main`. Both hold 4.26.** 4.27 exists on exactly
one ref, `origin/claude/dazzling-ramanujan-i2hry6`, which is 0205's lane and is not
merged.

That is the same asymmetry the standards README describes one level up: a fetch that
shows a newer version proves the newer version exists, and a fetch that shows nothing
proves only that this ref has not seen it. The instruction to use a clone is usually
about CDN staleness; here the staleness was in the branch graph, not in a cache.

Branching from `origin/integration` as instructed and writing 4.28 on top of the 4.26
that base holds would have delivered a file that silently dropped ten rules -- not by
reverting them, which a merge could detect, but by never having had them. So 0205's file
is carried in **as its own commit, verbatim, before this bundle writes a word**
(`2d467ce4`, md5 `54545f562655e960764be52b4ff1abc3` on both sides), and 4.28 sits on top
of it. The two are separable in review and the carried commit's subject says whose text
it is.

**`IDEA_VERIFICATION_ADDENDA.md` 2.6 is 0205's too and was deliberately NOT carried.**
It is outside this bundle's file surface. That decides the `REGISTER.md` edit as well:
only the `IDEA_instructions.md` row moves, and the addenda row stays at 2.5, because
`tests/standards-version-header.test.ts` compares a register row against the file this
branch actually holds -- carrying 0205's whole register would have claimed 2.6 for a
2.5 file and reddened the suite.

**A merge conflict between this branch and 0205's is expected and is not a defect.**
Both branch from the same base and both rewrite the version header and the changelog
head of one file. Whichever lands in `integration` first, the second one conflicts there
and the resolution is this branch's copy, which is a strict superset: 0205's ten rules
verbatim, plus the 4.28 rule, plus the count correction below.

## The rule replaces a default rather than sitting beside it

The prompt asked for ONE RULE in the section that already covers model tiers, replacing
the current default: Opus 5 at `high` as the build tier, Fable 5.1 for what a session
must decide alone. Two things in the file stated that default, and leaving either one
standing would have left the file carrying two versions of one rule.

1. **The paragraph `**Re-derive every time; never carry forward.**` is REPLACED, not
   appended to.** It was the nearest thing the file already had to this rule -- classify
   each prompt on its own, do not default to the heaviest tier used earlier -- and the
   new rule says that and more, with the evidence. Two statements of "do not carry the
   tier forward" is exactly the pair that stops agreeing. What was load-bearing in it and
   is kept: state which row the prompt matches as part of the one-line reason, and the
   effort labels are exactly low / medium / high / xhigh / max.
2. **Row 3 of the routing table stopped calling itself "The default build row."** A rule
   headed THE TIER IS CHOSEN PER PROMPT AND IS NEVER A DEFAULT, sitting below a table row
   that names itself the default, is a contradiction a reader has to resolve by choosing.
   The cell now reads "The build row, reached and never defaulted to." Two words, in the
   same commit as the rule, which is the file's own convention for a rule change.

**What is pointed at rather than restated**, because the prompt said so and because the
repo's own doctrine says a second statement is the copy that drifts: effort
serialization (one `xhigh`, `max` or `ultracode` bundle at a time across all lanes) stays
owned by the concurrent-heavy-bundles override, and the rule carries one sentence saying
which half serializes and why that matters to a model choice -- choosing a cheaper model
never changes what is queued, and choosing a deeper effort level always does. The Codex
cloud-task constraints stay owned by "Two agents, one repository".

## The discriminator that had to be invented: a docs-only bundle against row 3's read-only audit

The prompt's Sonnet bullet says "a docs-only bundle: standards text, decision entries,
audits, applied records". The table's row 3 already claims "a read-only audit" for Opus
5, and the prompt's own Opus bullet claims "any verification whose result will be relied
on". A read-only audit is both of those things at once, so the two bullets as written
pull the same bundle in two directions and the rule could not just list them.

**The discriminator written into the rule is what the bundle must ESTABLISH, not what it
writes.** A bundle turning findings that are already settled into prose is row 2. A
bundle that must produce the findings something else will rely on is row 3, whatever its
output surface. That keeps ledger `0204`'s Vercel audit on the correct side -- the
measuring was row 3 work, the writing up of it afterwards is row 2 -- and it keeps this
bundle honest about itself: this one is row 2.

The four named ledgers are in the rule because they are the evidence, not decoration:
`0197`, `0204`, `0205` and `0206` were every one of them docs-only and every one of them
ran on Opus 5.

## Ledger 0205's open count, decided rather than inherited

The prompt asked whether the numbering and any count claim in the file are internally
consistent after 0205, and to decide it rather than inherit it. **They were not.**

0205's 4.27 changelog entry opened: "Ten rules earned on 2026-09-12 and 2026-09-13,
eight of them written here and two of them corrections to what this file already said."
It then narrated **eleven** items -- the migration-range rule, rule 13, push-is-a-build,
the decision `Status` rule, five communication rules, the three-state Hard Rule
correction, and the live state document -- and introduced the last two with "The two
corrections:", over one item that is a correction and one that is a new rule announced
in the same breath as "added mid-bundle ... and therefore in this same version".

Counting what actually landed in the file: **ten rules** (nine carried by 0205's prompt,
a tenth that arrived mid-turn), **plus one correction** to the three-state Hard Rule,
whose rule proper is `IDEA_VERIFICATION_ADDENDA.md` rule 41 and lives in the other file.
That reconciles with 0205's own history entry, which says nine were routed here and a
tenth arrived mid-bundle, and with its commit subjects saying nine.

Three surgical edits to that entry's prose and nothing else: the opening count sentence,
"The two corrections:" to "The correction:", and "And, added mid-bundle" to "And the
tenth rule, added mid-bundle". **No rule text of 0205's was touched**, and the edited
paragraph was re-wrapped as a whole so the change is a prose diff rather than a reflow
scattered through it. The three semantic changes were verified in isolation by
normalising both versions of that entry to a single line and diffing sentence by
sentence: three changed, nothing else.

The rest of the file's numbering is consistent and was left alone. The
manual-instruction format's list runs 1 through 13 with no gaps and states no count
("Rules, all of them hard:" carries no number), so 0205's rule 13 needed nothing.

## What was measured

- **Duplicate check, three ways, all clean.** No `docs/prompt-ledger/entries/0210-*` on
  `origin/integration`, `origin/main`, or any remote ref -- the highest entries anywhere
  are `0205`, `0206`, `0207` and `0209`, each on its own unmerged lane, with `0208` and
  `0210` both unwritten. No commit subject on any ref names ledger `0210`; every `0210`
  in the history is the MIGRATION `0210`, the notebook note grid, a different sequence
  that is already landed. `node tools/migration-claims.mjs` reports highest landed
  `0211`, next free `0213`, `0212` held by `claude/busy-feynman-aupq55` for ledger
  `0207`. This bundle claims nothing.
- **The checkout is NOT shallow.** `git fetch --unshallow origin` succeeded,
  `git rev-parse --is-shallow-repository` answers `false`, and `origin/main` carries
  2381 commits. Ledger `0205` could not re-derive a commit count from its own container
  and said so; this one could have.
- **Committer identity:** `Claude <noreply@anthropic.com>`.
- **Migration range, checked before any merge and no merge proposed.**
  `origin/integration` holds `0209`, `0210` and `0211` under `supabase/migrations/` and
  does not hold `0212`, so the permitted ceiling is not exceeded and there was nothing
  to stop on.
- **The suite and `svelte-check` off `integration` at branch time** -- reported in this
  session's response with the summary-line figures rather than the exit code, since
  `npm test` exits 0 with a failing test in this repo.

## What was NOT verified

- **No browser pass**, by instruction, and none was needed: no `src/` file moved.
- **The "roughly the last twenty prompts" figure is Mr. Pina's, quoted as his.** It was
  not re-derived from the ledger, and it could not be honestly: a routing header lives in
  the chat text above a pasteable block and is not recorded in any entry, so the tree has
  no record of which model any past prompt actually ran on. The rule says the count is
  his for that reason.
- **Ledger 0205's branch was read, never run.** Its file was taken by hash; its suite
  result and its blocked-merge findings are quoted from its own entry, not reproduced.
- **Production's version string** is reported in this session's response as read at run
  time, not re-checked afterwards.

## Deferred

- **`IDEA_VERIFICATION_ADDENDA.md` 2.6 is still stranded on 0205's lane**, and its
  `REGISTER.md` row therefore still reads 2.5 here. Whichever bundle lands that lane owns
  moving it; a bundle that carries the addenda file without its register row, or the row
  without the file, reddens `tests/standards-version-header.test.ts` either way.
- **Row 2 of the routing table still reads "a standards push with its fork check"** and
  now also has to carry decision entries, audit writeups, applied records and ledger
  entries, which the rule below it states and the cell does not. The cell was left alone
  deliberately: widening it is a second statement of the rule, and the right fix is
  probably to shorten the cell to a pointer the next time that table is edited.
