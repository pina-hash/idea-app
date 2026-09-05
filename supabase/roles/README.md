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
| `idea_migrator.sql` | the scoped role a session applies ONE migration as, and the event-trigger guard that refuses destructive DDL from it | Mr. Pina, once |

**Read the header of the file before pasting it.** Each states what the role may
do, what the guard refuses, what the guard CANNOT refuse, and what the role is
deliberately not granted. A credential whose reach nobody can state is a
credential nobody can decide about.
