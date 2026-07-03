-- 0035_gauntlet_run_events.sql
-- IDEA // GAUNTLET: append-only Speedrun telemetry (the modeling-process stream)
-- plus a materialized per-run summary for fast history / leaderboard reads.
--
-- FAIL-SAFE, NON-BLOCKING: telemetry never affects a run's outcome. The add-in
-- writes here best-effort and independently of gauntlet_macro_start /
-- gauntlet_macro_submit; a telemetry failure leaves verification untouched.
--
-- Minor-appropriate scope (enforced by what the add-in emits, documented here):
-- modeling-process and integrity signals only, active document only. No
-- keylogging, no screenshots, no filesystem scraping.
--
-- Auth model mirrors the macro RPCs: the add-in posts with the public anon key
-- and the single-use CODE + run_id as the credential. Writes go only through the
-- SECURITY DEFINER RPCs below, which resolve the owning user from the run token,
-- so a client cannot forge another user's stream. Reads are RLS-scoped: a student
-- sees only their own events/analysis; teachers see all.
--
-- Apply manually in the Supabase SQL editor. Idempotent where practical.

-- ---------------------------------------------------------------------------
-- 1. gauntlet_run_events: raw, append-only. Store raw so new metrics can be
--    derived later without recollecting. Monotonic seq per run; t_ms is elapsed
--    ms from the server-anchored run start.
-- ---------------------------------------------------------------------------
create table if not exists public.gauntlet_run_events (
	id bigint generated always as identity primary key,
	run_id uuid not null,
	user_id uuid not null references auth.users (id) on delete cascade,
	challenge_id uuid,
	room_id uuid,
	seq integer not null,
	t_ms bigint not null,
	event_type text not null,
	payload jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	unique (run_id, seq)
);

create index if not exists gauntlet_run_events_run_seq_idx
	on public.gauntlet_run_events (run_id, seq);
