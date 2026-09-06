# supabase/roles/

**SQL a PERSON pastes once, by hand, in the Supabase SQL editor. Not migrations.**

Nothing here is numbered, nothing here is in the migration chain, and
`tools/idea-status.py` does not read this directory. A file here is here for one
reason: **it carries a password**, and `supabase/migrations/` is committed to a
public repository. The password in every file is a placeholder in capitals and
must be replaced with a real one at paste time, in the editor, never in a commit.

A file here is idempotent and re-pasteable, like a migration, and ends with a
self-check that RAISES rather than leaving half a role behind. Each one also
carries its own reversal, so removing what it created is one paste rather than a
reconstruction.

| file | what it creates | who pastes it |
| --- | --- | --- |
| `idea_migrator.sql` | the scoped role a session applies ONE migration as. **No guard: see below.** | Mr. Pina, once |

**Read the header of the file before pasting it.** Each states what the role may
do, what refuses it, what does NOT refuse it, and what it is deliberately not
granted. A credential whose reach nobody can state is a credential nobody can
decide about.

## There is no guard in the database, and there cannot be

`idea_migrator.sql` was written with an event-trigger guard that refused
`drop table` and friends from the scoped role. **It cannot be installed on
Supabase.** `create event trigger` requires superuser, and Supabase's `postgres`
role is not one; naming the SUPERUSER attribute at all, even to set it false,
also requires superuser, which is where the first paste attempt failed on
2026-09-05 with `42501 permission denied to alter role`. Both measured on
PostgreSQL 17.10.

So the only control on what a migration may contain is
`tools/apply-migration.mjs`, which is **client-side and bypassable by anyone
holding the password and a `psql` prompt**. The file's own header carries the
full list of what that leaves possible, under the heading **"WHAT DOES NOT
PROTECT YOU"**. Read it before pasting, and do not let a later edit soften it:
the value of that section is that it is blunt.

**Nothing here may be turned into a migration to get around this.** A migration
runs as the same non-superuser and would fail identically, and it would put a
password in a public repository on the way.
