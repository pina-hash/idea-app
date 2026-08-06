-- 0062_tournaments.sql
-- IDEA Tournaments, Phase 1: registration through a live, fully PUBLIC,
-- host-run double-elimination bracket with optional head-to-head qualifying
-- pools.
--
-- Access model (deliberately different from GAUNTLET's signed-in tier):
--   * Every tournament table is PUBLIC-SELECT to anon AND authenticated: the
--     live bracket is a spectator surface reached with no session at all.
--   * There is NO client write path anywhere: no insert/update/delete grant,
--     no write RLS policy. Every mutation goes through a SECURITY DEFINER RPC
--     below (the gauntlet_submit / gauntlet_room_* doctrine), each of which
--     re-checks the caller server-side (signed-in for self-registration, a
--     tournament_hosts row for host actions, the invited user for invites).
--   * IDENTITY RULE: nothing here ever surfaces a Google account name or
--     avatar. The public identity of a participant is entries.display_name +
--     entries.thumbnail_url, chosen at registration. user_id columns hold
--     opaque uuids only, and no view or RPC joins profiles for display.
--
-- Table naming: the spec's bare names (entries, invites, ...) are prefixed
-- tournament_* to match the repo's feature-prefix convention (gauntlet_*,
-- frc_*, greenline_*) and keep the public schema unambiguous. RPCs are
-- prefixed tournament_* for the same reason (PostgREST's RPC namespace is
-- global).
--
-- Double-elimination model (bracket_matches):
--   * bracket size P = next power of two >= N entries, R = log2(P) winners
--     rounds. Winners round r has P/2^r matches. Losers bracket has 2(R-1)
--     rounds: for k = 1..R-1, round 2k-1 (minor: losers-bracket survivors
--     pair up; round 1 is fed by winners-round-1 losers) and round 2k
--     (major: minor-round winners meet the losers dropping from winners
--     round k+1) each have P/2^(k+1) matches. The losers-final winner meets
--     the winners-final winner in the grand final; a grand_final_reset match
--     is created ONLY when the losers-bracket finalist wins the first grand
--     final. With N = 2 (R = 1) there is no losers bracket and the winners
--     final's loser drops straight into the grand final.
--   * Every match carries explicit advancement pointers
--     (winner_to_match_id/pos, loser_to_match_id/pos), wired once at
--     generation, so advancement and the correction rules never re-derive
--     topology. A null loser pointer means elimination on loss.
--   * Byes: a non-power-of-two field leaves empty round-1 slots (standard
--     1-vs-P seeding). A slot is DEAD when it holds no entry and no
--     non-complete match points at it; a pending match with one live side
--     and one dead side auto-completes as a bye (no games), and a match with
--     two dead sides completes with a null winner. The resolver runs at
--     generation and after every result, so cascades (a bye whose loser
--     feeder never existed) settle themselves.
--
-- match_events is the append-only audit stream (Phase 1 writes it even
-- though the analytics view is a later phase; this data cannot be
-- reconstructed retroactively). 'seeded' extends the spec's event-type list
-- to carry the logged random draws seed ordering can require.
--
-- Apply manually in the Supabase SQL editor, after 0061. Idempotent where
-- practical.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table if not exists public.tournaments (
	id uuid primary key default gen_random_uuid(),
	name text not null check (char_length(btrim(name)) between 1 and 80),
	description text not null default '',
	-- Normalized by _tournament_normalize_config:
	--   quals_enabled   boolean -- head-to-head qualifying pools before the bracket
	--   score_entry     boolean -- true: per-game scores; false: win/loss only
	--   best_of_default integer -- odd, 1..15
	--   best_of         object  -- optional per-round overrides, keys
	--                              'winners' | 'losers' | 'grand_final' |
	--                              'winners:<round>' | 'losers:<round>'
	config jsonb not null default '{}'::jsonb,
	status text not null default 'draft'
		check (status in ('draft', 'registration_open', 'seeding', 'live', 'complete')),
	-- FK added below (tournament_entries does not exist yet at this point).
	champion_entry_id uuid,
	created_by uuid references auth.users (id) on delete set null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

drop trigger if exists tournaments_touch_updated_at on public.tournaments;
create trigger tournaments_touch_updated_at
	before update on public.tournaments
	for each row execute function public.touch_updated_at();

create table if not exists public.tournament_hosts (
	tournament_id uuid not null references public.tournaments (id) on delete cascade,
	user_id uuid not null references auth.users (id) on delete cascade,
	-- Informational only: every host row grants full match control.
	role text not null default 'host' check (role in ('creator', 'host')),
	added_by uuid references auth.users (id) on delete set null,
	created_at timestamptz not null default now(),
	primary key (tournament_id, user_id)
);

create index if not exists tournament_hosts_user_idx on public.tournament_hosts (user_id);

create table if not exists public.tournament_entries (
	id uuid primary key default gen_random_uuid(),
	tournament_id uuid not null references public.tournaments (id) on delete cascade,
	-- Null for unlinked walk-ups a host adds by hand.
	user_id uuid references auth.users (id) on delete set null,
	display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
	description text not null default '',
	-- Public URL or a path in the public 'tournament-thumbs' bucket.
	thumbnail_url text check (thumbnail_url is null or char_length(thumbnail_url) <= 600),
	seed integer,
	created_by uuid references auth.users (id) on delete set null,
	created_at timestamptz not null default now()
);

create index if not exists tournament_entries_tournament_idx
	on public.tournament_entries (tournament_id);
create unique index if not exists tournament_entries_one_per_user
	on public.tournament_entries (tournament_id, user_id)
	where user_id is not null;

do $$
begin
	if not exists (
		select 1 from pg_constraint where conname = 'tournaments_champion_entry_fk'
	) then
		alter table public.tournaments
			add constraint tournaments_champion_entry_fk
			foreign key (champion_entry_id) references public.tournament_entries (id)
			on delete set null;
	end if;
end
$$;

create table if not exists public.tournament_invites (
	id uuid primary key default gen_random_uuid(),
	tournament_id uuid not null references public.tournaments (id) on delete cascade,
	invited_user_id uuid not null references auth.users (id) on delete cascade,
	invited_by uuid references auth.users (id) on delete set null,
	status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
	created_at timestamptz not null default now(),
	responded_at timestamptz,
	unique (tournament_id, invited_user_id)
);

create index if not exists tournament_invites_user_idx
	on public.tournament_invites (invited_user_id);

create table if not exists public.tournament_qual_pools (
	id uuid primary key default gen_random_uuid(),
	tournament_id uuid not null references public.tournaments (id) on delete cascade,
	pool_number integer not null check (pool_number >= 1),
	created_at timestamptz not null default now(),
	unique (tournament_id, pool_number)
);

create table if not exists public.tournament_qual_matches (
	id uuid primary key default gen_random_uuid(),
	pool_id uuid not null references public.tournament_qual_pools (id) on delete cascade,
	-- Denormalized for realtime filters and simple public reads.
	tournament_id uuid not null references public.tournaments (id) on delete cascade,
	-- Order within the pool's round-robin schedule.
	sequence integer not null,
	entry_a_id uuid not null references public.tournament_entries (id) on delete restrict,
	entry_b_id uuid not null references public.tournament_entries (id) on delete restrict,
	winner_id uuid references public.tournament_entries (id) on delete restrict,
	score_a integer check (score_a is null or score_a >= 0),
	score_b integer check (score_b is null or score_b >= 0),
	played_at timestamptz
);

create index if not exists tournament_qual_matches_pool_idx
	on public.tournament_qual_matches (pool_id);
create index if not exists tournament_qual_matches_tournament_idx
	on public.tournament_qual_matches (tournament_id);

create table if not exists public.tournament_bracket_matches (
	id uuid primary key default gen_random_uuid(),
	tournament_id uuid not null references public.tournaments (id) on delete cascade,
	bracket text not null
		check (bracket in ('winners', 'losers', 'grand_final', 'grand_final_reset')),
	round integer not null check (round >= 1),
	slot integer not null check (slot >= 1),
	entry_a_id uuid references public.tournament_entries (id) on delete restrict,
	entry_b_id uuid references public.tournament_entries (id) on delete restrict,
	best_of integer not null default 1 check (best_of between 1 and 15 and best_of % 2 = 1),
	status text not null default 'pending'
		check (status in ('pending', 'in_progress', 'complete')),
	winner_id uuid references public.tournament_entries (id) on delete restrict,
	started_at timestamptz,
	completed_at timestamptz,
	-- Advancement pointers, wired at generation. Null loser pointer =
	-- eliminated on loss.
	winner_to_match_id uuid references public.tournament_bracket_matches (id) on delete set null,
	winner_to_pos text check (winner_to_pos in ('a', 'b')),
	loser_to_match_id uuid references public.tournament_bracket_matches (id) on delete set null,
	loser_to_pos text check (loser_to_pos in ('a', 'b')),
	created_at timestamptz not null default now()
);

create unique index if not exists tournament_bracket_matches_slot_key
	on public.tournament_bracket_matches (tournament_id, bracket, round, slot);
create index if not exists tournament_bracket_matches_tournament_idx
	on public.tournament_bracket_matches (tournament_id);

create table if not exists public.tournament_match_games (
	id uuid primary key default gen_random_uuid(),
	-- Denormalized for realtime filters (match_games has no other route to a
	-- tournament-scoped subscription).
	tournament_id uuid not null references public.tournaments (id) on delete cascade,
	bracket_match_id uuid not null references public.tournament_bracket_matches (id) on delete cascade,
	game_number integer not null check (game_number >= 1),
	score_a integer check (score_a is null or score_a >= 0),
	score_b integer check (score_b is null or score_b >= 0),
	winner_id uuid references public.tournament_entries (id) on delete restrict,
	created_at timestamptz not null default now(),
	unique (bracket_match_id, game_number)
);

create index if not exists tournament_match_games_tournament_idx
	on public.tournament_match_games (tournament_id);

create table if not exists public.tournament_match_events (
	id bigint generated always as identity primary key,
	tournament_id uuid not null references public.tournaments (id) on delete cascade,
	-- Which table match_id points into ('bracket' | 'qual'); null for
	-- tournament-level events (e.g. a seeding random draw).
	match_kind text check (match_kind in ('bracket', 'qual')),
	match_id uuid,
	-- 'seeded' extends the spec list: it logs seed shuffles / reorders and the
	-- random draws tie-breaking can require ("a logged random draw").
	event_type text not null check (
		event_type in ('created', 'checked_in', 'started', 'completed', 'corrected', 'seeded')
	),
	actor_id uuid references auth.users (id) on delete set null,
	occurred_at timestamptz not null default now(),
	metadata jsonb not null default '{}'::jsonb
);

create index if not exists tournament_match_events_tournament_idx
	on public.tournament_match_events (tournament_id, occurred_at);

-- ---------------------------------------------------------------------------
-- 2. Privileges + RLS: public read, zero client writes.
-- ---------------------------------------------------------------------------

do $$
declare
	v_table text;
begin
	foreach v_table in array array[
		'tournaments', 'tournament_hosts', 'tournament_entries', 'tournament_invites',
		'tournament_qual_pools', 'tournament_qual_matches', 'tournament_bracket_matches',
		'tournament_match_games', 'tournament_match_events'
	] loop
		execute format('revoke all on public.%I from anon, authenticated', v_table);
		execute format('grant select on public.%I to anon, authenticated', v_table);
		execute format('alter table public.%I enable row level security', v_table);
		execute format('drop policy if exists "public read" on public.%I', v_table);
		execute format(
			'create policy "public read" on public.%I for select to anon, authenticated using (true)',
			v_table
		);
	end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Entry thumbnails: public 'tournament-thumbs' bucket, own-folder writes
-- (the avatars pattern from 0020). Thumbnails render on the public bracket,
-- so public read is intentional.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('tournament-thumbs', 'tournament-thumbs', true)
on conflict (id) do update set public = true;

drop policy if exists "tournament thumbs public read" on storage.objects;
create policy "tournament thumbs public read"
	on storage.objects
	for select
	to public
	using (bucket_id = 'tournament-thumbs');

drop policy if exists "tournament thumbs insert own folder" on storage.objects;
create policy "tournament thumbs insert own folder"
	on storage.objects
	for insert
	to authenticated
	with check (
		bucket_id = 'tournament-thumbs'
		and (storage.foldername(name))[1] = (select auth.uid())::text
	);

drop policy if exists "tournament thumbs update own folder" on storage.objects;
create policy "tournament thumbs update own folder"
	on storage.objects
	for update
	to authenticated
	using (
		bucket_id = 'tournament-thumbs'
		and (storage.foldername(name))[1] = (select auth.uid())::text
	)
	with check (
		bucket_id = 'tournament-thumbs'
		and (storage.foldername(name))[1] = (select auth.uid())::text
	);

drop policy if exists "tournament thumbs delete own folder" on storage.objects;
create policy "tournament thumbs delete own folder"
	on storage.objects
	for delete
	to authenticated
	using (
		bucket_id = 'tournament-thumbs'
		and (storage.foldername(name))[1] = (select auth.uid())::text
	);

-- ---------------------------------------------------------------------------
-- 4. Internal helpers. No grants at all: SECURITY DEFINER RPCs run as the
-- function owner, so only they can call these.
-- ---------------------------------------------------------------------------

create or replace function public._tournament_log(
	p_tournament_id uuid,
	p_match_kind text,
	p_match_id uuid,
	p_event_type text,
	p_actor_id uuid,
	p_metadata jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
	insert into public.tournament_match_events
		(tournament_id, match_kind, match_id, event_type, actor_id, metadata)
	values
		(p_tournament_id, p_match_kind, p_match_id, p_event_type, p_actor_id,
			coalesce(p_metadata, '{}'::jsonb));
$$;

revoke all on function public._tournament_log(uuid, text, uuid, text, uuid, jsonb) from public;

-- Validates + normalizes a tournament config into its canonical shape.
create or replace function public._tournament_normalize_config(p_config jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_in jsonb := coalesce(p_config, '{}'::jsonb);
	v_quals boolean;
	v_score boolean;
	v_default integer;
	v_best_of jsonb;
	v_key text;
	v_val integer;
begin
	if jsonb_typeof(v_in) <> 'object' then
		raise exception 'Config must be a JSON object.';
	end if;
	v_quals := coalesce((v_in ->> 'quals_enabled')::boolean, false);
	v_score := coalesce((v_in ->> 'score_entry')::boolean, false);
	v_default := coalesce((v_in ->> 'best_of_default')::integer, 1);
	if v_default < 1 or v_default > 15 or v_default % 2 = 0 then
		raise exception 'best_of_default must be an odd number from 1 to 15.';
	end if;
	v_best_of := coalesce(v_in -> 'best_of', '{}'::jsonb);
	if jsonb_typeof(v_best_of) <> 'object' then
		raise exception 'best_of must be a JSON object of round overrides.';
	end if;
	for v_key in select jsonb_object_keys(v_best_of) loop
		if v_key !~ '^(winners|losers|grand_final)(:[0-9]{1,2})?$' then
			raise exception
				'Unknown best_of key "%": use winners, losers, grand_final, winners:<round> or losers:<round>.',
				v_key;
		end if;
		begin
			v_val := (v_best_of ->> v_key)::integer;
		exception when others then
			raise exception 'best_of.% must be a number.', v_key;
		end;
		if v_val < 1 or v_val > 15 or v_val % 2 = 0 then
			raise exception 'best_of.% must be an odd number from 1 to 15.', v_key;
		end if;
	end loop;
	return jsonb_build_object(
		'quals_enabled', v_quals,
		'score_entry', v_score,
		'best_of_default', v_default,
		'best_of', v_best_of
	);
end;
$$;

revoke all on function public._tournament_normalize_config(jsonb) from public;

-- Best-of for a bracket position: exact-round override > bracket override >
-- default. The reset inherits the grand final's setting.
create or replace function public._tournament_best_of(p_config jsonb, p_bracket text, p_round integer)
returns integer
language sql
security definer
set search_path = ''
as $$
	select coalesce(
		(p_config -> 'best_of' ->>
			(case when p_bracket = 'grand_final_reset' then 'grand_final' else p_bracket end
				|| ':' || p_round))::integer,
		(p_config -> 'best_of' ->>
			(case when p_bracket = 'grand_final_reset' then 'grand_final' else p_bracket end))::integer,
		(p_config ->> 'best_of_default')::integer,
		1
	);
$$;

revoke all on function public._tournament_best_of(jsonb, text, integer) from public;

-- Loads + row-locks the tournament and requires the caller to be one of its
-- hosts. The lock serializes every host mutation on a tournament.
create or replace function public._tournament_require_host(p_tournament_id uuid)
returns public.tournaments
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_t public.tournaments;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	select * into v_t from public.tournaments where id = p_tournament_id for update;
	if not found then
		raise exception 'Tournament not found.';
	end if;
	if not exists (
		select 1 from public.tournament_hosts
		where tournament_id = p_tournament_id and user_id = v_uid
	) then
		raise exception 'Only a tournament host can do that.';
	end if;
	return v_t;
end;
$$;

revoke all on function public._tournament_require_host(uuid) from public;

-- Renumber seeds 1..N, preserving the current order (unseeded entries sort
-- last, by registration time).
create or replace function public._tournament_compact_seeds(p_tournament_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
	with ordered as (
		select id, row_number() over (order by seed asc nulls last, created_at asc, id asc) as rn
		from public.tournament_entries
		where tournament_id = p_tournament_id
	)
	update public.tournament_entries e
	set seed = o.rn
	from ordered o
	where e.id = o.id and e.seed is distinct from o.rn;
$$;

revoke all on function public._tournament_compact_seeds(uuid) from public;

create or replace function public._tournament_set_slot(p_match_id uuid, p_pos text, p_entry_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
	update public.tournament_bracket_matches
	set entry_a_id = case when p_pos = 'a' then p_entry_id else entry_a_id end,
		entry_b_id = case when p_pos = 'b' then p_entry_id else entry_b_id end
	where id = p_match_id;
$$;

revoke all on function public._tournament_set_slot(uuid, text, uuid) from public;

-- Records a match outcome and advances it: winner along winner_to, loser
-- along loser_to (or out of the tournament). Owns the grand-final rules:
-- the losers-bracket finalist (entry_b) winning the first grand final
-- creates the grand_final_reset; the winners-bracket finalist (entry_a)
-- winning it, or anyone winning the reset, completes the tournament.
-- p_winner may be null (a dead match: both feeders were byes) -- nothing
-- advances. p_event_type is 'completed' or 'corrected'.
create or replace function public._tournament_complete_match(
	p_match_id uuid,
	p_winner_id uuid,
	p_event_type text,
	p_actor_id uuid,
	p_metadata jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_m public.tournament_bracket_matches;
	v_loser uuid;
	v_reset_id uuid;
begin
	select * into v_m from public.tournament_bracket_matches where id = p_match_id for update;
	if not found then
		raise exception 'Match not found.';
	end if;

	v_loser := case
		when p_winner_id is null then null
		when p_winner_id = v_m.entry_a_id then v_m.entry_b_id
		else v_m.entry_a_id
	end;

	update public.tournament_bracket_matches
	set status = 'complete', winner_id = p_winner_id, completed_at = now()
	where id = p_match_id;

	if p_winner_id is not null and v_m.winner_to_match_id is not null then
		perform public._tournament_set_slot(v_m.winner_to_match_id, v_m.winner_to_pos, p_winner_id);
	end if;
	if v_loser is not null and v_m.loser_to_match_id is not null then
		perform public._tournament_set_slot(v_m.loser_to_match_id, v_m.loser_to_pos, v_loser);
	end if;

	if v_m.bracket = 'grand_final' and p_winner_id is not null then
		if p_winner_id = v_m.entry_b_id then
			-- The losers-bracket finalist took game one of the final: bracket reset.
			if not exists (
				select 1 from public.tournament_bracket_matches
				where tournament_id = v_m.tournament_id and bracket = 'grand_final_reset'
			) then
				insert into public.tournament_bracket_matches
					(tournament_id, bracket, round, slot, entry_a_id, entry_b_id, best_of)
				values
					(v_m.tournament_id, 'grand_final_reset', 1, 1,
						v_m.entry_a_id, v_m.entry_b_id, v_m.best_of)
				returning id into v_reset_id;
				perform public._tournament_log(v_m.tournament_id, 'bracket', v_reset_id, 'created',
					p_actor_id, jsonb_build_object('bracket', 'grand_final_reset', 'round', 1, 'slot', 1));
			end if;
		else
			update public.tournaments
			set status = 'complete', champion_entry_id = p_winner_id
			where id = v_m.tournament_id;
		end if;
	elsif v_m.bracket = 'grand_final_reset' and p_winner_id is not null then
		update public.tournaments
		set status = 'complete', champion_entry_id = p_winner_id
		where id = v_m.tournament_id;
	end if;

	perform public._tournament_log(v_m.tournament_id, 'bracket', p_match_id, p_event_type,
		p_actor_id,
		coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('winner_id', p_winner_id));
end;
$$;

revoke all on function public._tournament_complete_match(uuid, uuid, text, uuid, jsonb) from public;

-- Settles byes. A slot is DEAD when it holds no entry and every match that
-- feeds it (via winner_to/loser_to) is already complete -- a completed
-- feeder that were going to deliver here would have delivered already, so a
-- still-empty slot can never fill. One live side + one dead side completes
-- as a bye; two dead sides complete with a null winner. Loops until stable
-- so cascades settle in one call.
create or replace function public._tournament_resolve_byes(p_tournament_id uuid, p_actor_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_changed boolean;
	v_row record;
	v_m public.tournament_bracket_matches;
	v_a_dead boolean;
	v_b_dead boolean;
begin
	loop
		v_changed := false;
		for v_row in
			select id from public.tournament_bracket_matches
			where tournament_id = p_tournament_id and status = 'pending'
			order by bracket, round, slot
		loop
			-- Re-read fresh: completions earlier in this same pass may have
			-- advanced entries into (or completed) this match, and the FOR
			-- cursor's snapshot would not show that. Judging a slot dead off
			-- the stale row wrongly dead-completes a match that just received
			-- its participants (two adjacent round-1 byes feeding one parent).
			select * into v_m from public.tournament_bracket_matches where id = v_row.id;
			if v_m.status <> 'pending' then
				continue;
			end if;
			v_a_dead := v_m.entry_a_id is null and not exists (
				select 1 from public.tournament_bracket_matches f
				where f.tournament_id = p_tournament_id
					and f.status <> 'complete'
					and ((f.winner_to_match_id = v_m.id and f.winner_to_pos = 'a')
						or (f.loser_to_match_id = v_m.id and f.loser_to_pos = 'a'))
			);
			v_b_dead := v_m.entry_b_id is null and not exists (
				select 1 from public.tournament_bracket_matches f
				where f.tournament_id = p_tournament_id
					and f.status <> 'complete'
					and ((f.winner_to_match_id = v_m.id and f.winner_to_pos = 'b')
						or (f.loser_to_match_id = v_m.id and f.loser_to_pos = 'b'))
			);

			if v_m.entry_a_id is not null and v_b_dead then
				perform public._tournament_complete_match(v_m.id, v_m.entry_a_id, 'completed',
					p_actor_id, jsonb_build_object('bye', true));
				v_changed := true;
			elsif v_m.entry_b_id is not null and v_a_dead then
				perform public._tournament_complete_match(v_m.id, v_m.entry_b_id, 'completed',
					p_actor_id, jsonb_build_object('bye', true));
				v_changed := true;
			elsif v_a_dead and v_b_dead then
				perform public._tournament_complete_match(v_m.id, null, 'completed',
					p_actor_id, jsonb_build_object('dead', true));
				v_changed := true;
			end if;
		end loop;
		exit when not v_changed;
	end loop;
end;
$$;

revoke all on function public._tournament_resolve_byes(uuid, uuid) from public;

-- Validates a result payload against the match's best-of and the
-- tournament's scoring mode, replaces the match_games rows, and returns the
-- winning entry id. Shapes:
--   score mode:    {"games": [{"score_a": 10, "score_b": 5}, ...]}
--   win/loss mode: {"games": [{"winner": "a"}, ...]}   (scores optional)
--   best-of-1 shorthand: {"winner": "a"} / {"winner": "a", "score_a": .., "score_b": ..}
-- The series must end exactly when one side reaches ceil(best_of / 2) wins.
create or replace function public._tournament_write_games(
	p_match public.tournament_bracket_matches,
	p_result jsonb,
	p_score_entry boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_games jsonb;
	v_need integer := p_match.best_of / 2 + 1;
	v_wins_a integer := 0;
	v_wins_b integer := 0;
	v_count integer;
	v_i integer;
	v_g jsonb;
	v_sa integer;
	v_sb integer;
	v_side text;
begin
	if p_result is null then
		raise exception 'Missing result.';
	end if;
	v_games := p_result -> 'games';
	if v_games is null and p_match.best_of = 1 and (p_result ? 'winner') then
		v_games := jsonb_build_array(jsonb_build_object(
			'winner', p_result ->> 'winner',
			'score_a', p_result -> 'score_a',
			'score_b', p_result -> 'score_b'
		));
	end if;
	if v_games is null or jsonb_typeof(v_games) <> 'array' then
		raise exception 'Result must carry a games array.';
	end if;
	v_count := jsonb_array_length(v_games);
	if v_count < 1 then
		raise exception 'Result must carry at least one game.';
	end if;
	if v_count > p_match.best_of then
		raise exception 'Too many games: % entered for a best-of-%.', v_count, p_match.best_of;
	end if;

	delete from public.tournament_match_games where bracket_match_id = p_match.id;

	for v_i in 0 .. v_count - 1 loop
		v_g := v_games -> v_i;
		if v_wins_a = v_need or v_wins_b = v_need then
			raise exception 'Game % comes after the series was already decided.', v_i + 1;
		end if;
		v_sa := null;
		v_sb := null;
		if p_score_entry then
			begin
				v_sa := (v_g ->> 'score_a')::integer;
				v_sb := (v_g ->> 'score_b')::integer;
			exception when others then
				raise exception 'Game %: score_a and score_b must be numbers.', v_i + 1;
			end;
			if v_sa is null or v_sb is null then
				raise exception 'Game %: this tournament records scores; enter score_a and score_b.', v_i + 1;
			end if;
			if v_sa < 0 or v_sb < 0 then
				raise exception 'Game %: scores cannot be negative.', v_i + 1;
			end if;
			if v_sa = v_sb then
				raise exception 'Game %: scores cannot tie; every game needs a winner.', v_i + 1;
			end if;
			v_side := case when v_sa > v_sb then 'a' else 'b' end;
		else
			v_side := v_g ->> 'winner';
			if v_side is null or v_side not in ('a', 'b') then
				raise exception 'Game %: winner must be "a" or "b".', v_i + 1;
			end if;
			begin
				v_sa := (v_g ->> 'score_a')::integer;
				v_sb := (v_g ->> 'score_b')::integer;
			exception when others then
				v_sa := null;
				v_sb := null;
			end;
		end if;
		insert into public.tournament_match_games
			(tournament_id, bracket_match_id, game_number, score_a, score_b, winner_id)
		values
			(p_match.tournament_id, p_match.id, v_i + 1, v_sa, v_sb,
				case when v_side = 'a' then p_match.entry_a_id else p_match.entry_b_id end);
		if v_side = 'a' then
			v_wins_a := v_wins_a + 1;
		else
			v_wins_b := v_wins_b + 1;
		end if;
	end loop;

	if v_wins_a <> v_need and v_wins_b <> v_need then
		raise exception
			'Incomplete result: a best-of-% ends when one side reaches % wins (entered %-%).',
			p_match.best_of, v_need, v_wins_a, v_wins_b;
	end if;

	return case when v_wins_a = v_need then p_match.entry_a_id else p_match.entry_b_id end;
end;
$$;

revoke all on function public._tournament_write_games(public.tournament_bracket_matches, jsonb, boolean) from public;

-- Qualifying standings -> global seed order (best first). Pool positions:
-- wins, then head-to-head for a two-way tie, then point differential, then
-- a LOGGED random draw. Global order across pools: pool position, then win
-- percentage, then point differential, then a logged random draw
-- (head-to-head cannot apply across pools: two entries sharing a finish
-- position are never pool-mates).
create or replace function public._tournament_qual_seed_order(p_tournament_id uuid, p_actor_id uuid)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_pool record;
	v_remaining uuid[];
	v_cands uuid[];
	v_narrowed uuid[];
	v_pick uuid;
	v_pos integer;
	v_group record;
begin
	drop table if exists _t_standings;
	create temp table _t_standings (
		entry_id uuid primary key,
		pool_id uuid,
		pool_number integer,
		wins integer default 0,
		games integer default 0,
		pf integer default 0,
		pa integer default 0,
		win_pct numeric default 0,
		diff integer default 0,
		pool_position integer,
		rand_key double precision
	) on commit drop;

	insert into pg_temp._t_standings (entry_id, pool_id, pool_number)
	select distinct v.e, m.pool_id, p.pool_number
	from public.tournament_qual_matches m
	join public.tournament_qual_pools p on p.id = m.pool_id
	cross join lateral (values (m.entry_a_id), (m.entry_b_id)) v(e)
	where m.tournament_id = p_tournament_id;

	update pg_temp._t_standings s set
		wins = (
			select count(*) from public.tournament_qual_matches m
			where m.tournament_id = p_tournament_id and m.winner_id = s.entry_id
		),
		games = (
			select count(*) from public.tournament_qual_matches m
			where m.tournament_id = p_tournament_id
				and (m.entry_a_id = s.entry_id or m.entry_b_id = s.entry_id)
		),
		pf = coalesce((
			select sum(case when m.entry_a_id = s.entry_id then m.score_a else m.score_b end)
			from public.tournament_qual_matches m
			where m.tournament_id = p_tournament_id
				and (m.entry_a_id = s.entry_id or m.entry_b_id = s.entry_id)
				and m.score_a is not null and m.score_b is not null
		), 0),
		pa = coalesce((
			select sum(case when m.entry_a_id = s.entry_id then m.score_b else m.score_a end)
			from public.tournament_qual_matches m
			where m.tournament_id = p_tournament_id
				and (m.entry_a_id = s.entry_id or m.entry_b_id = s.entry_id)
				and m.score_a is not null and m.score_b is not null
		), 0);

	update pg_temp._t_standings set
		win_pct = case when games > 0 then wins::numeric / games else 0 end,
		diff = pf - pa,
		rand_key = random();

	-- Rank within each pool.
	for v_pool in select distinct pool_id, pool_number from pg_temp._t_standings loop
		v_remaining := array(
			select entry_id from pg_temp._t_standings where pool_id = v_pool.pool_id
		);
		v_pos := 1;
		while coalesce(array_length(v_remaining, 1), 0) > 0 loop
			v_cands := array(
				select entry_id from pg_temp._t_standings
				where entry_id = any (v_remaining)
					and wins = (
						select max(wins) from pg_temp._t_standings where entry_id = any (v_remaining)
					)
			);
			if array_length(v_cands, 1) = 2 then
				-- Two-way tie: head-to-head (round robin means they played once).
				select m.winner_id into v_pick
				from public.tournament_qual_matches m
				where m.pool_id = v_pool.pool_id and m.winner_id is not null
					and ((m.entry_a_id = v_cands[1] and m.entry_b_id = v_cands[2])
						or (m.entry_a_id = v_cands[2] and m.entry_b_id = v_cands[1]))
				limit 1;
				if v_pick is not null then
					v_cands := array[v_pick];
				end if;
			end if;
			if array_length(v_cands, 1) > 1 then
				v_narrowed := array(
					select entry_id from pg_temp._t_standings
					where entry_id = any (v_cands)
						and diff = (
							select max(diff) from pg_temp._t_standings where entry_id = any (v_cands)
						)
				);
				v_cands := v_narrowed;
			end if;
			if array_length(v_cands, 1) > 1 then
				select entry_id into v_pick from pg_temp._t_standings
				where entry_id = any (v_cands)
				order by rand_key limit 1;
				perform public._tournament_log(p_tournament_id, null, null, 'seeded', p_actor_id,
					jsonb_build_object(
						'action', 'random_draw',
						'scope', 'pool_position',
						'pool_number', v_pool.pool_number,
						'position', v_pos,
						'candidates', to_jsonb(v_cands),
						'picked', v_pick
					));
			else
				v_pick := v_cands[1];
			end if;
			update pg_temp._t_standings set pool_position = v_pos where entry_id = v_pick;
			v_remaining := array_remove(v_remaining, v_pick);
			v_pos := v_pos + 1;
		end loop;
	end loop;

	-- Log any global-order group the random key had to break.
	for v_group in
		select pool_position, win_pct, diff, array_agg(entry_id order by rand_key) as ids
		from pg_temp._t_standings
		group by pool_position, win_pct, diff
		having count(*) > 1
	loop
		perform public._tournament_log(p_tournament_id, null, null, 'seeded', p_actor_id,
			jsonb_build_object(
				'action', 'random_draw',
				'scope', 'global_seed',
				'pool_position', v_group.pool_position,
				'drawn_order', to_jsonb(v_group.ids)
			));
	end loop;

	return array(
		select entry_id from pg_temp._t_standings
		order by pool_position asc, win_pct desc, diff desc, rand_key asc
	);
end;
$$;

revoke all on function public._tournament_qual_seed_order(uuid, uuid) from public;

-- ---------------------------------------------------------------------------
-- 5. Tournament + host management RPCs
-- ---------------------------------------------------------------------------

-- Any signed-in user can create a tournament and becomes its first host.
create or replace function public.tournament_create(
	p_name text,
	p_description text default '',
	p_config jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_id uuid;
begin
	if v_uid is null then
		raise exception 'You must be signed in to create a tournament.';
	end if;
	if p_name is null or btrim(p_name) = '' then
		raise exception 'Give the tournament a name.';
	end if;
	if char_length(btrim(p_name)) > 80 then
		raise exception 'Tournament name is limited to 80 characters.';
	end if;
	insert into public.tournaments (name, description, config, created_by)
	values (btrim(p_name), coalesce(p_description, ''),
		public._tournament_normalize_config(p_config), v_uid)
	returning id into v_id;
	insert into public.tournament_hosts (tournament_id, user_id, role, added_by)
	values (v_id, v_uid, 'creator', v_uid);
	perform public._tournament_log(v_id, null, null, 'created', v_uid,
		jsonb_build_object('what', 'tournament'));
	return v_id;
end;
$$;

create or replace function public.tournament_update(
	p_tournament_id uuid,
	p_name text default null,
	p_description text default null,
	p_config jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_t public.tournaments;
begin
	v_t := public._tournament_require_host(p_tournament_id);
	if p_name is not null then
		if btrim(p_name) = '' or char_length(btrim(p_name)) > 80 then
			raise exception 'Tournament name must be 1 to 80 characters.';
		end if;
	end if;
	-- Format rules are locked once the bracket exists: matches were stamped
	-- from them.
	if p_config is not null and v_t.status in ('live', 'complete') then
		raise exception 'Format settings are locked once the bracket is generated.';
	end if;
	update public.tournaments
	set name = coalesce(btrim(p_name), name),
		description = coalesce(p_description, description),
		config = case when p_config is null then config
			else public._tournament_normalize_config(p_config) end
	where id = p_tournament_id;
end;
$$;

-- Host-controlled status moves. Going live is exclusively via
-- tournament_generate_bracket; completion happens when the final is decided.
create or replace function public.tournament_set_status(p_tournament_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_t public.tournaments;
begin
	v_t := public._tournament_require_host(p_tournament_id);
	if not (
		(v_t.status = 'draft' and p_status = 'registration_open')
		or (v_t.status = 'registration_open' and p_status = 'seeding')
		or (v_t.status = 'seeding' and p_status = 'registration_open')
	) then
		raise exception
			'Cannot move a % tournament to %. Allowed: draft -> registration_open, registration_open <-> seeding; the bracket generator moves it to live.',
			v_t.status, p_status;
	end if;
	update public.tournaments set status = p_status where id = p_tournament_id;
end;
$$;

-- Adds another host (by user id, or by account email resolved server-side).
create or replace function public.tournament_add_host(
	p_tournament_id uuid,
	p_user_id uuid default null,
	p_email text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_t public.tournaments;
	v_target uuid := p_user_id;
begin
	v_t := public._tournament_require_host(p_tournament_id);
	if v_target is null and p_email is not null then
		select id into v_target from public.profiles where lower(email) = lower(btrim(p_email));
	end if;
	if v_target is null then
		raise exception 'No account found for that user.';
	end if;
	if not exists (select 1 from public.profiles where id = v_target) then
		raise exception 'No account found for that user.';
	end if;
	insert into public.tournament_hosts (tournament_id, user_id, role, added_by)
	values (p_tournament_id, v_target, 'host', v_uid)
	on conflict (tournament_id, user_id) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Entry + invite RPCs
-- ---------------------------------------------------------------------------

-- Self-registration: signed-in, registration must be open, one entry per
-- account. The display name is the participant's PUBLIC identity (the
-- account's Google name is never surfaced).
create or replace function public.tournament_register_entry(
	p_tournament_id uuid,
	p_display_name text,
	p_description text default '',
	p_thumbnail_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_t public.tournaments;
	v_id uuid;
begin
	if v_uid is null then
		raise exception 'You must be signed in to register.';
	end if;
	select * into v_t from public.tournaments where id = p_tournament_id for update;
	if not found then
		raise exception 'Tournament not found.';
	end if;
	if v_t.status <> 'registration_open' then
		raise exception 'Registration is not open for this tournament.';
	end if;
	if p_display_name is null or btrim(p_display_name) = ''
		or char_length(btrim(p_display_name)) > 40 then
		raise exception 'Display name must be 1 to 40 characters.';
	end if;
	if exists (
		select 1 from public.tournament_entries
		where tournament_id = p_tournament_id and user_id = v_uid
	) then
		raise exception 'You are already registered for this tournament.';
	end if;
	insert into public.tournament_entries
		(tournament_id, user_id, display_name, description, thumbnail_url, seed, created_by)
	values
		(p_tournament_id, v_uid, btrim(p_display_name), coalesce(p_description, ''),
			nullif(btrim(coalesce(p_thumbnail_url, '')), ''),
			(select coalesce(max(seed), 0) + 1 from public.tournament_entries
				where tournament_id = p_tournament_id),
			v_uid)
	returning id into v_id;
	return v_id;
end;
$$;

-- Host-manual entry: linked (p_linked_user_id) or an unlinked walk-up.
-- Allowed while registration is open and during seeding (the host is the
-- supervisor); tournament_generate_bracket re-validates the field.
create or replace function public.tournament_host_add_entry(
	p_tournament_id uuid,
	p_display_name text,
	p_description text default '',
	p_thumbnail_url text default null,
	p_linked_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_t public.tournaments;
	v_id uuid;
begin
	v_t := public._tournament_require_host(p_tournament_id);
	if v_t.status not in ('registration_open', 'seeding') then
		raise exception 'Entries can only be added while registration is open or during seeding.';
	end if;
	if p_display_name is null or btrim(p_display_name) = ''
		or char_length(btrim(p_display_name)) > 40 then
		raise exception 'Display name must be 1 to 40 characters.';
	end if;
	if p_linked_user_id is not null then
		if not exists (select 1 from public.profiles where id = p_linked_user_id) then
			raise exception 'No account found for the linked user.';
		end if;
		if exists (
			select 1 from public.tournament_entries
			where tournament_id = p_tournament_id and user_id = p_linked_user_id
		) then
			raise exception 'That user is already registered for this tournament.';
		end if;
	end if;
	insert into public.tournament_entries
		(tournament_id, user_id, display_name, description, thumbnail_url, seed, created_by)
	values
		(p_tournament_id, p_linked_user_id, btrim(p_display_name), coalesce(p_description, ''),
			nullif(btrim(coalesce(p_thumbnail_url, '')), ''),
			(select coalesce(max(seed), 0) + 1 from public.tournament_entries
				where tournament_id = p_tournament_id),
			v_uid)
	returning id into v_id;
	return v_id;
end;
$$;

-- Host removal of an entry, pre-bracket only. If pools exist but hold no
-- results yet they are cleared (regenerate after); recorded qualifying
-- results block removal.
create or replace function public.tournament_remove_entry(p_entry_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_e public.tournament_entries;
	v_t public.tournaments;
	v_pools_cleared boolean := false;
begin
	select * into v_e from public.tournament_entries where id = p_entry_id;
	if not found then
		raise exception 'Entry not found.';
	end if;
	v_t := public._tournament_require_host(v_e.tournament_id);
	if v_t.status in ('live', 'complete') then
		raise exception 'Entries cannot be removed once the bracket is generated.';
	end if;
	if exists (
		select 1 from public.tournament_qual_matches
		where tournament_id = v_e.tournament_id and winner_id is not null
	) then
		raise exception 'Qualifying results are already recorded; entries can no longer be removed.';
	end if;
	if exists (
		select 1 from public.tournament_qual_matches where tournament_id = v_e.tournament_id
	) then
		delete from public.tournament_qual_matches where tournament_id = v_e.tournament_id;
		delete from public.tournament_qual_pools where tournament_id = v_e.tournament_id;
		v_pools_cleared := true;
	end if;
	delete from public.tournament_entries where id = p_entry_id;
	perform public._tournament_compact_seeds(v_e.tournament_id);
	return jsonb_build_object('pools_cleared', v_pools_cleared);
end;
$$;

-- Host sends an invite (by user id, or by account email resolved
-- server-side so hosts never need raw uuids). Re-inviting after a decline
-- resets the invite to pending.
create or replace function public.tournament_send_invite(
	p_tournament_id uuid,
	p_invited_user_id uuid default null,
	p_email text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_t public.tournaments;
	v_target uuid := p_invited_user_id;
	v_existing public.tournament_invites;
	v_id uuid;
begin
	v_t := public._tournament_require_host(p_tournament_id);
	if v_t.status in ('live', 'complete') then
		raise exception 'Invites can only be sent before the bracket is generated.';
	end if;
	if v_target is null and p_email is not null then
		select id into v_target from public.profiles where lower(email) = lower(btrim(p_email));
	end if;
	if v_target is null or not exists (select 1 from public.profiles where id = v_target) then
		raise exception 'No account found for that user.';
	end if;
	if exists (
		select 1 from public.tournament_entries
		where tournament_id = p_tournament_id and user_id = v_target
	) then
		raise exception 'That user is already registered for this tournament.';
	end if;
	select * into v_existing from public.tournament_invites
	where tournament_id = p_tournament_id and invited_user_id = v_target;
	if found then
		if v_existing.status = 'declined' then
			update public.tournament_invites
			set status = 'pending', invited_by = v_uid, created_at = now(), responded_at = null
			where id = v_existing.id;
			return v_existing.id;
		end if;
		raise exception 'That user already has a % invite.', v_existing.status;
	end if;
	insert into public.tournament_invites (tournament_id, invited_user_id, invited_by)
	values (p_tournament_id, v_target, v_uid)
	returning id into v_id;
	return v_id;
end;
$$;

-- Only the invited user can respond. Accepting requires a display name and
-- creates the entry (works during registration_open or seeding: the host
-- explicitly asked this player in).
create or replace function public.tournament_respond_invite(
	p_invite_id uuid,
	p_accept boolean,
	p_display_name text default null,
	p_description text default '',
	p_thumbnail_url text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_inv public.tournament_invites;
	v_t public.tournaments;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	select * into v_inv from public.tournament_invites where id = p_invite_id for update;
	if not found then
		raise exception 'Invite not found.';
	end if;
	if v_inv.invited_user_id <> v_uid then
		raise exception 'This invite is not yours.';
	end if;
	if v_inv.status <> 'pending' then
		raise exception 'This invite was already %.', v_inv.status;
	end if;

	if not coalesce(p_accept, false) then
		update public.tournament_invites
		set status = 'declined', responded_at = now()
		where id = p_invite_id;
		return;
	end if;

	select * into v_t from public.tournaments where id = v_inv.tournament_id for update;
	if v_t.status not in ('registration_open', 'seeding') then
		raise exception 'This tournament is no longer accepting entries.';
	end if;
	if not exists (
		select 1 from public.tournament_entries
		where tournament_id = v_inv.tournament_id and user_id = v_uid
	) then
		if p_display_name is null or btrim(p_display_name) = ''
			or char_length(btrim(p_display_name)) > 40 then
			raise exception 'Pick a display name (1 to 40 characters) to accept.';
		end if;
		insert into public.tournament_entries
			(tournament_id, user_id, display_name, description, thumbnail_url, seed, created_by)
		values
			(v_inv.tournament_id, v_uid, btrim(p_display_name), coalesce(p_description, ''),
				nullif(btrim(coalesce(p_thumbnail_url, '')), ''),
				(select coalesce(max(seed), 0) + 1 from public.tournament_entries
					where tournament_id = v_inv.tournament_id),
				v_uid);
	end if;
	update public.tournament_invites
	set status = 'accepted', responded_at = now()
	where id = p_invite_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Seeding RPCs
-- ---------------------------------------------------------------------------

create or replace function public.tournament_shuffle_seeds(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_t public.tournaments;
	v_order uuid[];
begin
	v_t := public._tournament_require_host(p_tournament_id);
	if v_t.status in ('live', 'complete') then
		raise exception 'Seeds are locked once the bracket is generated.';
	end if;
	with shuffled as (
		select id, row_number() over (order by random()) as rn
		from public.tournament_entries
		where tournament_id = p_tournament_id
	)
	update public.tournament_entries e
	set seed = s.rn
	from shuffled s
	where e.id = s.id;
	v_order := array(
		select id from public.tournament_entries
		where tournament_id = p_tournament_id order by seed
	);
	perform public._tournament_log(p_tournament_id, null, null, 'seeded', v_uid,
		jsonb_build_object('action', 'shuffle', 'order', to_jsonb(v_order)));
end;
$$;

create or replace function public.tournament_reorder_seed(
	p_tournament_id uuid,
	p_entry_id uuid,
	p_new_position integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_t public.tournaments;
	v_count integer;
	v_cur integer;
	v_new integer;
begin
	v_t := public._tournament_require_host(p_tournament_id);
	if v_t.status in ('live', 'complete') then
		raise exception 'Seeds are locked once the bracket is generated.';
	end if;
	perform public._tournament_compact_seeds(p_tournament_id);
	select count(*) into v_count from public.tournament_entries
	where tournament_id = p_tournament_id;
	select seed into v_cur from public.tournament_entries
	where id = p_entry_id and tournament_id = p_tournament_id;
	if v_cur is null then
		raise exception 'Entry not found in this tournament.';
	end if;
	v_new := least(greatest(coalesce(p_new_position, 1), 1), v_count);
	if v_new = v_cur then
		return;
	end if;
	if v_new < v_cur then
		update public.tournament_entries
		set seed = seed + 1
		where tournament_id = p_tournament_id and seed >= v_new and seed < v_cur;
	else
		update public.tournament_entries
		set seed = seed - 1
		where tournament_id = p_tournament_id and seed > v_cur and seed <= v_new;
	end if;
	update public.tournament_entries set seed = v_new where id = p_entry_id;
	perform public._tournament_log(p_tournament_id, null, null, 'seeded', v_uid,
		jsonb_build_object('action', 'reorder', 'entry_id', p_entry_id,
			'from', v_cur, 'to', v_new));
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Qualifying RPCs
-- ---------------------------------------------------------------------------

-- Snake-drafts the seeded field across p_pool_count pools (pool 1 takes
-- seed 1; direction alternates each pass so pool strength balances) and
-- builds each pool's round robin (circle method). Regeneration is allowed
-- until a result is recorded.
create or replace function public.tournament_generate_qual_pools(
	p_tournament_id uuid,
	p_pool_count integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_t public.tournaments;
	v_n integer;
	v_entries uuid[];
	v_pool_ids uuid[] := '{}';
	v_members uuid[][];
	v_pool integer;
	v_i integer;
	v_pass integer;
	v_idx integer;
	v_arr uuid[];
	v_m integer;
	v_round integer;
	v_seq integer;
	v_a uuid;
	v_b uuid;
	v_pools_meta jsonb := '{}'::jsonb;
	v_match_id uuid;
begin
	v_t := public._tournament_require_host(p_tournament_id);
	if v_t.status <> 'seeding' then
		raise exception 'Pools are generated during seeding (close registration first).';
	end if;
	if not coalesce((v_t.config ->> 'quals_enabled')::boolean, false) then
		raise exception 'Qualifying is not enabled for this tournament.';
	end if;
	if coalesce(p_pool_count, 0) < 1 then
		raise exception 'Pool count must be at least 1.';
	end if;
	select count(*) into v_n from public.tournament_entries
	where tournament_id = p_tournament_id;
	if v_n < p_pool_count * 2 then
		raise exception 'Each pool needs at least 2 entries: % pools need at least % entries (have %).',
			p_pool_count, p_pool_count * 2, v_n;
	end if;
	if exists (
		select 1 from public.tournament_qual_matches
		where tournament_id = p_tournament_id and winner_id is not null
	) then
		raise exception 'Qualifying results are already recorded; pools can no longer be regenerated.';
	end if;

	delete from public.tournament_qual_matches where tournament_id = p_tournament_id;
	delete from public.tournament_qual_pools where tournament_id = p_tournament_id;

	perform public._tournament_compact_seeds(p_tournament_id);
	v_entries := array(
		select id from public.tournament_entries
		where tournament_id = p_tournament_id order by seed
	);

	-- Create pools and snake-draft members.
	for v_pool in 1 .. p_pool_count loop
		insert into public.tournament_qual_pools (tournament_id, pool_number)
		values (p_tournament_id, v_pool)
		returning id into v_a;
		v_pool_ids := v_pool_ids || v_a;
	end loop;

	for v_pool in 1 .. p_pool_count loop
		v_arr := '{}';
		for v_i in 1 .. v_n loop
			v_pass := (v_i - 1) / p_pool_count;
			v_idx := (v_i - 1) % p_pool_count;
			if (case when v_pass % 2 = 0 then v_idx + 1 else p_pool_count - v_idx end) = v_pool then
				v_arr := v_arr || v_entries[v_i];
			end if;
		end loop;

		v_pools_meta := v_pools_meta || jsonb_build_object(v_pool::text, to_jsonb(v_arr));

		-- Round robin via the circle method: fix the first, rotate the rest.
		if array_length(v_arr, 1) % 2 = 1 then
			v_arr := v_arr || null::uuid;
		end if;
		v_m := array_length(v_arr, 1);
		v_seq := 0;
		for v_round in 1 .. v_m - 1 loop
			for v_i in 1 .. v_m / 2 loop
				v_a := v_arr[v_i];
				v_b := v_arr[v_m + 1 - v_i];
				if v_a is not null and v_b is not null then
					v_seq := v_seq + 1;
					insert into public.tournament_qual_matches
						(pool_id, tournament_id, sequence, entry_a_id, entry_b_id)
					values (v_pool_ids[v_pool], p_tournament_id, v_seq, v_a, v_b)
					returning id into v_match_id;
					perform public._tournament_log(p_tournament_id, 'qual', v_match_id, 'created',
						v_uid, jsonb_build_object('pool_number', v_pool, 'sequence', v_seq));
				end if;
			end loop;
			-- Rotate: keep position 1, move the last into position 2.
			v_arr := array[v_arr[1], v_arr[v_m]] || v_arr[2 : v_m - 1];
		end loop;
	end loop;

	perform public._tournament_log(p_tournament_id, null, null, 'seeded', v_uid,
		jsonb_build_object('action', 'pools_generated', 'pool_count', p_pool_count,
			'pools', v_pools_meta));
end;
$$;

-- Host records (or overwrites, pre-bracket) a qualifying result. Score mode
-- derives the winner from the scores; win/loss mode takes p_winner_id.
create or replace function public.tournament_submit_qual_result(
	p_qual_match_id uuid,
	p_score_a integer default null,
	p_score_b integer default null,
	p_winner_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_m public.tournament_qual_matches;
	v_t public.tournaments;
	v_winner uuid;
	v_was_set boolean;
begin
	select * into v_m from public.tournament_qual_matches where id = p_qual_match_id for update;
	if not found then
		raise exception 'Qualifying match not found.';
	end if;
	v_t := public._tournament_require_host(v_m.tournament_id);
	if v_t.status <> 'seeding' then
		raise exception 'Qualifying results can only be entered during seeding.';
	end if;
	if coalesce((v_t.config ->> 'score_entry')::boolean, false) then
		if p_score_a is null or p_score_b is null then
			raise exception 'This tournament records scores; enter both scores.';
		end if;
		if p_score_a < 0 or p_score_b < 0 then
			raise exception 'Scores cannot be negative.';
		end if;
		if p_score_a = p_score_b then
			raise exception 'Scores cannot tie; every match needs a winner.';
		end if;
		v_winner := case when p_score_a > p_score_b then v_m.entry_a_id else v_m.entry_b_id end;
	else
		if p_winner_id is null or p_winner_id not in (v_m.entry_a_id, v_m.entry_b_id) then
			raise exception 'Pick the winner (one of the two participants).';
		end if;
		v_winner := p_winner_id;
	end if;
	v_was_set := v_m.winner_id is not null;
	update public.tournament_qual_matches
	set winner_id = v_winner, score_a = p_score_a, score_b = p_score_b, played_at = now()
	where id = p_qual_match_id;
	perform public._tournament_log(v_m.tournament_id, 'qual', p_qual_match_id,
		case when v_was_set then 'corrected' else 'completed' end, v_uid,
		jsonb_build_object('winner_id', v_winner, 'score_a', p_score_a, 'score_b', p_score_b));
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Bracket generation
-- ---------------------------------------------------------------------------

create or replace function public.tournament_generate_bracket(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_t public.tournaments;
	v_n integer;
	v_p integer := 1;
	v_r integer := 0;
	v_tmp integer;
	v_order integer[];
	v_new_order integer[];
	v_size integer;
	v_x integer;
	v_entry_by_seed uuid[];
	v_seed_order uuid[];
	v_i integer;
	v_round integer;
	v_slot integer;
	v_cnt integer;
	v_k integer;
	v_id uuid;
	v_m record;
	v_wt uuid;
	v_wp text;
	v_lt uuid;
	v_lp text;
	v_s2 integer;
	v_missing integer;
begin
	v_t := public._tournament_require_host(p_tournament_id);
	if v_t.status <> 'seeding' then
		raise exception
			'The bracket is generated from seeding (current status: %). Close registration first.',
			v_t.status;
	end if;
	if exists (
		select 1 from public.tournament_bracket_matches where tournament_id = p_tournament_id
	) then
		raise exception 'A bracket already exists for this tournament.';
	end if;

	select count(*) into v_n from public.tournament_entries
	where tournament_id = p_tournament_id;
	if v_n < 2 then
		raise exception 'At least 2 entries are needed to generate a bracket (have %).', v_n;
	end if;
	if v_n > 128 then
		raise exception 'At most 128 entries are supported (have %).', v_n;
	end if;

	if coalesce((v_t.config ->> 'quals_enabled')::boolean, false) then
		if not exists (
			select 1 from public.tournament_qual_pools where tournament_id = p_tournament_id
		) then
			raise exception 'Qualifying is enabled but pools have not been generated.';
		end if;
		select count(*) into v_missing
		from public.tournament_entries e
		where e.tournament_id = p_tournament_id
			and not exists (
				select 1 from public.tournament_qual_matches m
				where m.tournament_id = p_tournament_id
					and (m.entry_a_id = e.id or m.entry_b_id = e.id)
			);
		if v_missing > 0 then
			raise exception
				'% entr% not in any qualifying pool (added after pools were generated?). Regenerate pools or remove them.',
				v_missing, case when v_missing = 1 then 'y is' else 'ies are' end;
		end if;
		if exists (
			select 1 from public.tournament_qual_matches
			where tournament_id = p_tournament_id and winner_id is null
		) then
			raise exception 'Every qualifying match needs a result before the bracket is generated.';
		end if;
		-- Standings decide the seeds.
		v_seed_order := public._tournament_qual_seed_order(p_tournament_id, v_uid);
		for v_i in 1 .. array_length(v_seed_order, 1) loop
			update public.tournament_entries set seed = v_i where id = v_seed_order[v_i];
		end loop;
	else
		perform public._tournament_compact_seeds(p_tournament_id);
	end if;

	perform public._tournament_log(p_tournament_id, null, null, 'seeded', v_uid,
		jsonb_build_object('action', 'bracket_seeds_locked', 'order', (
			select to_jsonb(array_agg(id order by seed))
			from public.tournament_entries where tournament_id = p_tournament_id
		)));

	-- Bracket size and round count.
	while v_p < v_n loop
		v_p := v_p * 2;
	end loop;
	v_tmp := v_p;
	while v_tmp > 1 loop
		v_tmp := v_tmp / 2;
		v_r := v_r + 1;
	end loop;

	-- Standard seed placement order (1 vs P, within recursive halves):
	-- [1], [1,2], [1,4,2,3], [1,8,4,5,2,7,3,6], ...
	v_order := array[1];
	v_size := 1;
	while v_size < v_p loop
		v_new_order := '{}';
		foreach v_x in array v_order loop
			v_new_order := v_new_order || v_x || (2 * v_size + 1 - v_x);
		end loop;
		v_order := v_new_order;
		v_size := v_size * 2;
	end loop;

	v_entry_by_seed := array(
		select id from public.tournament_entries
		where tournament_id = p_tournament_id order by seed
	);

	-- Winners bracket. Round 1 places the seeds; an out-of-range seed (> N)
	-- is a bye slot (left null, no feeder -> dead -> resolved below).
	for v_round in 1 .. v_r loop
		v_cnt := v_p >> v_round;
		for v_slot in 1 .. v_cnt loop
			insert into public.tournament_bracket_matches
				(tournament_id, bracket, round, slot, entry_a_id, entry_b_id, best_of)
			values (
				p_tournament_id, 'winners', v_round, v_slot,
				case when v_round = 1 then v_entry_by_seed[v_order[2 * v_slot - 1]] else null end,
				case when v_round = 1 then v_entry_by_seed[v_order[2 * v_slot]] else null end,
				public._tournament_best_of(v_t.config, 'winners', v_round)
			);
		end loop;
	end loop;

	-- Losers bracket (only when R >= 2; a 2-entry bracket has none).
	if v_r >= 2 then
		for v_k in 1 .. v_r - 1 loop
			v_cnt := v_p >> (v_k + 1);
			for v_round in (2 * v_k - 1) .. (2 * v_k) loop
				for v_slot in 1 .. v_cnt loop
					insert into public.tournament_bracket_matches
						(tournament_id, bracket, round, slot, best_of)
					values (p_tournament_id, 'losers', v_round, v_slot,
						public._tournament_best_of(v_t.config, 'losers', v_round));
				end loop;
			end loop;
		end loop;
	end if;

	insert into public.tournament_bracket_matches
		(tournament_id, bracket, round, slot, best_of)
	values (p_tournament_id, 'grand_final', 1, 1,
		public._tournament_best_of(v_t.config, 'grand_final', 1));

	-- Wire the advancement pointers.
	for v_m in
		select * from public.tournament_bracket_matches
		where tournament_id = p_tournament_id
	loop
		v_wt := null; v_wp := null; v_lt := null; v_lp := null;

		if v_m.bracket = 'winners' then
			if v_m.round < v_r then
				select id into v_wt from public.tournament_bracket_matches
				where tournament_id = p_tournament_id and bracket = 'winners'
					and round = v_m.round + 1 and slot = (v_m.slot + 1) / 2;
				v_wp := case when v_m.slot % 2 = 1 then 'a' else 'b' end;
			else
				select id into v_wt from public.tournament_bracket_matches
				where tournament_id = p_tournament_id and bracket = 'grand_final'
					and round = 1 and slot = 1;
				v_wp := 'a';
			end if;

			if v_m.round = 1 then
				if v_r = 1 then
					-- Two entries: the final's loser goes straight to the grand final.
					select id into v_lt from public.tournament_bracket_matches
					where tournament_id = p_tournament_id and bracket = 'grand_final'
						and round = 1 and slot = 1;
					v_lp := 'b';
				else
					select id into v_lt from public.tournament_bracket_matches
					where tournament_id = p_tournament_id and bracket = 'losers'
						and round = 1 and slot = (v_m.slot + 1) / 2;
					v_lp := case when v_m.slot % 2 = 1 then 'a' else 'b' end;
				end if;
			else
				-- Winners round r losers drop into losers round 2(r-1). Slot order
				-- reverses on even winners rounds to delay rematches.
				v_cnt := v_p >> v_m.round;
				v_s2 := case when v_m.round % 2 = 0 then v_cnt + 1 - v_m.slot else v_m.slot end;
				select id into v_lt from public.tournament_bracket_matches
				where tournament_id = p_tournament_id and bracket = 'losers'
					and round = 2 * (v_m.round - 1) and slot = v_s2;
				v_lp := 'b';
			end if;

		elsif v_m.bracket = 'losers' then
			if v_m.round % 2 = 1 then
				-- Minor round: winner meets the next winners-bracket drop, same slot.
				select id into v_wt from public.tournament_bracket_matches
				where tournament_id = p_tournament_id and bracket = 'losers'
					and round = v_m.round + 1 and slot = v_m.slot;
				v_wp := 'a';
			else
				v_k := v_m.round / 2;
				if v_k < v_r - 1 then
					select id into v_wt from public.tournament_bracket_matches
					where tournament_id = p_tournament_id and bracket = 'losers'
						and round = v_m.round + 1 and slot = (v_m.slot + 1) / 2;
					v_wp := case when v_m.slot % 2 = 1 then 'a' else 'b' end;
				else
					-- Losers final: winner is the grand final's B side.
					select id into v_wt from public.tournament_bracket_matches
					where tournament_id = p_tournament_id and bracket = 'grand_final'
						and round = 1 and slot = 1;
					v_wp := 'b';
				end if;
			end if;
			-- Losers-bracket losers are eliminated: no loser pointer.
		end if;

		update public.tournament_bracket_matches
		set winner_to_match_id = v_wt, winner_to_pos = v_wp,
			loser_to_match_id = v_lt, loser_to_pos = v_lp
		where id = v_m.id;
	end loop;

	-- Audit: one created event per match.
	for v_m in
		select id, bracket, round, slot from public.tournament_bracket_matches
		where tournament_id = p_tournament_id
	loop
		perform public._tournament_log(p_tournament_id, 'bracket', v_m.id, 'created', v_uid,
			jsonb_build_object('bracket', v_m.bracket, 'round', v_m.round, 'slot', v_m.slot));
	end loop;

	update public.tournaments set status = 'live' where id = p_tournament_id;

	-- Settle round-1 byes (and their cascades) immediately.
	perform public._tournament_resolve_byes(p_tournament_id, v_uid);
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Match control RPCs
-- ---------------------------------------------------------------------------

create or replace function public.tournament_start_match(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_m public.tournament_bracket_matches;
	v_t public.tournaments;
begin
	select * into v_m from public.tournament_bracket_matches where id = p_match_id for update;
	if not found then
		raise exception 'Match not found.';
	end if;
	v_t := public._tournament_require_host(v_m.tournament_id);
	if v_t.status <> 'live' then
		raise exception 'The tournament is not live.';
	end if;
	if v_m.status <> 'pending' then
		raise exception 'This match is already %.', v_m.status;
	end if;
	if v_m.entry_a_id is null or v_m.entry_b_id is null then
		raise exception 'This match is still waiting on participants from earlier matches.';
	end if;
	update public.tournament_bracket_matches
	set status = 'in_progress', started_at = now()
	where id = p_match_id;
	perform public._tournament_log(v_m.tournament_id, 'bracket', p_match_id, 'started', v_uid, '{}'::jsonb);
end;
$$;

create or replace function public.tournament_submit_match_result(p_match_id uuid, p_result jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_m public.tournament_bracket_matches;
	v_t public.tournaments;
	v_winner uuid;
begin
	select * into v_m from public.tournament_bracket_matches where id = p_match_id for update;
	if not found then
		raise exception 'Match not found.';
	end if;
	v_t := public._tournament_require_host(v_m.tournament_id);
	if v_t.status <> 'live' then
		raise exception 'The tournament is not live.';
	end if;
	if v_m.status <> 'in_progress' then
		raise exception 'Start the match before submitting its result (status: %).', v_m.status;
	end if;

	v_winner := public._tournament_write_games(v_m, p_result,
		coalesce((v_t.config ->> 'score_entry')::boolean, false));

	perform public._tournament_complete_match(p_match_id, v_winner, 'completed', v_uid,
		jsonb_build_object('games', p_result -> 'games'));
	perform public._tournament_resolve_byes(v_m.tournament_id, v_uid);

	select * into v_m from public.tournament_bracket_matches where id = p_match_id;
	select * into v_t from public.tournaments where id = v_m.tournament_id;
	return jsonb_build_object(
		'winner_id', v_winner,
		'reset_created', v_m.bracket = 'grand_final' and exists (
			select 1 from public.tournament_bracket_matches
			where tournament_id = v_m.tournament_id and bracket = 'grand_final_reset'
		),
		'champion_entry_id', v_t.champion_entry_id,
		'tournament_status', v_t.status
	);
end;
$$;

-- Correction helpers: a corrected outcome may only ripple through matches
-- with nothing independently recorded downstream. A downstream match that is
-- in_progress or completed by an entered result BLOCKS the correction; a
-- downstream match the system auto-completed as a bye (derived state, one or
-- zero participants, no games) is unwound and re-derived instead.
create or replace function public._tournament_check_unwindable(p_match public.tournament_bracket_matches)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_target uuid;
	v_t public.tournament_bracket_matches;
begin
	foreach v_target in array array_remove(
		array[p_match.winner_to_match_id, p_match.loser_to_match_id], null
	) loop
		select * into v_t from public.tournament_bracket_matches where id = v_target;
		if v_t.status = 'pending' then
			continue;
		elsif v_t.status = 'complete' and (v_t.entry_a_id is null or v_t.entry_b_id is null) then
			-- An auto-completed bye: derived, safe to unwind. Check deeper.
			perform public._tournament_check_unwindable(v_t);
		else
			raise exception
				'Cannot correct this result: the downstream % match (round %, slot %) is already % and its outcome may depend on the wrong winner. Correct or reset that match first.',
				v_t.bracket, v_t.round, v_t.slot, replace(v_t.status, '_', ' ');
		end if;
	end loop;
end;
$$;

revoke all on function public._tournament_check_unwindable(public.tournament_bracket_matches) from public;

create or replace function public._tournament_unwind_downstream(p_match public.tournament_bracket_matches)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_t public.tournament_bracket_matches;
begin
	if p_match.winner_to_match_id is not null then
		select * into v_t from public.tournament_bracket_matches
		where id = p_match.winner_to_match_id for update;
		if v_t.status = 'complete' then
			perform public._tournament_unwind_downstream(v_t);
			update public.tournament_bracket_matches
			set status = 'pending', winner_id = null, completed_at = null
			where id = v_t.id;
		end if;
		perform public._tournament_set_slot(v_t.id, p_match.winner_to_pos, null);
	end if;
	if p_match.loser_to_match_id is not null then
		select * into v_t from public.tournament_bracket_matches
		where id = p_match.loser_to_match_id for update;
		if v_t.status = 'complete' then
			perform public._tournament_unwind_downstream(v_t);
			update public.tournament_bracket_matches
			set status = 'pending', winner_id = null, completed_at = null
			where id = v_t.id;
		end if;
		perform public._tournament_set_slot(v_t.id, p_match.loser_to_pos, null);
	end if;
end;
$$;

revoke all on function public._tournament_unwind_downstream(public.tournament_bracket_matches) from public;

create or replace function public.tournament_correct_match_result(
	p_match_id uuid,
	p_new_result jsonb,
	p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_m public.tournament_bracket_matches;
	v_t public.tournaments;
	v_reset public.tournament_bracket_matches;
	v_old_winner uuid;
	v_new_winner uuid;
begin
	select * into v_m from public.tournament_bracket_matches where id = p_match_id for update;
	if not found then
		raise exception 'Match not found.';
	end if;
	v_t := public._tournament_require_host(v_m.tournament_id);
	if p_reason is null or btrim(p_reason) = '' then
		raise exception 'Give a reason for the correction (it is logged).';
	end if;
	if v_m.status <> 'complete' then
		raise exception 'Only a completed match can be corrected (status: %).', v_m.status;
	end if;
	if v_m.entry_a_id is null or v_m.entry_b_id is null then
		raise exception 'A bye cannot be corrected; it has no entered result.';
	end if;

	-- Downstream safety: block on anything independently recorded.
	perform public._tournament_check_unwindable(v_m);
	if v_m.bracket = 'grand_final' then
		select * into v_reset from public.tournament_bracket_matches
		where tournament_id = v_m.tournament_id and bracket = 'grand_final_reset' for update;
		if found and v_reset.status <> 'pending' then
			raise exception
				'Cannot correct the grand final: the reset match is already % and its outcome may depend on the wrong winner.',
				replace(v_reset.status, '_', ' ');
		end if;
	end if;

	v_old_winner := v_m.winner_id;
	perform public._tournament_unwind_downstream(v_m);

	-- Undo grand-final consequences before re-deriving them.
	if v_m.bracket = 'grand_final' then
		delete from public.tournament_bracket_matches
		where tournament_id = v_m.tournament_id and bracket = 'grand_final_reset';
		update public.tournaments
		set status = 'live', champion_entry_id = null
		where id = v_m.tournament_id and status = 'complete';
	elsif v_m.bracket = 'grand_final_reset' then
		update public.tournaments
		set status = 'live', champion_entry_id = null
		where id = v_m.tournament_id and status = 'complete';
	end if;

	v_new_winner := public._tournament_write_games(v_m, p_new_result,
		coalesce((v_t.config ->> 'score_entry')::boolean, false));

	perform public._tournament_complete_match(p_match_id, v_new_winner, 'corrected', v_uid,
		jsonb_build_object('reason', btrim(p_reason), 'previous_winner_id', v_old_winner,
			'games', p_new_result -> 'games'));
	perform public._tournament_resolve_byes(v_m.tournament_id, v_uid);

	select * into v_t from public.tournaments where id = v_m.tournament_id;
	return jsonb_build_object(
		'previous_winner_id', v_old_winner,
		'winner_id', v_new_winner,
		'champion_entry_id', v_t.champion_entry_id,
		'tournament_status', v_t.status
	);
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. Grants: every public RPC is callable by signed-in users only (each
-- re-checks host / invitee / self server-side); internal helpers have no
-- grants at all. Anonymous visitors only ever read.
-- ---------------------------------------------------------------------------

revoke all on function public.tournament_create(text, text, jsonb) from public;
revoke all on function public.tournament_update(uuid, text, text, jsonb) from public;
revoke all on function public.tournament_set_status(uuid, text) from public;
revoke all on function public.tournament_add_host(uuid, uuid, text) from public;
revoke all on function public.tournament_register_entry(uuid, text, text, text) from public;
revoke all on function public.tournament_host_add_entry(uuid, text, text, text, uuid) from public;
revoke all on function public.tournament_remove_entry(uuid) from public;
revoke all on function public.tournament_send_invite(uuid, uuid, text) from public;
revoke all on function public.tournament_respond_invite(uuid, boolean, text, text, text) from public;
revoke all on function public.tournament_shuffle_seeds(uuid) from public;
revoke all on function public.tournament_reorder_seed(uuid, uuid, integer) from public;
revoke all on function public.tournament_generate_qual_pools(uuid, integer) from public;
revoke all on function public.tournament_submit_qual_result(uuid, integer, integer, uuid) from public;
revoke all on function public.tournament_generate_bracket(uuid) from public;
revoke all on function public.tournament_start_match(uuid) from public;
revoke all on function public.tournament_submit_match_result(uuid, jsonb) from public;
revoke all on function public.tournament_correct_match_result(uuid, jsonb, text) from public;

grant execute on function public.tournament_create(text, text, jsonb) to authenticated;
grant execute on function public.tournament_update(uuid, text, text, jsonb) to authenticated;
grant execute on function public.tournament_set_status(uuid, text) to authenticated;
grant execute on function public.tournament_add_host(uuid, uuid, text) to authenticated;
grant execute on function public.tournament_register_entry(uuid, text, text, text) to authenticated;
grant execute on function public.tournament_host_add_entry(uuid, text, text, text, uuid) to authenticated;
grant execute on function public.tournament_remove_entry(uuid) to authenticated;
grant execute on function public.tournament_send_invite(uuid, uuid, text) to authenticated;
grant execute on function public.tournament_respond_invite(uuid, boolean, text, text, text) to authenticated;
grant execute on function public.tournament_shuffle_seeds(uuid) to authenticated;
grant execute on function public.tournament_reorder_seed(uuid, uuid, integer) to authenticated;
grant execute on function public.tournament_generate_qual_pools(uuid, integer) to authenticated;
grant execute on function public.tournament_submit_qual_result(uuid, integer, integer, uuid) to authenticated;
grant execute on function public.tournament_generate_bracket(uuid) to authenticated;
grant execute on function public.tournament_start_match(uuid) to authenticated;
grant execute on function public.tournament_submit_match_result(uuid, jsonb) to authenticated;
grant execute on function public.tournament_correct_match_result(uuid, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 12. Realtime: the live bracket and pool views subscribe to these; RLS
-- applies to the stream, and every table here is public-select, so
-- signed-out spectators receive events too.
-- ---------------------------------------------------------------------------
do $$
declare
	v_table text;
begin
	if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
		foreach v_table in array array[
			'tournaments', 'tournament_entries', 'tournament_qual_pools',
			'tournament_qual_matches', 'tournament_bracket_matches', 'tournament_match_games'
		] loop
			if not exists (
				select 1 from pg_publication_tables
				where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table
			) then
				execute format('alter publication supabase_realtime add table public.%I', v_table);
			end if;
		end loop;
	end if;
end
$$;
