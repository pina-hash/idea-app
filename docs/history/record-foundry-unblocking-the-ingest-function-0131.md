---
title: "Foundry, unblocking the ingest function (`0131`)"
date: 2026-08-23
branches: []
migrations: ["0131"]
subsystems: ["IDEA Foundry"]
record_order: 120
---

Two additive fixes to 0130. No drops, no data touched. Written and applied on
`main`; the ingest function is still NOT deployed.

### FIX 1 -- service_role could not satisfy the Foundry CHECK constraints

A CHECK constraint's function is evaluated as the WRITING role. `service_role`
bypasses RLS; it does not bypass function grants. 0130 revoked its three private
predicates from `public` and granted them onward to nobody, so the three tables
it explicitly grants `service_role` insert/update/delete on were unwritable by
the one caller they exist to be written by. The RPCs never showed it, because
SECURITY DEFINER runs their checks as the owner.

**The sweep found three, not two.** The whole `public` schema was swept for the
shape -- a helper reachable from a write-time expression (CHECK, index predicate
or expression, column default, generated column) that `service_role` cannot
execute. RLS policies were excluded deliberately: service_role bypasses RLS, so
a policy function is not reachable by it. Both Foundry triggers are SECURITY
DEFINER, so trigger bodies are clean.

| function | reachable from | done |
| --- | --- | --- |
| `_classroom_deck_path_ok(text)` | 6 CHECKs; 3 on service_role-writable tables | granted |
| `_foundry_norm(text)` | 7 CHECKs on `student_apps` / `student_app_versions` | granted |
| `_foundry_slug_ok(text)` | `student_apps.slug` | granted -- NOT in the original report |
| `coin_semester_key(timestamptz)` | DEFAULT on `coin_transactions.semester_key` | NOT granted |

`_foundry_slug_ok` is the same shape and was latent rather than blocking: the
extraction function never writes `student_apps`, but the next direct writer of
that table would have failed identically, one function later. It was also
MASKED -- a service-role insert into `student_apps` fails on `_foundry_norm`
first, so granting only the two reported functions would have surfaced the third
as a fresh bug.

`coin_semester_key` matches the shape (granted to `authenticated`, not to
`service_role`) but `service_role` holds no insert or update on
`coin_transactions`, so there is no writer for the gap to open under. Granting
execute to a role that cannot write the table widens reach for nobody. It
belongs in whatever migration first gives that table a service-role writer.

### FIX 2 -- foundry-uploads had no SELECT policy, making UPDATE and DELETE inert

Storage has to FIND an object before it can act on one, and PostgreSQL applies
SELECT policies to a WHERE-qualified UPDATE. With no SELECT policy naming the
bucket an owner saw none of their own objects, so `remove()` reported SUCCESS
while the object survived -- the worst of the three, because it is silent. The
new policy is scoped exactly like the three write policies 0130 already carries.

**Single-write-per-path stays the model**: a fixed zip is a new version under a
new path. **But 0130's UPDATE policy plus this SELECT policy does make an
own-prefix overwrite technically possible**, where it previously failed. That is
measured, not assumed. The model is now a client convention rather than
something the database refuses; making it a refusal again would mean dropping
the UPDATE policy, which is a removal and does not belong in an additive
migration.

### What was measured

Against the LOCAL stack (all 130 migrations, real Storage service). The local
grants applied ad hoc during the previous bundle were REVOKED first, so the
"before" is genuinely what 0130 leaves behind rather than a measurement of the
earlier session's own change.

Before / after / reverted, same probe each time:

- `insert student_app_files` -- `permission denied for function
  _classroom_deck_path_ok` / SUCCEEDED / same error again.
- `update student_app_versions` -- `permission denied for function
  _foundry_norm` / SUCCEEDED / same error again.
- `insert student_apps` -- `permission denied for function _foundry_norm` /
  SUCCEEDED / same error again.
- owner sees own uploads -- 0 / 4 / 0.
- owner deletes own upload -- object SURVIVED / GONE / SURVIVED.
- owner deletes another owner's -- survives in all three.
- owner overwrites another owner's path -- refused in all three.
- owner overwrites OWN path -- refused / SUCCEEDED / refused.

The stated reversal was RUN, not just written: it restores the prior behaviour
exactly, and the migration was then re-applied. The file re-applies cleanly (the
second paste reports the policy already present and re-grants as a no-op).

The full ingest harness was re-run against the migrated stack with no ad-hoc
grants in place: **39 of 42 assertions pass**, and the 3 that do not are the
ones that ASSERTED THE DEFECT -- that a student cannot read, overwrite or delete
their own upload. They are inverted by FIX 2 on purpose.

`svelte-check`: 0 errors, 37 warnings (31/5/1), baseline unmoved. Full suite: 90
files, 2182 tests, all passing.

### Tests

`tests/foundry-policies.test.ts` gains 0131 to its chain and three assertions.
The important one asserts the RULE rather than the three names: every function
reachable from a CHECK on a table `service_role` may INSERT into must be
executable by `service_role`. Spelling out the current three would pass forever
the moment a fourth is added without a grant, which is exactly how this recurs.

**Mutation proof.** Commenting out the `_foundry_slug_ok` grant makes the
migration REFUSE TO APPLY -- its own verification block raises with the missing
function named, which is a safety net worth having. With that block also
neutered, the generalized assertion fails with `_foundry_slug_ok (via
student_apps)` and the direct-write test fails beside it. The file was restored
md5-identically (`5c99b44fa4a1618704bc0ff716dce49f`) and re-verified green.

### NOT verified

- **Not applied to the live project.** The CLI cannot push here (the remote has
  no migration history table, so `db push` would plan all 131 files); the SQL is
  printed for the SQL editor.
- **The ingest function is still not deployed.** 0131 is what unblocks it; the
  deploy is a separate, later step.
- **The overwrite consequence was measured, not designed for.** No client
  currently overwrites, and nothing was added to stop one.

---

