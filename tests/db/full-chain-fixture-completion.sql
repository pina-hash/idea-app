-- tests/db/full-chain-fixture-completion.sql
--
-- Two more pieces of a hosted project that live outside supabase/migrations and
-- that only the FULL chain reaches. tests/db/supabase-stub.sql defines auth.uid(),
-- auth.role() and auth.email() because the notebook chain is all that ever needed
-- them; these two are the same class of fixture completion, applied by the suites
-- that go past the notebook.
--
-- THIS FILE USED TO CARRY THE HOSTED TABLE DEFAULT PRIVILEGES AND NO LONGER DOES.
-- They are in the shared stub now, where they belong and where every db suite gets
-- them; that file's header carries the whole argument and the measurements. Do not
-- put a second copy of them here: a fixture that grants them twice is fine, but a
-- second statement of a rule is the one that stops matching when the first moves.
--
-- WHY THE REALTIME PUBLICATION DID NOT MOVE WITH THEM, WHICH IS NOT AN OVERSIGHT.
-- tests/notebook-review-acknowledged.test.ts asserts, as a test, that the fixture
-- has NO `supabase_realtime` publication ("does nothing at all where no
-- publication exists") and then CREATES one itself in three sibling tests to
-- exercise the other world. Both worlds are real -- the Supabase dashboard is
-- editable, so a project may or may not have published anything -- and putting the
-- publication in the shared stub would delete one of them and raise 42710 in the
-- other three. It stays here, applied only by the chains that need it.

-- ---------------------------------------------------------------------------
-- auth.jwt(), in Supabase's own shape. The full chain reaches 0043, which reads
-- it.
-- ---------------------------------------------------------------------------

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
	select coalesce(
		nullif(current_setting('request.jwt.claim', true), ''),
		nullif(current_setting('request.jwt.claims', true), '')
	)::jsonb;
$$;

-- ---------------------------------------------------------------------------
-- The Realtime publication a hosted project ships with. 0064 adds a table to
-- it; on a bare cluster it does not exist. Created empty, exactly as a fresh
-- project's is before anything opts in.
-- ---------------------------------------------------------------------------

do $$
begin
	if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
		create publication supabase_realtime;
	end if;
end
$$;
