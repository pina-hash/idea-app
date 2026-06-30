-- 0006_gauntlet_macro.sql
-- IDEA // GAUNTLET: machine capture for Speedrun (the SolidWorks VBA macro path).
--
-- This makes the macro the RANKED path and retires the client timer + manual
-- entry FOR RANKING (manual stays as supervised practice). It bundles:
--   1. A `source` column on submissions ('manual' | 'macro').
--   2. A `gauntlet_run_tokens` table holding single-use, expiring submit codes
--      bound to (user_id, challenge_id), stamped with a server-side reveal_at
--      that is the AUTHORITATIVE clock start.
--   3. gauntlet_speedrun_reveal now also mints a fresh code + reveal_at and
--      returns the code alongside the drawing. Re-revealing is a new run (the
--      clock runs from reveal, so a leisurely model just yields a slow time).
--   4. gauntlet_macro_submit: a SECURITY DEFINER RPC the macro posts to (via
--      PostgREST, using the public anon key, NOT a user session). The submit
--      code is the credential. It validates the code, computes elapsed =
--      now() - reveal_at (server-stamped, so there is no client clock to tamper
--      with; binding the captured geometry to the reveal that timed it remains
--      supervised-trust, see docs/GAUNTLET.md), verifies correctness on VOLUME
--      within the challenge tolerance band (never trusting a client correctness
--      flag), marks the code used, and records a submission with source='macro'.
--   5. The leaderboard view becomes source-aware: modeling modes rank only
--      PASSING + MACRO runs (manual speedrun entries are unranked practice);
--      knowledge modes are unchanged.
--   6. The demo seeds gain a canonical volume in mm3 for macro grading.
--   7. submissions is added to the realtime publication so the play screen can
--      live-update when the macro posts.
--
-- Direct client inserts to submissions remain blocked; gauntlet_submit (manual)
-- and gauntlet_macro_submit (macro) are the only writers.
--
-- Apply manually in the Supabase SQL editor. Idempotent where practical.

-- ---------------------------------------------------------------------------
-- 1. Source tag on submissions
-- ---------------------------------------------------------------------------
alter table public.submissions
	add column if not exists source text not null default 'manual'
	check (source in ('manual', 'macro'));