create index if not exists gauntlet_run_events_user_idx
	on public.gauntlet_run_events (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. gauntlet_run_analysis: one materialized summary per run, upserted on the
--    add-in's final flush at submit. Fast reads for history + the post-run view;
--    the raw stream stays the source of truth for anything not summarized here.
-- ---------------------------------------------------------------------------
create table if not exists public.gauntlet_run_analysis (
	run_id uuid primary key,
	user_id uuid not null references auth.users (id) on delete cascade,
	challenge_id uuid,
	room_id uuid,
	final_volume_mm3 numeric,
	computed_mass numeric,
	mass_unit text,
	feature_count integer,
	rebuild_ms bigint,
	error_count integer,
	warning_count integer,
	undo_count integer,
	redo_count integer,
	active_ms bigint,
	idle_ms bigint,
	integrity jsonb not null default '{}'::jsonb,
	stuck_point jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists gauntlet_run_analysis_user_idx
	on public.gauntlet_run_analysis (user_id, created_at desc);
create index if not exists gauntlet_run_analysis_challenge_idx
	on public.gauntlet_run_analysis (challenge_id);

-- ---------------------------------------------------------------------------
-- 3. Access. No direct client DML; the definer RPCs are the only writers.
--    Reads: own rows (or teacher).
-- ---------------------------------------------------------------------------
alter table public.gauntlet_run_events enable row level security;
alter table public.gauntlet_run_analysis enable row level security;
revoke all on public.gauntlet_run_events from anon, authenticated;
revoke all on public.gauntlet_run_analysis from anon, authenticated;
grant select on public.gauntlet_run_events to authenticated;
grant select on public.gauntlet_run_analysis to authenticated;

drop policy if exists "read own run events" on public.gauntlet_run_events;
create policy "read own run events" on public.gauntlet_run_events
	for select using (user_id = (select auth.uid()) or public.is_teacher());

drop policy if exists "read own run analysis" on public.gauntlet_run_analysis;
create policy "read own run analysis" on public.gauntlet_run_analysis
	for select using (user_id = (select auth.uid()) or public.is_teacher());

-- ---------------------------------------------------------------------------
-- 4. Batch insert RPC (append-only). The add-in posts an ARRAY of events with
--    the code + run_id as the credential; the owner is resolved from the token,
--    never trusted from the client. Duplicate (run_id, seq) is ignored so a
--    retried flush is safe. Best-effort by contract: callers ignore failures.
-- ---------------------------------------------------------------------------
create or replace function public.gauntlet_run_events_insert(
	p_code text,
	p_run_id text,
	p_events jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_token public.gauntlet_run_tokens%rowtype;
	v_run_id uuid;
	v_inserted integer := 0;
begin
	if p_code is null or p_run_id is null or p_events is null then
		return 0;
	end if;
	begin
		v_run_id := trim(p_run_id)::uuid;
	exception when others then
		return 0;
	end;

	select * into v_token from public.gauntlet_run_tokens where code = upper(trim(p_code));
	if not found or v_token.run_id is null or v_token.run_id <> v_run_id then
		-- Not a valid, started run for this code: drop the batch (never raise).
		return 0;
	end if;

	insert into public.gauntlet_run_events
		(run_id, user_id, challenge_id, room_id, seq, t_ms, event_type, payload)
	select
		v_run_id, v_token.user_id, v_token.challenge_id, v_token.room_id,
		(e ->> 'seq')::integer,
		coalesce((e ->> 't_ms')::bigint, 0),
		coalesce(nullif(trim(e ->> 'event_type'), ''), 'unknown'),
		coalesce(e -> 'payload', '{}'::jsonb)
	from jsonb_array_elements(p_events) e
	where (e ->> 'seq') is not null
	on conflict (run_id, seq) do nothing;

	get diagnostics v_inserted = row_count;
	return v_inserted;
end;
$$;

revoke all on function public.gauntlet_run_events_insert(text, text, jsonb) from public;
grant execute on function public.gauntlet_run_events_insert(text, text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Summary upsert RPC. Called on the add-in's final flush; same credential
--    model. Whitelisted numeric/jsonb fields only, so a client cannot inject
--    arbitrary columns.
-- ---------------------------------------------------------------------------
create or replace function public.gauntlet_run_analysis_upsert(
	p_code text,
	p_run_id text,
	p_summary jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_token public.gauntlet_run_tokens%rowtype;
	v_run_id uuid;
	s jsonb := coalesce(p_summary, '{}'::jsonb);
begin
	if p_code is null or p_run_id is null then
		return;
	end if;
	begin
		v_run_id := trim(p_run_id)::uuid;
	exception when others then
		return;
	end;
	select * into v_token from public.gauntlet_run_tokens where code = upper(trim(p_code));
	if not found or v_token.run_id is null or v_token.run_id <> v_run_id then
		return;
	end if;

	insert into public.gauntlet_run_analysis (
		run_id, user_id, challenge_id, room_id,
		final_volume_mm3, computed_mass, mass_unit, feature_count,
		rebuild_ms, error_count, warning_count, undo_count, redo_count,
		active_ms, idle_ms, integrity, stuck_point, updated_at
	) values (
		v_run_id, v_token.user_id, v_token.challenge_id, v_token.room_id,
		nullif(s ->> 'final_volume_mm3', '')::numeric,
		nullif(s ->> 'computed_mass', '')::numeric,
		nullif(s ->> 'mass_unit', ''),
		nullif(s ->> 'feature_count', '')::integer,
		nullif(s ->> 'rebuild_ms', '')::bigint,
		nullif(s ->> 'error_count', '')::integer,
		nullif(s ->> 'warning_count', '')::integer,
		nullif(s ->> 'undo_count', '')::integer,
		nullif(s ->> 'redo_count', '')::integer,
		nullif(s ->> 'active_ms', '')::bigint,
		nullif(s ->> 'idle_ms', '')::bigint,
		coalesce(s -> 'integrity', '{}'::jsonb),
		s -> 'stuck_point',
		now()
	)
	on conflict (run_id) do update set
		final_volume_mm3 = excluded.final_volume_mm3,
		computed_mass = excluded.computed_mass,
		mass_unit = excluded.mass_unit,
		feature_count = excluded.feature_count,
		rebuild_ms = excluded.rebuild_ms,
		error_count = excluded.error_count,
		warning_count = excluded.warning_count,
		undo_count = excluded.undo_count,
		redo_count = excluded.redo_count,
		active_ms = excluded.active_ms,
		idle_ms = excluded.idle_ms,
		integrity = excluded.integrity,
		stuck_point = excluded.stuck_point,
		updated_at = now();
end;
$$;

revoke all on function public.gauntlet_run_analysis_upsert(text, text, jsonb) from public;
grant execute on function public.gauntlet_run_analysis_upsert(text, text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Realtime: the live in-run view subscribes to its own run's events. RLS
--    still scopes the stream to the owner.
-- ---------------------------------------------------------------------------
do $$
begin
	if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
		and not exists (
			select 1 from pg_publication_tables
			where pubname = 'supabase_realtime'
				and schemaname = 'public'
				and tablename = 'gauntlet_run_events'
		)
	then
		alter publication supabase_realtime add table public.gauntlet_run_events;
	end if;
end $$;
