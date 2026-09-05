-- 0177_reserved_number_tombstone.sql
--
-- A TOMBSTONE. THIS FILE CHANGES NO SCHEMA, AND IT IS NOT A STUB SOMEBODY
-- SHOULD FILL IN LATER. It creates nothing, drops nothing, grants nothing,
-- revokes nothing, backfills nothing and reads no table. Applying it prints one
-- notice and commits. That is the whole of its intended effect, now and
-- permanently.
--
-- ---------------------------------------------------------------------------
-- WHY THE NUMBER IS BURNED
-- ---------------------------------------------------------------------------
--
-- 0177 was RESERVED, by the router chat, for the notebook check-in management
-- bundle (prompt 0031). That session audited correctly and found that the two
-- capabilities it was to add were already there:
--
--   * EDIT is `notebook_admin_upsert_session`.
--   * DELETE is `notebook_admin_delete_session`.
--
-- Their guards were already in place too, so the correct outcome of that audit
-- was to write NO migration, and that is what it did. The next bundle (prompt
-- 0032) then took the next number it was given, 0178, and the series was left
-- with a hole.
--
-- ---------------------------------------------------------------------------
-- WHY A HOLE IS WORTH A FILE
-- ---------------------------------------------------------------------------
--
-- `supabase/migrations/` has been CONTIGUOUS for the entire history of this
-- repository, and two mechanisms lean on that:
--
--   * THE APPLY PATH IS A PERSON PASTING EACH FILE IN NUMERIC ORDER into the
--     Supabase SQL editor. There is no migration runner here and the remote
--     carries no `supabase_migrations.schema_migrations` table at all, so the
--     filename sort IS the applied order and nothing else records it.
--     `tools/idea-status.py` sorts the same way.
--   * `tests/db/` REPLAYS THE REAL CHAIN, file by file, against an embedded
--     Postgres. Each test names its own ordered list, so a file that appears at
--     0177 is INSERTED between 0176 and 0178 in every chain that names it --
--     not appended to the end.
--
-- Which is the hazard this file removes. 0178 and 0179 are already applied to
-- production. A future 0177 written into the hole would sort BEFORE them and
-- would be pasted, by a person following the numeric order, into a database
-- that has already run its successors -- an ordering nothing in this repo has
-- ever tested, and one the file's own author would have had no reason to think
-- about. Occupying the number closes that, and it closes the smaller thing
-- too: nobody has to go looking for what happened to 0177.
--
-- ---------------------------------------------------------------------------
-- IDEMPOTENT BY CONSTRUCTION
-- ---------------------------------------------------------------------------
--
-- Re-pasting a migration is ordinary here -- somebody re-pastes, or a first
-- attempt failed partway and gets retried -- so a file that only works once
-- fails exactly then. This one has nothing to be idempotent ABOUT: it holds no
-- DDL, no DML and no catalog guard, so applying it a hundred times leaves the
-- database in precisely the state it was in before the first. There is no
-- rollback to state either, for the same reason: nothing to undo.

do $$
begin
	raise notice
		'0177: TOMBSTONE. This number was reserved for the notebook check-in bundle (prompt 0031), which audited and correctly wrote no migration -- notebook_admin_upsert_session and notebook_admin_delete_session already existed, with their guards. The number is BURNED, not free. It changes no schema; nothing is expected to have happened.';
end;
$$;
