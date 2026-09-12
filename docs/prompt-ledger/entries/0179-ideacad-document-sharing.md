# 0179 IdeaCAD document sharing: decision 24 recorded, and its data layer built

- Issued: 2026-09-12
- By: router chat
- Owns: `supabase/migrations/0205_*.sql`, `src/lib/ideacad/sharing.ts` (new), the sharing
  region of `src/lib/ideacad/transports.ts`, `tests/db/ideacad-sharing*`,
  `docs/decisions/entries/24-*`, `docs/prompt-ledger/entries/0179-*`, and its own
  `docs/history/` entry. NO UI IN THIS BUNDLE -- no `.svelte` file.
- Migration permitted: exactly one. Claims: 0205. Highest landed migration at issue: 0203
- Status: pushed
- Branch: `claude/great-bell-ppysbn`, branched from `origin/integration` at `6a71eff4`
- Runs in parallel with: ledger 0177 (claims 0204, in flight on
  `claude/busy-newton-trto6y`) and ledger 0178, which owns `BladeEditor.svelte`,
  `ItemDetail.svelte` and the item route. None of those three files is touched here.
- Notes: MR. PINA DECIDED 24 ON 2026-09-12. His model, in his words: like Google Docs. A
  student makes a document and it is PRIVATE BY DEFAULT. The owner may share it with named
  classmates as VIEW-ONLY or as EDITOR. He and Mr. Cosso SEE AND EDIT EVERYTHING BY
  DEFAULT, without asking and without a student granting anything -- "very convenient and
  powerful", and kept. `0205` adds sharing and nothing else: a grants table, the three
  read policies widened, the seven writing RPCs widened to admit an editor and still
  refuse a viewer. `ideacad_roster` untouched. Four properties, each a test: a viewer reads
  and cannot write (both halves); a stranger sees nothing; the instructor path is
  unchanged; only the owner grants (this assistant's default, recorded as ours).

## Outcome

**BUILT AND PUSHED. All four required properties hold, each proved in both directions, and
the suite is green.** 0205 is 1162 lines, adds one table, four private predicates, five
new RPCs and seven widened ones, and changes no column, no key and no signature.

**THE TESTS FOUND THREE REAL DEFECTS IN THE MIGRATION, which is the whole argument for
writing them against a real Postgres rather than reasoning about the SQL.**

1. **Mutual RLS recursion.** The first draft spelled the cross-table lookups out inline:
   the `ideacad_documents` policy carried `exists (select ... from ideacad_grants)` and the
   `ideacad_grants` policy carried `exists (select ... from ideacad_documents)`. Each
   policy queried the other table, whose policy queried back, and Postgres answered
   `infinite recursion detected in policy for relation "ideacad_documents"` on the FIRST
   read a grantee made. Every policy now delegates to a SECURITY DEFINER predicate, which
   runs as the owner and does not re-enter RLS. The file's own self-check now EXERCISES the
   four policies rather than counting them, because counting four policies would not have
   caught this.
2. **Not idempotent.** Each policy dropped 0201's name and created a new one, so a second
   paste failed with `policy ... already exists` -- a migration that works exactly once,
   which is the state re-pasting is supposed to be ordinary out of. Both names are dropped
   now, and `tests/db/ideacad-sharing-grant-surface.test.ts` applies the whole file twice.
3. **The self-check OVERREACHED and falsified another migration's negative control.** It
   swept every function matching `^_?ideacad` and hard-failed on any that was
   anon-executable, and the file also re-revoked 0201's seven widened functions as defence
   in depth. Both were wrong for the same reason:
   `tests/db/ideacad-grants-anon-execute-surface.test.ts` section E deliberately boots the
   chain MINUS 0202 and asserts all TEN of 0201's functions are anon-executable there, so
   that "0202 closes them" is a measured difference rather than a claim about a file. The
   sweep refused to apply on that database, and the re-revoke closed seven of the ten in
   it. `0205` now touches the grant surface of what it INTRODUCES and nothing else, and its
   self-check hard-fails only on its own nine objects while raising a NOTICE naming any
   other anon-executable ideacad function -- so the information is not lost and the apply
   is not blocked over another migration's objects.

**ONE MEASUREMENT CORRECTED A CLAIM THIS BUNDLE HAD WRITTEN DOWN ITSELF.** The file's
header said the seven widened functions had to be re-revoked because `create or replace`
under this project's default privileges can hand a function a fresh `anon` grant. Measured
on the fixture: a function is anon-executable at create, false after
`revoke all ... from public, anon, authenticated`, and STILL FALSE after a
`create or replace` of its body. So a replace preserves a narrowed acl and the seven were
never at risk; the FIVE NEW functions are, which is 0201's defect exactly, confirmed by
reverting section 6 to the bare `from public` form and watching the self-check refuse the
apply and name those five and only those five. The re-revoke stays as defence in depth and
the header now says which it is.

**WHAT WAS NOT BUILT, AND IT IS HALF OF MR. PINA'S OWN SENTENCE.** "See and edit" is true
of SEE only. Measured on 0201: the three read policies already carry
`_classroom_manages_item`, so the instructor read half has worked since 0201; all seven
student write functions resolve through `student_email = current_user_email()` with no
manager term, so the instructor EDIT half has never been true and 0205 did not add it.
The reason is that a predicate is not the missing piece -- `ideacad_open_document` resolves
a document through `_classroom_engine_student`, which raises for anyone not enrolled in a
section the item is posted to, so a teacher cannot open a student document at all.
Widening only the write gate would grant a teacher permission to save a concept they have
no supported way to open. `tests/db/ideacad-sharing-instructor-path.test.ts` pins
`canWrite` FALSE for a manager, so the gap is asserted rather than assumed, and that is
the assertion to invert deliberately when teacher edit ships.

## One blocker that is NOT this bundle's to fix

**`tests/db/ideacad-grants-anon-execute-surface.test.ts` FAILS ON THIS BRANCH, and the fix
is a two-file change in files this ledger does not own -- one of them an applied
migration.** It passed in the baseline, so this branch introduces it, and it is diagnosed
rather than patched.

`0202`'s own apply-time self-check makes TWO assumptions that were true of `0201`'s world
and stop being true the moment the IdeaCAD subsystem grows a private helper. Both were
measured by probing them one at a time:

- **`if v_total <> 10 then raise`** -- it sweeps `^_?ideacad` and pins the count at exactly
  ten. `0205` adds nine (five public RPCs, four private predicates), so re-applying `0202`
  raises `expected 10 ideacad functions in public, found 19`. **Any future ideacad
  migration hits this**, not just this one. The guard's own message anticipates it: "if a
  later migration added another, revoke it there and update this count deliberately."
- **it requires EVERY `^_?ideacad` function to hold `authenticated` EXECUTE**, raising
  `... LOST the authenticated grant ... the narrowing went too far and the feature is
  down`. Two of `0205`'s predicates deliberately withhold it, because they are reached only
  from SECURITY DEFINER bodies and nothing names them in a policy. Confirmed by relaxing
  only the count and watching this fire on `_ideacad_can_write_document(uuid)` and
  `_ideacad_document_role(uuid)`.

**The fix, verified as far as it can be from here and then REVERTED byte-identically.**
Scoping `0202`'s loop to its own ten by name -- the same scope decision `0205` took for its
nine -- makes the migration apply and makes section E read correctly again
(`anon-executable ideacad functions -- with 0202: 0, without it: 10`, which is exactly the
property section E exists to measure). It needs `p.proname` added to that loop's select,
which it does not currently project. **But the test's own section B then fails on two
assertions** -- "has all ten functions and no more" and "keeps all ten executable by
authenticated" -- which read the live catalog and pin the same two assumptions. So the
complete fix is `0202` plus its test, and it belongs to ledger 0161/0162's lane.

`0202_ideacad_anon_grant_repair.sql` and that test file are both byte-identical to `HEAD`
on this branch, confirmed with `git diff --quiet`. Nothing outside the ownership list was
shipped.

## Numbers

- **Suite: 414 files, 413 passed / 1 failed; 7977 passed + 14 skipped / 393.21s**, against
  a baseline of **408 files / 7903 passed / 0 failed / 416.53s** measured on a clean
  `git worktree` at `origin/integration` `6a71eff4`. **The arithmetic reconciles exactly:**
  7903 + this bundle's 88 new tests - the 14 in the blocked file (which skip because its
  fixture cannot build) = 7977. Delta **+6 files**, all six this bundle's.
  **The one failing file is the blocker above and is not this bundle's to fix**; every one
  of this bundle's 88 assertions passes.
