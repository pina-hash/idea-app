# 22 A 1-point leveled criterion is unrepresentable

- Raised: 2026-09-10  By: session on `claude/html-assignment-integration-a6ibch` (prompt 0134), step 4
- Status: decided
- Decision: **Mr. Pina ruled on 2026-09-11 that a 1-point criterion MERGES INTO A SIBLING** --
  resolution A below. It was already the code's behaviour in three places, so the ruling
  ratifies what ships rather than changing it. Evidence under "What is true in the tree
  today". One residual, named at the end, is a standards edit and not a decision.
- Default this assistant would pick: A, merging. Now Mr. Pina's answer, not a default.
- Why it was blocked on him: it changes how every future manifest and spec rubric is
  authored, so it was not a fix to fold into a feature bundle.
- What it unblocks: nothing is waiting. It closes a standing contradiction between an
  applied migration and the rubric standard.
- Context: `docs/standards/IDEA_RUBRIC_STANDARDS.md` 1.3;
  `supabase/migrations/0195_classroom_html_assignments.sql`;
  `src/lib/classroom/html-assignment/manifest.ts`;
  `docs/standards/IDEA_HTML_ASSIGNMENT_TEMPLATE.md`;
  `docs/history/html-assignment-integration-a6ibch.md`.

## The question, in one sentence

`IDEA_RUBRIC_STANDARDS.md` 1.3 requires three or four levels with a bottom of 0, and
migration `0195` requires whole points and one distinct value per level above the bottom,
so a criterion worth 1 point has no legal shape -- which of merge / allow two levels /
allow half points becomes the rule?

## What is true in the tree today (measured 2026-09-11)

- `docs/standards/IDEA_RUBRIC_STANDARDS.md` (v1.3, 2026-08-25) **line 37**: "Never two: a
  two-level criterion is a checklist item". **Line 38**: "Bottom level is always 0."
- `supabase/migrations/0195_classroom_html_assignments.sql` **line 447** refuses any level
  count but 3 or 4. **Lines 453-457 and 481-485** refuse a non-integral point value.
  **Line 474** raises `...is worth % but carries % levels, which need % distinct values
  above zero. Give it at least % points, or merge it into another criterion.`
- `src/lib/classroom/html-assignment/manifest.ts` **lines 708-713** is the byte-equivalent
  client half, ending in the same sentence: **"or merge it into another criterion."**
- `docs/standards/IDEA_HTML_ASSIGNMENT_TEMPLATE.md` (v1.0) **line 120**, the document an
  authoring AI tool is handed, already instructs it: "**a 1-point criterion cannot be
  written at all** - give it 2, or merge it into another criterion."
- `0195` is on `origin/main` and is applied. `origin/main`'s highest migration is `0198`.

**So resolution A is already enforced by two validators and already taught by the
authoring template.** Mr. Pina's ruling requires no code change, no migration and no
change to the rubric standard's two rules -- a standard that forbids a 1-point criterion
and a validator that forbids a 1-point criterion do not in fact contradict each other;
what the original entry called a contradiction was an author's expectation that a 1-point
criterion must be expressible, and that expectation is what the ruling answers.

## What each option would have cost

| | Migration? | Applied production state? | Cost |
|---|---|---|---|
| **A. Merge into a sibling** | no | no | An author wanting five independent 1-point observations in a 5-point module cannot have them; the merged criterion's levels must cover two judgements at once. **CHOSEN.** |
| **B. Allow two levels at 1 point** | no | no | Concedes the exact thing "never two" was written to prevent: the rule becomes "a checklist item is allowed when it is cheap". |
| **C. Allow half points** | **yes, over applied `0195`** | **yes** | A new migration relaxing an applied integrality check, plus fractional arithmetic into the Grades denominator, the FACTS CSV and the export -- on a system where `CLAUDE.md` records two months-long bugs from totals reconciling to the wrong number. |

**C is the expensive one and the ruling closes it**: `0195` is applied, so relaxing it is
a new file and its own hand-apply, and the half-point shape would then have to be honoured
by every total that is summed, compared and exported.

## What happens now that it is decided

Nothing must be built. The one residual, reported and not fixed here because this bundle
owns no standards file: **`IDEA_RUBRIC_STANDARDS.md` never states the merge rule.** A
rubric author reading the standard alone still reaches for a 1-point criterion and is
refused later by a validator, which is where this was found the first time. The sentence
belongs in 1.3 beside "Never two", in a standards bundle with its own version bump and
changelog row.

## Tree check (2026-09-11)

- The original entry's claim that the standard and `0195` "cannot both be satisfied" is
  **too strong** and is corrected above: both are satisfied by not writing a 1-point
  criterion, which is what the ruling formalises.
- The second gap the original entry recorded -- the HTML-assignment contract never naming
  the `^[A-Za-z0-9_-]{1,40}$` id charset -- is closed. `CLAUDE.md` now carries it as a
  rule and `docs/standards/IDEA_HTML_ASSIGNMENT_TEMPLATE.md` line 117 states it for
  authors. It was never part of this decision.
