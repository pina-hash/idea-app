-- 0017_gauntlet_run_status.sql
-- IDEA // GAUNTLET: live, client-readable run status so the browser race timer
-- starts the instant the SolidWorks Start macro fires, anchored to the exact
-- server-stamped started_at (not the reveal, not a browser clock).
--
-- The token table (gauntlet_run_tokens) is intentionally client-unreadable and
-- not in Realtime (it holds submit codes). Rather than relax that, we project the
-- ONE non-sensitive fact the play screen needs, started_at, into a small own-row
-- table the client may read + subscribe to over Realtime. gauntlet_macro_start
-- (SECURITY DEFINER) upserts it; clients get SELECT on their own row only, and no
-- write grant.
--
-- Accuracy: started_at is server time. The client measures its clock offset once
-- from the reveal RPC's reveal_at and displays (clientNow - offset) - started_at,
-- so the on-screen timer tracks the same clock the server scores with. Staleness
-- from a prior run is rejected client-side by comparing started_at to the current
-- reveal_at (both server times).
--
-- Apply manually in the Supabase SQL editor. Idempotent where practical.

-- ---------------------------------------------------------------------------
-- 1. Own-row run status projection. One row per (user, challenge): the active
--    run's server start. Written only by the SECURITY DEFINER start RPC.
-- ---------------------------------------------------------------------------
create table if not exists public.gauntlet_run_status (
	user_id uuid not null references auth.users (id) on delete cascade,
	challenge_id uuid not null references public.challenges (id) on delete cascade,
	run_id uuid,
	started_at timestamptz,
	updated_at timestamptz not null default now(),
	primary key (user_id, challenge_id)
);

-- Full row in Realtime payloads (and RLS re-check) on UPDATE.
alter table public.gauntlet_run_status replica identity full;

-- No client write grant: only the definer RPC writes. Clients read their own row.
revoke all on public.gauntlet_run_status from anon, authenticated;
grant select on public.gauntlet_run_status to authenticated;

alter table public.gauntlet_run_status enable row level security;

drop policy if exists "read own run status" on public.gauntlet_run_status;
create policy "read own run status" on public.gauntlet_run_status
	for select using (user_id = (select auth.uid()));

-- Live updates to the play screen (RLS still scopes the stream to the owner).
do $$
begin
	if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
		and not exists (
			select 1 from pg_publication_tables
			where pubname = 'supabase_realtime'
				and schemaname = 'public'
				and tablename = 'gauntlet_run_status'
		)
	then
		alter publication supabase_realtime add table public.gauntlet_run_status;
	end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Start RPC (from 0016) now also upserts the run-status row, so the browser
--    is notified the instant the macro fires. Body is otherwise unchanged.
-- ---------------------------------------------------------------------------
create or replace function public.gauntlet_macro_start(
	p_code text,
	p_volume_mm3 numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_token public.gauntlet_run_tokens%rowtype;
	v_now timestamptz := now();
	v_run_id uuid := gen_random_uuid();
begin
	if p_code is null or length(trim(p_code)) = 0 then
		raise exception 'Missing start code.';
	end if;

	-- A run may only begin on a blank part. This is a client-attested sanity
	-- value (the macro also checks locally), kept as a server guard.
	if p_volume_mm3 is not null and p_volume_mm3 > 0 then
		raise exception 'This part is not blank. Start your run on a new, empty part.';
	end if;

	select * into v_token from public.gauntlet_run_tokens where code = upper(trim(p_code));
	if not found then
		raise exception 'Invalid start code.';
	end if;
	if v_token.used_at is not null then
		raise exception 'This code is no longer active. Re-reveal in GAUNTLET to start a new run.';
	end if;
	if v_now > v_token.expires_at then
		raise exception 'This code has expired. Re-reveal in GAUNTLET to start a new run.';
	end if;

	-- Once a correct submit has locked a ranked time, a re-start may not reset it.
	if v_token.locked_at is not null then
		raise exception 'You already recorded a ranked run for this code. Re-reveal in GAUNTLET for a fresh run.';
	end if;

	-- (Re)start: fresh run_id, reset the server start clock. The predicates keep a
	-- concurrent lock/consume from racing this write.
	update public.gauntlet_run_tokens
		set run_id = v_run_id, started_at = v_now
		where code = v_token.code and used_at is null and locked_at is null;
	if not found then
		raise exception 'Could not start this run. Re-reveal in GAUNTLET for a fresh code.';
	end if;

	-- Publish the live run status for the owner (drives the browser race timer).
	insert into public.gauntlet_run_status (user_id, challenge_id, run_id, started_at, updated_at)
	values (v_token.user_id, v_token.challenge_id, v_run_id, v_now, v_now)
	on conflict (user_id, challenge_id)
		do update set run_id = excluded.run_id, started_at = excluded.started_at, updated_at = excluded.updated_at;

	return jsonb_build_object('run_id', v_run_id, 'started_at', v_now);
end;
$$;

revoke all on function public.gauntlet_macro_start(text, numeric) from public;
grant execute on function public.gauntlet_macro_start(text, numeric) to anon, authenticated;