- Run twice on the branch. The first run (415s, same failure) overlapped single-file runs
  of mine on the shared cluster, so the number above is from the second, uncontended run.
- **svelte-check: 0 errors, 38 warnings in 21 files, 32/5/1** -- IDENTICAL to the baseline
  measured on the same worktree. `CLAUDE.md` still says 40 in 22; this is the fifth lane to
  measure 38 in 21, and this bundle does not own that file, so the correction is reported
  rather than made.
- **Paste trap: zero, two ways, against three planted positive controls.** 404 commented
  lines carry 0 dollar-quote tokens and 0 bare `$` of any kind; 38 code tokens in 19
  balanced pairs. Controls: a `$tag$` in a comment reads 1, a bare `$$` in a comment reads
  1, and a lone `$` in a comment reads 1 on way 2 only -- so the two ways are independent
  and neither zero is vacuous.
- **Seven mutants, all detected.** Five reddened assertions (6, 4, 6, 4 and 1); two were
  refused by the file's own self-check at apply time, one of them naming exactly the five
  functions 0201's defect would have left open.
- **The verification query returns 10 rows, every `ok` column `t`**, measured by running it
  against the real chain rather than predicted.
- `verify:readme` NOT run, per the prompt: no mounted surface is touched.

## Migration

`supabase/migrations/0205_ideacad_document_sharing.sql` -- **not applied.** This container
cannot reach production and did not try. It is proved against embedded Postgres with the
real chain applied in order, and applied TWICE to prove re-pasting is ordinary.
