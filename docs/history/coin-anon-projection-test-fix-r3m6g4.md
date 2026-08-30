---
title: "The coin leaderboard's opaque-id test stops checking a coincidence and starts checking the property, with a salt rotation (`claude/coin-anon-projection-test-fix-r3m6g4`, no migration)"
date: 2026-08-30
branches: [claude/coin-anon-projection-test-fix-r3m6g4]
migrations: []
subsystems: ["Coin economy", "Testing"]
---

`main` was red, at random, roughly one run in every hundred and forty, on this
line in `tests/coin-public-anon-projection.test.ts`:

	expect(adaRow.student_id).not.toContain('ada');

`student_id` is `md5(secret salt || email)`, a 32-character hexadecimal digest.
`a` and `d` are hex digits, so `ada` occurs in a random digest by chance: thirty
possible starting positions, each at `(1/16)^3`, which is one run in 137.
Measured rather than reasoned, over 200,000 salts freshly minted through this
exact SQL derivation with this exact address: **1512 hits, one in 132**. The
assertion had nothing to do with the property it sat under.

**Its twin could not fail at all.** `expect(...).not.toContain('lovelace')` was
checking a hex digest for `l`, `o` and `v`, none of which are in `[0-9a-f]`. It
was green from the day it was written, it tested nothing, and 0 of the same
200,000 digests contained it. Established from the alphabet, not from the
sample: the sample only confirms it.

So one assertion failed at random and its twin could never fail, and between
them they were standing in for "the id is not derivable from the address."

**SUBSTRING-FREEDOM WAS NEVER THE PROPERTY, AND THAT IS THE POINT OF THE
CHANGE.** A digest of a name is not recoverable by looking for the name inside
it; it is recoverable by COMPUTING THE SAME DIGEST. The real claim is that a
signed-out visitor holding a student's address still cannot produce that
student's `student_id`, because the derivation folds in a secret the visitor has
no path to: a pair of random uuids minted at apply time into
`coin_public_id_secret`, a table with no grant, RLS enabled and no policy, which
`tests/coin-public-ledger.test.ts` already pins as unreadable by anon,
authenticated and an admin alike.

**THE ROTATION IS WHAT SAYS SO.** The replacement reads every id, rotates the
secret as the connection owner, re-reads, and asserts every id MOVED while every
address stayed exactly where it was, then restores the salt in a `finally` so
the drawer ids the rest of the file addresses are the ones it started with. An
id that survived a salt rotation would by definition be a function of the
address alone.

**AND THE ROTATION IS THE HALF THE OLD FILE HAD NO ASSERTION FOR, WHICH IS THE
COVERAGE THIS BUYS.** Measured by mutating the derivation in the database rather
than by argument. Replacing `_coin_public_roster` with
`md5('a-constant-nobody-rotates' || email)` -- an id fully derivable by anyone
who can read the migration file -- **passed all 23 of the old tests**. It is the
new rotation assertion, and only that assertion, which reddens on it. The
surviving `not.toBe(md5(email))` check (kept, and widened to a five-candidate
sweep over what a visitor actually holds) catches the plain unsalted case; it
does not catch a constant.

Every new assertion was proven to bite by mutating the real
`_coin_public_roster` in the test database and confirming the specific message:

| mutant | derivation | reddens |
| --- | --- | --- |
| `unsalted` | `md5(email)` | `id equals md5(ada.lovelace@boscotech.net)` |
| `constsalt` | `md5('a-constant...' \|\| email)` | `Ada Lovelace's id survived a salt rotation` |
| `collide` | `md5('same-for-everyone')` | the distinctness check |
| `nonhex` | the local part in plain text | the `/^[0-9a-f]{32}$/` shape |
| `unstable` | `md5(random()::text)`, volatile | the stability check |

The file was restored from a scratch copy and md5-checked after each, never with
`git checkout --`.

## What the sweep found, and what is left standing

Two other classes were swept for across all 236 files in `tests/`.

**A second instance of the same defect survives, unfixed, in
`tests/coin-public-ledger.test.ts:298-301`** -- deliberately left alone to keep
this branch small enough to unblock a red `main`. Its needle list is
`[studentA.email, 'ada.lovelace', 'lovelace', 'boscotech']`, and every one of
them is checked against `student_id`, a hex digest. `.`, `@`, `l`, `o`, `v`, `s`,
`t`, `h` are not hex digits, so **all four of those assertions are structurally
incapable of failing.** The `decoded` latin1 form beside them is not vacuous by
alphabet but is by probability: the longest needle is 25 characters against a
16-byte string (impossible by length) and the shortest lands around `5e-19`.
Its own comment already records that an earlier bare-`'@'` form of it failed one
run in sixteen, so the file has now produced this defect twice. **The fix is the
rotation proof above, not a longer needle list.**

**The empty-result class is present as a shape and was not found to be real.**
A mechanical pass flagged 172 sites of the form `for (const x of LIST) expect(...)`
with no size control inside the same test body, but spot-checking says the
heuristic is dominated by false positives: the guarantee is usually pinned in a
SIBLING test in the same file (`_NON_ADMIN_STRIPS` is walked in five tests and
pinned `toHaveLength(5)` at `tests/vanguard-admin-gate.test.ts:137`;
`site.apps` is controlled by the neighbouring test naming `site.apps.classroom`
explicitly). **All 172 were not individually verified**, and that is the honest
limit of this pass rather than a clean bill.

## Not verified

The live Supabase project, a real signed-in session, and any browser surface:
this is a test-only change and touches nothing rendered. No migration, and
nothing under `src/`. The application was checked and found to be RIGHT -- the
derivation does hold the property the test claims, which is why the test could
be repaired rather than the code.
