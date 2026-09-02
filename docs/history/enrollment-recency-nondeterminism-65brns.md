---
title: "The enrollment-recency tests are read in microseconds and their fixture is pinned, because node-postgres truncated Postgres to milliseconds and CI tied (`claude/enrollment-recency-nondeterminism-65brns`, no migration)"
date: 2026-09-02
branches: [claude/enrollment-recency-nondeterminism-65brns]
migrations: []
subsystems: ["Foundry", "Classroom", "Testing"]
---

CI run #504 on `main` at `d6811eb` failed on `a student holding two IDEA
enrollments > and the opposite order yields the opposite course`, at
`expected 1788332569600 to be greater than 1788332569600`. The same commit had
passed the full suite in prompt 0005's session, so it was a flake rather than a
regression. Two files moved: `tests/foundry-author-class.test.ts` and one
optional parameter on `enrollStudent` in `tests/db/harness.ts`. No migration was
written and `supabase/migrations/**` was read-only to this session; the database
is not what was broken.

## The projection was right the whole time, and that is provable rather than asserted

`0132` sorts on `c.active desc, e.created_at desc, s.created_at desc, s.id`, and
`classroom_enrollments.created_at` is a `timestamptz`, which Postgres stamps at
MICROSECOND resolution. node-postgres parses that column into a JS `Date`, which
carries MILLISECONDS and truncates the rest. So two enrollments written a few
hundred microseconds apart are distinct in the table, ordered correctly by the
function, and indistinguishable to a test comparing `getTime()`.

Measured through the real driver against the real fixture, rather than reasoned
about:

    a_text=2026-09-02 10:00:00.1234+00   b_text=2026-09-02 10:00:00.1239+00
    a_getTime=1788343200123  b_getTime=1788343200123  equal=true

and with the `dualReverse` pair forced to exactly those two instants, 500us
apart, the file reproduced CI's failure in its own shape --
`expected 1788343200123 to be greater than 1788343200123` -- while the product
under test answered `Engineering I Honors`, which is the correct answer. **The
assertion that fell over was the file's own PRECONDITION about its fixture, never
its claim about the projection.** That distinction is the whole bundle: a fix
aimed at the product would have been aimed at working code.

**IT DID NOT REPRODUCE NATURALLY HERE, AND THE MEASUREMENT SAYS WHY RATHER THAN
LEAVING IT AS A SHRUG.** Twenty full runs of the file passed. A probe then put
400 back-to-back enrollment pairs through the real `classroom_set_enrollment`
path and read both stamps each time: `ms_ties=0 us_ties=0`, gap between the pair
`min=1244 p50=1708 max=3993` microseconds. A gap of 1000us or more can never
share a millisecond floor, so on this machine the tie is not merely rare, it is
unreachable -- and on CI's faster machine the gap dipped below 1ms and the floors
collided. The reproduction above is therefore FORCED, and the fifty-plus green
runs below are consistent with the fix without being evidence of it on their own;
what is evidence is the forced reproduction plus the two positive controls.

## Resolution, not tolerance

A sleep, a retry, a `toBeGreaterThanOrEqual` or a tolerance window would each have
turned the failure off without restoring the check. An ordering assertion that
admits equality cannot detect the ordering bug it exists for, and `0132`'s recency
key is exactly the thing these two tests are the only cover for. None of those was
taken.

The stamps are read back as epoch MICROSECONDS instead --
`(extract(epoch from <col>) * 1000000)::bigint`, one `MICROS()` helper so the
expression is written once -- which is the resolution the column actually holds.
Safe as a JS number: ~1.79e15 against a 9.007e15 integer ceiling, so no `BigInt`
and no string comparison is needed. Lexicographic comparison of `created_at::text`
was the other candidate and was rejected: Postgres trims trailing zeros from the
fractional part, so the reasoning about whether `.1+00` sorts correctly against
`.12+00` is sound but fragile, and an epoch integer needs no such argument.

`enrollmentStamps` and the local `section()` helper were WIDENED rather than
replaced -- they still return the `Date` forms, which are what the wire gives and
what a reader should be able to see beside the number the assertion uses.

## The fixture now guarantees the order instead of racing for it

Even at microseconds two writes can in principle tie, and a precondition whose
premise is "probably distinct" is a precondition that fails at 3am. The
preconditions STAY, because they are what makes the fixture honest; what changed
is that they can be satisfied on purpose.

`enrollStudent` in `tests/db/harness.ts` takes an optional `createdAt`. The real
RPC still writes the row -- every check, every default and the upsert key are the
real ones -- and the stamps are pinned afterwards, so only the clock is taken out
of the test's hands. **It sets `updated_at` as well, which is not a liberty:**
0082 defaults both columns to the same `now()` on insert, so one instant in both
is exactly the row shape `classroom_set_enrollment` had just produced. The
parameter is optional and no other caller changed. The same treatment is applied
to `classroom_sections.created_at` through the file's own `section()` helper,
because the section stamp is `0132`'s third sort key and the key-3 test asserts an
order on it.

Three pairs are pinned, one day apart (`STAMP.first`/`STAMP.second`): `dual`,
`dualReverse` and `preferLive`. `sameInstant` is deliberately NOT pinned -- its
premise is that `classroom_import_roster` stamps both rows identically because
`now()` is transaction time, and pinning would assert that by construction instead
of observing it. That equality is now checked in microseconds too, which is the
direction that matters there: at millisecond resolution the equality is the one
that can pass while the rows are genuinely apart, which would leave key 3 never
reached and the test below it green for a wrong reason.

**BOTH tests in the describe block were fixed, not only the one that failed.**
`takes the more recently created enrollment` has the identical shape and passed
run #504 by luck. So do four further sites in the same file, all converted: the
two `beforeAll` preconditions, the `updated_at` touch, and the retired-course
precondition.

## Positive controls

1. **Fixture broken.** Both `dual` enrollments forced to one instant: 2 tests
   fail, `expected 1767603600000000 to be greater than 1767603600000000`. A
   precondition that cannot fail when its fixture is broken is testing nothing.
2. **Product broken.** `e.created_at desc` inverted to `asc` in a scratch copy of
   `0132`: 3 tests fail, including
   `expect(classes.get(slugs.dualReverse)).toBe(IDEA_209H.title)` at
   `expected 'Intro to IDEA' to be 'Engineering I Honors'`. So the microsecond
   read did not turn a real check into a tautology on the way to making it stable.
3. **Restored.** `0132` and both owned files md5-identical to what was committed,
   restored from a `cp` taken beforehand and never with `git checkout --`.

## What was measured

- 60 consecutive runs of `tests/foundry-author-class.test.ts`: 60 passed, 0
  failed. Against a pre-fix baseline of 20 passed, 0 failed, which is why those 60
  are consistent with the fix rather than proof of it.
- Full suite: **230 files, 4751 tests, all passed**, 204.98s.
- `npx svelte-kit sync && npx svelte-check`: **0 errors, 37 warnings**, breaking
  down 31 `state_referenced_locally` / 5 `css_unused_selector` / 1
  `perf_avoid_nested_class`. The documented baseline exactly; nothing moved.

## The same defect elsewhere, reported and not touched

This is a class of defect rather than one site, and the sweep found others. Out of
scope for this bundle's file surface, listed so the next session does not have to
re-derive them:

- `tests/notebook-note-coalesce.test.ts:559` -- `last_activity_at` compared with a
  strict `>` between two consecutive autosaves through `getTime()`. **The same
  shape as the failure, and the one genuinely at risk.**
- `tests/notebook-staff-actions.test.ts:856` -- a descending-order assertion over
  many `created_at` values through `getTime()`. A tie cannot make this FAIL
  (`Array.prototype.sort` is stable, so tied entries keep their order), but it
  silently weakens the check.
- `tests/gauntlet-knowledge-clock.test.ts:482` and `:717` -- `toBe` on a stamp
  asserting it did NOT move. Millisecond truncation would hide a microsecond-level
  move. A weakening, not a flake.
- Safe on inspection and named so they are not re-audited:
  `notebook-note-delete.test.ts:767-774` (an hour apart),
  `gauntlet-knowledge-clock.test.ts:460`/`:508` (a deliberate 31-minute and 1-day
  backdate), and every `toBeGreaterThanOrEqual` site
  (`notebook-note-coalesce.test.ts:241`, `notebook-review-acknowledged.test.ts:419`,
  `gauntlet-run-review.test.ts:824`, `classroom-canonical.test.ts:493`), which
  cannot flake because they already admit the tie.

## Not verified

- **Nothing on the live Supabase project.** `.env` was never created in this
  session; the local Supabase stack was never started (no Docker and no WSL in
  this container, ports 54321 and 54322 both closed at start, no `supabase_*`
  containers).
- **No browser pass, and no Vercel preview URL to name.** This bundle changes
  tests only and ships no surface a browser can open.
- **The CI machine's own timing.** The gap distribution above was measured here.
  That CI's gap fell below 1ms is inferred from run #504's failure message, not
  observed.
- **No `npm run verify:browser`**, for the same reason as the browser pass: no
  `/dev` route changed.
