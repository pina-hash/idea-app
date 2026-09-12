-- tools/backup/roundtrip-stub-extra.sql
--
-- WHAT `tests/db/supabase-stub.sql` DELIBERATELY DOES NOT HAVE, AND WHY THIS
-- IS A SECOND FILE RATHER THAN AN EDIT TO IT.
--
-- That stub says of itself that it is "the SMALLEST stub that lets the real,
-- unmodified migration files run" -- for the CHAINS the tests ask for, which
-- are subsets. This harness applies ALL 201 migrations, which is a strictly
-- larger set, so it reaches Supabase surfaces no test chain does. Widening the
-- shared stub to suit one harness would change the fixture under every
-- database test in the suite, for a reason none of them has.
--
-- Applied AFTER the stub and BEFORE the migrations. Every object here exists
-- on a real Supabase project already; nothing in it is a substitute for a
-- migration, and nothing in it is dumped (it is all outside `public`).

-- 0043 onwards read the verified JWT as a whole. Supabase's own definition.
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

-- Realtime's publication. 0064 and several later files add tables to it; a
-- real project has it from the start. `for table none` is not a spelling
-- Postgres accepts, so it is created empty with no tables and grows exactly as
-- the migrations add to it.
do $$
begin
	if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
		create publication supabase_realtime;
	end if;
end
$$;

-- `auth.identities` -- the row that says WHICH GOOGLE ACCOUNT a uuid is. A
-- real project has had it since the first sign-in; the test stub has no need
-- of it because no test signs in through a provider. It is in the FRESH-PROJECT
-- file rather than in the seed on purpose: both databases in the round trip
-- must already have it, exactly as a fresh Supabase project does, or the
-- restore is being compared against a target the real one does not look like.
create table if not exists auth.identities (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references auth.users (id) on delete cascade,
	provider text not null,
	provider_id text not null,
	identity_data jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	unique (provider, provider_id)
);
