# 22 A 1-point leveled criterion is unrepresentable: the rubric standard and migration `0195` cannot both be satisfied

- Raised: 2026-09-10  By: session on `claude/html-assignment-integration-a6ibch` (prompt 0134), step 4, report-and-propose
- Status: open
- Decision needed: which of the three resolutions below becomes the rule. It changes how
  every future manifest and every future spec rubric is authored, so it is not a fix to
  fold into a feature bundle.
- Not resolved by this bundle, on purpose. This bundle re-ported one `/dev` FIXTURE around
  the conflict (see "What this bundle did instead"); it did not change the standard, the
  validator, or any applied migration.

## The problem

`docs/standards/IDEA_RUBRIC_STANDARDS.md` 1.3 states two rules that are individually
sensible and jointly impossible for a criterion worth 1 point:

- **"Four levels by default. Three is acceptable when a criterion is close to binary and a
  fourth level would be an invented distinction. Never two: a two-level criterion is a
  checklist item and belongs in a checklist block instead."**
- **"Top level equals the criterion maximum. Bottom level is always 0. No criterion may
  have a floor above zero."**

So a criterion worth 1 with three levels needs its middle level strictly between 0 and 1.
Migration `0195_classroom_html_assignments.sql`, **applied to production**, refuses that
twice over:

```sql
-- a level's points must be a whole number
if jsonb_typeof(v_levels->0->'points') is distinct from 'number'
  or (v_levels->0->>'points')::numeric <> floor((v_levels->0->>'points')::numeric)
```

```sql
-- and a criterion needs one point per level above the bottom
raise exception 'Module "%" criterion "%" is worth % but carries % levels, which need %
  distinct values above zero. ...', v_name, v_id, v_top, v_n, v_n - 1, v_n - 1;
```

`0195`'s own apply-time self-check asserts the second rule deliberately: it constructs a
1-point criterion with three levels and raises if the checker accepts it. The client
validator (`src/lib/classroom/html-assignment/manifest.ts`) mirrors both rules exactly, so
the two halves of the importer agree with each other and disagree with the standard.

**The smallest three-level criterion is therefore worth 2, and the standard forbids the
two-level criterion that 1 point would otherwise allow. A 1-point criterion has no legal
shape.**

## Why nothing has caught it

**Nothing in the database refuses the shape the standard describes.** Ledger 0129 measured
that Postgres stores a level worth `0.5` perfectly happily -- `classroom_rubrics` has no
integrality constraint on a level's points, and neither does `classroom_responses`. The
refusal lives only in the two HTML-assignment manifest validators, which is why the
conflict surfaced on this feature and not on the spec rubrics that predate it.

**Ledger 0128 hit it first, in the port it produced.** The ported IDEA100 Blade fixture
carries two 1-point criteria (`identity.mood`, `manufacturing.justification`), each with
three levels and a middle level worth `0.5`. It was authored against the standard and the
standard is what it satisfies. `tests/html-assignment-port.test.ts` shipped twenty-six
green assertions over it, including `three or four levels, never two` -- the standard's own
rule -- and never once put the fixture to `validateHtmlManifest`, which reports 66 errors
on the same bytes. A test written from the standard cannot see a conflict with the code,
and a test written from the code cannot see a conflict with the standard.

## The three candidate resolutions

**A. Merge a 1-point criterion into a sibling.** The validator's own message already
proposes this ("or merge it into another criterion"), so no document changes and no
standard changes: 1 point simply is not enough weight to be judged on its own, and a
criterion that small is a clause of a larger one. Cost: an author who genuinely wants five
distinct 1-point observations in a 5-point module cannot have them, and the merged
criterion's levels have to be rewritten to cover two judgements at once, which is where a
level stops naming one countable thing.

**B. Permit two levels at 1 point.** Narrowest change: relax "never two" to "never two,
except where the criterion is worth 1", and the arithmetic already works (top 1, bottom 0).
Cost: it concedes exactly what the "never two" rule was written to prevent -- the standard
says a two-level criterion IS a checklist item -- so the rule becomes "a checklist item is
allowed as long as it is cheap", which is a different rule than the one that was reasoned
about.

**C. Permit half points on a level.** Restores the shape the standard describes and the
shape 0128 actually authored, and the storage already accepts it. Cost: it needs a
MIGRATION to relax `0195`'s integrality check, and `0195` is applied, so that is a new file
and its own apply. It also puts fractional arithmetic into every place a rubric total is
summed, compared and exported, and CLAUDE.md already records that Postgres `round()` is
half-up while the FACTS CSV and the Grades tally each do their own arithmetic.

## The default I would pick, and why

**A, merging.** Stated as a preference and not a decision.

It is the only one of the three that changes no applied migration, no standard rule anybody
has reasoned about, and no arithmetic. B rewrites the "never two" rule into something
weaker than what was argued for, and the argument for it -- that a two-level criterion is a
checklist item -- does not become less true at 1 point. C is the most faithful to what
authors keep reaching for, and it is also the most expensive: a new migration against an
applied one, plus fractional points flowing into the Grades denominator, the FACTS CSV and
the export, on a system where CLAUDE.md already records two separate months-long bugs from
totals that reconciled to the wrong number.

What would change my mind about A is a count. If real IDEA rubrics routinely want a
1-point observation that is genuinely independent of its neighbours, then A is telling
authors to write worse rubrics to satisfy an arithmetic rule, and B becomes the honest
answer. Nobody has that count; the two instances in the Blade port are the only evidence
either way, and both merged cleanly.

## What this bundle did instead

Re-ported `src/routes/dev/html-assignment/fixtures/idea100-blade-01.ported.html`, which is
a `/dev` fixture and not a live assignment.
**`src/lib/legacy/assignments/idea100-blade-01.html` -- what IDEA100 students are working
in -- was not touched, and was md5-verified unchanged at the end of the bundle.**

- `identity-mood` raised from 1 to 2 points, keeping all three of its tiers and its
  wording, with the middle level's `0.5` becoming `1`.
- `identity-personality` lowered from 3 to 2 so the module still sums to 10, its four
  levels becoming three by merging the two that both describe a theme connection that is
  not made.
- `manufacturing-justification` merged into `manufacturing-processes` (now 3 points, four
  levels). The module is worth 5 across three criteria and no criterion may be worth 1, so
  three criteria each worth at least 2 need at least 6 points: the arithmetic left no move
  other than a merge, which is resolution A arrived at by force rather than by choice.

That is a weighting change to a test artifact. It is NOT a precedent for the standard.

## The second, smaller gap this found, which is a contract gap and not a decision

**The HTML-assignment contract never named an id charset.** Ledger 0127 took
`^[A-Za-z0-9_-]{1,40}$` from migration `0086`'s own `classroom_responses.block_id` rule,
which is correct -- a block id becomes a `block_id`, so it has to satisfy that column --
but the contract four lanes were building against does not say so anywhere. 0128's port
used dotted ids (`identity.mood`, `package.student-name`), 63 of them, and no surface in
the repository would have accepted one.

This bundle converted every dot to a hyphen, which is safe **only because nothing has ever
been imported from that fixture**: a block id is PERMANENT because it is the join key for
every answer stored under it, and a renamed id orphans those answers silently. That window
closes the moment the first document is imported. `tests/html-assignment-port.test.ts` now
pins the charset against `HTML_ID_RE` with a control, and puts the fixture through the real
validator, which is the assertion whose absence let this ship.

**The missing rule belongs in the contract**, stated where a porting lane reads it, rather
than only in a migration and a regex.