-- ---------------------------------------------------------------------------
-- 2. Submit-code tokens. Only the SECURITY DEFINER RPCs below read/write this;
--    clients get no grant and there are no RLS policies (the codes are handed to
--    the page through the reveal RPC's return value, not via table access).
-- ---------------------------------------------------------------------------
create table if not exists public.gauntlet_run_tokens (
	code text primary key,
	user_id uuid not null references auth.users (id) on delete cascade,
	challenge_id uuid not null references public.challenges (id) on delete cascade,
	reveal_at timestamptz not null default now(),
	expires_at timestamptz not null,
	used_at timestamptz,
	created_at timestamptz not null default now()
);

create index if not exists gauntlet_run_tokens_user_challenge_idx
	on public.gauntlet_run_tokens (user_id, challenge_id);

revoke all on public.gauntlet_run_tokens from anon, authenticated;
alter table public.gauntlet_run_tokens enable row level security;
-- No policies on purpose: the reveal/submit RPCs (security definer) are the only
-- code paths that touch this table.

-- ---------------------------------------------------------------------------
-- 3. Short submit-code generator. 8 chars from an unambiguous alphabet (no
--    0/O/1/I/L), so it is easy to read and type. Uniqueness is enforced by the
--    PK; the reveal RPC retries on the rare collision.
-- ---------------------------------------------------------------------------
create or replace function public.gauntlet_gen_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
	v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
	v_code text := '';
	i int;
begin
	for i in 1..8 loop
		v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
	end loop;
	return v_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Source-aware leaderboard. Same columns/owner-privilege/published rules as
--    before, but modeling modes now rank only PASSING + MACRO runs, so the
--    Speedrun board is the authoritative machine-verified board and manual
--    speedrun entries are unranked practice. Knowledge modes keep every attempt
--    (correct-first), so Drawing Reading is unchanged.
-- ---------------------------------------------------------------------------
create or replace view public.gauntlet_leaderboard as
select
	best.challenge_id,
	best.mode,
	best.user_id,
	coalesce(p.full_name, 'Player') as player,
	best.is_correct,
	best.score_metric,
	best.created_at,
	rank() over (
		partition by best.challenge_id
		order by best.is_correct desc nulls last, best.score_metric asc nulls last, best.created_at asc
	) as rank
from (
	select distinct on (s.user_id, s.challenge_id)
		s.user_id,
		s.challenge_id,
		s.mode,
		s.is_correct,
		s.score_metric,
		s.created_at
	from public.submissions s
	-- Knowledge modes keep all attempts; modeling modes rank only passing,
	-- machine-verified (macro) runs.
	where s.mode in ('drawing_reading', 'gdt_tolerance', 'spot_the_error')
		or (s.is_correct = true and s.source = 'macro')
	order by s.user_id, s.challenge_id, s.is_correct desc nulls last, s.score_metric asc nulls last, s.created_at asc
) best
join public.profiles p on p.id = best.user_id
join public.challenges c on c.id = best.challenge_id
where c.published;

grant select on public.gauntlet_leaderboard to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Reveal now mints a single-use, expiring submit code and returns it with
--    the drawing. reveal_at is the authoritative clock start.
-- ---------------------------------------------------------------------------
create or replace function public.gauntlet_speedrun_reveal(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_mode public.gauntlet_mode;
	v_published boolean;
	v_drawing text;
	v_asset text;
	v_code text;
	v_reveal_at timestamptz := now();
	v_expires timestamptz := now() + interval '30 minutes';
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	select c.mode, c.published, c.answer ->> 'drawing', c.asset_ref
		into v_mode, v_published, v_drawing, v_asset
		from public.challenges c
		where c.id = p_challenge_id;

	if not found then
		raise exception 'Challenge not found.';
	end if;
	if v_mode <> 'speedrun' then
		raise exception 'Not a Speedrun challenge.';
	end if;
	if not v_published and not public.is_teacher() then
		raise exception 'Challenge is not available.';
	end if;

	-- Only the latest reveal for this user+challenge stays live: retire any prior
	-- unused codes so a stale code cannot be held in reserve.
	update public.gauntlet_run_tokens
		set used_at = v_reveal_at
		where user_id = v_uid and challenge_id = p_challenge_id and used_at is null;

	-- Mint a unique code; retry on the rare PK collision.
	loop
		v_code := public.gauntlet_gen_code();
		begin
			insert into public.gauntlet_run_tokens (code, user_id, challenge_id, reveal_at, expires_at)
			values (v_code, v_uid, p_challenge_id, v_reveal_at, v_expires);
			exit;
		exception when unique_violation then
			-- collision, regenerate
		end;
	end loop;

	return jsonb_build_object(
		'drawing', v_drawing,
		'asset_ref', v_asset,
		'code', v_code,
		'reveal_at', v_reveal_at,
		'expires_at', v_expires
	);
end;
$$;

revoke all on function public.gauntlet_speedrun_reveal(uuid) from public;
grant execute on function public.gauntlet_speedrun_reveal(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Machine submit. The macro posts here via PostgREST with the public anon
--    key (no user session) and the submit code as the credential. SECURITY
--    DEFINER so it can resolve the user from the code and write the submission.
--    Time is server-authoritative (now() - reveal_at); correctness is on volume.
-- ---------------------------------------------------------------------------
create or replace function public.gauntlet_macro_submit(
	p_code text,
	p_volume_mm3 numeric,
	p_surface_area_mm2 numeric default null,
	p_feature_count integer default null,
	p_mass_g numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_token public.gauntlet_run_tokens%rowtype;
	v_challenge public.challenges%rowtype;
	v_now timestamptz := now();
	v_elapsed_ms bigint;
	v_score numeric;
	v_target_vol numeric;
	v_tol_pct numeric;
	v_correct boolean;
	v_value jsonb;
	v_rank integer;
begin
	if p_code is null or length(trim(p_code)) = 0 then
		raise exception 'Missing submit code.';
	end if;
	if p_volume_mm3 is null then
		raise exception 'Missing captured volume.';
	end if;

	select * into v_token from public.gauntlet_run_tokens where code = upper(trim(p_code));
	if not found then
		raise exception 'Invalid submit code.';
	end if;
	if v_token.used_at is not null then
		raise exception 'This submit code was already used. Re-reveal in GAUNTLET to start a new run.';
	end if;
	if v_now > v_token.expires_at then
		raise exception 'This submit code has expired. Re-reveal in GAUNTLET to start a new run.';
	end if;

	select * into v_challenge from public.challenges where id = v_token.challenge_id;
	if not found then
		raise exception 'Challenge not found.';
	end if;

	-- Server-authoritative elapsed time from the stamped reveal.
	v_elapsed_ms := greatest(0, (extract(epoch from (v_now - v_token.reveal_at)) * 1000)::bigint);
	v_score := round(v_elapsed_ms::numeric / 1000.0, 2);

	-- Correctness is on VOLUME (canonical), within the challenge tolerance band.
	v_target_vol := (v_challenge.answer ->> 'target_volume_mm3')::numeric;
	v_tol_pct := coalesce((v_challenge.answer ->> 'tolerance_pct')::numeric, 0);
	v_correct := v_target_vol is not null
		and abs(p_volume_mm3 - v_target_vol) <= v_target_vol * v_tol_pct / 100.0;

	v_value := jsonb_build_object(
		'volume_mm3', p_volume_mm3,
		'surface_area_mm2', p_surface_area_mm2,
		'feature_count', p_feature_count,
		'mass_g', p_mass_g,
		'elapsed_ms', v_elapsed_ms
	);

	-- Claim the code atomically (single use). The `used_at is null` predicate
	-- means a concurrent double-submit loses the race here and writes nothing.
	update public.gauntlet_run_tokens
		set used_at = v_now
		where code = v_token.code and used_at is null;
	if not found then
		raise exception 'This submit code was already used. Re-reveal in GAUNTLET to start a new run.';
	end if;

	insert into public.submissions (user_id, challenge_id, mode, value, is_correct, score_metric, source)
	values (v_token.user_id, v_token.challenge_id, v_challenge.mode, v_value, v_correct, v_score, 'macro');

	-- The student's resulting rank on the (macro-verified) board, if they passed.
	select gl.rank into v_rank
	from public.gauntlet_leaderboard gl
	where gl.challenge_id = v_token.challenge_id and gl.user_id = v_token.user_id;

	return jsonb_build_object(
		'is_correct', v_correct,
		'elapsed_ms', v_elapsed_ms,
		'score_metric', v_score,
		'rank', v_rank,
		'target_volume_mm3', v_target_vol,
		'your_volume_mm3', p_volume_mm3,
		'tolerance_pct', v_tol_pct
	);
end;
$$;

-- The macro is unauthenticated (anon key), so anon must be able to execute it.
-- The submit code is the credential; without a valid, unused, unexpired code the
-- function raises and writes nothing.
revoke all on function public.gauntlet_macro_submit(text, numeric, numeric, integer, numeric) from public;
grant execute on function public.gauntlet_macro_submit(text, numeric, numeric, integer, numeric) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Demo seeds: add the canonical volume in mm3 (the macro reports mm3). The
--    0005 seeds carry target_volume in cm3, so mm3 = cm3 x 1000. Idempotent.
-- ---------------------------------------------------------------------------
update public.challenges
set answer = answer || jsonb_build_object('target_volume_mm3', (answer ->> 'target_volume')::numeric * 1000)
where mode = 'speedrun'
	and answer ? 'target_volume'
	and not (answer ? 'target_volume_mm3');

-- ---------------------------------------------------------------------------
-- 8. Realtime: let the play screen live-update when the macro posts a row.
--    (Supabase ships the `supabase_realtime` publication; RLS still restricts
--    each client to its own submissions.)
-- ---------------------------------------------------------------------------
do $$
begin
	if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
		and not exists (
			select 1 from pg_publication_tables
			where pubname = 'supabase_realtime'
				and schemaname = 'public'
				and tablename = 'submissions'
		)
	then
		alter publication supabase_realtime add table public.submissions;
	end if;
end
$$;
