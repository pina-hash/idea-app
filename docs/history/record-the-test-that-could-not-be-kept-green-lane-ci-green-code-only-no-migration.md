---
title: "The test that could not be kept green (`lane/ci-green`, code only, no migration)"
date: 2026-08-26
branches: [lane/ci-green]
migrations: []
subsystems: ["Build, theme, tests, conventions"]
record_order: 146
---

## The test that could not be kept green (`lane/ci-green`, code only, no migration)

**Branch:** `lane/ci-green`. **Migration:** none.

### The standing failure

CI had been red for days on two assertions in
`tests/spec-instructions-budget.test.ts`. The file swept every assignment spec
under `materials/`, failed any module over the 300-word ceiling, and exempted
three specs BY PATH AND BY PINNED HASH. One of the three was re-exported by the
app, so its hash moved and its module dropped under the ceiling: the pin broke
and the exemption went stale, both at once.

### What the test was actually for, established by reading it

It was three things in one file:

1. a property test of `instructionsWordCount` over CONSTRUCTED fixtures
   (markdown syntax excluded, blocks summed, non-instructions blocks ignored,
   the boundary at exactly 300 and 301);
2. a property test of `validateSpec`'s warning tier, also constructed;
3. a catalogue sweep over `materials/`, plus the exemption list that served it.

(1) and (2) read nothing from the repository and cannot be turned red by the
app. **(3) is the part that was broken, and it was broken in three ways:**

- **`materials/` is not authored content, it is an EXPORT.**
  `$lib/server/classroom-export.ts` writes it and pushes to `main` on every item
  save. Measured: **19 of the 21 commits that have ever touched the directory
  are the app's own** (`classroom: <title> (assignment) rN`), and **no
  assignment spec exists anywhere else in the repo.** So the sweep enforced an
  AUTHORING standard against a mirror of what had already been published.
- **It could not gate anything.** A spec reaches `materials/` because a teacher
  pressed save, which is the same moment students can see it. Failing CI
  afterwards stops nothing.
- **It could not be kept green.** A pinned hash over a directory the app
  rewrites goes red when somebody saves an item. Twice the answer had been to
  write the new hash into the list. That makes the list a RATCHET: it records
  whatever last happened and checks nothing.

So the answer is the first of the three offered and then some: it checks a
property of authored spec content, it should assert the property rather than a
hash, and **the app's exports should not be in its scope at all** -- and once
they are out, there is nothing left for the sweep to read, because the repo
holds no hand-authored spec. (1) and (2) stay, unchanged; (3) and the exemption
list are deleted. 13 tests to 6.

### What is lost, stated plainly

- The only place that observed the instruction lengths teachers ACTUALLY
  publish. Its last report: 21 modules across 9 specs, max 520 words (exempt),
  max non-exempt 275, two modules between the 250 target and the 300 ceiling.
- The only automatic alarm if a published module went far over. It fired after
  publication, on an export, and could not distinguish "somebody wrote too much"
  from "somebody saved an item".
- `MAX_EXEMPTIONS = 3`, the pressure valve that made a fourth over-budget spec a
  standards conversation.

**What is NOT lost:** the ceiling was never a gate. `validateSpec` warns in the
importer and never blocks, by design. If it should ever block, that is a
narrowing of the validation gate, which ships in its own bundle with its own
answer for the specs already stored -- not a sweep over a directory nobody edits
by hand.

### The cost of leaving it red

For as long as it stood, a real regression anywhere in the suite was
indistinguishable from the known failure. That is not hypothetical: this
session's three previous bundles each had to check by hand whether "2 failed"
was still the same 2, every time. A test nobody can keep green is worse than no
test.

### Verified

- Suite green on `main`, and **proven** rather than asserted: a deliberately
  failing test was pushed, CI went red for that reason and no other, and the
  revert took it green again. Run links and the failure text are in the session
  report.
- `svelte-check` 0 errors / 37 warnings.

---

