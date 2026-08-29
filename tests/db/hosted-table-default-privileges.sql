-- tests/db/hosted-table-default-privileges.sql
--
-- The TABLE half of a hosted Supabase project's bootstrap default privileges.
-- tests/db/supabase-stub.sql carries the FUNCTION half and says why; the table
-- half was never added, which is exactly why a grant nobody wrote has been
-- invisible to this suite. Measured: with these lines a view or table created
-- by a migration comes out `anon=arwdDxtm/postgres`, which is production's
-- DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE; without them it
-- comes out with only what the migration itself granted.
--
-- It is applied as the first entry of tests/grant-surface.test.ts's own chain
-- rather than added to the shared stub, because turning it on for all 48 db
-- files is a change to what every one of them applies and is not this bundle's
-- to make. See that test's header.

alter default privileges in schema public
	grant all on tables to anon, authenticated, service_role;

alter default privileges in schema public
	grant all on sequences to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- auth.jwt(), in Supabase's own shape. The shared stub defines uid(), role()
-- and email() because the notebook chain is all that ever needed them; the
-- full chain reaches 0043, which reads auth.jwt(). Same fixture-completion
-- class as the three already there, kept here rather than in the stub for the
-- same reason the default privileges are.
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
